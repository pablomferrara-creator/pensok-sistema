-- DOWN de 2026-08-06-presupuestos-version.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
-- Solo borra estas tres columnas, no borra filas de presupuestos.

alter table presupuestos drop column if exists editado_en;
alter table presupuestos drop column if exists editado_por;
alter table presupuestos drop column if exists version;
