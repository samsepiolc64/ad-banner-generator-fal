import { useState } from 'react'

export default function ProductForm({ initial, onSubmit }) {
  const [name, setName] = useState(initial?.name || '')
  const [type, setType] = useState(initial?.type || '')
  const [image, setImage] = useState(initial?.image || null)
  const [dragActive, setDragActive] = useState(false)

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

  const canSubmit = !!image

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ image, name: name.trim(), type: type.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Zdjęcie produktu (referencja)
        </label>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          Model AI odwzoruje produkt ze zdjęcia — użyj czystego, dobrze oświetlonego ujęcia.
        </p>

        {image ? (
          <div className="relative rounded-2xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/40">
            <img src={image} alt="produkt" className="max-h-48 mx-auto rounded-xl" />
            <button
              type="button"
              onClick={() => setImage(null)}
              className="mt-3 text-xs text-gray-500 hover:text-red-500 transition-colors"
            >
              ✕ Usuń zdjęcie
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
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Nazwa produktu (opcjonalnie)
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Krem odżywczy NightRepair"
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            Typ / kategoria
          </label>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="np. krem do twarzy, sofa, butelka perfum"
            className="input"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold
                   hover:bg-gray-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed
                   transition-colors flex items-center justify-center gap-2"
      >
        Dalej
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 12l4-4-4-4"/>
        </svg>
      </button>
    </form>
  )
}
