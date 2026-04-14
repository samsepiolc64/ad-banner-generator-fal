import { useState } from 'react'

/**
 * Manual brand data form — used when Claude API is not available for auto-research.
 * When Claude API is connected, this form is auto-filled from domain research.
 */
export default function BrandForm({ domain, onSubmit, isLoading }) {
  const [brand, setBrand] = useState({
    name: '',
    primary: '#000000',
    secondary: '#666666',
    accent: '#E84C0E',
    style: 'minimalist, premium',
    photoStyle: 'lifestyle photography',
    typography: 'modern sans-serif, bold headlines',
    audience: '',
    usp: '',
  })

  const update = (key, val) => setBrand((p) => ({ ...p, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!brand.name) return
    onSubmit({
      ...brand,
      domain,
      colors: { primary: brand.primary, secondary: brand.secondary, accent: brand.accent },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4">
        💡 <strong>Tryb ręczny</strong> — wpisz dane marki poniżej. Po podłączeniu klucza Claude API
        ten formularz będzie wypełniany automatycznie na podstawie researchu domeny <strong>{domain}</strong>.
      </div>

      <Field label="Nazwa marki">
        <input
          type="text"
          value={brand.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="np. ACTIV/SPACE"
          className="input"
          required
        />
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Kolor główny">
          <div className="flex items-center gap-2">
            <input type="color" value={brand.primary} onChange={(e) => update('primary', e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            <input type="text" value={brand.primary} onChange={(e) => update('primary', e.target.value)} className="input flex-1 text-xs font-mono" />
          </div>
        </Field>
        <Field label="Kolor dodatkowy">
          <div className="flex items-center gap-2">
            <input type="color" value={brand.secondary} onChange={(e) => update('secondary', e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            <input type="text" value={brand.secondary} onChange={(e) => update('secondary', e.target.value)} className="input flex-1 text-xs font-mono" />
          </div>
        </Field>
        <Field label="Kolor akcentu (CTA)">
          <div className="flex items-center gap-2">
            <input type="color" value={brand.accent} onChange={(e) => update('accent', e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
            <input type="text" value={brand.accent} onChange={(e) => update('accent', e.target.value)} className="input flex-1 text-xs font-mono" />
          </div>
        </Field>
      </div>

      <Field label="Styl wizualny">
        <input type="text" value={brand.style} onChange={(e) => update('style', e.target.value)} placeholder="np. minimalist, premium, corporate" className="input" />
      </Field>

      <Field label="Styl fotografii">
        <input type="text" value={brand.photoStyle} onChange={(e) => update('photoStyle', e.target.value)} placeholder="np. lifestyle, product on white, flat" className="input" />
      </Field>

      <Field label="Typografia">
        <input type="text" value={brand.typography} onChange={(e) => update('typography', e.target.value)} placeholder="np. modern geometric sans-serif" className="input" />
      </Field>

      <Field label="Grupa docelowa (opcjonalnie)">
        <input type="text" value={brand.audience} onChange={(e) => update('audience', e.target.value)} placeholder="np. kobiety 25-45, premium segment" className="input" />
      </Field>

      <Field label="USP / wyróżniki (opcjonalnie)">
        <input type="text" value={brand.usp} onChange={(e) => update('usp', e.target.value)} placeholder="np. naturalne składniki, polska produkcja" className="input" />
      </Field>

      <button
        type="submit"
        disabled={!brand.name || isLoading}
        className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-base font-bold
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Generuję prompty...' : 'Dalej — generuj prompty'}
      </button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}
