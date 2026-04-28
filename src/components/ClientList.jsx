import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Check, X, ChevronUp, ChevronDown, Layers, Image as ImageIcon, MoreHorizontal } from 'lucide-react'
import { normalizeDomain, firstLetter } from '../lib/domain'
import { CLIENT_MODULES } from '../lib/clientModules'
import { getCost, formatCost } from '../lib/clientCosts'
import { TEAM_MEMBERS_UNIQUE } from '../lib/teamMembers'
import ScreenshotUploader from './ScreenshotUploader'
import ResearchDiff from './ResearchDiff'

const RESEARCH_STEPS = [
  { label: 'Pobieranie strony', detail: 'bezpośredni fetch + Google referer',  after: 0     },
  { label: 'Jina Reader',       detail: 'bypass Cloudflare, headless fetch',   after: 9000  },
  { label: 'Screenshotone',     detail: 'headless browser screenshot',         after: 17000 },
  { label: 'Wayback Machine',   detail: 'CDX snapshot + archiwum archive.org', after: 26000 },
  { label: 'Claude analizuje',  detail: 'wyciąganie danych brandowych',        after: 37000 },
]


function ResearchProgress({ step }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-center">
      <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white mb-3" />
      <div className="text-xs font-semibold text-gray-900 dark:text-white mb-3">Trwa research…</div>
      <div className="inline-flex flex-col gap-1.5 text-left">
        {RESEARCH_STEPS.map((s, i) => {
          const isPast   = i < step
          const isActive = i === step
          return (
            <div key={i} className={`flex items-center gap-2 text-xs ${i > step ? 'opacity-30' : ''}`}>
              <span className="w-4 flex-shrink-0 flex justify-center">
                {isPast ? (
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M4 8h8"/>
                  </svg>
                ) : isActive ? (
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 animate-spin" />
                ) : (
                  <span className="inline-block w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" />
                )}
              </span>
              <span className={isActive ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-400 dark:text-gray-500'}>
                {s.label}
              </span>
              {isActive && <span className="text-gray-400 dark:text-gray-500">— {s.detail}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

      {/* Nowe pola DNA wizualnego */}
      {brand.colorPalette && brand.colorPalette.length > 0 && (
        <div>
          <div className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide mb-1">Paleta kolorów</div>
          <div className="flex flex-wrap gap-2">
            {brand.colorPalette.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border border-gray-200 dark:border-gray-700 flex-shrink-0"
                  style={{ backgroundColor: c.hex }}
                  title={c.hex}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">{c.hex} <span className="text-gray-400 dark:text-gray-600">({c.role})</span></span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(brand.compositionStyle || brand.imageryType || brand.lightingMood) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          {brand.compositionStyle && (
            <div className="max-w-sm">
              <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Kompozycja</span>
              <div className="text-gray-700 dark:text-gray-300 text-sm">{brand.compositionStyle}</div>
            </div>
          )}
          {brand.imageryType && (
            <div className="max-w-sm">
              <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Zdjęcia</span>
              <div className="text-gray-700 dark:text-gray-300 text-sm">{brand.imageryType}</div>
            </div>
          )}
          {brand.lightingMood && (
            <div className="max-w-sm">
              <span className="text-gray-400 dark:text-gray-500 text-xs uppercase tracking-wide">Światło / nastrój</span>
              <div className="text-gray-700 dark:text-gray-300 text-sm">{brand.lightingMood}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ClientRow({ client, onStartFlow, onRefreshed, onDeleted, onMetaUpdated }) {
  const [open, setOpen] = useState(false)
  const [faviconOk, setFaviconOk] = useState(true)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const [brandOpen, setBrandOpen] = useState(false)
  const [screenshotOpen, setScreenshotOpen] = useState(false)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [screenshotError, setScreenshotError] = useState('')

  // Inline editing state
  const [editingOpiekun, setEditingOpiekun] = useState(false)
  const [opiekunDraft, setOpiekunDraft] = useState(client.opiekun || '')
  const [savingMeta, setSavingMeta] = useState(false)

  useEffect(() => {
    if (!moreOpen) return
    const handler = (e) => { if (!moreRef.current?.contains(e.target)) setMoreOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])
  const [refreshStep, setRefreshStep] = useState(0)
  const [pendingBrand, setPendingBrand] = useState(null)
  const [refreshDone, setRefreshDone] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [driveMissing, setDriveMissing] = useState(false)
  const domain = client.domain
  // Koszt z Supabase (cross-browser) lub localStorage (bieżąca sesja — natychmiastowy)
  const localCost = getCost(domain)
  const costTotal = client.cost_usd > 0
    ? Math.max(client.cost_usd, localCost?.total || 0)
    : (localCost?.total || 0)

  const saveMeta = async (field, value) => {
    setSavingMeta(true)
    try {
      await fetch('/.netlify/functions/update-client-meta', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, [field]: value }),
      })
      onMetaUpdated?.(domain, { [field]: value })
    } catch {}
    setSavingMeta(false)
  }

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
    setPendingBrand(null)
    setRefreshStep(0)
    const timers = RESEARCH_STEPS
      .map((s, i) => i > 0 ? setTimeout(() => setRefreshStep(i), s.after) : null)
      .filter(Boolean)
    try {
      const res = await fetch('/.netlify/functions/research-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, force: true }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPendingBrand(data.brand)
    } catch (err) {
      console.error('Refresh failed:', err)
    } finally {
      timers.forEach(clearTimeout)
      setRefreshStep(0)
      setRefreshing(false)
    }
  }

  const handleRefreshWithScreenshot = useCallback(async (dataUrl) => {
    setUploadingScreenshot(true)
    setRefreshDone(false)
    setPendingBrand(null)
    setScreenshotError('')
    setRefreshStep(0)
    const timers = RESEARCH_STEPS
      .map((s, i) => i > 0 ? setTimeout(() => setRefreshStep(i), s.after) : null)
      .filter(Boolean)
    try {
      // Compress screenshot before sending — raw PNG screenshots can exceed
      // Netlify's 6 MB body limit and slow down Claude Vision analysis.
      // Resize to max 1440px wide, JPEG quality 0.75 (~200–600 KB typical).
      const compressed = await new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          const maxW = 1440
          const scale = Math.min(1, maxW / img.width)
          const canvas = document.createElement('canvas')
          canvas.width  = Math.round(img.width  * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.75))
        }
        img.onerror = () => resolve(dataUrl)
        img.src = dataUrl
      })

      const res = await fetch('/.netlify/functions/research-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, force: true, userScreenshot: compressed }),
      })
      if (!res.ok) throw new Error(`Błąd serwera (HTTP ${res.status}). Spróbuj ponownie.`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setScreenshotOpen(false)
      setPendingBrand(data.brand)
    } catch (err) {
      console.error('Screenshot refresh failed:', err)
      setScreenshotError(err.message || 'Wystąpił nieznany błąd. Spróbuj ponownie.')
    } finally {
      timers.forEach(clearTimeout)
      setRefreshStep(0)
      setUploadingScreenshot(false)
    }
  }, [domain])

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
            <div className="font-medium text-gray-900 dark:text-white truncate">{normalizeDomain(domain)}</div>
          </div>
        </div>

        {costTotal > 0 && (
          <div className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 tabular-nums">
            {formatCost(costTotal)}
          </div>
        )}

        {/* Przyciski */}
        <div className="flex items-center gap-2 flex-shrink-0">

          {/* Karta klienta — widoczne md+ */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`hidden md:inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors
              ${open
                ? 'bg-gray-100 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300'
                : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-300'}`}
          >
            Karta klienta {open ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <ChevronDown size={12} strokeWidth={2} aria-hidden />}
          </button>

          {/* Google Drive — widoczne sm+ */}
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
            {driveMissing ? 'Brak folderu' : 'Google Drive'}
          </button>

          {/* ··· dropdown — widoczne poniżej md; zawiera Karta klienta zawsze + Drive poniżej sm */}
          <div className="relative md:hidden" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className="inline-flex items-center justify-center w-8 h-8 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-gray-200 transition-colors"
            >
              <MoreHorizontal size={14} strokeWidth={2} aria-hidden />
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg py-1 min-w-[150px]">
                <button
                  type="button"
                  onClick={() => { setOpen((v) => !v); setMoreOpen(false) }}
                  className="w-full text-left text-xs px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors inline-flex items-center gap-2"
                >
                  {open ? <ChevronUp size={12} strokeWidth={2} aria-hidden /> : <ChevronDown size={12} strokeWidth={2} aria-hidden />}
                  Karta klienta
                </button>
                {/* Drive — tylko poniżej sm, bo sm+ jest widoczny osobno */}
                <button
                  type="button"
                  onClick={() => { handleOpenDrive(); setMoreOpen(false) }}
                  disabled={driveLoading}
                  className="sm:hidden w-full text-left text-xs px-3 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H11a1 1 0 0 1 1 1V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5Z"/>
                  </svg>
                  {driveMissing ? 'Brak folderu' : 'Google Drive'}
                </button>
              </div>
            )}
          </div>

          {/* Przyciski modułów — zawsze widoczne, z ikonkami, skrócone etykiety poniżej sm */}
          {CLIENT_MODULES.map((mod, idx) => (
            <button
              key={mod.id}
              type="button"
              onClick={() => mod.available && onStartFlow(domain, client.brand_data, mod.id, client.opiekun || '')}
              disabled={!mod.available}
              title={mod.available ? mod.description : `${mod.label} — wkrótce`}
              className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl font-semibold transition-colors whitespace-nowrap ${
                !mod.available
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                  : idx === 0
                    ? 'bg-gray-900 text-white hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100'
                    : 'border border-gray-200 text-gray-700 hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:border-gray-500'
              }`}
            >
              {mod.id === 'banners'
                ? <Layers size={14} strokeWidth={1.8} aria-hidden />
                : <ImageIcon size={14} strokeWidth={1.8} aria-hidden />}
              <span className="hidden sm:inline">{mod.label}</span>
              <span className="sm:hidden">{mod.id === 'banners' ? 'Banery' : 'Grafiki'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Karta klienta — panel inline */}
      {open && (
        <div className="px-6 md:px-10 lg:px-16 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 space-y-4">

          {/* === META KLIENTA === */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Domena */}
            <div className="bg-white dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Domena</div>
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{domain}</div>
            </div>

            {/* Opiekun */}
            <div className="bg-white dark:bg-gray-800/60 rounded-xl px-4 py-3 border border-gray-100 dark:border-gray-700">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">Opiekun klienta</div>
              {editingOpiekun ? (
                <div className="flex items-center gap-1.5">
                  <select
                    value={opiekunDraft}
                    onChange={(e) => setOpiekunDraft(e.target.value)}
                    className="flex-1 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-2 py-1 focus:outline-none focus:border-gray-400"
                    autoFocus
                  >
                    <option value="">— brak —</option>
                    {TEAM_MEMBERS_UNIQUE.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                  <button
                    onClick={async () => { await saveMeta('opiekun', opiekunDraft); setEditingOpiekun(false) }}
                    disabled={savingMeta}
                    className="text-[11px] px-2 py-1 rounded-lg bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold disabled:opacity-50"
                  ><Check size={14} strokeWidth={2.4} aria-hidden /></button>
                  <button onClick={() => { setOpiekunDraft(client.opiekun || ''); setEditingOpiekun(false) }} className="text-[11px] px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500"><X size={14} strokeWidth={2.4} aria-hidden /></button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{client.opiekun || <span className="text-gray-400 dark:text-gray-500 italic">nie przypisano</span>}</span>
                  <button onClick={() => setEditingOpiekun(true)} className="text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors flex-shrink-0">Edytuj</button>
                </div>
              )}
            </div>
          </div>

          {/* === DANE MARKI (zwijane) === */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setBrandOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span>Dane marki</span>
              <span>{brandOpen ? <ChevronUp size={14} strokeWidth={2} aria-hidden /> : <ChevronDown size={14} strokeWidth={2} aria-hidden />}</span>
            </button>
            {brandOpen && (
              <div className="px-4 pb-4 pt-1 border-t border-gray-100 dark:border-gray-700/50">
                <BrandPanel brand={client.brand_data} />
              </div>
            )}
          </div>

          {/* === DOLNE PRZYCISKI === */}
          <div className="space-y-3 pt-1">

            {/* Action row */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefresh}
                  disabled={refreshing || uploadingScreenshot}
                  className="inline-flex items-center gap-1.5 text-xs border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-xl px-3 py-1.5 font-medium hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
                <button
                  type="button"
                  onClick={() => { setScreenshotOpen((v) => !v); setScreenshotError('') }}
                  disabled={refreshing || uploadingScreenshot}
                  className={`inline-flex items-center gap-1.5 text-xs rounded-xl px-3 py-1.5 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50
                    ${screenshotOpen
                      ? 'bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                      : 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
                >
                  <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                    <rect x="1" y="2.5" width="12" height="9" rx="1.5"/>
                    <circle cx="7" cy="7" r="2"/>
                    <path d="M4.5 2.5V2a.75.75 0 0 1 .75-.75h3.5A.75.75 0 0 1 9.5 2v.5"/>
                  </svg>
                  Ze screenshotem
                </button>
              </div>

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
                  <button type="button" onClick={() => setConfirmDelete(false)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 transition-colors">Anuluj</button>
                  <button type="button" onClick={handleDelete} disabled={deleting} className="text-xs px-2.5 py-1 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    {deleting ? 'Usuwam…' : 'Usuń'}
                  </button>
                </div>
              )}
            </div>

            {/* Research progress — visible during refresh */}
            {(refreshing || uploadingScreenshot) && (
              <ResearchProgress step={refreshStep} />
            )}

            {/* Diff view — appears after refresh, before user accepts */}
            {pendingBrand && !refreshing && !uploadingScreenshot && (
              <ResearchDiff
                key={JSON.stringify(pendingBrand).slice(0, 40)}
                oldBrand={client.brand_data}
                newBrand={pendingBrand}
                onAccept={(editedBrand) => {
                  onRefreshed(domain, editedBrand)
                  setPendingBrand(null)
                  setRefreshDone(true)
                  setTimeout(() => setRefreshDone(false), 3000)
                }}
                onReject={() => setPendingBrand(null)}
              />
            )}

            {/* Screenshot uploader */}
            {screenshotOpen && (
              <div className="border border-blue-200 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/20 rounded-xl p-3">
                <div className="text-xs font-medium text-blue-800 dark:text-blue-300 mb-1">
                  Wgraj screenshot strony klienta
                </div>
                <div className="text-[11px] text-blue-700/70 dark:text-blue-400/70 mb-3">
                  Claude przeanalizuje go wzrokowo i zaktualizuje dane marki. Możesz wkleić (Ctrl+V), przeciągnąć plik lub kliknąć poniżej.
                </div>
                <ScreenshotUploader
                  onUpload={handleRefreshWithScreenshot}
                  isUploading={uploadingScreenshot}
                />
                {screenshotError && (
                  <div className="mt-2 flex items-start gap-2 text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 flex-shrink-0 mt-0.5">
                      <circle cx="7" cy="7" r="6"/>
                      <path d="M7 4.5v3M7 9.5v.5"/>
                    </svg>
                    <span>{screenshotError}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ClientList({ clients = [], loading = false, onNew, onStartFlow, onRefreshed, onDeleted, onMetaUpdated }) {
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              aria-label="Wyczyść"
            >
              <X size={14} strokeWidth={2} aria-hidden />
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
                <ClientRow key={client.domain} client={client} onStartFlow={onStartFlow} onRefreshed={handleRefreshed} onDeleted={handleDeleted} onMetaUpdated={onMetaUpdated} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
