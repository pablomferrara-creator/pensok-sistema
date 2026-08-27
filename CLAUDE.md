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

- **Header y footer de los PDF en `celeste=[209,231,251]`, no en negro/gris oscuro** (2026-08-10, pedido de Pablo para no gastar tanta tinta al imprimir remitos/tickets/presupuestos/etc.). Hay **8 funciones** que generan PDF con este patrón de header+footer de ancho completo, cada una con su propia paleta de colores local (no hay una paleta compartida): `generarPDFPresupuesto`, `imprimirTicket`, `imprimirRemito`, `generarDeudaPDF`, `generarListaPDF` (aparece **dos veces**, en `ModuloProductos` y en el submódulo de proveedores/precios dentro de `ModuloConfiguracion` — son copias idénticas, no dead code, hay que tocar las dos), `imprimirRemitoTraspaso`, `imprimirPlanillaConteo`. Si se agrega un PDF nuevo o se edita alguno de estos, mantené la misma convención: fondo `celeste`, texto directamente sobre ese fondo en un color oscuro ya existente en la paleta de esa función (`azul` en las que usan paleta navy, `negro` en las que usan paleta gris/`oscuro`) — **no** blanco, porque blanco sobre celeste clarito no se lee.
- **El logo de PENSOK (`LOGO`/`LOGO_B64`, el JPEG base64 gigante embebido) tiene fondo azul marino [20,53,107] pintado en el archivo mismo** — no es transparente. Por eso, aunque el header de fondo alrededor sea celeste clarito, el logo va a seguir viéndose como un cuadrado azul oscuro (~28-30mm) — es intencional, no un bug: no se puede aclarar sin regenerar el asset, y funciona bien como acento de marca sobre el header claro.

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

- **Bug real de pago parcial al cerrar una venta desde "Nueva venta"** (encontrado y arreglado el 2026-08-10): al elegir "💳 Pago parcial" en el modal de cierre, `confirmarPago` llamaba `cerrarVentaFinal(true, monto, total-monto)` — el `true` (esCobrado) estaba hardcodeado sin importar que quedara saldo pendiente. Eso guardaba la venta con `cobrado:true` aunque `saldo_cobro` fuera >0, y como el botón "💰 Registrar cobro" y el badge de "pendiente" en Ingresos solo miran `cobrado` (no `saldo_cobro`), la venta se veía como totalmente cobrada y el saldo quedaba invisible e imposible de cobrar desde la UI — el patrón correcto (`cobrado = saldo===0`) ya se usaba en otros lados del código (edición de venta, `registrarCobro`) pero no acá. Fix: el pago parcial ahora pasa `false`. Como consecuencia, también hubo que cambiar `registrarVenta` — el bloque que crea el registro en `pagos_deuda` y persiste `monto_cobrado`/`saldo_cobro` estaba gateado por `if(venta.cobrado)`, así que con el `false` correcto ese bloque dejaba de correr y el pago parcial hecho en el momento se perdía sin dejar rastro. Ahora corre si `venta.cobrado||(venta.monto_cobrado>0)`, para cubrir ambos casos (cobro total, y cobro parcial con saldo).
- **"Nueva venta" (`ModuloVenta`) no precarga vendedor por defecto, a propósito** (2026-08-10, pedido de Pablo): antes arrancaba con el primer vendedor de la lista ya seleccionado, y en la práctica nadie lo cambiaba aunque la venta la hiciera otra persona — quedaba todo mal atribuido a ese vendedor "por defecto" (típicamente el primero alfabético/por orden de carga). Ahora `vendedor` arranca en `""`, el selector tiene un placeholder "Seleccionar...", los botones "Cerrar venta" y "Generar presupuesto" quedan deshabilitados sin vendedor elegido (con un aviso amarillo visible), y **también se resetea a `""` después de cada venta cerrada** — no alcanza con sacar el default inicial, porque en una terminal compartida el campo quedaba pegado al último vendedor elegido de la venta anterior, que es el mismo problema pero disparado por la venta previa en vez de por la carga de la página. Mismo criterio útil para cualquier otro selector "por persona" que se agregue a futuro: si nadie lo cambia en la práctica, mejor no precargarlo.
- **El campo "Cliente" de "Nueva venta" dejó de ser un `<select>` nativo** (2026-08-11, pedido de Pablo: en la versión mobile, recorrer el `<select>` con todos los clientes para encontrar uno era lento y molesto). Ahora es un buscador propio (`clienteBusq`/`clientesFiltrados`/`seleccionarCliente`), mismo patrón exacto que ya usa el buscador de productos un poco más abajo en el mismo componente: el input muestra el cliente ya elegido como `placeholder` (no como `value`), y el desplegable de resultados solo aparece mientras hay algo tipeado — se vacía el texto después de elegir uno. "Consumidor Final" queda pineado como primer resultado siempre que matchee la búsqueda. Si se necesita el mismo buscador en otro selector de cliente (ej. "Editar venta" en Ingresos, que sigue usando el `<select>` viejo), replicar este mismo patrón ahí en vez de inventar uno nuevo.
- **Replicación de productos**: nuevo producto creado en Pilar se replica a Caamaño con `stock=0`. Cambios de costo en Pilar también replican a Caamaño por código de producto. Precio y stock son independientes por local.
- **Replicación de proveedores**: bidireccional, matcheo por nombre normalizado (sin mayúsculas/espacios). Nombres van en Title Case, con excepciones para siglas (ML, QDN se dejan en mayúsculas) y conjunciones en español ("Sol y Agua", la "y" en minúscula).
- **Tareas**: tabla única compartida en la base de Pilar (no se replica, es fuente única). Requiere policy `allow_all` en la tabla `tareas` de Pilar — el resto de las tablas de este proyecto ya usan RLS activo + policy `allow_all` como convención (no auth-gated).
- **Tipos de egreso especiales** (`TIPOS_EGRESO`): `"Gasto fijo"`, `"Gasto variable"`, `"Retiro de Ganancia"`, `"Inversión inicial"`. Estos dos últimos tienen tratamiento especial en el Cierre de Caja:
  - `"Inversión inicial"`: plata que puso un socio de su bolsillo, NUNCA sale de la caja del local → excluida totalmente del cálculo (ni billetera ni "gastos").
  - `"Retiro de Ganancia"`: reparto de ganancia ya generada → SÍ resta de la billetera física (la plata sale de verdad), pero NO resta de "Ganancia neta acumulada" / "Total gastos" (no es un costo operativo).
- **Egresos — flujo de dos pasos obligatorio**: al crear un egreso solo se carga el concepto (queda pendiente de pago). El pago real (fecha, método, monto) se registra después con "Registrar pago", que crea una fila en `pagos_egreso`. **Esta es la única fuente que lee correctamente el Libro de Movimientos** — un pago cargado directo en el egreso al crearlo no queda reflejado ahí. (Ya se sacaron del modal de creación los campos "Método de pago" y "Pago a proveedor" por esta razón; hay un cartel explicándolo en el modal.)
- **Comisión de plataforma (MP)**: se descuenta UNA sola vez por venta, del primer pago no-efectivo — nunca del pago en efectivo, incluso si la venta se cobró en partes por métodos distintos.
- **Atribución de ventas por billetera en el Cierre de Caja**: si una venta tiene pagos registrados en `pagos_deuda` (cobros parciales), se usa el método REAL de cada pago — no el `metodo_pago` nominal de la venta. Esto importa mucho para ventas con pago mixto (parte efectivo, parte MP).
- **Devoluciones (notas de crédito)**: tablas `devoluciones` + `devolucion_items`, solo en Pilar y Caamaño por separado (no compartidas). Reingresan stock matcheando por `producto_id` cuando está disponible, con fallback a nombre (ver sección "Vincular ventas/abastecimiento/devoluciones al producto real" más abajo — esto cambió el 2026-08-07). Pueden ser reembolso en dinero o saldo a favor del cliente, y restan del Cierre de Caja como salida de billetera.
  - **Ver el detalle de una NC ya creada** (agregado el 2026-08-11): la card de la venta en Ingresos ya mostraba un badge "📝 NC" cuando había una devolución vinculada, pero era puramente informativo, sin forma de ver qué decía — Pablo no encontraba cómo. Ahora el badge es clickeable (`verNC`) y abre un modal de solo lectura con nro de nota, fecha, tipo (dinero/saldo), motivo, y los ítems devueltos. Los datos ya estaban siempre disponibles (`cargar()` trae `devoluciones` con `devolucion_items(*)` embebido via `select("*, devolucion_items(*)")`) — no hizo falta ninguna consulta nueva, solo faltaba la pantalla para mostrarlo. No hay ningún otro lugar en la app para listar/buscar devoluciones sueltas (sin partir de la venta) — si hace falta eso en algún momento, es una pantalla nueva a construir aparte.
