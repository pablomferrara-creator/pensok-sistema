-- DOWN de 2026-07-20-control-stock.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up (Pilar y/o Caamaño).
--
-- ADVERTENCIA: esto borra las tablas y TODOS los conteos de stock cargados desde
-- que se corrió el up. No hay forma de recuperar esos datos después salvo que el
-- proyecto Supabase tenga point-in-time recovery / backups propios habilitados.

drop table if exists conteos_stock_items;
drop table if exists conteos_stock;
