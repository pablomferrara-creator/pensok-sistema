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
- **RLS/policies pueden estar desincronizadas entre Pilar y Caamaño.** Encontrado el 2026-08-06 (aviso de seguridad real de Supabase): `devoluciones`/`devolucion_items` tenían RLS deshabilitado por completo en Caamaño (agujero de seguridad — cualquiera con la anon key leía/escribía esas tablas) y RLS habilitado SIN ninguna policy en Pilar (bloqueaba todo acceso — la función de "Nota de crédito" estuvo rota ahí, 0 filas históricas, sin ningún aviso salvo un toast de error genérico). Ya arreglado (ambos con RLS + policy `allow_all`, ver `sql/2026-08-06-rls-devoluciones.sql`). Al crear una tabla nueva, chequear con `select tablename,rowsecurity from pg_tables where schemaname='public'` en AMBOS proyectos que quede igual en los dos — no asumir que un `create table` corrido en un local se replicó completo en el otro.

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
- **"Stock actual" no se puede editar desde "Editar producto"** (2026-08-06, a propósito) — solo se muestra de solo lectura, con una nota apuntando a Abastecimiento/Control de Stock. Mismo criterio que "Cobrado"/"Método de pago" en ventas y egresos: cualquier cambio de stock tiene que pasar por un flujo que deje movimiento trazable (`registrarAbastecimiento`, o Control de Stock), nunca un pisado directo sin rastro. Al **crear** un producto nuevo sí se puede cargar el stock inicial (no hay movimiento previo que trazar).

## Control de Stock (conteo físico + ajuste)

Módulo que reemplazó el viejo flujo de "descargar Excel, contar a mano, resubir". Tablas nuevas por local (`conteos_stock`, `conteos_stock_items` — igual que `devoluciones`, no compartidas entre Pilar y Caamaño porque el stock es independiente).

- **Flujo**: cualquier usuario elige una categoría → cuenta todos los productos activos de esa categoría (o imprime antes una planilla en PDF con el logo de Pensok para recorrer el local a mano) → guarda el conteo. Esto queda como **registro histórico**, sin tocar `productos.stock` todavía.
- **Aplicar el ajuste es solo admin**, desde el detalle del conteo. Desde el 2026-08-05 **NO pisa `productos.stock` con lo contado** — calcula la diferencia (`stock_contado - stock_sistema`) y la aplica sobre el stock actual leído fresco de la base al momento de aplicar, para no perder ventas/compras/traspasos que hayan pasado entre que se contó y se aplicó. También deja rastro en `abastecimiento` (proveedor "Ajuste por inventario") por cada producto ajustado, para que quede auditable junto con el resto de los movimientos de stock.
- **Admin puede corregir un conteo ya guardado pero todavía no aplicado** (botón "Editar conteo" en el detalle) — para cuando un vendedor se confundió de producto al contar. Esto no toca stock real, solo el registro del conteo.
- **Aviso automático a los admins**: al guardar un conteo se crea sola una tarea en Tareas (`proyecto: "Control de Stock (ajuste)"`, prioridad alta, vence hoy, sin responsable asignado) para que algún admin revise y aplique el ajuste. Esa tarea **no se puede tildar a mano desde Tareas** — el checkbox queda deshabilitado a propósito; se cierra sola cuando se aplica el ajuste correspondiente (se vincula por texto, buscando `"Conteo #<id> "` dentro de la descripción de la tarea).
- **Tarea automática cada dos meses** (cambiado de mensual a bimestral el 2026-08-06): cada vez que un admin carga la app se chequea, por local, si ya pasaron al menos 2 meses desde la última tarea "Control de stock mensual — {Mes} {Año}" (`proyecto: "Control de Stock (mensual)"` — el nombre del proyecto quedó igual aunque ya no es mensual, para no romper el vínculo con tareas viejas); si pasaron 2 meses o más, se crea una nueva. No está atado a paridad de mes (par/impar) fijo — simplemente cuenta desde la última creada para ese local, así que el mes exacto en que cae puede correrse con el tiempo si alguna vez se salta un mes. Esta es una tarea normal, tildable a mano — es solo un recordatorio, no tiene una acción que la cierre automáticamente.
- **"Diferencias por producto"** (pestaña dentro del módulo): ranking histórico cruzando TODOS los conteos (aplicados o no), por producto — cuántas veces dio diferencia, total con signo, total en valor absoluto, última vez. Sirve para detectar qué productos fallan más seguido. No necesita tabla nueva, usa `stock_sistema`/`stock_contado` que ya se guardaban.

## Presupuestos

