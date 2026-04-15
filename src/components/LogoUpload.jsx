import { useState, useRef, useCallback } from 'react'
import { fileToPngDataUrl, removeBackgroundAI } from '../lib/imageUtils'

export default function LogoUpload({ onLogoChange }) {
  const [logoUrl, setLogoUrl] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [bgStatus, setBgStatus] = useState(null) // { removed, reason, source: 'local' | 'ai' | 'original' }
  const [aiRemoving, setAiRemoving] = useState(false)
  const [aiError, setAiError] = useState(null)
  const inputRef = useRef(null)

  const processFile = useCallback(async (file) => {
    if (!file) return
    try {
      const result = await fileToPngDataUrl(file)
      setLogoUrl(result.dataUrl)
      setFileName(file.name)
      onLogoChange(result.dataUrl)

      // Translate the technical reason into a user-friendly status
      let source = 'original'
      if (result.bgRemoved) source = 'local'
      else if (result.hasAlpha) source = 'original' // already transparent

      setBgStatus({
        removed: result.bgRemoved || result.hasAlpha,
        reason: result.reason,
        source,
      })
      setAiError(null)
    } catch (err) {
      alert('Błąd konwersji logo: ' + err.message)
    }
  }, [onLogoChange])

  const handleAiRemove = async () => {
    if (!logoUrl) return
    setAiRemoving(true)
    setAiError(null)
    try {
      const newDataUrl = await removeBackgroundAI(logoUrl)
      setLogoUrl(newDataUrl)
      onLogoChange(newDataUrl)
      setBgStatus({ removed: true, reason: 'ai-rembg', source: 'ai' })
    } catch (err) {
      setAiError(err.message)
    } finally {
      setAiRemoving(false)
    }
  }

  const clearLogo = () => {
    setLogoUrl(null)
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

  // Checkerboard pattern for transparency preview
  const checkerStyle = {
    backgroundImage:
      'linear-gradient(45deg, #e5e7eb 25%, transparent 25%), linear-gradient(-45deg, #e5e7eb 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e7eb 75%), linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
    backgroundColor: '#f9fafb',
  }

  // Status badge text + color
  const getStatusBadge = () => {
    if (!bgStatus) return null
    if (bgStatus.source === 'ai') return { text: '🧠 Tło usunięte przez AI', color: 'text-purple-700 bg-purple-50' }
    if (bgStatus.source === 'local' && bgStatus.reason === 'flood-fill') return { text: '✅ Tło usunięte lokalnie', color: 'text-green-700 bg-green-50' }
    if (bgStatus.reason === 'svg') return { text: '✅ SVG — przezroczyste tło', color: 'text-green-700 bg-green-50' }
    if (bgStatus.reason === 'already-has-alpha') return { text: '✅ PNG z przezroczystością', color: 'text-green-700 bg-green-50' }
    if (bgStatus.reason === 'non-uniform-background') return { text: '⚠️ Tło złożone — użyj AI', color: 'text-orange-700 bg-orange-50' }
    return { text: 'ℹ️ Tło nie usunięte', color: 'text-gray-700 bg-gray-100' }
  }

  const statusBadge = getStatusBadge()
  const canTryAi = bgStatus && !bgStatus.removed && bgStatus.source !== 'ai'

  return (
    <div className="bg-white rounded-xl p-4 mb-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2.5">
        Logo klienta (opcjonalne)
      </div>

      {!logoUrl ? (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-3 flex items-center gap-3 cursor-pointer transition-colors
            ${isDragging ? 'border-brand-orange bg-brand-orange-light' : 'border-gray-200 hover:border-brand-orange hover:bg-brand-orange-light'}`}
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
            <div className="text-sm font-semibold">Wgraj logo — drag & drop lub kliknij</div>
            <div className="text-xs text-gray-400">SVG / PNG / JPG · tło usuwamy automatycznie przy wgraniu</div>
          </div>
        </div>
      ) : (
        <>
          <div className="border-2 border-brand-green rounded-lg p-3 flex items-center gap-3 bg-brand-green-light">
            <span className="text-xl flex-shrink-0">✅</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{fileName}</div>
              {statusBadge && (
                <div className={`inline-block text-[11px] font-medium mt-0.5 px-1.5 py-0.5 rounded ${statusBadge.color}`}>
                  {statusBadge.text}
                </div>
              )}
            </div>
          </div>

          {/* Preview panels: transparent checkerboard + light + dark */}
          <div className="flex gap-2 mt-2.5">
            <div className="flex-1 rounded-md p-1.5 flex items-center justify-center h-11" style={checkerStyle} title="Przezroczystość">
              <img src={logoUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
            </div>
            <div className="flex-1 rounded-md bg-white p-1.5 flex items-center justify-center h-11 border border-gray-200" title="Na jasnym tle">
              <img src={logoUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
            </div>
            <div className="flex-1 rounded-md bg-gray-800 p-1.5 flex items-center justify-center h-11" title="Na ciemnym tle">
              <img src={logoUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
            </div>
          </div>

          {/* AI fallback button — only shown if local removal didn't work */}
          {canTryAi && (
            <div className="mt-2.5 bg-orange-50 border border-orange-200 rounded-md p-2.5">
              <div className="text-xs text-orange-800 mb-1.5">
                Tło ma złożony wzór (zdjęcie/gradient). Usunięcie lokalne nie zadziałało.
              </div>
              <button
                onClick={handleAiRemove}
                disabled={aiRemoving}
                className="text-xs bg-purple-600 text-white rounded-md px-3 py-1.5 font-semibold hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {aiRemoving ? '🧠 Usuwam tło...' : '🧠 Usuń tło AI (~$0.005)'}
              </button>
              {aiError && <div className="text-xs text-red-600 mt-1.5">❌ {aiError}</div>}
            </div>
          )}

          <button
            onClick={clearLogo}
            className="text-xs text-red-600 mt-2 hover:underline"
          >
            ✕ Usuń logo
          </button>
        </>
      )}
    </div>
  )
}
