# Changelog

Wszystkie istotne zmiany w projekcie są dokumentowane w tym pliku.
Format oparty na [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

---

## 2026-04-27

### Dodano
- **GPT Image 2** jako alternatywny model generowania grafik ($0.20/img) — selektor modelu w obu przepływach (banery + produkty)
- **Tryb "Zmień teksty" dla GPT Image 2** — pełna obsługa edycji nagłówków
- **Animowana favikonka** — płynna gradientowa kula SVG (niebieski→czerwony), animacja SMIL 1.8s/obrót
- **XMP metadata w JPEG** — AI caption (Claude Vision) wstrzykiwany do `dc:description` APP1; czytelny w Lightroom, Bridge, Windows Explorer
- **Karty banerów 2× większe** — siatka `minmax(440px, 1fr)`, wysokość miniaturki 320px (było 160px)
- **Opisy AI generowane i wyświetlane** pod kartą bannera

### Zmieniono
- Tryb `falMode` domyślnie ustawiony na `'prod'` (było `'test'`)
- Responsywne przyciski w `ClientList` — ikony na wszystkich przyciskach, "Drive" → "Google Drive", menu `···` na małych ekranach
- Usunięto redundantną linię z rozmiarem px pod etykietą bannera (rozmiar jest już w nazwie pliku)

### Naprawiono
- Stan przycisku "Generuj wszystkie" w `ProductGeneratorPanel`
- 3 bugi: emoji→SVG icons, `extractJsonObject`, URL podstrony w polu notes
- Usunięto "SAFE ZONES" i wartości procentowe z channel requirements w prompcie (wyciekały na generowane grafiki)

---

## 2026-04-24

### Dodano
- **Diff view w BrandForm** — porównanie starych i nowych danych marki przy manualnym odświeżeniu
- **Jina.ai Reader** jako fallback step-2 dla stron blokujących boty
- **Zapis "bez logo"** — obrazy przed nałożeniem logo zapisywane do podfolderu `bez logo` (lokalnie + Drive)
- **Smart URL detection w notes** — auto-detekcja czy URL to referencja do obrazu czy strona do analizy
- **Build date/time** w sidebarze
- Pobieranie treści podstrony z pola `notes` dla kontekstu Claude

### Zmieniono
- Komponent `ResearchDiff` — edytowalne pola, wyśrodkowane kroki progresji
- Limit równoczesnych generowań: max 3 (ochrona przed timeout edge functions)
- Pomijanie logo gdy narożnik zawiera tekst (edge density check)
- Strip `www.` z nazwy folderu Google Drive

### Naprawiono
- Przeniesienie testu `research-domain` poza `netlify/functions/` (błąd deploy)
- URL stron w polu notes nie są już przekazywane do fal.ai jako `image_urls`

---

## 2026-04-22

### Dodano
- **Per-banner text editor** — edycja headline/CTA i regeneracja per format
- **Tryb "Zmień teksty"** — Claude Vision analizuje scenę → JSON re-describe → NBPro regeneruje z nowymi hasłami (zastąpił FLUX Kontext)
- **Inline podgląd promptów** w każdej karcie bannera
- **Generowanie `prompts.md`** — plik z promptami pobierany razem z banerami
- **En dash enforcement** — `–` zamiast `—` w tekstach overlay

### Zmieniono
- Architektura text-edit: FLUX Kontext → JSON re-describe + NB Pro (stabilniejsze wyniki)

### Usunięto
- Martwy kod FLUX Kontext po udowodnieniu przewagi JSON workflow

### Naprawiono
- Trigger rebuildu promptów przez `useEffect(running)` zamiast async call
- Przycisk download promptów zamiast auto-click (przeglądarka blokowała)
- Przywrócono single-line domain div w ClientList

---

## 2026-04-21

### Dodano
- **186 testów regresji** — `node:test` (5 plików: domain, modelRouting, researchCache, promptBuilder, imageUtils)
- **Husky pre-commit hook** — testy uruchamiane przed każdym commitem
- **GitHub Actions CI** — testy na push i PR
- **Animowany stepper** w trakcie ładowania researchu
- **Screenshotone** przywrócony jako fallback w research flow
- **Wayback Machine** jako fallback #3 dla research (HTML → Jina → Wayback)
- **Manualny upload screenshota** — zawsze dostępny (zwinięty gdy source jest wiarygodny)
- **Lifestyle-first aesthetics** — 5 nowych wariantów editorialnych w VARIANT_MATRIX
- **Auto-typograficzna hierarchia** — dwuczęściowy headline z `\n` (bez osobnego pola subheadline)
- **Refresh danych marki** w panelu klienta
- **Product reference image** jako pierwszy element `image_urls` w fal.ai

### Zmieniono
- Research output w języku polskim (pola opisowe)
- Zabezpieczenia anti-hallucination: brand name musi matchować domenę

### Naprawiono
- Blokowanie renderowania UI Instagrama w formatach 9:16 Meta
- max_tokens 4096 → 8192 dla Claude research
- Detekcja WAF challenge screenshots (traktowane jako brak danych)
- Anti-hallucination prompt dla trybu screenshot

---

## 2026-04-20

### Dodano
- **Dark mode jako domyślny**
- **LinkedIn Ads i TikTok Ads** — nowe kanały kampanii
- **Śledzenie kosztów generowania** — localStorage per klient (badge z kwotą USD)
- **Supabase cost tracking** — koszty cross-browser/device
- **Server-side fetch logo klienta** podczas researchu marki
- **Animacje sekcji** w `CampaignForm` (grid-rows expand/collapse)

### Zmieniono
- `BrandForm` — wizualne pola ukryte za togglem (domyślnie zwinięte)
- Animacje kroków: 400ms → 600ms
- Kontrast przycisków akcji (btn-primary)

### Naprawiono
- Race condition w `ProductGeneratorPanel` przy upload na Drive
- Płynne animacje sekcji w formularzu kampanii

---

## 2026-04-19

### Dodano
- **Moduł produktowy** (`products`) — 4-krokowy flow dla grafik produktowych
- **Module picker** po kliknięciu "+ Nowy klient"
- **Deduplikacja i grupowanie alfabetyczne** listy klientów + wyszukiwarka

### Zmieniono
- Nazwa aplikacji: "Generator reklam"

### Naprawiono
- Animacja panelu, ikona aktywnego modułu w sidebarze

---

## 2026-04-17

### Dodano
- **Auto-upload banerów na Google Drive** po wygenerowaniu
- **Basic Auth** przez Netlify Edge Function (ochrona dostępu)
- **Przycisk folderu Drive** w `ClientList`
- **Tryb TEST/KLIENT** — osobne klucze fal.ai (FAL_API_KEY vs FAL_PROD_API_KEY)

### Naprawiono
- Obsługa Shared Drive w upload Drive
- Wiele iteracji napraw protokołu upload Drive (multipart/related, Authorization header, resumable upload)
- Przekazywanie `falMode` do `check-result` (poprawny klucz API)

---

## 2026-04-16

### Dodano
- **Home screen z listą klientów** — pełnoprzekrojowy responsywny layout
- **Collapsible sidebar** + dark mode toggle
- **Accordion flow** — kroki jako rozwijane sekcje
- **Pre-fill formularza** z danych klienta z listy
- **Refresh brand data** — przycisk odświeżenia w wierszu klienta
- **Delete klienta** z inline potwierdzeniem

### Zmieniono
- Flat UI redesign — modernizacja całego interfejsu
- Usunięto teksty atrybutów i numery wersji z UI

### Naprawiono
- Dark mode — pełny pass wszystkich komponentów
- Flat accordion rows z konsekwentnymi przyciskami "Dalej"
- Usunięto duplikację numeracji z `CampaignForm`
- Pre-fill domeny nie działało — wymuszono remount `CampaignForm` via `key`

---

## 2026-04-15

### Dodano
- **Konwersacyjny formularz krok po kroku** z progressive disclosure
- **Grupowanie w 3 sekcje** (Gdzie / Co / Ile)

### Naprawiono
- Domyślne formaty GDN i Meta Ads (match z faktycznym użyciem)
- Gwarancja limitu 500KB w `compressToJpeg` (last-resort path)

---

## Wcześniejsze (pre-2026-04-15)

### Dodano
- Inicjalny projekt: React 18 + Vite + Tailwind + Netlify Functions
- Podstawowy flow generowania: CampaignForm → BrandForm → GeneratorPanel
- `promptBuilder.js` z VARIANT_MATRIX i model routing NB2/NBPro
- `imageUtils.js` — crop, kompresja JPEG, logo compositing
- Cache L1/L2 (localStorage + Supabase)
- `research-domain` — Claude API research domeny z Supabase cache
- `generate-copy` — AI-generowane nagłówki per wariant
- Integracja Supabase — karta klienta (opiekun, cel kampanii)
- 22 formaty (Social, IAB, LinkedIn, TikTok)
