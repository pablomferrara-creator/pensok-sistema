-- DOWN de 2026-08-06-descuentos-egreso.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
--
-- ADVERTENCIA: borra todo el historial de descuentos recibidos registrados. Los egresos
-- y pagos_egreso relacionados NO se tocan (la FK es on delete cascade del lado de
-- descuentos_egreso, nunca al revés).

drop table if exists descuentos_egreso;
