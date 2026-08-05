-- Historial diario del valor de stock a costo, para poder graficar su evolución.
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño) — el stock es independiente por
-- local, cada base necesita su propia copia de esta tabla, igual que "conteos_stock".

create table historial_valor_stock (
  id                 bigint generated always as identity primary key,
  fecha              date not null unique,
  valor_ars          numeric(14,2) not null,
  valor_usd          numeric(14,2) not null,
  tipo_cambio_usado  numeric(10,2) not null,
  creado_en          timestamptz not null default now()
);

alter table historial_valor_stock enable row level security;
create policy allow_all on historial_valor_stock for all using (true) with check (true);
