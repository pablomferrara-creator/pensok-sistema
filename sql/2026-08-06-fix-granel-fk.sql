-- productos.granel_id apuntaba a una tabla "productos_granel" que quedó armada hace tiempo
-- pero nunca se conectó a ningún código (0 filas, sin uso). Se decidió (2026-08-06) NO usar
-- ese esquema separado por ahora -- más simple: un producto "a granel" es directamente otra
-- fila de productos (ej. "CLORO LIQUIDO x Litro"), de la que otros productos (Cloro 5L,
-- Cloro 10L) descuentan al envasarse. Este script re-apunta la FK a productos(id) mismo.
--
-- productos_granel / envasados quedan sin usar pero NO se borran (están vacías, no hay
-- pérdida de datos si en algún momento se quiere retomar ese diseño más adelante).
--
-- Correr en Pilar solamente -- Caamaño no tiene esta constraint (nunca tuvo productos_granel).

alter table productos drop constraint if exists productos_granel_id_fkey;
alter table productos add constraint productos_granel_id_fkey
  foreign key (granel_id) references productos(id) on delete set null;
