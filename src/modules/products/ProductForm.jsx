import { useState } from 'react'
import { X } from 'lucide-react'

export default function ProductForm({ initial, onSubmit }) {
  const [tab, setTab] = useState('upload') // 'upload' | 'url'
  const [type, setType] = useState(initial?.type || '')

  // Upload tab state
  const [image, setImage] = useState(initial?.image || null)
  const [dragActive, setDragActive] = useState(false)

  // URL tab state
  const [urlDraft, setUrlDraft] = useState('')
  const [urlOk, setUrlOk] = useState(null) // null | true | false

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => setImage(e.target.result)
    reader.readAsDataURL(file)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const activeImage = tab === 'upload' ? image : (urlOk && urlDraft ? urlDraft : null)
  const canSubmit = !!activeImage

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ image: activeImage, type: type.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Zdjęcie produktu (referencja)
        </label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
          Model AI odwzoruje produkt ze zdjęcia — użyj czystego, dobrze oświetlonego ujęcia.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-3 w-fit">
          {[
            { id: 'upload', label: 'Wgraj plik' },
            { id: 'url',    label: 'Link URL'   },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                ${tab === id
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Upload tab */}
        {tab === 'upload' && (
          image ? (
            <div className="relative rounded-2xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
              <img src={image} alt="produkt" className="max-h-48 mx-auto rounded-xl" />
              <button
                type="button"
                onClick={() => setImage(null)}
                className="mt-3 text-xs text-gray-500 hover:text-red-500 transition-colors inline-flex items-center gap-1"
              >
                <X size={12} strokeWidth={2} aria-hidden /> Usuń zdjęcie
              </button>
            </div>
          ) : (
            <label
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              className={`block rounded-2xl border-2 border-dashed cursor-pointer p-8 text-center transition-colors
                ${dragActive
                  ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                  : 'border-gray-300 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500'}`}
            >
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Upuść zdjęcie lub kliknij</div>
              <div className="text-xs text-gray-400 mt-1">JPG, PNG, WEBP · max ~5MB</div>
            </label>
          )
        )}

        {/* URL tab */}
        {tab === 'url' && (
          <div className="space-y-3">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => { setUrlDraft(e.target.value); setUrlOk(null) }}
              placeholder="https://klient.pl/images/produkt.jpg"
              className="input"
            />
            {urlDraft && (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-900/40">
                <img
                  src={urlDraft}
                  alt="podgląd"
                  className="max-h-48 mx-auto p-3 rounded-xl"
                  onLoad={() => setUrlOk(true)}
                  onError={() => setUrlOk(false)}
                />
                {urlOk === false && (
                  <div className="px-4 pb-3 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0">
                      <path d="M8 2L14 13H2L8 2z"/><path d="M8 7v3M8 11.5v.5"/>
                    </svg>
                    Zdjęcie niedostępne — serwer może blokować zewnętrzny dostęp. Spróbuj wgrać plik.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Co to za produkt? <span className="font-normal text-gray-400">(opcjonalnie)</span>
        </label>
        <input
          type="text"
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="np. krem do twarzy, sofa, butelka perfum"
          className="input"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Pomaga AI dobrać właściwą kompozycję i kadrowanie.</p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary"
      >
        Dalej
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 12l4-4-4-4"/>
        </svg>
      </button>
    </form>
  )
}
