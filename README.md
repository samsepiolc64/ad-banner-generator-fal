# Banner Generator — fal.ai (Web App)

Aplikacja webowa do generowania kreacji reklamowych (bannerów) przez fal.ai API.
Wersja webowa skilla `ad-banner-generator-fal` z Cowork.

## Stack

- **Frontend:** React 18 + Vite + Tailwind CSS
- **Backend:** Netlify Functions (serverless)
- **AI:** fal.ai Nano Banana 2 / Pro (generowanie grafik)
- **Opcjonalnie:** Anthropic Claude API (automatyczny research domeny)

## Quick Start (lokalnie)

```bash
# 1. Zainstaluj zależności
npm install

# 2. Skopiuj plik środowiskowy
cp .env.example .env

# 3. Wpisz swój klucz fal.ai w .env
#    FAL_API_KEY=FAL-xxxxxxxxxxxxxxxxxxxx

# 4. Zainstaluj Netlify CLI (jeśli nie masz)
npm install -g netlify-cli

# 5. Uruchom lokalnie (frontend + functions)
netlify dev
```

Aplikacja będzie dostępna pod `http://localhost:8888`.

## Deploy na Netlify (darmowy)

### Opcja A: Przez GitHub (rekomendowane)

1. **Utwórz repo na GitHubie** — wrzuć cały folder projektu
2. **Zaloguj się na [netlify.com](https://app.netlify.com)**
3. **"Add new site" → "Import an existing project" → GitHub**
4. Wybierz repo, Netlify auto-wykryje ustawienia z `netlify.toml`
5. **Dodaj zmienne środowiskowe** w Netlify:
   - Site settings → Environment variables → Add variable
   - `FAL_API_KEY` = twój klucz fal.ai
   - `ANTHROPIC_API_KEY` = klucz Claude API (opcjonalnie, do auto-researchu)
6. **Deploy** — każdy push na `main` = automatyczny deploy

### Opcja B: Przez CLI

```bash
# Zaloguj się
netlify login

# Utwórz site
netlify init

# Deploy
netlify deploy --prod
```

## Struktura projektu

```
banner-app/
├── index.html                    # Entry point
├── netlify.toml                  # Netlify config
├── package.json
├── .env.example                  # Template zmiennych środowiskowych
├── src/
│   ├── main.jsx                  # React entry
│   ├── App.jsx                   # Główny komponent (stepper)
│   ├── index.css                 # Tailwind + custom styles
│   ├── components/
│   │   ├── CampaignForm.jsx      # Formularz kampanii (Faza 1)
│   │   ├── BrandForm.jsx         # Dane marki — ręczne lub auto
│   │   ├── LogoUpload.jsx        # Drag & drop logo
│   │   └── GeneratorPanel.jsx    # Panel generowania z progress bar
│   └── lib/
│       ├── formats.js            # Definicje formatów (Social + IAB)
│       ├── modelRouting.js       # Routing NB2/NB Pro
│       ├── promptBuilder.js      # Budowanie promptów (template)
│       └── imageUtils.js         # Crop, compress, logo conversion
└── netlify/
    └── functions/
        ├── generate-image.js     # Proxy fal.ai (chroni API key)
        └── research-domain.js    # Research domeny (wymaga Claude API)
```

## Jak to działa

1. **Kampania** — wypełniasz formularz (domena, cel, kanały, formaty, warianty)
2. **Marka** — wpisujesz dane brandu (kolory, styl) lub auto-research przez Claude API
3. **Generowanie** — wgrywasz logo (opcjonalnie), wybierasz folder, klikasz "Generuj"
   - Każdy format generowany osobno przez fal.ai
   - Non-native AR → automatyczny center-crop
   - Kompresja do JPEG ≤500KB
   - Zapis do wybranego folderu (File System Access API) lub Downloads

## Koszty

- **Hosting Netlify:** $0 (free tier: 125k req/mies.)
- **fal.ai NB2:** $0.08/img (natywne AR)
- **fal.ai NB Pro:** $0.15/img (niestandardowe AR)
- **Claude API (opcja):** ~$0.01-0.03 per research domeny

## Roadmap

- [ ] Auto-research domeny przez Claude API (gdy klucz dostępny)
- [ ] AI-generowane hasła reklamowe per wariant
- [ ] Analiza konkurencji (Faza 2b ze skilla)
- [ ] Zapisywanie profili brandowych (localStorage lub DB)
- [ ] Batch retry dla failed formatów
- [ ] Historia generacji
