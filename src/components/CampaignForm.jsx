import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { FORMAT_GROUPS, ALL_FORMATS } from '../lib/formats'
import { normalizeDomain } from '../lib/domain'
import { TEAM_MEMBERS_UNIQUE, CAMPAIGN_GOALS } from '../lib/teamMembers'

const GOALS = CAMPAIGN_GOALS

// Supported ad-copy languages — code is sent to prompt builders, engName is used in prompts
export const AD_LANGUAGES = [
  { code: 'pl', label: 'Polski',     engName: 'Polish' },
  { code: 'en', label: 'English',    engName: 'English' },
  { code: 'cs', label: 'Čeština',    engName: 'Czech' },
  { code: 'sk', label: 'Slovenčina', engName: 'Slovak' },
  { code: 'de', label: 'Deutsch',    engName: 'German' },
  { code: 'es', label: 'Español',    engName: 'Spanish' },
  { code: 'fr', label: 'Français',   engName: 'French' },
  { code: 'it', label: 'Italiano',   engName: 'Italian' },
  { code: 'ro', label: 'Română',     engName: 'Romanian' },
  { code: 'hu', label: 'Magyar',     engName: 'Hungarian' },
]

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
    fields: ['goal', 'headline', 'cta', 'language'],
    isComplete: (f) => !!f.goal,
    summary: (f) => {
      const hl = f.headlineType === 'custom' ? (f.headline || 'własne hasło') : 'AI dobierze hasło'
      const ct = f.ctaType === 'custom' ? (f.cta || 'własne CTA') : 'CTA auto'
      const lang = AD_LANGUAGES.find((l) => l.code === f.language)?.label || 'Polski'
      return [f.goal, hl, ct, lang].filter(Boolean).join(' — ')
    },
  },
  {
    id: 'settings',
    title: 'Ile?',
    subtitle: 'Warianty kreatywne',
    fields: ['variants'],
    isComplete: (f) => f.variants.length > 0,
    summary: (f) => {
      const count = f.variants.length
      const names = f.variants.map((i) => VARIANT_DEFINITIONS[i]?.name).filter(Boolean)
      return count === 0 ? 'brak wariantów' : `${count} wariant${count === 1 ? '' : count < 5 ? 'y' : 'ów'} · ${names.join(', ')}`
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
    language: initialData?.language || 'pl',
    variants: [],  // tablica indeksów VARIANT_MATRIX — auto-zaznaczana przy wyborze kanałów
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
 * Product image picker — two modes:
 *  • "Z dysku"      — drag & drop / click / Ctrl+V paste (file → base64)
 *  • "Link ze strony" — URL input → server-side proxy fetches the image
 *    with spoofed Referer headers (bypasses IdoSell/Shopify/Symfony hotlink protection)
 *
 * Both modes store result as base64 data URL in parent state.
 */
function ProductImagePicker({ value, onChange }) {
  const [mode, setMode] = useState('file')   // 'file' | 'url'
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [fetching, setFetching] = useState(false)
  const inputRef = useRef(null)
  const MAX_SIZE = 4 * 1024 * 1024 // 4 MB

  const processFile = useCallback((file) => {
    setError('')
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Plik musi być obrazem (PNG, JPG, WebP).'); return }
    if (file.size > MAX_SIZE) { setError('Za duży (max 4 MB).'); return }
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

  const fetchFromUrl = async () => {
    const url = urlInput.trim()
    if (!url || !url.startsWith('http')) { setError('Wklej prawidłowy URL zdjęcia.'); return }
    setError('')
    setFetching(true)
    try {
      const res = await fetch('/.netlify/functions/fetch-image-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setError(data.error || `Błąd serwera (HTTP ${res.status})`)
        return
      }
      onChange(data.dataUrl)
      setUrlInput('')
    } catch (e) {
      setError('Nie udało się pobrać zdjęcia. Sprawdź URL i spróbuj ponownie.')
    } finally {
      setFetching(false)
    }
  }

  // After image loaded — show preview with remove button
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
            onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ''; setUrlInput('') }}
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
    <div className="space-y-2">
      {/* Mode switch */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-gray-100 dark:bg-gray-800 w-fit">
        {[['file', 'Z dysku'], ['url', 'Link ze strony']].map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError('') }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors
              ${mode === m
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <>
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
            <input ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} />
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
            Bez zdjęcia model wygeneruje ogólną grafikę dopasowaną do branży klienta.
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fetchFromUrl() } }}
              placeholder="https://sklep.pl/zdjecia/produkt.jpg"
              className="input flex-1 text-sm"
              autoFocus
            />
            <button
              type="button"
              onClick={fetchFromUrl}
              disabled={fetching || !urlInput.trim()}
              className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-40 hover:bg-gray-700 dark:hover:bg-gray-100 transition-colors"
            >
              {fetching ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-3.5 h-3.5 animate-spin">
                  <path d="M8 2a6 6 0 1 0 6 6"/>
                </svg>
              ) : 'Pobierz'}
            </button>
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
            Serwer pobiera zdjęcie bezpośrednio — działa też z chronionych sklepów (IdoSell, Shopify, Symfony).
          </div>
        </>
      )}

      {error && <div className="text-xs text-red-600 dark:text-red-400">{error}</div>}
    </div>
  )
}

