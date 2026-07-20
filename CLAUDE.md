# Pensok — Sistema de gestión interno

Contexto de proyecto para Claude Code. Léelo completo antes de tocar código — varias zonas son frágiles y hay reglas de negocio no evidentes desde el código solo.

## Qué es esto

Pensok es una distribuidora/retail con dos locales físicos — **Pilar** y **Caamaño** — cada uno con su propia base de datos Supabase, corriendo el **mismo código** (una sola app, no dos). Rubros: piletas, jardinería, riego, perfumería, limpieza, fumigación.

- **Titular legal**: DOMOKIP SAS (CUIT 30-71686952-7)
- **Admins de la app**: Pablo (socio, dev principal) y Kito — ambos con acceso a los dos locales
- **Vendedores/staff no-admin**: Triko, Kito, Pato, Maxi, Fabri — con permisos limitados vía gates en el código

## Arquitectura

- **Frontend**: un solo archivo `App.jsx` (React/JSX, ~8.000 líneas), proyecto **Vite** (`vite.config.js`, `package.json` con `react`, `react-dom`, `@supabase/supabase-js`)
- **Deploy**: GitHub → Vercel, en `pensok-sistema.vercel.app`
- **Backend**: dos proyectos Supabase independientes
  - Pilar: `dupatnbwrgdtxalpqgqi`
  - Caamaño: `kggpwndbdbqfmupiqrqp`
- **Selección de local activo**: `localStorage("pensok_local")` decide qué cliente Supabase se usa en runtime (`supabase`)
- **Clientes cruzados** (para funciones que tocan la otra base):
  - `supabaseCamanio` — Pilar → Caamaño, solo replicación de productos (unidireccional)
  - `supabaseOtro` — bidireccional "al otro local", usado por proveedores y tareas
  - `supabaseTareas` — apunta siempre a Pilar (las tareas viven en una sola base compartida)
  - Todos los clientes cruzados tienen `persistSession:false, autoRefreshToken:false` para evitar el warning de "Multiple GoTrueClient instances"

## Estructura del repo

- `App.jsx` (raíz de `src/`) — el sistema interno de gestión, en producción, lo que usamos en el día a día.
- `src/portal/` — **portal público de pedidos, todavía en DRAFT, no implementado oficialmente**. Idea: un cliente carga un pedido desde afuera → llega como aviso a la app interna (sección "Pedidos web") → un vendedor lo revisa y aprueba → recién ahí se pasa a Ingresos como venta oficial. No tratar este código con el mismo nivel de "no romper nada" que `App.jsx` — es experimental, y antes de darlo por completo hay que confirmar con Pablo el flujo real (por ahora hay una sección "Pedidos web" ya cableada en `App.jsx`/`ModuloConfiguracion`/menú lateral que referencia `pedidos_web_pendientes`, pero el portal público en sí que alimenta esa tabla está en desarrollo).

## PDF y Excel — carga dinámica por CDN, NO son dependencias npm

`App.jsx` usa **jsPDF** y **XLSX (SheetJS)** para tickets, remitos, listas de precios y exportaciones — pero **ninguna de las dos está en `package.json`, y es intencional, no un descuido**:

- **jsPDF**: se inyecta en runtime con un `<script>` apuntando a `cdnjs.cloudflare.com/.../jspdf.umd.min.js`, justo antes de generar cada PDF, y se usa como global (`window.jspdf`).
- **XLSX**: se carga con `import("https://cdn.sheetjs.com/.../xlsx.mjs")` dinámico, también en el momento de usarse.

**No agregar estas librerías a `package.json` ni cambiarlas a `import` estático** — eso rompería el patrón (el código las referencia como global/import dinámico, no como módulo importado arriba del archivo) y habría que reescribir cada punto de uso. Si en algún momento se decide migrar a import estático, es un cambio deliberado y grande, no una "corrección" de rutina.

## Compilar y verificar antes de entregar cualquier cambio

```bash
npm install   # solo la primera vez, o si cambiaron las dependencias
npm run build
```
Si `npm run build` no tira error, el archivo compila. **Siempre correrlo antes de dar un cambio por terminado.** Para desarrollo local con hot-reload: `npm run dev`.

## Zonas frágiles — pedir confirmación antes de tocar

- **`ModuloIngresos`**: tiene duplicación estructural histórica de `guardarVenta` y `guardarQuickEdit` (dos copias del mismo flujo). Cambios ahí son de alto riesgo — camino de mínimo riesgo, confirmar antes de refactorizar.
- **`generarListaPDF`**: también existe duplicada (una copia viva en `ModuloProductos`, una muerta sin usar dentro de `ModuloProveedores`). Si se corrige un bug ahí, corregir las dos copias por consistencia, aunque solo una esté en uso.
- **Cierre de Caja (`ModuloCaja`)**: cálculo del "esperado" por billetera. Ya tuvo varios bugs de atribución (ver historial de cambios más abajo) — cualquier cambio acá se prueba con SQL diagnóstico contra datos reales ANTES de tocar código, nunca a ciegas.

