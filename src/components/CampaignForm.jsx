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

const STEPS = ['domain', 'goal', 'channels', 'formats', 'headline', 'cta', 'variants', 'notes']

function stepSummary(step, form) {
  switch (step) {
    case 'domain':    return form.domain || null
    case 'goal':      return form.goal || null
    case 'channels':  return form.channels.length ? form.channels.join(', ') : null
    case 'formats': {
      const labels = form.formats.map((id) => ALL_FORMATS.find((f) => f.id === id)?.label).filter(Boolean)
      return labels.length ? labels.join(', ') : null
    }
    case 'headline':
      return form.headlineType === 'custom' ? (form.headline || 'własne hasło') : 'AI dobierze hasło'
    case 'cta':
      return form.ctaType === 'custom' ? (form.cta || 'własne CTA') : 'CTA automatyczne'
    case 'variants':  return form.variants ? `${form.variants} wariant${form.variants > 1 ? 'y' : ''}` : null
    case 'notes':     return form.notes || 'brak uwag'
    default:          return null
  }
}

function stepLabel(step) {
  switch (step) {
    case 'domain':   return 'Jaka jest domena klienta?'
    case 'goal':     return 'Jaki jest cel kampanii?'
    case 'channels': return 'Na jakich kanałach mają być bannery?'
    case 'formats':  return 'Jakie formaty bannera?'
    case 'headline': return 'Masz gotowe hasło reklamowe?'
    case 'cta':      return 'Masz gotowy tekst CTA?'
    case 'variants': return 'Ile wariantów A/B na każdy format?'
    case 'notes':    return 'Dodatkowe uwagi (opcjonalnie)'
    default:         return step
  }
}