- **Sales/Excel**: Google Sheet con una fila por ítem vendido; varios ítems comparten el mismo "N Factura" (ej. `VEN-20260429-00002`), que es la clave de deduplicación contra `ventas`/`venta_items`.
- **Editar el método de pago de una venta ya cobrada**: `editarVenta` actualiza `ventas.metodo_pago`, pero el Cierre de Caja y el Libro de Movimientos usan el método REAL guardado en `pagos_deuda` cuando existe (ver regla de arriba). Si la venta ya estaba cobrada (no se está marcando/desmarcando cobrado ni registrando un pago nuevo) y tiene un único pago simple asociado, `editarVenta` también corrige ese registro de `pagos_deuda` automáticamente. Si la venta tiene cobros partidos (varios pagos), NO se toca nada automáticamente — cada pago parcial se corrige a mano desde "Editar pago" en el detalle de esa venta, porque no hay forma de saber a cuál de los pagos partidos se refiere el cambio.
- **"Cobrado" ya no es un checkbox en los modales de editar venta** (ni en "Editar venta" ni en "Actualizar venta", la edición rápida de vendedores) — se sacó a propósito, igual que "Método de pago"/"Pago a proveedor" en la creación de egresos, porque duplicaba/confundía con el flujo correcto: **"Registrar cobro"** (botón que aparece en la venta mientras no esté cobrada) es el único camino para marcar un cobro, porque ahí sí se registra fecha/monto/método reales en `pagos_deuda`. Ambos modales ahora muestran el estado de cobro como badge de solo lectura.
- **"Saldo adeudado" en Clientes**: se calcula igual que "Nos deben clientes" del Dashboard — ventas con `saldo_cobro>0` o `cobrado=false`, NO el campo `cuenta_corriente` del cliente (ese es un mecanismo aparte, casi sin uso, que solo se mueve cuando una venta se paga explícitamente con método "Cuenta corriente"). El badge "Debe $X" de cada cliente en la lista usa la misma lógica real, no `cuenta_corriente`.
- **"Stock actual" no se puede editar desde "Editar producto"** (2026-08-06, a propósito) — solo se muestra de solo lectura, con una nota apuntando a Abastecimiento/Control de Stock. Mismo criterio que "Cobrado"/"Método de pago" en ventas y egresos: cualquier cambio de stock tiene que pasar por un flujo que deje movimiento trazable (`registrarAbastecimiento`, o Control de Stock), nunca un pisado directo sin rastro. Al **crear** un producto nuevo sí se puede cargar el stock inicial (no hay movimiento previo que trazar).
- **Mismo criterio en "Editar egreso"** (2026-08-07): "Método pago" se sacó del todo (quedó vestigial, el método real vive en cada pago individual) y **"Ya reembolsado" es de solo lectura** — para registrar o corregir un pago hay que pasar por "Registrar pago" en el detalle del egreso, que sí deja fecha/método/comisión reales en `pagos_egreso`. `efMetodo`/`efReembolsado` siguen existiendo como estado interno (se reenvían tal cual al guardar otros campos), solo se les sacó el control editable.
- **`registrarEgreso` (creación) tiene que respetar "Inversión inicial" al armar `reembolso_pendiente`/`reembolsado`** (bug real encontrado y arreglado el 2026-08-10): el formulario (`guardar()` en `ModuloEgresos`) ya calculaba esos campos bien según `esInversion`, pero el `payload` de `registrarEgreso` los pisaba siempre a `reembolso_pendiente:true, reembolsado:false` sin mirar el tipo — nunca se notó porque a la fecha del fix no había ningún egreso de tipo "Inversión inicial" cargado en ninguno de los dos locales, pero de haber existido uno hubiera aparecido incorrectamente como deuda del negocio hacia el socio que invirtió. Ahora `registrarEgreso` calcula `esInversion` él mismo, así queda protegido sin depender de que cada caller lo arme bien.
- **Card "💸 Reembolsos pendientes" (`ModuloEgresos`) solo se mostraba si había deuda con vendedores** (`deudasPers.length>0`), aunque hubiera deuda de Pensok con proveedores (`deudaPensok>0`) — bug real, arreglado el 2026-08-10: ahora la condición es `deudasPers.length>0||deudaPensok>0`. Si en Caamaño no aparece esta sección es porque hoy no hay ningún egreso con `reembolso_pendiente=true` ahí (verificado por consulta directa) — es un estado vacío real, no un bug de visualización.
- **Deuda por Traspasos en el card "Reembolsos pendientes"** (2026-08-10): solo en Caamaño (`localKey==="camanio"`) se agregó un tercer bloque que muestra cuánto le debe a Pilar por traspasos de mercadería sin saldar todavía. **Ojo con la fuente del dato**: la primera versión de esto sumó `saldo_pendiente` de la copia LOCAL de `traspasos` en Caamaño (replicada desde Pilar) y dio un número mal — bien más alto que el real ($1.627.322 / 17 traspasos vs. el real $337.218 / 7). La causa es un bug preexistente en `registrarPagoTraspaso`: al pagar un traspaso en Pilar, la actualización del espejo en Caamaño matchea la fila por `fecha` nada más (no hay ningún id compartido entre ambas copias) — con dos traspasos de la misma fecha, `maybeSingle()` no encuentra una fila única y la actualización se salta en silencio, dejando la copia de Caamaño con saldo viejo. **Ese bug de sincronización ya se arregló el 2026-08-11** (ver sección "Editar/eliminar Traspasos" más abajo — se agregó `traspasos.pilar_id` como link real entre ambas copias, con backfill de los traspasos viejos). Igualmente `deudaAPilar` se sigue calculando leyendo directo de Pilar vía `supabaseOtro` en vez de la copia de Caamaño — es una fuente más simple y robusta de por sí, no hace falta volver a depender de la copia solo porque ahora esté sincronizada bien.

## Panel flotante de Tareas pendientes (2026-08-10)

`TareasFlotante` (componente propio, cerca de `NavGroupDropdown`) — pill fijo abajo a la
izquierda (a propósito, para no pisar los toasts que salen abajo a la derecha), visible en
cualquier módulo porque se renderiza una sola vez al final del `return` de `App`, junto al
`<Toast/>`. Arranca siempre colapsado (mismo comportamiento en PC y mobile — Pablo lo pidió así
porque en mobile no sobra espacio para tenerlo expandido de forma permanente) y al tocarlo
despliega una tabla con cada responsable y su cantidad de tareas pendientes (rojo si tiene
alguna vencida o que vence hoy, mismo criterio que ya usa el badge de la pestaña Tareas). Se
cierra tocando afuera (mismo patrón de outside-click que `NavGroupDropdown`), tocando el pill de
nuevo, o eligiendo un nombre.

- **Por qué existe**: el badge de Tareas vivía escondido adentro del dropdown del grupo "Otros"
  del menú — había que abrirlo para verlo. Este panel lo saca de ahí para que se note sin tener
  que navegar a ningún lado.
- **Se cuentan TODAS las pendientes de cada persona** (no solo vencidas) para reflejar la carga
  real — la vencida solo cambia el color del número, no filtra qué se cuenta.
- Solo se agrupan tareas **con responsable asignado** — no hay fila "Sin asignar" (a propósito,
  ver conversación: el pedido fue "una tabla con los nombres de cada uno").
