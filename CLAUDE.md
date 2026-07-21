# Pensok — Sistema de gestión interno

Contexto de proyecto para Claude Code. Léelo completo antes de tocar código — varias zonas son frágiles y hay reglas de negocio no evidentes desde el código solo.

## Qué es esto

Pensok es una distribuidora/retail con dos locales físicos — **Pilar** y **Caamaño** — cada uno con su propia base de datos Supabase, corriendo el **mismo código** (una sola app, no dos). Rubros: piletas, jardinería, riego, perfumería, limpieza, fumigación.

- **Titular legal**: DOMOKIP SAS (CUIT 30-71686952-7)
- **Admins de la app**: en Pilar, Pablo (socio, dev principal) y Kito. En Caamaño, Pato y Triko son socios de ese local y también tienen rol `admin` (no son staff). Todos los admins tienen acceso a los dos locales vía la app.
- **Vendedores/staff no-admin reales**: Fabri y Maxi, ambos en **Pilar**, donde comparten una única PC/login (no tienen emails individuales) — ver "Sistema de login y roles" más abajo para cómo afecta esto los permisos de Tareas.

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
- `sql/` — SQL de cambios de esquema entregados para correr a mano en Supabase (ver punto 3 de "Flujo de trabajo esperado"). Es un historial de referencia, no se ejecuta solo ni es parte del build.
- **Menú superior**: agrupado en dropdowns por tipo de tarea (Ventas, Inventario, Finanzas, Otros) más "Nueva venta" suelto — antes eran ~13 pestañas sueltas que no entraban en una fila. `tabsTodos` define `grupo` por tab; `GRUPOS_NAV` define el orden/label de cada dropdown.

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

- **`ModuloIngresos`**: tiene duplicación estructural histórica — `abrirEditarVenta`/`guardarVenta` están declaradas DOS veces dentro del mismo componente (y lo mismo `abrirQuickEdit`/`guardarQuickEdit`). En JS, la segunda declaración de una `function` con el mismo nombre pisa a la primera silenciosamente: la que realmente corre en runtime es siempre la **última** definida en el archivo, la primera queda como código muerto sin usar. Si hay que corregir un bug en estos flujos, verificar en cuál de las dos copias cae el cambio real (la de más abajo) — y si se corrige algo de fondo, replicarlo en ambas copias por consistencia aunque solo una esté viva.
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
- **Editar el método de pago de una venta ya cobrada**: `editarVenta` actualiza `ventas.metodo_pago`, pero el Cierre de Caja y el Libro de Movimientos usan el método REAL guardado en `pagos_deuda` cuando existe (ver regla de arriba). Si la venta ya estaba cobrada (no se está marcando/desmarcando cobrado ni registrando un pago nuevo) y tiene un único pago simple asociado, `editarVenta` también corrige ese registro de `pagos_deuda` automáticamente. Si la venta tiene cobros partidos (varios pagos), NO se toca nada automáticamente — cada pago parcial se corrige a mano desde "Editar pago" en el detalle de esa venta, porque no hay forma de saber a cuál de los pagos partidos se refiere el cambio.
- **"Cobrado" ya no es un checkbox en los modales de editar venta** (ni en "Editar venta" ni en "Actualizar venta", la edición rápida de vendedores) — se sacó a propósito, igual que "Método de pago"/"Pago a proveedor" en la creación de egresos, porque duplicaba/confundía con el flujo correcto: **"Registrar cobro"** (botón que aparece en la venta mientras no esté cobrada) es el único camino para marcar un cobro, porque ahí sí se registra fecha/monto/método reales en `pagos_deuda`. Ambos modales ahora muestran el estado de cobro como badge de solo lectura.
- **"Saldo adeudado" en Clientes**: se calcula igual que "Nos deben clientes" del Dashboard — ventas con `saldo_cobro>0` o `cobrado=false`, NO el campo `cuenta_corriente` del cliente (ese es un mecanismo aparte, casi sin uso, que solo se mueve cuando una venta se paga explícitamente con método "Cuenta corriente"). El badge "Debe $X" de cada cliente en la lista usa la misma lógica real, no `cuenta_corriente`.

