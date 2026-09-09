-- Descuento escalonado por cantidad, por producto. Antes esto se resolvia creando productos
-- fantasma (ej. "Pastilla 200 capsula 5kg"/"10kg") solo para tener otro precio segun cuanto
-- llevaba el cliente -- pero esos productos no existen realmente en stock, asi que habia que
-- ajustar stock a mano en Abastecimiento cada vez. Ahora se carga el % directamente en el
-- producto real y el precio se ajusta solo en Nueva Venta / Presupuestos segun la cantidad.
--
-- descuento_5u: % de descuento (ya total, no se suma con el otro tramo) para 5 a 9 unidades.
-- descuento_10u: % de descuento (ya total) para 10 unidades en adelante.
-- 1 a 4 unidades: sin descuento, precio de lista normal.

alter table productos add column if not exists descuento_5u numeric default 0;
alter table productos add column if not exists descuento_10u numeric default 0;
