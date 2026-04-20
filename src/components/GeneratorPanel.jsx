import { useState, useRef } from 'react'
import { resolveModel, costPerImage } from '../lib/modelRouting'
import { cropToAspect, compressToJpeg, compositeLogoOnBanner } from '../lib/imageUtils'
import { addCost } from '../lib/clientCosts'

// Used when a real logo WILL be composited after generation — reserve a clean corner
const LOGO_BLOCK_WITH_LOGO = `LOGO RULES — CRITICAL, read carefully:

ALLOWED (this is realistic product photography, do it naturally):
- Brand name / logo may appear ON THE PRODUCT ITSELF — on the jar label, bottle, box, packaging, tube, or any container surface that is part of the product mockup. This is expected for commercial product shots.

FORBIDDEN — NOWHERE ELSE in the composition:
- No brand logo, wordmark, or company name as a floating/standalone graphic element in any corner or margin
- No badges, seals, medallions, stickers, or emblems containing the brand name anywhere outside the product surface
- No watermarks, signatures, URL tags, or brand marks overlaid on background or negative space
- No brand name rendered as a large typographic hero / decorative text element
- No duplicate brand marks — if the brand name appears on the product, it must NOT appear again anywhere else in the frame
- No "inspired-by" lookalike logos, stylized monograms, or typography that reads as a brand mark

CLEAN CORNER REQUIREMENT — this is where our real logo will be composited later:
- At least ONE corner (top-left preferred, or top-right) must be naturally uncluttered: filled only with the background color or gradient — no objects, no text, no decorative elements
- Achieve this through natural composition (push hero content away from that corner) — NOT by drawing any shape, box, or frame
- ABSOLUTELY FORBIDDEN in the clean corner: white box, white card, white rectangle, gray box, gray rectangle, rounded rectangle, frosted panel, semi-transparent overlay, glowing area, empty frame, border outline, badge shape, or ANY distinct geometric shape
- The corner must look like a natural part of the background — same texture, same color, indistinguishable from the rest of the background`

// Used when NO logo is provided — no corner reservation needed, still forbid floating logos
const LOGO_BLOCK_NO_LOGO = `LOGO RULES — CRITICAL, read carefully:

ALLOWED (this is realistic product photography, do it naturally):
- Brand name / logo may appear ON THE PRODUCT ITSELF — on the jar label, bottle, box, packaging, tube, or any container surface that is part of the product mockup.

FORBIDDEN everywhere outside the product surface:
- No brand logo, wordmark, or company name as a floating/standalone graphic element anywhere in the composition
- No badges, seals, medallions, stickers, or emblems containing the brand name outside the product
- No watermarks, signatures, URL tags, or brand marks overlaid on background or negative space
- No brand name rendered as a large typographic hero / decorative text element
- No "inspired-by" lookalike logos, stylized monograms, or typography that reads as a brand mark
- Do NOT add any brand identity text element that was not explicitly listed in AD COPY PLACEMENT`

/** Extract the first http(s) URL from a string, or null */
function extractUrl(text) {
  if (!text) return null
  const m = text.match(/https?:\/\/[^\s,;)]+/)
  return m ? m[0] : null
}

const SESSION_FOLDER = (() => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
})()

async function uploadToDrive(blob, filename, domain, sessionFolder) {
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
  await fetch('/.netlify/functions/upload-to-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, imageBase64: base64, domain, sessionFolder }),
  })
}

