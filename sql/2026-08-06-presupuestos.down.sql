-- DOWN de 2026-08-06-presupuestos.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
--
-- ADVERTENCIA: esto borra todo el historial de presupuestos (pendientes, aprobados y
-- cancelados) junto con sus items. Los "venta_id" de presupuestos ya aprobados quedan
-- huérfanos en la referencia, pero las ventas en sí NO se borran (la FK es on delete
-- set null del lado de presupuestos, nunca al revés).

drop table if exists presupuesto_items;
drop table if exists presupuestos;
