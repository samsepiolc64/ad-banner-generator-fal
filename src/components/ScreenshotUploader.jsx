import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Screenshot uploader — shown ONLY when automated research came from an
 * unreliable source (screenshot/wayback/domain-only) and may be wrong.
 *
 * Three ways to add a screenshot:
 *   1. Drag & drop a file
 *   2. Click to open file picker
 *   3. Paste from clipboard (Ctrl+V) — ideal for quick screen grabs
 *
 * Converts the image to base64 data URL and calls onUpload().
 */
export default function ScreenshotUploader({ onUpload, isUploading = false }) {
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  const rootRef = useRef(null)

  const MAX_SIZE = 6 * 1024 * 1024 // 6 MB

  const processFile = useCallback((file) => {
    setError('')
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Plik musi być obrazem (PNG, JPG, WebP).')
      return
    }
    if (file.size > MAX_SIZE) {
      setError(`Obraz za duży (max ${Math.round(MAX_SIZE / 1024 / 1024)} MB).`)
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target.result
      setPreview(dataUrl)
    }
    reader.onerror = () => setError('Nie udało się odczytać pliku.')
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) processFile(file)
  }

  const handleFileInput = (e) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  // Global paste handler — works when uploader is mounted
  useEffect(() => {
    const onPaste = (e) => {
      if (isUploading) return
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) {
            processFile(file)
            e.preventDefault()
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [processFile, isUploading])

  const handleSubmit = () => {
    if (!preview || isUploading) return
    onUpload(preview)
  }

  const reset = () => {
    setPreview(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (preview) {
    return (
      <div className="space-y-3">
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <img src={preview} alt="Podgląd screenshotu" className="w-full max-h-64 object-contain" />
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isUploading}
          className="btn-primary"
        >
          {isUploading ? 'Analizuję…' : 'Użyj tego screenshotu do researchu'}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={isUploading}
          className="w-full text-xs text-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-40 transition-colors"
        >
          Wybierz inny
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors
          ${dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50'}`}
      >
        <div className="flex justify-center mb-3">
          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
        </div>
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Przeciągnij i upuść screenshot
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          lub kliknij, żeby wybrać plik · możesz też wkleić (Ctrl+V)
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>
      {error && <div className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}
