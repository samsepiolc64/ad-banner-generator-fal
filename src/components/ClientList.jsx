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
      className="inline-block w-4 h-4 rounded-full border border-gray-200 flex-shrink-0"
      style={{ backgroundColor: hex }}
      title={hex}
    />
  )
}

function BrandPanel({ brand }) {
  if (!brand) return <div className="text-sm text-gray-400 italic">Brak danych marki</div>

  return (
    <div className="py-3 px-4 space-y-3 text-sm">
      {/* Podstawowe info */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {brand.name && (
          <div>
            <span className="text-gray-400 text-xs uppercase tracking-wide">Marka</span>
            <div className="font-medium text-gray-900">{brand.name}</div>
          </div>
        )}
        {brand.industry && (
          <div>
            <span className="text-gray-400 text-xs uppercase tracking-wide">Branża</span>
            <div className="text-gray-700">{brand.industry}</div>
          </div>
        )}
        {brand.productType && (
          <div>
            <span className="text-gray-400 text-xs uppercase tracking-wide">Co sprzedają</span>
            <div className="text-gray-700">{brand.productType}</div>
          </div>
        )}
      </div>

      {/* Kolory */}
      {brand.colors && (brand.colors.primary || brand.colors.secondary || brand.colors.accent) && (
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Kolory</div>
          <div className="flex items-center gap-2">
            {brand.colors.primary && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.primary} />
                <span className="text-xs text-gray-500">Primary</span>
              </div>
            )}
            {brand.colors.secondary && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.secondary} />
                <span className="text-xs text-gray-500">Secondary</span>
              </div>
            )}
            {brand.colors.accent && (
              <div className="flex items-center gap-1.5">
                <ColorDot hex={brand.colors.accent} />
                <span className="text-xs text-gray-500">Accent</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Styl i ton */}
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        {brand.visualStyle && (
          <div className="max-w-sm">
            <span className="text-gray-400 text-xs uppercase tracking-wide">Styl wizualny</span>
            <div className="text-gray-700">{brand.visualStyle}</div>
          </div>
        )}
        {brand.tone && (
          <div>
            <span className="text-gray-400 text-xs uppercase tracking-wide">Ton komunikacji</span>
            <div className="text-gray-700">{brand.tone}</div>
          </div>
        )}
      </div>

      {/* Konkurenci */}
      {brand.competitors && brand.competitors.length > 0 && (
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Konkurenci</div>
          <div className="flex flex-wrap gap-1.5">
            {brand.competitors.map((c, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {c.name || c.domain}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Taglines */}
      {brand.exampleTaglines && brand.exampleTaglines.length > 0 && (
        <div>
          <div className="text-gray-400 text-xs uppercase tracking-wide mb-1">Przykładowe hasła</div>
          <ul className="space-y-0.5">
            {brand.exampleTaglines.slice(0, 3).map((t, i) => (
              <li key={i} className="text-gray-600 text-xs">„{t}"</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, onStartFlow }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-4 py-3 px-1 hover:bg-gray-50 transition-colors rounded-lg">
        {/* Domena */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-gray-300 text-sm">🌐</span>
          <span className="font-medium text-gray-900 truncate">{client.domain}</span>
        </div>

        {/* Data */}
        <div className="text-sm text-gray-400 flex-shrink-0 w-24 text-right">
          {timeAgo(client.updated_at)}
        </div>

        {/* Brand toggle */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1 transition-colors"
        >
          <span>Brand</span>
          <span className="text-xs">{open ? '▲' : '▾'}</span>
        </button>

        {/* CTA */}
        <button
          type="button"
          onClick={() => onStartFlow(client.domain)}
          className="flex-shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
        >
          Twórz banery →
        </button>
      </div>

      {/* Inline brand panel */}
      {open && (
        <div className="mx-1 mb-2 bg-gray-50 rounded-xl border border-gray-100">
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-200 border-t-gray-600" />
      </div>
    )
  }

  if (clients.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-2 bg-gray-900 text-white px-6 py-3 rounded-xl text-base font-bold hover:bg-gray-800 transition-colors"
        >
          <span className="text-lg leading-none">＋</span>
          Nowy klient
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Klienci</h2>
          <p className="text-sm text-gray-400 mt-0.5">{clients.length} {clients.length === 1 ? 'klient' : 'klientów'}</p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors"
        >
          <span className="text-base leading-none">＋</span>
          Nowy
        </button>
      </div>

      {/* Lista */}
      <div>
        {/* Nagłówek kolumn */}
        <div className="flex items-center gap-4 px-1 pb-2 border-b border-gray-200 mb-1">
          <div className="flex-1 text-xs font-medium uppercase tracking-wider text-gray-400">Domena</div>
          <div className="w-24 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Zaktualizowano</div>
          <div className="w-16 text-xs font-medium uppercase tracking-wider text-gray-400">Brand</div>
          <div className="w-28 text-xs font-medium uppercase tracking-wider text-gray-400">Akcja</div>
        </div>

        {clients.map((client) => (
          <ClientRow key={client.domain} client={client} onStartFlow={onStartFlow} />
        ))}
      </div>
    </div>
  )
}
