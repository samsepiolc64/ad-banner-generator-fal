import { useState, useCallback } from 'react'
import CampaignForm from './components/CampaignForm'
import BrandForm from './components/BrandForm'
import LogoUpload from './components/LogoUpload'
import GeneratorPanel from './components/GeneratorPanel'
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
  const [step, setStep] = useState(STEPS.CAMPAIGN)
  const [campaignData, setCampaignData] = useState(null)
  const [brandData, setBrandData] = useState(null)
  const [logoDataUrl, setLogoDataUrl] = useState(null)
  const [generatorFormats, setGeneratorFormats] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [copyGenStatus, setCopyGenStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'fallback'

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
      // User typed their own headline — use it for every variant
      headlines = Array(variantCount).fill(campaignData.headline)
    } else {
      // AUTO mode — ask Claude to generate per-variant headlines
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

        // Sort by variantIndex just in case, then extract strings
        const sorted = [...data.headlines].sort((a, b) => a.variantIndex - b.variantIndex)
        headlines = sorted.map((h) => h.headline)

        // CTA from Claude if not custom
        if (campaignData.ctaType !== 'custom' && data.cta) {
          cta = data.cta
        }

        setCopyGenStatus('done')
      } catch (err) {
        console.error('generate-copy failed, using fallback:', err)
        // Fallback to static templates
        headlines = (DEFAULT_HEADLINES[campaignData.goal] || DEFAULT_HEADLINES['Conversion (Sprzedaż)']).slice(0, variantCount)
        setCopyGenStatus('fallback')
      }
    }

    // CTA: custom input OR Claude-generated (above) OR static fallback
    if (campaignData.ctaType === 'custom' && campaignData.cta) {
      cta = campaignData.cta
    } else if (!cta) {
      cta = DEFAULT_CTAS[campaignData.goal] || 'Sprawdź ofertę'
    }

    // --- STEP 2: Build competitor context (compInsight) ---
    // Combine insight + directive into a single block for the prompt builder
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
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-[720px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-baseline gap-2.5 mb-1">
            <h1 className="text-xl font-bold tracking-tight">Banner Generator</h1>
            <span className="text-xs text-gray-400">fal.ai · Nano Banana · v2.0</span>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mt-3">
            {['Kampania', 'Marka', 'Generowanie'].map((label, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 text-xs font-medium
                  ${i === step ? 'text-gray-900' : i < step ? 'text-brand-green' : 'text-gray-300'}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                    ${i === step ? 'bg-gray-900 text-white' : i < step ? 'bg-brand-green text-white' : 'bg-gray-200 text-gray-400'}`}>
                    {i < step ? '✓' : i + 1}
                  </span>
                  {label}
                </div>
                {i < 2 && <div className="w-8 h-px bg-gray-200" />}
              </div>
            ))}
          </div>
        </div>

        {/* Back button */}
        {step > 0 && step < STEPS.GENERATE && (
          <button
            onClick={goBack}
            className="text-sm text-gray-400 hover:text-gray-600 mb-3 flex items-center gap-1"
          >
            ← Wróć
          </button>
        )}

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {step === STEPS.CAMPAIGN && (
            <CampaignForm onSubmit={handleCampaignSubmit} isLoading={isLoading} />
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
        </div>

        <p className="text-center mt-4 text-[11px] text-gray-300">
          Banner Generator · Verseo · Powered by fal.ai Nano Banana
        </p>
      </div>
    </div>
  )
}
