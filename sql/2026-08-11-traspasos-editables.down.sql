-- DOWN de 2026-08-11-traspasos-editables.sql
-- Borra las dos columnas nuevas. No borra filas. El link pilar_id (backfilleado a mano para
-- traspasos viejos sin pago, ver notas del backfill en CLAUDE.md) se pierde y no es
-- reconstruible salvo por el mismo proceso de matcheo manual fecha+total.

alter table abastecimiento drop column if exists traspaso_id;
alter table traspasos drop column if exists pilar_id;
