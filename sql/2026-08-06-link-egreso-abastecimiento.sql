-- Recordatorio + link entre Egresos (compras de productos) y Abastecimiento, para no
-- olvidarse de cargar el detalle de mercadería de una compra ya registrada como gasto.
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño).

alter table egresos add column if not exists es_compra_productos boolean not null default false;

alter table abastecimiento add column if not exists egreso_id bigint references egresos(id) on delete set null;
create index if not exists idx_abastecimiento_egreso on abastecimiento(egreso_id);
