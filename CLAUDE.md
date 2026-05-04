# Banner Generator — fal.ai

## Czym jest ten projekt

Aplikacja webowa do generowania kreacji reklamowych (bannerów) dla Google Display Ads, Meta Ads i Programmatic. Używa fal.ai Nano Banana 2 / Pro do generowania grafik na podstawie promptów budowanych z danych marki i kampanii.

Wersja webowa skilla `ad-banner-generator-fal` z Cowork (Verseo).

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Netlify Functions (serverless)
- **AI Image:** fal.ai Nano Banana 2 ($0.08/img) / Nano Banana Pro ($0.15/img) lub GPT Image 2 (OpenAI)
- **AI Text (opcjonalnie):** Anthropic Claude API (Haiku 4.5) — auto-research domeny klienta

## Uruchamianie

```bash
npm install
cp .env.example .env   # uzupełnij FAL_API_KEY (wymagane) i ANTHROPIC_API_KEY (opcjonalnie)
netlify dev             # frontend na :8888, Vite dev na :5173
```

Build produkcyjny: `npm run build` → output w `dist/`.

## Architektura

### Flow aplikacji (4-step stepper)

1. **Kampania** (`CampaignForm`) — domena, cel kampanii, kanały, formaty, warianty, headline, CTA
2. **Materiały** (`MaterialsForm`) — wybór modelu AI, logo, materiały referencyjne (bannery wzorcowe), notatki
3. **Marka** (`BrandForm`) — dane brandu (kolory, styl, typografia) ręcznie lub auto-research przez Claude API
4. **Generowanie** (`GeneratorPanel`) — generowanie format × variant, progress bar, download

### Kluczowe moduły

- `src/lib/promptBuilder.js` — budowanie promptów fal.ai (VARIANT_MATRIX × format × brand). Prompt zawiera: specs techniczne, kontekst marki, kierunek kreatywny, copy (z override z notatek), wymagania kanału, negative prompt
- `src/lib/gptImage2PromptBuilder.js` — analogiczny builder dla GPT Image 2 (ten sam VARIANT_MATRIX, ta sama logika override notatek)
- `src/lib/modelRouting.js` — routing NB2/NB Pro: natywne AR → NB2, inne → NB Pro + center-crop
- `src/lib/formats.js` — definicje formatów (Social + IAB) z wymiarami i AR
- `src/lib/imageUtils.js` — kompozyt logo na banerze (bez cieni), kompresja JPEG (≤500KB, start q=0.97), konwersja logo do data URL
- `netlify/functions/generate-image.js` — proxy do fal.ai queue API (chroni API key)
- `netlify/functions/research-domain.js` — research domeny przez Claude API (Haiku 4.5)

### Model routing

| AR formatu | Model | Koszt | Resize? |
|-----------|-------|-------|---------|
| Natywne NB2 (1:1, 16:9, 9:16, 3:2, 4:3, 5:4, 4:5, 3:4, 2:3, 21:9) | NB2 | $0.08 | Nie |
| Inne AR | NB Pro | $0.15 | Tak (closest native AR + center-crop) |

### Prompt template

Prompty budowane w `promptBuilder.js` i `gptImage2PromptBuilder.js` zawierają sekcje:
- TECHNICAL SPECS — wymiary, AR, kanał
- BRAND CONTEXT — kolory, typografia, styl, tło (pomijane dla wariantu "Z wzoru referencyjnego")
- CANVAS CROP ZONE — dla non-native AR (safe zone obliczana dynamicznie)
- CREATIVE DIRECTION — wariant z VARIANT_MATRIX (10 wariantów, patrz niżej)
- CLIENT AD COPY / AD COPY PLACEMENT — headline + CTA; jeśli użytkownik wpisał hasło/CTA w notatki, sekcja CLIENT AD COPY ma absolutny priorytet (VERBATIM), AD COPY PLACEMENT jest tylko fallbackiem
- CHANNEL-SPECIFIC REQUIREMENTS — reguły per kanał (GDN, Meta, Meta Stories, Programmatic)
- NEGATIVE PROMPT

### VARIANT_MATRIX (10 wariantów)

| Indeks | Nazwa | Uwagi |
|--------|-------|-------|
| 0 | Hero lifestyle | |
| 1 | Product w scenie | |
| 2 | Editorial split | |
| 3 | Immersive cinematic | |
| 4 | Minimalist éditorial | |
| 5 | Typograficzny Bold | |
| 6 | Gradient Premium | |
| 7 | Social Proof | |
| 8 | UGC / Authentic | |
| 9 | Z wzoru referencyjnego | Wymaga uploadu banneru wzorcowego; marka jest tylko "swap info" — wzorzec jest jedynym autorytetem wizualnym |

### Wariant "Z wzoru referencyjnego" — zachowanie

- Flaga `variant.isLayoutRef = true` → prompt przełącza się w tryb MAXIMUM VISUAL FIDELITY
- Pomijane: brand DNA, paleta kolorów, dyrektywy editorial, GOAL_DIRECTIVES
- Używane: `layoutRefBrandInfo` (tylko nazwa marki, domena, branża) + opis zamiany (headline + CTA)
- AI ma ZREPLIKOWAĆ wzorzec: tło, kolory, fixed elementy (stopki, naroża, paski), layout, typografię
- Jedyne dwie rzeczy do podmiany: tekst headline + etykieta CTA
- `requireBannerRef={true}` w `MaterialsForm` gdy wariant 9 wybrany → przycisk "Generuj" zablokowany bez pliku wzorca

