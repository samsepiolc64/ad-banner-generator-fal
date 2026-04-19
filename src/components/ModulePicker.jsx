import { CLIENT_MODULES } from '../lib/clientModules'

export default function ModulePicker({ onPick, initialDomain = '' }) {
  const heading = initialDomain
    ? <>Co tworzymy dla <span className="text-gray-500 dark:text-gray-400 font-normal">{initialDomain}</span>?</>
    : 'Co tworzymy?'

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{heading}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Wybierz typ kreacji, który chcesz wygenerować.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CLIENT_MODULES.map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => mod.available && onPick(mod.id)}
            disabled={!mod.available}
            className={`group relative overflow-hidden rounded-2xl border text-left p-5 transition-all
              ${mod.available
                ? 'border-gray-200 dark:border-gray-800 hover:border-gray-900 dark:hover:border-white hover:shadow-lg cursor-pointer bg-white dark:bg-gray-900'
                : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 cursor-not-allowed opacity-60'}`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${mod.accent}`} />
            <div className="flex items-start justify-between mb-3">
              <div className="font-bold text-gray-900 dark:text-white">{mod.label}</div>
              {!mod.available && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  Wkrótce
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{mod.description}</p>
            {mod.available && (
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                Zaczynamy
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M6 12l4-4-4-4"/>
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
