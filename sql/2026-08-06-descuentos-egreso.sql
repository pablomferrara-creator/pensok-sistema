-- Descuentos que un proveedor devuelve en plata real, días después de haber pagado un
-- egreso completo (ej. paga $556.566 de una compra, a los días el proveedor le devuelve
-- $20.000 en efectivo). Queda como evento propio, con su fecha/monto/método reales, para
-- que el Libro de Movimientos y la caja den bien -- sin tocar el egreso ni el pago original.
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño).

create table descuentos_egreso (
  id            bigint generated always as identity primary key,
  egreso_id     bigint not null references egresos(id) on delete cascade,
  fecha         date not null default current_date,
  monto         numeric(12,2) not null,
  metodo_pago   text not null,
  notas         text default '',
  registrado_por text,
  created_at    timestamptz not null default now()
);

alter table descuentos_egreso enable row level security;
create policy allow_all on descuentos_egreso for all using (true) with check (true);

create index idx_descuentos_egreso_egreso on descuentos_egreso(egreso_id);
