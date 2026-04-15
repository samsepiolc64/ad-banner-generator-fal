import { useState, useEffect } from 'react'

/**
 * Brand data form — auto-filled by Claude API domain research,
 * with manual fallback if the API is unavailable or fails.
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

  // Research state: 'idle' | 'researching' | 'done' | 'failed'
  const [researchState, setResearchState] = useState('idle')
  const [researchError, setResearchError] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [fetchedSite, setFetchedSite] = useState(false)

  // Run research automatically when domain is set
  useEffect(() => {
    if (!domain) return

    let cancelled = false
    const runResearch = async () => {
      setResearchState('researching')
      setResearchError(null)

      try {
        const res = await fetch('/.netlify/functions/research-domain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain }),
        })

        const data = await res.json()

        if (cancelled) return

        if (!res.ok) {
          // 501 = API key not configured; other codes = real errors
          setResearchState('failed')
          setResearchError(data.message || data.error || `HTTP ${res.status}`)
          return
        }

        // Auto-fill the form from Claude's response
        const b = data.brand || {}
        setBrand({
          name: b.name || '',
          primary: b.colors?.primary || '#000000',
          secondary: b.colors?.secondary || '#666666',
          accent: b.colors?.accent || '#E84C0E',
          style: b.style || 'minimalist, premium',
          photoStyle: b.photoStyle || 'lifestyle photography',
          typography: b.typography || 'modern sans-serif, bold headlines',
          audience: b.audience || '',
          usp: b.usp || '',
        })
        setLogoUrl(b.logoUrl || null)
        setFetchedSite(!!data.fetched)
        setResearchState('done')
      } catch (err) {
        if (cancelled) return
        setResearchState('failed')
        setResearchError(err.message)
      }
    }

    runResearch()
    return () => { cancelled = true }
  }, [domain])

  const update = (key, val) => setBrand((p) => ({ ...p, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!brand.name) return
    onSubmit({
      ...brand,
      domain,
      logoUrl,
      colors: { primary: brand.primary, secondary: brand.secondary, accent: brand.accent },
    })
  }

  // Loading state — research in progress
  if (researchState === 'researching') {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-gray-900 mb-4"></div>
        <div className="text-sm font-semibold text-gray-900">Analizuję markę {domain}...</div>
        <div className="text-xs text-gray-400 mt-1">Claude czyta stronę i wyciąga dane brandowe</div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {researchState === 'done' && fetchedSite && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 mb-4">
          ✅ <strong>Auto-research zakończony</strong> — Claude przeanalizował stronę <strong>{domain}</strong>. Możesz poprawić dane przed dalej.
        </div>
      )}

      {researchState === 'done' && !fetchedSite && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 mb-4">
          🔶 <strong>Strona niedostępna</strong> — nie udało się pobrać <strong>{domain}</strong>, ale Claude zgadnął dane na podstawie nazwy domeny. <strong>Sprawdź i popraw</strong> poniższe pola.
        </div>
      )}

      {researchState === 'failed' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4">
          ⚠️ <strong>Auto-research nieudany</strong> — {researchError}. Wypełnij dane marki ręcznie.
        </div>
      )}

      {researchState === 'idle' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4">
          💡 <strong>Tryb ręczny</strong> — wpisz dane marki poniżej.
        </div>
      )}

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
