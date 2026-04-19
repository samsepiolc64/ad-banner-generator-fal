import { useState } from 'react'
import { PRODUCT_FORMATS } from '../../lib/productFormats'

const STYLES = [
  { id: 'lifestyle',   label: 'Lifestyle',   sub: 'Naturalna scena, realne otoczenie' },
  { id: 'studio',      label: 'Studio',      sub: 'Czyste tło, światło studyjne' },
  { id: 'outdoor',     label: 'Plener',      sub: 'Na zewnątrz, światło naturalne' },
  { id: 'minimalist',  label: 'Minimalizm',  sub: 'Dużo przestrzeni, edytorski klimat' },
]

const HAIR = [
  { id: 'any',       label: 'Dowolny' },
  { id: 'blonde',    label: 'Blondynka' },
  { id: 'brunette',  label: 'Brunetka' },
  { id: 'red',       label: 'Ruda' },
  { id: 'black',     label: 'Czarne' },
  { id: 'gray',      label: 'Siwe' },
]

const SKIN = [
  { id: 'any',    label: 'Dowolna' },
  { id: 'fair',   label: 'Bardzo jasna' },
  { id: 'light',  label: 'Jasna' },
  { id: 'medium', label: 'Średnia' },
  { id: 'tan',    label: 'Opalona' },
  { id: 'dark',   label: 'Ciemna' },
]

const GENDERS = [
  { id: 'female', label: 'Kobieta' },
  { id: 'male',   label: 'Mężczyzna' },
  { id: 'any',    label: 'Dowolna' },
]

const AGES = [
  { id: 'young-adult', label: '20-30' },
  { id: 'adult',       label: '30-40' },
  { id: 'mature',      label: '40-55' },
  { id: 'senior',      label: '60+' },
]

const VARIANT_COUNTS = [1, 2, 3, 4, 5]

function Pill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
        ${active
          ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
          : 'border-gray-200 text-gray-600 hover:border-gray-400 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500'}`}
    >
      {children}
    </button>
  )
}

export default function SceneForm({
  initial,
  selectedFormats,
  onFormatsChange,
  variantCount,
  onVariantCountChange,
  onSubmit,
}) {
  const [style, setStyle] = useState(initial?.style || 'lifestyle')
  const [includeModel, setIncludeModel] = useState(initial?.includeModel ?? true)
  const [model, setModel] = useState(initial?.model || { gender: 'female', ageRange: 'adult', hairColor: 'brunette', skinTone: 'medium' })
  const [setting, setSetting] = useState(initial?.setting || '')
  const [mood, setMood] = useState(initial?.mood || '')

  const toggleFormat = (id) => {
    onFormatsChange(selectedFormats.includes(id)
      ? selectedFormats.filter((f) => f !== id)
      : [...selectedFormats, id])
  }

  const canSubmit = selectedFormats.length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ style, includeModel, model, setting: setting.trim(), mood: mood.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Styl */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Styl ujęcia</label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={`text-left p-3 rounded-xl border transition-colors
                ${style === s.id
                  ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{s.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Modelka */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Osoba na zdjęciu</label>
          <button
            type="button"
            onClick={() => setIncludeModel((v) => !v)}
            className={`text-xs px-3 py-1 rounded-full font-medium transition-colors
              ${includeModel ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}
          >
            {includeModel ? 'Z osobą' : 'Bez osoby'}
          </button>
        </div>

        {includeModel && (
          <div className="space-y-3 p-4 rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800">
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Płeć</div>
              <div className="flex flex-wrap gap-1.5">
                {GENDERS.map((g) => <Pill key={g.id} active={model.gender === g.id} onClick={() => setModel({ ...model, gender: g.id })}>{g.label}</Pill>)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Wiek</div>
              <div className="flex flex-wrap gap-1.5">
                {AGES.map((a) => <Pill key={a.id} active={model.ageRange === a.id} onClick={() => setModel({ ...model, ageRange: a.id })}>{a.label}</Pill>)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Włosy</div>
              <div className="flex flex-wrap gap-1.5">
                {HAIR.map((h) => <Pill key={h.id} active={model.hairColor === h.id} onClick={() => setModel({ ...model, hairColor: h.id })}>{h.label}</Pill>)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1.5">Karnacja</div>
              <div className="flex flex-wrap gap-1.5">
                {SKIN.map((s) => <Pill key={s.id} active={model.skinTone === s.id} onClick={() => setModel({ ...model, skinTone: s.id })}>{s.label}</Pill>)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Otoczenie */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Otoczenie / sceneria
        </label>
        <input
          type="text"
          value={setting}
          onChange={(e) => setSetting(e.target.value)}
          placeholder="np. jasna skandynawska łazienka, modny salon z drewnianą podłogą, słoneczny taras"
          className="input"
        />
      </div>

      {/* Nastrój — opcjonalne */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Nastrój (opcjonalnie)
        </label>
        <input
          type="text"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          placeholder="np. relaksująca poranna rutyna, świeżość, kobiecość, luksus"
          className="input"
        />
      </div>

      {/* Formaty */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Formaty</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRODUCT_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => toggleFormat(f.id)}
              className={`text-left p-3 rounded-xl border transition-colors
                ${selectedFormats.includes(f.id)
                  ? 'border-gray-900 bg-gray-50 dark:border-white dark:bg-gray-800'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-white">{f.label}</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{f.sublabel}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Warianty */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Ile wariantów na format
        </label>
        <div className="flex gap-1.5">
          {VARIANT_COUNTS.map((n) => (
            <Pill key={n} active={variantCount === n} onClick={() => onVariantCountChange(n)}>{n}</Pill>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold
                   hover:bg-gray-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed
                   transition-colors flex items-center justify-center gap-2"
      >
        Generuj
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 12l4-4-4-4"/>
        </svg>
      </button>
    </form>
  )
}
