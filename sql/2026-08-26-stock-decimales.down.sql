-- DOWN de 2026-08-26-stock-decimales.sql
--
-- ADVERTENCIA: si para cuando se corre este down ya hay valores con decimales reales
-- cargados (stock de un granel en 4.6, por ejemplo), volver a entero los TRUNCA/REDONDEA --
-- exactamente el problema que esta migración vino a resolver. Antes de correr esto, revisar
-- si hay filas con parte decimal real:
--   select id, nombre, stock from productos where stock <> trunc(stock);
--   select id, cantidad from abastecimiento where cantidad <> trunc(cantidad);
--   select id, stock_sistema, stock_contado from conteos_stock_items
--     where stock_sistema <> trunc(stock_sistema) or stock_contado <> trunc(stock_contado);
-- Si alguna de esas devuelve filas, correr este down pierde esa precisión para siempre.

alter table productos alter column stock type integer using round(stock);
alter table abastecimiento alter column cantidad type integer using round(cantidad);
alter table conteos_stock_items alter column stock_sistema type integer using round(stock_sistema);
alter table conteos_stock_items alter column stock_contado type integer using round(stock_contado);
