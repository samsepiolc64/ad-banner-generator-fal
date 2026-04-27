import { useState, useRef } from 'react'
import {
  Folder,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Zap,
  Clock,
  Square,
} from 'lucide-react'
import { resolveModel, costPerImage } from '../../lib/modelRouting'
import { cropToAspect, compressToJpeg } from '../../lib/imageUtils'
import { addCost } from '../../lib/clientCosts'

async function runPool(fns, limit = 3) {
  let idx = 0
  async function worker() {
    while (idx < fns.length) {
      const i = idx++
      await fns[i]().catch(() => {})
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
}

async function uploadToDrive(blob, filename, sessionFolderId) {
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
  await fetch('/.netlify/functions/upload-to-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, imageBase64: base64, sessionFolderId }),
  })
}

export default function ProductGeneratorPanel({ formats, brandName, domain, falMode = 'test', sessionFolder }) {
  const [statuses, setStatuses] = useState(() => {
    const s = {}
    formats.forEach((f) => (s[f.id] = { status: 'idle' }))
    return s
  })
  const [previews, setPreviews] = useState({})
  const [doneCount, setDoneCount] = useState(0)
  const [running, setRunning] = useState(false)
  const folderHandleRef = useRef(null)
  const [folderName, setFolderName] = useState(null)
  const abortRef = useRef(null)
  const driveFolderRef = useRef(null)

  const fsaOk = typeof window !== 'undefined' && 'showDirectoryPicker' in window
  const totalFormats = formats.length
  const totalCost = formats.reduce((s, f) => s + costPerImage(resolveModel(f).type), 0).toFixed(2)
  const progress = totalFormats > 0 ? Math.round((doneCount / totalFormats) * 100) : 0

  const pickFolder = async () => {
    if (!fsaOk) { setFolderName('Downloads'); return }
    try {
      folderHandleRef.current = await window.showDirectoryPicker({ mode: 'readwrite' })
      setFolderName(folderHandleRef.current.name)
    } catch {}
  }

  const updateStatus = (id, data) => setStatuses((prev) => ({ ...prev, [id]: data }))

  const pollForResult = async (statusUrl, responseUrl, signal) => {
    for (let i = 0; i < 60; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const res = await fetch('/.netlify/functions/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl, falMode }),
        signal,
      })
      if (!res.ok) throw new Error(`Poll error: HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.status === 'COMPLETED') return data.imageUrl
      if (data.status === 'FAILED') throw new Error('fal.ai: generation failed')
      await new Promise((r) => setTimeout(r, 3000))
    }
    throw new Error('Timeout — fal.ai nie odpowiedział w 3 minuty')
  }

  const generateOne = async (fmt, signal) => {
    updateStatus(fmt.id, { status: 'generating' })
    const model = resolveModel(fmt)

    try {
      const submitRes = await fetch('/.netlify/functions/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: fmt.prompt,
          ar: model.ar,
          modelType: model.type,
          useLogo: true,
          logoDataUrl: [fmt.referenceImage],
          falMode,
        }),
        signal,
      })
      if (!submitRes.ok) throw new Error(`Submit error: HTTP ${submitRes.status}`)
      const submitData = await submitRes.json()
      if (!submitData.status_url) throw new Error('Brak queue URL od fal.ai')

      const imgUrl = await pollForResult(submitData.status_url, submitData.response_url, signal)

      let srcBlob = await (await fetch(imgUrl)).blob()
      if (model.needsResize) srcBlob = await cropToAspect(srcBlob, fmt.width, fmt.height)
      const blob = await compressToJpeg(srcBlob)
      addCost(domain, costPerImage(model.type))
      const previewUrl = URL.createObjectURL(blob)
      setPreviews((prev) => ({ ...prev, [fmt.id]: previewUrl }))

      const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      const fmtSlug = fmt.id.replace(/^product-/, '')
      const filename = `${safeDomain}_product_${fmtSlug}.jpg`

      if (folderHandleRef.current) {
        const fh = await folderHandleRef.current.getFileHandle(filename, { create: true })
        const w = await fh.createWritable()
        await w.write(blob)
        await w.close()
      } else {
        const a = document.createElement('a')
        a.href = previewUrl
        a.download = filename
        a.click()
      }

      const sessionFolderId = driveFolderRef.current?.sessionFolderId
      if (sessionFolderId) uploadToDrive(blob, filename, sessionFolderId).catch(() => {})

      updateStatus(fmt.id, { status: 'done' })
      setDoneCount((c) => c + 1)
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Timeout — za długo' : e.message
      updateStatus(fmt.id, { status: 'error', message: msg })
    }
  }

  const retryOne = async (fmt) => {
    if (running) return
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    await generateOne(fmt, controller.signal)
    setRunning(false)
  }

  const generateAll = async () => {
    if (running) return
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller

    // Pre-flight: utwórz foldery Drive raz przed równoległymi uploadami
    if (!driveFolderRef.current) {
      try {
        const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
        const res = await fetch('/.netlify/functions/ensure-drive-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: safeDomain, sessionFolder }),
        })
        if (res.ok) driveFolderRef.current = await res.json()
      } catch {}
    }

    const pending = formats.filter((f) => statuses[f.id]?.status !== 'done')
    await runPool(pending.map((fmt) => () => generateOne(fmt, controller.signal)))
    setRunning(false)
  }

  const stopGeneration = () => { abortRef.current?.abort(); setRunning(false) }

  const allDone = Object.values(statuses).every((s) => s.status === 'done')
  const errorCount = Object.values(statuses).filter((s) => s.status === 'error').length

  return (
    <div>
      <h2 className="text-xl font-bold mb-0.5 text-gray-900 dark:text-white">Grafiki produktowe — {brandName || domain}</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
        {domain} · Nano Banana Edit (fal.ai) · {totalFormats} grafik · ~${totalCost}
      </p>

      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-4">
        <div className="h-1 bg-brand-orange rounded-full transition-all duration-400" style={{ width: `${progress}%` }} />
      </div>

      <div className="bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3.5 mb-3 flex items-center gap-3.5">
        <button onClick={pickFolder} className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap hover:bg-gray-800 transition-colors inline-flex items-center gap-2">
          <Folder size={16} strokeWidth={1.8} aria-hidden /> Wybierz folder
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {folderName
            ? <>→ <strong className="text-gray-900 dark:text-white">{folderName}</strong> <span className="text-xs text-gray-300 dark:text-gray-600">({doneCount} zapisanych)</span></>
            : (fsaOk ? 'Wybierz folder docelowy' : '→ pliki trafią do Downloads')}
        </span>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {formats.map((fmt) => {
          const st = statuses[fmt.id]
          const preview = previews[fmt.id]
          return (
            <div key={fmt.id} className={`rounded-xl p-3 flex items-center gap-3.5 transition-colors
              ${st.status === 'done' ? 'bg-brand-green-light dark:bg-green-950/30' : ''}
              ${st.status === 'error' ? 'bg-brand-red-light dark:bg-red-950/30' : ''}
              ${st.status === 'generating' ? 'bg-orange-50 dark:bg-orange-950/30' : ''}
              ${st.status === 'idle' ? 'bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800' : ''}`}
            >
              <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl text-gray-300 dark:text-gray-600">
                {preview ? <img src={preview} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={24} strokeWidth={1.6} aria-hidden />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{fmt.label}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{fmt.width}×{fmt.height}px</div>
              </div>
              <div className="flex-shrink-0 text-sm text-right">
                {st.status === 'done' && <span className="text-brand-green font-semibold whitespace-nowrap inline-flex items-center gap-1.5"><CheckCircle2 size={16} strokeWidth={1.8} aria-hidden /> zapisano</span>}
                {st.status === 'error' && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-brand-red text-xs max-w-[200px] text-right leading-tight inline-flex items-center gap-1.5" title={st.message}><XCircle size={14} strokeWidth={1.8} className="flex-shrink-0" aria-hidden /> <span className="truncate">{st.message?.slice(0, 50)}</span></span>
                    <button onClick={() => retryOne(fmt)} disabled={running} className="text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap inline-flex items-center gap-1.5"><RotateCcw size={12} strokeWidth={2} aria-hidden /> Ponów</button>
                  </div>
                )}
                {st.status === 'generating' && <span className="text-brand-orange font-semibold whitespace-nowrap inline-flex items-center gap-1.5"><Zap size={14} strokeWidth={1.8} aria-hidden /> generowanie...</span>}
                {st.status === 'idle' && <span className="text-gray-300 dark:text-gray-600 whitespace-nowrap inline-flex items-center gap-1.5"><Clock size={14} strokeWidth={1.8} aria-hidden /> oczekuje</span>}
              </div>
            </div>
          )
        })}
      </div>

      {(() => {
        let btnIcon, btnText
        if (running) { btnIcon = <Square size={18} strokeWidth={2} fill="currentColor" aria-hidden />; btnText = 'Zatrzymaj generowanie' }
        else if (allDone) { btnIcon = <CheckCircle2 size={18} strokeWidth={2} aria-hidden />; btnText = 'Wszystkie wygenerowane' }
        else if (errorCount > 0) { btnIcon = <RotateCcw size={18} strokeWidth={2} aria-hidden />; btnText = `Ponów nieudane (${errorCount})` }
        else { btnIcon = <Zap size={18} strokeWidth={2} aria-hidden />; btnText = `Generuj wszystkie (${totalFormats} grafik)` }
        return (
          <button
            onClick={running ? stopGeneration : generateAll}
            disabled={(!folderName && fsaOk) || allDone}
            className={`w-full rounded-xl py-4 text-base font-bold transition-colors inline-flex items-center justify-center gap-2
              ${running ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'}
              disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed`}
          >
            {btnIcon} {btnText}
          </button>
        )
      })()}
    </div>
  )
}
