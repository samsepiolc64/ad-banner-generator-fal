import { useState } from 'react'

const DIFF_FIELDS = [
  { key: 'name',        label: 'Nazwa marki',     get: b => b?.name },
  { key: 'primary',     label: 'Kolor główny',    get: b => b?.colors?.primary,    type: 'color' },
  { key: 'secondary',   label: 'Kolor dodatkowy', get: b => b?.colors?.secondary,  type: 'color' },
  { key: 'accent',      label: 'Akcent / CTA',    get: b => b?.colors?.accent,     type: 'color' },
  { key: 'industry',    label: 'Branża',           get: b => b?.industry },
  { key: 'productType', label: 'Co sprzedają',    get: b => b?.productType },
  { key: 'visualStyle', label: 'Styl wizualny',   get: b => b?.visualStyle },
  { key: 'tone',        label: 'Ton komunikacji', get: b => b?.tone },
  { key: 'usp',         label: 'USP / wyróżniki', get: b => b?.usp },
]

/**
 * Shared diff component used in BrandForm and ClientList.
 *
 * Shows fields where new value differs from old — left column: old value (read-only),
 * right column: new value (editable input, pre-filled from API result).
 * onAccept(editedBrand) receives the full new brand with user edits applied.
 * oldBrand and newBrand should both be in API format (colors.primary, visualStyle, etc.).
 */
export default function ResearchDiff({ oldBrand, newBrand, onAccept, onReject }) {
  const [vals, setVals] = useState(() => {
    const v = {}
    DIFF_FIELDS.forEach(f => { v[f.key] = f.get(newBrand) ?? '' })
    return v
  })

  const update = (key, val) => setVals(p => ({ ...p, [key]: val }))

  const changed = DIFF_FIELDS.filter(f => {
    const o = f.get(oldBrand)
    const n = f.get(newBrand)
    return n && o !== n
  })

  const handleAccept = () => {
    onAccept({
      ...newBrand,
      name: vals.name,
      colors: {
        ...(newBrand?.colors || {}),
        primary: vals.primary,
        secondary: vals.secondary,
        accent: vals.accent,
      },
      industry: vals.industry,
      productType: vals.productType,
      visualStyle: vals.visualStyle,
      tone: vals.tone,
      usp: vals.usp,
    })
  }

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-100 dark:border-blue-800/50">
        <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
          Research gotowy —{' '}
          {changed.length > 0
            ? `${changed.length} ${changed.length === 1 ? 'pole zmienione' : changed.length < 5 ? 'pola zmienione' : 'pól zmienionych'}`
            : 'brak zmian w kluczowych polach'}
        </span>
      </div>

      {changed.length > 0 && (
        <div className="bg-white dark:bg-gray-900">
          {/* Column headers */}
          <div className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1.4fr)] gap-0 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 dark:text-gray-500">Pole</span>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 dark:text-gray-500">Stare dane</span>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-blue-500 dark:text-blue-400">Nowe dane (edytowalne)</span>
          </div>

          <div className="divide-y divide-gray-50 dark:divide-gray-800/80">
            {changed.map(f => {
              const oldVal = f.get(oldBrand)
              return (
                <div key={f.key} className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1.4fr)] gap-0 px-4 py-2.5 items-center">
                  {/* Label */}
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 pr-2">{f.label}</span>

                  {/* Old value */}
                  <div className="pr-4">
                    {f.type === 'color' ? (
                      <span className="flex items-center gap-1.5">
                        {oldVal && (
                          <span
                            className="w-4 h-4 rounded-sm border border-gray-200 dark:border-gray-700 flex-shrink-0"
                            style={{ background: oldVal }}
                          />
                        )}
                        <span className="font-mono text-[11px] text-gray-400 dark:text-gray-500">{oldVal || '—'}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500 line-clamp-3 leading-relaxed">{oldVal || '—'}</span>
                    )}
                  </div>

                  {/* New value — editable */}
                  <div>
                    {f.type === 'color' ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="color"
                          value={vals[f.key] || '#000000'}
                          onChange={e => update(f.key, e.target.value)}
                          className="w-7 h-7 rounded cursor-pointer border border-gray-200 dark:border-gray-600 flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={vals[f.key] || ''}
                          onChange={e => update(f.key, e.target.value)}
                          className="w-24 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 transition-colors"
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={vals[f.key] || ''}
                        onChange={e => update(f.key, e.target.value)}
                        className="w-full text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 transition-colors"
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="px-4 py-2.5 border-t border-blue-100 dark:border-blue-800/50 flex items-center gap-2 bg-blue-50/50 dark:bg-blue-950/20">
        <button
          type="button"
          onClick={handleAccept}
          className="text-xs px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors"
        >
          Akceptuj zmiany
        </button>
        <button
          type="button"
          onClick={onReject}
          className="text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-400 transition-colors"
        >
          Odrzuć
        </button>
      </div>
    </div>
  )
}
