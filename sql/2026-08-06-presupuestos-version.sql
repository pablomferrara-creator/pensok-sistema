-- Permite editar los ítems de un presupuesto pendiente (agregar/sacar/cambiar productos
-- antes de que el cliente cierre la venta), llevando un número de versión visible en el
-- PDF para saber que ese presupuesto fue modificado respecto del original.
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño).

alter table presupuestos add column if not exists version integer not null default 1;
alter table presupuestos add column if not exists editado_por text;
alter table presupuestos add column if not exists editado_en timestamptz;
