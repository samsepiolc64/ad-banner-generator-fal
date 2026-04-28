import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { FORMAT_GROUPS, ALL_FORMATS } from '../lib/formats'
import { normalizeDomain } from '../lib/domain'
import { TEAM_MEMBERS_UNIQUE, CAMPAIGN_GOALS } from '../lib/teamMembers'

const GOALS = CAMPAIGN_GOALS
const CHANNELS = [
  'Google Display Ads',
  'Meta Ads (Facebook / Instagram)',
  'LinkedIn Ads',
  'TikTok Ads',
  'Programmatic',
]

const CHANNEL_DEFAULT_FORMATS = {
  'Google Display Ads': ['meta-1200x628', 'meta-1080x1920', 'meta-1200x1200', 'meta-960x1200'],
  'Meta Ads (Facebook / Instagram)': ['meta-1080x1350', 'meta-1080x1920', 'meta-1080x1080'],
  'LinkedIn Ads': ['li-1200x627', 'li-1200x1200'],
  'TikTok Ads': ['tt-1080x1920', 'tt-1080x1080'],
  'Programmatic': ['gdn-300x250', 'gdn-728x90', 'gdn-160x600', 'gdn-300x600'],
}

// Definicje wariantów kreatywnych — widoczne dla użytkownika
const VARIANT_DEFINITIONS = [
  { index: 0, name: 'Hero lifestyle',       shortDesc: 'Osoba z produktem, cinematic foto',        tooltip: 'Full-bleed fotografia lifestyle — osoba naturalnie korzysta z produktu. Nagłówek na ciemnym gradiencie. Ciepły, editorial, premium magazine feel.' },
  { index: 1, name: 'Product w scenie',      shortDesc: 'Produkt jako bohater w atmosferycznej scenerii', tooltip: 'Produkt w bogatej scenerii z rekwizytami — jak lookbook luksusowej marki. Aspiracyjny, tactile. Działa najlepiej gdy masz zdjęcie produktu.' },
  { index: 2, name: 'Editorial split',       shortDesc: 'Foto po lewej, kolor marki po prawej',    tooltip: 'Pionowy podział: lewa połowa — zdjęcie, prawa — panel w kolorze marki z nagłówkiem i CTA. Nowoczesny, magazynowy.' },
  { index: 3, name: 'Immersive cinematic',   shortDesc: 'Pełnoformatowa scena kinematograficzna',   tooltip: 'Edge-to-edge scena filmowa, minimalny tekst na ciemnym fragmencie. Dramatyczny, high-impact. Uwaga: może być nieczytelny w małych formatach IAB (728×90, 320×50).' },
  { index: 4, name: 'Minimalist éditorial', shortDesc: 'Dużo przestrzeni, jeden element wizualny', tooltip: 'Jeden precyzyjnie dobrany element na jasnym tle z dużą ilością negatywnej przestrzeni. Cicha luksusowość — dobry dla premium, beauty, B2B.' },
  { index: 5, name: 'Typograficzny Bold',    shortDesc: 'Kolor marki + wielki tekst, bez fotografii', tooltip: 'Kolor marki jako tło, oversized headline dominuje 50%+ kadru. Jedyny wariant działający we WSZYSTKICH małych formatach IAB (728×90, 320×50, 970×250) i LinkedIn B2B.' },
  { index: 6, name: 'Gradient Premium',      shortDesc: 'Gradient z kolorów marki, produkt unosi się', tooltip: 'Bogaty gradient z primary + secondary koloru marki jako tło (nie foto). Produkt lekko glowing. Świetny dla tech, beauty, fintech — gdy nie masz zdjęć.' },
  { index: 7, name: 'Social Proof',          shortDesc: 'Duża liczba lub cytat jako bohater',       tooltip: 'Oversized stat ("4.9★", "+340% sprzedaży") lub cytat dominuje kompozycję. Kolor marki w tle. Bardzo skuteczny w Consideration i Retargeting.' },
  { index: 8, name: 'UGC / Authentic',       shortDesc: 'Surowy, organiczny styl jak TikTok native', tooltip: 'Celowo nieprodukowany styl — wygląda jak content użytkownika, nie reklama. Wysoki CTR na TikTok i Meta Stories. Autentyczny, energetyczny.' },
]

