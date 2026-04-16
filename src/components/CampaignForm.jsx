import { useState, useRef, useEffect } from 'react'
import { FORMAT_GROUPS, ALL_FORMATS } from '../lib/formats'

const GOALS = ['Awareness (Świadomość marki)', 'Conversion (Sprzedaż)', 'Retargeting']
const CHANNELS = ['Google Display Ads', 'Meta Ads (Facebook / Instagram)', 'Programmatic']
const VARIANT_COUNTS = [1, 2, 3, 4, 5]

const CHANNEL_DEFAULT_FORMATS = {
  'Google Display Ads': ['meta-1200x628', 'meta-1080x1920', 'meta-1200x1200', 'meta-960x1200'],
  'Meta Ads (Facebook / Instagram)': ['meta-1080x1350', 'meta-1080x1920', 'meta-1080x1080'],
  'Programmatic': ['gdn-300x250', 'gdn-728x90', 'gdn-160x600', 'gdn-300x600'],
}

// 3 sekcje — każda grupuje powiązane pola
const SECTIONS = [
  {
    id: 'placement',
    title: 'Gdzie?',
    subtitle: 'Klient, kanały i formaty',
    fields: ['domain', 'channels', 'formats'],
    isComplete: (f) => !!f.domain.trim() && f.channels.length > 0 && f.formats.length > 0,
    summary: (f) => {
      const fmtLabels = f.formats.map((id) => ALL_FORMATS.find((x) => x.id === id)?.label).filter(Boolean)
      return [f.domain, f.channels.join(' · '), fmtLabels.join(', ')].filter(Boolean).join(' — ')
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
    subtitle: 'Warianty i uwagi',
    fields: ['variants', 'notes'],
    isComplete: (f) => !!f.variants,
    summary: (f) => {
      const v = `${f.variants} wariant${f.variants > 1 ? 'y' : ''}`
      return f.notes ? `${v} · ${f.notes.slice(0, 40)}${f.notes.length > 40 ? '…' : ''}` : v
    },
  },
]

export default function CampaignForm({ onSubmit, isLoading, initialDomain = '' }) {
  const [form, setForm] = useState(() => ({
    domain: initialDomain,
    goal: '',
    channels: [],
    formats: [],
    headlineType: 'auto',
    headline: '',
    ctaType: 'auto',
    cta: '',
    variants: 2,
    notes: '',
  }))
  const [activeSection, setActiveSection] = useState(0)
  const domainRef = useRef(null)

  useEffect(() => { domainRef.current?.focus() }, [])

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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.domain || !form.goal || form.channels.length === 0 || form.formats.length === 0) return
    onSubmit(form)
  }

  const isValid = form.domain && form.goal && form.channels.length > 0 && form.formats.length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {SECTIONS.map((section, idx) => {
        const isActive = idx === activeSection
        const isDone = idx < activeSection
        const isLocked = idx > activeSection
        const canAdvance = section.isComplete(form)

        return (
          <div
            key={section.id}
            className={`rounded-2xl border transition-all duration-200
              ${isActive ? 'border-gray-900 bg-white shadow-sm' : 'border-gray-200 bg-white'}
              ${isLocked ? 'opacity-40' : ''}
            `}
          >
            {/* Nagłówek sekcji */}
            <button
              type="button"
              onClick={() => isDone && setActiveSection(idx)}
              className={`w-full flex items-center justify-between px-5 py-4 text-left
                ${isDone ? 'cursor-pointer hover:bg-gray-50 rounded-2xl' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
                  ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {isDone ? (
                    <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                      <path d="M2 6l3 3 5-5"/>
                    </svg>
                  ) : idx + 1}
                </span>
                <div className="min-w-0">
                  <div className={`font-bold ${isActive ? 'text-gray-900' : isDone ? 'text-gray-600' : 'text-gray-400'}`}>
                    {section.title}
                    <span className={`ml-2 font-normal text-sm ${isActive ? 'text-gray-400' : 'text-gray-300'}`}>
                      {section.subtitle}
                    </span>
                  </div>
                  {isDone && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">{section.summary(form)}</div>
                  )}
                </div>
              </div>
              {isDone && <span className="text-xs text-gray-400 flex-shrink-0 ml-2">zmień</span>}
            </button>

            {/* Zawartość sekcji */}
            {isActive && (
              <div className="px-5 pb-5 space-y-5">
                <SectionFields
                  section={section}
                  form={form}
                  update={update}
                  toggleArray={toggleArray}
                  toggleChannel={toggleChannel}
                  domainRef={domainRef}
                />

                {/* Przycisk przejścia / submit */}
                {idx < SECTIONS.length - 1 ? (
                  <button
                    type="button"
                    onClick={advanceSection}
                    disabled={!canAdvance}
                    className="w-full bg-brand-navy text-white rounded-xl py-3 text-sm font-bold
                               hover:bg-brand-navy-800 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed
                               transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                    className="w-full bg-brand-blue text-white rounded-xl py-3.5 text-base font-bold
                               hover:bg-brand-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed
                               transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
                        </svg>
                        Przygotowuję prompty...
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path d="M9 1L3 9h5l-1 6 7-8H9l1-6z"/>
                        </svg>
                        Generuj bannery
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
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

function Field({ field, form, update, toggleArray, toggleChannel, domainRef }) {
  const label = {
    domain:   'Domena klienta',
    channels: 'Kanały reklamowe',
    formats:  'Formaty bannerów',
    goal:     'Cel kampanii',
    headline: 'Hasło reklamowe',
    cta:      'Tekst CTA (przycisk)',
    variants: 'Warianty A/B na każdy format',
    notes:    'Dodatkowe uwagi (opcjonalnie)',
  }[field]

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
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

    case 'channels':
      return (
        <div className="flex flex-wrap gap-1.5">
          {['Google Display Ads', 'Meta Ads (Facebook / Instagram)', 'Programmatic'].map((opt) => (
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
              <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">
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
          {['Awareness (Świadomość marki)', 'Conversion (Sprzedaż)', 'Retargeting'].map((opt) => (
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
            <input type="text" value={form.headline}
              onChange={(e) => update('headline', e.target.value)}
              placeholder="Wpisz hasło reklamowe..."
              className="input" autoFocus />
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

    case 'notes':
      return (
        <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)}
          placeholder="np. styl jak Apple, tylko zdjęcia produktowe bez ludzi, unikaj koloru czerwonego..."
          className="input min-h-[80px] resize-y" />
      )

    default: return null
  }
}
