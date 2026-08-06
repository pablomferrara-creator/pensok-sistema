-- DOWN de 2026-08-06-link-egreso-abastecimiento.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
--
-- Borra el flag de "es compra de productos" y el link de abastecimiento hacia egresos.
-- No borra ninguna fila, solo estas dos columnas -- los egresos y el abastecimiento en
-- sí quedan intactos, simplemente pierden la relación entre ellos.

drop index if exists idx_abastecimiento_egreso;
alter table abastecimiento drop column if exists egreso_id;
alter table egresos drop column if exists es_compra_productos;
