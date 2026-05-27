import { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  LOCALES_PORTAL, PORTAL_CONFIG, esLocalidadValida,
  generarCodigo, fmtMoneda, detectarLocalDeURL
} from "./portalConfig.js";

// ============================================================
// 🎨 DESIGN TOKENS — Tema claro, mobile-first
// ============================================================
const C = {
  primario: "#00A876",
  primarioOscuro: "#008961",
  primarioClaro: "#00A87618",
  fondo: "#F5F7FA",
  blanco: "#FFFFFF",
  texto: "#1A1F2E",
  textoSec: "#5C6478",
  textoTerc: "#8B92A6",
  borde: "#E1E5EC",
  bordeFuerte: "#CDD3E0",
  rojo: "#D93050",
  amarillo: "#F59E0B",
  azul: "#2B7FD4",
  exito: "#00A876",
  sombra: "0 2px 8px rgba(0,0,0,0.06)",
  sombraFuerte: "0 4px 16px rgba(0,0,0,0.1)",
};

const fontStack = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// ============================================================
// COMPONENTE RAÍZ
// ============================================================
export default function PortalPedidos() {
  const localKey = detectarLocalDeURL();
  const config   = LOCALES_PORTAL[localKey];
  const supabase = useMemo(() => createClient(config.url, config.anon), [localKey]);

  // ── Estado global del portal ──────────────────────────────
  const [paso, setPaso]       = useState("bienvenida"); // bienvenida | catalogo | carrito | entrega | confirmacion | enviado | error
  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [errorCarga, setErrorCarga] = useState("");
  const [carrito, setCarrito] = useState([]); // [{producto_id, nombre, precio, cantidad, mostrar_siempre}]
  const [categoriaSel, setCategoriaSel] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState(null); // "retiro" | "envio"
  const [datosEnvio, setDatosEnvio] = useState({ direccion: "", localidad: "", telefono: "", referencia: "" });
  const [notasCliente, setNotasCliente] = useState("");
  const [honeypot, setHoneypot] = useState(""); // anti-bot
  const [enviando, setEnviando] = useState(false);
  const [pedidoConfirmado, setPedidoConfirmado] = useState(null); // { numero, codigo }

  // ── Cargar productos al iniciar ──────────────────────────
  useEffect(() => {
    let cancel = false;
    async function cargar() {
      setCargando(true);
      const { data, error } = await supabase
        .from("productos")
        .select("id, codigo, nombre, categoria, precio_min, stock, activo, mostrar_siempre_en_catalogo")
        .eq("activo", true)
        .order("categoria")
        .order("nombre");
      if (cancel) return;
      if (error) {
        setErrorCarga("No pudimos cargar el catálogo. Probá de nuevo en un rato.");
      } else {
        // Filtrar: solo productos con stock>0 OR marcados como mostrar siempre
        const visibles = (data || []).filter(p => p.stock > 0 || p.mostrar_siempre_en_catalogo);
        setProductos(visibles);
      }
      setCargando(false);
    }
    cargar();
    return () => { cancel = true; };
  }, [supabase]);

  // ── Cálculos derivados ───────────────────────────────────
  const categorias = useMemo(() => {
    const cats = new Set();
    productos.forEach(p => { if (p.categoria) cats.add(p.categoria); });
    return Array.from(cats).sort();
  }, [productos]);

  const productosCategoria = useMemo(() => {
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      return productos.filter(p =>
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.codigo || "").toLowerCase().includes(q) ||
        (p.categoria || "").toLowerCase().includes(q)
      );
    }
    if (!categoriaSel) return [];
    return productos.filter(p => p.categoria === categoriaSel);
  }, [productos, categoriaSel, busqueda]);

  const totalCarrito = useMemo(() =>
    carrito.reduce((s, i) => s + i.precio * i.cantidad, 0)
  , [carrito]);

  const cantTotalCarrito = useMemo(() =>
    carrito.reduce((s, i) => s + i.cantidad, 0)
  , [carrito]);

  // ── Acciones del carrito ─────────────────────────────────
  function agregarAlCarrito(producto) {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.producto_id === producto.id);
      if (idx >= 0) {
        const copia = [...prev];
        copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad + 1 };
        return copia;
      }
      return [...prev, {
        producto_id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        precio: producto.precio_min,
        cantidad: 1,
        mostrar_siempre: !!producto.mostrar_siempre_en_catalogo,
      }];
    });
  }
  function quitarDelCarrito(productoId) {
    setCarrito(prev => {
      const idx = prev.findIndex(i => i.producto_id === productoId);
      if (idx < 0) return prev;
      const copia = [...prev];
      if (copia[idx].cantidad <= 1) copia.splice(idx, 1);
      else copia[idx] = { ...copia[idx], cantidad: copia[idx].cantidad - 1 };
      return copia;
    });
  }
  function eliminarDelCarrito(productoId) {
    setCarrito(prev => prev.filter(i => i.producto_id !== productoId));
  }
  function getCantidadEnCarrito(productoId) {
    return carrito.find(i => i.producto_id === productoId)?.cantidad || 0;
  }

  // ── Validación final y envío ─────────────────────────────
  async function enviarPedido() {
    // Anti-bot: si el honeypot está lleno, descartar silenciosamente
    if (honeypot.trim()) {
      setPedidoConfirmado({ numero: "0000", codigo: "0000" });
      setPaso("enviado");
      return;
    }

    setEnviando(true);
    const codigo = generarCodigo();
    const payload = {
      codigo_verificacion: codigo,
      cliente_nombre: cliente.nombre.trim(),
      cliente_telefono: cliente.telefono.trim(),
      items: carrito,
      total: totalCarrito,
      tipo_entrega: tipoEntrega,
      direccion_envio: tipoEntrega === "envio"
        ? `${datosEnvio.direccion.trim()}, ${datosEnvio.localidad.trim()}${datosEnvio.referencia.trim() ? ` (${datosEnvio.referencia.trim()})` : ""}`
        : null,
      telefono_contacto: tipoEntrega === "envio" ? datosEnvio.telefono.trim() : null,
      notas: notasCliente.trim() || null,
      estado: "pendiente",
    };

    const { data, error } = await supabase
      .from("pedidos_web_pendientes")
      .insert(payload)
      .select()
      .single();

    setEnviando(false);
    if (error) {
      setPaso("error");
      return;
    }
    setPedidoConfirmado({ numero: data.id, codigo });
    setPaso("enviado");
  }

  function abrirWhatsApp() {
    if (!pedidoConfirmado) return;
    const tipoTxt = tipoEntrega === "envio" ? "Envío" : "Retiro en local";
    const msg = `Hola! Confirmo pedido #${pedidoConfirmado.numero}%0A`
              + `Código: ${pedidoConfirmado.codigo}%0A`
              + `Cliente: ${cliente.nombre}%0A`
              + `${tipoTxt} · Total: ${fmtMoneda(totalCarrito)}`;
    window.open(`https://wa.me/${config.whatsapp}?text=${msg}`, "_blank");
  }

  function reiniciar() {
    setCarrito([]);
    setCategoriaSel(null);
    setBusqueda("");
    setTipoEntrega(null);
    setDatosEnvio({ direccion: "", localidad: "", telefono: "", referencia: "" });
    setNotasCliente("");
    setPedidoConfirmado(null);
    setPaso("catalogo");
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.fondo, fontFamily: fontStack, color: C.texto }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button { font-family: inherit; }
        input, textarea { font-family: inherit; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .pt-fade { animation: fadeIn .25s ease; }
        .pt-card { background: ${C.blanco}; border-radius: 14px; box-shadow: ${C.sombra}; }
        .pt-btn-primario {
          background: ${C.primario}; color: white; border: none; border-radius: 12px;
          padding: 14px 20px; font-size: 16px; font-weight: 600; cursor: pointer;
          transition: background .15s; width: 100%;
        }
        .pt-btn-primario:hover { background: ${C.primarioOscuro}; }
        .pt-btn-primario:disabled { background: ${C.bordeFuerte}; cursor: not-allowed; }
        .pt-btn-sec {
          background: ${C.blanco}; color: ${C.texto}; border: 1.5px solid ${C.borde}; border-radius: 12px;
          padding: 12px 18px; font-size: 14px; font-weight: 500; cursor: pointer;
          transition: all .15s;
        }
        .pt-btn-sec:hover { border-color: ${C.primario}; color: ${C.primario}; }
        .pt-input {
          width: 100%; padding: 13px 14px; border: 1.5px solid ${C.borde}; border-radius: 10px;
          font-size: 15px; color: ${C.texto}; background: ${C.blanco}; outline: none;
          transition: border-color .15s;
        }
        .pt-input:focus { border-color: ${C.primario}; }
      `}</style>

      <Header config={config} paso={paso} onVolver={() => {
        if (paso === "catalogo")     setPaso("bienvenida");
        if (paso === "carrito")      setPaso("catalogo");
        if (paso === "entrega")      setPaso("carrito");
        if (paso === "confirmacion") setPaso("entrega");
      }} categoriaSel={categoriaSel} setCategoriaSel={setCategoriaSel} busqueda={busqueda} setBusqueda={setBusqueda} />

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px", paddingBottom: paso === "catalogo" && carrito.length > 0 ? 110 : 24 }}>
        {paso === "bienvenida" && (
          <PasoBienvenida cliente={cliente} setCliente={setCliente} config={config} onContinuar={() => setPaso("catalogo")} />
        )}
        {paso === "catalogo" && (
          <PasoCatalogo
            cargando={cargando} errorCarga={errorCarga}
            categorias={categorias} categoriaSel={categoriaSel} setCategoriaSel={setCategoriaSel}
            productos={productosCategoria} busqueda={busqueda} setBusqueda={setBusqueda}
            agregar={agregarAlCarrito} quitar={quitarDelCarrito}
            getCantidad={getCantidadEnCarrito}
          />
        )}
        {paso === "carrito" && (
          <PasoCarrito
            carrito={carrito} total={totalCarrito}
            quitar={quitarDelCarrito} agregar={(prod) => agregarAlCarrito({ id: prod.producto_id, codigo: prod.codigo, nombre: prod.nombre, precio_min: prod.precio, mostrar_siempre_en_catalogo: prod.mostrar_siempre })}
            eliminar={eliminarDelCarrito}
            notas={notasCliente} setNotas={setNotasCliente}
            onSeguir={() => setPaso("catalogo")}
            onContinuar={() => setPaso("entrega")}
          />
        )}
        {paso === "entrega" && (
          <PasoEntrega
            total={totalCarrito}
            tipoEntrega={tipoEntrega} setTipoEntrega={setTipoEntrega}
            datosEnvio={datosEnvio} setDatosEnvio={setDatosEnvio}
            onContinuar={() => setPaso("confirmacion")}
          />
        )}
        {paso === "confirmacion" && (
          <PasoConfirmacion
            cliente={cliente} carrito={carrito} total={totalCarrito}
            tipoEntrega={tipoEntrega} datosEnvio={datosEnvio} notas={notasCliente}
            honeypot={honeypot} setHoneypot={setHoneypot}
            enviando={enviando} onEnviar={enviarPedido}
          />
        )}
        {paso === "enviado" && (
          <PasoEnviado pedido={pedidoConfirmado} config={config} onWhatsApp={abrirWhatsApp} onNuevoPedido={reiniciar} />
        )}
        {paso === "error" && (
          <PasoError onReintentar={() => setPaso("confirmacion")} />
        )}
      </div>

      {/* Carrito flotante en catálogo */}
      {paso === "catalogo" && carrito.length > 0 && (
        <CarritoFlotante cantidad={cantTotalCarrito} total={totalCarrito} onClick={() => setPaso("carrito")} />
      )}
    </div>
  );
}

// ============================================================
// HEADER
// ============================================================
function Header({ config, paso, onVolver, categoriaSel, setCategoriaSel, busqueda, setBusqueda }) {
  const puedeVolver = ["catalogo", "carrito", "entrega", "confirmacion"].includes(paso);
  return (
    <div style={{ background: C.blanco, borderBottom: `1px solid ${C.borde}`, position: "sticky", top: 0, zIndex: 50 }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {puedeVolver ? (
          <button onClick={() => {
            // Si está en catálogo y hay categoría seleccionada/búsqueda, primero "limpiar" antes de volver al paso anterior
            if (paso === "catalogo" && (categoriaSel || busqueda)) {
              setCategoriaSel(null); setBusqueda("");
              return;
            }
            onVolver();
          }} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: C.texto, padding: 4, lineHeight: 1 }}>←</button>
        ) : (
          <div style={{ width: 28, height: 28, background: C.primario, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "white", fontSize: 14 }}>P</div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{config.nombre}</div>
          <div style={{ fontSize: 11, color: C.textoSec }}>Pedidos online</div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PASO: BIENVENIDA
// ============================================================
function PasoBienvenida({ cliente, setCliente, config, onContinuar }) {
  const valido = cliente.nombre.trim().length >= 2 && cliente.telefono.trim().length >= 6;
  return (
    <div className="pt-fade" style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 30 }}>
      <div style={{ textAlign: "center", padding: "20px 0" }}>
        <div style={{ width: 70, height: 70, background: C.primario, borderRadius: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "white", fontSize: 30, marginBottom: 14 }}>P</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>¡Hola!</h1>
        <p style={{ fontSize: 15, color: C.textoSec }}>Armá tu pedido en {config.nombre}</p>
      </div>
      <div className="pt-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Tu nombre</label>
          <input className="pt-input" value={cliente.nombre} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value }))} placeholder="Ej: Juan Pérez" />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Teléfono / celular</label>
          <input className="pt-input" type="tel" inputMode="tel" value={cliente.telefono} onChange={e => setCliente(c => ({ ...c, telefono: e.target.value }))} placeholder="Ej: 11 1234-5678" />
        </div>
      </div>
      <button className="pt-btn-primario" disabled={!valido} onClick={onContinuar}>
        Ver catálogo →
      </button>
      <div style={{ fontSize: 11, color: C.textoTerc, textAlign: "center", marginTop: 6 }}>
        Pedido mínimo: {fmtMoneda(PORTAL_CONFIG.MIN_PEDIDO)} · Envío desde {fmtMoneda(PORTAL_CONFIG.MIN_ENVIO)}
      </div>
    </div>
  );
}

// ============================================================
// PASO: CATÁLOGO
// ============================================================
function PasoCatalogo({ cargando, errorCarga, categorias, categoriaSel, setCategoriaSel, productos, busqueda, agregar, quitar, getCantidad, setBusqueda }) {
  if (cargando) return <div style={{ textAlign: "center", padding: 60, color: C.textoSec }}>Cargando catálogo...</div>;
  if (errorCarga) return <div className="pt-card" style={{ padding: 20, color: C.rojo, textAlign: "center" }}>{errorCarga}</div>;

  return (
    <div className="pt-fade" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BuscadorBar busqueda={busqueda} setBusqueda={setBusqueda} categoriaSel={categoriaSel} setCategoriaSel={setCategoriaSel} />

      {!categoriaSel && !busqueda && (
        <GrillaCategorias categorias={categorias} onSelect={setCategoriaSel} />
      )}

      {(categoriaSel || busqueda) && (
        <>
          <div style={{ fontSize: 13, color: C.textoSec, padding: "0 4px" }}>
            {productos.length === 0 ? "Sin resultados" : `${productos.length} producto${productos.length !== 1 ? "s" : ""}`}
            {categoriaSel && !busqueda && <> en <strong style={{ color: C.texto }}>{categoriaSel}</strong></>}
            {busqueda && <> para "<strong style={{ color: C.texto }}>{busqueda}</strong>"</>}
          </div>
          {productos.map(p => (
            <ProductoCard key={p.id} producto={p} cantidad={getCantidad(p.id)} onAgregar={() => agregar(p)} onQuitar={() => quitar(p.id)} />
          ))}
        </>
      )}
    </div>
  );
}

function BuscadorBar({ busqueda, setBusqueda, categoriaSel, setCategoriaSel }) {
  return (
    <div className="pt-card" style={{ padding: 8, display: "flex", alignItems: "center", gap: 6, position: "sticky", top: 60, zIndex: 30, background: C.blanco }}>
      <span style={{ fontSize: 18, paddingLeft: 6 }}>🔍</span>
      <input
        style={{ flex: 1, border: "none", padding: "10px 4px", fontSize: 15, outline: "none", background: "transparent", color: C.texto }}
        placeholder="Buscar producto, código o categoría..."
        value={busqueda}
        onChange={e => {
          setBusqueda(e.target.value);
          if (e.target.value && categoriaSel) setCategoriaSel(null);
        }}
      />
      {(busqueda || categoriaSel) && (
        <button onClick={() => { setBusqueda(""); setCategoriaSel(null); }} style={{
          background: "none", border: "none", color: C.textoSec, cursor: "pointer", fontSize: 16, padding: 6
        }}>✕</button>
      )}
    </div>
  );
}

function GrillaCategorias({ categorias, onSelect }) {
  if (categorias.length === 0) {
    return <div className="pt-card" style={{ padding: 30, textAlign: "center", color: C.textoSec }}>No hay productos disponibles en este momento.</div>;
  }
  return (
    <>
      <div style={{ fontSize: 14, color: C.textoSec, padding: "4px 4px 0" }}>Elegí una categoría</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {categorias.map(cat => (
          <button key={cat} onClick={() => onSelect(cat)} className="pt-card" style={{
            border: "none", textAlign: "left", padding: "20px 16px", cursor: "pointer",
            fontWeight: 600, fontSize: 15, color: C.texto, transition: "transform .1s",
          }} onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
             onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
             onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>{iconoCategoria(cat)}</div>
            {cat}
          </button>
        ))}
      </div>
    </>
  );
}

function iconoCategoria(cat) {
  const c = cat.toLowerCase();
  if (c.includes("acce"))    return "🔧";
  if (c.includes("acido"))   return "⚗️";
  if (c.includes("aterm"))   return "❄️";
  if (c.includes("bomba"))   return "💧";
  if (c.includes("cloro"))   return "🧪";
  if (c.includes("envas"))   return "🧴";
  if (c.includes("filtro"))  return "🔍";
  if (c.includes("fumig"))   return "🐛";
  if (c.includes("gran"))    return "📦";
  if (c.includes("jardin"))  return "🌱";
  if (c.includes("limpi"))   return "🧼";
  if (c.includes("perf"))    return "🌸";
  if (c.includes("pint"))    return "🎨";
  if (c.includes("pvc"))     return "🔩";
  if (c.includes("quim"))    return "⚗️";
  if (c.includes("repu"))    return "⚙️";
  if (c.includes("reves"))   return "🧱";
  if (c.includes("sanit"))   return "🚿";
  return "🛒";
}

function ProductoCard({ producto, cantidad, onAgregar, onQuitar }) {
  const sinStock = producto.stock <= 0;
  const granel = producto.mostrar_siempre_en_catalogo;
  return (
    <div className="pt-card" style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3, marginBottom: 4 }}>{producto.nombre}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.primario }}>{fmtMoneda(producto.precio_min)}</div>
        {granel && sinStock && (
          <div style={{ fontSize: 11, color: C.amarillo, marginTop: 4 }}>📦 Disponibilidad a confirmar</div>
        )}
      </div>
      {cantidad === 0 ? (
        <button onClick={onAgregar} style={{
          background: C.primario, color: "white", border: "none", borderRadius: 10,
          padding: "10px 14px", fontWeight: 600, fontSize: 14, cursor: "pointer", whiteSpace: "nowrap"
        }}>+ Agregar</button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.primarioClaro, borderRadius: 10, padding: 4 }}>
          <button onClick={onQuitar} style={btnCantidad()}>−</button>
          <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700, color: C.primario }}>{cantidad}</span>
          <button onClick={onAgregar} style={btnCantidad()}>+</button>
        </div>
      )}
    </div>
  );
}
const btnCantidad = () => ({
  background: C.primario, color: "white", border: "none", borderRadius: 8,
  width: 30, height: 30, fontSize: 18, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1
});

// ============================================================
// CARRITO FLOTANTE
// ============================================================
function CarritoFlotante({ cantidad, total, onClick }) {
  return (
    <div style={{
      position: "fixed", bottom: 16, left: 0, right: 0, padding: "0 16px", zIndex: 40,
      pointerEvents: "none",
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", pointerEvents: "auto" }}>
        <button onClick={onClick} style={{
          width: "100%", background: C.primario, color: "white", border: "none", borderRadius: 14,
          padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          boxShadow: C.sombraFuerte, cursor: "pointer", animation: "slideUp .3s ease",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600, fontSize: 15 }}>
            <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 8, padding: "3px 9px", fontSize: 13, fontWeight: 700 }}>{cantidad}</span>
            Ver carrito
          </span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{fmtMoneda(total)} →</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================
// PASO: CARRITO
// ============================================================
function PasoCarrito({ carrito, total, quitar, agregar, eliminar, notas, setNotas, onSeguir, onContinuar }) {
  const cumpleMinimo = total >= PORTAL_CONFIG.MIN_PEDIDO;
  const faltante = PORTAL_CONFIG.MIN_PEDIDO - total;

  if (carrito.length === 0) {
    return (
      <div className="pt-fade" style={{ marginTop: 40, textAlign: "center", padding: 30 }}>
        <div style={{ fontSize: 60, marginBottom: 12 }}>🛒</div>
        <h2 style={{ marginBottom: 8 }}>Tu carrito está vacío</h2>
        <p style={{ color: C.textoSec, marginBottom: 20 }}>Agregá productos para continuar</p>
        <button className="pt-btn-primario" onClick={onSeguir}>Ver catálogo</button>
      </div>
    );
  }

  return (
    <div className="pt-fade" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, padding: "4px 4px 0" }}>Tu pedido</h2>
      <div className="pt-card" style={{ padding: 4 }}>
        {carrito.map((item, idx) => (
          <div key={item.producto_id} style={{
            display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
            borderBottom: idx < carrito.length - 1 ? `1px solid ${C.borde}` : "none",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{item.nombre}</div>
              <div style={{ fontSize: 12, color: C.textoSec, marginTop: 2 }}>{fmtMoneda(item.precio)} c/u</div>
              {item.mostrar_siempre && (
                <div style={{ fontSize: 11, color: C.amarillo, marginTop: 2 }}>📦 Disponibilidad a confirmar</div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => quitar(item.producto_id)} style={btnCantidad()}>−</button>
              <span style={{ minWidth: 24, textAlign: "center", fontWeight: 700 }}>{item.cantidad}</span>
              <button onClick={() => agregar(item)} style={btnCantidad()}>+</button>
            </div>
            <div style={{ minWidth: 80, textAlign: "right", fontWeight: 700, color: C.primario }}>
              {fmtMoneda(item.precio * item.cantidad)}
            </div>
          </div>
        ))}
      </div>

      <div className="pt-card" style={{ padding: 16 }}>
        <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 8 }}>
          Notas o aclaraciones (opcional)
        </label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Ej: traer cambio para 10000, etc."
          rows={2}
          style={{
            width: "100%", padding: 12, border: `1.5px solid ${C.borde}`, borderRadius: 10,
            fontSize: 14, color: C.texto, resize: "vertical", outline: "none",
          }}
        />
      </div>

      <div className="pt-card" style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 12, color: C.textoSec }}>Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.texto }}>{fmtMoneda(total)}</div>
        </div>
        {!cumpleMinimo && (
          <div style={{ textAlign: "right", fontSize: 12, color: C.amarillo, maxWidth: 180 }}>
            Pedido mínimo {fmtMoneda(PORTAL_CONFIG.MIN_PEDIDO)}<br />
            <strong>Te faltan {fmtMoneda(faltante)}</strong>
          </div>
        )}
      </div>

      <button className="pt-btn-sec" onClick={onSeguir}>← Seguir comprando</button>
      <button className="pt-btn-primario" disabled={!cumpleMinimo} onClick={onContinuar}>
        Continuar →
      </button>
    </div>
  );
}

// ============================================================
// PASO: ENTREGA
// ============================================================
function PasoEntrega({ total, tipoEntrega, setTipoEntrega, datosEnvio, setDatosEnvio, onContinuar }) {
  const envioHabilitado = total >= PORTAL_CONFIG.MIN_ENVIO;
  const faltanteEnvio = PORTAL_CONFIG.MIN_ENVIO - total;
  const localidadOK = !datosEnvio.localidad.trim() || esLocalidadValida(datosEnvio.localidad);
  const datosEnvioOK = datosEnvio.direccion.trim().length >= 4
                    && datosEnvio.localidad.trim().length >= 3
                    && datosEnvio.telefono.trim().length >= 6
                    && esLocalidadValida(datosEnvio.localidad);
  const puedeContinuar = tipoEntrega === "retiro" || (tipoEntrega === "envio" && datosEnvioOK);

  return (
    <div className="pt-fade" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, padding: "4px 4px 0" }}>¿Cómo lo querés recibir?</h2>

      <button onClick={() => setTipoEntrega("retiro")} className="pt-card" style={{
        border: tipoEntrega === "retiro" ? `2px solid ${C.primario}` : `2px solid ${C.borde}`,
        background: tipoEntrega === "retiro" ? C.primarioClaro : C.blanco,
        padding: 18, textAlign: "left", cursor: "pointer", display: "flex", gap: 14, alignItems: "center",
      }}>
        <div style={{ fontSize: 30 }}>🏪</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>Retiro en local</div>
          <div style={{ fontSize: 13, color: C.textoSec }}>Pasás a buscarlo cuando esté listo</div>
        </div>
        {tipoEntrega === "retiro" && <div style={{ color: C.primario, fontSize: 20 }}>✓</div>}
      </button>

      <button
        onClick={() => envioHabilitado && setTipoEntrega("envio")}
        disabled={!envioHabilitado}
        className="pt-card"
        style={{
          border: tipoEntrega === "envio" ? `2px solid ${C.primario}` : `2px solid ${C.borde}`,
          background: tipoEntrega === "envio" ? C.primarioClaro : envioHabilitado ? C.blanco : "#FAFAFA",
          padding: 18, textAlign: "left", cursor: envioHabilitado ? "pointer" : "not-allowed",
          display: "flex", gap: 14, alignItems: "center",
          opacity: envioHabilitado ? 1 : 0.6,
        }}>
        <div style={{ fontSize: 30 }}>🚚</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 3 }}>Envío a domicilio</div>
          {envioHabilitado ? (
            <div style={{ fontSize: 13, color: C.textoSec }}>Solo Zona Norte · Ver localidades abajo</div>
          ) : (
            <div style={{ fontSize: 13, color: C.amarillo }}>
              Disponible desde {fmtMoneda(PORTAL_CONFIG.MIN_ENVIO)} · <strong>Te faltan {fmtMoneda(faltanteEnvio)}</strong>
            </div>
          )}
        </div>
        {tipoEntrega === "envio" && <div style={{ color: C.primario, fontSize: 20 }}>✓</div>}
      </button>

      {tipoEntrega === "envio" && (
        <>
          <div className="pt-card" style={{ padding: 14, background: "#FFF8E6", borderLeft: `3px solid ${C.amarillo}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.texto, marginBottom: 6 }}>📍 Zonas de envío disponibles</div>
            <div style={{ fontSize: 12, color: C.textoSec, lineHeight: 1.6 }}>
              {PORTAL_CONFIG.LOCALIDADES_ENVIO.join(" · ")}
            </div>
          </div>

          <div className="pt-card" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Dirección (calle y número) *</label>
              <input className="pt-input" value={datosEnvio.direccion} onChange={e => setDatosEnvio(d => ({ ...d, direccion: e.target.value }))} placeholder="Ej: Av. Libertador 1234" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Localidad *</label>
              <input className="pt-input" value={datosEnvio.localidad} onChange={e => setDatosEnvio(d => ({ ...d, localidad: e.target.value }))} placeholder="Ej: Pilar" style={{ borderColor: localidadOK ? C.borde : C.rojo }} />
              {!localidadOK && (
                <div style={{ fontSize: 12, color: C.rojo, marginTop: 4 }}>Esta localidad no está en nuestra zona de envío</div>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Teléfono de contacto *</label>
              <input className="pt-input" type="tel" inputMode="tel" value={datosEnvio.telefono} onChange={e => setDatosEnvio(d => ({ ...d, telefono: e.target.value }))} placeholder="Para el repartidor" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.textoSec, marginBottom: 6 }}>Referencia (opcional)</label>
              <input className="pt-input" value={datosEnvio.referencia} onChange={e => setDatosEnvio(d => ({ ...d, referencia: e.target.value }))} placeholder="Ej: portón negro, casa al fondo" />
            </div>
          </div>
        </>
      )}

      <button className="pt-btn-primario" disabled={!puedeContinuar} onClick={onContinuar}>
        Continuar →
      </button>
    </div>
  );
}

