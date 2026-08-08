-- Vincula las ventas de mercadería (venta_items), los ingresos de mercadería (abastecimiento)
-- y las devoluciones (devolucion_items) al producto real (producto_id), no solo al nombre
-- que tenían en el momento. Así, renombrar un producto en el futuro no corta la serie
-- histórica de ese producto en los reportes (Pareto, "ventas por producto", etc.).
--
-- Corre en AMBOS proyectos Supabase (Pilar y Caamaño). Usa "if not exists"/"if exists"
-- donde corresponde porque el estado de partida difiere entre los dos:
--   - Pilar: venta_items.producto_id ya existe (columna sin usar hasta ahora, ~0.8% cargada).
--   - Caamaño: venta_items no tiene la columna todavía.
--   - Ninguno de los dos tiene producto_id en devolucion_items.
--
-- El backfill es aditivo y de bajo riesgo: solo completa producto_id donde está vacío,
-- matcheando por nombre EXACTO contra los productos de HOY -- nunca toca nombre, precio,
-- cantidad ni costo. Se excluyen a propósito los nombres de producto duplicados (hay un
-- caso: "Atermico Listón Marfil Solarium x unidad (10cm x 100cm)"), porque no hay forma de
-- saber a cuál de los dos correspondía una venta vieja.

-- 1. Agregar las columnas que falten
alter table venta_items add column if not exists producto_id bigint references productos(id) on delete set null;
alter table devolucion_items add column if not exists producto_id bigint references productos(id) on delete set null;

-- 2. Backfill venta_items
update venta_items vi
set producto_id = p.id
from productos p
where vi.producto_id is null
  and vi.nombre = p.nombre
  and (select count(*) from productos p2 where p2.nombre = p.nombre) = 1;

-- 3. Backfill abastecimiento
update abastecimiento a
set producto_id = p.id
from productos p
where a.producto_id is null
  and a.nombre = p.nombre
  and (select count(*) from productos p2 where p2.nombre = p.nombre) = 1;

-- 4. Backfill devolucion_items
update devolucion_items di
set producto_id = p.id
from productos p
where di.producto_id is null
  and di.nombre = p.nombre
  and (select count(*) from productos p2 where p2.nombre = p.nombre) = 1;
