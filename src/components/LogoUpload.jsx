import { useState, useRef, useCallback } from 'react'
import { fileToPngDataUrl, removeBackgroundAI } from '../lib/imageUtils'

/**
 * LogoSelector — wybór logo w 3 trybach:
 *  - 'brand'  : logo pobrane automatycznie podczas researchu (base64)
 *  - 'upload' : ręczne wgranie pliku (drag & drop)
 *  - 'none'   : bez logo
 *
 * Props:
 *  onLogoChange(dataUrl | null) — wywoływane przy każdej zmianie
 *  brandLogoDataUrl              — base64 data URL logo z researchu (opcjonalne)
 */
export default function LogoUpload({ onLogoChange, brandLogoDataUrl }) {
  // Tryb domyślny: 'brand' jeśli jest logo z researchu, inaczej 'upload'
  const [mode, setMode] = useState(() => brandLogoDataUrl ? 'brand' : 'upload')

  // Stan dla trybu 'upload'
  const [uploadedUrl, setUploadedUrl] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [bgStatus, setBgStatus] = useState(null)
  const [aiRemoving, setAiRemoving] = useState(false)
  const [aiError, setAiError] = useState(null)
  const inputRef = useRef(null)

  // Przy zmianie trybu — emit odpowiednie logo
  const switchMode = (newMode) => {
    setMode(newMode)
    if (newMode === 'brand') onLogoChange(brandLogoDataUrl || null)
    else if (newMode === 'upload') onLogoChange(uploadedUrl || null)
    else onLogoChange(null)
  }

  const processFile = useCallback(async (file) => {
    if (!file) return
    try {
      const result = await fileToPngDataUrl(file)
      setUploadedUrl(result.dataUrl)
      setFileName(file.name)
      onLogoChange(result.dataUrl)

      let source = 'original'
      if (result.bgRemoved) source = 'local'
      else if (result.hasAlpha) source = 'original'

      setBgStatus({ removed: result.bgRemoved || result.hasAlpha, reason: result.reason, source })
      setAiError(null)
    } catch (err) {
      alert('Błąd konwersji logo: ' + err.message)
    }
  }, [onLogoChange])

  const handleAiRemove = async () => {
    if (!uploadedUrl) return
    setAiRemoving(true)
    setAiError(null)
    try {
      const newDataUrl = await removeBackgroundAI(uploadedUrl)
      setUploadedUrl(newDataUrl)
      onLogoChange(newDataUrl)
      setBgStatus({ removed: true, reason: 'ai-rembg', source: 'ai' })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiRemoving(false)
    }
  }

  const clearUpload = () => {
    setUploadedUrl(null)
    setFileName('')
    setBgStatus(null)
    setAiError(null)
    onLogoChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }

  const checkerStyle = {
    backgroundImage:
      'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
    backgroundColor: '#f9fafb',
  }

  const getStatusBadge = () => {
    if (!bgStatus) return null
    if (bgStatus.source === 'ai') return { text: '🧠 Tło usunięte przez AI', color: 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/50' }
    if (bgStatus.source === 'local' && bgStatus.reason === 'flood-fill') return { text: '✅ Tło usunięte lokalnie', color: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50' }
    if (bgStatus.reason === 'svg') return { text: '✅ SVG — przezroczyste tło', color: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50' }
    if (bgStatus.reason === 'already-has-alpha') return { text: '✅ PNG z przezroczystością', color: 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/50' }
    if (bgStatus.reason === 'non-uniform-background') return { text: '⚠️ Tło złożone — użyj AI', color: 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50' }
    return { text: 'ℹ️ Tło nie usunięte', color: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800' }
  }

  const statusBadge = getStatusBadge()
  const canTryAi = bgStatus && !bgStatus.removed && bgStatus.source !== 'ai'

  const MODES = [
    { id: 'brand',  label: 'Z brandu',    disabled: !brandLogoDataUrl },
    { id: 'upload', label: 'Wgraj własne', disabled: false },
    { id: 'none',   label: 'Bez logo',     disabled: false },
  ]

  return (
    <div className="rounded-xl p-4 mb-3 bg-white dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2.5">
        Logo klienta (opcjonalne)
      </div>

      {/* Selector — 3 opcje */}
      <div className="flex gap-1.5 mb-3">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={m.disabled}
            onClick={() => !m.disabled && switchMode(m.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${mode === m.id
                ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                : m.disabled
                  ? 'border-gray-100 text-gray-300 dark:border-gray-800 dark:text-gray-600 cursor-not-allowed'
                  : 'border-gray-200 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 cursor-pointer'}`}
          >
            {m.id === 'brand' && !brandLogoDataUrl ? 'Z brandu (brak)' : m.label}
          </button>
        ))}
      </div>

      {/* Tryb: Z brandu */}
      {mode === 'brand' && brandLogoDataUrl && (
        <div className="border-2 border-brand-green rounded-lg p-3 flex items-center gap-3 bg-brand-green-light dark:bg-brand-green-light/10">
          <span className="text-xl flex-shrink-0">✅</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-white">Logo ze strony klienta</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Pobrane automatycznie podczas researchu</div>
          </div>
          <div className="flex gap-1.5">
            <div className="w-10 h-10 rounded-md overflow-hidden flex items-center justify-center p-1" style={checkerStyle}>
              <img src={brandLogoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="w-10 h-10 rounded-md bg-white border border-gray-200 flex items-center justify-center p-1">
              <img src={brandLogoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
            </div>
            <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center p-1">
              <img src={brandLogoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* Tryb: Wgraj własne */}
      {mode === 'upload' && (
        <>
          {!uploadedUrl ? (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-colors
                ${isDragging ? 'border-brand-orange bg-brand-orange-light' : 'border-gray-200 dark:border-gray-700 hover:border-brand-orange hover:bg-brand-orange-light'}`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*,.svg"
                onChange={(e) => processFile(e.target.files[0])}
                className="hidden"
              />
              <span className="text-xl flex-shrink-0">📂</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 dark:text-white">Wgraj logo — drag & drop lub kliknij</div>
                <div className="text-xs text-gray-400 dark:text-gray-500">SVG / PNG / JPG · tło usuwamy automatycznie przy wgraniu</div>
              </div>
            </div>
          ) : (
            <>
              <div className="border-2 border-brand-green rounded-lg p-3 flex items-center gap-3 bg-brand-green-light dark:bg-brand-green-light/10">
                <span className="text-xl flex-shrink-0">✅</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate text-gray-900 dark:text-white">{fileName}</div>
                  {statusBadge && (
                    <div className={`inline-block text-[11px] font-medium mt-0.5 px-1.5 py-0.5 rounded ${statusBadge.color}`}>
                      {statusBadge.text}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 mt-2.5">
                <div className="flex-1 rounded-md p-1.5 flex items-center justify-center h-11" style={checkerStyle} title="Przezroczystość">
                  <img src={uploadedUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
                </div>
                <div className="flex-1 rounded-md bg-white p-1.5 flex items-center justify-center h-11 border border-gray-200 dark:border-gray-700" title="Na jasnym tle">
                  <img src={uploadedUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
                </div>
                <div className="flex-1 rounded-md bg-gray-800 p-1.5 flex items-center justify-center h-11" title="Na ciemnym tle">
                  <img src={uploadedUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
                </div>
              </div>

              {canTryAi && (
                <div className="mt-2.5 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded-md p-2.5">
                  <div className="text-xs text-orange-800 dark:text-orange-300 mb-1.5">
                    Tło ma złożony wzór (zdjęcie/gradient). Usunięcie lokalne nie zadziałało.
                  </div>
                  <button
                    onClick={handleAiRemove}
                    disabled={aiRemoving}
                    className="text-xs bg-purple-600 text-white rounded-md px-3 py-1.5 font-semibold hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                  >
                    {aiRemoving ? '🧠 Usuwam tło...' : '🧠 Usuń tło AI (~$0.005)'}
                  </button>
                  {aiError && <div className="text-xs text-red-600 mt-1.5">❌ {aiError}</div>}
                </div>
              )}

              <button onClick={clearUpload} className="text-xs text-red-600 mt-2 hover:underline">
                ✕ Usuń logo
              </button>
            </>
          )}
        </>
      )}

      {/* Tryb: Bez logo */}
      {mode === 'none' && (
        <div className="text-xs text-gray-400 dark:text-gray-500 py-2 px-1">
          Logo nie zostanie dodane do grafik.
        </div>
      )}
    </div>
  )
}
