-- DOWN de 2026-08-05-historial-valor-stock.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up (Pilar y/o Caamaño).
--
-- ADVERTENCIA: esto borra toda la serie histórica de valor de stock guardada hasta
-- el momento. No hay forma de recuperarla después salvo por un dump/backup previo.

drop table if exists historial_valor_stock;
