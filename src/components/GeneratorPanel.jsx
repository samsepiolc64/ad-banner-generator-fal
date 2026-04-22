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

/**
 * Replace ad copy texts (headline + CTA) in an already-built prompt string.
 * Targets the fixed patterns emitted by promptBuilder.js — single-line or two-part hierarchy.
 */
function replaceAdCopyInPrompt(prompt, headline, cta) {
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primary = parts[0] || ''
  const secondary = parts[1] || null

  let result = prompt
  if (secondary) {
    result = result.replace(/- PRIMARY HEADLINE: "[^"]*"/, `- PRIMARY HEADLINE: "${primary}"`)
    result = result.replace(/- SECONDARY LINE: "[^"]*"/, `- SECONDARY LINE: "${secondary}"`)
  } else {
    result = result.replace(/- Headline: "[^"]*"/, `- Headline: "${primary}"`)
  }
  result = result.replace(/- CTA button: "[^"]*"/, `- CTA button: "${cta}"`)
  return result
}

const SESSION_FOLDER = (() => {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
})()

async function uploadToDrive(blob, filename, sessionFolderId, mimeType = 'image/jpeg') {
  const base64 = await new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.readAsDataURL(blob)
  })
  await fetch('/.netlify/functions/upload-to-drive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, imageBase64: base64, sessionFolderId, mimeType }),
  })
}

