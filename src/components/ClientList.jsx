import { useState, useMemo, useRef, useEffect } from 'react'
import { normalizeDomain, firstLetter } from '../lib/domain'
import { CLIENT_MODULES } from '../lib/clientModules'

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'dziś'
  if (days === 1) return 'wczoraj'
  if (days < 7) return `${days} dni temu`
  if (days < 30) return `${Math.floor(days / 7)} tyg. temu`
  if (days < 365) return `${Math.floor(days / 30)} mies. temu`
  return `${Math.floor(days / 365)} lat temu`
}

function ColorDot({ hex }) {
  if (!hex) return null
  return (
    <span
      className="inline-block w-4 h-4 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0"
      style={{ backgroundColor: hex }}
      title={hex}
    />
  )
}

function BrandPanel({ brand }) {
  if (!brand) return <div className="text-sm text-gray-400 dark:text-gray-500 italic">Brak danych marki</div>

  return (
    <div className="space-y-3 text-sm">
      {/* Podstawowe info */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {brand.name && (
          <div>
            <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Marka</span>
            <div className="font-medium text-gray-900 dark:text-white">{brand.name}</div>
          </div>
        )}
        {brand.industry && (
          <div>
            <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Branża</span>
            <div className="text-gray-700 dark:text-gray-300">{brand.industry}</div>
          </div>
        )}
        {brand.productType && (
          <div>
            <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Co sprzedają</span>
            <div className="text-gray-700 dark:text-gray-300">{brand.productType}</div>
          </div>
        )}
      </div>

      {/* Kolory */}
      {brand.colors && (brand.colors.primary || brand.colors.secondary || brand.colors.accent) && (
        <div>
          <div className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide mb-1">Kolory</div>
          <div className="flex items-center gap-2">
            {brand.colors.primary && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.primary} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Primary</span>
              </div>
            )}
            {brand.colors.secondary && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.secondary} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Secondary</span>
              </div>
            )}
            {brand.colors.accent && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.accent} />
                <span className="text-xs text-gray-500 dark:text-gray-400">Accent</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Styl i ton */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {brand.visualStyle && (
          <div className="max-w-sm">
            <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Styl wizualny</span>
            <div className="text-gray-700 dark:text-gray-300">{brand.visualStyle}</div>
          </div>
        )}
        {brand.tone && (
          <div>
            <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Ton komunikacji</span>
            <div className="text-gray-700 dark:text-gray-300">{brand.tone}</div>
          </div>
        )}
      </div>

      {/* Konkurenci */}
      {brand.competitors && brand.competitors.length > 0 && (
        <div>
          <div className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide mb-1">Konkurenci</div>
          <div className="flex flex-wrap gap-1.5">
            {brand.competitors.map((c, i) => (
              <span key={i} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full">
                {c.name || c.domain}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Taglines */}
      {brand.exampleTaglines && brand.exampleTaglines.length > 0 && (
        <div>
          <div className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide mb-1">Przykładowe hasła</div>
          <ul className="space-y-0.5">
            {brand.exampleTaglines.slice(0, 3).map((t, i) => (
              <li key={i} className="text-gray-600 dark:text-gray-400 text-xs">„{t}"</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, onStartFlow, onRefreshed, onDeleted }) {
  const [open, setOpen] = useState(false)
  const [faviconOk, setFaviconOk] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!moreOpen) return
    const handler = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])
  const [refreshDone, setRefreshDone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveMissing, setDriveMissing] = useState(false)
  const domain = client.domain

  const handleOpenDrive = async () => {
    setDriveLoading(true)
    setDriveMissing(false)
    try {
      const res = await fetch('/.netlify/functions/get-drive-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      const data = await res.json()
      if (data.found && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
      } else {
        setDriveMissing(true)
        setTimeout(() => setDriveMissing(false), 3000)
      }
    } catch (err) {
      console.error('Drive lookup failed:', err)
      setDriveMissing(true)
      setTimeout(() => setDriveMissing(false), 3000)
    } finally {
      setDriveLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch('/.netlify/functions/delete-client', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onDeleted(domain)
    } catch (err) {
      console.error('Delete failed:', err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleRefresh = async (e) => {
    e.stopPropagation()
    setRefreshing(true)
    setRefreshDone(false)
    try {
      const res = await fetch('/.netlify/functions/research-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, force: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      onRefreshed(domain, data.brand)
      setRefreshDone(true)
      setTimeout(() => setRefreshDone(false), 3000)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4 py-4 px-6 md:px-10 lg:px-16 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors group">
        {/* Favicon placeholder + domena */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 overflow-hidden text-xs font-bold text-gray-400 dark:text-gray-500">
            {faviconOk
              ? <img src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`} alt="" className="w-5 h-5 object-contain" onError={() => setFaviconOk(false)} />
              : domain[0].toUpperCase()
            }
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white truncate">{domain}</div>
          </div>
        </div>

        {/* Przyciski */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Brand + Drive — widoczne na sm+, na mniejszych w "···" */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`hidden sm:inline-flex text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors
              ${open
                ? 'bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}`}
          >
            Brand {open ? '▲' : '▾'}
          </button>
          <button
            type="button"
            onClick={handleOpenDrive}
            disabled={driveLoading}
            title="Otwórz folder na Google Drive"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-800 dark:hover:border-gray-500 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed"
          >
            {driveLoading ? (
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : (
              <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z"/>
              </svg>
            )}
            {driveMissing ? 'Brak folderu' : 'Drive'}
          </button>

          {/* ··· dropdown — tylko na małych ekranach */}
          <div className="relative sm:hidden" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="text-xs px-2.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-gray-200 transition-colors font-bold tracking-wider"
            >
              ···
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[130px]">
                <button
                  type="button"
                  onClick={() => { setOpen((v) => !v); setMoreOpen(false) }}
                  className="w-full text-left text-xs px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Brand {open ? '▲' : '▾'}
                </button>
                <button
                  type="button"
                  onClick={() => { handleOpenDrive(); setMoreOpen(false) }}
                  disabled={driveLoading}
                  className="w-full text-left text-xs px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {driveMissing ? 'Brak folderu' : 'Drive'}
                </button>
              </div>
            )}
          </div>

          {/* Przyciski modułów — zawsze widoczne, krótsze etykiety na xs */}
          {CLIENT_MODULES.map((mod, idx) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => mod.available && onStartFlow(domain, client.brand_data, mod.id)}
              disabled={!mod.available}
              title={mod.available ? mod.description : `${mod.label} — wkrótce`}
              className={`text-xs px-3 sm:px-4 py-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${
                !mod.available
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : idx === 0
                    ? 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
                    : 'border border-gray-200 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500'
              }`}
            >
              <span className="sm:hidden">{mod.label.split(' ')[0]} {mod.available ? '→' : ''}</span>
              <span className="hidden sm:inline">{mod.label} {mod.available && idx === 0 ? '→' : ''}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Brand panel inline */}
      {open && (
        <div className="px-6 md:px-10 lg:px-16 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <BrandPanel brand={client.brand_data} />
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            {/* Odśwież */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl px-3 py-1.5 font-medium hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed"
            >
              {refreshing ? (
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                </svg>
              ) : refreshDone ? (
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-green-500">
                  <path d="M2 6l3 3 5-5"/>
                </svg>
              ) : (
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M12 7A5 5 0 1 1 9 2.6"/>
                  <path d="M9 1v3h3"/>
                </svg>
              )}
              {refreshDone ? 'Zaktualizowano' : refreshing ? 'Odświeżam…' : 'Odśwież dane marki'}
            </button>

            {/* Usuń — inline confirmation */}
            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M2 3.5h10M5.5 3.5V2.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1M3.5 3.5l.5 8h6l.5-8"/>
                  <path d="M6 6v4M8 6v4"/>
                </svg>
                Usuń klienta
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 dark:text-gray-400">Usunąć <strong className="text-gray-700 dark:text-gray-300">{domain}</strong>?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-colors"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Usuwam…' : 'Usuń'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientList({ clients = [], loading = false, onNew, onStartFlow, onRefreshed, onDeleted }) {
  const [search, setSearch] = useState('')

  const { groups, totalFiltered } = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? clients.filter((c) => normalizeDomain(c.domain).includes(q) || (c.brand_data?.name || '').toLowerCase().includes(q))
      : clients

    const sorted = [...filtered].sort((a, b) => normalizeDomain(a.domain).localeCompare(normalizeDomain(b.domain)))

    const grouped = new Map()
    for (const c of sorted) {
      const letter = firstLetter(c.domain)
      if (!grouped.has(letter)) grouped.set(letter, [])
      grouped.get(letter).push(c)
    }

    const orderedKeys = [...grouped.keys()].sort((a, b) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    return {
      groups: orderedKeys.map((k) => ({ letter: k, clients: grouped.get(k) })),
      totalFiltered: filtered.length,
    }
  }, [clients, search])

  const handleRefreshed = (domain, newBrandData) => {
    onRefreshed?.(domain, newBrandData)
  }

  const handleDeleted = (domain) => {
    onDeleted?.(domain)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-100 border-t-gray-400" />
      </div>
    )
  }

  if (clients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-sm text-gray-400 dark:text-gray-500">Brak klientów. Dodaj pierwszego klienta.</p>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="w-4 h-4 flex-shrink-0">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          Nowy klient
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header sekcji z wyszukiwarką */}
      <div className="px-6 md:px-10 lg:px-16 py-4 flex items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex-shrink-0">
          Klienci · {search ? `${totalFiltered} / ${clients.length}` : clients.length}
        </span>
        <div className="relative max-w-xs w-full">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="7" cy="7" r="5"/>
            <path d="M14 14l-3-3"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj klienta..."
            className="w-full text-sm pl-9 pr-8 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
              aria-label="Wyczyść"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Lista pogrupowana po pierwszej literze */}
      <div>
        {totalFiltered === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
            Brak wyników dla „{search}"
          </div>
        ) : (
          groups.map(({ letter, clients: group }) => (
            <div key={letter}>
              <div className="sticky top-[65px] z-[5] px-6 md:px-10 lg:px-16 py-1.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {letter}
              </div>
              {group.map((client) => (
                <ClientRow key={client.domain} client={client} onStartFlow={onStartFlow} onRefreshed={handleRefreshed} onDeleted={handleDeleted} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