/**
 * Picker na 1-2 zdjęcia referencyjne — istniejące banery klienta.
 * Przekazane do fal.ai jako pierwsze obrazy referencyjne (ustalają styl wizualny).
 */
function StyleReferenceImagesPicker({ values, onChange }) {
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const MAX_SIZE = 4 * 1024 * 1024 // 4 MB
  const MAX_IMAGES = 2

  const processFile = useCallback((file) => {
    setError('')
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Plik musi być obrazem (PNG, JPG, WebP).'); return }
    if (file.size > MAX_SIZE) { setError('Za duży (max 4 MB).'); return }
    if (values.length >= MAX_IMAGES) { setError(`Maksymalnie ${MAX_IMAGES} zdjęcia referencyjne.`); return }
    const reader = new FileReader()
    reader.onload = (e) => onChange([...values, e.target.result])
    reader.onerror = () => setError('Nie udało się odczytać pliku.')
    reader.readAsDataURL(file)
  }, [values, onChange])

  const removeImage = (idx) => onChange(values.filter((_, i) => i !== idx))

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {values.map((src, idx) => (
            <div key={idx} className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex items-center gap-2 p-2 pr-1">
              <img src={src} alt={`Referencja ${idx + 1}`} className="w-14 h-14 object-contain rounded-lg flex-shrink-0 bg-white dark:bg-gray-800" />
              <div className="flex-1 min-w-0 pr-1">
                <div className="text-xs font-medium text-gray-700 dark:text-gray-300">Baner #{idx + 1}</div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">
                  Wzorzec stylu
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeImage(idx)}
                className="flex-shrink-0 text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1"
                title="Usuń"
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
                  <path d="M2 2l10 10M12 2L2 12"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {values.length < MAX_IMAGES && (
        <div>
          <div
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer rounded-xl border-2 border-dashed px-4 py-4 text-center transition-colors border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
          >
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
              {values.length === 0 ? 'Przeciągnij baner klienta lub kliknij' : 'Dodaj drugi baner (opcjonalnie)'}
            </div>
            <div className="text-[11px] text-gray-400 dark:text-gray-500">
              PNG, JPG, WebP · max 4 MB · {MAX_IMAGES - values.length} pozostał{MAX_IMAGES - values.length === 1 ? 'e' : 'e'}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }}
            />
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5 leading-tight">
            Model użyje tych banerów jako referencję stylu — kolorystykę, układ i estetykę.
          </div>
        </div>
      )}
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
    language:     'Język tekstów na grafikach',
    variants:     'Warianty kreatywne',
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

    case 'language':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {AD_LANGUAGES.map((lang) => (
              <button key={lang.code} type="button" onClick={() => update('language', lang.code)}
                className={`pill ${form.language === lang.code ? 'pill-active' : ''}`}>
                {lang.label}
              </button>
            ))}
          </div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500">
            Hasło, CTA i wszystkie teksty widoczne na grafikach będą w wybranym języku.
          </div>
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

    default: return null
  }
}