Sección dedicada (nav "Presupuestos", grupo Ventas) para gestionar cotizaciones. Tablas nuevas por local (`presupuestos`, `presupuesto_items` — mismo criterio que `conteos_stock`/`devoluciones`, no compartidas entre Pilar y Caamaño).

- **Al generar el PDF desde Nueva Venta** (`generarPresupuesto`), ahora también se guarda automáticamente en `presupuestos` ANTES de armar el PDF, y el número correlativo (`PRE-AAAAMMDD-00X`, mismo patrón que `NC-` de notas de crédito) queda impreso en el badge del PDF. Si falla el guardado, el PDF se genera igual (no bloquea la venta) pero avisa con un toast que no quedó registrado.
- **Generar un presupuesto NO toca stock** — recién se descuenta si se aprueba.
- **Aprobar reusa `registrarVenta`** (la misma función que usa Nueva Venta) con los items/cliente/vendedor/descuento/modalidad guardados — no hay una segunda implementación de "crear venta". Solo pide método de pago y cobrado/entregado en el momento de aprobar, porque un presupuesto no los tiene definidos todavía. La venta resultante queda linkeada por `presupuestos.venta_id` y aparece en Ingresos como cualquier otra.
- **Vencimiento**: es puramente visual/derivado (`presupuestoVencido()`, calculado al mostrar, no hay ningún job corriendo en segundo plano) — un presupuesto `pendiente` con más de 15 días desde su fecha se muestra como "Vencido" y **no se puede aprobar directo**; sí se puede cancelar, o **editar** (ver abajo), que lo revive.
- **Quién puede aprobar/cancelar/editar**: cualquier vendedor logueado, mismo criterio que registrar una venta — no está restringido a admin.
- Cancelar pide un motivo obligatorio (`motivo_cancelacion`), queda guardado para consulta posterior.
- **Editar ítems** (2026-08-06, `editarPresupuestoItems`): mientras esté `pendiente` (vencido o no), se puede agregar/sacar/cambiar cantidad-precio de los ítems desde el mismo detalle — mismo número de presupuesto, no se genera uno nuevo. Cada edición suma 1 a `presupuestos.version` y refresca `fecha` a hoy (por eso revive un vencido). El PDF y la tarjeta en la lista muestran `· v2`, `· v3`, etc. cuando `version>1`, para saber que no es la primera versión. Solo se puede editar mientras esté `pendiente` — una vez aprobado o cancelado queda cerrado (la venta ya generada se edita aparte, desde Ingresos).
- **PDF de presupuesto extraído a función compartida** (`generarPDFPresupuesto`, a nivel de módulo, fuera de cualquier componente): la usa tanto `ModuloVenta` (al generarlo por primera vez) como `ModuloPresupuestos` (botón "🖨 Descargar PDF" para reimprimir uno ya editado, con la versión actual). Recibe `{nroPresupuesto, version, clienteNombre, vendedor, tipoCliente, items}` — el descuento nunca se muestra en el PDF (siempre sale "$0", es así desde el diseño original, no es un bug).

## Recordatorio de Abastecimiento pendiente (link Egresos ↔ Abastecimiento)

Problema que resuelve: al cargar un Egreso que es una compra de productos (ej. "Compra Vulcano $556.566"), es común olvidarse de después ir a Abastecimiento a cargar el detalle producto por producto — sobre todo en compras chicas de 1-2 ítems.

- **Al cargar un Egreso**, checkbox "Es compra de productos". Si se tilda, además de guardar el egreso se crea sola una tarea en Tareas (`proyecto: "Abastecimiento pendiente"`, sin responsable, prioridad media, vence hoy).
- **A diferencia de la tarea de Control de Stock, esta SÍ se tilda a mano** — a propósito no hay ningún cierre automático por monto. Se decidió así porque en compras grandes el monto cargado en Abastecimiento casi nunca va a coincidir exacto con el del Egreso (actualizaciones de precio entre que se compró y se cargó, redondeos, etc.) — un cierre automático por monto se quedaría "pendiente" para siempre aunque esté todo bien cargado.
- **Al cargar cada producto en Abastecimiento**, hay un desplegable opcional "¿A qué compra corresponde?" que lista los egresos marcados como compra de productos (prioriza los del mismo proveedor elegido). Esto graba `abastecimiento.egreso_id`.
- **El monto cargado se muestra como referencia informativa únicamente**, en la lista de Egresos ("📦 Abastecimiento: cargado aprox. $X de $Y") — sumando `cantidad × costo_unit` de todo lo linkeado a ese egreso. No es una verdad exacta ni bloquea nada, es solo una pista visual para saber si falta bastante o poco.
- El link es opcional en ambos sentidos: un Egreso puede quedar marcado como compra de productos sin que nunca se linkee nada (la tarea queda ahí como recordatorio), y un Abastecimiento puede cargarse sin corresponder a ningún Egreso puntual.

