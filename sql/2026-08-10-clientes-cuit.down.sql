-- DOWN de 2026-08-10-clientes-cuit.sql
-- Borra la columna cuit y con ella cualquier CUIT ya cargado -- si para cuando se corra esto
-- ya hay CUITs cargados, conviene respaldar la columna antes (ej. un dump de clientes(id,cuit)).

alter table clientes drop column if exists cuit;