- Filtra por el local activo igual que el resto (`t.local===localKey||t.local==="ambos"`).
- Si el total de pendientes da 0, el componente no renderiza nada (`return null`) — no hay pill
  vacío dando vueltas.
- **Click en un nombre navega a Tareas con el filtro de responsable ya aplicado**, reusando el
  mismo mecanismo de "filtro inicial + consumirFiltro" que ya usan Egresos e Ingresos (acá:
  `filtroTareasResp`/`irATareasDe` en `App`, `filtroRespInicial`/`onConsumirFiltroResp` en
  `ModuloTareas`) — no es un patrón nuevo.

## Calendario de Tareas — celdas de tamaño fijo (2026-08-11)

Las celdas del calendario mensual (`tab==="calendario"` en `ModuloTareas`) usaban `minHeight:64`
en vez de una altura fija, así que un día sin tareas quedaba mucho más chico que un día con 3
tareas cargadas — Pablo pidió que todos los cuadros queden iguales. Fix: `height:80` fijo +
`overflow:"hidden"` en la celda, y `flexShrink:0` en el número de día, cada tarea, y el "+N más" —
así ningún contenido se comprime ni fuerza la celda a crecer, y si alguna vez el contenido no
entra (no debería pasar, ya está limitado a `delDia.slice(0,3)` tareas) se recorta en vez de
desbordar. El texto de cada tarea ya tenía `whiteSpace:"nowrap"` + `textOverflow:"ellipsis"` de
antes -- eso no cambió, solo la altura del contenedor.

## Valor de stock — no debe contar negativo el stock negativo (2026-08-10)

Las 3 fórmulas que calculan "valor de stock a costo" (`asegurarValorStockDiario` — la foto
diaria que arma `historial_valor_stock`, el `MetricCard` de `ModuloAnalisis`/Dashboard, y el de
`ModuloProductos`) hacían `productos.reduce((s,p)=>s+precioARS(p.costo,p.moneda)*p.stock,0)` sin
piso en cero. Un producto con stock negativo (pasa seguido acá: se vende y se va a buscar al
proveedor después, o los vendedores envasan/venden y cargan el Abastecimiento más tarde) restaba
su costo del total en vez de sumar cero — un producto en -75 unidades no representa "perdimos esa
plata", representa "todavía no lo compramos", así que no debería bajar el valor de los activos
que sí tenés físicamente. Bug real encontrado por Pablo el 2026-08-10 al notar una caída rara en
"Detalle por día"; confirmado contra la base: 16 productos en negativo restando **$2.670.334** en
Pilar, 4 restando **$290.462** en Caamaño, al momento del fix.

**Fix**: las 3 fórmulas ahora usan `Math.max(0,p.stock)` en vez de `p.stock` directo. Esto NO
retroactiva el historial ya guardado en `historial_valor_stock` — cada fila es una foto agregada
del día (no se guardó el detalle por producto), así que no hay forma de recalcular los valores
históricos con la fórmula corregida. Solo las fotos de acá en adelante quedan bien. Ojo si se
agrega alguna otra métrica que sume `costo*stock` en el futuro: mismo criterio, `Math.max(0,...)`.

**Métrica "Pendiente de abastecer"** (agregada a pedido de Pablo, mismo día): card nueva en
Dashboard (al lado de "Valor stock a costo") y en Productos (al lado de "Valor stock"), que
suma `precioARS(costo,moneda)*Math.max(0,-stock)` — el valor absoluto de todo lo que está en
negativo, mostrado APARTE, nunca restando de `valorStock`. Solo se muestra si da mayor a
cero (`pendienteAbastecer>0`) para no ensuciar el dashboard cuando no hay nada así. Da
visibilidad de cuánta plata está "comprometida" en compras que todavía no se cargaron, sin que
afecte el número de valor de stock real.

## Stock mínimo en 0 = no pedir reposición nunca (2026-08-11)

`estadoStock(p)` (línea ~90, usada en TODOS los lugares que deciden si un producto "necesita
atención": badge de alertas de la pestaña Inventario, card "Stock crítico" del Dashboard, las
métricas "Bajo stock"/"Agotados" y sus filtros en `ModuloProductos`, y los PDF de listas
filtradas por estado) ahora devuelve `"ok"` sin importar el stock actual si `stock_min===0` —
ni "bajo" ni "agotado". Antes esto NO era consistente: `ModuloProductos` ya lo hacía bien (tenía
su propio filtro `&&(p.stock_min||0)>0` aparte, ahora removido porque quedó redundante), pero el
badge de Inventario y el "Stock crítico" del Dashboard NO, así que un producto con mínimo 0 y
stock en 0 igual aparecía ahí como "Agotado". Encontrado por Pablo el 2026-08-11 al preguntar si
ya estaba hecho así. Impacto real medido en Pilar al momento del fix: **203 productos activos
con `stock_min` en 0, de los cuales 140 ya estaban en 0 de stock** — todos esos 140 dejaron de
contarse como alerta. `stock<0` (negativo) se sigue marcando igual sin importar `stock_min` — es
un problema de datos aparte (vendido antes de abastecer), no un aviso de "andá a comprar más".
- **Filtro "Stock mínimo" en la tabla de Productos** (mismo día): dropdown nuevo al lado de
  "Estado" — "Con mínimo" / "Sin mínimo (0)" / "Todos" — para poder auditar rápido a cuáles
  productos les falta setear el mínimo, ya que ahora un mínimo en 0 significa "no avisar nunca"
  (ver punto de arriba) y por eso importa saber cuáles quedaron así sin querer vs. a propósito.
- **No existe (todavía) un campo de "stock deseado"** — solo `stock` (actual) y `stock_min`
  (umbral de alerta). Pablo preguntó dónde se carga porque lo usa para calcular cuánto comprar;
  hoy no hay ningún lugar para eso, es un campo nuevo a agregar si se pide explícitamente (no se
  agregó de entrada porque cambia el modelo de datos — hay que definir junto con Pablo qué
  significa exactamente y dónde se usa antes de tocar el schema).

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
- **"Registrar ingreso" en Abastecimiento carga varios productos de una sola vez** (2026-08-07, antes era uno por vez — un problema real para compras de varios ítems referidas a un mismo egreso). Es un carrito: buscás y agregás productos, cada uno con su propia cantidad/costo, pero proveedor/responsable/fecha/"a qué compra corresponde"/notas son compartidos por todo el lote (`registrarAbastecimientoLote`, que llama internamente al mismo núcleo que un ingreso suelto — no hay lógica duplicada). Si dos productos del mismo lote consumen el mismo producto a granel (ver más abajo), el descuento de cada uno se aplica en orden y no se pisan entre sí (`overrides` interno, importante si se toca ese código).
- **Al cargar cada producto en Abastecimiento**, hay un desplegable opcional "¿A qué compra corresponde?" que lista los egresos marcados como compra de productos (prioriza los del mismo proveedor elegido). Esto graba `abastecimiento.egreso_id` en cada fila del lote.
- **El desplegable excluye los egresos cuya tarea de recordatorio ya está tildada** (2026-08-11, pedido de Pablo: la lista se iba acumulando indefinidamente y se hacía imposible de recorrer). Matchea por texto — la tarea arranca su `descripcion` con `Egreso #<id>:` (mismo patrón que usa Control de Stock con `Conteo #<id>` para su propio auto-cierre) — filtrado también por `local` porque `tareas` es una tabla compartida entre Pilar y Caamaño y los ids de egreso NO son únicos entre proyectos (cada uno tiene su propia secuencia). A propósito NO se usa "¿ya tiene algún abastecimiento vinculado?" como señal de completo — una compra puede traer varios productos cargados en momentos distintos, así que tener uno vinculado no significa que esté completa; tildar la tarea sigue siendo la única señal de "ya cargué todo", igual que antes. Si alguien tilda una tarea de más temprano y necesita seguir cargando esa compra, puede destildarla desde Tareas para que reaparezca en el desplegable.
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
- **Bug real de fondo, encontrado y arreglado el 2026-08-26**: `productos.stock` era `integer`. Con un `consumo_granel` fraccionario (ej. 0,08L por bidón, caso real: Desinfectante Pisos Limón Concentrado 1L), la resta `stock - cantidad*consumo_granel` se calculaba bien en JS pero Postgres la **redondeaba en silencio al guardarla** — 5 bidones × 0,08L = 0,4L a restar, que redondea de vuelta al mismo entero de partida, así que parecía que no pasaba nada. Con un `consumo_granel` entero (ej. 1, como el Cloro) nunca se notó porque la resta siempre daba un número entero. Ver sección "Stock con decimales" más abajo para el fix completo (no quedó acotado a productos a granel — Pablo pidió que el stock admita decimales para cualquier producto).