## Productos a granel (vinner de 1000L → bidones envasados)

Problema que resuelve: productos como el Cloro Líquido se compran en un vinner de 1000L (una sola fila de `productos`, ej. "CLORO LIQUIDO x Litro" / `CL1`, stock en litros — y que además se vende suelto por litro directo al mostrador, no es solo un artefacto interno) y después se van envasando de a poco en bidones de 5L/10L para vender. Antes, envasar no descontaba nada del vinner — quedaba como un número fantasma que solo se corregía a mano con un recuento físico.

- **`productos.granel_id`** (self-reference a otro producto) + **`productos.consumo_granel`** (cuánto se descuenta del granel por cada unidad envasada). Se configuran desde la edición del producto retail (ej. Cloro 10L → "Se envasa desde" = CLORO LIQUIDO x Litro, "Litros por unidad" = 10).
- **Al cargar un ingreso en Abastecimiento** de un producto con `granel_id` seteado, además de sumar su propio stock, se descuenta `cantidad × consumo_granel` del producto a granel vinculado, y queda un movimiento propio en el historial de Abastecimiento del granel (proveedor "Envasado interno") para que sea trazable. Editar o eliminar ese ingreso también ajusta el granel en la proporción correspondiente.
- **La alerta de "stock bajo/agotado" no necesitó nada nuevo** — ya existe (`estadoStock`, compara `stock` vs `stock_min`) y como ahora el granel descuenta de verdad, empieza a funcionar sola para el vinner apenas su stock baje del mínimo configurado.
- **⚠️ Hallazgo al implementar esto (2026-08-06): existían dos tablas sin usar**, `productos_granel` y `envasados`, armadas en algún momento con un diseño más prolijo (el granel como entidad propia, no una fila más de `productos`) pero **nunca conectadas a ningún código, 0 filas, y ni siquiera existen en Caamaño**. Se decidió no usarlas por ahora — más simple reusar `productos` directamente — pero se dejaron sin borrar por si en algún momento se quiere retomar ese diseño. Si alguna vez se encuentra `productos.granel_id` fallando con un error de FK contra `productos_granel`, es por esto — ver `sql/2026-08-06-fix-granel-fk.sql`.
- **Caamaño no tiene vinner propio** — el envasado de Cloro es 100% en Pilar, y lo que llega a Caamaño es por traspaso de bidones ya envasados (no consume ningún granel ahí). Por eso el link `granel_id` de Cloro 5L/10L está seteado SOLO en Pilar; en Caamaño esos mismos productos tienen `granel_id` vacío a propósito. Si en el futuro Caamaño tuviera su propio vinner, se configuraría ahí de la misma forma (el mecanismo es genérico, no está hardcodeado a un local).
- **Por ahora solo está vinculado el Cloro** (`CL5`, `CL10` → `CL1`). Quedan pendientes de vincular (mismo patrón, cuando Pablo pueda hacer el recuento físico en el depósito): los jabones/suavizantes con su versión "(sin envase) 1L" como granel — ver lista completa en la conversación donde se armó esto.
- **Pendiente a futuro (no implementado a propósito, para no complicar el alcance):** al cargar el envasado, además de descontar los litros del granel, también descontar el envase vacío usado (ej. 1 bidón de 10L) de su propio stock. Cuando se quiera encarar, el mismo mecanismo de `granel_id`/`consumo_granel` podría extenderse o duplicarse para "envase_id"/consumo de envase.
- **Antes de prender el link de un producto nuevo, recomendar un recuento físico real por Control de Stock** — el stock actual del granel puede estar desactualizado desde antes de tener este mecanismo (envasados previos que nunca se descontaron).

## Sistema de login y roles

- Login por Supabase Auth (email/password). El rol (`admin` o `local`) se guarda en la tabla `user_roles` (`email` → `rol`), separada de `vendedores`.
- El **nombre visible** del vendedor logueado (para saber si es responsable de una tarea puntual, por ejemplo) se resuelve cruzando el email de sesión contra `vendedores.email` — **NO todos los vendedores tienen este campo cargado**:
  - Caamaño: Pato y Triko (admins/socios ahí) sí tienen su email real cargado en `vendedores`.
  - Pilar: Fabri y Maxi (los únicos vendedores no-admin reales) **comparten una sola PC/login**, sin emails individuales — no hay forma de distinguirlos por sesión.
