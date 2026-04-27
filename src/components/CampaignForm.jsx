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
const VARIANT_COUNTS = [1, 2, 3, 4, 5]

const CHANNEL_DEFAULT_FORMATS = {
  'Google Display Ads': ['meta-1200x628', 'meta-1080x1920', 'meta-1200x1200', 'meta-960x1200'],
  'Meta Ads (Facebook / Instagram)': ['meta-1080x1350', 'meta-1080x1920', 'meta-1080x1080'],
  'LinkedIn Ads': ['li-1200x627', 'li-1200x1200'],
  'TikTok Ads': ['tt-1080x1920', 'tt-1080x1080'],
  'Programmatic': ['gdn-300x250', 'gdn-728x90', 'gdn-160x600', 'gdn-300x600'],
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
    fields: ['goal', 'headline', 'cta', 'productImage'],
    isComplete: (f) => !!f.goal,
    summary: (f) => {
      const hl = f.headlineType === 'custom' ? (f.headline || 'własne hasło') : 'AI dobierze hasło'
      const ct = f.ctaType === 'custom' ? (f.cta || 'własne CTA') : 'CTA auto'
      const img = f.productImage ? ' · z produktem' : ''
      return [f.goal, hl, ct].filter(Boolean).join(' — ') + img
    },
  },
  {
    id: 'settings',
    title: 'Ile?',
    subtitle: 'Warianty i uwagi',
    fields: ['variants', 'notes'],
    isComplete: (f) => !!f.variants,
    summary: (f) => {
      const v = `${f.variants} wariant${f.variants > 1 ? 'y' : ''}`
      return f.notes ? `${v} · ${f.notes.slice(0, 40)}${f.notes.length > 40 ? '…' : ''}` : v
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
    variants: 2,
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
      const defaults = CHANNEL_DEFAULT_FORMATS[channel] || []
      let newFormats
      if (isAdding) {
        newFormats = [...new Set([...p.formats, ...defaults])]
      } else {
        const stillNeeded = new Set(newChannels.flatMap((c) => CHANNEL_DEFAULT_FORMATS[c] || []))
        newFormats = p.formats.filter((f) => !defaults.includes(f) || stillNeeded.has(f))
      }
      return { ...p, channels: newChannels, formats: newFormats }
    })
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

function SectionFields({ section, form, update, toggleArray, toggleChannel, domainRef }) {
  return (
    <>
      {section.fields.map((field) => (
        <Field key={field} field={field} form={form} update={update}
          toggleArray={toggleArray} toggleChannel={toggleChannel} domainRef={domainRef} />
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

function Field({ field, form, update, toggleArray, toggleChannel, domainRef }) {
  const label = {
    domain:       'Domena klienta',
    opiekun:      'Opiekun klienta',
    channels:     'Kanały reklamowe',
    formats:      'Formaty bannerów',
    goal:         'Cel kampanii',
    headline:     'Hasło reklamowe',
    cta:          'Tekst CTA (przycisk)',
    variants:     'Warianty A/B na każdy format',
    notes:        'Dodatkowe uwagi (opcjonalnie)',
    productImage: 'Zdjęcie produktu (opcjonalnie)',
  }[field]

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{label}</label>
      <FieldInput field={field} form={form} update={update}
        toggleArray={toggleArray} toggleChannel={toggleChannel} domainRef={domainRef} />
    </div>
  )
}

function FieldInput({ field, form, update, toggleArray, toggleChannel, domainRef }) {
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

    case 'variants':
      return (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => update('variants', n)}
              className={`pill ${form.variants === n ? 'pill-active' : ''}`}>
              {n}
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
