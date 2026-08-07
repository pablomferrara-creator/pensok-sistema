-- DOWN de 2026-08-07-comision-pagos-egreso.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
-- Solo borra la columna, no borra filas de pagos_egreso.

alter table pagos_egreso drop column if exists comision_plataforma;