## Stock con decimales (2026-08-26)

`productos.stock`, `abastecimiento.cantidad`, `conteos_stock_items.stock_sistema`/`stock_contado` pasaron de `integer` a `numeric(12,2)` en los dos proyectos (`sql/2026-08-26-stock-decimales.sql`) — ver el bug real que lo motivó en "Productos a granel" arriba. A propósito **no quedó acotado a productos con `granel_id`** — cualquier producto puede tener stock fraccionario si hace falta.

- **Por qué también `abastecimiento.cantidad`**: ahí es donde queda la fila de traza "Envasado en..." con los litros consumidos — si esa columna se hubiera dejado entera, la traza seguiría rota aunque `productos.stock` ya soportara decimales.
- **Por qué también `conteos_stock_items`**: para poder cargar un conteo físico con decimales (ej. "quedan 4,6 litros en el vinner") — pedido explícito de Pablo.
- **`stock_min` NO se tocó** (sigue `integer`) — no era parte del bug reportado y no hubo pedido de cambiarlo.
- **Display**: `fmtNum` (línea ~83) ahora usa `maximumFractionDigits:1` — muestra un decimal solo si el valor lo tiene (ej. "4,6"), y ninguno si es entero (ej. "5", no "5,0"). Esto no afectó a los demás usos de `fmtNum` (conteos de ventas, clientes, etc.) porque esos valores siempre fueron enteros de por sí. Varias interpolaciones de `{producto.stock}` que estaban SIN pasar por `fmtNum` (tabla de Productos, buscadores de producto en Venta/Abastecimiento/Traspasos, Reporte de compra, Pedidos web) se envolvieron con `fmtNum(...)` — antes mostraban el número crudo de JS, que sin este fix ya hubiera mostrado más de un decimal para un stock fraccionario.
- **`parseInt`→`parseFloat`** en los inputs que cargan/corrigen stock a mano: el campo "Stock actual" al editar un producto, y el conteo físico en Control de Stock (`crearConteoStock`/`editarConteoStockItems`). Los inputs de cantidad de bidones/unidades a cargar (ej. en Abastecimiento) siguen en `parseInt` a propósito — no tiene sentido cargar "4,6 bidones".
- **`_procesarUnIngresoAbastecimiento` ahora chequea el `error` de las dos escrituras del descuento de granel** (antes ninguna de las dos lo hacía — si el update de stock del granel o el insert de la traza fallaban, quedaba en silencio total, sin aviso ni en consola). Si el update de stock falla, se muestra un toast de error explícito. `editarAbastecimiento` (la corrección de un ingreso ya cargado) NO recibió el mismo chequeo — quedó fuera de alcance de este fix puntual.
- **Corrección retroactiva aplicada a mano el mismo día**: el ingreso #2976 de Desinfectante Pisos 4L (5 bidones, con el `consumo_granel=0,08` ya bien configurado) se cargó momentos antes de que este fix subiera, así que tampoco descontó el granel. Se corrigió a mano: `Desinfectante Pisos Limón Concentrado 1L` de 5 a 4,6, con su fila de traza en `abastecimiento` (id 2977) explicando la corrección. **Ojo**: no se investigó si este mismo granel estuvo vinculado desde antes de ese día con otros ingresos históricos sin descontar — si alguna vez se sospecha eso, hay que revisar `abastecimiento` de ese producto retail buscando ingresos sin su "Envasado en..." correspondiente en el granel, antes de asumir que está todo bien.

## Descuentos de proveedor sobre egresos ya pagados

Problema que resuelve: a veces se paga un egreso completo y días después el proveedor devuelve parte en plata real (ej. descuento por pronto pago). Antes no había forma de registrar eso sin tocar el egreso o el pago original, lo que descuadraba el Libro de Movimientos.

