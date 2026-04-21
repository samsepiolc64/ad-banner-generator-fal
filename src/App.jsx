import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import CampaignForm from './components/CampaignForm'
import BrandForm from './components/BrandForm'
import LogoUpload from './components/LogoUpload'
import GeneratorPanel from './components/GeneratorPanel'
import ClientList from './components/ClientList'
import Sidebar from './components/Sidebar'
import ModulePicker from './components/ModulePicker'
import ProductFlow from './modules/products/ProductFlow'
import { getModule } from './lib/clientModules'

function makeSessionFolder(moduleLabel) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`
  return moduleLabel ? `${stamp} — ${moduleLabel}` : stamp
}
import { ALL_FORMATS } from './lib/formats'
import { buildPrompt, VARIANT_MATRIX } from './lib/promptBuilder'
import { resolveModel } from './lib/modelRouting'
import { normalizeDomain } from './lib/domain'

const STEPS = { CAMPAIGN: 0, BRAND: 1, GENERATE: 2 }

const DEFAULT_HEADLINES = {
  'Awareness (Świadomość marki)': [
    'Poznaj świat, który zmienia zasady',
    'Stworzony dla tych, którzy widzą więcej',
    'Kiedy jakość mówi sama za siebie',
    'Doświadcz tego, co wyjątkowe',
    'Nowa definicja tego, co możliwe',
  ],
  'Consideration (Ruch / Zaangażowanie)': [
    'Sprawdź, co mamy dla Ciebie',
    'Odkryj możliwości, które czekają',
    'Wszystko, czego szukałeś — w jednym miejscu',
    'Zacznij swoją historię tutaj',
    'To może być właśnie to, czego potrzebujesz',
  ],
  'Conversion (Sprzedaż)': [
    'Twój następny krok — tutaj',
    'Oferta, na którą czekałeś',
    'Wybierz to, co najlepsze',
    'Czas na zmianę — zacznij dziś',
    'Jakość w zasięgu ręki',
  ],
  Retargeting: [
    'Wróć i dokończ historię',
    'Nadal tu na Ciebie czekamy',
    'Pamiętasz? To wciąż na Ciebie czeka',
    'Nie pozwól, by Ci umknęło',
    'Ostatnia szansa — nie czekaj',
  ],
}

const DEFAULT_CTAS = {
  'Awareness (Świadomość marki)': 'Poznaj nas',
  'Consideration (Ruch / Zaangażowanie)': 'Dowiedz się więcej',
  'Conversion (Sprzedaż)': 'Sprawdź ofertę',
  Retargeting: 'Wróć i skorzystaj',
}

const FLOW_STEPS = [
  { id: 0, label: 'Kampania',    sub: 'Kanały, formaty i cel kampanii' },
  { id: 1, label: 'Marka',       sub: 'Dane brandu i styl wizualny'    },
  { id: 2, label: 'Generowanie', sub: 'Logo, generowanie i pobieranie' },
]

function stepSummary(id, campaignData, brandData) {
  if (id === 0 && campaignData) {
    const fmtCount = campaignData.formats.length
    return `${campaignData.domain} · ${campaignData.goal} · ${fmtCount} format${fmtCount > 1 ? 'y' : ''}`
  }
  if (id === 1 && brandData) {
    const parts = [brandData.name, brandData.industry].filter(Boolean)
    return parts.join(' · ') || 'Dane marki'
  }
  return ''
}

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') !== 'light')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const [falMode, setFalMode] = useState('test')

  const [panelOpen, setPanelOpen] = useState(false)
  const [flowKey, setFlowKey] = useState(0)
  const [step, setStep] = useState(STEPS.CAMPAIGN)
  // maxStep — najwyższy krok jaki był aktywny; pozwala trzymać zawartość w DOM
  // podczas animacji zwijania (grid-rows). Resetuje się razem z flowKey.
  const [maxStep, setMaxStep] = useState(STEPS.CAMPAIGN)
  const [initialDomain, setInitialDomain] = useState('')
  const [initialBrandData, setInitialBrandData] = useState(null)
  const [initialOpiekun, setInitialOpiekun] = useState('')
  const [campaignData, setCampaignData] = useState(null)
  const [brandData, setBrandData] = useState(null)
  const [logoDataUrl, setLogoDataUrl] = useState(null)
  const [generatorFormats, setGeneratorFormats] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [copyGenStatus, setCopyGenStatus] = useState('idle')
  const [clients, setClients] = useState([])
  const [clientsLoading, setClientsLoading] = useState(true)
  const [selectedModule, setSelectedModule] = useState(null)

  useEffect(() => {
    fetch('/.netlify/functions/list-clients')
      .then((r) => r.json())
      .then((data) => setClients(data.clients || []))
      .catch(() => setClients([]))
      .finally(() => setClientsLoading(false))
  }, [])

  const existingDomains = clients.map((c) => normalizeDomain(c.domain))
  const isNewClientFlow = panelOpen && !initialDomain

  const handleSwitchToExisting = (normalized) => {
    const client = clients.find((c) => normalizeDomain(c.domain) === normalized)
    if (!client) return
    setInitialDomain(client.domain)
    setInitialBrandData(client.brand_data || null)
    setFlowKey((k) => k + 1)
    setStep(STEPS.CAMPAIGN)
  }

  const handleClientRefreshed = (domain, newBrandData) => {
    setClients((prev) => prev.map((c) => c.domain === domain ? { ...c, brand_data: newBrandData } : c))
  }

  const handleClientMetaUpdated = (domain, meta) => {
    setClients((prev) => prev.map((c) =>
      normalizeDomain(c.domain) === normalizeDomain(domain) ? { ...c, ...meta } : c
    ))
  }

  const handleClientDeleted = (domain) => {
    setClients((prev) => prev.filter((c) => c.domain !== domain))
  }

  const goHome = () => {
    setPanelOpen(false)
    setStep(STEPS.CAMPAIGN)
    setInitialDomain('')
    setInitialBrandData(null)
    setCampaignData(null)
    setBrandData(null)
    setLogoDataUrl(null)
    setGeneratorFormats([])
    setCopyGenStatus('idle')
    setSelectedModule(null)
  }

  const onNew = () => {
    setInitialDomain('')
    setInitialBrandData(null)
    setInitialOpiekun('')
    setSelectedModule(null)
    setFlowKey((k) => k + 1)
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
    setMaxStep(STEPS.CAMPAIGN)
  }

  const onStartFlow = (domain, brandData = null, moduleId = null, opiekun = '') => {
    setInitialDomain(domain)
    setInitialBrandData(brandData)
    setInitialOpiekun(opiekun || '')
    setSelectedModule(moduleId)
    setFlowKey((k) => k + 1)
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
    setMaxStep(STEPS.CAMPAIGN)
  }

  const handlePickModule = (moduleId) => {
    setSelectedModule(moduleId)
    setFlowKey((k) => k + 1)
    setStep(STEPS.CAMPAIGN)
  }

  const handleBackToPicker = () => {
    setSelectedModule(null)
    setStep(STEPS.CAMPAIGN)
    setCampaignData(null)
    setBrandData(null)
    setLogoDataUrl(null)
    setGeneratorFormats([])
    setCopyGenStatus('idle')
  }

  const handleCampaignSubmit = (data) => {
    setCampaignData(data)
    setBrandData(null)
    setGeneratorFormats([])
    setStep(STEPS.BRAND)
  }

  const handleBrandSubmit = async (brand) => {
    setIsLoading(true)
    setBrandData(brand)
    // Auto-select brand logo if research fetched one
    if (brand.logoDataUrl) setLogoDataUrl(brand.logoDataUrl)
    // Zapisz opiekuna i cel kampanii do Supabase (fire-and-forget)
    if (campaignData?.domain) {
      fetch('/.netlify/functions/update-client-meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: campaignData.domain,
          ...(campaignData.opiekun ? { opiekun: campaignData.opiekun } : {}),
          ...(campaignData.goal ? { cel_kampanii: campaignData.goal } : {}),
        }),
      }).catch(() => {})
    }

    setClients((prev) => {
      const normalized = normalizeDomain(campaignData.domain)
      const existingIdx = prev.findIndex((c) => normalizeDomain(c.domain) === normalized)
      const entry = { domain: campaignData.domain, brand_data: brand, updated_at: new Date().toISOString() }
      if (existingIdx >= 0) {
        const next = [...prev]
        next[existingIdx] = { ...next[existingIdx], ...entry }
        return next
      }
      return [...prev, entry]
    })

    const selectedFormats = ALL_FORMATS.filter((f) => campaignData.formats.includes(f.id))
    const variantCount = campaignData.variants || 2

    let headlines
    let cta

    if (campaignData.headlineType === 'custom' && campaignData.headline) {
      headlines = Array(variantCount).fill(campaignData.headline)
    } else {
      setCopyGenStatus('generating')
      try {
        const res = await fetch('/.netlify/functions/generate-copy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand,
            goal: campaignData.goal,
            channels: campaignData.channels,
            variantCount,
          }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const sorted = [...data.headlines].sort((a, b) => a.variantIndex - b.variantIndex)
        headlines = sorted.map((h) => h.headline)
        if (campaignData.ctaType !== 'custom' && data.cta) cta = data.cta
        setCopyGenStatus('done')
      } catch (err) {
        console.error('generate-copy failed, using fallback:', err)
        headlines = (DEFAULT_HEADLINES[campaignData.goal] || DEFAULT_HEADLINES['Conversion (Sprzedaż)']).slice(0, variantCount)
        setCopyGenStatus('fallback')
      }
    }

    if (campaignData.ctaType === 'custom' && campaignData.cta) {
      cta = campaignData.cta
    } else if (!cta) {
      cta = DEFAULT_CTAS[campaignData.goal] || 'Sprawdź ofertę'
    }

    let compInsight = null
    if (brand.competitorInsight || brand.differentiationDirective) {
      const parts = []
      if (brand.competitorInsight) parts.push(brand.competitorInsight)
      if (brand.competitors?.length) parts.push(`Direct competitors: ${brand.competitors.map((c) => c.name).join(', ')}.`)
      if (brand.differentiationDirective) parts.push(`Differentiation: ${brand.differentiationDirective}`)
      compInsight = parts.join(' ')
    }

    const allFormats = []
    for (const fmt of selectedFormats) {
      for (let v = 0; v < variantCount; v++) {
        const variantName = VARIANT_MATRIX[v % VARIANT_MATRIX.length].name
        const modelInfo = resolveModel(fmt)
        const prompt = buildPrompt({
          format: fmt,
          variantIndex: v,
          brand: { ...brand, campaignGoal: campaignData.goal },
          headline: headlines[v] || headlines[0],
          cta,
          compInsight,
          notes: campaignData.notes || null,
          modelInfo,
          campaignChannels: campaignData.channels,
        })
        allFormats.push({
          id: `${fmt.id}-v${v + 1}`,
          label: `${fmt.label} · V${v + 1} — ${variantName}`,
          width: fmt.width,
          height: fmt.height,
          ar: fmt.ar,
          channel: fmt.channel,
          prompt,
          headline: headlines[v] || headlines[0],
        })
      }
    }

    setGeneratorFormats(allFormats)
    setIsLoading(false)
    setStep(STEPS.GENERATE)
  }

  const handleLogoChange = useCallback((dataUrl) => {
    setLogoDataUrl(dataUrl)
  }, [])

  // Aktualizuj maxStep gdy step rośnie
  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step))
  }, [step])

  // Refs do kroków — używane do auto-scroll po zmianie aktywnego kroku
  const stepRefs = useRef([])
  useEffect(() => {
    if (!panelOpen) return
    const el = stepRefs.current[step]
    if (!el) return
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [step, panelOpen])

  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      <Sidebar
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        activeModule={selectedModule || 'banners'}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'ml-52' : 'ml-14'}`}>
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
          <div className="px-6 md:px-10 lg:px-16 py-4 flex justify-between items-center">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              Generator reklam
            </h1>

            {!panelOpen ? (
              <button
                type="button"
                onClick={onNew}
                className="flex items-center gap-1.5 bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition-colors dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-3.5 h-3.5 flex-shrink-0">
                  <path d="M8 2v12M2 8h12"/>
                </svg>
                Nowy klient
              </button>
            ) : (
              <button
                type="button"
                onClick={goHome}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors"
              >
                ✕ Anuluj
              </button>
            )}
          </div>
        </header>

        {/* Slide-down panel */}
        <div className={`grid transition-all duration-500 ease-in-out ${panelOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
          <div className="px-6 md:px-10 lg:px-16 py-8 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">

            {/* Module picker — pokazuje się przed wyborem modułu */}
            {!selectedModule && (
              <ModulePicker onPick={handlePickModule} initialDomain={initialDomain} />
            )}

            {selectedModule && (
              <div className="mb-5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <button
                    type="button"
                    onClick={handleBackToPicker}
                    className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex items-center gap-1"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <path d="M10 4l-4 4 4 4"/>
                    </svg>
                    Zmień typ
                  </button>
                  <span className="text-gray-300 dark:text-gray-700">·</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{getModule(selectedModule)?.label}</span>
                </div>
              </div>
            )}

            {selectedModule === 'products' && (
              <ProductFlow
                key={flowKey}
                domain={initialDomain}
                initialBrandData={initialBrandData}
                initialOpiekun={initialOpiekun}
                falMode={falMode}
                onFalModeChange={setFalMode}
                sessionFolder={makeSessionFolder('Grafiki produktowe')}
                existingDomains={existingDomains}
                isNewClient={isNewClientFlow}
                onClientResearched={(d, b) => {
                  setClients((prev) => {
                    const normalized = normalizeDomain(d)
                    const idx = prev.findIndex((c) => normalizeDomain(c.domain) === normalized)
                    const entry = { domain: d, brand_data: b, updated_at: new Date().toISOString() }
                    if (idx >= 0) { const next = [...prev]; next[idx] = { ...next[idx], ...entry }; return next }
                    return [...prev, entry]
                  })
                }}
              />
            )}

            {/* Flow — flat rows z dividerami, jak "Brand" w liście klientów */}
            {selectedModule === 'banners' && (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {FLOW_STEPS.map(({ id, label, sub }) => {
                const isActive = step === id
                const isDone   = step > id
                const isLocked = step < id

                return (
                  <div key={id} ref={el => stepRefs.current[id] = el} className={isLocked ? 'opacity-40' : ''}>

                    {/* Nagłówek kroku */}
                    <button
                      type="button"
                      onClick={() => isDone && setStep(id)}
                      className={`w-full flex items-center justify-between py-4 text-left transition-colors
                        ${isDone ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-900/50 -mx-1 px-1 rounded-xl' : 'cursor-default'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                          ${isDone
                            ? 'bg-green-500 text-white'
                            : isActive
                              ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                              : 'bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600'}`}
                        >
                          {isDone ? (
                            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                              <path d="M2 6l3 3 5-5"/>
                            </svg>
                          ) : (
                            id + 1
                          )}
                        </span>

                        <div className="min-w-0">
                          <div className={`font-bold
                            ${isActive ? 'text-gray-900 dark:text-white'
                            : isDone   ? 'text-gray-600 dark:text-gray-300'
                            :            'text-gray-400 dark:text-gray-600'}`}
                          >
                            {label}
                            <span className={`ml-2 font-normal text-sm
                              ${isActive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600'}`}>
                              {sub}
                            </span>
                          </div>
                          {isDone && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                              {stepSummary(id, campaignData, brandData)}
                            </div>
                          )}
                        </div>
                      </div>
                      {isDone && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">zmień</span>
                      )}
                    </button>

                    {/* Zawartość kroku — grid-rows animuje wysokość w obu kierunkach */}
                    {id <= maxStep && (
                      <div className={`grid transition-all duration-600 ease-in-out ${isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden min-h-0">
                      <div className="pb-6">
                        {id === STEPS.CAMPAIGN && (
                          <CampaignForm
                            key={flowKey}
                            onSubmit={handleCampaignSubmit}
                            isLoading={isLoading}
                            initialDomain={initialDomain}
                            initialOpiekun={initialOpiekun}
                            falMode={falMode}
                            onFalModeChange={setFalMode}
                            existingDomains={existingDomains}
                            isNewClient={isNewClientFlow}
                            onSwitchToExisting={handleSwitchToExisting}
                          />
                        )}

                        {id === STEPS.BRAND && (
                          <>
                            {isLoading && copyGenStatus === 'generating' && (
                              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300 mb-4 flex items-center gap-2">
                                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-300 border-t-blue-700 dark:border-blue-700 dark:border-t-blue-300"></div>
                                <span>Claude pisze hasła reklamowe dopasowane do marki i konkurencji...</span>
                              </div>
                            )}
                            <BrandForm
                              domain={campaignData?.domain}
                              onSubmit={handleBrandSubmit}
                              isLoading={isLoading}
                              initialBrand={initialBrandData}
                            />
                          </>
                        )}

                        {id === STEPS.GENERATE && (
                          <>
                            <LogoUpload onLogoChange={handleLogoChange} brandLogoDataUrl={brandData?.logoDataUrl} />
                            <GeneratorPanel
                              formats={generatorFormats}
                              logoDataUrl={logoDataUrl}
                              brandName={brandData?.name}
                              domain={campaignData?.domain}
                              notes={campaignData?.notes}
                              falMode={falMode}
                            />
                          </>
                        )}
                      </div>
                      </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            )}

          </div>
          </div>
        </div>

        {/* Client list */}
        <ClientList
          clients={clients}
          loading={clientsLoading}
          onNew={onNew}
          onStartFlow={onStartFlow}
          onRefreshed={handleClientRefreshed}
          onDeleted={handleClientDeleted}
          onMetaUpdated={handleClientMetaUpdated}
        />
      </div>
    </div>
  )
}