export default function GeneratorPanel({ formats, logoDataUrl, brandName, domain, notes, falMode = 'test' }) {
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

  const fsaOk = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  const totalFormats = formats.length
  const progress = totalFormats > 0 ? Math.round((doneCount / totalFormats) * 100) : 0

  const pickFolder = async () => {
    if (!fsaOk) {
      setFolderName('Downloads')
      return
    }
    try {
      folderHandleRef.current = await window.showDirectoryPicker({ mode: 'readwrite' })
      setFolderName(folderHandleRef.current.name)
    } catch {}
  }

  const updateStatus = (id, data) => {
    setStatuses((prev) => ({ ...prev, [id]: data }))
  }

  const pollForResult = async (statusUrl, responseUrl, signal) => {
    const POLL_INTERVAL = 3000
    const MAX_POLLS = 60 // 3s × 60 = 3 minutes max

    for (let i = 0; i < MAX_POLLS; i++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

      const res = await fetch('/.netlify/functions/check-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status_url: statusUrl, response_url: responseUrl, falMode }),
        signal,
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`Poll error: HTTP ${res.status}: ${errText.slice(0, 200)}`)
      }

      const data = await res.json()

      if (data.error) throw new Error(data.error)
      if (data.status === 'COMPLETED') return data.imageUrl
      if (data.status === 'FAILED') throw new Error('fal.ai: generation failed')

      await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    }

    throw new Error('Timeout — fal.ai nie odpowiedział w 3 minuty')
  }

  const generateOne = async (fmt, signal) => {
    updateStatus(fmt.id, { status: 'generating' })

    const model = resolveModel(fmt)
    const hasLogo = !!logoDataUrl
    const productRefUrl = extractUrl(notes)
    const hasRef = hasLogo || !!productRefUrl

    // Pick the right logo block based on whether a real logo will be composited
    const logoBlock = hasLogo ? LOGO_BLOCK_WITH_LOGO : LOGO_BLOCK_NO_LOGO

    // Always suppress fal.ai from rendering the brand name as floating text.
    // With logo: real logo is composited after — fal.ai must not pre-draw it.
    // Without logo: still unwanted — hallucinated wordmarks look unprofessional.
    const brandNameSuppress = `\n\n⚠️ BRAND NAME TEXT — ABSOLUTE PROHIBITION: do NOT render "${brandName}" or any variation of this name as visible text ANYWHERE in this image outside of product labels/packaging. No brand wordmark as a floating element. No brand name as headline, subtitle, caption, or decorative element. No brand signature in any corner. Communicate brand identity ONLY through visual style: colors, photography, and motifs — NEVER through rendering the brand name as standalone text.`

    // If a product reference URL was provided, inject a strong instruction to use it
    const productRefBlock = productRefUrl
      ? `\n\nPRODUCT REFERENCE IMAGE — CRITICAL:\nThe first reference image provided is the EXACT product to feature in this ad. You MUST reproduce this product with pixel-accurate fidelity:\n- Exact shape, silhouette, and proportions\n- Exact colors, materials, textures, and finish\n- Exact packaging design, labels, and graphic elements on the surface\n- Exact size relationships between product parts\nDo NOT redesign, simplify, or reinterpret the product. Render it as a faithful photographic reproduction of the reference image.`
      : ''

    const finalPrompt = (fmt.prompt + productRefBlock)
      .replace('{{LOGO_BLOCK}}', logoBlock)
      .replace('{{BRAND_NAME_SUPPRESS}}', brandNameSuppress)

    try {
      // Build image_urls: logo (data URL) + product reference URL (if provided)
      const imageUrls = []
      if (hasLogo) imageUrls.push(logoDataUrl)
      if (productRefUrl) imageUrls.push(productRefUrl)

      // Step 1: Submit to fal.ai queue
      const submitRes = await fetch('/.netlify/functions/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          ar: model.ar,
          modelType: model.type,
          useLogo: hasRef,
          logoDataUrl: imageUrls.length > 0 ? imageUrls : undefined,
          falMode,
        }),
        signal,
      })

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '')
        throw new Error(`Submit error: HTTP ${submitRes.status}: ${errText.slice(0, 200)}`)
      }

      const submitData = await submitRes.json()
      if (!submitData.status_url || !submitData.response_url) {
        throw new Error('No queue URLs from fal.ai — got: ' + JSON.stringify(submitData).slice(0, 200))
      }

      // Step 2: Poll for result (every 3s until done)
      const imgUrl = await pollForResult(
        submitData.status_url,
        submitData.response_url,
        signal
      )

      // Step 3: Fetch, resize, composite logo (pixel-perfect), compress, save
      let srcBlob = await (await fetch(imgUrl)).blob()

      if (model.needsResize) {
        srcBlob = await cropToAspect(srcBlob, fmt.width, fmt.height)
      }

      // Overlay the REAL logo (exact pixels) onto the generated banner
      if (hasLogo) {
        srcBlob = await compositeLogoOnBanner(srcBlob, logoDataUrl, fmt.width, fmt.height)
      }

      const blob = await compressToJpeg(srcBlob)
      addCost(domain, costPerImage(model.type))
      const previewUrl = URL.createObjectURL(blob)
      setPreviews((prev) => ({ ...prev, [fmt.id]: previewUrl }))

      const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      // fmt.id = "meta-1200x628-v1" — keep only dimensions + variant, drop channel prefix
      const fmtSlug = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
      const filename = `${safeDomain}_${fmtSlug}.jpg`

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

      // Upload to Google Drive in background — does not block or affect local save
      const safeDomainForDrive = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      uploadToDrive(blob, filename, safeDomainForDrive, SESSION_FOLDER).catch(() => {})

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

    // Single shared AbortController — stopGeneration cancels all in-flight requests at once
    const controller = new AbortController()
    abortRef.current = controller

    const pending = formats.filter((f) => statuses[f.id]?.status !== 'done')

    // Fire all submissions simultaneously — fal.ai queue handles concurrency on their end.
    // Each generateOne independently polls its own request_id, so they truly run in parallel.
    await Promise.allSettled(pending.map((fmt) => generateOne(fmt, controller.signal)))

    setRunning(false)
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  return (
    <div>
      {/* Header */}
      <h2 className="text-xl font-bold mb-0.5 text-gray-900 dark:text-white">Banery reklamowe — {brandName}</h2>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
        {domain} · {totalFormats} grafik
      </p>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full mb-4">
        <div
          className="h-1 bg-brand-orange rounded-full transition-all duration-400"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Folder picker */}
      <div className="bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl p-3.5 mb-3 flex items-center gap-3.5">
        <button
          onClick={pickFolder}
          className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap hover:bg-gray-800 transition-colors"
        >
          📁 Wybierz folder
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {folderName ? (
            <>→ <strong className="text-gray-900 dark:text-white">{folderName}</strong> <span className="text-xs text-gray-300 dark:text-gray-600">({doneCount} zapisanych)</span></>
          ) : (
            fsaOk ? 'Wybierz folder docelowy' : '→ pliki trafią do Downloads'
          )}
        </span>
      </div>

      {/* Format list */}
      <div className="flex flex-col gap-2 mb-4">
        {formats.map((fmt) => {
          const st = statuses[fmt.id]
          const model = resolveModel(fmt)
          const preview = previews[fmt.id]

          return (
            <div
              key={fmt.id}
              className={`rounded-xl p-3 flex items-center gap-3.5 transition-colors
                ${st.status === 'done' ? 'bg-brand-green-light dark:bg-green-950/30' : ''}
                ${st.status === 'error' ? 'bg-brand-red-light dark:bg-red-950/30' : ''}
                ${st.status === 'generating' ? 'bg-orange-50 dark:bg-orange-950/30' : ''}
                ${st.status === 'idle' ? 'bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800' : ''}`}
            >
              {/* Thumbnail */}
              <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl text-gray-300 dark:text-gray-600">
                {preview ? (
                  <img src={preview} alt="" className="w-full h-full object-cover" />
                ) : (
                  '📷'
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{fmt.label}</div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {fmt.width}×{fmt.height}px
                  {model.needsResize ? ` (${model.ar}→resize)` : ''}
                </div>
              </div>

              {/* Status */}
              <div className="flex-shrink-0 text-sm text-right">
                {st.status === 'done' && <span className="text-brand-green font-semibold whitespace-nowrap">✅ zapisano</span>}
                {st.status === 'error' && (
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-brand-red text-xs max-w-[200px] text-right leading-tight" title={st.message}>
                      ❌ {st.message?.slice(0, 50)}
                    </span>
                    <button
                      onClick={() => retryOne(fmt)}
                      disabled={running}
                      className="text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                    >
                      ↻ Ponów
                    </button>
                  </div>
                )}
                {st.status === 'generating' && <span className="text-brand-orange font-semibold whitespace-nowrap">⚡ generowanie...</span>}
                {st.status === 'idle' && <span className="text-gray-300 dark:text-gray-600 whitespace-nowrap">⏳ oczekuje</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Generate button */}
      {(() => {
        const errorCount = Object.values(statuses).filter((s) => s.status === 'error').length
        const allDone = Object.values(statuses).every((s) => s.status === 'done')
        const btnLabel = running
          ? '⏹ Zatrzymaj generowanie'
          : allDone
          ? '✅ Wszystkie wygenerowane'
          : errorCount > 0
          ? `↻ Ponów nieudane (${errorCount})`
          : `⚡ Generuj wszystkie (${totalFormats} grafik)`
        return (
          <button
            onClick={running ? stopGeneration : generateAll}
            disabled={(!folderName && fsaOk) || allDone}
            className={`w-full rounded-xl py-4 text-base font-bold transition-colors
              ${running
                ? 'bg-red-600 text-white hover:bg-red-700'
                : allDone
                ? 'bg-green-600 text-white cursor-default'
                : 'bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed'
              }`}
          >
            {btnLabel}
          </button>
        )
      })()}

    </div>
  )
}
