-- DOWN de 2026-08-06-fix-granel-fk.sql -- vuelve a apuntar productos.granel_id hacia la
-- tabla productos_granel (sin usar). Antes de correr esto, hay que limpiar cualquier
-- granel_id que apunte a otro producto (ej. CL5/CL10 -> CL1), porque esos ids no existen
-- en productos_granel y la constraint fallaría.

alter table productos drop constraint if exists productos_granel_id_fkey;
alter table productos add constraint productos_granel_id_fkey
  foreign key (granel_id) references productos_granel(id);