// Domyślne warianty per kanał — auto-zaznaczane przy wyborze kanału
const CHANNEL_DEFAULT_VARIANTS = {
  'Google Display Ads':             [5, 1, 2],  // Typograficzny Bold, Product w scenie, Editorial split
  'Meta Ads (Facebook / Instagram)':[0, 1, 8],  // Hero lifestyle, Product w scenie, UGC/Authentic
  'LinkedIn Ads':                   [5, 4, 2],  // Typograficzny Bold, Minimalist éditorial, Editorial split
  'TikTok Ads':                     [8, 0, 3],  // UGC/Authentic, Hero lifestyle, Immersive cinematic
  'Programmatic':                   [5, 1, 4],  // Typograficzny Bold, Product w scenie, Minimalist éditorial
}

// 3 sekcje — każda grupuje powiązane pola
const SECTIONS = [
  {
    id: 'placement',
    title: 'Gdzie?',
    subtitle: 'Klient, kanały i formaty',
    fields: ['domain', 'opiekun', 'channels', 'formats'],
    isComplete: (f) => !!f.domain.trim() && f.channels.length > 0 && f.formats.length > 0,
    summary: (f) => {
      const fmtLabels = f.formats.map((id) => ALL_FORMATS.find((x) => x.id === id)?.label).filter(Boolean)
      return [f.domain, f.opiekun, f.channels.join(' · '), fmtLabels.join(', ')].filter(Boolean).join(' — ')
    },
  },
  {
    id: 'message',
    title: 'Co?',
    subtitle: 'Cel, hasło i CTA',
    fields: ['goal', 'headline', 'cta'],
    isComplete: (f) => !!f.goal,
    summary: (f) => {
      const hl = f.headlineType === 'custom' ? (f.headline || 'własne hasło') : 'AI dobierze hasło'
      const ct = f.ctaType === 'custom' ? (f.cta || 'własne CTA') : 'CTA auto'
      return [f.goal, hl, ct].filter(Boolean).join(' — ')
    },
  },
  {
    id: 'settings',
    title: 'Ile?',
    subtitle: 'Warianty, model AI i uwagi',
    fields: ['variants', 'imageModel', 'notes', 'productImage'],
    isComplete: (f) => f.variants.length > 0,
    summary: (f) => {
      const count = f.variants.length
      const names = f.variants.map((i) => VARIANT_DEFINITIONS[i]?.name).filter(Boolean)
      const v = count === 0 ? 'brak wariantów' : `${count} wariant${count === 1 ? '' : count < 5 ? 'y' : 'ów'} · ${names.join(', ')}`
      const m = f.imageModel === 'gpt-image-2' ? ' · GPT Image 2' : ' · Nano Banana 2'
      const img = f.productImage ? ' · z produktem' : ''
      return (f.notes ? `${v}${m} · ${f.notes.slice(0, 40)}${f.notes.length > 40 ? '…' : ''}` : `${v}${m}`) + img
    },
  },
]

