/**
 * Available banner formats organized by channel.
 * Matches the skill's format definitions.
 */

export const FORMAT_GROUPS = {
  social: {
    label: 'Social / Meta Ads',
    formats: [
      { id: 'meta-1200x628', label: '1200×628', width: 1200, height: 628, ar: '16:9', channel: 'meta' },
      { id: 'meta-1920x1080', label: '1920×1080', width: 1920, height: 1080, ar: '16:9', channel: 'meta' },
      { id: 'meta-1200x1200', label: '1200×1200', width: 1200, height: 1200, ar: '1:1', channel: 'meta' },
      { id: 'meta-1080x1080', label: '1080×1080', width: 1080, height: 1080, ar: '1:1', channel: 'meta' },
      { id: 'meta-960x1200', label: '960×1200', width: 960, height: 1200, ar: '4:5', channel: 'meta' },
      { id: 'meta-1080x1350', label: '1080×1350', width: 1080, height: 1350, ar: '4:5', channel: 'meta' },
      { id: 'meta-1080x1920', label: '1080×1920', width: 1080, height: 1920, ar: '9:16', channel: 'meta' },
    ],
  },
  display: {
    label: 'Display (IAB Standard)',
    formats: [
      { id: 'gdn-300x250', label: '300×250', width: 300, height: 250, ar: '6:5', channel: 'gdn' },
      { id: 'gdn-300x600', label: '300×600', width: 300, height: 600, ar: '1:2', channel: 'gdn' },
      { id: 'gdn-728x90', label: '728×90', width: 728, height: 90, ar: '8:1', channel: 'gdn' },
      { id: 'gdn-970x250', label: '970×250', width: 970, height: 250, ar: '4:1', channel: 'gdn' },
      { id: 'gdn-160x600', label: '160×600', width: 160, height: 600, ar: '4:15', channel: 'gdn' },
      { id: 'gdn-320x50', label: '320×50', width: 320, height: 50, ar: '32:5', channel: 'gdn' },
    ],
  },
  linkedin: {
    label: 'LinkedIn Ads',
    formats: [
      { id: 'li-1200x627',  label: '1200×627',  width: 1200, height: 627,  ar: '1.91:1', channel: 'linkedin' },
      { id: 'li-1200x1200', label: '1200×1200', width: 1200, height: 1200, ar: '1:1',    channel: 'linkedin' },
      { id: 'li-1080x1080', label: '1080×1080', width: 1080, height: 1080, ar: '1:1',    channel: 'linkedin' },
    ],
  },
  tiktok: {
    label: 'TikTok Ads',
    formats: [
      { id: 'tt-1080x1920', label: '1080×1920', width: 1080, height: 1920, ar: '9:16', channel: 'tiktok' },
      { id: 'tt-1080x1080', label: '1080×1080', width: 1080, height: 1080, ar: '1:1',  channel: 'tiktok' },
      { id: 'tt-1280x720',  label: '1280×720',  width: 1280, height: 720,  ar: '16:9', channel: 'tiktok' },
    ],
  },
}

export const ALL_FORMATS = [
  ...FORMAT_GROUPS.social.formats,
  ...FORMAT_GROUPS.display.formats,
  ...FORMAT_GROUPS.linkedin.formats,
  ...FORMAT_GROUPS.tiktok.formats,
]

/** Compute the simplified AR string for display */
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b) }
export function computeAR(w, h) {
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}
