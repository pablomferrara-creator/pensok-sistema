-- DOWN de 2026-08-07-vincular-productos-historico.sql
--
-- ADVERTENCIA / asimetría entre proyectos: este down borra las columnas que la migración
-- CREÓ, pero eso no es exactamente "deshacer el backfill" en todos los casos:
--   - Caamaño (venta_items.producto_id) y ambos (devolucion_items.producto_id): la columna
--     no existía antes de esta migración, así que borrarla es un revert limpio y completo.
--   - Pilar (venta_items.producto_id): esta columna YA EXISTÍA antes (con ~0.8% cargada
--     orgánicamente). Borrarla acá se llevaría puesto también ese dato viejo, previo a esta
--     migración -- no es un revert "limpio" de SOLO lo que este script agregó. Si alguna vez
--     hace falta deshacer específicamente el backfill de Pilar sin perder lo que ya había,
--     hay que restaurar desde un dump anterior a esta migración, no correr este DROP.
--
-- abastecimiento.producto_id NO se toca acá (esa columna ya existía en ambos proyectos
-- desde antes de esta migración, con su propio código que la puebla desde abril -- este
-- down no debe borrarla).

alter table venta_items drop column if exists producto_id; -- ver advertencia arriba (Pilar)
alter table devolucion_items drop column if exists producto_id;
