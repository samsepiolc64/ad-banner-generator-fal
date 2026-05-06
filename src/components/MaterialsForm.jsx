import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload,
  X,
  Sparkles,
  Image as ImageIcon,
  AlertTriangle,
} from 'lucide-react'
import { AD_LANGUAGES } from './CampaignForm'

const CATEGORY_LABELS = {
  product: 'Produkt',
  banner: 'Baner ref.',
  mood: 'Nastrój',
}

const CATEGORY_COLORS = {
  product: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  banner: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  mood: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

const CATEGORY_OPTIONS = [
  { value: 'product', label: 'Produkt' },
  { value: 'banner', label: 'Baner referencyjny' },
  { value: 'mood', label: 'Nastrój / inspiracja' },
]

const MAX_FILES = 10
const MAX_SIZE = 4 * 1024 * 1024 // 4 MB

export default function MaterialsForm({ initialData, brandLogoDataUrl, requireBannerRef = false, onSubmit, onBack }) {
  const [imageModel, setImageModel] = useState(initialData?.imageModel || 'nanobanan')
  const [language, setLanguage] = useState(initialData?.language || 'pl')
  const [notes, setNotes] = useState(initialData?.notes || '')
  const [logoMode, setLogoMode] = useState(initialData?.logoMode || 'none')
  const [uploadedLogoDataUrl, setUploadedLogoDataUrl] = useState(initialData?.logoDataUrl || null)
  const [classifiedMedia, setClassifiedMedia] = useState(initialData?.classifiedMedia || [])
  const [classifying, setClassifying] = useState(false)
  const [classifyError, setClassifyError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState('')
  // Track which items are pending classification (no category yet)
  const [pendingFilenames, setPendingFilenames] = useState([])

  const mediaInputRef = useRef(null)
  const logoInputRef = useRef(null)
  const dragCounterRef = useRef(0)

  // Global paste handler for media files
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files = []
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) files.push(file)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        handleMediaFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [classifiedMedia]) // eslint-disable-line react-hooks/exhaustive-deps

  const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  /**
   * Read a file and convert it to a JPEG data URL via canvas.
   * Handles any browser-renderable format (JPEG, PNG, WebP, AVIF, etc.)
   * including files with incorrect MIME types (e.g. WebP saved as .jpg).
   * Stored at original resolution — compressRefImage in GeneratorPanel handles
   * resizing before sending to fal.ai.
   */
  const readFileAsJpegDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = (e) => {
        const img = new Image()
        img.onerror = () => resolve(e.target.result) // fallback: return raw if canvas fails
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          // Fill white background before drawing (handles PNG transparency)
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0)
          resolve(canvas.toDataURL('image/jpeg', 0.92))
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })

  // Compress image to max 768px and JPEG q=0.75 — keeps it under Netlify's 6 MB body limit
  const compressForClassification = (dataUrl) =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 768
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round((height * MAX) / width); width = MAX }
          else { width = Math.round((width * MAX) / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      img.onerror = () => resolve(dataUrl) // fallback: send original
      img.src = dataUrl
    })

  const handleMediaFiles = useCallback(
    async (files) => {
      setFileError('')
      const validFiles = []
      for (const file of files) {
        if (!file.type.match(/^image\/(png|jpe?g|webp)$/i)) {
          setFileError('Akceptowane formaty: PNG, JPG, WebP')
          continue
        }
        if (file.size > MAX_SIZE) {
          setFileError(`Plik "${file.name}" jest za duży (max 4 MB)`)
          continue
        }
        if (classifiedMedia.length + validFiles.length >= MAX_FILES) {
          setFileError(`Maksymalnie ${MAX_FILES} plików`)
          break
        }
        validFiles.push(file)
      }

      if (validFiles.length === 0) return

      // Read all as JPEG data URLs (canvas conversion ensures correct format regardless
      // of file extension — handles WebP saved as .jpg, PNG with alpha, etc.)
      const newItems = await Promise.all(
        validFiles.map(async (file) => ({
          dataUrl: await readFileAsJpegDataUrl(file),
          filename: file.name,
          category: null, // pending classification
          originalCategory: null,
        }))
      )

      const updatedMedia = [...classifiedMedia, ...newItems]
      setClassifiedMedia(updatedMedia)
      setPendingFilenames(newItems.map((i) => i.filename))

      // Classify all new items
      setClassifying(true)
      setClassifyError('')
      try {
        // Compress images before sending — Netlify Functions have a 6 MB body limit
        const compressedImages = await Promise.all(
          newItems.map(async (i) => ({
            dataUrl: await compressForClassification(i.dataUrl),
            filename: i.filename,
          }))
        )
        const res = await fetch('/.netlify/functions/classify-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images: compressedImages }),
        })
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        const classMap = {}
        for (const c of data.classifications || []) {
          classMap[c.filename] = c.category
        }

        setClassifiedMedia((prev) =>
          prev.map((item) => {
            if (classMap[item.filename] && item.category === null) {
              return {
                ...item,
                category: classMap[item.filename],
                originalCategory: classMap[item.filename],
              }
            }
            return item
          })
        )
      } catch (err) {
        setClassifyError(`Klasyfikacja nie powiodła się: ${err.message}. Możesz ręcznie ustawić kategorie.`)
        // Fallback: assign 'mood' to all pending
        setClassifiedMedia((prev) =>
          prev.map((item) =>
            item.category === null
              ? { ...item, category: 'mood', originalCategory: 'mood' }
              : item
          )
        )
      } finally {
        setClassifying(false)
        setPendingFilenames([])
      }
    },
    [classifiedMedia]
  )

  const removeMedia = (idx) => {
    setClassifiedMedia((prev) => prev.filter((_, i) => i !== idx))
  }

  const updateCategory = (idx, category) => {
    setClassifiedMedia((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, category } : item))
    )
  }

  const handleLogoDrop = useCallback((file) => {
    if (!file) return
    if (!file.type.match(/^image\/(png|svg\+xml|jpe?g|webp)$/i)) {
      return
    }
    // Convert to JPEG via canvas — handles WebP, PNG with alpha, wrong MIME types.
    // We inline the conversion here to avoid a stale-closure dependency on readFileAsJpegDataUrl.
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => setUploadedLogoDataUrl(e.target.result) // fallback: raw
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        setUploadedLogoDataUrl(canvas.toDataURL('image/jpeg', 0.92))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasBannerRef = classifiedMedia.some((m) => m.category === 'banner')
  const bannerRefMissing = requireBannerRef && !hasBannerRef

  const handleSubmit = (e) => {
    e.preventDefault()
    if (classifying || bannerRefMissing) return

    const derivedLogoDataUrl =
      logoMode === 'upload' ? uploadedLogoDataUrl
      : logoMode === 'brand' ? (brandLogoDataUrl || null)
      : null

    onSubmit({
      imageModel,
      language,
      notes,
      logoMode,
      logoDataUrl: derivedLogoDataUrl,
      classifiedMedia: classifiedMedia.map((item) => ({
        ...item,
        category: item.category || 'mood',
      })),
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/30 px-4 pb-5 pt-2 space-y-6">

        {/* A) Model AI */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Model AI do generowania grafik
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                id: 'nanobanan',
                name: 'Nano Banana 2',
                badge: 'Domyślny',
                desc: 'FLUX · sprawdzony, szybki',
                price: '$0.08–0.15 / grafika',
              },
              {
                id: 'gpt-image-2',
                name: 'GPT Image 2',
                badge: 'OpenAI',
                desc: 'Tekst w grafice, naturalny język',
                price: '$0.15–0.41 / grafika',
              },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setImageModel(m.id)}
                className={`text-left p-3 rounded-xl border transition-colors
                  ${imageModel === m.id
                    ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">{m.name}</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                    {m.badge}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{m.price}</div>
              </button>
            ))}
          </div>
        </div>

        {/* B) Język tekstów na grafikach */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Język tekstów na grafikach
          </label>
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {AD_LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setLanguage(lang.code)}
                className={`pill ${language === lang.code ? 'pill-active' : ''}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            Hasło, CTA i wszystkie teksty widoczne na grafikach będą w wybranym języku.
          </p>
        </div>

        {/* C) Dodatkowe uwagi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Dodatkowe uwagi <span className="font-normal text-gray-400">(opcjonalnie)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="np. styl jak Apple, tylko zdjęcia produktowe bez ludzi, unikaj koloru czerwonego…"
            rows={3}
            className="input resize-y"
          />
        </div>

        {/* D) Logo klienta */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Logo klienta
          </label>
          <div className="flex gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit mb-3">
            {[
              { value: 'brand', label: 'Z brandu' },
              { value: 'upload', label: 'Wgraj własne' },
              { value: 'none', label: 'Bez logo' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLogoMode(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                  ${logoMode === opt.value
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {logoMode === 'brand' && (
            <div className="flex items-center gap-3">
              {brandLogoDataUrl ? (
                <img
                  src={brandLogoDataUrl}
                  alt="Logo z brandu"
                  className="w-16 h-16 object-contain rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-1 flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center flex-shrink-0">
                  <ImageIcon size={20} strokeWidth={1.6} className="text-gray-300 dark:text-gray-600" aria-hidden />
                </div>
              )}
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {brandLogoDataUrl ? 'Logo pobrane z profilu marki' : '(brak logo w danych marki)'}
              </div>
            </div>
          )}

          {logoMode === 'upload' && (
            <div>
              {uploadedLogoDataUrl ? (
                <div className="flex items-center gap-3 p-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                  <img
                    src={uploadedLogoDataUrl}
                    alt="Wgrane logo"
                    className="w-16 h-16 object-contain rounded-lg bg-gray-50 dark:bg-gray-800 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Logo wgrane</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUploadedLogoDataUrl(null); if (logoInputRef.current) logoInputRef.current.value = '' }}
                    className="flex-shrink-0 p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title="Usuń logo"
                  >
                    <X size={16} strokeWidth={1.8} aria-hidden />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-4 py-5 text-center transition-colors"
                >
                  <Upload size={18} strokeWidth={1.6} className="mx-auto mb-1.5 text-gray-400" aria-hidden />
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Kliknij lub przeciągnij logo
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">PNG, SVG, JPG</div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/svg+xml,image/jpeg"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoDrop(f); e.target.value = '' }}
                  />
                </div>
              )}
            </div>
          )}

          {logoMode === 'none' && (
            <div className="text-sm text-gray-500 dark:text-gray-400 py-1">
              Logo nie zostanie dodane do grafik.
            </div>
          )}
        </div>

        {/* E) Materiały i referencje */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Materiały i referencje{' '}
            {requireBannerRef
              ? <span className="font-normal text-orange-500">(wymagany baner referencyjny)</span>
              : <span className="font-normal text-gray-400">(opcjonalnie)</span>
            }
          </label>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-3 leading-relaxed">
            Wgraj zdjęcia produktów, istniejące banery klienta lub zdjęcia inspiracyjne.
            AI automatycznie rozpozna ich typ i użyje odpowiednio.
          </div>

          {/* Upload zone */}
          {classifiedMedia.length < MAX_FILES && (
            <div
              onDragEnter={(e) => { e.preventDefault(); dragCounterRef.current++; setDragOver(true) }}
              onDragLeave={(e) => { e.preventDefault(); dragCounterRef.current--; if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragOver(false) } }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                e.stopPropagation()
                dragCounterRef.current = 0
                setDragOver(false)
                const files = Array.from(e.dataTransfer.files)
                if (files.length > 0) handleMediaFiles(files)
              }}
              onClick={() => mediaInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors mb-3
                ${dragOver
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50'}`}
            >
              <Upload size={20} strokeWidth={1.6} className={`mx-auto mb-2 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} aria-hidden />
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
                Przeciągnij pliki lub kliknij · możesz też wkleić (Ctrl+V)
              </div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                PNG, JPG, WebP · max 4 MB · do {MAX_FILES} plików ({MAX_FILES - classifiedMedia.length} pozostało)
              </div>
              <input
                ref={mediaInputRef}
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files)
                  if (files.length > 0) handleMediaFiles(files)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {fileError && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mb-2">
              <AlertTriangle size={12} strokeWidth={1.8} aria-hidden />
              {fileError}
            </div>
          )}

          {classifyError && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 mb-2">
              <AlertTriangle size={12} strokeWidth={1.8} aria-hidden />
              {classifyError}
            </div>
          )}

          {/* Classifying spinner */}
          {classifying && (
            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 mb-3">
              <Sparkles size={14} strokeWidth={1.6} className="animate-pulse" aria-hidden />
              AI rozpoznaje typ materiałów…
            </div>
          )}

          {/* Media tiles */}
          {classifiedMedia.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {classifiedMedia.map((item, idx) => {
                const isPending = pendingFilenames.includes(item.filename) || item.category === null
                return (
                  <div
                    key={`${item.filename}-${idx}`}
                    className="relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
                  >
                    {/* Thumbnail */}
                    <div className="relative w-full h-20 bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                      {isPending && classifying ? (
                        <div className="w-full h-full animate-pulse bg-gray-200 dark:bg-gray-700" />
                      ) : (
                        <img
                          src={item.dataUrl}
                          alt={item.filename}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removeMedia(idx)}
                        className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white transition-colors"
                        title="Usuń"
                        aria-label="Usuń plik"
                      >
                        <X size={10} strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>

                    {/* Info */}
                    <div className="px-2 py-1.5">
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 truncate mb-1" title={item.filename}>
                        {item.filename}
                      </div>

                      {isPending && classifying ? (
                        <div className="h-5 w-16 animate-pulse bg-gray-200 dark:bg-gray-700 rounded-full" />
                      ) : (
                        <div className="flex gap-1 flex-wrap">
                          {CATEGORY_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateCategory(idx, opt.value)}
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold transition-colors
                                ${item.category === opt.value
                                  ? CATEGORY_COLORS[opt.value]
                                  : 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            >
                              {CATEGORY_LABELS[opt.value]}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Legend */}
          {classifiedMedia.length > 0 && (
            <div className="rounded-xl bg-gray-100 dark:bg-gray-800/50 px-3 py-2.5 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS.product}`}>
                  Produkt
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  AI odwzoruje ten produkt wiernie na banerach
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS.banner}`}>
                  Baner ref.
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  AI dopasuje styl do tej kreacji
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${CATEGORY_COLORS.mood}`}>
                  Nastrój
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  AI użyje jako inspirację atmosfery i kolorystyki
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Validation: banner ref required */}
        {bannerRefMissing && (
          <div className="flex items-start gap-2 text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-xl px-3 py-2.5">
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
              <path d="M7 1L13 12H1L7 1z"/>
              <path d="M7 5v3M7 10v.5"/>
            </svg>
            <span>Wybrano wariant <strong>Ze wzoru referencyjnego</strong> — wgraj baner referencyjny w sekcji <strong>Materiały i referencje</strong> powyżej (kategoria: <strong>Baner ref.</strong>).</span>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={classifying || bannerRefMissing}
            className="btn-primary flex-1 cursor-pointer"
          >
            {classifying ? (
              <>
                <Sparkles size={16} strokeWidth={1.6} className="animate-pulse" aria-hidden />
                Klasyfikowanie…
              </>
            ) : (
              <>
                Dalej
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M6 12l4-4-4-4"/>
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  )
}

