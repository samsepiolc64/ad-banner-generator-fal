-- =============================================================
-- Generator reklam — schemat bazy danych Supabase
-- =============================================================
--
-- Jedna tabela: brand_research
-- Przechowuje dane marki klientów, koszty generowania i metadane.
--
-- Jak zastosować:
--   Supabase Dashboard → SQL Editor → wklej i uruchom
-- =============================================================

create table if not exists brand_research (
  -- Klucz główny — znormalizowana domena (bez https://, bez trailing slash)
  domain            text        primary key,

  -- Dane marki zwrócone przez Claude (JSON: kolory, fonty, USP, styl, itp.)
  -- NULL gdy rekord powstał tylko z cost-tracking lub update-client-meta
  brand_data        jsonb,

  -- Czy research domeny był kiedykolwiek wykonany
  fetched           boolean     not null default false,

  -- Data ostatniej aktualizacji danych marki
  updated_at        timestamptz not null default now(),

  -- Śledzenie kosztów generowania (USD)
  cost_usd          numeric(10, 4) not null default 0,
  cost_count        integer        not null default 0,
  cost_last_at      timestamptz,

  -- Metadane kampanii
  opiekun           text,   -- imię i nazwisko opiekuna klienta
  cel_kampanii      text    -- cel kampanii (np. "Conversion (Sprzedaż)")
);

-- Indeks przyspieszający sortowanie listy klientów po dacie aktualizacji
create index if not exists brand_research_updated_at_idx
  on brand_research (updated_at desc);

-- =============================================================
-- Row Level Security (RLS)
-- =============================================================
-- Aplikacja używa service_role key (SUPABASE_SERVICE_KEY), który
-- omija RLS. Możesz włączyć RLS dla dodatkowego bezpieczeństwa —
-- wtedy service_role i tak ma pełny dostęp.

alter table brand_research enable row level security;

-- Polityka dla service_role (wymagana gdy RLS jest włączone)
create policy "service_role_all" on brand_research
  for all
  to service_role
  using (true)
  with check (true);
