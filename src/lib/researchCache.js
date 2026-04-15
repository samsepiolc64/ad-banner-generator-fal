/**
 * Brand research cache — persists Claude's research results in localStorage
 * so we don't re-run expensive Claude calls every time the user revisits the
 * same domain. Entries expire after 30 days; users can manually refresh at
 * any time via the "Odśwież research" button.
 */

const CACHE_PREFIX = 'brand-research:'
const CACHE_VERSION = 2 // bump when schema changes (e.g. added competitor fields)
const MAX_AGE_DAYS = 30

/** Normalize a domain for cache key (so "LeasingTeam.PL/" and "leasingteam.pl" hit the same entry) */
function normalizeKey(domain) {
  if (!domain) return ''
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
}

/**
 * Load a cached research entry, or null if:
 *  - nothing stored
 *  - schema version mismatch
 *  - entry older than MAX_AGE_DAYS
 *  - localStorage unavailable / corrupted entry
 */
export function loadResearch(domain) {
  try {
    const key = CACHE_PREFIX + normalizeKey(domain)
    const raw = localStorage.getItem(key)
    if (!raw) return null

    const entry = JSON.parse(raw)
    if (entry.version !== CACHE_VERSION) return null

    const ageMs = Date.now() - entry.timestamp
    const ageDays = ageMs / (1000 * 60 * 60 * 24)
    if (ageDays > MAX_AGE_DAYS) return null

    return entry
  } catch {
    return null
  }
}

/** Save a successful research result to cache */
export function saveResearch(domain, brand, fetched) {
  try {
    const key = CACHE_PREFIX + normalizeKey(domain)
    const entry = {
      version: CACHE_VERSION,
      timestamp: Date.now(),
      brand,
      fetched,
    }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // localStorage full / disabled — fail silently, app still works
  }
}

/** Delete a cached entry (used when user clicks "refresh") */
export function clearResearch(domain) {
  try {
    localStorage.removeItem(CACHE_PREFIX + normalizeKey(domain))
  } catch {}
}

/** Human-readable "2 dni temu" from a timestamp */
export function formatAge(timestamp) {
  const diffMs = Date.now() - timestamp
  const mins = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (days >= 2) return `${days} dni temu`
  if (days === 1) return 'wczoraj'
  if (hours >= 2) return `${hours} godz. temu`
  if (hours === 1) return 'godzinę temu'
  if (mins >= 2) return `${mins} min temu`
  if (mins === 1) return 'minutę temu'
  return 'przed chwilą'
}
