import { useState, useCallback, useEffect, useRef } from 'react'
import BrandForm from '../../components/BrandForm'
import ProductForm from './ProductForm'
import SceneForm from './SceneForm'
import ProductGeneratorPanel from './ProductGeneratorPanel'
import { buildProductPrompt } from '../../lib/productPromptBuilder'
import { PRODUCT_FORMATS, PRODUCT_FORMATS_DEFAULT } from '../../lib/productFormats'
import { normalizeDomain } from '../../lib/domain'

const STEPS = { BRAND: 0, PRODUCT: 1, SCENE: 2, GENERATE: 3 }

const FLOW_STEPS = [
  { id: 0, label: 'Marka',     sub: 'Dane brandu (opcjonalnie)' },
  { id: 1, label: 'Produkt',   sub: 'Zdjęcie produktu i nazwa' },
  { id: 2, label: 'Scena',     sub: 'Modelka, otoczenie, styl' },
  { id: 3, label: 'Generowanie', sub: 'Formaty i zapisywanie' },
]

function stepSummary(id, { brand, product, scene, formats }) {
  if (id === 0 && brand) return [brand.name, brand.industry].filter(Boolean).join(' · ') || 'Dane marki'
  if (id === 1 && product?.image) return product.type ? `Produkt · ${product.type}` : 'Zdjęcie wgrane'
  if (id === 2 && scene) {
    const bits = [scene.style]
    if (scene.includeModel && scene.model) {
      bits.push(`${scene.model.gender === 'male' ? 'Mężczyzna' : 'Kobieta'}${scene.model.hairColor !== 'any' ? ', ' + scene.model.hairColor : ''}`)
    }
    if (scene.setting) bits.push(scene.setting.slice(0, 30))
    return bits.join(' · ')
  }
  if (id === 3 && formats?.length) return `${formats.length} format${formats.length > 1 ? 'y' : ''}`
  return ''
}

export default function ProductFlow({
  domain: initialDomain,
  initialBrandData,
  falMode,
  onFalModeChange,
  sessionFolder,
  existingDomains = [],
  isNewClient = false,
  onClientResearched,
}) {
  const [domain, setDomainState] = useState(initialDomain || '')
  const [domainDraft, setDomainDraft] = useState(initialDomain || '')
  const [domainError, setDomainError] = useState('')
  const [step, setStep] = useState(STEPS.BRAND)
  const [maxStep, setMaxStep] = useState(STEPS.BRAND)
  const stepRefs = useRef([])

  useEffect(() => {
    setMaxStep((prev) => Math.max(prev, step))
  }, [step])

  useEffect(() => {
    const el = stepRefs.current[step]
    if (!el) return
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [step])
  const [brand, setBrand] = useState(initialBrandData)

  const needsDomain = !domain

  const confirmDomain = () => {
    const d = domainDraft.trim()
    if (!d) return
    const normalized = normalizeDomain(d)
    if (isNewClient && existingDomains.includes(normalized)) {
      setDomainError(`Klient ${normalized} już istnieje — wróć do listy i wybierz go tam.`)
      return
    }
    setDomainError('')
    setDomainState(d)
  }
  const [product, setProduct] = useState({ image: null, name: '', type: '' })
  const [scene, setScene] = useState({
    style: 'lifestyle',
    includeModel: true,
    model: { gender: 'female', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' },
    setting: '',
    mood: '',
  })
  const [selectedFormats, setSelectedFormats] = useState(PRODUCT_FORMATS_DEFAULT)
  const [variantCount, setVariantCount] = useState(2)
  const [generatorFormats, setGeneratorFormats] = useState([])

  const handleBrandSubmit = useCallback((b) => {
    setBrand(b)
    if (domain && onClientResearched) onClientResearched(domain, b)
    setStep(STEPS.PRODUCT)
  }, [domain, onClientResearched])

  const handleProductSubmit = (p) => {
    setProduct(p)
    setStep(STEPS.SCENE)
  }

  const handleSceneSubmit = (s) => {
    setScene(s)

    const formats = PRODUCT_FORMATS.filter((f) => selectedFormats.includes(f.id))
    const items = []
    for (const fmt of formats) {
      for (let v = 0; v < variantCount; v++) {
        const prompt = buildProductPrompt({ product, scene: s, format: fmt, brand })
        items.push({
          id: `${fmt.id}-v${v + 1}`,
          label: `${fmt.label} · V${v + 1}`,
          width: fmt.width,
          height: fmt.height,
          ar: fmt.ar,
          channel: fmt.channel,
          prompt,
          referenceImage: product.image,
        })
      }
    }
    setGeneratorFormats(items)
    setStep(STEPS.GENERATE)
  }

  return (
    <div className="divide-y divide-gray-100 dark:divide-gray-800">
      {FLOW_STEPS.map(({ id, label, sub }) => {
        const isActive = step === id
        const isDone = step > id
        const isLocked = step < id

        return (
          <div key={id} ref={el => stepRefs.current[id] = el} className={isLocked ? 'opacity-40' : ''}>
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
                  ) : id + 1}
                </span>
                <div className="min-w-0">
                  <div className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : isDone ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                    {label}
                    <span className={`ml-2 font-normal text-sm ${isActive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600'}`}>{sub}</span>
                  </div>
                  {isDone && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {stepSummary(id, { brand, product, scene, formats: generatorFormats })}
                    </div>
                  )}
                </div>
              </div>
              {isDone && <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">zmień</span>}
            </button>

            {id <= maxStep && (
              <div className={`grid transition-all duration-400 ease-in-out ${isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden min-h-0">
              <div className="pb-6">
                {id === STEPS.BRAND && (
                  needsDomain ? (
                    <div className="space-y-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Domena klienta</label>
                      <input
                        type="text"
                        value={domainDraft}
                        onChange={(e) => setDomainDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmDomain() } }}
                        placeholder="np. leasingteam.pl"
                        className="input"
                        autoFocus
                      />
                      {domainError && <div className="text-xs text-red-600 dark:text-red-400">{domainError}</div>}
                      <button
                        type="button"
                        onClick={confirmDomain}
                        disabled={!domainDraft.trim()}
                        className="btn-primary"
                      >
                        Dalej
                      </button>
                    </div>
                  ) : (
                    <BrandForm
                      domain={domain}
                      onSubmit={handleBrandSubmit}
                      isLoading={false}
                      initialBrand={brand}
                    />
                  )
                )}
                {id === STEPS.PRODUCT && (
                  <ProductForm
                    initial={product}
                    onSubmit={handleProductSubmit}
                  />
                )}
                {id === STEPS.SCENE && (
                  <SceneForm
                    initial={scene}
                    selectedFormats={selectedFormats}
                    onFormatsChange={setSelectedFormats}
                    variantCount={variantCount}
                    onVariantCountChange={setVariantCount}
                    onSubmit={handleSceneSubmit}
                  />
                )}
                {id === STEPS.GENERATE && (
                  <ProductGeneratorPanel
                    formats={generatorFormats}
                    brandName={brand?.name}
                    domain={domain}
                    falMode={falMode}
                    sessionFolder={sessionFolder}
                  />
                )}
              </div>
              </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
