import { useState, useCallback, useEffect } from 'react'
import CampaignForm from './components/CampaignForm'
import BrandForm from './components/BrandForm'
import LogoUpload from './components/LogoUpload'
import GeneratorPanel from './components/GeneratorPanel'
import ClientList from './components/ClientList'
import Sidebar from './components/Sidebar'
import { ALL_FORMATS } from './lib/formats'
import { buildPrompt, VARIANT_MATRIX } from './lib/promptBuilder'
import { resolveModel } from './lib/modelRouting'

const STEPS = { CAMPAIGN: 0, BRAND: 1, GENERATE: 2 }

const DEFAULT_HEADLINES = {
  'Awareness (Świadomość marki)': [
    'Poznaj świat, który zmienia zasady',
    'Stworzony dla tych, którzy widzą więcej',
    'Kiedy jakość mówi sama za siebie',
    'Doświadcz tego, co wyjątkowe',
    'Nowa definicja tego, co możliwe',
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
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const [falMode, setFalMode] = useState('test')

  const [panelOpen, setPanelOpen] = useState(false)
  const [flowKey, setFlowKey] = useState(0)
  const [step, setStep] = useState(STEPS.CAMPAIGN)
  const [initialDomain, setInitialDomain] = useState('')
  const [initialBrandData, setInitialBrandData] = useState(null)
  const [campaignData, setCampaignData] = useState(null)
  const [brandData, setBrandData] = useState(null)
  const [logoDataUrl, setLogoDataUrl] = useState(null)
  const [generatorFormats, setGeneratorFormats] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [copyGenStatus, setCopyGenStatus] = useState('idle')

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
  }

  const onNew = () => {
    setInitialDomain('')
    setInitialBrandData(null)
    setFlowKey((k) => k + 1)
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
  }

  const onStartFlow = (domain, brandData = null) => {
    setInitialDomain(domain)
    setInitialBrandData(brandData)
    setFlowKey((k) => k + 1)
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
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

  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      <Sidebar
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        activeModule="banners"
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      <div className={`flex-1 min-w-0 transition-all duration-300 ${sidebarOpen ? 'ml-52' : 'ml-14'}`}>
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
          <div className="px-6 md:px-10 lg:px-16 py-4 flex justify-between items-center">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
              Generator banerów
            </h1>

            {!panelOpen ? (
              <button
                type="button"
                onClick={onNew}
                className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-semibold hover:bg-gray-700 transition-colors dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
              >
                ＋ Nowy klient
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
        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${panelOpen ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-6 md:px-10 lg:px-16 py-8 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">

            {/* Flow — flat rows z dividerami, jak "Brand" w liście klientów */}
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {FLOW_STEPS.map(({ id, label, sub }) => {
                const isActive = step === id
                const isDone   = step > id
                const isLocked = step < id

                return (
                  <div key={id} className={isLocked ? 'opacity-40' : ''}>

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

                    {/* Zawartość kroku */}
                    {isActive && (
                      <div className="pb-6">
                        {id === STEPS.CAMPAIGN && (
                          <CampaignForm
                            key={flowKey}
                            onSubmit={handleCampaignSubmit}
                            isLoading={isLoading}
                            initialDomain={initialDomain}
                            falMode={falMode}
                            onFalModeChange={setFalMode}
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
                            <LogoUpload onLogoChange={handleLogoChange} />
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
                    )}
                  </div>
                )
              })}
            </div>

          </div>
        </div>

        {/* Client list */}
        <ClientList onNew={onNew} onStartFlow={onStartFlow} />
      </div>
    </div>
  )
}
