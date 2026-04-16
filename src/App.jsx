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

export default function App() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('theme') === 'dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const [panelOpen, setPanelOpen] = useState(false)
  const [step, setStep] = useState(STEPS.CAMPAIGN)
  const [initialDomain, setInitialDomain] = useState('')
  const [campaignData, setCampaignData] = useState(null)
  const [brandData, setBrandData] = useState(null)
  const [logoDataUrl, setLogoDataUrl] = useState(null)
  const [generatorFormats, setGeneratorFormats] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [copyGenStatus, setCopyGenStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'fallback'

  const goHome = () => {
    setPanelOpen(false)
    setStep(STEPS.CAMPAIGN)
    setInitialDomain('')
    setCampaignData(null)
    setBrandData(null)
    setLogoDataUrl(null)
    setGeneratorFormats([])
    setCopyGenStatus('idle')
  }

  const onNew = () => {
    setInitialDomain('')
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
  }

  const onStartFlow = (domain) => {
    setInitialDomain(domain)
    setPanelOpen(true)
    setStep(STEPS.CAMPAIGN)
  }

  const handleCampaignSubmit = (data) => {
    setCampaignData(data)
    setStep(STEPS.BRAND)
  }

  const handleBrandSubmit = async (brand) => {
    setIsLoading(true)
    setBrandData(brand)

    const selectedFormats = ALL_FORMATS.filter((f) => campaignData.formats.includes(f.id))
    const variantCount = campaignData.variants || 2

    // --- STEP 1: Determine headlines ---
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

        if (campaignData.ctaType !== 'custom' && data.cta) {
          cta = data.cta
        }

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

    // --- STEP 2: Build competitor context ---
    let compInsight = null
    if (brand.competitorInsight || brand.differentiationDirective) {
      const parts = []
      if (brand.competitorInsight) parts.push(brand.competitorInsight)
      if (brand.competitors?.length) {
        parts.push(`Direct competitors: ${brand.competitors.map((c) => c.name).join(', ')}.`)
      }
      if (brand.differentiationDirective) parts.push(`Differentiation: ${brand.differentiationDirective}`)
      compInsight = parts.join(' ')
    }

    // --- STEP 3: Build all format × variant combinations ---
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

  const goBack = () => {
    if (step > 0) setStep(step - 1)
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-950">
      <Sidebar
        darkMode={darkMode}
        onToggleDark={() => setDarkMode((d) => !d)}
        activeModule="banners"
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

      <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'ml-52' : 'ml-14'}`}>
        {/* Header — sticky, full width */}
        <header className="sticky top-0 z-10 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800">
          <div className="px-6 md:px-10 lg:px-16 py-4 flex justify-between items-center">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">Banner Generator</h1>
            </div>

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
        <div className={`overflow-hidden transition-all duration-500 ease-in-out ${panelOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-6 md:px-10 lg:px-16 py-8 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="max-w-2xl">
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                {['Kampania', 'Marka', 'Generowanie'].map((label, i) => (
                  <div key={i} className="flex items-center">
                    <div className={`flex items-center gap-1.5 text-xs font-semibold
                      ${i === step ? 'text-gray-900 dark:text-white' : i < step ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'}`}>
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                        ${i === step ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : i < step ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600'}`}>
                        {i < step ? (
                          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                            <path d="M2 6l3 3 5-5"/>
                          </svg>
                        ) : (
                          <span className="text-[10px] font-bold">{i + 1}</span>
                        )}
                      </span>
                      {label}
                    </div>
                    {i < 2 && <div className="flex-1 mx-2 h-px bg-gray-100 dark:bg-gray-800 min-w-[20px]" />}
                  </div>
                ))}
              </div>

              {/* Back button within flow */}
              {step > 0 && step < STEPS.GENERATE && (
                <button
                  onClick={goBack}
                  className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M10 12L6 8l4-4"/>
                  </svg>
                  Wróć
                </button>
              )}

              {/* Step content */}
              {step === STEPS.CAMPAIGN && (
                <CampaignForm
                  onSubmit={handleCampaignSubmit}
                  isLoading={isLoading}
                  initialDomain={initialDomain}
                />
              )}

              {step === STEPS.BRAND && (
                <>
                  {isLoading && copyGenStatus === 'generating' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 mb-4 flex items-center gap-2">
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-blue-300 border-t-blue-700"></div>
                      <span>Claude pisze hasła reklamowe dopasowane do marki i konkurencji...</span>
                    </div>
                  )}
                  <BrandForm
                    domain={campaignData?.domain}
                    onSubmit={handleBrandSubmit}
                    isLoading={isLoading}
                  />
                </>
              )}

              {step === STEPS.GENERATE && (
                <>
                  <LogoUpload onLogoChange={handleLogoChange} />
                  <GeneratorPanel
                    formats={generatorFormats}
                    logoDataUrl={logoDataUrl}
                    brandName={brandData?.name}
                    domain={campaignData?.domain}
                  />
                </>
              )}

              <p className="mt-6 text-[11px] text-gray-300 dark:text-gray-600">
                Banner Generator · Verseo · Powered by fal.ai Nano Banana
              </p>
            </div>
          </div>
        </div>

        {/* Client list — always visible */}
        <ClientList onNew={onNew} onStartFlow={onStartFlow} />
      </div>
    </div>
  )
}
