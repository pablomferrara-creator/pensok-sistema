-- Gestión de presupuestos: guardar cada presupuesto generado, poder aprobarlo (se
-- convierte en venta real) o cancelarlo (con comentario).
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño) — igual que ventas/conteos_stock,
-- cada local necesita su propia copia.

create table presupuestos (
  id                  bigint generated always as identity primary key,
  nro_presupuesto     text not null unique,
  fecha               date not null default current_date,
  hora                time not null default current_time,
  cliente_id          bigint,
  cliente_nombre      text not null default '',
  vendedor            text not null default '',
  tipo_lista          text not null default 'minorista',
  modalidad           text not null default 'En el local',
  descuento           numeric(5,2) not null default 0,
  total               numeric(12,2) not null default 0,
  ganancia_estimada   numeric(12,2) not null default 0,
  estado              text not null default 'pendiente', -- pendiente | aprobado | cancelado
  motivo_cancelacion  text,
  venta_id            bigint references ventas(id) on delete set null,
  creado_en           timestamptz not null default now(),
  aprobado_por        text,
  aprobado_en         timestamptz,
  cancelado_por       text,
  cancelado_en        timestamptz
);

alter table presupuestos enable row level security;
create policy allow_all on presupuestos for all using (true) with check (true);

create table presupuesto_items (
  id              bigint generated always as identity primary key,
  presupuesto_id  bigint not null references presupuestos(id) on delete cascade,
  producto_id     bigint,
  nombre          text not null,
  cantidad        integer not null default 1,
  precio          numeric(12,2) not null default 0,
  costo           numeric(12,2) not null default 0
);

alter table presupuesto_items enable row level security;
create policy allow_all on presupuesto_items for all using (true) with check (true);

create index idx_presupuesto_items_presupuesto on presupuesto_items(presupuesto_id);
