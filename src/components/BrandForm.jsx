import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { loadResearch, saveResearch, clearResearch, formatAge } from '../lib/researchCache'
import ScreenshotUploader from './ScreenshotUploader'
import ResearchDiff from './ResearchDiff'

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
export default function BrandForm({ domain, onSubmit, isLoading, initialBrand = null }) {
  const [brand, setBrand] = useState(() => {
    const defaults = {
      name: '',
      primary: '#000000',
      secondary: '#666666',
      accent: '#E84C0E',
      style: 'minimalist, premium',
      photoStyle: 'lifestyle photography',
      typography: 'modern sans-serif, bold headlines',
      audience: '',
      usp: '',
    }
    if (!initialBrand?.name) return defaults
    return {
      ...defaults,
      name: initialBrand.name || defaults.name,
      primary: initialBrand.colors?.primary || initialBrand.primary || defaults.primary,
      secondary: initialBrand.colors?.secondary || initialBrand.secondary || defaults.secondary,
      accent: initialBrand.colors?.accent || initialBrand.accent || defaults.accent,
      style: initialBrand.visualStyle || initialBrand.style || defaults.style,
      photoStyle: initialBrand.photoStyle || defaults.photoStyle,
      typography: initialBrand.typography || defaults.typography,
      audience: initialBrand.audience || initialBrand.targetAudience || defaults.audience,
      usp: initialBrand.usp || defaults.usp,
    }
  })

  // researchState: 'checking-cache' | 'cached' | 'researching' | 'done' | 'failed' | 'prefilled'
  const [researchState, setResearchState] = useState(() =>
    initialBrand?.name ? 'prefilled' : 'checking-cache'
  )
  const [researchError, setResearchError] = useState(null)
  const [logoUrl, setLogoUrl] = useState(() => initialBrand?.logoUrl || null)
  const [logoDataUrl, setLogoDataUrl] = useState(() => initialBrand?.logoDataUrl || null)
  const [fetchedSite, setFetchedSite] = useState(false)
  const [screenshotUsed, setScreenshotUsed] = useState(false)
  // source: null | 'fresh' | 'wayback' | 'user-screenshot' | 'domain-only' | 'shared-cache'
  const [source, setSource] = useState(null)
  const [archiveTimestamp, setArchiveTimestamp] = useState(null)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [uploaderOpen, setUploaderOpen] = useState(false)
  const [deepBrand, setDeepBrand] = useState(() => {
    if (!initialBrand?.name) return {}
    return {
      industry: initialBrand.industry || '',
      productType: initialBrand.productType || '',
      visualStyle: initialBrand.visualStyle || '',
      visualMotifs: initialBrand.visualMotifs || '',
      tone: initialBrand.tone || '',
      exampleTaglines: initialBrand.exampleTaglines || [],
      brandPersonality: initialBrand.brandPersonality || '',
      competitors: initialBrand.competitors || [],
      competitorInsight: initialBrand.competitorInsight || '',
      differentiationDirective: initialBrand.differentiationDirective || '',
    }
  })
  const [cachedTimestamp, setCachedTimestamp] = useState(null)
  // 'local' (from this browser's localStorage), 'shared' (from Supabase), 'fresh' (just researched)
  const [cacheSource, setCacheSource] = useState(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [visualOpen, setVisualOpen] = useState(false)
  // pendingBrand: holds new research result waiting for user acceptance (manual refresh only)
  const [pendingBrand, setPendingBrand] = useState(null)
  const captureOnlyRef = useRef(false)
  // Snapshot of form state in API format at the moment refresh was triggered
  const oldBrandSnapshotRef = useRef(null)

  // Research progress stepper — advances through realistic timing estimates.
  // Past steps use a neutral gray dash (not green) — we don't know which ones
  // actually succeeded until the API responds. Green is only used post-success.
  const [researchStep, setResearchStep] = useState(0)
  const RESEARCH_STEPS = [
    { label: 'Pobieranie strony', detail: 'bezpośredni fetch HTML',              source: 'fresh',      after: 0     },
    { label: 'Jina Reader',       detail: 'bypass Cloudflare, headless fetch',   source: 'jina',       after: 7000  },
    { label: 'Screenshotone',     detail: 'headless browser screenshot',         source: 'screenshot', after: 13000 },
    { label: 'Wayback Machine',   detail: 'archiwalna wersja (archive.org)',      source: 'wayback',    after: 18000 },
    { label: 'Claude analizuje',  detail: 'wyciąganie danych brandowych',        source: null,         after: 22000 },
  ]
  useEffect(() => {
    if (researchState !== 'researching') { setResearchStep(0); return }
    const timers = RESEARCH_STEPS
      .map((step, i) => i > 0 ? setTimeout(() => setResearchStep(i), step.after) : null)
      .filter(Boolean)
    return () => timers.forEach(clearTimeout)
  }, [researchState]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setLogoDataUrl(b.logoDataUrl || null)
  }, [])

  /**
   * Run the Claude research API — with graceful HTML/JSON handling.
   * @param {AbortSignal} [signal]
   * @param {boolean} [force] — if true, bypasses Supabase L2 cache (for refresh button)
   * @param {string|null} [userScreenshot] — base64 data URL of user-uploaded screenshot
   * When captureOnlyRef.current is true (manual refresh), the result is stored in
   * pendingBrand instead of being applied to the form immediately — user sees diff first.
   */
  const runResearch = useCallback(async (signal, force = false, userScreenshot = null) => {
    setResearchState('researching')
    setResearchError(null)

    try {
      const res = await fetch('/.netlify/functions/research-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, force, userScreenshot }),
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

      if (captureOnlyRef.current) {
        // Manual refresh: hold data for user review before overwriting the form
        setPendingBrand(b)
      } else {
        applyBrandData(b, false)
      }

      setFetchedSite(!!data.fetched)
      setScreenshotUsed(!!data.screenshotUsed)
      setSource(data.source || null)
      setArchiveTimestamp(data.archiveTimestamp || null)
      setResearchState('done')

      // Track where this came from (server-side shared cache vs. fresh Claude call)
      if (data.source === 'shared-cache') {
        setCacheSource('shared')
        setCachedTimestamp(data.cachedAt ? new Date(data.cachedAt).getTime() : Date.now())
      } else {
        setCacheSource('fresh')
        setCachedTimestamp(Date.now())
      }

      // Always save to L1 (localStorage) so next visit on this browser is instant
      saveResearch(domain, b, !!data.fetched)
    } catch (err) {
      if (signal?.aborted) return
      setResearchState('failed')
      setResearchError(err.message)
    } finally {
      captureOnlyRef.current = false
    }
  }, [domain, applyBrandData])

  /** Pre-fill from client DB brand_data when initialBrand is provided */
  useEffect(() => {
    if (!initialBrand || !initialBrand.name) return

    setBrand((prev) => ({
      ...prev,
      ...{
        name: initialBrand.name || prev.name,
        primary: initialBrand.colors?.primary || initialBrand.primary || prev.primary,
        secondary: initialBrand.colors?.secondary || initialBrand.secondary || prev.secondary,
        accent: initialBrand.colors?.accent || initialBrand.accent || prev.accent,
        style: initialBrand.visualStyle || initialBrand.style || prev.style,
        photoStyle: initialBrand.photoStyle || prev.photoStyle,
        typography: initialBrand.typography || prev.typography,
        audience: initialBrand.audience || initialBrand.targetAudience || prev.audience,
        usp: initialBrand.usp || prev.usp,
      },
      colors: { ...prev.colors, ...(initialBrand.colors || {}) },
    }))
    setDeepBrand({
      industry: initialBrand.industry || '',
      productType: initialBrand.productType || '',
      visualStyle: initialBrand.visualStyle || '',
      visualMotifs: initialBrand.visualMotifs || '',
      tone: initialBrand.tone || '',
      exampleTaglines: initialBrand.exampleTaglines || [],
      brandPersonality: initialBrand.brandPersonality || '',
      competitors: initialBrand.competitors || [],
      competitorInsight: initialBrand.competitorInsight || '',
      differentiationDirective: initialBrand.differentiationDirective || '',
    })
    if (initialBrand.logoUrl) setLogoUrl(initialBrand.logoUrl)
    if (initialBrand.logoDataUrl) setLogoDataUrl(initialBrand.logoDataUrl)
    setResearchState('prefilled')
  }, [initialBrand])

  /** On domain change: check cache first, run research only if cache miss */
  useEffect(() => {
    if (!domain) return

    // Skip auto-research if we already have pre-filled data from the client DB
    if (initialBrand?.name) return

    const controller = new AbortController()

    setResearchState('checking-cache')
    const cached = loadResearch(domain)

    if (cached) {
      // L1 CACHE HIT (this browser's localStorage) — don't hit the API
      applyBrandData(cached.brand, true)
      setFetchedSite(cached.fetched)
      setCachedTimestamp(cached.timestamp)
      setCacheSource('local')
      setResearchState('cached')
    } else {
      // L1 MISS — run research (server may still hit L2 Supabase cache)
      runResearch(controller.signal)
    }

    return () => controller.abort()
  }, [domain, applyBrandData, runResearch, initialBrand])

  /** Snapshot current form into API-compatible format (for diff comparison) */
  const snapshotCurrentBrand = () => ({
    name: brand.name,
    colors: { primary: brand.primary, secondary: brand.secondary, accent: brand.accent },
    industry: deepBrand.industry,
    productType: deepBrand.productType,
    visualStyle: brand.style,
    tone: deepBrand.tone,
    usp: brand.usp,
  })

  /** Manual refresh — user clicked "Odśwież research". Bypasses BOTH caches. */
  const handleRefresh = () => {
    oldBrandSnapshotRef.current = snapshotCurrentBrand()
    clearResearch(domain)
    setCachedTimestamp(null)
    setCacheSource(null)
    setSource(null)
    setArchiveTimestamp(null)
    setPendingBrand(null)
    captureOnlyRef.current = true
    runResearch(undefined, true)
  }

  /** User uploaded their own screenshot — run research again with that image */
  const handleUserScreenshotUpload = async (dataUrl) => {
    oldBrandSnapshotRef.current = snapshotCurrentBrand()
    clearResearch(domain)
    setCachedTimestamp(null)
    setCacheSource(null)
    setSource(null)
    setArchiveTimestamp(null)
    setPendingBrand(null)
    captureOnlyRef.current = true
    setUploadingScreenshot(true)
    try {
      await runResearch(undefined, true, dataUrl)
    } finally {
      setUploadingScreenshot(false)
      captureOnlyRef.current = false
    }
  }

  /** Parse Wayback YYYYMMDDhhmmss timestamp to human date */
  const formatArchiveDate = (ts) => {
    if (!ts || ts.length < 8) return null
    return `${ts.slice(6, 8)}.${ts.slice(4, 6)}.${ts.slice(0, 4)}`
  }

  // Show the screenshot uploader only when research came from unreliable source
  const isUnreliableSource = ['wayback', 'domain-only'].includes(source)

  const update = (key, val) => setBrand((p) => ({ ...p, [key]: val }))

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!brand.name) return
    onSubmit({
      ...brand,
      ...deepBrand,
      domain,
      logoUrl,
      logoDataUrl,
      colors: { primary: brand.primary, secondary: brand.secondary, accent: brand.accent },
    })
  }

  // --- RENDER ---

  // Loading state 1: checking cache (usually instant, but show briefly to avoid flash)
  if (researchState === 'checking-cache') {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white mb-3"></div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Sprawdzam cache...</div>
      </div>
    )
  }

  // Loading state 2: research in progress
  if (researchState === 'researching') {
    return (
      <div className="py-10 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white mb-4"></div>
        <div className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Analizuję markę {domain}…</div>

        {/* Step-by-step progress */}
        <div className="mt-4 inline-flex flex-col gap-2 text-left">
          {RESEARCH_STEPS.map((step, i) => {
            const isPast    = i < researchStep
            const isActive  = i === researchStep
            const isPending = i > researchStep
            return (
              <div key={i} className={`flex items-start gap-2.5 text-xs transition-opacity duration-500 ${isPending ? 'opacity-30' : 'opacity-100'}`}>
                {/* Icon — gray dash for past (not green, we don't know outcome yet) */}
                <span className="mt-0.5 w-4 flex-shrink-0 flex justify-center">
                  {isPast ? (
                    <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M4 8h8"/>
                    </svg>
                  ) : isActive ? (
                    <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 animate-spin" />
                  ) : (
                    <span className="inline-block w-2 h-2 mt-0.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  )}
                </span>
                {/* Label */}
                <span className={`font-medium ${isPast ? 'text-gray-400 dark:text-gray-500' : isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}`}>
                  {step.label}
                </span>
                {/* Detail — only for active step */}
                {isActive && (
                  <span className="text-gray-400 dark:text-gray-500">— {step.detail}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // Decide which top banner to show
  const renderBanner = () => {
    const configs = {
      prefilled: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">
            <rect x="2" y="3" width="12" height="10" rx="1.5"/>
            <path d="M5 7h6M5 10h4"/>
          </svg>
        ),
        title: `Dane marki z bazy — ${domain}`,
        body: 'Formularz wypełniony z Twojej bazy klientów. Sprawdź i popraw jeśli coś się zmieniło.',
        btnLabel: 'Odśwież research',
        showDetails: false,
      },
      cached: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 5v3.5l2 1.5"/>
          </svg>
        ),
        title: `Cache lokalny — ${formatAge(cachedTimestamp)}`,
        body: `Dane ${domain} załadowane z pamięci przeglądarki. Odśwież jeśli strona klienta się zmieniła.`,
        btnLabel: 'Odśwież research',
        showDetails: true,
      },
      shared: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">
            <path d="M13 10.5c0 1.1-.9 2-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1"/>
            <path d="M10 3.5 8 1.5 6 3.5M8 1.5v7"/>
          </svg>
        ),
        title: `Cache współdzielony — ${formatAge(cachedTimestamp)}`,
        body: `Dane ${domain} pobrane z bazy Supabase (zero kosztu Claude API). Odśwież dla świeższych danych.`,
        btnLabel: 'Odśwież research',
        showDetails: true,
      },
      done_ok: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M5.5 8l2 2 3-3"/>
          </svg>
        ),
        title: `Research gotowy — ${domain}`,
        body: null,
        btnLabel: 'Odśwież research',
        showDetails: true,
      },
      done_wayback: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M8 5v3l2 1.5"/>
          </svg>
        ),
        title: `Research z archiwum (Wayback Machine)`,
        body: archiveTimestamp
          ? `Strona zablokowała pobieranie, więc Claude użył historycznego snapshota z ${formatArchiveDate(archiveTimestamp) || 'archiwum'}. Dane brandowe (kolory, fonty) zwykle są stabilne, ale oferta/hasła mogły się zmienić. Jeśli coś wygląda nie tak — wgraj świeży screenshot poniżej.`
          : `Strona zablokowała pobieranie, więc Claude użył historycznego snapshota z archiwum internetu. Dane brandowe zwykle są stabilne, ale warto zweryfikować.`,
        btnLabel: 'Spróbuj ponownie',
        showDetails: true,
      },
      done_user_screenshot: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5">
            <rect x="1" y="3" width="14" height="10" rx="1.5"/>
            <circle cx="8" cy="8" r="2.5"/>
            <path d="M5.5 3.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5"/>
          </svg>
        ),
        title: `Analiza z Twojego screenshotu — ${domain}`,
        body: `Claude przeanalizował zrzut ekranu, który wgrałeś. Jeśli screenshot pokazywał prawdziwą stronę, dane poniżej powinny być dokładne.`,
        btnLabel: 'Odśwież research',
        showDetails: true,
      },
      done_nosite: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5">
            <path d="M8 2L14 13H2L8 2z"/>
            <path d="M8 7v3M8 11.5v.5"/>
          </svg>
        ),
        title: 'Strona niedostępna',
        body: `Nie udało się pobrać ${domain} ani odnaleźć archiwalnej wersji — Claude wygenerował dane na podstawie samej nazwy domeny. Sprawdź i popraw pola poniżej, lub wgraj własny screenshot.`,
        btnLabel: 'Spróbuj ponownie',
        showDetails: false,
      },
      failed: {
        icon: (
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5">
            <circle cx="8" cy="8" r="6"/>
            <path d="M5.5 5.5l5 5M10.5 5.5l-5 5"/>
          </svg>
        ),
        title: 'Auto-research nieudany',
        body: `${researchError} — Wypełnij dane marki ręcznie lub spróbuj ponownie.`,
        btnLabel: 'Spróbuj ponownie',
        showDetails: false,
      },
    }

    let key = null
    if (researchState === 'prefilled')                                   key = 'prefilled'
    else if (researchState === 'cached')                                 key = 'cached'
    else if (researchState === 'done' && cacheSource === 'shared')       key = 'shared'
    else if (researchState === 'done' && source === 'user-screenshot')   key = 'done_user_screenshot'
    else if (researchState === 'done' && source === 'wayback')           key = 'done_wayback'
    else if (researchState === 'done' && source === 'domain-only')       key = 'done_nosite'
    else if (researchState === 'done' && fetchedSite)                    key = 'done_ok'
    else if (researchState === 'done' && !fetchedSite)                   key = 'done_nosite'
    else if (researchState === 'failed')                                 key = 'failed'

    if (!key) return null
    const c = configs[key]

    return (
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-4">
        <div className="flex items-start gap-2.5">
          {c.icon}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">{c.title}</div>
              {logoDataUrl && (
                <div className="flex-shrink-0 w-7 h-7 rounded bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center p-0.5 overflow-hidden" title="Logo pobrane ze strony">
                  <img src={logoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" />
                </div>
              )}
            </div>
            {c.body && <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{c.body}</div>}
            {c.showDetails && renderDeepBrandDetails()}
            <button
              onClick={handleRefresh}
              className="mt-2 inline-flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-xl px-3 py-1.5 font-medium hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
            >
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M12 7A5 5 0 1 1 9 2.6"/>
                <path d="M9 1v3h3"/>
              </svg>
              {c.btnLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  /** Reusable block showing the deep research details */
  const renderDeepBrandDetails = () => {
    const primary = [
      deepBrand.industry && { label: 'BRANŻA', val: deepBrand.industry },
      deepBrand.tone && { label: 'TON', val: deepBrand.tone },
      deepBrand.competitors?.length && {
        label: 'KONKURENCI',
        val: deepBrand.competitors.map(c => c.name || c.domain).join(', '),
      },
    ].filter(Boolean)

    const secondary = [
      deepBrand.productType && { label: 'SPRZEDAJE', val: deepBrand.productType },
      deepBrand.visualMotifs && { label: 'MOTYWY', val: deepBrand.visualMotifs },
      deepBrand.brandPersonality && { label: 'OSOBOWOŚĆ', val: deepBrand.brandPersonality },
      deepBrand.exampleTaglines?.length && {
        label: 'HASŁA',
        val: deepBrand.exampleTaglines.map(t => `"${t}"`).join(', '),
      },
      deepBrand.competitorInsight && { label: 'KRAJOBRAZ', val: deepBrand.competitorInsight },
      deepBrand.differentiationDirective && { label: 'ODRÓŻNIENIE', val: deepBrand.differentiationDirective },
    ].filter(Boolean)

    if (!primary.length && !secondary.length) return null

    const Row = ({ label, val }) => (
      <div className="text-xs leading-relaxed">
        <span className="text-gray-400 dark:text-gray-500 uppercase tracking-wide text-[10px] font-semibold mr-1.5">{label}</span>
        <span className="text-gray-600 dark:text-gray-400 line-clamp-2">{val}</span>
      </div>
    )

    return (
      <div className="mt-2 space-y-1.5">
        {primary.map(r => <Row key={r.label} {...r} />)}
        {secondary.length > 0 && (
          <>
            {detailsOpen && secondary.map(r => <Row key={r.label} {...r} />)}
            <button
              type="button"
              onClick={() => setDetailsOpen(v => !v)}
              className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors mt-0.5 inline-flex items-center gap-1"
            >
              {detailsOpen ? <><ChevronUp size={10} strokeWidth={2} aria-hidden /> Zwiń szczegóły</> : <><ChevronDown size={10} strokeWidth={2} aria-hidden /> Pokaż szczegóły ({secondary.length})</>}
            </button>
          </>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {renderBanner()}

      {pendingBrand && researchState !== 'researching' && (
        <ResearchDiff
          key={JSON.stringify(pendingBrand).slice(0, 40)}
          oldBrand={oldBrandSnapshotRef.current}
          newBrand={pendingBrand}
          onAccept={(editedBrand) => {
            applyBrandData(editedBrand)
            captureOnlyRef.current = false
            setPendingBrand(null)
          }}
          onReject={() => { captureOnlyRef.current = false; setPendingBrand(null) }}
        />
      )}

      {/* Uploader — zawsze dostępny, ale różnie eksponowany */}
      {isUnreliableSource ? (
        // Niepewne źródło: żółty panel, uploader widoczny od razu
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl p-4 -mt-2">
          <div className="flex items-start gap-2.5 mb-3">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5">
              <rect x="1" y="3" width="14" height="10" rx="1.5"/>
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M5.5 3.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5"/>
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-0.5">
                Masz lepszy screenshot?
              </div>
              <div className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Jeśli powyższe dane nie pasują do rzeczywistej strony klienta, zrób ręcznie zrzut ekranu i wgraj go — Claude przeanalizuje go jeszcze raz.
              </div>
            </div>
          </div>
          <ScreenshotUploader
            onUpload={handleUserScreenshotUpload}
            isUploading={uploadingScreenshot}
          />
        </div>
      ) : (
        // Pewne źródło: dyskretny collapsible — gdyby user i tak chciał użyć własnego screenshota
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden -mt-2">
          <button
            type="button"
            onClick={() => setUploaderOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <rect x="1" y="3" width="14" height="10" rx="1.5"/>
                <circle cx="8" cy="8" r="2.5"/>
                <path d="M5.5 3.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.5"/>
              </svg>
              Dane nie pasują? Wgraj własny screenshot
            </span>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 transition-transform ${uploaderOpen ? 'rotate-180' : ''}`}>
              <path d="M2 4l4 4 4-4"/>
            </svg>
          </button>
          {uploaderOpen && (
            <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/50">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Zrób ręcznie zrzut ekranu strony klienta (np. kluczowej podstrony produktowej) — Claude przeanalizuje go i nadpisze aktualne dane.
              </div>
              <ScreenshotUploader
                onUpload={handleUserScreenshotUpload}
                isUploading={uploadingScreenshot}
              />
            </div>
          )}
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

      {/* Dane wizualne — zwinięte domyślnie */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setVisualOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <span className="font-medium">Dane wizualne</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
            {visualOpen ? 'Zwiń' : 'Edytuj'}
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`w-3 h-3 transition-transform ${visualOpen ? 'rotate-180' : ''}`}>
              <path d="M2 4l4 4 4-4"/>
            </svg>
          </span>
        </button>
        {visualOpen && (
          <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100 dark:border-gray-700/50">
            <Field label="Styl wizualny">
              <input type="text" value={brand.style} onChange={(e) => update('style', e.target.value)} placeholder="np. minimalist, premium, corporate" className="input" />
            </Field>
            <Field label="Styl fotografii">
              <input type="text" value={brand.photoStyle} onChange={(e) => update('photoStyle', e.target.value)} placeholder="np. lifestyle, product on white, flat" className="input" />
            </Field>
            <Field label="Typografia">
              <input type="text" value={brand.typography} onChange={(e) => update('typography', e.target.value)} placeholder="np. modern geometric sans-serif" className="input" />
            </Field>
            <Field label="Grupa docelowa">
              <input type="text" value={brand.audience} onChange={(e) => update('audience', e.target.value)} placeholder="np. kobiety 25-45, premium segment" className="input" />
            </Field>
            <Field label="USP / wyróżniki">
              <input type="text" value={brand.usp} onChange={(e) => update('usp', e.target.value)} placeholder="np. naturalne składniki, polska produkcja" className="input" />
            </Field>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={!brand.name || isLoading}
        className="btn-primary"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
            </svg>
            Chwila…
          </>
        ) : (
          <>
            Dalej
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M6 12l4-4-4-4"/>
            </svg>
          </>
        )}
      </button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  )
}