- Por eso, en `ModuloTareas`, el permiso para gestionar una tarea asignada (`esResponsable`) tiene un fallback: si el login no se puede identificar por email (`miNombre` vacío — hoy, la PC compartida de Pilar), se permite gestionar tareas asignadas a `"Fabri"` o `"Maxi"` puntualmente (array `RESPONSABLES_SIN_EMAIL` en el código). Si en algún momento Fabri y Maxi tienen logins/emails individuales, este fallback deja de hacer falta y se puede sacar.

## Deploy — Vercel a veces no dispara solo

El deploy es automático (GitHub → Vercel) y normalmente funciona, pero **al menos una vez el webhook no disparó** un build para un push nuevo (el commit llegó bien a GitHub, Vercel ni siquiera lo mostró en su lista de Deployments). Si después de pushear y esperar unos minutos el sitio sigue sirviendo el bundle viejo, un commit vacío (`git commit --allow-empty`) suele destrabarlo. Para chequear si el deploy ya está activo sin depender del ojo: pedir el HTML de `pensok-sistema.vercel.app`, sacar el nombre del archivo `assets/index-*.js`, y mirar su header `Last-Modified` — si es de antes del último push, todavía no se actualizó.

## Backup automático de App.jsx (reversibilidad local)

Cada vez que Claude edita `src/App.jsx` (Edit/Write/MultiEdit), un hook `PostToolUse` configurado en `.claude/settings.json` copia automáticamente el estado resultante a `backups/App_NNNN.jsx` (numeración secuencial de 4 dígitos, cero-padded). El contador vive en `backups/.counter` y persiste entre sesiones. `backups/` está en `.gitignore` — son copias locales, no viajan a git/GitHub, así el historial de commits queda limpio.

- **Script del hook:** `.claude/hooks/backup-app.cjs` (Node, sin dependencias).
- **`App_0000.jsx`** es la línea base (estado previo a activar este sistema, 2026-08-05).
- **Para revertir a una versión anterior:** copiar el `App_NNNN.jsx` deseado sobre `src/App.jsx`. Es instantáneo y no requiere git.
- **Esto NO reemplaza los commits de git** — git sigue siendo la protección de fondo (historial completo + respaldo en GitHub por si falla el disco). El hook es solo para revertir rápido, sin comandos, un cambio reciente que salió mal.
- Si se agregan más archivos "críticos" al sistema (además de `App.jsx`), extender el `matcher` del hook y la lógica de `backup-app.cjs` para cubrirlos.

## Reversión de esquema Supabase (SQL up/down + changelog)

El backup de `App.jsx` de arriba resuelve la reversión del *código*, pero no la de las
bases Supabase (Pilar `dupatnbwrgdtxalpqgqi` y Caamaño `kggpwndbdbqfmupiqrqp`) — los
cambios de esquema son SQL sin migraciones automáticas ni "deshacer" propio de Supabase.
Si se vuelve el código atrás sin también revertir el esquema, puede romper (columna/tabla
que el código viejo no espera, o que espera y ya no existe — ya pasó con `telefono` en
vendedores de Caamaño).

**Convención desde 2026-08-05:** todo cambio de esquema nuevo se entrega como par de
archivos en `sql/`:
- `YYYY-MM-DD-descripcion.sql` — el up.
- `YYYY-MM-DD-descripcion.down.sql` — el inverso exacto (drop de lo que el up creó/agregó), con advertencia explícita si implica pérdida de datos.

Cada par queda registrado en **`sql/CHANGELOG.md`**, junto con el commit de git (y el
`App_NNNN.jsx` cuando aplica) al que corresponde, y si ya se corrió en Pilar/Caamaño.

**Quién corre el up, desde 2026-08-05:** Pablo pidió que Claude corra el SQL directo contra
Supabase (antes se le daba para pegar a mano en el SQL Editor). Ya hay acceso via `psql`
con las mismas credenciales (pooler) que usa `scripts/db-backup.cjs` — ver
`C:\Users\pablo\OneDrive\pensok-db-backups\.env`.
- **Nunca usar `source`/`.` sobre ese `.env` en bash** — si el password tiene `$` (ya pasó
  con el de Caamaño), el shell lo interpreta como variable y lo corrompe silenciosamente,
  y la conexión falla con un error de password que no dice por qué. Extraer el valor con
  `grep '^CAAMANIO_DB_URL=' .env | cut -d= -f2-` en su lugar, nunca hacer `source`.
- Correr el up en cada proyecto que corresponda, actualizar `sql/CHANGELOG.md` marcando
  ✅ corrido, y recién ahí dar el cambio por terminado.
