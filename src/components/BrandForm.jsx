import { useState, useEffect, useCallback } from 'react'
import { loadResearch, saveResearch, clearResearch, formatAge } from '../lib/researchCache'

/**
 * Brand data form.
 *
 * Flow:
 *  1. On mount, check localStorage cache for this domain.
 *     - CACHE HIT → auto-fill form, show "💾 Dane z cache (X temu)"
 *                    + button "🔄 Odśwież research". NO auto-API call.
 *     - CACHE MISS → auto-run research immediately.
 *  2. Successful research is always saved to cache.
 *  3. If research response is HTML (gateway timeout) instead of JSON,
 *     we show a friendly error and let the user fill the form manually.
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

  // researchState: 'checking-cache' | 'cached' | 'researching' | 'done' | 'failed'
  const [researchState, setResearchState] = useState('checking-cache')
  const [researchError, setResearchError] = useState(null)
  const [logoUrl, setLogoUrl] = useState(null)
  const [fetchedSite, setFetchedSite] = useState(false)
  const [deepBrand, setDeepBrand] = useState({})
  const [cachedTimestamp, setCachedTimestamp] = useState(null)

  /** Apply a brand data object (from API or cache) to the form + deep brand state */
  const applyBrandData = useCallback((b, fromCache = false) => {
    setBrand({
      name: b.name || '',
      primary: b.colors?.primary || '#000000',
      secondary: b.colors?.secondary || '#666666',
      accent: b.colors?.accent || '#E84C0E',
      style: b.visualStyle || b.style || 'minimalist, premium',
      photoStyle: b.photoStyle || 'lifestyle photography',
      typography: b.typography || 'modern sans-serif, bold headlines',
      audience: b.audience || '',
      usp: b.usp || '',
    })
    setDeepBrand({
      industry: b.industry || '',
      productType: b.productType || '',
      visualStyle: b.visualStyle || '',
      visualMotifs: b.visualMotifs || '',
      tone: b.tone || '',
      exampleTaglines: b.exampleTaglines || [],
      brandPersonality: b.brandPersonality || '',
      competitors: b.competitors || [],
      competitorInsight: b.competitorInsight || '',
      differentiationDirective: b.differentiationDirective || '',
    })
    setLogoUrl(b.logoUrl || null)
  }, [])

  /** Run the Claude research API — with graceful HTML/JSON handling */
  const runResearch = useCallback(async (signal) => {
    setResearchState('researching')
    setResearchError(null)

    try {
      const res = await fetch('/.netlify/functions/research-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
        signal,
      })

      // CRITICAL: Netlify returns HTML (not JSON) on gateway timeouts / crashes.
      // Parse manually so we can show a clean message instead of "Unexpected token '<'".
      const rawText = await res.text()

      if (signal?.aborted) return

      let data
      try {
        data = JSON.parse(rawText)
      } catch {
        // Response wasn't JSON — probably an HTML error page from Netlify
        const isTimeout = /timeout|gateway|504|502/i.test(rawText)
        throw new Error(
          isTimeout
            ? 'Analiza trwała zbyt długo (timeout bramki). Spróbuj ponownie lub wypełnij ręcznie.'
            : `Serwer zwrócił odpowiedź w złym formacie (HTTP ${res.status}).`
        )
      }

      if (!res.ok) {
        setResearchState('failed')
        setResearchError(data.message || data.error || `HTTP ${res.status}`)
        return
      }

      const b = data.brand || {}
      applyBrandData(b, false)
      setFetchedSite(!!data.fetched)
      setResearchState('done')
      setCachedTimestamp(Date.now())

      // Save to cache so next visit is instant
      saveResearch(domain, b, !!data.fetched)
    } catch (err) {
      if (signal?.aborted) return
      setResearchState('failed')
      setResearchError(err.message)
    }
  }, [domain, applyBrandData])

  /** On domain change: check cache first, run research only if cache miss */
  useEffect(() => {
    if (!domain) return

    const controller = new AbortController()

    setResearchState('checking-cache')
    const cached = loadResearch(domain)

    if (cached) {
      // CACHE HIT — don't hit the API
      applyBrandData(cached.brand, true)
      setFetchedSite(cached.fetched)
      setCachedTimestamp(cached.timestamp)
      setResearchState('cached')
    } else {
      // CACHE MISS — run research automatically
      runResearch(controller.signal)
    }

    return () => controller.abort()
  }, [domain, applyBrandData, runResearch])

  /** Manual refresh — user clicked "Odśwież research" */
  const handleRefresh = () => {
    clearResearch(domain)
    setCachedTimestamp(null)
    runResearch()
  }

  const update = (key, val) => setBrand((p) => ({ ...p, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!brand.name) return
    onSubmit({
      ...brand,
      ...deepBrand,
      domain,
      logoUrl,
      colors: { primary: brand.primary, secondary: brand.secondary, accent: brand.accent },
    })
  }

  // --- RENDER ---

  // Loading state 1: checking cache (usually instant, but show briefly to avoid flash)
  if (researchState === 'checking-cache') {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 border-t-gray-900 mb-3"></div>
        <div className="text-sm text-gray-500">Sprawdzam cache...</div>
      </div>
    )
  }

  // Loading state 2: research in progress
  if (researchState === 'researching') {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-gray-900 mb-4"></div>
        <div className="text-sm font-semibold text-gray-900">Analizuję markę {domain}...</div>
        <div className="text-xs text-gray-400 mt-1">Claude czyta stronę i wyciąga dane brandowe</div>
        <div className="text-[10px] text-gray-300 mt-2">To może potrwać 15-40 sekund</div>
      </div>
    )
  }

  // Decide which top banner to show
  const renderBanner = () => {
    if (researchState === 'cached') {
      return (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-900 mb-4">
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">💾</span>
            <div className="flex-1">
              <div className="font-semibold mb-0.5">Dane z cache — {formatAge(cachedTimestamp)}</div>
              <div className="text-xs text-indigo-700 mb-2">
                Claude już kiedyś przeanalizował <strong>{domain}</strong>. Dane zostały automatycznie załadowane. Jeśli coś się zmieniło na stronie, odśwież research.
              </div>
              <button
                onClick={handleRefresh}
                className="text-xs bg-indigo-600 text-white rounded-md px-3 py-1.5 font-semibold hover:bg-indigo-700 transition-colors"
              >
                🔄 Odśwież research
              </button>
              {renderDeepBrandDetails()}
            </div>
          </div>
        </div>
      )
    }

    if (researchState === 'done' && fetchedSite) {
      return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 mb-4">
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">✅</span>
            <div className="flex-1">
              <div className="font-semibold mb-1.5">Research zakończony — Claude przeanalizował {domain}</div>
              {renderDeepBrandDetails()}
              <button
                onClick={handleRefresh}
                className="mt-2 text-xs text-green-700 hover:text-green-900 underline"
              >
                🔄 Odśwież research
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (researchState === 'done' && !fetchedSite) {
      return (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800 mb-4">
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">🔶</span>
            <div className="flex-1">
              <div className="font-semibold mb-0.5">Strona niedostępna</div>
              <div className="text-xs">
                Nie udało się pobrać <strong>{domain}</strong>, ale Claude zgadnął dane na podstawie nazwy domeny.{' '}
                <strong>Sprawdź i popraw</strong> pola poniżej.
              </div>
              <button
                onClick={handleRefresh}
                className="mt-2 text-xs text-orange-700 hover:text-orange-900 underline"
              >
                🔄 Spróbuj ponownie
              </button>
            </div>
          </div>
        </div>
      )
    }

    if (researchState === 'failed') {
      return (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4">
          <div className="flex items-start gap-2.5">
            <span className="text-lg leading-none mt-0.5">⚠️</span>
            <div className="flex-1">
              <div className="font-semibold mb-0.5">Auto-research nieudany</div>
              <div className="text-xs mb-2">{researchError} — Wypełnij dane marki ręcznie lub spróbuj ponownie.</div>
              <button
                onClick={handleRefresh}
                className="text-xs bg-yellow-600 text-white rounded-md px-3 py-1.5 font-semibold hover:bg-yellow-700 transition-colors"
              >
                🔄 Spróbuj ponownie
              </button>
            </div>
          </div>
        </div>
      )
    }

    return null
  }

  /** Reusable block showing the deep research details */
  const renderDeepBrandDetails = () => {
    const hasAny =
      deepBrand.industry ||
      deepBrand.productType ||
      deepBrand.visualMotifs ||
      deepBrand.tone ||
      deepBrand.brandPersonality ||
      deepBrand.exampleTaglines?.length ||
      deepBrand.competitors?.length ||
      deepBrand.competitorInsight

    if (!hasAny) return null

    return (
      <div className="mt-1.5 space-y-0.5">
        {deepBrand.industry && <div className="text-xs"><strong>Branża:</strong> {deepBrand.industry}</div>}
        {deepBrand.productType && <div className="text-xs"><strong>Sprzedaje:</strong> {deepBrand.productType}</div>}
        {deepBrand.visualMotifs && <div className="text-xs"><strong>Motywy wizualne:</strong> {deepBrand.visualMotifs}</div>}
        {deepBrand.tone && <div className="text-xs"><strong>Ton:</strong> {deepBrand.tone}</div>}
        {deepBrand.brandPersonality && <div className="text-xs"><strong>Osobowość:</strong> {deepBrand.brandPersonality}</div>}
        {deepBrand.exampleTaglines?.length > 0 && (
          <div className="text-xs"><strong>Hasła ze strony:</strong> {deepBrand.exampleTaglines.map((t) => `"${t}"`).join(', ')}</div>
        )}
        {deepBrand.competitors?.length > 0 && (
          <div className="text-xs"><strong>Konkurenci:</strong> {deepBrand.competitors.map((c) => c.name).join(', ')}</div>
        )}
        {deepBrand.competitorInsight && <div className="text-xs"><strong>Krajobraz konkurencji:</strong> {deepBrand.competitorInsight}</div>}
        {deepBrand.differentiationDirective && <div className="text-xs"><strong>Dyrektywa odróżnienia:</strong> {deepBrand.differentiationDirective}</div>}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {renderBanner()}

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
