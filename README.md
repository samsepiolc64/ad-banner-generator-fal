# Banner Generator — fal.ai

Aplikacja webowa do generowania kreacji reklamowych (bannerów display) dla Google Ads, Meta Ads, LinkedIn i programmatic. Generuje gotowe obrazy w zadanych formatach na podstawie danych marki i kampanii — bez Photoshopa, bez designera.

---

## Spis treści

1. [Szybki start](#szybki-start)
2. [Stack technologiczny](#stack-technologiczny)
3. [Architektura](#architektura)
4. [Zmienne środowiskowe](#zmienne-środowiskowe)
5. [Struktura plików](#struktura-plików)
6. [Kluczowe koncepcje](#kluczowe-koncepcje)
7. [Testy](#testy)
8. [Deploy](#deploy)
9. [Znane ograniczenia i gotchas](#znane-ograniczenia-i-gotchas)

---

## Szybki start

```bash
npm install
cp .env.example .env          # uzupełnij zmienne (patrz sekcja poniżej)
netlify dev                   # frontend :8888 + Netlify Functions
```

> **Wymaganie:** `FAL_API_KEY` jest obowiązkowy. Bez niego generowanie obrazów nie działa.
> `ANTHROPIC_API_KEY` jest opcjonalny — pozwala na auto-research domeny i AI-generowane hasła.

Produkcyjny build:
```bash
npm run build    # output → dist/
```

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | React 18 + Vite 6 + Tailwind CSS |
| Backend (serverless) | Netlify Functions (ES modules) |
| AI — generowanie obrazów | fal.ai Nano Banana 2 / Nano Banana Pro |
| AI — research domeny + copy | Anthropic Claude API (claude-sonnet-4-5) |
| Cache danych marki | Supabase (L2) + localStorage (L1) |
| Deploy | Netlify (auto-deploy z `main`) |

---

## Architektura

### Flow aplikacji — 3-krokowy stepper

```
Krok 1: CampaignForm          Krok 2: BrandForm              Krok 3: GeneratorPanel
──────────────────────        ───────────────────────        ──────────────────────
• domena klienta              • auto-research (Claude API)   • upload logo
• cel kampanii                  lub wypełnienie ręczne       • generowanie
• kanały (GDN / Meta / ...)   • kolory, typografia, USP       format × variant
• formaty bannerów            • styl, audience               • progress bar
• warianty (1–5)              • dane konkurencji             • podgląd + download
• headline + CTA
• zdjęcie produktu (opcja)
```

### Generowanie jednego bannera

```
CampaignForm + BrandForm
        │
        ▼
buildPrompt()           ← promptBuilder.js
(prompt tekstowy)
        │
        ▼
resolveModel(format)    ← modelRouting.js
(nb2 / nbpro + AR)
        │
        ▼
/.netlify/functions/generate-image
(proxy do fal.ai queue API)
        │
        ▼
fal.ai Nano Banana 2 / Pro
(wygenerowany obraz)
        │
        ▼
imageUtils.js           (crop jeśli needsResize, kompresja JPEG ≤500KB)
        │
        ▼
podgląd + przycisk download
```

### Netlify Functions

| Endpoint | Plik | Timeout | Opis |
|----------|------|---------|------|
| `/.netlify/functions/generate-image` | `netlify/functions/generate-image.js` | 60s | Proxy do fal.ai queue API (chroni API key przed frontendem) |
| `/.netlify/functions/research-domain` | `netlify/functions/research-domain.js` | 60s | Research domeny przez Claude API — zwraca dane marki jako JSON |
| `/.netlify/functions/generate-copy` | `netlify/functions/generate-copy.js` | 30s | AI-generowane hasła per wariant (dwuczęściowe `"Primary\nSecondary"`) |

---

## Zmienne środowiskowe

Skopiuj `.env.example` → `.env` i uzupełnij:

| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `FAL_API_KEY` | ✅ Tak | Klucz API fal.ai — [fal.ai/dashboard](https://fal.ai/dashboard) |
| `ANTHROPIC_API_KEY` lub `CLAUDE_API_KEY` | ⚪ Nie | Klucz Anthropic — do auto-researchu domeny i generowania haseł |

Na Netlify dodaj zmienne w: **Site settings → Environment variables**.

---

## Struktura plików

```
ad-banner-generator-fal/
├── netlify/
│   └── functions/
│       ├── generate-image.js     # proxy fal.ai (wymagany: FAL_API_KEY)
│       ├── research-domain.js    # research Claude (opcjonalny: ANTHROPIC_API_KEY)
│       └── generate-copy.js      # hasła AI (opcjonalny: ANTHROPIC_API_KEY)
│
├── src/
│   ├── components/
│   │   ├── CampaignForm.jsx      # Krok 1 — formularz kampanii
│   │   ├── BrandForm.jsx         # Krok 2 — dane marki + auto-research
│   │   ├── GeneratorPanel.jsx    # Krok 3 — generowanie + podgląd
│   │   ├── ClientList.jsx        # Panel klientów z historią researchu
│   │   └── ScreenshotUploader.jsx # Wspólny komponent upload screenshota strony
│   │
│   ├── lib/
│   │   ├── promptBuilder.js      # ⭐ Budowanie promptów fal.ai (VARIANT_MATRIX, kanały, hierarchy)
│   │   ├── modelRouting.js       # Routing NB2 / NBPro na podstawie AR formatu
│   │   ├── formats.js            # Definicje formatów (Social, IAB, LinkedIn, TikTok)
│   │   ├── domain.js             # Normalizacja domeny, firstLetter()
│   │   ├── researchCache.js      # Cache researchu w localStorage (30 dni)
│   │   └── imageUtils.js         # Crop, kompresja JPEG, logo → dataURL
│   │
│   ├── App.jsx                   # Główna logika stepper + state kampanii
│   └── main.jsx                  # Entry point React
│
├── vitest.config.js              # Konfiguracja testów (Vitest — patrz sekcja Testy)
├── vite.config.js                # Konfiguracja Vite + proxy /netlify/functions
├── netlify.toml                  # Build config, function timeouts, headers
└── package.json
```

---

## Kluczowe koncepcje

### VARIANT_MATRIX — 5 wariantów kreatywnych

W `promptBuilder.js` zdefiniowane są 5 kierunków kreatywnych (editorial/lifestyle), które generują różne style wizualne:

| # | Nazwa | Styl |
|---|-------|------|
| 1 | Hero lifestyle | Full-bleed lifestyle photo, ciepły, editorial |
| 2 | Product w scenie | Produkt w atmosferycznej scenie, aspiracyjny |
| 3 | Editorial split | Podział pionowy: zdjęcie + panel kolorowy |
| 4 | Immersive cinematic | Pełnoekranowa scena kinematyczna |
| 5 | Minimalist éditorial | Dużo negatywnej przestrzeni, luksusowy spokój |

### AI-generowane hasła — format dwuczęściowy

Hasła generowane przez `generate-copy.js` zawierają literalny `\n` między dwoma częściami:

```json
{ "headline": "Zacznij rosnąć\nKompleksowy marketing od jednej agencji" }
```

`promptBuilder.js` automatycznie wykrywa ten podział i tworzy hierarchię typograficzną:
- **LINE 1** — duże, pogrubione (primary)
- LINE 2 — mniejsze, lżejsze (secondary, 55–65% rozmiaru primary)

Użytkownik może też wpisać hasło ręcznie w `textarea` — Enter wstawia `\n`.

### Model routing — NB2 vs NBPro

```
AR formatu w liście NB2_NATIVE → NB2 ($0.08/img), bez resize
AR formatu poza listą          → NBPro ($0.15/img) + center-crop do docelowych wymiarów
```

Natywne AR NB2: `1:1, 16:9, 9:16, 3:2, 4:3, 5:4, 4:5, 3:4, 2:3, 21:9`

Bannery niestandardowe (np. 300×250 = AR 6:5) są generowane w najbliższym natywnym AR, a potem przycinane przez `imageUtils.js`.

### Meta Stories — bezpieczeństwo UI

Format 9:16 na kanale `meta` z `campaignChannels` zawierającym `'Meta Ads'` (ale NIE `'Google Display'`) jest traktowany jako **Stories/Reels**. Dla tego formatu:
- Brak CTA button w obrazie (Meta overlay dodaje swój)
- Safe zones: 14% góra, 33% dół (puste tło)
- Rozbudowany negative prompt z listą elementów UI Instagrama

### Cache researchu — dwie warstwy

```
Próba load: localStorage → brak/stary → Supabase → brak → fetch Claude API
Zapis:      → localStorage (L1, 30 dni) + Supabase (L2, 30 dni)
```

`researchCache.js` normalizuje klucz cache przez usunięcie `https://` i trailing slashy — **ale zachowuje `www.`**. Oznacza to, że `www.firma.pl` i `firma.pl` to różne klucze.

### Zdjęcie produktu — reference image

Użytkownik może wgrać zdjęcie produktu w Kroku 1 (base64 dataURL). Trafia ono do fal.ai jako pierwsze w tablicy `image_urls`:

```js
imageUrls = []
if (productImage) imageUrls.push(productImage)   // produkt jako primary subject
if (hasLogo)      imageUrls.push(logoDataUrl)     // logo na końcu
```

Kolejność ma znaczenie — fal.ai traktuje pierwszy obraz jako główny punkt odniesienia.

---

## Testy

Projekt używa Node.js wbudowanego test runnera (`node:test`) — zero extra dependencies, działa z czystym ESM.

```bash
npm test           # uruchom wszystkie testy
npm run test:watch # watch mode
```

> **Uwaga:** Vitest nie działa gdy katalog nadrzędny zawiera `#` w nazwie (np. `#ClaudeCode`).
> Jest to ograniczenie Vite — `#` jest traktowane jako fragment URL w vite-node.
> `vitest.config.js` jest zachowany do użycia jeśli projekt zostanie przeniesiony do katalogu bez `#`.

### Pokrycie testami

| Plik | Testy | Co jest testowane |
|------|-------|-------------------|
| `domain.test.js` | 21 | `normalizeDomain`, `firstLetter` — edge cases, null, puste stringi |
| `modelRouting.test.js` | 23 | `resolveModel` (10 native ARs), `closestNBProAR`, `costPerImage`, `estimateCost` |
| `researchCache.test.js` | 20 | save/load/clear, wersja schematu, expiry 30 dni, localStorage mock |
| `promptBuilder.test.js` | 62 | VARIANT_MATRIX, headline hierarchy, brand DNA, kanały, Stories UI, cel kampanii, crop zone |

---

## Deploy

**Auto-deploy:** każdy push do `main` na GitHubie wyzwala automatyczny deploy na Netlify.

**Manualne wdrożenie:**
```bash
npm run build
netlify deploy --prod   # lub upload dist/ przez panel Netlify
```

**Konfiguracja:** `netlify.toml`
- Build command: `npm run build`
- Publish dir: `dist`
- Functions dir: `netlify/functions`
- Function timeouts: `generate-image` 60s, `research-domain` 60s, `generate-copy` 30s
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy

---

## Znane ograniczenia i gotchas

### fal.ai queue API — asynchroniczność
Generowanie obrazu nie jest synchroniczne — `generate-image.js` używa `fal.ai/queue/submit` + polling `queue/status` + `queue/result`. Timeout 60s może nie wystarczyć przy obciążonym API.

### `#` w ścieżce katalogu
Jeśli projekt jest w katalogu zawierającym `#` (np. `#ClaudeCode`), Vitest/Vite nie działa (traktuje `#` jako fragment URL). Używamy `node --test` jako workaround.

### Logo hallucination
fal.ai generuje losowe logotypy gdy dostaje nazwę marki w prompcie. W negative prompt jest lista fraz blokujących to zachowanie (`hallucinated logo`, `AI-generated logo floating in empty space` itd.). Logo powinno być zawsze wgrane przez użytkownika w Kroku 3.

### Screenshoty strony
Serwisy do screenshotów (Screenshotone, Thum.io) zostały usunięte z flow — strony chronione Cloudflare pokazywały WAF challenge zamiast treści. Research strony: `HTML fetch → Wayback Machine → domain-only fallback`. Użytkownik może też wgrać screenshot ręcznie.

### Meta Stories safe zones — format procentowy
Opisy safe zones muszą być jako **procenty** (nie opisy słowne jak "platform header area"). fal.ai przy opisach słownych próbował renderować elementy UI Instagrama. Aktualny format w prompcie: `top ~14%`, `bottom ~33%` + rozbudowany negative prompt.

### researchCache vs domain.js — różna normalizacja
`normalizeKey` w `researchCache.js` usuwa `https://` i trailing slash, ale **zachowuje `www.`**.
`normalizeDomain` w `domain.js` usuwa też `www.`.
To są dwie osobne funkcje z różnym zachowaniem — `www.firma.pl` i `firma.pl` to różne klucze w cache.