export default function CampaignForm({ onSubmit, isLoading }) {
  const [form, setForm] = useState({
    domain: '',
    goal: '',
    channels: [],
    formats: [],
    headlineType: 'auto',
    headline: '',
    ctaType: 'auto',
    cta: '',
    variants: 2,
    notes: '',
  })
  const [currentStep, setCurrentStep] = useState(0)
  const domainRef = useRef(null)

  useEffect(() => { domainRef.current?.focus() }, [])

  const update = (key, val) => setForm((p) => ({ ...p, [key]: val }))

  const advance = () => setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))

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

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.domain || !form.goal || form.channels.length === 0 || form.formats.length === 0) return
    onSubmit(form)
  }

  const isValid = form.domain && form.goal && form.channels.length > 0 && form.formats.length > 0
  const isLastStep = currentStep === STEPS.length - 1

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {STEPS.map((step, idx) => {
        const isActive = idx === currentStep
        const isDone = idx < currentStep
        const isLocked = idx > currentStep
        const summary = stepSummary(step, form)

        return (
          <div
            key={step}
            className={`rounded-2xl border transition-all duration-200
              ${isActive ? 'border-gray-900 bg-white shadow-sm' : 'border-gray-200 bg-white'}
              ${isLocked ? 'opacity-40' : ''}
            `}
          >
            {/* Header — klikalne gdy ukończone */}
            <button
              type="button"
              onClick={() => isDone && setCurrentStep(idx)}
              className={`w-full flex items-center justify-between px-5 py-4 text-left
                ${isDone ? 'cursor-pointer hover:bg-gray-50 rounded-2xl' : 'cursor-default'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Numer / checkmark */}
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                  ${isDone ? 'bg-green-500 text-white' : isActive ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-400'}`}>
                  {isDone ? '✓' : idx + 1}
                </span>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${isActive ? 'text-gray-900' : isDone ? 'text-gray-500' : 'text-gray-400'}`}>
                    {stepLabel(step)}
                  </div>
                  {isDone && summary && (
                    <div className="text-xs text-gray-400 truncate mt-0.5">{summary}</div>
                  )}
                </div>
              </div>
              {isDone && (
                <span className="text-xs text-gray-400 flex-shrink-0 ml-2">zmień</span>
              )}
            </button>

            {/* Treść kroku — tylko gdy aktywny */}
            {isActive && (
              <div className="px-5 pb-5">
                <StepContent
                  step={step}
                  form={form}
                  update={update}
                  toggleArray={toggleArray}
                  toggleChannel={toggleChannel}
                  advance={advance}
                  isLastStep={isLastStep}
                  isLoading={isLoading}
                  isValid={isValid}
                  domainRef={domainRef}
                />
              </div>
            )}
          </div>
        )
      })}
    </form>
  )
}

function StepContent({ step, form, update, toggleArray, toggleChannel, advance, isLastStep, isLoading, isValid, domainRef }) {
  switch (step) {

    case 'domain':
      return (
        <input
          ref={domainRef}
          type="text"
          value={form.domain}
          onChange={(e) => update('domain', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && form.domain.trim() && advance()}
          onBlur={() => form.domain.trim() && advance()}
          placeholder="np. leasingteam.pl"
          className="input"
          autoComplete="off"
        />
      )

    case 'goal':
      return (
        <div className="flex flex-wrap gap-1.5">
          {['Awareness (Świadomość marki)', 'Conversion (Sprzedaż)', 'Retargeting'].map((opt) => (
            <button
              key={opt} type="button"
              onClick={() => { update('goal', opt); advance() }}
              className={`pill ${form.goal === opt ? 'pill-active' : ''}`}
            >{opt}</button>
          ))}
        </div>
      )

    case 'channels':
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {['Google Display Ads', 'Meta Ads (Facebook / Instagram)', 'Programmatic'].map((opt) => (
              <button
                key={opt} type="button"
                onClick={() => toggleChannel(opt)}
                className={`pill ${form.channels.includes(opt) ? 'pill-active' : ''}`}
              >{opt}</button>
            ))}
          </div>
          {form.channels.length > 0 && (
            <button type="button" onClick={advance}
              className="pill pill-active">
              Dalej →
            </button>
          )}
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
                  <button
                    key={fmt.id} type="button"
                    onClick={() => toggleArray('formats', fmt.id)}
                    className={`pill ${form.formats.includes(fmt.id) ? 'pill-active' : ''}`}
                  >{fmt.label}</button>
                ))}
              </div>
            </div>
          ))}
          {form.formats.length > 0 && (
            <button type="button" onClick={advance}
              className="pill pill-active mt-1">
              Dalej →
            </button>
          )}
        </div>
      )

    case 'headline':
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {['Zaproponuj na podstawie strony', 'Tak — wpiszę poniżej'].map((opt) => {
              const isCustom = opt === 'Tak — wpiszę poniżej'
              const isSelected = isCustom ? form.headlineType === 'custom' : form.headlineType === 'auto'
              return (
                <button
                  key={opt} type="button"
                  onClick={() => {
                    update('headlineType', isCustom ? 'custom' : 'auto')
                    if (!isCustom) advance()
                  }}
                  className={`pill ${isSelected ? 'pill-active' : ''}`}
                >{opt}</button>
              )
            })}
          </div>
          {form.headlineType === 'custom' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={form.headline}
                onChange={(e) => update('headline', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && advance()}
                placeholder="Wpisz hasło reklamowe..."
                className="input flex-1"
                autoFocus
              />
              <button type="button" onClick={advance}
                className="pill pill-active whitespace-nowrap">Dalej →</button>
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
              const isSelected = isCustom ? form.ctaType === 'custom' : form.ctaType === 'auto'
              return (
                <button
                  key={opt} type="button"
                  onClick={() => {
                    update('ctaType', isCustom ? 'custom' : 'auto')
                    if (!isCustom) advance()
                  }}
                  className={`pill ${isSelected ? 'pill-active' : ''}`}
                >{opt}</button>
              )
            })}
          </div>
          {form.ctaType === 'custom' && (
            <div className="flex gap-2">
              <input
                type="text"
                value={form.cta}
                onChange={(e) => update('cta', e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && advance()}
                placeholder="Wpisz tekst CTA..."
                className="input flex-1"
                autoFocus
              />
              <button type="button" onClick={advance}
                className="pill pill-active whitespace-nowrap">Dalej →</button>
            </div>
          )}
        </div>
      )

    case 'variants':
      return (
        <div className="flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n} type="button"
              onClick={() => { update('variants', n); advance() }}
              className={`pill ${form.variants === n ? 'pill-active' : ''}`}
            >{n}</button>
          ))}
        </div>
      )

    case 'notes':
      return (
        <div className="space-y-3">
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            placeholder="np. styl jak Apple, tylko zdjęcia produktowe bez ludzi, unikaj koloru czerwonego... (opcjonalnie)"
            className="input min-h-[80px] resize-y"
            autoFocus
          />
          <button
            type="submit"
            disabled={!isValid || isLoading}
            className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-base font-bold
                       hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Przygotowuję prompty...' : 'Generuj bannery'}
          </button>
        </div>
      )

    default: return null
  }
}

function Pills({ options, selected, onSelect, multi = false }) {
  const isSelected = (opt) => (multi ? selected.includes(opt) : selected === opt)
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button key={opt} type="button" onClick={() => onSelect(opt)}
          className={`pill ${isSelected(opt) ? 'pill-active' : ''}`}>
          {opt}
        </button>
      ))}
    </div>
  )
}