- Esto es solo para el **up** de cambios nuevos (crear tabla/columna). Un **down** (borra
  datos reales) sigue el punto siguiente: nunca se corre sin confirmación explícita.

**Para un pedido tipo "volvé todo a como estaba el [fecha]":**
1. Mirar `sql/CHANGELOG.md` y ubicar todos los cambios de esquema fechados después de esa fecha.
2. Mostrarle a Pablo qué `.down.sql` habría que correr en qué proyecto(s), y si implican pérdida de datos — **confirmar antes de tocar la base**, nunca asumir ni correrlo solo.
3. Recién con eso resuelto (o descartado a propósito), restaurar `App.jsx` al `App_NNNN.jsx`/commit correspondiente.
4. El código se puede revertir solo, sin drama; un DOWN que borra datos reales nunca se corre sin confirmación explícita.

**Punto pendiente de revisar con Pablo:** si los proyectos Supabase (Pilar y Caamaño) tienen point-in-time recovery / backups automáticos habilitados. Si los tienen, son la red de seguridad real para los datos — mucho más confiable que los `.down.sql` a mano, que solo cubren el esquema, no protegen contra pérdida de datos ya cargados.

## Backup de datos Supabase (dump diario gratis, sin Pro)

Supabase Free no da backups automáticos (Pro es ~US$50/mes para los dos proyectos, y ni así incluye point-in-time recovery real sin un add-on aparte). Decisión (2026-08-05): en vez de pagar, dump diario programado vía `scripts/db-backup.cjs`.

- **`npx supabase db dump` NO sirve sin Docker Desktop** (lo corre adentro de un contenedor). En vez de eso, `pg_dump` real está instalado localmente (`C:\Program Files\PostgreSQL\18\bin`, vía winget, **solo command-line tools, sin server ni servicio corriendo**) y se invoca directo a través de Git Bash (`C:\Program Files\Git\usr\bin\bash.exe`).
- Los pipelines (`pg_dump` + `sed`) están en `scripts/pg-dump-schema.sh` y `scripts/pg-dump-data.sh` — son una copia fiel de lo que genera `supabase db dump --dry-run` / `--data-only --dry-run` (CLI 2.111.0), con un typo de esa versión corregido (`--quote-all-identifier` → `--quote-all-identifiers`, sin la 's' pg_dump lo rechaza). Si se reinstala el Supabase CLI y cambia algo, comparar con el dry-run y actualizar estos dos archivos.
- **Ojo con la conexión:** la conexión directa (`db.<ref>.supabase.co`) es **IPv6-only** y en esta red no resuelve. Hay que usar el **Session Pooler** (`aws-1-sa-east-1.pooler.supabase.com:5432`, usuario `postgres.<project-ref>`) — se consigue en el dashboard de Supabase → botón "Connect" (arriba a la derecha, ya no está en Settings → Database) → pestaña "Session pooler".
- `scripts/db-backup.cjs` orquesta: lee las dos URLs del `.env`, corre schema+data por cada proyecto, concatena todo en un solo `.sql` con fecha, limpia dumps de más de 21 días, y loguea todo.
- Guarda los `.sql` en `C:\Users\pablo\OneDrive\pensok-db-backups\{pilar,caamanio}\` — **fuera del repo, fuera de Documents**, adentro de la carpeta OneDrive para que se sincronice solo a la nube privada de esta cuenta, sin pagar nada extra. **Estos dumps incluyen `auth.users` con hashes de password real** — nunca deben ir a git ni compartirse.
- **Credenciales:** las connection strings (con password, formato pooler) viven SOLO en `C:\Users\pablo\OneDrive\pensok-db-backups\.env` (fuera de git). Ver `scripts/db-backup.env.example` en el repo para el formato — ese archivo de ejemplo no tiene passwords reales.
- **Tarea programada:** corre sola todos los días a las 3am vía Task Scheduler de Windows (tarea `PensokDbBackup`, `Get-ScheduledTask -TaskName PensokDbBackup` para revisarla). Log en `C:\Users\pablo\OneDrive\pensok-db-backups\backup.log`.
- **Para restaurar un dump:** es un `.sql` plano — se restaura con `psql <url-pooler> -f archivo.sql` contra un proyecto Supabase (puede ser el mismo u otro nuevo). Esto SÍ requiere `psql` (ya instalado junto con `pg_dump`, mismo `bin`).
- Es más manual que un restore con un click de Supabase Pro, y como máximo se puede perder hasta un día de datos (lo cargado después del último dump). Si el negocio crece y ese margen deja de ser aceptable, ahí sí se justifica reconsiderar Pro/PITR.

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
