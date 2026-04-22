# Banner Generator — fal.ai

## Czym jest ten projekt

Aplikacja webowa do generowania kreacji reklamowych (bannerów) dla Google Display Ads, Meta Ads i Programmatic. Używa fal.ai Nano Banana 2 / Pro do generowania grafik na podstawie promptów budowanych z danych marki i kampanii.

Wersja webowa skilla `ad-banner-generator-fal` z Cowork (Verseo).

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Netlify Functions (serverless)
- **AI Image:** fal.ai Nano Banana 2 ($0.08/img) / Nano Banana Pro ($0.15/img)
- **AI Text (opcjonalnie):** Anthropic Claude API (Haiku 4.5) — auto-research domeny klienta

## Uruchamianie

```bash
npm install
cp .env.example .env   # uzupełnij FAL_API_KEY (wymagane) i ANTHROPIC_API_KEY (opcjonalnie)
netlify dev             # frontend na :8888, Vite dev na :5173
```

Build produkcyjny: `npm run build` → output w `dist/`.

## Architektura

### Flow aplikacji (3-step stepper)

1. **Kampania** (`CampaignForm`) — domena, cel kampanii, kanały, formaty, warianty, headline, CTA
2. **Marka** (`BrandForm`) — dane brandu (kolory, styl, typografia) ręcznie lub auto-research przez Claude API
3. **Generowanie** (`GeneratorPanel`) — upload logo, generowanie format × variant, progress bar, download

### Kluczowe moduły

- `src/lib/promptBuilder.js` — budowanie promptów fal.ai z template (VARIANT_MATRIX × format × brand). Prompt zawiera: specs techniczne, kontekst marki, kierunek kreatywny, copy, wymagania kanału, negative prompt
- `src/lib/modelRouting.js` — routing NB2/NB Pro: natywne AR → NB2, inne → NB Pro + center-crop
- `src/lib/formats.js` — definicje formatów (Social + IAB) z wymiarami i AR
- `src/lib/imageUtils.js` — crop, kompresja JPEG (≤500KB), konwersja logo do data URL
- `netlify/functions/generate-image.js` — proxy do fal.ai queue API (chroni API key)
- `netlify/functions/research-domain.js` — research domeny przez Claude API (Haiku 4.5)

### Model routing

| AR formatu | Model | Koszt | Resize? |
|-----------|-------|-------|---------|
| Natywne NB2 (1:1, 16:9, 9:16, 3:2, 4:3, 5:4, 4:5, 3:4, 2:3, 21:9) | NB2 | $0.08 | Nie |
| Inne AR | NB Pro | $0.15 | Tak (closest native AR + center-crop) |

### Prompt template

Prompty budowane w `promptBuilder.js` zawierają sekcje:
- TECHNICAL SPECS — wymiary, AR, kanał
- BRAND CONTEXT — kolory, typografia, styl, tło
- CANVAS CROP ZONE — dla non-native AR (safe zone obliczana dynamicznie)
- CREATIVE DIRECTION — wariant z VARIANT_MATRIX (5 stylów: Produkt centralny, Lifestyle, Typograficzny, Asymetryczny minimalizm, Dynamiczny)
- AD COPY PLACEMENT — headline + CTA
- CHANNEL-SPECIFIC REQUIREMENTS — reguły per kanał (GDN, Meta, Meta Stories, Programmatic)
- NEGATIVE PROMPT

## Konwencje

- Język UI: polski
- Język promptów fal.ai: angielski
- Komponenty React: functional components z hooks, JSX
- Styl: Tailwind CSS utility classes
- Netlify Functions: ES modules (`export default async`)
- Brak TypeScript — czysty JS/JSX
- Brak testów (jeszcze)
- Brak state managementu poza useState/useCallback

## Zmienne środowiskowe

| Zmienna | Wymagana | Opis |
|---------|----------|------|
| `FAL_API_KEY` | Tak | Klucz API fal.ai |
| `ANTHROPIC_API_KEY` | Nie | Klucz Claude API — do auto-researchu domeny |

## Deploy

Netlify — konfiguracja w `netlify.toml`. Auto-deploy z `main`. Functions timeout: generate-image 60s, research-domain 30s.

## Git — zasady pracy

- **Commity lokalne: tak, zawsze** — po każdej zmianie rób commit lokalny.
- **Push: TYLKO gdy użytkownik napisze "push"** — nigdy nie pushuj samodzielnie.
- **Po commicie zawsze powiedz wprost:** `✅ Commit lokalny — NIE wypchniete. Napisz "push" żeby wdrożyć.`
- **Po pushu zawsze powiedz wprost:** `✅ Wypchniete na GitHub → Netlify zbuduje automatycznie.`
- Powód: każdy push uruchamia deploy na Netlify i zużywa build credits.

## Roadmap (z README)

- Auto-research domeny przez Claude API (podstawowy flow gotowy)
- AI-generowane hasła reklamowe per wariant
- Analiza konkurencji
- Zapisywanie profili brandowych (localStorage lub DB)
- Batch retry dla failed formatów
- Historia generacji
