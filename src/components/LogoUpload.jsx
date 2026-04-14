import { useState, useRef, useCallback } from 'react'
import { fileToPngDataUrl } from '../lib/imageUtils'

export default function LogoUpload({ onLogoChange }) {
  const [logoUrl, setLogoUrl] = useState(null)
  const [fileName, setFileName] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef(null)

  const processFile = useCallback(async (file) => {
    if (!file) return
    try {
      const dataUrl = await fileToPngDataUrl(file)
      setLogoUrl(dataUrl)
      setFileName(file.name)
      onLogoChange(dataUrl)
    } catch (err) {
      alert('Błąd konwersji logo: ' + err.message)
    }
  }, [onLogoChange])

  const clearLogo = () => {
    setLogoUrl(null)
    setFileName('')
    onLogoChange(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) processFile(file)
  }

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
            <div className="text-xs text-gray-400">SVG / PNG / JPG · bannery będą zawierać logo jako referencję AI</div>
          </div>
        </div>
      ) : (
        <>
          <div className="border-2 border-brand-green rounded-lg p-3 flex items-center gap-3 bg-brand-green-light">
            <span className="text-xl flex-shrink-0">✅</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{fileName} — wgrane</div>
              <div className="text-xs text-gray-400">Logo zostanie przekazane do modelu jako referencja</div>
            </div>
          </div>

          <div className="flex gap-2 mt-2.5">
            <div className="flex-1 rounded-md bg-gray-100 p-1.5 flex items-center justify-center h-11">
              <img src={logoUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
            </div>
            <div className="flex-1 rounded-md bg-gray-800 p-1.5 flex items-center justify-center h-11">
              <img src={logoUrl} alt="logo" className="max-h-8 max-w-full object-contain" />
            </div>
          </div>

          <button
            onClick={clearLogo}
            className="text-xs text-red-600 mt-1.5 hover:underline"
          >
            ✕ Usuń logo
          </button>
        </>
      )}
    </div>
  )
}