export default function GeneratorPanel({ formats, logoDataUrl, brandName, domain, notes, productImage, falMode = 'test' }) {
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
  // Pre-flight Drive folder IDs — created once before parallel uploads start
  const driveFolderRef = useRef(null)
  // Collects { filename → finalPrompt } for each successfully generated banner
  const promptsMapRef = useRef({})
  // Collects { filename → { headline, cta } } for text-edit feature
  const textsMapRef = useRef({})
  // Tracks which banner rows have their prompt expanded (filename → bool)
  const [expandedPrompts, setExpandedPrompts] = useState({})
  // Tracks which banner rows have their text editor open (filename → bool)
  const [expandedTexts, setExpandedTexts] = useState({})
  // Current form values in text editors (filename → { primary, secondary, cta })
  const [editingTexts, setEditingTexts] = useState({})

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

  // textOverrides = { headline, cta } — when provided, replaces copy in the prompt
  const generateOne = async (fmt, signal, textOverrides = null) => {
    updateStatus(fmt.id, { status: 'generating' })

    const model = resolveModel(fmt)
    const hasLogo = !!logoDataUrl
    // productImage prop (base64 dataURL) takes priority over URL embedded in notes
    const productRefUrl = !productImage ? extractUrl(notes) : null
    const hasProductRef = !!productImage || !!productRefUrl
    const hasRef = hasLogo || hasProductRef

    // Pick the right logo block based on whether a real logo will be composited
    const logoBlock = hasLogo ? LOGO_BLOCK_WITH_LOGO : LOGO_BLOCK_NO_LOGO

    // Always suppress fal.ai from rendering the brand name as floating text.
    const brandNameSuppress = `\n\n⚠️ BRAND NAME TEXT — ABSOLUTE PROHIBITION: do NOT render "${brandName}" or any variation of this name as visible text ANYWHERE in this image outside of product labels/packaging. No brand wordmark as a floating element. No brand name as headline, subtitle, caption, or decorative element. No brand signature in any corner. Communicate brand identity ONLY through visual style: colors, photography, and motifs — NEVER through rendering the brand name as standalone text.`

    // Product reference instruction — injected when a reference image is supplied.
    const productRefBlock = hasProductRef
      ? `\n\nPRODUCT REFERENCE IMAGE — CRITICAL:\nThe FIRST reference image supplied is the EXACT product to feature. Reproduce it with pixel-accurate fidelity:\n- Exact shape, silhouette, and proportions\n- Exact colors, materials, textures, and finish\n- Exact packaging design, labels, and any graphic elements on the surface\n- Exact size relationships between parts\nDo NOT redesign, simplify, or reinterpret the product. It must be a faithful, photographic-quality reproduction of the reference.`
      : ''

    // Apply text overrides if provided — swap AD COPY texts in the existing prompt
    const basePrompt = textOverrides
      ? replaceAdCopyInPrompt(fmt.prompt, textOverrides.headline, textOverrides.cta)
      : fmt.prompt

    const finalPrompt = (basePrompt + productRefBlock)
      .replace('{{LOGO_BLOCK}}', logoBlock)
      .replace('{{BRAND_NAME_SUPPRESS}}', brandNameSuppress)

    try {
      // Build image_urls: product reference FIRST (primary subject), logo second.
      const imageUrls = []
      if (productImage) imageUrls.push(productImage)
      else if (productRefUrl) imageUrls.push(productRefUrl)
      if (hasLogo) imageUrls.push(logoDataUrl)

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

      if (hasLogo) {
        srcBlob = await compositeLogoOnBanner(srcBlob, logoDataUrl, fmt.width, fmt.height)
      }

      const blob = await compressToJpeg(srcBlob)
      addCost(domain, costPerImage(model.type))
      const previewUrl = URL.createObjectURL(blob)
      setPreviews((prev) => ({ ...prev, [fmt.id]: previewUrl }))

      const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      const fmtSlug = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
      const filename = `${safeDomain}_${fmtSlug}.jpg`

      // Save prompt and texts used in this generation
      promptsMapRef.current[filename] = finalPrompt
      textsMapRef.current[filename] = {
        headline: textOverrides?.headline ?? (fmt.headline || ''),
        cta: textOverrides?.cta ?? (fmt.cta || ''),
      }
      // Clear stale editing state so editor reinitializes from fresh values on next open
      setEditingTexts((prev) => { const next = { ...prev }; delete next[filename]; return next })

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

      // Upload to Google Drive in background
      const sessionFolderId = driveFolderRef.current?.sessionFolderId
      if (sessionFolderId) {
        uploadToDrive(blob, filename, sessionFolderId).catch(() => {})
      }

      updateStatus(fmt.id, { status: 'done' })
      setDoneCount((c) => c + 1)
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Timeout — za długo' : e.message
      updateStatus(fmt.id, { status: 'error', message: msg })
    }
  }

  // textOverrides = { headline, cta } — optional, for "Zmień teksty" regeneration
  const retryOne = async (fmt, textOverrides = null) => {
    if (running) return
    setRunning(true)
    const controller = new AbortController()
    abortRef.current = controller
    await generateOne(fmt, controller.signal, textOverrides)
    setRunning(false)
  }

  const generateAll = async () => {
    if (running) return
    setRunning(true)

    // Reset all per-banner state for a fresh run
    promptsMapRef.current = {}
    textsMapRef.current = {}
    setExpandedPrompts({})
    setExpandedTexts({})
    setEditingTexts({})

    const controller = new AbortController()
    abortRef.current = controller

    const pending = formats.filter((f) => statuses[f.id]?.status !== 'done')

    // Pre-flight: create Drive folders ONCE before parallel uploads.
    if (!driveFolderRef.current) {
      try {
        const res = await fetch('/.netlify/functions/ensure-drive-folders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, ''),
            sessionFolder: SESSION_FOLDER,
          }),
        })
        if (res.ok) {
          driveFolderRef.current = await res.json()
        }
      } catch {
        // Drive pre-flight failure is non-fatal
      }
    }

    await Promise.allSettled(pending.map((fmt) => generateOne(fmt, controller.signal)))

    setRunning(false)
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
    setRunning(false)
  }

  // Open/close text editor for a banner row
  const toggleTextsEditor = (filename) => {
    const isCurrentlyOpen = !!expandedTexts[filename]

    if (!isCurrentlyOpen) {
      // Initialize form from saved texts (only if not already set)
      if (!editingTexts[filename]) {
        const saved = textsMapRef.current[filename]
        if (saved) {
          const parts = (saved.headline || '').split('\n').map((s) => s.trim()).filter(Boolean)
          setEditingTexts((prev) => ({
            ...prev,
            [filename]: { primary: parts[0] || '', secondary: parts[1] || '', cta: saved.cta || '' },
          }))
        }
      }
      // Close prompt panel if open
      setExpandedPrompts((prev) => ({ ...prev, [filename]: false }))
    }

    setExpandedTexts((prev) => ({ ...prev, [filename]: !prev[filename] }))
  }

  // Open/close prompt panel — also closes text editor
  const togglePrompt = (filename) => {
    setExpandedTexts((prev) => ({ ...prev, [filename]: false }))
    setExpandedPrompts((prev) => ({ ...prev, [filename]: !prev[filename] }))
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
          const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
          const fmtSlug = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
          const filename = `${safeDomain}_${fmtSlug}.jpg`
          const promptText = promptsMapRef.current[filename]
          const isPromptOpen = !!expandedPrompts[filename]
          const isTextsOpen = !!expandedTexts[filename]
          const ed = editingTexts[filename]
          const savedTexts = textsMapRef.current[filename]
          const hasTwoLines = !!(savedTexts?.headline?.includes('\n'))

          return (
            <div
              key={fmt.id}
              className={`rounded-xl overflow-hidden transition-colors
                ${st.status === 'done' ? 'bg-brand-green-light dark:bg-green-950/30' : ''}
                ${st.status === 'error' ? 'bg-brand-red-light dark:bg-red-950/30' : ''}
                ${st.status === 'generating' ? 'bg-orange-50 dark:bg-orange-950/30' : ''}
                ${st.status === 'idle' ? 'bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800' : ''}`}
            >
              {/* Main row */}
              <div className="p-3 flex items-center gap-3.5">
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

                {/* Status + action buttons */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {st.status === 'done' && (
                    <>
                      <button
                        type="button"
                        onClick={() => togglePrompt(filename)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap
                          ${isPromptOpen
                            ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-950/40'
                            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                          }`}
                      >
                        {isPromptOpen ? '▲ Prompt' : '▼ Prompt'}
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTextsEditor(filename)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors whitespace-nowrap
                          ${isTextsOpen
                            ? 'border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                          }`}
                      >
                        {isTextsOpen ? '▲ Teksty' : '✏️ Zmień teksty'}
                      </button>
                      <span className="text-brand-green font-semibold whitespace-nowrap">✅ zapisano</span>
                    </>
                  )}
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

              {/* Expandable: prompt viewer */}
              {isPromptOpen && promptText && (
                <div className="px-3 pb-3 border-t border-black/10 dark:border-white/5 pt-2.5">
                  <textarea
                    readOnly
                    value={promptText}
                    onClick={(e) => e.target.select()}
                    className="w-full h-40 text-[11px] font-mono bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 text-gray-700 dark:text-gray-300 resize-y focus:outline-none"
                  />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Kliknij w pole → Ctrl+A żeby zaznaczyć wszystko</p>
                </div>
              )}

              {/* Expandable: text editor */}
              {isTextsOpen && ed && (
                <div className="px-3 pb-3 border-t border-black/10 dark:border-white/5 pt-2.5 space-y-2.5">
                  {/* Headline — 1 or 2 fields depending on original structure */}
                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                      {hasTwoLines ? 'Nagłówek główny (duży)' : 'Nagłówek'}
                    </label>
                    <input
                      type="text"
                      value={ed.primary}
                      onChange={(e) => setEditingTexts((prev) => ({
                        ...prev, [filename]: { ...prev[filename], primary: e.target.value },
                      }))}
                      className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    />
                  </div>

                  {hasTwoLines && (
                    <div>
                      <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                        Podtytuł (mniejszy)
                      </label>
                      <input
                        type="text"
                        value={ed.secondary}
                        onChange={(e) => setEditingTexts((prev) => ({
                          ...prev, [filename]: { ...prev[filename], secondary: e.target.value },
                        }))}
                        className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-1">
                      Tekst CTA (przycisk)
                    </label>
                    <input
                      type="text"
                      value={ed.cta}
                      onChange={(e) => setEditingTexts((prev) => ({
                        ...prev, [filename]: { ...prev[filename], cta: e.target.value },
                      }))}
                      className="w-full text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const headline = (hasTwoLines && ed.secondary.trim())
                        ? `${ed.primary}\n${ed.secondary}`
                        : ed.primary
                      setExpandedTexts((prev) => ({ ...prev, [filename]: false }))
                      retryOne(fmt, { headline, cta: ed.cta })
                    }}
                    disabled={running || !ed.primary.trim()}
                    className="w-full text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg px-4 py-2.5 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ↻ Regeneruj z nowymi tekstami
                  </button>

                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    Tylko teksty zostaną podmienione — styl, układ i grafika pozostają bez zmian.
                  </p>
                </div>
              )}
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
