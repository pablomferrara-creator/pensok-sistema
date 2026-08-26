-- Permite stock con decimales, en todos los productos (no solo los que envasan desde un
-- granel). Encontrado por Pablo: el descuento automático de granel (ej. 0,08L por bidón
-- envasado) no se veía reflejado porque productos.stock era entero -- Postgres redondeaba
-- en silencio cada resta fraccionaria, así que una resta de 0,4L nunca se notaba.
--
-- Se migran las 4 columnas donde puede aparecer un movimiento de stock fraccionario:
--   - productos.stock: el stock en sí.
--   - abastecimiento.cantidad: el historial de movimientos (ahí es donde queda la traza del
--     "Envasado en..." con los litros consumidos -- si esta columna se queda entera, la traza
--     seguiría rompiéndose aunque productos.stock ya soporte decimales).
--   - conteos_stock_items.stock_sistema / stock_contado: Control de Stock, para poder contar
--     un producto a granel con decimales durante un conteo físico (pedido de Pablo).
--
-- numeric(12,2) -- 2 decimales de precisión guardados (la UI solo MUESTRA 1, ver fmtNum en
-- App.jsx, pero adentro se guarda con más precisión para no arrastrar error de redondeo).
-- Aditivo y seguro: los valores enteros que ya existen se migran tal cual, sin pérdida.

alter table productos alter column stock type numeric(12,2);
alter table abastecimiento alter column cantidad type numeric(12,2);
alter table conteos_stock_items alter column stock_sistema type numeric(12,2);
alter table conteos_stock_items alter column stock_contado type numeric(12,2);