### Logo composite — `imageUtils.js`

- `compositeLogoOnBanner()` — 3 ścieżki: solid-bg panel / alpha+dark backing / alpha+clean direct
- **Bez cieni** — wszystkie `ctx.shadow*` usunięte
- Kompresja JPEG: start q=0.97, krok 0.03 do q=0.70; potem krok 0.05 do q=0.50; ostateczność: scale-down canvas

## Konwencje

- Język UI: polski
- Język promptów fal.ai: angielski
- Komponenty React: functional components z hooks, JSX
- Styl: Tailwind CSS utility classes
- Netlify Functions: ES modules (`export default async`)
- Brak TypeScript — czysty JS/JSX
- Testy: `npm test` — node:test runner, pliki `*.test.js` (204 testów)
- Brak state managementu poza useState/useCallback

## Ikony — konwencja

**Wszystkie ikony w UI muszą być płaskie, jednokolorowe SVG** (nie kolorowe emoji ani znaki ASCII jak ▼ ▲ ↻ ⏹ ✕ ✓).

- Biblioteka: `lucide-react` (zainstalowana)
- Sidebar i `lib/modules.jsx` używają inline SVG w tym samym stylu — nie zmieniaj
- Kolor: `currentColor` — ikona dziedziczy kolor po tekście (zachowaj `text-brand-green`/`text-brand-red`/`text-brand-orange` na rodzicu, by zachować semantykę statusu)
- Standard rozmiarów:
  - `size={12}` — bardzo małe inline (chevron, X w przyciskach `text-[10/11px]`)
  - `size={14}` — inline w przyciskach `text-xs`
  - `size={16}` — standardowe akcje (`text-sm`)
  - `size={18}` — duże CTA (główny przycisk akcji)
  - `size={20–24}` — placeholdery/thumbnaile
- Standard `strokeWidth`: `1.6`–`1.8` dla zwykłych, `2`+ dla małych/grubych akcentów
- Wyrównanie z tekstem: `inline-flex items-center gap-1.5` (lub `gap-1` dla bardzo małych, `gap-2` dla CTA)
- Dostępność: `aria-hidden` przy ikonach dekoracyjnych obok tekstu; `flex-shrink-0` w pojemnikach, gdzie tekst może się skracać
- Mapowanie najczęstszych ikon:
  - `CheckCircle2` — sukces / `done`
  - `XCircle` — błąd / `error`
  - `Zap` — generowanie / aktywna akcja
  - `Clock` — `idle` / oczekuje
  - `RotateCcw` — retry / regeneruj
  - `Square` (z `fill="currentColor"`) — stop
  - `ChevronUp/Down` — toggle sekcji
  - `X` — zamknij / usuń / anuluj
  - `Check` — confirm
  - `Folder` / `FolderOpen` — wybór folderu / drag&drop
  - `ImageIcon` — placeholder grafiki
  - `Pencil` — edytuj
  - `Sparkles` — operacja AI
  - `AlertTriangle` — ostrzeżenie
  - `Info` — informacja

**Nie dodawaj** kolorowych emoji (📁 📷 ✅ ❌ ⚡ 🧠 ⚠️ itp.) ani znaków ASCII jako ikon w nowym kodzie.

## Zmienne środowiskowe

| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `FAL_API_KEY` | Tak | Klucz API fal.ai |
| `ANTHROPIC_API_KEY` | Nie | Klucz Claude API — do auto-researchu domeny |

## Deploy

Netlify — konfiguracja w `netlify.toml`. Auto-deploy z `main`. Functions timeout: generate-image 60s, research-domain 30s.

## Git — zasady pracy (OBOWIĄZKOWE — nie pomijaj)

### ⛔ PUSH — ŻELAZNA REGUŁA
**NIGDY nie pushuj bez wyraźnego "push" od użytkownika.**
Nawet jeśli zmiany są gotowe, commit zrobiony, testy przechodzą — CZEKAJ.
Każdy push = deploy na Netlify = build credits. Decyzja należy do użytkownika.

### ✅ TESTY — zawsze przed commitem
Przed każdym `git commit` uruchom `npm test` i pokaż wynik.
Jeśli testy nie przechodzą — NIE commituj, napraw najpierw.

### 📢 FORMAT KOMUNIKATÓW — obowiązkowy
Po każdym commicie i po każdym pushu wyświetl blok w tym formacie (dosłownie):

Po commicie:
```
*****************************************************
**  ✅ TESTY: [X]/[X] passed                       **
**  ✅ COMMIT: [skrót] — [tytuł commitu]           **
**  ⏳ PUSH: oczekuje na "push" od Ciebie          **
*****************************************************
```

Po pushu:
```
*****************************************************
**  ✅ PUSH: wypchniete na GitHub (main)           **
**  🚀 Netlify buduje automatycznie               **
*****************************************************
```

## Roadmap (z README)

- Auto-research domeny przez Claude API (podstawowy flow gotowy)
- AI-generowane hasła reklamowe per wariant
- Analiza konkurencji
- Zapisywanie profili brandowych (localStorage lub DB)
- Batch retry dla failed formatów
- Historia generacji
