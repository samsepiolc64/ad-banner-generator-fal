import { MODULES } from '../lib/modules'

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-5 h-5">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export default function Sidebar({ darkMode, onToggleDark, activeModule, onSelectModule, sidebarOpen, onToggleSidebar }) {
  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-20 bg-gray-900 flex flex-col transition-all duration-300 ${sidebarOpen ? 'w-52' : 'w-14'}`}
    >
      {/* Toggle button */}
      <div className="flex items-center h-14 px-2 flex-shrink-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          title={sidebarOpen ? 'Zwiń menu' : 'Rozwiń menu'}
        >
          {sidebarOpen ? <ChevronLeftIcon /> : <HamburgerIcon />}
        </button>
      </div>

      {/* Module list */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {MODULES.map((mod) => {
          const isActive = mod.id === activeModule
          const isDisabled = mod.comingSoon

          return (
            <div key={mod.id} className="mx-2">
              <button
                type="button"
                onClick={() => !isDisabled && onSelectModule && onSelectModule(mod.id)}
                disabled={isDisabled}
                title={!sidebarOpen ? mod.label : undefined}
                className={`w-full h-11 flex items-center rounded-lg px-3 transition-colors
                  ${isActive ? 'bg-gray-700 text-white' : ''}
                  ${isDisabled ? 'text-gray-500 cursor-not-allowed' : !isActive ? 'text-gray-400 hover:bg-gray-800 hover:text-white' : ''}
                `}
              >
                {/* Icon */}
                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
                  {mod.icon(isActive)}
                </span>

                {/* Label + badge */}
                {sidebarOpen && (
                  <span className="ml-3 flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-medium">{mod.label}</span>
                    {mod.comingSoon && (
                      <span className="flex-shrink-0 text-[10px] font-semibold bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full leading-none">
                        wkrótce
                      </span>
                    )}
                  </span>
                )}
              </button>
            </div>
          )
        })}
      </nav>

      {/* Bottom: dark mode toggle */}
      <div className="flex-shrink-0 py-3 mx-2 border-t border-gray-800">
        <button
          type="button"
          onClick={onToggleDark}
          title={darkMode ? 'Przełącz na jasny' : 'Przełącz na ciemny'}
          className="w-full h-11 flex items-center rounded-lg px-3 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <span className="flex-shrink-0 flex items-center justify-center w-5 h-5">
            {darkMode ? <SunIcon /> : <MoonIcon />}
          </span>
          {sidebarOpen && (
            <span className="ml-3 text-sm font-medium">
              {darkMode ? 'Jasny' : 'Ciemny'}
            </span>
          )}
        </button>
      </div>
    </aside>
  )
}
