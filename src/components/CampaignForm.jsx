import { useState } from 'react'
import { FORMAT_GROUPS } from '../lib/formats'

const GOALS = ['Awareness (Świadomość marki)', 'Conversion (Sprzedaż)', 'Retargeting']
const CHANNELS = ['Google Display Ads', 'Meta Ads (Facebook / Instagram)', 'Programmatic']
const VARIANT_COUNTS = [1, 2, 3, 4, 5]

// Domyślne formaty auto-zaznaczane przy wyborze kanału
const CHANNEL_DEFAULT_FORMATS = {
  'Google Display Ads': ['meta-1200x628', 'meta-1080x1920', 'meta-1200x1200', 'meta-960x1200'],
  'Meta Ads (Facebook / Instagram)': ['meta-1200x628', 'meta-1200x1200', 'meta-960x1200', 'meta-1080x1920'],
  'Programmatic': ['gdn-300x250', 'gdn-728x90', 'gdn-160x600', 'gdn-300x600'],
}

export default function CampaignForm({ onSubmit, isLoading }) {
  const [form, setForm] = useState({
    domain: '',
    goal: '',
    channels: [],
    formats: [],
    headlineType: 'auto', // 'auto' or 'custom'
    headline: '',
    ctaType: 'auto',
    cta: '',
    variants: 2,
    notes: '',
  })

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
        // Dodaj domyślne formaty kanału (bez duplikatów)
        newFormats = [...new Set([...p.formats, ...defaults])]
      } else {
        // Pozostaw formaty które są domyślne dla INNYCH zaznaczonych kanałów
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Domain */}
      <Field label="Jaka jest domena klienta?">
        <input
          type="text"
          value={form.domain}
          onChange={(e) => update('domain', e.target.value)}
          placeholder="np. leasingteam.pl"
          className="input"
        />
      </Field>

      {/* Goal */}
      <Field label="Jaki jest cel kampanii?">
        <Pills
          options={GOALS}
          selected={form.goal}
          onSelect={(v) => update('goal', v)}
        />
      </Field>

      {/* Channels */}
      <Field label="Na jakich kanałach mają być bannery?">
        <Pills
          options={CHANNELS}
          selected={form.channels}
          onSelect={toggleChannel}
          multi
        />
      </Field>

      {/* Formats */}
      <Field label="Jakie formaty bannera? (można wybrać kilka)">
        {Object.entries(FORMAT_GROUPS).map(([key, group]) => (
          <div key={key} className="mb-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-400 mb-1.5">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.formats.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => toggleArray('formats', fmt.id)}
                  className={`pill ${form.formats.includes(fmt.id) ? 'pill-active' : ''}`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Field>

      {/* Headline */}
      <Field label="Masz gotowe hasło reklamowe?">
        <Pills
          options={['Tak — wpiszę poniżej', 'Zaproponuj na podstawie strony']}
          selected={form.headlineType === 'custom' ? 'Tak — wpiszę poniżej' : 'Zaproponuj na podstawie strony'}
          onSelect={(v) => update('headlineType', v === 'Tak — wpiszę poniżej' ? 'custom' : 'auto')}
        />
        {form.headlineType === 'custom' && (
          <input
            type="text"
            value={form.headline}
            onChange={(e) => update('headline', e.target.value)}
            placeholder="Wpisz hasło reklamowe..."
            className="input mt-2"
          />
        )}
      </Field>

      {/* CTA */}
      <Field label="Masz gotowy tekst CTA (przycisk)?">
        <Pills
          options={['Tak — wpiszę poniżej', 'Dobierz automatycznie do celu']}
          selected={form.ctaType === 'custom' ? 'Tak — wpiszę poniżej' : 'Dobierz automatycznie do celu'}
          onSelect={(v) => update('ctaType', v === 'Tak — wpiszę poniżej' ? 'custom' : 'auto')}
        />
        {form.ctaType === 'custom' && (
          <input
            type="text"
            value={form.cta}
            onChange={(e) => update('cta', e.target.value)}
            placeholder="Wpisz tekst CTA..."
            className="input mt-2"
          />
        )}
      </Field>

      {/* Variants */}
      <Field label="Ile wariantów do testów A/B na każdy format?">
        <Pills
          options={VARIANT_COUNTS.map(String)}
          selected={String(form.variants)}
          onSelect={(v) => update('variants', Number(v))}
        />
      </Field>

      {/* Notes */}
      <Field label="Dodatkowe uwagi do stylu lub treści? (opcjonalnie)">
        <textarea
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          placeholder="np. styl jak Apple, tylko zdjęcia produktowe bez ludzi, unikaj koloru czerwonego..."
          className="input min-h-[80px] resize-y"
        />
      </Field>

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || isLoading}
        className="w-full bg-gray-900 text-white rounded-xl py-3.5 text-base font-bold
                   hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Przygotowuję prompty...' : 'Generuj bannery'}
      </button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function Pills({ options, selected, onSelect, multi = false }) {
  const isSelected = (opt) => (multi ? selected.includes(opt) : selected === opt)

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onSelect(opt)}
          className={`pill ${isSelected(opt) ? 'pill-active' : ''}`}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
