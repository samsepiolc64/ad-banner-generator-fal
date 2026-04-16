import { useState, useEffect } from 'react'

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

function ClientRow({ client, onStartFlow, onRefreshed }) {
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshDone, setRefreshDone] = useState(false)
  const domain = client.domain

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
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0 text-xs font-bold text-gray-400 dark:text-gray-500">
            {domain[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-gray-900 dark:text-white truncate">{domain}</div>
          </div>
        </div>

        {/* Przyciski */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Odśwież brand */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            title="Odśwież dane marki"
            className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-colors
              ${refreshDone
                ? 'border-green-300 dark:border-green-700 text-green-500'
                : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-600 dark:hover:text-gray-300'}
              disabled:cursor-not-allowed`}
          >
            {refreshing ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
              </svg>
            ) : refreshDone ? (
              <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                <path d="M2 6l3 3 5-5"/>
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <path d="M13.5 8A5.5 5.5 0 1 1 10 3.07"/>
                <path d="M10 1v3.5H13.5"/>
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors
              ${open
                ? 'bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}`}
          >
            Brand {open ? '▲' : '▾'}
          </button>
          <button
            type="button"
            onClick={() => onStartFlow(domain, client.brand_data)}
            className="text-xs px-4 py-1.5 rounded-xl bg-gray-900 text-white hover:bg-gray-700 transition-colors font-semibold dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            Twórz banery →
          </button>
        </div>
      </div>

      {/* Brand panel inline */}
      {open && (
        <div className="px-6 md:px-10 lg:px-16 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
          <BrandPanel brand={client.brand_data} />
        </div>
      )}
    </div>
  )
}

export default function ClientList({ onNew, onStartFlow }) {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/.netlify/functions/list-clients')
      .then((r) => r.json())
      .then((data) => setClients(data.clients || []))
      .catch(() => setClients([]))
      .finally(() => setLoading(false))
  }, [])

  const handleRefreshed = (domain, newBrandData) => {
    setClients((prev) =>
      prev.map((c) => c.domain === domain ? { ...c, brand_data: newBrandData } : c)
    )
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
          <span className="text-base leading-none">＋</span>
          Nowy klient
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header sekcji */}
      <div className="px-6 md:px-10 lg:px-16 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
          Klienci · {clients.length}
        </span>
      </div>

      {/* Lista */}
      <div>
        {clients.map((client) => (
          <ClientRow key={client.domain} client={client} onStartFlow={onStartFlow} onRefreshed={handleRefreshed} />
        ))}
      </div>
    </div>
  )
}
