# Changelog de esquema Supabase

Registro de cada cambio de esquema corrido (o pendiente de correr) en Supabase, para poder
atar una reversión de código a la reversión de base que necesita. Ver `CLAUDE.md` →
"Backup automático de App.jsx" y "Reversión de esquema Supabase".

Convención desde 2026-08-05: todo cambio de esquema nuevo se entrega como par
`YYYY-MM-DD-descripcion.sql` (up) + `YYYY-MM-DD-descripcion.down.sql` (reversión). El up
se sigue corriendo a mano en el SQL Editor de Supabase, igual que antes — lo único que
cambia es que ahora siempre hay un camino de vuelta documentado.

## Cómo leer esta tabla

- **Commit/backup asociado**: el commit de git (y el `App_NNNN.jsx` si aplica) del cambio
  de código que requirió este SQL. Para revertir código+base a la vez a un momento dado,
  hay que correr los `.down.sql` de todo lo que esté fechado *después* del punto al que
  se quiere volver, en el orden inverso al que se corrieron, ANTES de restaurar el código.
- **Corrido en Pilar / Caamaño**: si ya se ejecutó ese SQL en cada proyecto. Puede
  desincronizarse — revisar antes de asumir.

| Fecha | Up / Down | Proyecto(s) | Commit asociado | Corrido en Pilar | Corrido en Caamaño | Notas |
|---|---|---|---|---|---|---|
| 2026-07-20 | `2026-07-20-control-stock.sql` / `.down.sql` (down agregado retroactivamente el 2026-08-05) | Ambos | `796452e`, `60df634`, `8292573` | ✅ | ✅ | El down borra `conteos_stock` y `conteos_stock_items` — pérdida de datos si ya hay conteos cargados. |
| 2026-07-21 | `2026-07-21-email-vendedores-camanio.sql` / `.down.sql` (down agregado retroactivamente el 2026-08-05) | Caamaño | `3195da4`, `133d214`, `0e810a6` | — | ✅ | El down borra `email`/`telefono` de vendedores en Caamaño — si esos emails ya se usan para login, dejan de identificarse hasta recargarlos. |
| 2026-08-05 | `2026-08-05-historial-valor-stock.sql` / `.down.sql` | Ambos | `15e4149` | ✅ (corrido por Claude vía psql) | ✅ (corrido por Claude vía psql) | El down borra toda la serie histórica de valor de stock guardada. Desde este cambio, Pablo pidió que el SQL de estas migraciones lo corra Claude directamente (ya tiene acceso psql por el backup diario) en vez de dárselo para pegar a mano — ver CLAUDE.md. |
| 2026-08-06 | `2026-08-06-rls-devoluciones.sql` / `.down.sql` | Ambos | (sin cambio de código, solo SQL) | ✅ (corrido por Claude vía psql) | ✅ (corrido por Claude vía psql) | Originado por un aviso de seguridad real de Supabase (RLS deshabilitado en `devoluciones`/`devolucion_items` de Caamaño — cualquiera con la anon key podía leer/escribir esas tablas). De paso se encontró que en Pilar esas mismas tablas tenían RLS habilitado SIN ninguna policy, lo que bloqueaba todo acceso: la funcionalidad de "Nota de crédito" estuvo rota en Pilar (0 filas históricas) hasta este fix. El down borra las policies pero NO vuelve a deshabilitar RLS (para no reabrir el agujero de seguridad) — vuelve al estado roto de Pilar, no al inseguro de Caamaño. |

<!-- Nuevas entradas se agregan arriba de esta línea, más reciente primero. -->