## Control de Stock (conteo físico + ajuste)

Módulo que reemplazó el viejo flujo de "descargar Excel, contar a mano, resubir". Tablas nuevas por local (`conteos_stock`, `conteos_stock_items` — igual que `devoluciones`, no compartidas entre Pilar y Caamaño porque el stock es independiente).

- **Flujo**: cualquier usuario elige una categoría → cuenta todos los productos activos de esa categoría (o imprime antes una planilla en PDF con el logo de Pensok para recorrer el local a mano) → guarda el conteo. Esto queda como **registro histórico**, sin tocar `productos.stock` todavía.
- **Aplicar el ajuste** (pisar `productos.stock` con lo contado) es **solo admin**, desde el detalle del conteo, y avisa si el stock de sistema cambió desde que se contó (por ventas nuevas en el medio) antes de confirmar.
- **Admin puede corregir un conteo ya guardado pero todavía no aplicado** (botón "Editar conteo" en el detalle) — para cuando un vendedor se confundió de producto al contar. Esto no toca stock real, solo el registro del conteo.
- **Aviso automático a los admins**: al guardar un conteo se crea sola una tarea en Tareas (`proyecto: "Control de Stock (ajuste)"`, prioridad alta, vence hoy, sin responsable asignado) para que algún admin revise y aplique el ajuste. Esa tarea **no se puede tildar a mano desde Tareas** — el checkbox queda deshabilitado a propósito; se cierra sola cuando se aplica el ajuste correspondiente (se vincula por texto, buscando `"Conteo #<id> "` dentro de la descripción de la tarea).
- **Tarea mensual automática**: además, cada vez que un admin carga la app se chequea si ya existe la tarea "Control de stock mensual — {Mes} {Año}" para el mes en curso (por local); si no existe, se crea sola (`proyecto: "Control de Stock (mensual)"`). Esta sí es una tarea normal, tildable a mano — es solo un recordatorio, no tiene una acción que la cierre automáticamente.

## Sistema de login y roles

- Login por Supabase Auth (email/password). El rol (`admin` o `local`) se guarda en la tabla `user_roles` (`email` → `rol`), separada de `vendedores`.
- El **nombre visible** del vendedor logueado (para saber si es responsable de una tarea puntual, por ejemplo) se resuelve cruzando el email de sesión contra `vendedores.email` — **NO todos los vendedores tienen este campo cargado**:
  - Caamaño: Pato y Triko (admins/socios ahí) sí tienen su email real cargado en `vendedores`.
  - Pilar: Fabri y Maxi (los únicos vendedores no-admin reales) **comparten una sola PC/login**, sin emails individuales — no hay forma de distinguirlos por sesión.
- Por eso, en `ModuloTareas`, el permiso para gestionar una tarea asignada (`esResponsable`) tiene un fallback: si el login no se puede identificar por email (`miNombre` vacío — hoy, la PC compartida de Pilar), se permite gestionar tareas asignadas a `"Fabri"` o `"Maxi"` puntualmente (array `RESPONSABLES_SIN_EMAIL` en el código). Si en algún momento Fabri y Maxi tienen logins/emails individuales, este fallback deja de hacer falta y se puede sacar.

## Deploy — Vercel a veces no dispara solo

El deploy es automático (GitHub → Vercel) y normalmente funciona, pero **al menos una vez el webhook no disparó** un build para un push nuevo (el commit llegó bien a GitHub, Vercel ni siquiera lo mostró en su lista de Deployments). Si después de pushear y esperar unos minutos el sitio sigue sirviendo el bundle viejo, un commit vacío (`git commit --allow-empty`) suele destrabarlo. Para chequear si el deploy ya está activo sin depender del ojo: pedir el HTML de `pensok-sistema.vercel.app`, sacar el nombre del archivo `assets/index-*.js`, y mirar su header `Last-Modified` — si es de antes del último push, todavía no se actualizó.

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
