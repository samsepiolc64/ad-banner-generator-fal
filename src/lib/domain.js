export function normalizeDomain(domain) {
  return String(domain || '')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
}

export function firstLetter(domain) {
  const n = normalizeDomain(domain)
  const ch = n[0]?.toUpperCase() || '#'
  return /[A-Z]/.test(ch) ? ch : '#'
}
