export const CLIENT_MODULES = [
  {
    id: 'banners',
    label: 'Banery reklamowe',
    description: 'Kreacje na Google Display, Meta i Programmatic — z hasłami i CTA',
    driveFolder: 'Kampanie banerowe',
    available: true,
    accent: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'products',
    label: 'Grafiki produktowe',
    description: 'Zdjęcia produktów w scenach lifestyle na social media',
    driveFolder: 'Grafiki produktowe',
    available: true,
    accent: 'from-rose-500 to-orange-500',
  },
]

export function getModule(id) {
  return CLIENT_MODULES.find((m) => m.id === id) || null
}