export default function CampaignForm({
  onSubmit,
  isLoading,
  initialDomain = '',
  initialOpiekun = '',
  falMode = 'test',
  onFalModeChange,
  existingDomains = [],
  isNewClient = false,
  onSwitchToExisting,
}) {
  const [form, setForm] = useState(() => ({
    domain: initialDomain,
    opiekun: initialOpiekun || '',
    goal: '',
    channels: [],
    formats: [],
    headlineType: 'auto',
    headline: '',
    ctaType: 'auto',
    cta: '',
    variants: [],  // tablica indeksów VARIANT_MATRIX — auto-zaznaczana przy wyborze kanałów
    imageModel: 'nanobanan',
    notes: '',
    productImage: null,  // base64 data URL of product reference photo (optional)
  }))
  const [activeSection, setActiveSection] = useState(0)
  const [maxSection, setMaxSection] = useState(0)
  const sectionRefs = useRef([])
  const domainRef = useRef(null)

  useEffect(() => { domainRef.current?.focus() }, [])

  useEffect(() => {
    setMaxSection((prev) => Math.max(prev, activeSection))
  }, [activeSection])

  useEffect(() => {
    const el = sectionRefs.current[activeSection]
    if (!el) return
    const t = setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120)
    return () => clearTimeout(t)
  }, [activeSection])

  const update = (key, val) => setForm((p) => ({ ...p, [key]: val }))

  const toggleArray = (key, val) => {
    setForm((p) => {
      const arr = p[key]
      return { ...p, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] }
    })
  }

  const toggleChannel = (channel) => {
    setForm((p) => {
      const isAdding = !p.channels.includes(channel)
      const newChannels = isAdding
        ? [...p.channels, channel]
        : p.channels.filter((c) => c !== channel)

      // Formaty — dodaj/usuń defaulty kanału
      const defaultFormats = CHANNEL_DEFAULT_FORMATS[channel] || []
      let newFormats
      if (isAdding) {
        newFormats = [...new Set([...p.formats, ...defaultFormats])]
      } else {
        const stillNeeded = new Set(newChannels.flatMap((c) => CHANNEL_DEFAULT_FORMATS[c] || []))
        newFormats = p.formats.filter((f) => !defaultFormats.includes(f) || stillNeeded.has(f))
      }

      // Warianty — dodaj/usuń defaulty kanału (unia rekomendacji z aktywnych kanałów)
      const defaultVariants = CHANNEL_DEFAULT_VARIANTS[channel] || []
      let newVariants
      if (isAdding) {
        newVariants = [...new Set([...p.variants, ...defaultVariants])]
      } else {
        const stillNeeded = new Set(newChannels.flatMap((c) => CHANNEL_DEFAULT_VARIANTS[c] || []))
        newVariants = p.variants.filter((v) => !defaultVariants.includes(v) || stillNeeded.has(v))
      }

      return { ...p, channels: newChannels, formats: newFormats, variants: newVariants }
    })
  }

  const toggleVariant = (index) => {
    setForm((p) => ({
      ...p,
      variants: p.variants.includes(index)
        ? p.variants.filter((v) => v !== index)
        : [...p.variants, index],
    }))
  }

  const advanceSection = () => setActiveSection((s) => Math.min(s + 1, SECTIONS.length - 1))

  const normalizedInput = useMemo(() => normalizeDomain(form.domain), [form.domain])
  const isDuplicate =
    isNewClient &&
    normalizedInput.length >= 3 &&
    existingDomains.includes(normalizedInput)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.domain || !form.goal || form.channels.length === 0 || form.formats.length === 0) return
    if (isDuplicate) return
    onSubmit(form)
  }

  const isValid =
    form.domain &&
    form.goal &&
    form.channels.length > 0 &&
    form.formats.length > 0 &&
    !isDuplicate

  return (
    <form onSubmit={handleSubmit}>
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/30 divide-y divide-gray-200 dark:divide-gray-700 px-4">
        {SECTIONS.map((section, idx) => {
          const isActive = idx === activeSection
          const isDone = idx < activeSection
          const isLocked = idx > activeSection
          const canAdvance = section.isComplete(form) && !(section.id === 'placement' && isDuplicate)

          return (
            <div key={section.id} ref={el => sectionRefs.current[idx] = el} className={isLocked ? 'opacity-40' : ''}>
              {/* Nagłówek sekcji */}
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => isDone && setActiveSection(idx)}
                  className={`flex-1 flex items-center justify-between py-3.5 text-left transition-colors
                    ${isDone ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Mały wskaźnik — bez numeru */}
                    <span className="flex-shrink-0 flex items-center justify-center w-4 h-4">
                      {isDone ? (
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-green-500">
                          <path d="M2 6l3 3 5-5"/>
                        </svg>
                      ) : isActive ? (
                        <span className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white block"/>
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 block"/>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-semibold text-sm ${isActive ? 'text-gray-900 dark:text-white' : isDone ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-600'}`}>
                        {section.title}
                        <span className={`ml-1.5 font-normal ${isActive ? 'text-gray-400 dark:text-gray-500' : 'text-gray-300 dark:text-gray-600'}`}>
                          {section.subtitle}
                        </span>
                      </div>
                      {isDone && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{section.summary(form)}</div>
                      )}
                    </div>
                  </div>
                  {isDone && section.id !== 'placement' && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">zmień</span>
                  )}
                </button>
                {section.id === 'placement' && onFalModeChange && (
                  <button
                    type="button"
                    onClick={() => onFalModeChange(falMode === 'test' ? 'prod' : 'test')}
                    className={`flex-shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors
                      ${falMode === 'prod'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${falMode === 'prod' ? 'bg-white' : 'bg-gray-400 dark:bg-gray-500'}`} />
                    {falMode === 'prod' ? 'Klient' : 'Test'}
                  </button>
                )}
              </div>

              {/* Zawartość sekcji — grid-rows animuje wysokość w obu kierunkach */}
              {idx <= maxSection && (
                <div className={`grid transition-all duration-600 ease-in-out ${isActive ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden min-h-0">
                <div className="pb-5 space-y-5">
                  <SectionFields
                    section={section}
                    form={form}
                    update={update}
                    toggleArray={toggleArray}
                    toggleChannel={toggleChannel}
                    toggleVariant={toggleVariant}
                    domainRef={domainRef}
                  />

                  {section.id === 'placement' && isDuplicate && (
                    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center justify-between gap-3">
                      <span>
                        Klient <strong>{normalizedInput}</strong> już istnieje na liście.
                      </span>
                      {onSwitchToExisting && (
                        <button
                          type="button"
                          onClick={() => onSwitchToExisting(normalizedInput)}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white transition-colors flex-shrink-0"
                        >
                          Otwórz tego klienta →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Przycisk przejścia / submit */}
                  {idx < SECTIONS.length - 1 ? (
                    <button
                      type="button"
                      onClick={advanceSection}
                      disabled={!canAdvance}
                      className="btn-primary cursor-pointer"
                    >
                      Dalej
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M6 12l4-4-4-4"/>
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!isValid || isLoading}
                      className="btn-primary cursor-pointer"
                    >
                      Dalej
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                        <path d="M6 12l4-4-4-4"/>
                      </svg>
                    </button>
                  )}
                </div>
                </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </form>
  )
}

function SectionFields({ section, form, update, toggleArray, toggleChannel, toggleVariant, domainRef }) {
  return (
    <>
      {section.fields.map((field) => (
        <Field key={field} field={field} form={form} update={update}
          toggleArray={toggleArray} toggleChannel={toggleChannel} toggleVariant={toggleVariant} domainRef={domainRef} />
      ))}
    </>
  )
}

/**
 * Compact product image picker.
 * Supports drag & drop, click-to-browse, and Ctrl+V paste.
 * Stores result as base64 data URL in parent state.
 */
function ProductImagePicker({ value, onChange }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const MAX_SIZE = 4 * 1024 * 1024 // 4 MB

  const processFile = useCallback((file) => {
    setError('')
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Plik musi być obrazem (PNG, JPG, WebP).'); return }
    if (file.size > MAX_SIZE) { setError(`Za duży (max 4 MB).`); return }
    const reader = new FileReader()
    reader.onload = (e) => onChange(e.target.result)
    reader.onerror = () => setError('Nie udało się odczytać pliku.')
    reader.readAsDataURL(file)
  }, [onChange])

  // Global paste — active while component is mounted
  useEffect(() => {
    const onPaste = (e) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const it of items) {
        if (it.type?.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) { processFile(file); e.preventDefault(); return }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [processFile])

  if (value) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center gap-3 p-2">
          <img src={value} alt="Podgląd produktu" className="w-16 h-16 object-contain rounded-lg flex-shrink-0 bg-white dark:bg-gray-800" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Zdjęcie produktu wgrane</div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
              Model postara się wiernie odwzorować ten produkt w scenie reklamowej.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}
            className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
            title="Usuń zdjęcie"
          >
            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
              <path d="M2 2l10 10M12 2L2 12"/>
            </svg>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f) }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors
          ${dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50'}`}
      >
        <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
          Przeciągnij zdjęcie produktu lub kliknij
        </div>
        <div className="text-[11px] text-gray-400 dark:text-gray-500">
          możesz też wkleić (Ctrl+V) · PNG, JPG, WebP · max 4 MB
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
      </div>
      <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-tight">
        Bez zdjęcia model wygeneruje ogólną grafikę dopasowaną do branży klienta.
      </div>
      {error && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}

function Field({ field, form, update, toggleArray, toggleChannel, toggleVariant, domainRef }) {
  const label = {
    domain:       'Domena klienta',
    opiekun:      'Opiekun klienta',
    channels:     'Kanały reklamowe',
    formats:      'Formaty bannerów',
    goal:         'Cel kampanii',
    headline:     'Hasło reklamowe',
    cta:          'Tekst CTA (przycisk)',
    variants:     'Warianty kreatywne',
    imageModel:   'Model AI do generowania grafik',
    notes:        'Dodatkowe uwagi (opcjonalnie)',
    productImage: 'Zdjęcie produktu (opcjonalnie)',
  }[field]

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <FieldInput field={field} form={form} update={update}
        toggleArray={toggleArray} toggleChannel={toggleChannel} toggleVariant={toggleVariant} domainRef={domainRef} />
    </div>
  )
}

function FieldInput({ field, form, update, toggleArray, toggleChannel, toggleVariant, domainRef }) {
  switch (field) {

    case 'domain':
      return (
        <input
          ref={domainRef}
          type="text"
          value={form.domain}
          onChange={(e) => update('domain', e.target.value)}
          placeholder="np. leasingteam.pl"
          className="input"
          autoComplete="off"
        />
      )

    case 'opiekun':
      return (
        <select
          value={form.opiekun}
          onChange={(e) => update('opiekun', e.target.value)}
          className="input"
        >
          <option value="">— wybierz opiekuna (opcjonalnie) —</option>
          {TEAM_MEMBERS_UNIQUE.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      )

    case 'channels':
      return (
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((opt) => (
            <button key={opt} type="button" onClick={() => toggleChannel(opt)}
              className={`pill ${form.channels.includes(opt) ? 'pill-active' : ''}`}>
              {opt}
            </button>
          ))}
        </div>
      )

    case 'formats':
      return (
        <div className="space-y-3">
          {Object.entries(FORMAT_GROUPS).map(([key, group]) => (
            <div key={key}>
              <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                {group.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.formats.map((fmt) => (
                  <button key={fmt.id} type="button"
                    onClick={() => toggleArray('formats', fmt.id)}
                    className={`pill ${form.formats.includes(fmt.id) ? 'pill-active' : ''}`}>
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )

    case 'goal':
      return (
        <div className="flex flex-wrap gap-1.5">
          {CAMPAIGN_GOALS.map((opt) => (
            <button key={opt} type="button" onClick={() => update('goal', opt)}
              className={`pill ${form.goal === opt ? 'pill-active' : ''}`}>
              {opt}
            </button>
          ))}
        </div>
      )

    case 'headline':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {['Zaproponuj na podstawie strony', 'Tak — wpiszę poniżej'].map((opt) => {
              const isCustom = opt === 'Tak — wpiszę poniżej'
              return (
                <button key={opt} type="button"
                  onClick={() => update('headlineType', isCustom ? 'custom' : 'auto')}
                  className={`pill ${(isCustom ? form.headlineType === 'custom' : form.headlineType === 'auto') ? 'pill-active' : ''}`}>
                  {opt}
                </button>
              )
            })}
          </div>
          {form.headlineType === 'custom' && (
            <div className="space-y-1">
              <textarea
                value={form.headline}
                onChange={(e) => update('headline', e.target.value)}
                onKeyDown={(e) => {
                  // Allow Enter for second line; Shift+Enter also fine
                  if (e.key === 'Enter' && !e.shiftKey) e.stopPropagation()
                }}
                placeholder={"Wpisz hasło reklamowe...\n(drugi wiersz → mniejszy font na banerze)"}
                rows={2}
                className="input resize-none"
                autoFocus
              />
              <div className="text-[11px] text-gray-400 dark:text-gray-500">
                Enter = nowy wiersz — pojawi się jako podtytuł z mniejszym fontem.
              </div>
            </div>
          )}
        </div>
      )

    case 'cta':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {['Dobierz automatycznie do celu', 'Tak — wpiszę poniżej'].map((opt) => {
              const isCustom = opt === 'Tak — wpiszę poniżej'
              return (
                <button key={opt} type="button"
                  onClick={() => update('ctaType', isCustom ? 'custom' : 'auto')}
                  className={`pill ${(isCustom ? form.ctaType === 'custom' : form.ctaType === 'auto') ? 'pill-active' : ''}`}>
                  {opt}
                </button>
              )
            })}
          </div>
          {form.ctaType === 'custom' && (
            <input type="text" value={form.cta}
              onChange={(e) => update('cta', e.target.value)}
              placeholder="Wpisz tekst CTA..."
              className="input" autoFocus />
          )}
        </div>
      )

    case 'variants': {
      const selectedCount = form.variants.length
      return (
        <div className="space-y-2.5">
          {/* Grid wariantów */}
          <div className="grid grid-cols-1 gap-1.5">
            {VARIANT_DEFINITIONS.map((v) => {
              const isActive = form.variants.includes(v.index)
              return (
                <button
                  key={v.index}
                  type="button"
                  onClick={() => toggleVariant(v.index)}
                  title={v.tooltip}
                  className={`flex items-start gap-2.5 text-left w-full px-3 py-2.5 rounded-xl border transition-colors
                    ${isActive
                      ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
                >
                  {/* Checkbox indicator */}
                  <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors
                    ${isActive
                      ? 'bg-gray-900 border-gray-900 dark:bg-white dark:border-white'
                      : 'border-gray-300 dark:border-gray-600'}`}>
                    {isActive && (
                      <svg viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        className="w-2.5 h-2 text-white dark:text-gray-900">
                        <path d="M1 4l3 3 5-5"/>
                      </svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-medium ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {v.name}
                      </span>
                      {v.index >= 5 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex-shrink-0">
                          Nowy
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{v.shortDesc}</div>
                  </div>
                  {/* Tooltip hint */}
                  <span className="flex-shrink-0 mt-0.5 text-gray-300 dark:text-gray-600" title={v.tooltip}>
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5">
                      <circle cx="7" cy="7" r="6"/>
                      <path d="M7 6v4M7 4.5v.5"/>
                    </svg>
                  </span>
                </button>
              )
            })}
          </div>
          {/* A/B hint */}
          {selectedCount > 0 && selectedCount < 2 && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0">
                <path d="M7 1L13 12H1L7 1z"/>
                <path d="M7 5v3M7 10v.5"/>
              </svg>
              Zaznacz min. 2 warianty, żeby przeprowadzić test A/B i wybrać najlepiej konwertujący.
            </div>
          )}
          {selectedCount === 0 && (
            <div className="text-[11px] text-gray-400 dark:text-gray-500">
              Zaznacz przynajmniej jeden wariant. Kanały reklamowe automatycznie sugerują najlepsze kombinacje.
            </div>
          )}
        </div>
      )
    }

    case 'imageModel':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              id: 'nanobanan',
              name: 'Nano Banana 2',
              badge: 'Domyślny',
              desc: 'FLUX · sprawdzony, szybki',
              price: '$0.08–0.15 / grafika',
            },
            {
              id: 'gpt-image-2',
              name: 'GPT Image 2',
              badge: 'OpenAI',
              desc: 'Tekst w grafice, naturalny język',
              price: '$0.15–0.41 / grafika',
            },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => update('imageModel', m.id)}
              className={`text-left p-3 rounded-xl border transition-colors
                ${form.imageModel === m.id
                  ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{m.name}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">{m.badge}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{m.desc}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{m.price}</div>
            </button>
          ))}
        </div>
      )

    case 'productImage':
      return <ProductImagePicker value={form.productImage} onChange={(v) => update('productImage', v)} />

    case 'notes':
      return (
        <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
          placeholder="np. styl jak Apple, tylko zdjęcia produktowe bez ludzi, unikaj koloru czerwonego..."
          className="input min-h-[80px] resize-y" />
      )

    default: return null
  }
}