## Reglas de negocio no evidentes desde el código

- **Replicación de productos**: nuevo producto creado en Pilar se replica a Caamaño con `stock=0`. Cambios de costo en Pilar también replican a Caamaño por código de producto. Precio y stock son independientes por local.
- **Replicación de proveedores**: bidireccional, matcheo por nombre normalizado (sin mayúsculas/espacios). Nombres van en Title Case, con excepciones para siglas (ML, QDN se dejan en mayúsculas) y conjunciones en español ("Sol y Agua", la "y" en minúscula).
- **Tareas**: tabla única compartida en la base de Pilar (no se replica, es fuente única). Requiere policy `allow_all` en la tabla `tareas` de Pilar — el resto de las tablas de este proyecto ya usan RLS activo + policy `allow_all` como convención (no auth-gated).
- **Tipos de egreso especiales** (`TIPOS_EGRESO`): `"Gasto fijo"`, `"Gasto variable"`, `"Retiro de Ganancia"`, `"Inversión inicial"`. Estos dos últimos tienen tratamiento especial en el Cierre de Caja:
  - `"Inversión inicial"`: plata que puso un socio de su bolsillo, NUNCA sale de la caja del local → excluida totalmente del cálculo (ni billetera ni "gastos").
  - `"Retiro de Ganancia"`: reparto de ganancia ya generada → SÍ resta de la billetera física (la plata sale de verdad), pero NO resta de "Ganancia neta acumulada" / "Total gastos" (no es un costo operativo).
- **Egresos — flujo de dos pasos obligatorio**: al crear un egreso solo se carga el concepto (queda pendiente de pago). El pago real (fecha, método, monto) se registra después con "Registrar pago", que crea una fila en `pagos_egreso`. **Esta es la única fuente que lee correctamente el Libro de Movimientos** — un pago cargado directo en el egreso al crearlo no queda reflejado ahí. (Ya se sacaron del modal de creación los campos "Método de pago" y "Pago a proveedor" por esta razón; hay un cartel explicándolo en el modal.)
- **Comisión de plataforma (MP)**: se descuenta UNA sola vez por venta, del primer pago no-efectivo — nunca del pago en efectivo, incluso si la venta se cobró en partes por métodos distintos.
- **Atribución de ventas por billetera en el Cierre de Caja**: si una venta tiene pagos registrados en `pagos_deuda` (cobros parciales), se usa el método REAL de cada pago — no el `metodo_pago` nominal de la venta. Esto importa mucho para ventas con pago mixto (parte efectivo, parte MP).
- **Devoluciones (notas de crédito)**: tablas `devoluciones` + `devolucion_items`, solo en Pilar y Caamaño por separado (no compartidas). Reingresan stock (matcheo por nombre de producto, con las mismas limitaciones que el resto del sistema porque `venta_items` no guarda `producto_id`), pueden ser reembolso en dinero o saldo a favor del cliente, y restan del Cierre de Caja como salida de billetera.
- **Sales/Excel**: Google Sheet con una fila por ítem vendido; varios ítems comparten el mismo "N Factura" (ej. `VEN-20260429-00002`), que es la clave de deduplicación contra `ventas`/`venta_items`.

## Convenciones de estilo y comunicación

- Proveedores: Title Case (primera letra de cada palabra en mayúscula), con excepciones ya mencionadas para siglas y conjunciones.
- Comunicación externa (emails, WhatsApp a clientes/proveedores): tono formal en email, más corto y amigable en WhatsApp. Pablo se presenta como "socio", no "titular". Pensok se describe como "distribuidora", no "local".
- Prioridad: MercadoLibre y tienda online ya están en marcha — no son foco de nuevas recomendaciones a menos que se pida explícitamente.

## Flujo de trabajo esperado

1. **Diagnosticar antes de implementar.** Ante un bug reportado (sobre todo en Cierre de Caja o cualquier cálculo de plata/stock), primero armar una consulta SQL para verificar contra datos reales, compartir resultados, y recién ahí aplicar un fix targeted. No implementar a ciegas.
2. **Cambios de bajo riesgo por defecto** en las zonas frágiles listadas arriba — señalar el riesgo y pedir confirmación antes de refactors grandes.
3. **Todo cambio de esquema (tablas nuevas, columnas nuevas) se entrega como SQL aparte**, para que se corra manualmente en Supabase — nunca asumir que se puede ejecutar DDL directo contra la base.
4. **Compilar con esbuild antes de dar el cambio por terminado** (ver comando arriba).
5. Cuando el cambio afecta a los dos locales (Pilar y Caamaño), aclarar explícitamente si el fix aplica a ambos automáticamente (por ser código compartido) o si además hace falta correr algo en cada base por separado.