// ============================================================
// PASO: CONFIRMACIÓN
// ============================================================
function PasoConfirmacion({ cliente, carrito, total, tipoEntrega, datosEnvio, notas, honeypot, setHoneypot, enviando, onEnviar }) {
  return (
    <div className="pt-fade" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, padding: "4px 4px 0" }}>Confirmá tu pedido</h2>

      <div className="pt-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textoSec, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Tus datos</div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{cliente.nombre}</div>
        <div style={{ fontSize: 13, color: C.textoSec }}>{cliente.telefono}</div>
      </div>

      <div className="pt-card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textoSec, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Entrega</div>
        {tipoEntrega === "retiro" ? (
          <div style={{ fontSize: 15 }}>🏪 Retiro en local</div>
        ) : (
          <>
            <div style={{ fontSize: 15, marginBottom: 4 }}>🚚 Envío a domicilio</div>
            <div style={{ fontSize: 13, color: C.textoSec }}>{datosEnvio.direccion}, {datosEnvio.localidad}</div>
            <div style={{ fontSize: 13, color: C.textoSec }}>Tel: {datosEnvio.telefono}</div>
            {datosEnvio.referencia && <div style={{ fontSize: 13, color: C.textoSec }}>Ref: {datosEnvio.referencia}</div>}
          </>
        )}
      </div>

      <div className="pt-card" style={{ padding: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textoSec, textTransform: "uppercase", letterSpacing: 0.5, padding: "12px 14px 8px" }}>Productos</div>
        {carrito.map((item, idx) => (
          <div key={item.producto_id} style={{
            padding: "10px 14px", display: "flex", justifyContent: "space-between", gap: 12,
            borderTop: `1px solid ${C.borde}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{item.nombre}</div>
              <div style={{ fontSize: 12, color: C.textoSec }}>{item.cantidad} × {fmtMoneda(item.precio)}</div>
            </div>
            <div style={{ fontWeight: 700, color: C.primario, whiteSpace: "nowrap" }}>{fmtMoneda(item.precio * item.cantidad)}</div>
          </div>
        ))}
        <div style={{ padding: "14px", borderTop: `2px solid ${C.borde}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>Total</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.texto }}>{fmtMoneda(total)}</div>
        </div>
      </div>

      {notas && (
        <div className="pt-card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.textoSec, marginBottom: 4 }}>Notas</div>
          <div style={{ fontSize: 13 }}>{notas}</div>
        </div>
      )}

      <div className="pt-card" style={{ padding: 14, background: C.primarioClaro, border: `1px solid ${C.primario}33` }}>
        <div style={{ fontSize: 12, color: C.texto, lineHeight: 1.5 }}>
          💡 <strong>Importante:</strong> El pago se coordina al momento de la entrega o retiro. Aceptamos efectivo y transferencia.
        </div>
      </div>

      {/* Honeypot anti-bot — invisible para humanos */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        style={{ position: "absolute", left: "-9999px", top: "-9999px", opacity: 0, height: 0, width: 0 }}
        aria-hidden="true"
      />

      <button className="pt-btn-primario" disabled={enviando} onClick={onEnviar}>
        {enviando ? "Enviando pedido..." : "Confirmar y enviar pedido →"}
      </button>
    </div>
  );
}

// ============================================================
// PASO: PEDIDO ENVIADO
// ============================================================
function PasoEnviado({ pedido, config, onWhatsApp, onNuevoPedido }) {
  return (
    <div className="pt-fade" style={{ textAlign: "center", padding: "30px 16px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{
        width: 90, height: 90, background: C.primario, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto", color: "white", fontSize: 48, animation: "pulse 1s ease 1",
      }}>✓</div>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 6 }}>¡Pedido recibido!</h1>
        <p style={{ fontSize: 15, color: C.textoSec }}>Estamos por confirmar tu pedido</p>
      </div>

      <div className="pt-card" style={{ padding: 20 }}>
        <div style={{ fontSize: 12, color: C.textoSec, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Número de pedido</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.primario, fontFamily: "monospace" }}>#{pedido?.numero}</div>
        <div style={{ height: 1, background: C.borde, margin: "14px 0" }}></div>
        <div style={{ fontSize: 12, color: C.textoSec, marginBottom: 4 }}>Código de verificación</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.texto, fontFamily: "monospace", letterSpacing: 4 }}>{pedido?.codigo}</div>
      </div>

      <div style={{ background: "#FFF8E6", borderRadius: 12, padding: 16, borderLeft: `3px solid ${C.amarillo}`, textAlign: "left" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>📲 Último paso</div>
        <div style={{ fontSize: 13, color: C.texto, lineHeight: 1.5 }}>
          Avisanos por WhatsApp para confirmar tu pedido. Sin este paso, no podemos prepararlo.
        </div>
      </div>

      <button onClick={onWhatsApp} style={{
        background: "#25D366", color: "white", border: "none", borderRadius: 12,
        padding: "16px 20px", fontSize: 16, fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
      }}>
        📱 Avisar al local por WhatsApp
      </button>

      <button onClick={onNuevoPedido} className="pt-btn-sec" style={{ marginTop: 4 }}>
        Hacer otro pedido
      </button>
    </div>
  );
}

// ============================================================
// PASO: ERROR
// ============================================================
function PasoError({ onReintentar }) {
  return (
    <div className="pt-fade" style={{ textAlign: "center", padding: 30, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 60 }}>😕</div>
      <h2 style={{ fontWeight: 700 }}>No pudimos enviar tu pedido</h2>
      <p style={{ color: C.textoSec, fontSize: 14 }}>
        Hubo un problema al guardar. Por favor, intentá de nuevo o comunicate directamente con el local.
      </p>
      <button className="pt-btn-primario" onClick={onReintentar}>Reintentar</button>
    </div>
  );
}
