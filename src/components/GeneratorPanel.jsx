import { useState, useRef } from 'react'
import {
  Folder,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Pencil,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Zap,
  Clock,
  Square,
} from 'lucide-react'
import { resolveModel, costPerImage } from '../lib/modelRouting'
import { cropToAspect, compressToJpeg, compositeLogoOnBanner, injectXmpDescription } from '../lib/imageUtils'
import { addCost } from '../lib/clientCosts'

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

/** True only for direct image URLs (jpg/png/webp/gif/avif) — webpage URLs must NOT go to fal.ai */
function isImageUrl(url) {
  if (!url) return false
  return /\.(jpe?g|png|webp|gif|avif|bmp|svg)(\?.*)?$/i.test(url.split('?')[0])
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

/**
 * Build an NB Pro /edit prompt from a structured JSON description of the
 * original banner (produced by Claude Vision via describe-banner.js) PLUS
 * the new text values the user wants. The JSON carries every visual attribute
 * of the original — scene, subjects, lighting, composition, typography style,
 * text positions — while the text CONTENT is injected fresh.
 *
 * Why: NB Pro reliably renders Polish diacritics (KAWĄ, ŚWIEŻĄ, Sprawdź) but
 * needs a thorough prompt to reproduce the original layout closely. The
 * original image is also passed as a reference (image_urls) to anchor visual
 * identity — the JSON + image reference together give ~75-85% fidelity.
 */
function buildTextEditPromptFromJson(description, headline, cta, isStories, isTikTokVertical) {
  const parts = headline.split('\n').map((s) => s.trim()).filter(Boolean)
  const primary = parts[0] || ''
  const secondary = parts[1] || null
  const includeCta = !isStories && !isTikTokVertical

  const textBlock = secondary
    ? `- PRIMARY HEADLINE: "${primary}" (large, dominant)\n- SECONDARY LINE: "${secondary}" (smaller, below primary)`
    : `- Headline: "${primary}"`
  const ctaBlock = includeCta ? `\n- CTA button: "${cta}"` : ''

  // Pretty-printed JSON to keep it readable in the prompt
  const jsonPretty = JSON.stringify(description, null, 2)

  return `Recreate this advertising banner exactly as described in the JSON specification below. The first reference image is the ORIGINAL banner — reproduce its visual identity (scene, subjects, lighting, composition, colors, mood) as faithfully as possible. ONLY the text content changes.

VISUAL SPECIFICATION (from analysis of the original):
${jsonPretty}

AD COPY — use EXACTLY these text values, rendered in the typography style described in "text_layout":
${textBlock}${ctaBlock}

CRITICAL REQUIREMENTS:
- Reproduce the scene, background, subjects, foreground objects, composition, lighting, color palette, atmosphere, and photographic style EXACTLY as described in the JSON. Use the reference image as the authoritative source for visual identity.
- Place the new text content at the positions described in "text_layout" using the typography styles described there (font character, size, color, weight, casing).
- Render all text with crisp, correctly-spelled Polish typography — including Polish diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń) spelled and shaped correctly.
- Preserve the aspect ratio and logo placement from the JSON.
- Do NOT add, remove, or rearrange any visual elements beyond what is described.
- Do NOT change the people's appearance, poses, clothing, or expressions — reproduce them from the reference image.

NEGATIVE PROMPT: garbled text, misspelled words, missing diacritics, wrong characters, different people, different composition, added elements, removed elements, different color palette.`
}

/** Convert a Blob to a base64 data URL (needed to re-send as image reference) */
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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

export default function GeneratorPanel({ formats, logoDataUrl, brandName, domain, notes, productImage, notesImageUrl, falMode = 'test' }) {
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
  // Collects { filename → seed } returned by fal.ai — used for text-edit regeneration
  const seedMapRef = useRef({})
  // Collects { filename → Blob } — original compressed banner, used as img2img reference
  const originalBlobsRef = useRef({})
  // Cache of { filename → description JSON } returned by Claude Vision (describe-banner).
  // Prevents re-running Vision on every text edit of the same banner — one description
  // per banner, reused across multiple text-edit regenerations.
  const descriptionsMapRef = useRef({})
  // Tracks which banner rows have their prompt expanded (filename → bool)
  const [expandedPrompts, setExpandedPrompts] = useState({})
  // Tracks which banner rows have their text editor open (filename → bool)
  const [expandedTexts, setExpandedTexts] = useState({})
  // Current form values in text editors (filename → { primary, secondary, cta })
  const [editingTexts, setEditingTexts] = useState({})
  // AI captions (fmt.id → string) — generated fire-and-forget after each banner completes
  const [captions, setCaptions] = useState({})

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
      if (data.status === 'COMPLETED') return { imageUrl: data.imageUrl, seed: data.seed ?? null }
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
    // productImage (base64) > notesImageUrl (confirmed image URL from App.jsx probe) > fallback extension check
    // Webpage URLs must never reach fal.ai as image_urls (causes 502).
    const rawNotesUrl = !productImage && !notesImageUrl ? extractUrl(notes) : null
    const productRefUrl = productImage ? null
      : notesImageUrl ? notesImageUrl
      : (rawNotesUrl && isImageUrl(rawNotesUrl)) ? rawNotesUrl
      : null
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

    // --- TEXT-EDIT MODE (img2img): send original banner as reference + focused prompt ---
    // Used when textOverrides provided — preserves visual composition, swaps text only.
    const isEditMode = !!textOverrides
    const isStories = fmt.channel === 'meta' && (fmt.ar === '9:16' || (fmt.height > fmt.width && fmt.height / fmt.width > 1.5))
    const isTikTokVertical = fmt.channel === 'tiktok'

    let finalPrompt
    let submitImageUrls

    if (isEditMode) {
      // JSON re-describe path: Claude Vision analyzes the ORIGINAL banner → detailed
      // JSON → we substitute new text content → NB Pro /edit regenerates from scratch
      // with the original as a visual reference image. NB Pro renders Polish
      // diacritics (ą, ę, ś, ć, ź, ż, ł, ó, ń) correctly.
      const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      const fmtSlug = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
      const origFilename = `${safeDomain}_${fmtSlug}.jpg`
      const origBlob = originalBlobsRef.current[origFilename]
      if (!origBlob) throw new Error('Brak oryginalnego banera do edycji — zregeneruj go najpierw.')
      const origDataUrl = await blobToDataUrl(origBlob)

      // Describe once, cache for subsequent edits of the same banner
      let description = descriptionsMapRef.current[origFilename]
      if (!description) {
        const descRes = await fetch('/.netlify/functions/describe-banner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: origDataUrl, mediaType: 'image/jpeg' }),
          signal,
        })
        if (!descRes.ok) {
          const errText = await descRes.text().catch(() => '')
          throw new Error(`Analiza obrazu nie powiodła się: ${errText.slice(0, 200)}`)
        }
        const descData = await descRes.json()
        if (!descData.description) throw new Error('Brak opisu obrazu z Claude Vision')
        description = descData.description
        descriptionsMapRef.current[origFilename] = description
      }

      finalPrompt = buildTextEditPromptFromJson(
        description, textOverrides.headline, textOverrides.cta, isStories, isTikTokVertical
      )
      submitImageUrls = [origDataUrl]
    } else {
      // Normal generation: full prompt + product/logo references
      const basePrompt = fmt.prompt
      finalPrompt = (basePrompt + productRefBlock)
        .replace('{{LOGO_BLOCK}}', logoBlock)
        .replace('{{BRAND_NAME_SUPPRESS}}', brandNameSuppress)
      submitImageUrls = []
      if (productImage) submitImageUrls.push(productImage)
      else if (productRefUrl) submitImageUrls.push(productRefUrl)
      if (hasLogo) submitImageUrls.push(logoDataUrl)
    }

    // Reuse the original seed for text-edit regeneration (improves visual similarity)
    const safeDomainForSeed = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
    const fmtSlugForSeed = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
    const filenameForSeed = `${safeDomainForSeed}_${fmtSlugForSeed}.jpg`
    const reusedseed = isEditMode ? (seedMapRef.current[filenameForSeed] ?? null) : null

    try {
      // Step 1: Submit to fal.ai queue
      const submitRes = await fetch('/.netlify/functions/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          ar: model.ar,
          // Text-edit mode: use NB Pro /edit (renders Polish text correctly)
          // with original as reference + JSON-driven prompt + original seed.
          modelType: isEditMode ? 'nbpro' : model.type,
          useLogo: submitImageUrls.length > 0,
          logoDataUrl: submitImageUrls.length > 0 ? submitImageUrls : undefined,
          falMode,
          ...(reusedseed != null ? { seed: reusedseed } : {}),
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
      const { imageUrl: imgUrl, seed: returnedSeed } = await pollForResult(
        submitData.status_url,
        submitData.response_url,
        signal
      )

      // Step 3: Fetch, resize, composite logo (pixel-perfect), compress, save
      let srcBlob = await (await fetch(imgUrl)).blob()

      if (model.needsResize) {
        srcBlob = await cropToAspect(srcBlob, fmt.width, fmt.height)
      }

      // In edit mode the original banner (passed as reference) already has the logo
      // baked in, and NB Pro /edit reproduces it. Re-running compositeLogoOnBanner
      // here would stamp a SECOND logo on top.
      let noLogoBlob = null
      if (hasLogo && !isEditMode) {
        noLogoBlob = await compressToJpeg(srcBlob)
        srcBlob = await compositeLogoOnBanner(srcBlob, logoDataUrl, fmt.width, fmt.height)
      }

      let blob = await compressToJpeg(srcBlob)
      // Edit mode cost = NB Pro $0.15 + Haiku Vision ~$0.003 (only on first edit; subsequent
      // edits of the same banner reuse the cached description).
      addCost(domain, costPerImage(isEditMode ? 'nbpro' : model.type))

      const safeDomain = domain.replace(/https?:\/\//g, '').replace(/[/:?*"<>|\\]/g, '_').replace(/_+$/g, '')
      const fmtSlug = fmt.id.replace(/^(meta|gdn|programmatic)-/, '')
      // Original (unedited) filename — always used as the KEY for our maps so
      // the edit workflow always references the ORIGINAL banner, not a chain
      // of accumulating edits (which would compound text degradation).
      const originalKey = `${safeDomain}_${fmtSlug}.jpg`
      // Actual filename saved to disk. Edited versions get "_edytowany" suffix
      // (and overwrite previous edits on repeated text changes).
      const filename = isEditMode
        ? `${safeDomain}_${fmtSlug}_edytowany.jpg`
        : originalKey

      // --- AI caption: awaited before save so the text is embedded in XMP metadata ---
      // The caption is stored in dc:description (XMP APP1 segment) inside the JPEG binary.
      // XMP-aware tools (Lightroom, Bridge, Photoshop, Windows Explorer details pane) will
      // surface it. Google Drive Details panel may also display it.
      let captionText = null
      if (!isEditMode) {
        try {
          const captionDataUrl = await blobToDataUrl(blob)
          const captionRes = await fetch('/.netlify/functions/describe-banner', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: captionDataUrl, mediaType: 'image/jpeg', mode: 'caption' }),
          })
          if (captionRes.ok) {
            const captionData = await captionRes.json()
            captionText = captionData?.caption || null
          }
        } catch {}

        if (captionText) {
          // Embed into main blob and the no-logo version
          blob = await injectXmpDescription(blob, captionText)
          if (noLogoBlob) noLogoBlob = await injectXmpDescription(noLogoBlob, captionText)
          setCaptions((prev) => ({ ...prev, [fmt.id]: captionText }))
        }
      }

      const previewUrl = URL.createObjectURL(blob)
      setPreviews((prev) => ({ ...prev, [fmt.id]: previewUrl }))

      // Save prompt and texts under the KEY that matches the UI row (always originalKey).
      promptsMapRef.current[originalKey] = finalPrompt
      textsMapRef.current[originalKey] = {
        headline: textOverrides?.headline ?? (fmt.headline || ''),
        cta: textOverrides?.cta ?? (fmt.cta || ''),
      }
      // Seed: saved only on the initial generation — reused for all subsequent edits.
      if (!isEditMode && returnedSeed != null) {
        seedMapRef.current[originalKey] = returnedSeed
      }
      // originalBlobsRef: store the ORIGINAL banner only once (first successful gen).
      // On edit runs we do NOT overwrite it — NB Pro /edit must always reference the
      // pristine original (and Vision's cached description is derived from it too),
      // otherwise repeated edits would accumulate visual drift.
      if (!isEditMode) {
        originalBlobsRef.current[originalKey] = blob
      }
      // Clear stale editing state so editor reinitializes from fresh values on next open
      setEditingTexts((prev) => { const next = { ...prev }; delete next[originalKey]; return next })

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

      // Save pre-logo version to "bez logo" subfolder
      if (noLogoBlob) {
        if (folderHandleRef.current) {
          try {
            const noLogoDir = await folderHandleRef.current.getDirectoryHandle('bez logo', { create: true })
            const fh2 = await noLogoDir.getFileHandle(filename, { create: true })
            const w2 = await fh2.createWritable()
            await w2.write(noLogoBlob)
            await w2.close()
          } catch {}
        } else {
          const a2 = document.createElement('a')
          a2.href = URL.createObjectURL(noLogoBlob)
          a2.download = `bez_logo_${filename}`
          a2.click()
        }
        const noLogoFolderId = driveFolderRef.current?.noLogoFolderId
        if (noLogoFolderId) {
          uploadToDrive(noLogoBlob, filename, noLogoFolderId).catch(() => {})
        }
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
    seedMapRef.current = {}
    originalBlobsRef.current = {}
    descriptionsMapRef.current = {}
    setExpandedPrompts({})
    setExpandedTexts({})
    setEditingTexts({})
    setCaptions({})

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

    await runPool(pending.map((fmt) => () => generateOne(fmt, controller.signal)))

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
          className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap hover:bg-gray-800 transition-colors"
        >
          <Folder size={16} strokeWidth={1.8} aria-hidden />
          Wybierz folder
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {folderName ? (
            <>→ <strong className="text-gray-900 dark:text-white">{folderName}</strong> <span className="text-xs text-gray-300 dark:text-gray-600">({doneCount} zapisanych)</span></>
          ) : (
            fsaOk ? 'Wybierz folder docelowy' : '→ pliki trafią do Downloads'
          )}
        </span>
      </div>

      {/* Format grid — responsive: auto-fill cards, fixed min-width */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))' }}>
        {formats.map((fmt) => {
          const st = statuses[fmt.id]
          const model = resolveModel(fmt)
          const preview = previews[fmt.id]
          const caption = captions[fmt.id]
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
              className={`rounded-xl overflow-hidden transition-colors border
                ${st.status === 'done' ? 'border-brand-green/30 bg-brand-green-light dark:bg-green-950/30' : ''}
                ${st.status === 'error' ? 'border-brand-red/30 bg-brand-red-light dark:bg-red-950/30' : ''}
                ${st.status === 'generating' ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30' : ''}
                ${st.status === 'idle' ? 'border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/50' : ''}`}
            >
              {/* Thumbnail — fixed height 160px, fills card width */}
              <div className="relative w-full h-80 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                {preview ? (
                  <img src={preview} alt={fmt.label} className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-gray-300 dark:text-gray-600">
                    {st.status === 'generating'
                      ? <Zap size={28} strokeWidth={1.6} className="text-brand-orange animate-pulse" aria-hidden />
                      : <ImageIcon size={28} strokeWidth={1.6} aria-hidden />}
                  </div>
                )}
                {/* Caption overlay — bottom strip */}
                {caption && (
                  <div className="absolute bottom-0 inset-x-0 bg-black/55 px-2.5 py-1.5">
                    <p className="text-white text-[11px] leading-snug line-clamp-2">{caption}</p>
                  </div>
                )}
              </div>

              {/* Card body */}
              <div className="p-3">
                {/* Label + size + status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{fmt.label}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmt.width}×{fmt.height}px{model.needsResize ? ` · ${model.ar}→crop` : ''}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {st.status === 'done' && (
                      <span className="inline-flex items-center gap-1 text-brand-green text-xs font-semibold whitespace-nowrap">
                        <CheckCircle2 size={14} strokeWidth={1.8} aria-hidden /> zapisano
                      </span>
                    )}
                    {st.status === 'generating' && (
                      <span className="inline-flex items-center gap-1 text-brand-orange text-xs font-semibold whitespace-nowrap">
                        <Zap size={14} strokeWidth={1.8} aria-hidden /> generowanie...
                      </span>
                    )}
                    {st.status === 'idle' && (
                      <span className="inline-flex items-center gap-1 text-gray-300 dark:text-gray-600 text-xs whitespace-nowrap">
                        <Clock size={14} strokeWidth={1.8} aria-hidden /> oczekuje
                      </span>
                    )}
                    {st.status === 'error' && (
                      <span className="inline-flex items-center gap-1 text-brand-red text-xs" title={st.message}>
                        <XCircle size={14} strokeWidth={1.8} aria-hidden className="flex-shrink-0" />
                        <span className="truncate max-w-[100px]">błąd</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Error detail + retry */}
                {st.status === 'error' && (
                  <div className="mb-2">
                    <p className="text-brand-red text-[11px] leading-tight mb-1.5" title={st.message}>{st.message?.slice(0, 80)}</p>
                    <button
                      onClick={() => retryOne(fmt)}
                      disabled={running}
                      className="inline-flex items-center gap-1.5 text-xs bg-gray-900 text-white rounded-lg px-2.5 py-1 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <RotateCcw size={12} strokeWidth={2} aria-hidden /> Ponów
                    </button>
                  </div>
                )}

                {/* Prompt + Zmień teksty buttons (done only) */}
                {st.status === 'done' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => togglePrompt(filename)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors
                        ${isPromptOpen
                          ? 'border-blue-400 text-blue-500 bg-blue-50 dark:bg-blue-950/40'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                    >
                      {isPromptOpen ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <ChevronDown size={12} strokeWidth={2} aria-hidden />}
                      Prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTextsEditor(filename)}
                      className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors
                        ${isTextsOpen
                          ? 'border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400'
                          : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                        }`}
                    >
                      {isTextsOpen ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <Pencil size={12} strokeWidth={1.8} aria-hidden />}
                      Zmień teksty
                    </button>
                  </div>
                )}
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
                    className="inline-flex items-center justify-center gap-2 w-full text-sm font-semibold bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-lg px-4 py-2.5 hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw size={16} strokeWidth={1.8} aria-hidden />
                    Regeneruj z nowymi tekstami
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
        let btnIcon, btnText
        if (running) {
          btnIcon = <Square size={18} strokeWidth={2} fill="currentColor" aria-hidden />
          btnText = 'Zatrzymaj generowanie'
        } else if (allDone) {
          btnIcon = <CheckCircle2 size={18} strokeWidth={2} aria-hidden />
          btnText = 'Wszystkie wygenerowane'
        } else if (errorCount > 0) {
          btnIcon = <RotateCcw size={18} strokeWidth={2} aria-hidden />
          btnText = `Ponów nieudane (${errorCount})`
        } else {
          btnIcon = <Zap size={18} strokeWidth={2} aria-hidden />
          btnText = `Generuj wszystkie (${totalFormats} grafik)`
        }
        return (
          <button
            onClick={running ? stopGeneration : generateAll}
            disabled={(!folderName && fsaOk) || allDone}
            className={`inline-flex items-center justify-center gap-2 w-full rounded-xl py-4 text-base font-bold transition-colors
              ${running
                ? 'bg-red-600 text-white hover:bg-red-700'
                : allDone
                ? 'bg-green-600 text-white cursor-default'
                : 'bg-gray-900 text-white hover:bg-gray-800 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed'
              }`}
          >
            {btnIcon}
            {btnText}
          </button>
        )
      })()}


    </div>
  )
}
