# Generator reklam — fal.ai

Aplikacja webowa do generowania kreacji reklamowych AI dla Google Display, Meta Ads, LinkedIn, TikTok i Programmatic. Generuje gotowe do produkcji banery w 22 formatach na podstawie DNA marki pobranego automatycznie ze strony klienta — bez Photoshopa, bez designera.

---

## Spis treści

1. [Szybki start](#szybki-start)
2. [Setup od zera (nowa instancja)](#setup-od-zera-nowa-instancja)
3. [Stack technologiczny](#stack-technologiczny)
4. [Zmienne środowiskowe](#zmienne-środowiskowe)
5. [Flow aplikacji](#flow-aplikacji)
6. [Architektura](#architektura)
7. [Formaty](#formaty)
8. [Kluczowe koncepcje](#kluczowe-koncepcje)
9. [Struktura plików](#struktura-plików)
10. [Testy](#testy)
11. [Deploy](#deploy)
12. [Znane ograniczenia](#znane-ograniczenia)

---

## Szybki start

```bash
npm install
cp .env.example .env   # uzupełnij przynajmniej FAL_API_KEY
netlify dev             # frontend → :8888, Vite dev → :5173
```

```bash
npm test               # uruchom testy (node:test)
npm run build          # produkcyjny build → dist/
```

---

## Setup od zera (nowa instancja)

Pełna instrukcja postawienia własnej instancji na nowym koncie.

### 1. Repozytorium

```bash
git clone https://github.com/TWOJ-USER/ad-banner-generator-fal.git
cd ad-banner-generator-fal
npm install
cp .env.example .env
```

### 2. fal.ai — generowanie grafik (wymagane)

1. Załóż konto na [fal.ai](https://fal.ai)
2. Dashboard → **API Keys** → utwórz nowy klucz
3. Wpisz do `.env`:
   ```
   FAL_API_KEY=FAL-twoj-klucz
   ```

### 3. Anthropic Claude — AI research i copy (opcjonalne, ale zalecane)

Bez tego klucza research marki i generowanie copy AI nie działają — wszystko trzeba uzupełniać ręcznie.

1. Załóż konto na [console.anthropic.com](https://console.anthropic.com)
2. **API Keys** → utwórz nowy klucz
3. Wpisz do `.env`:
   ```
   ANTHROPIC_API_KEY=sk-ant-twoj-klucz
   ```

### 4. Supabase — baza danych klientów (opcjonalne)

Bez Supabase dane klientów są tylko w localStorage przeglądarki (nie synchronizują się między urządzeniami).

1. Załóż konto na [supabase.com](https://supabase.com) → utwórz nowy projekt
2. **SQL Editor** → wklej i uruchom zawartość pliku [`supabase-schema.sql`](./supabase-schema.sql)
3. **Project Settings → API** → skopiuj **Project URL** i **service_role key** (nie anon!)
4. Wpisz do `.env`:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_KEY=eyJhb...
   ```

### 5. Google Drive — automatyczny zapis grafik (opcjonalne)

1. Otwórz [Google Cloud Console](https://console.cloud.google.com)
2. Utwórz nowy projekt (lub użyj istniejącego)
3. **APIs & Services → Enable APIs** → włącz **Google Drive API**
4. **IAM & Admin → Service Accounts** → utwórz konto serwisowe
5. Przy tworzeniu konta: **Create key → JSON** → pobierz plik z kluczem
6. Z pobranego JSON skopiuj `client_email` i `private_key`
7. Utwórz folder na Google Drive → kliknij prawym na folder → **Share** → dodaj e-mail konta serwisowego z rolą **Editor**
8. Z URL folderu skopiuj ID: `drive.google.com/drive/folders/{FOLDER_ID}`
9. Wpisz do `.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=nazwa@projekt.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nXXX\n-----END PRIVATE KEY-----\n"
   GOOGLE_DRIVE_FOLDER_ID=twoje-folder-id
   ```
   > **Uwaga:** `GOOGLE_PRIVATE_KEY` musi być w cudzysłowie, z dosłownymi `\n` (nie prawdziwymi enterami).

### 6. Basic Auth — ochrona hasłem (opcjonalne)

Jeśli aplikacja ma być dostępna publicznie ale chroniona przed nieuprawnionym dostępem:

```
APP_USER=admin
APP_PASSWORD=silne-haslo
```

Jeśli zmienne nie są ustawione — aplikacja jest dostępna bez logowania.

### 7. Netlify — hosting

1. Załóż konto na [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Połącz z GitHub i wybierz repozytorium
3. Build settings (powinny być wykryte automatycznie z `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Site settings → Environment variables** → dodaj wszystkie zmienne z `.env`
5. **Deploy site** → aplikacja będzie dostępna pod `*.netlify.app`

---

## Stack technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Frontend | React 18 + Vite 6 + Tailwind CSS |
| Serverless | Netlify Functions — Node.js ES modules (18 funkcji) |
| Ikony | lucide-react |
| Generowanie grafik AI | fal.ai — Nano Banana 2 ($0.08), Nano Banana Pro ($0.15), GPT Image 2 ($0.20) |
| AI text | Anthropic Claude API — Haiku 4.5 (research + copy + vision) |
| Cache L2 | Supabase (PostgreSQL) |
| Cache L1 | localStorage (30-dniowy TTL) |
| Cloud storage | Google Drive (service account JWT) |
| Hosting | Netlify (auto-deploy z `main`) |
| Testy | Node.js `node:test` (bez Vitest — problem z `#` w ścieżce) |
| Pre-commit | Husky — blokuje commit gdy testy nie przechodzą |
| CI | GitHub Actions — testy na push i PR |

---

## Zmienne środowiskowe

Skopiuj `.env.example` → `.env`:

| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `FAL_API_KEY` | **TAK** | Klucz fal.ai (tryb testowy i domyślny) |
| `FAL_PROD_API_KEY` | nie | Klucz fal.ai (tryb Klient) — fallback do `FAL_API_KEY` |
| `ANTHROPIC_API_KEY` lub `CLAUDE_API_KEY` | nie | Claude API — research domeny, copy, vision, ocena banerów |
| `SUPABASE_URL` | nie | URL projektu Supabase (lista klientów + koszty) |
| `SUPABASE_SERVICE_KEY` | nie | Supabase **service_role** key (nie anon!) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | nie | Email konta serwisowego Google Drive |
| `GOOGLE_PRIVATE_KEY` | nie | Klucz RSA PEM Drive (w cudzysłowie, z `\n`) |
| `GOOGLE_DRIVE_FOLDER_ID` | nie | ID folderu głównego na Google Drive |
| `SCREENSHOTONE_API_KEY` | nie | Klucz ScreenshotOne — zrzuty stron w research |
| `APP_USER` | nie | Login do Basic Auth (jeśli brak — brak ochrony) |
| `APP_PASSWORD` | nie | Hasło do Basic Auth |

Bez `ANTHROPIC_API_KEY` — tylko ręczne uzupełnianie danych marki.
Bez Supabase — cache wyłącznie w localStorage przeglądarki (nie synchronizuje się między urządzeniami).
Bez Drive — grafiki tylko pobierane lokalnie.

Na Netlify: **Site settings → Environment variables**.

---

## Flow aplikacji

```
┌───────────────────────────────────────────────────────────┐
│  Krok 1: Kampania (CampaignForm)                          │
│  domena · cel kampanii · kanały · formaty · warianty      │
│  headline + CTA                                           │
├───────────────────────────────────────────────────────────┤
│  Krok 2: Materiały (MaterialsForm)                        │
│  wybór modelu AI (Nano Banana 2 / GPT Image 2)            │
│  upload logo · zdjęcie produktu · materiały referencyjne  │
│  klasyfikacja materiałów przez Claude Vision              │
├───────────────────────────────────────────────────────────┤
│  Krok 3: Marka (BrandForm)                                │
│  auto-research przez Claude API lub ręczne uzupełnienie   │
│  kolory · typografia · styl · ton · USP · audience        │
├───────────────────────────────────────────────────────────┤
│  Krok 4: Generowanie (GeneratorPanel)                     │
│  generowanie: każdy format × każdy wariant                │
│  podgląd w kartach · download · Google Drive              │
│  zmiana tekstów · ocena banera AI                         │
└───────────────────────────────────────────────────────────┘
```

### Przepływ danych dla jednego bannera

```
CampaignForm + BrandForm
        │
        ▼
buildPrompt()              ← src/lib/promptBuilder.js
(VARIANT_MATRIX × format × brand DNA)
        │
        ▼
resolveModel(format)       ← src/lib/modelRouting.js
(nb2 / nbpro / gpt-image-2 + AR)
        │
        ▼
generate-image (Netlify)   proxy → fal.ai queue API
        │
        ▼
check-result (polling)     max 15 iteracji, 1.5s interval
        │
        ▼
describe-banner (vision)   Claude → AI caption
        │
        ▼
imageUtils.js              crop (jeśli needsResize) → kompresja JPEG ≤500KB
compositeLogoOnBanner()    smart corner placement + shadow
injectXmpDescription()     XMP APP1 → dc:description (caption)
        │
        ▼
podgląd + download + upload do Google Drive
```

---

## Architektura

### Netlify Functions (18)

| Funkcja | Timeout | Opis |
|---------|---------|------|
| `generate-image` | 90s | Proxy fal.ai — NB2, NBPro, GPT Image 2 |
| `check-result` | 15s | Polling statusu kolejki fal.ai |
| `research-domain` | 60s | Claude research + Supabase cache |
| `generate-copy` | 30s | AI nagłówki per wariant (format `"LINE1\nLINE2"`) |
| `describe-banner` | 30s | Claude Vision — analiza bannera (tryb "Zmień teksty") |
| `classify-images` | 30s | Claude Vision — klasyfikacja wgranych obrazów (product / banner / mood) |
| `describe-materials` | 45s | Claude Vision — opisuje materiały referencyjne dla GPT Image 2 (t2i) |
| `evaluate-banner` | 30s | Claude Vision — ocena bannera wg kryteriów kanału (GDN / Meta / TikTok) |
| `fetch-image-proxy` | 15s | Server-side proxy obrazów — obejście hotlink protection (+ Wayback fallback) |
| `remove-bg` | 30s | fal.ai Birefnet v2 — usuwanie tła logo |
| `fetch-url-content` | 25s | Pobieranie strony (direct → Jina.ai → Wayback) |
| `add-cost` | 10s | Aktualizacja kosztów USD w Supabase |
| `list-clients` | 10s | Lista klientów z Supabase |
| `update-client-meta` | 10s | Zapis opiekuna i celu kampanii |
| `delete-client` | — | Usunięcie klienta z Supabase |
| `upload-to-drive` | 30s | Upload JPEG/PNG na Google Drive |
| `get-drive-folder` | — | Wyszukanie folderu Drive |
| `ensure-drive-folders` | — | Tworzenie hierarchii folderów Drive |

### Routing modeli

| AR formatu | Model | Koszt | Resize? |
|-----------|-------|-------|---------|
| Natywne NB2: 1:1, 16:9, 9:16, 3:2, 4:3, 5:4, 4:5, 3:4, 2:3, 21:9 | NB2 | $0.08 | Nie |
| Inne AR (np. 6:5 dla 300×250, 8:1 dla 728×90) | NB Pro | $0.15 | Tak — center-crop |
| Wszystkie AR | GPT Image 2 | $0.20 | Nie |

Implementacja: `src/lib/modelRouting.js`

---

## Formaty (22)

**Meta / Social (7)**

| ID | Wymiary | Kanał |
|----|---------|-------|
| `meta-1200x628` | 1200×628 | Feed |
| `meta-1920x1080` | 1920×1080 | Feed HD |
| `meta-1200x1200` | 1200×1200 | Feed kwadrat |
| `meta-1080x1080` | 1080×1080 | Feed kwadrat |
| `meta-960x1200` | 960×1200 | Portrait |
| `meta-1080x1350` | 1080×1350 | Portrait |
| `meta-1080x1920` | 1080×1920 | Stories / Reels |

**Display IAB (6)**

| ID | Wymiary | Kanał |
|----|---------|-------|
| `gdn-300x250` | 300×250 | Medium rectangle |
| `gdn-300x600` | 300×600 | Half page |
| `gdn-728x90` | 728×90 | Leaderboard |
| `gdn-970x250` | 970×250 | Billboard |
| `gdn-160x600` | 160×600 | Wide skyscraper |
| `gdn-320x50` | 320×50 | Mobile banner |

**LinkedIn (3)**

| ID | Wymiary |
|----|---------|
| `li-1200x627` | 1200×627 |
| `li-1200x1200` | 1200×1200 |
| `li-1080x1080` | 1080×1080 |

**TikTok (3)**

| ID | Wymiary |
|----|---------|
| `tt-1080x1920` | 1080×1920 |
| `tt-1080x1080` | 1080×1080 |
| `tt-1280x720` | 1280×720 |

---

## Kluczowe koncepcje

### VARIANT_MATRIX — 5 wariantów kreatywnych

Zdefiniowane w `src/lib/promptBuilder.js`:

| # | Nazwa | Styl |
|---|-------|------|
| 1 | Hero lifestyle | Full-bleed foto, gradient overlay, ciepły editorial |
| 2 | Product w scenie | Produkt jako hero w bogatej atmosferze, lookbook |
| 3 | Editorial split | Podział pionowy: zdjęcie + panel kolorowy marki |
| 4 | Immersive cinematic | Pełnoekranowa scena kinematograficzna |
| 5 | Minimalist éditorial | Dużo negatywnej przestrzeni, cicha luksusowość |

### Typograficzna hierarchia nagłówka

Hasła mogą zawierać literalny `\n` jako separator dwóch linii:

```
"Zwiększ sprzedaż\nKompleksowy marketing od Verseo"
```

`promptBuilder.js` automatycznie tworzy hierarchię:
- **LINE 1** — duże, pogrubione (primary)
- LINE 2 — mniejsze, lżejsze (55–65% rozmiaru LINE 1)

Użytkownik może wpisać hasło ręcznie — Enter wstawia `\n`. AI-generowane nagłówki (`generate-copy`) też produkują format dwuliniowy.

### Auto-research marki

1. Pobiera HTML strony: direct → Jina.ai Reader → Wayback Machine
2. Analizuje przez Claude API → strukturyzowane DNA marki (kolory, fonty, USP, ton, motywy)
3. Cache L1 (localStorage, 30 dni) + L2 (Supabase, bezterminowy)
4. Zabezpieczenia: brand name musi matchować domenę (anti-hallucination)

### Logo compositing

`compositeLogoOnBanner()` w `imageUtils.js`:
- Inteligentny wybór narożnika — analiza luminancji i gęstości krawędzi
- Adaptacyjny rozmiar wg AR bannera (14–22% szerokości)
- Cień dopasowany do sceny — wykrywa kierunek oświetlenia
- Pomija placement gdy narożnik zawiera tekst (edge density > 7%)
- Usuwanie białego tła: flood-fill po stronie klienta + AI (fal.ai Birefnet) jako opcja

### XMP metadata (caption AI)

`injectXmpDescription()` w `imageUtils.js` — czysta binarna injekcja APP1 w JPEG:
- Pole `dc:description` — czytelne w Lightroom, Bridge, Photoshop, Windows Explorer
- Caption generowany przez Claude Vision po wygenerowaniu bannera
- Bez zewnętrznych bibliotek — własna implementacja segmentu JPEG

### Tryb "Zmień teksty"

1. Claude Vision analizuje baner → JSON z opisem sceny (bez tekstu)
2. Nowy prompt z nowymi hasłami + opis sceny → regeneracja przez fal.ai
3. Plik zapisywany z sufiksem `_edytowany`
4. Działa z NB2, NBPro i GPT Image 2

### Śledzenie kosztów

- Każde generowanie dodaje koszt do Supabase (`brand_research.cost_usd`)
- Cross-browser (Supabase) + lokalnie (localStorage backup)
- Widoczne w liście klientów jako badge z kwotą USD

### Meta Stories — safe zones

Format 9:16 na kanale Meta (bez GDN) = Stories/Reels:
- Brak CTA w prompcie (Meta dodaje własny overlay)
- Safe zone: top `~14%`, bottom `~33%` — czyste tło, bez elementów
- Rozbudowany negative prompt blokujący UI Instagrama

---

## Struktura plików

```
ad-banner-generator-fal/
├── netlify/
│   ├── functions/               # 18 Netlify Functions (ES modules)
│   │   ├── generate-image.js    # proxy fal.ai queue
│   │   ├── check-result.js      # polling kolejki fal.ai
│   │   ├── research-domain.js   # Claude research + Supabase cache
│   │   ├── generate-copy.js     # AI nagłówki
│   │   ├── describe-banner.js   # Claude Vision (Zmień teksty)
│   │   ├── classify-images.js   # Claude Vision — klasyfikacja obrazów
│   │   ├── describe-materials.js # Claude Vision — opis materiałów dla GPT Image 2
│   │   ├── evaluate-banner.js   # Claude Vision — ocena bannera
│   │   ├── fetch-image-proxy.js # server-side proxy obrazów (hotlink bypass)
│   │   ├── remove-bg.js         # fal.ai Birefnet
│   │   ├── fetch-url-content.js # Jina.ai + Wayback fallback
│   │   ├── add-cost.js          # tracking kosztów
│   │   ├── list-clients.js      # lista klientów
│   │   ├── update-client-meta.js
│   │   ├── delete-client.js
│   │   ├── upload-to-drive.js
│   │   ├── get-drive-folder.js
│   │   └── ensure-drive-folders.js
│   └── edge-functions/
│       └── basic-auth.js        # Basic Auth (ochrona dostępu)
│
├── src/
│   ├── components/
│   │   ├── CampaignForm.jsx         # Krok 1 — kampania
│   │   ├── MaterialsForm.jsx        # Krok 2 — model AI + logo + materiały ref.
│   │   ├── BrandForm.jsx            # Krok 3 — marka + research
│   │   ├── GeneratorPanel.jsx       # Krok 4 — generowanie banerów
│   │   ├── ClientList.jsx           # Panel klientów
│   │   ├── LogoUpload.jsx           # Upload logo + usuwanie tła
│   │   ├── ScreenshotUploader.jsx   # Upload screenshota
│   │   ├── ResearchDiff.jsx         # Porównanie starych/nowych danych
│   │   ├── Sidebar.jsx              # Nawigacja + dark mode
│   │   └── ModulePicker.jsx         # Wybór modułu (banery / produkty)
│   │
│   └── lib/
│       ├── formats.js               # 22 formaty z wymiarami i AR
│       ├── modelRouting.js          # Routing NB2/NBPro/GPT Image 2
│       ├── promptBuilder.js         # VARIANT_MATRIX + budowanie promptów
│       ├── imageUtils.js            # Crop, kompresja, logo, XMP
│       ├── domain.js                # Normalizacja domeny
│       ├── researchCache.js         # Cache L1 (localStorage, 30 dni)
│       ├── clientModules.js         # Konfiguracja modułów (banery, produkty)
│       ├── productFormats.js        # Formaty modułu produktowego
│       ├── productPromptBuilder.js  # Prompty produktowe (NB2/NBPro)
│       ├── gptImage2PromptBuilder.js          # Prompty GPT Image 2
│       ├── gptImage2ProductPromptBuilder.js   # Prompty GPT Image 2 + produkty
│       ├── extractAdCopy.js         # Wyciąganie headline/CTA z tekstu bannera
│       ├── extractAdCopy.test.js
│       ├── clientCosts.js           # Śledzenie kosztów
│       └── teamMembers.js           # Konfiguracja zespołu
│
├── public/
│   └── favicon.svg              # Animowana ikona — gradientowa kula SVG (SMIL)
│
├── netlify.toml                 # Build + timeouty + nagłówki bezpieczeństwa
├── .env.example                 # Szablon zmiennych środowiskowych
└── package.json
```

---

## Testy

Projekt używa wbudowanego runnera Node.js (`node:test`) — zero extra dependencies, działa z czystym ESM.

```bash
npm test            # uruchom wszystkie testy
npm run test:watch  # watch mode
```

> **Uwaga:** Vitest nie działa gdy w ścieżce projektu jest znak `#` (np. `#ClaudeCode`).
> Vite traktuje `#` jako fragment URL w ścieżkach modułów. `node --test` jest workaroundem.

### Pokrycie testami (186 testów)

| Plik | Testy | Co testuje |
|------|-------|-----------|
| `domain.test.js` | 21 | `normalizeDomain`, `firstLetter` — edge cases, null, pustki |
| `modelRouting.test.js` | 23 | `resolveModel` (10 native ARs), `closestNBProAR`, `estimateCost` |
| `researchCache.test.js` | 20 | save/load/clear, wersja schematu, TTL 30 dni, localStorage mock |
| `promptBuilder.test.js` | 62 | VARIANT_MATRIX, headline hierarchy, brand DNA, kanały, Stories UI |
| `imageUtils.test.js` | 60 | crop, kompresja JPEG, XMP injection, logo compositing |

Pre-commit hook (Husky) blokuje commit gdy testy nie przechodzą.
GitHub Actions uruchamia testy na każdy push i PR.

---

## Deploy

**Auto-deploy:** każdy push do `main` wyzwala deploy na Netlify.

**Manualne wdrożenie:**
```bash
npm run build
netlify deploy --prod
```

**Konfiguracja `netlify.toml`:**
- Build: `npm run build` → `dist/`
- Functions: `netlify/functions/` — bundler `nft`, external modules `*`
- Edge functions: `netlify/edge-functions/`
- Timeouty: generate-image 90s, research-domain 60s, generate-copy/remove-bg 30s, fetch-url-content 25s, client ops 10s
- Nagłówki: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`

---

## Znane ograniczenia

**fal.ai queue API — asynchroniczność**
Generowanie jest asynchroniczne: submit → polling status → fetch result. Timeout 90s może nie wystarczyć przy bardzo obciążonym API.

**Równoległe generowanie — max 3**
Limit do 3 jednoczesnych requestów do Netlify Functions żeby nie przekroczyć limitu edge functions.

**`#` w ścieżce projektu**
Vitest/Vite nie działa z `#` w ścieżce katalogu. Workaround: `node --test`.

**XMP segment — max 65KB**
Ograniczenie JPEG APP1. Przy bardzo długich captionach (mało prawdopodobne) XMP nie zostanie wstrzyknięty — funkcja wraca oryginalny blob bez błędu.

**Logo hallucination**
fal.ai czasem generuje losowe logotypy w prompcie. Rozbudowany negative prompt blokuje to zachowanie. Logo należy zawsze wgrywać przez interfejs — nie podawać nazwy marki jako "wygeneruj logo".

**Meta Stories safe zones**
Opisy tekstowe jak "platform header area" mogą powodować renderowanie UI Instagrama na banerze. Aktualnie używamy `top ~14%` / `bottom ~33%` + negative prompt z listą elementów UI.

**www. vs brak www. w cache**
`researchCache.js` normalizuje klucz cache ale zachowuje `www.` — `www.firma.pl` i `firma.pl` to różne klucze cache. `domain.js` usuwa `www.` — to różne funkcje z różnym zachowaniem.

---

## Roadmap

- [ ] Batch retry dla nieudanych formatów
- [ ] Historia generacji per klient
- [ ] Zapisywanie profili brandowych poza Supabase cache
- [ ] Analiza konkurencji w promptach
- [ ] Dodatkowe warianty dla modułu produktowego
