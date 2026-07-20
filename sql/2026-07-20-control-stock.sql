-- Control de Stock: conteo físico por categoría + ajuste
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño) — el stock es independiente por local,
-- así que cada base necesita su propia copia de estas tablas, igual que "devoluciones".

create table conteos_stock (
  id            bigint generated always as identity primary key,
  fecha         date not null default current_date,
  categoria     text not null,
  responsable   text not null,
  creado_en     timestamptz not null default now(),
  aplicado      boolean not null default false,
  aplicado_en   timestamptz,
  aplicado_por  text
);

alter table conteos_stock enable row level security;
create policy allow_all on conteos_stock for all using (true) with check (true);

create table conteos_stock_items (
  id             bigint generated always as identity primary key,
  conteo_id      bigint not null references conteos_stock(id) on delete cascade,
  producto_id    bigint not null,
  codigo         text,
  nombre         text,
  stock_sistema  integer not null,
  stock_contado  integer not null
);

alter table conteos_stock_items enable row level security;
create policy allow_all on conteos_stock_items for all using (true) with check (true);

create index idx_conteos_stock_items_conteo on conteos_stock_items(conteo_id);

-- Nota: producto_id queda sin FK a productos(id) a propósito, siguiendo la convención
-- ya usada en el resto del proyecto (matcheo por id/codigo sin constraint estricta),
-- y para no depender de que el tipo de productos.id sea exactamente bigint.
-- Si en tu base productos.id es de otro tipo (uuid, int4, etc.), avisame para ajustar.
