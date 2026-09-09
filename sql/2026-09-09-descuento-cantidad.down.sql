-- DOWN de 2026-09-09-descuento-cantidad.sql -- borra las dos columnas de descuento escalonado
-- por cantidad. Si ya hay productos con % cargado, se pierde esa configuracion (no el stock ni
-- las ventas ya hechas, que ya quedaron con su precio final guardado en venta_items).
alter table productos drop column if exists descuento_5u;
alter table productos drop column if exists descuento_10u;