- **Tabla nueva `descuentos_egreso`** (por local): fecha, egreso vinculado, monto, método (cómo se recibió: mismos `METODOS_PAGO` que el resto), notas. Se carga desde el modal "Pagos" del egreso (botón "+ Registrar descuento"), independiente de si el egreso ya está saldado o no.
- **Bug real de acceso, encontrado y arreglado el 2026-08-10**: el único botón que abre el modal "Pagos" (donde vive "+ Registrar descuento") era "+ Registrar pago" en la card del egreso, y ese botón solo se mostraba con `e.reembolso_pendiente&&!e.reembolsado` — es decir, **desaparecía justo cuando el egreso quedaba totalmente pagado**, que es el único momento en que tiene sentido cargar un descuento recibido después. El modal en sí ya estaba bien armado (esconde correctamente la sección "Registrar nuevo pago" cuando no hay saldo, pero muestra igual el historial y "Descuentos recibidos") — el problema era puramente el botón de entrada. Fix: el botón ahora siempre se muestra para admin, con el label cambiando según el estado — "+ Registrar pago" si queda saldo pendiente, "💸 Pagos / Descuento" si ya está saldado — pero ambos abren el mismo modal.
- **No modifica el egreso ni `pagos_egreso`** — el pago original sigue reflejando el monto completo que salió ese día (correcto: eso fue lo que realmente pagaste). El descuento es un evento propio, con su propia fecha/método reales.
- **Se suma al Libro de Movimientos como un `ingreso` más** (fuente #9 en `ModuloCaja`, junto a cobros de venta/traspasos/etc.), en la billetera que corresponda según el método elegido — así la caja da bien en el día real en que entró la plata, no en el día del pago original.
- Solo contempla devoluciones en **plata real** (efectivo/transferencia/etc.) — si algún proveedor empieza a dar notas de crédito para descontar en la próxima compra en vez de devolver plata, eso es un caso distinto (no debería sumarse acá, porque no es caja real todavía) y habría que pensarlo aparte.
- **`egresos.monto` NUNCA se toca por un descuento** — sigue siendo el monto nominal/original del gasto (2026-08-07, a propósito, para no perder el registro histórico real). Donde SÍ se descuenta, restando `descuentos_egreso` vinculados:
  - **Dashboard** (`ModuloAnalisis`): `gastosFijos`/`gastosVar` (y por lo tanto "Ganancia Real") se calculan netos de descuentos — el costo real de un gasto siempre fue el neto, aunque el descuento haya llegado después.
  - **Egresos → "Gastos este mes"** (`totalMesPagado`): también neto. El sub-label "Total devengado" (`totalMes`) queda BRUTO a propósito — es el compromiso nominal, no lo que efectivamente salió.
  - **Modal "Pagos" del egreso**: muestra "Total del egreso" bruto (como siempre) + el desglose de descuentos/comisiones y un "Neto real" debajo, si hay alguno cargado (ver también la sección de comisiones, abajo).
  - Si se agrega un nuevo lugar del código que sume `egresos.monto` como "costo real", chequear si también necesita restar `descuentos_egreso` (y sumar comisiones, ver abajo) para no sub/sobrestimar el gasto.
- **Filtro "Billetera" en Egresos** (agregado el 2026-08-11, pedido de Pablo): filtra por de dónde salió realmente la plata, no por `egreso.metodo_pago` (ese campo quedó vestigial — ver arriba, "Mismo criterio en 'Editar egreso'" — siempre vale "Efectivo" para egresos nuevos porque el método real vive en cada `pagos_egreso`). Matchea si ALGUNO de los pagos del egreso usó un método de esa billetera (`billeteraDeMetodo`, constante global nueva cerca de `METODOS_PAGO`). Un egreso sin ningún pago registrado todavía no matchea ningún filtro puntual de billetera (todavía no salió plata de ningún lado). `MP_METODOS_BILL`/`BANCO_METODOS_BILL` son una copia global de los mismos grupos que ya usa `ModuloCaja` internamente (`MP_METODOS`/`BANCO_METODOS`, declarados ahí como locales) — no se unificaron para no tocar ese componente, que es zona frágil; si se agrega un método de pago nuevo, actualizar en los dos lugares.
- **Bug real encontrado y arreglado el 2026-08-11**: `calcBolsillo` en `ModuloCaja` (la fórmula del "esperado" por billetera para el Cierre de Caja) nunca sumaba `descuentosEgreso`, a pesar de que el descuento SÍ aparece como ingreso en el Libro de Movimientos (fuente #9, ver arriba) — son dos cálculos completamente separados dentro del mismo componente, y solo se había cableado el segundo. Resultado: el "real" contado en la billetera (que sí incluye la plata que el proveedor devolvió) quedaba más alto que el "esperado" (que no la reconocía), y el Cierre de Caja mostraba una diferencia positiva falsa del mismo monto que el descuento. Encontrado por Pablo al notar un sobrante raro justo después de cargar un descuento de $236.000 en el alquiler. Fix: se agregó `descuentosDesde`/`descEfDesde`/`descMPDesde`/`descBancoDesde` (mismo filtro por `fecha>=fechaInicio` y por `metodo_pago` que ya usa el resto de `calcBolsillo`) y se suman en las tres billeteras (`caja_chica`/`mp`/`banco` — `ahorro` no recibe descuentos directos, solo movimientos entre bolsillos). También se agregó al texto de detalle (`det:`) de cada bolsillo para que se vea explícito de dónde sale la diferencia.

## Comisión de plataforma al pagar un egreso

Mismo concepto que `ventas.comision_plataforma`, pero **invertido**: en ingresos la comisión reduce lo que cobrás (cobrás $10.000, te acreditan $9.500); en egresos hace que salga **más** plata de tu billetera de la que le debías al proveedor (le debías $10.000, pagaste por una vía con comisión, de tu cuenta salieron $10.500 — el proveedor solo recibió $10.000, la diferencia te la cobró la plataforma a vos).

- **Se guarda por PAGO individual** (`pagos_egreso.comision_plataforma`), no por egreso completo — a diferencia de ventas (que es un cobro único), un egreso puede pagarse en varias partes con métodos distintos, y cada pago puede tener o no comisión según cómo se hizo ese pago puntual.
- **Aparece en "Registrar pago"** (modal "Pagos" del egreso) solo cuando el método elegido es de los que cobran comisión (`METODOS_CON_COMISION_EG` — mismo listado que usa Ingresos para ventas, pero declarado aparte porque cada uno vive en su propio componente, no hay una lista compartida a nivel de módulo).
- **NO cuenta para saldar la deuda con el proveedor** — `monto_reembolsado`/`saldo_pendiente` del egreso se calculan solo con `pago.monto`, la comisión es un costo aparte.
- **Suma al Libro de Movimientos**: el monto que sale de la billetera en la fuente #5 (`ModuloCaja`) es `pago.monto + pago.comision_plataforma`, no solo `pago.monto`.
- **Suma a los indicadores de gastos** (mismo lugar que resta `descuentos_egreso`, ver arriba): Dashboard (`gastosFijos`/`gastosVar`) y "Gastos este mes" en Egresos.
- **"Editar pago" en el modal "Pagos"** (agregado el 2026-08-11, pedido de Pablo): antes un pago de `pagos_egreso` solo se podía borrar, no corregir — típicamente hacía falta para agregar la comisión cuando se había olvidado al registrar el pago. Botón ✏️ al lado de cada pago en "Pagos registrados" (`abrirEditarPago`), que reutiliza el mismo formulario de "Registrar nuevo pago" en modo edición (cambia el título a "Editar pago", agrega un link "Cancelar edición", y el botón pasa a "✓ Guardar cambios"). Reusar el form en vez de duplicar uno aparte fue deliberado — mismos campos, misma validación. A diferencia de "Registrar nuevo pago" (que solo aparece con saldo pendiente), esta sección también se muestra si `editandoPago` está seteado, aunque el egreso ya esté 100% saldado — si no, sería el mismo bug que el botón "+ Registrar pago" (ver más abajo, "Bug real de acceso"). `editarPagoEgreso` (en `useData`) solo recalcula `monto_reembolsado`/`saldo_pendiente`/`reembolsado` del egreso si el `monto` del pago cambió al editar (si solo se corrigió la comisión o la fecha, no hace falta tocar el egreso). **Ojo**: la lista de "Pagos registrados" existe en DOS lugares distintos que no comparten JSX — el modal "Pagos" (recién descripto) y un historial inline más chico que se muestra directo en la card del egreso en la lista de Egresos. El botón ✏️ hay que agregarlo en los dos (el primer intento solo lo agregó en el modal y no en el inline, y Pablo no lo encontraba porque miraba la card de la lista). El inline abre el mismo modal en modo edición: `onClick={()=>{setModalPagos(e);abrirEditarPago(p);}}`.

## Vincular ventas/abastecimiento/devoluciones al producto real (no solo al nombre)

Problema que resuelve: históricamente, `venta_items`/`abastecimiento`/`devolucion_items` guardaban el **nombre del producto como texto plano**, capturado en el momento de la operación — no una referencia real al producto. Si renombrás un producto, las operaciones viejas se quedan con el nombre viejo para siempre, y cualquier reporte que agrupe "por producto" (Pareto, "más vendidos") ve el nombre nuevo como si fuera un producto distinto — la métrica se corta en dos.

- **`producto_id` ahora se guarda siempre que se pueda**, en los 3 (`venta_items`, `abastecimiento`, `devolucion_items`). `productos.id` (la clave primaria) **nunca es editable desde la app** — no está en `CAMPOS_PRODUCTO`, no hay campo para eso en ningún formulario — así que una vez vinculado, ese vínculo es estable para siempre, renombres incluidos. (No confundir con `codigo`, que sí es editable — el vínculo usa `id`, no `codigo`.)
- **`abastecimiento` ya venía guardándolo bien solo desde el 2026-04-30** (sin que nadie lo hubiera pedido) — el problema real estaba en `venta_items` (∼0,8% vinculado antes de esto) y `devolucion_items` (la columna ni existía).
- **Backfill histórico (2026-08-07, `sql/2026-08-07-vincular-productos-historico.sql`)**: matcheo por nombre EXACTO contra los productos de hoy, excluyendo nombres duplicados (hay un caso real: "Atermico Listón Marfil Solarium x unidad (10cm x 100cm)"). Resultado: **Pilar 15.969/16.255 venta_items (98,2%) y 2.328/2.399 abastecimiento (97,0%) vinculados; Caamaño 385/396 (97,2%) y 424/431 (98,4%).** Lo que no matcheó son ventas de productos ya renombrados/discontinuados antes de este fix, o ítems sueltos sin catálogo — quedan con el nombre histórico nomás, no hay forma de recuperarlos retroactivamente.
- **4 lugares insertan `venta_items`** — los 4 tienen que guardar `producto_id`: `registrarVenta`, `aceptarPedidoWeb`, y las **dos copias duplicadas** de `guardarVenta` dentro de `ModuloIngresos` (ver "Zonas frágiles" arriba — la que corre en runtime es la de más abajo, `agregarItemEv`/`itemsN`; la de arriba, `agregarItemDesdeProducto`/`itemsNum`, es código muerto pero se mantuvo igual por consistencia).
- **Reportes "por producto" del Dashboard** (`vendidosPorProd`, `gananciaPorProd`, Pareto): agrupan por una clave `id:<producto_id>` cuando existe, con fallback a `nombre:<nombre>` para lo que no se pudo backfillear. Para las filas agrupadas por ID, el nombre que se muestra es el **nombre ACTUAL** del producto (se busca en `productos`, no el que tenía en el momento de la venta) — así una venta vieja de "Cloro 5L" aparece bajo "Cloro Líquido 5L" si lo renombrás después, en vez de partirse en dos líneas.
- **Qué hacer si se agrega un nuevo lugar que inserta `venta_items`/`abastecimiento`/`devolucion_items`**: siempre mandar `producto_id` si se tiene a mano. Si se agrega un nuevo reporte "por producto", usar el mismo patrón de clave `id:`/`nombre:` (`claveProducto`/`nombreActualProducto` en `ModuloAnalisis`), no agrupar directo por `.nombre`.

## Productos en USD con descuento de proveedor (2026-08-26)

Problema que resuelve: Vulcano pasa su lista en USD. La conversión real es `costo_usd × (1+IVA%) × tipo_de_cambio × (1-descuento%)`, con el descuento siendo dos descuentos sucesivos que Vulcano da (25% + 10% por pago de contado) ya compuestos en un solo % — `(1-0.25)*(1-0.10)=0.675`, o sea **32,5%** — guardado en `proveedores.descuento`. Antes, `actualizarTipoCambio` (el botón que recalcula todos los productos USD de un proveedor de una sola vez) aplicaba IVA y tipo de cambio pero **nunca leía `proveedores.descuento`** — el campo estaba guardado (32,5 en Vulcano) pero inerte, no participaba en ningún cálculo real.

- **Fix en `actualizarTipoCambio`**: ahora multiplica también por `(1-descuento/100)` del proveedor correspondiente. Si un proveedor USD tiene `descuento=0` (el default), el cambio es un no-op — no afecta a otros proveedores en USD que no tengan descuento cargado.
- **⚠️ Esto cambia precios reales la próxima vez que se actualice el TC de Vulcano** — antes del fix, esos ~700 productos SIEMPRE se recalculaban sin descontar el 32,5%. Si el `costo_usd` que ya está cargado en cada producto es el precio de lista BRUTO de Vulcano (sin descuento), este fix corrige un sobreprecio real que venía arrastrándose. Si en cambio alguien ya había cargado `costo_usd` con el descuento pre-aplicado a mano (para compensar que el sistema no lo aplicaba solo), aplicar el descuento de nuevo ahora sería un doble descuento. **Esto se le preguntó explícitamente a Pablo al hacer el fix — confirmar que no quedó sin resolver antes de asumir cuál de los dos casos es.**
- **El formulario de "Nuevo/Editar producto" NO tenía forma de cargar `costo_usd` ni `marca`** — dos gaps reales encontrados por Pablo, arreglados el mismo día:
  - **`marca`**: existía la columna, se usaba para mostrar/filtrar/buscar en todos lados (tabla de Productos, PDFs de lista de precios, buscador de Nueva Venta), pero jamás se pudo cargar desde el formulario — quedó afuera por un descuido cuando se agregó la columna. Ahora es un campo de texto libre (no hay tabla de marcas, es ad-hoc) al lado de Proveedor.
  - **`costo_usd`**: el campo "Costo" del formulario cambiaba de label a "Costo (USD)" al elegir moneda USD, pero **seguía guardando el número tipeado directo en `costo` (ARS)** — nunca escribía `costo_usd`. Ahora, con moneda USD, el formulario muestra "Costo (USD)" (guarda en `costo_usd`) + un preview de solo lectura con el costo en ARS ya resuelto (mismo cálculo que `actualizarTipoCambio`, para que cargar un producto nuevo y después actualizar el TC den siempre el mismo número). `ModuloProductos` ahora recibe `tipoCambio` como prop (antes no lo necesitaba).
  - Con moneda ARS, el formulario queda exactamente como estaba antes (campo "Descuento proveedor (%)" por producto, `descuento_proveedor`, sigue existiendo y sin tocar — es un mecanismo distinto y separado del descuento por proveedor en USD; ver más abajo).
- **Dos campos de "descuento" distintos, a propósito, no unificados**: `productos.descuento_proveedor` (por producto, se carga a mano en el formulario ARS, solo alimenta un preview informativo — no se usa en ningún cálculo automático) vs `proveedores.descuento` (por proveedor, alimenta automáticamente el recálculo de productos USD). Si se quiere que el descuento por producto también afecte algo, es un cambio aparte — hoy no lo hace.
- **Segunda vuelta (mismo día)**: la moneda de carga del costo (ARS/USD) y el IVA por defecto ahora se derivan automáticamente del proveedor elegido en el formulario (`proveedores.moneda`, `proveedores.factura`) — ya no es un selector manual. Y el preview de "Costo en ARS" usa el **tipo de cambio propio del proveedor seleccionado** (`proveedores.tipo_cambio_usd`, persistido), no el estado `tipoCambio` global en memoria del componente `useData` — ese estado se resetea a 1200 en cada carga de página (nunca se rehidrata desde la base) y solo se actualiza corriendo "Actualizar tipo de cambio" en la sesión actual, así que quedó desacoplado del form de producto para evitar previews con TC desactualizado/falso. El prop `tipoCambio` se sacó de `ModuloProductos` por quedar sin uso.
  - **`productos.moneda` se guarda siempre como `"ARS"`**, sin importar en qué moneda se cargó el costo — es la moneda en la que se MUESTRA el producto en ventas/listas/stock (así lo pidió Pablo explícitamente: todo en pesos), un campo completamente distinto de "en qué moneda tipeé el costo". Confirmado que el 100% de los productos existentes (827 en Pilar, 826 en Caamaño) ya tenían `moneda='ARS'`, incluso los que ya usaban `costo_usd` — `moneda='USD'` no se usa en ningún lado del sistema hoy.
  - Bug encontrado de paso: el botón "Guardar producto" quedaba permanentemente deshabilitado al cargar en USD, porque el chequeo de habilitación miraba el campo crudo `fCosto` (ARS, vacío en modo USD) en vez del `costo` ya calculado. Arreglado.
- **Carga masiva única de la lista de precios de Vulcano (2026-08-26)**: Pablo pasó el xlsx `Lista de Precios Vulcano - Vigente desde 24 de Agosto de 2026`, aclarando explícitamente que son costos BRUTOS (sin descuento). Se matcheó por `codigo` contra los productos con `proveedor='Vulcano'` en ambas bases:
  - **168 de 183 en Pilar y 168 de 182 en Caamaño matchearon directo** contra el xlsx — se les seteó `costo_usd` con el valor bruto de la lista y se recalculó `costo`/`precio_min`/`precio_esp`/`precio_may` con la misma fórmula de `actualizarTipoCambio` (TC $1520, descuento 32,5%, IVA propio de cada producto). De estos, 78 (Pilar) no tenían `costo_usd` cargado antes (quedó seteado por primera vez); 90 ya lo tenían, con cambio promedio +5,2% en el costo ARS resultante (rango real -13% a +80% según producto).
  - **Los 15 (Pilar) / 14 (Caamaño) que NO matchearon** — variantes con sufijo de letra en el código que no aparecen así en la lista plana de Vulcano, ej. `23900B/C/D`, `23943A/B`, `13591B/C` — Pablo pidió explícitamente derivarles el costo bruto en USD de forma inversa a partir del costo (ARS) que ya tenían cargado en sistema: `costo_usd = costo_actual / ((1+iva_pct/100) × TC × (1-descuento/100))`. Al recalcular `costo` hacia adelante con ese `costo_usd` derivado da exactamente el mismo costo que ya tenían (por construcción) — no hubo ningún cambio de precio en estos 15/14, solo se les completó el `costo_usd` que faltaba, igual que al resto.
  - Con esto, el 100% de los productos Vulcano (183 en Pilar, 182 en Caamaño) quedaron con `costo_usd` cargado.
  - Al revisar los no matcheados salieron dos inconsistencias de datos, ninguna causada por esta carga: "Tapa intermedia p/skimmer" (237006) existe en Pilar pero no tiene equivalente en Caamaño (se dejó así, a pedido de Pablo). Y el "Hidrojet con aro vista blanco..." tenía **código distinto entre bases** (101100 en Pilar, 101101 en Caamaño, mismo producto) — Pablo confirmó que el correcto es el de Pilar, así que se corrigió el `codigo` en Caamaño (id 815) de 101101 a 101100.
  - **Bug real encontrado después**: Pablo señaló que varios de esos 15/14 códigos SÍ estaban en el excel, y tenía razón — el archivo mezcla dos layouts de columnas en la misma hoja. La mayoría del catálogo tiene código en columna A y precio en columna D, pero la sección de "repuestos" (donde caían justo estos productos) tiene código en **columna B** y precio en **columna G**. El script de extracción asumía un layout fijo y además tenía un bug de regex que, ante una celda vacía autocerrada (`<c .../>`), arrastraba el valor de la celda siguiente hacia la columna equivocada — lo cual, por una cuestión de simetría en el archivo, terminó dando resultados correctos para los 168 productos "de lista" (el corrimiento era uniforme) pero rompía específicamente para estos 13-15 (row con estructura distinta). Se corrigió el parser y se confirmó que los 168 valores ya cargados no cambian (0 diferencias). De los 15 originales, 13 SÍ estaban en la lista con precio real (Pablo los recargó él mismo manualmente en el sistema una vez que se lo señalé); "Tapa intermedia p/skimmer" (237006) y el Hidrojet (101100) siguen sin aparecer en el excel — quedaron con el costo derivado a la inversa, como ya se documentó arriba.
- **Ganancia mayorista uniforme (2026-08-26)**: Pablo pidió fijar `ganancia_may=26%` para TODOS los productos de Vulcano (antes variaba producto a producto, promedio ~25,3%). Se corrió `UPDATE productos SET ganancia_may=26, precio_may=round(costo*1.26) WHERE proveedor='Vulcano'` contra Pilar (183 productos) y Caamaño (182 productos). No tocó `ganancia_min`/`precio_min`/`precio_esp`, solo el circuito mayorista. Reversa (valores previos de `ganancia_may`/`precio_may` por id) guardada en el scratchpad de la sesión, no en el repo.

## Proveedor Aguas — costo_usd derivado a la inversa (2026-08-26)

Mismo patrón que el caso de los 15/14 productos de Vulcano sin match en la lista: acá no había ninguna lista de precios de referencia, Pablo pidió directamente back-calcular el costo bruto en dólares de **todos** los productos de `proveedor='Aguas'` a partir del costo (ARS) que ya tenían cargado, usando la config de la ficha del proveedor (`proveedores` id 9 en Pilar / id 3 en Caamaño: moneda USD, descuento 47,25%, TC $1500 — tomado de Pilar, Caamaño no tiene `tipo_cambio_usd` propio, ver nota de schema drift más abajo).

- Fórmula inversa: `costo_usd = costo_actual / ((1+iva_pct/100) × TC(1500) × (1-0.4725))`, luego se recalculó `costo`/`precio_min`/`precio_esp`/`precio_may` hacia adelante con la fórmula normal — por construcción da el mismo `costo` que ya tenían (round-trip verificado: 0 productos con cambio de costo). Solo se completó/corrigió `costo_usd`, ningún precio cambió.
- Aplicado a **40 de 40 productos** en Pilar y **40 de 40 en Caamaño**.
- Varios productos ya tenían un `costo_usd` viejo cargado (ej. Alguicida Nataclor 10L: 25,93) que resultó ser de una época anterior a que se empezara a aplicar el descuento del proveedor en el cálculo (`actualizarTipoCambio` sin descuento, ver sección de Vulcano más arriba) — quedó sobreescrito por el valor consistente con la fórmula actual (ej. ese mismo producto pasó a 49,15).
- Corrido directo por psql, mismo criterio que Vulcano (no es cambio de esquema, no queda en `sql/`); reversa fila por fila en el scratchpad de la sesión.

## Proveedor Makinthal — costo_usd desde PDF (2026-08-26)

Pablo pasó un PDF (`LP_MQ_120826_MAK6150.pdf`, lista vigente de Makinthal Química) con precios en dólares brutos (el pie del PDF aclara "se debe sumar Ingresos Brutos e I.V.A a los precios publicados"). No había poppler/pdftotext ni Python instalados en esta máquina, así que se instaló `pdf-parse` (npm, en el scratchpad de la sesión, no quedó como dependencia del proyecto) para extraer el texto — 17 páginas, 326 productos con formato `codigo descripcion precio`.

- Se matcheó por `codigo` contra los 29 productos `proveedor ilike '%makin%'` en Pilar y Caamaño: **28 de 29 matchearon** directo. El que no — `MAK49-BT001L-01` "MAK R - Botella de 1 litro" — no está en este PDF (posible descontinuado); a pedido de Pablo se le derivó el costo bruto a la inversa desde el costo (ARS) que ya tenía, mismo patrón que los casos de Vulcano/Aguas.
- Fórmula: `costo = round(costo_usd × (1+iva_pct/100) × TC(1510))` — **sin descuento**: `proveedores.descuento` de Makinthal está en 0% y Pablo confirmó que es correcto, Makinthal no da descuento (a diferencia de Vulcano/Aguas).
- Cambio de costo promedio en los 28 "de lista": **+13,5%**, con dispersión real (-16,4% a +60,8% según producto) — se avisó a Pablo antes de aplicar por la magnitud del cambio, confirmó proceder.
- Aplicado a 29/29 en Pilar y 29/29 en Caamaño. Corrido directo por psql, mismo criterio que los casos anteriores (no es cambio de esquema); reversa fila por fila en el scratchpad de la sesión.

## Billetera Dólares en Cierre de Caja (2026-08-27)

Pablo quiere empezar a ahorrar en dólares. Se agregó un 5to "bolsillo" al Cierre de Caja, junto a Caja Chica/MP/Banco/Ahorro (`BOLSILLOS` en [App.jsx](src/App.jsx), cerca de `ModuloCaja`).

- **`dolares` es un bolsillo llevado en USD, no en pesos** — a propósito no se mezcla con el total general en pesos (`esperadoTotal`/`realTotal`), porque el valor en pesos de esos dólares cambia todos los días solo por el tipo de cambio, sin que haya pasado nada real en la caja. Se reconcilia aparte (arranque + movimientos en USD = esperado, Pablo cuenta los billetes físicos y compara), con su propia card en "Diferencias" y su propia columna en el historial de cierres — pero fuera de la "Diferencia total".
- **La compra/venta de dólares se hace con el mismo mecanismo de "Registrar movimiento entre bolsillos" que ya existía** (tabla `movimientos_caja`), extendido para poder cruzar de moneda:
  - `monto`: lo que SALE del bolsillo origen, en la moneda del origen (pesos, o USD si el origen es Dólares).
  - `monto_destino`: lo que ENTRA al bolsillo destino, en la moneda del destino. Si el movimiento no cruza moneda (ej. Caja Chica → Banco), es igual a `monto` — por eso en todos los cálculos hay un fallback `m.monto_destino ?? m.monto` para no romper los movimientos viejos (que no tienen esta columna cargada).
  - `tipo_cambio`: solo se carga cuando el movimiento cruza pesos↔dólares — Pablo lo tipea a mano en el modal (no hay cotización automática acá, a diferencia de Makinthal/BNA). Sirve de referencia/auditoría, no participa en ningún otro cálculo.
  - **Comprar dólares**: origen = billetera en pesos, destino = "Dólares". `monto_destino = round(monto/TC, 2 decimales)`.
  - **Vender dólares** (dejado armado a pedido de Pablo, aunque hoy no se usa activamente): origen = "Dólares", destino = billetera en pesos. `monto_destino = round(monto*TC)`.
  - El modal "Registrar movimiento" muestra el campo de TC y un preview en vivo del monto resultante solo cuando el origen o el destino es Dólares (`movCruzaMoneda` = exactamente uno de los dos lados es `"dolares"`).
- El Libro de movimientos y el detalle de cada cierre muestran ambos lados del movimiento cuando cruza moneda (`fmtMovimiento`, ej. `"$50.000 → U$D 32,89 (TC 1.520)"`), en vez de un solo monto como antes.
- **No hay edición/eliminación de movimientos** (ni para este caso ni para los movimientos comunes preexistentes) — si hace falta corregir uno cargado mal, es una mejora aparte, no incluida acá. Por ahora, corregirlo a mano con un segundo movimiento inverso o directamente en la base.
- `sql/2026-08-27-billetera-dolares.sql`: `caja_config.saldo_dolares`, `cierres_caja.saldo_dolares`, `movimientos_caja.monto_destino`/`tipo_cambio` — ver `sql/CHANGELOG.md`.

## Auto-actualización diaria del TC de Makinthal (dólar BNA) (2026-08-26)

El mail donde Makinthal manda su lista aclara que hay que usar "el tipo de cambio BNA Billete vendedor". A pedido de Pablo, el sistema ahora **actualiza solo** el tipo de cambio y los precios de los productos de Makinthal, sin que haga falta tocar nada manualmente:

- Función `autoActualizarMakinthalBNA()` en `useData` (cerca de `actualizarDesdeCSV`), llamada desde el `useEffect` de montaje de la app **justo después de `cargar()`, solo si `localKey==="pilar"`** (ahí se gestionan los costos, se replican solos a Caamaño) — y de nuevo en cada ciclo del auto-refresh de 30 min.
- Fuente: `https://dolarapi.com/v1/ambito/dolares/bna` (misma API que ya usa "Cotizaciones del día" en Actualizar Precios) — devuelve `{compra, venta}` de Banco Nación; se usa `venta` (billete vendedor), verificado que hoy da $1535 y coincide con lo que muestra la home de BNA.
- Si la cotización obtenida es igual a la ya guardada en `proveedores.tipo_cambio_usd` de Makinthal, **no escribe nada** (evita updates innecesarios en cada auto-refresh).
- Si cambió: recalcula `costo`/`precio_min`/`precio_esp`/`precio_may` de todos los productos Makinthal con `costo_usd>0`, con la misma fórmula que `actualizarTipoCambio` (incluye el `descuento` del proveedor si algún día se carga uno — hoy Makinthal tiene 0%), replica `costo` a Caamaño por código, y guarda el nuevo TC en la ficha del proveedor.
- **Sin aviso si sale bien** (a pedido explícito de Pablo — "prefiero que no me avise salvo que la api falle"). Si el fetch falla o la cotización viene inválida (`NaN`, `<=0`), **no toca ningún precio** — deja todo como estaba — y ahí sí muestra un `toast.err`.
- Implementación deliberadamente **independiente de `actualizarTipoCambio`** (la función que usa el botón manual): correr justo después de `cargar()` en el mismo efecto de montaje cae en una closure vieja de `proveedores`/`productos` (el estado de React todavía no se actualizó con lo recién cargado) — por eso esta función consulta Supabase directo en vez de depender de ese estado. El botón manual de "Actualizar tipo de cambio" sigue funcionando exactamente igual que antes, sin tocar.
- Solo aplica a Makinthal — Vulcano/Aguas siguen actualizándose a mano con el botón de siempre.

## Subir lista del proveedor (CSV) — deshabilitada (2026-08-26)

El modo "Subir lista del proveedor" de `ModuloActualizarPrecios` (tab `modo==="csv"`, funciones `procesarCSV`/`actualizarDesdeCSV`) quedó **inaccesible desde la UI a pedido de Pablo** — se sacó el botón de la barra de tabs, el resto del código sigue intacto por si se retoma más adelante. Motivo: es un parser muy básico e insuficiente para listas reales de proveedores:
- Solo lee texto plano (CSV/TXT), no `.xlsx` real.
- Adivina qué columna es código/nombre/costo buscando palabras clave ("cod", "prod"/"nom"/"desc", "cost"/"precio"/"unit") en la primera fila — no tiene forma de manejar un archivo con múltiples layouts de columnas en la misma hoja, como el de Vulcano (ver bug documentado arriba).
- Aplica `costo = precio_del_archivo × (1-descuento)` directo, sin sumar IVA ni aplicar tipo de cambio — no sirve para una lista en dólares brutos como la de Vulcano/Aguas, solo para una lista ya en pesos.

Si en el futuro se retoma, habría que al menos: parsear `.xlsx` nativamente, soportar el circuito USD/IVA/TC igual que el formulario de producto, y mostrar un preview claro de qué va a cambiar antes de aplicar.

## Editar/eliminar Traspasos (2026-08-11)

Problema que resuelve: no había forma de corregir un traspaso Pilar→Caamaño mal cargado (ej. cantidad equivocada) — solo se podía crear y registrar pagos, nunca editar ni eliminar. Pablo lo pidió porque pasa seguido.

- **Solo se puede editar/eliminar mientras `monto_pagado===0`** (sin ningún pago registrado todavía) — a propósito. Ajustar total/saldo/stock de forma consistente en las dos bases con pagos de por medio es mucho más complejo (habría que tocar `pagos_traspaso`, el egreso que se creó en Caamaño al pagar, etc.); el caso real que pidió Pablo es "me equivoqué en la cantidad", que casi siempre se nota antes de que Caamaño pague. Si hace falta corregir un traspaso YA pagado, la única vía es a mano (contactar para un fix puntual), no hay botón para eso.
- **Bug de fondo resuelto de paso**: hasta ahora no existía NINGÚN id compartido entre la fila de un traspaso en Pilar y su espejo en Caamaño — todo (pagos, y ahora editar/eliminar) tenía que matchear por `fecha`, lo cual fallaba en silencio con dos traspasos el mismo día (bug ya documentado desde el 2026-08-10 en la sección de "Reembolsos pendientes"/Caamaño). Se agregó `traspasos.pilar_id` (en la copia de Caamaño, apunta al id real en Pilar) y se hizo un **backfill manual** de los 26 traspasos ya existentes (matcheo por fecha+total, los 26 matchearon únicos sin ambigüedad — ver `sql/CHANGELOG.md`). `registrarPagoTraspaso` ahora matchea por `pilar_id` primero, con fallback a fecha solo por si algún traspaso quedara sin backfillar en el futuro.
- **`abastecimiento.traspaso_id`** (nuevo, FK a `traspasos`, nullable): liga cada fila de abastecimiento que genera un traspaso (la salida en Pilar, la entrada en Caamaño) con el traspaso que la creó. Se usa para poder revertir esas filas al **eliminar** un traspaso (`delete().eq("traspaso_id",...)`). Al **editar**, en cambio, NO se borran/reescriben esas filas viejas — se insertan filas de **ajuste por la diferencia** (`Ajuste traspaso a Caamaño`/`Ajuste traspaso desde Pilar`, cantidad = delta), mismo criterio que el resto del sistema de "nunca reescribir silenciosamente un movimiento histórico, sumar una corrección aparte" (mismo espíritu que `descuentos_egreso`, que tampoco toca `egresos.monto` original).
- **`editarTraspaso`** calcula el delta neto por producto (cantidad nueva − cantidad vieja) para no aplicar dos updates de stock separados sobre el mismo producto si solo cambió su cantidad. El stock de Pilar se mueve en dirección opuesta al delta (mandar más resta más), el de Caamaño en la misma dirección del delta (recibe lo que Pilar manda).
- **UI**: botones ✏️/✕ en la fila del historial y en el modal de detalle (`ModuloTraspasos`), visibles solo si `localKey==="pilar"` y no tiene pagos — con un aviso explicando por qué están ocultos si ya tiene un pago. El modal "Nuevo Traspaso" se reusa también para editar (mismo formulario, cambia el título y el label del botón) — al abrir en modo edición, el "stock disponible" de cada ítem se calcula sumando de vuelta la cantidad que ese mismo traspaso ya le había restado a Pilar, para que el máximo del input no quede corto.

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
