import { useState, useMemo, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// ⚙️  CONFIGURACION — reemplaza estos dos valores
//     Los encontras en: Supabase > Settings > API
// ============================================================
const SUPABASE_URL    = "https://dupatnbwrgdtxalpqgqi.supabase.co";
const SUPABASE_ANON   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1cGF0bmJ3cmdkdHhhbHBxZ3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDI3MTYsImV4cCI6MjA5MjYxODcxNn0.boipXsRYdS98KjU8A2edDbAMEprFGT_1iL6rwkbHres";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ============================================================
// CONSTANTES
// ============================================================
// VENDEDORES ahora se cargan desde Supabase (tabla vendedores)
const METODOS_PAGO = ["Efectivo", "Transferencia", "Debito", "Credito", "Mercado Pago", "Cuenta corriente"];
const MODALIDADES  = ["En el local", "Telefonica / Delivery"];
const CATEGORIAS   = ["Pileta", "Jardineria", "Limpieza", "Fumigacion"];
const TIPOS_EGRESO = ["Gasto fijo", "Gasto variable", "Compra a proveedor", "Servicio", "Impuesto / Tasa", "Devolucion"];
// PROVEEDORES ahora se cargan desde Supabase (tabla proveedores)
// PAGADORES se construyen dinamicamente desde tabla vendedores
const USD_RATE     = 1200;

// ============================================================
// HELPERS
// ============================================================
const fmt    = n => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n||0);
const fmtNum = n => new Intl.NumberFormat("es-AR").format(n||0);
const fmtUSD = n => `U$D ${new Intl.NumberFormat("es-AR",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)}`;
const hoy    = () => new Date().toISOString().split("T")[0];
const mesAct = () => new Date().toISOString().slice(0,7);

function precioARS(v,m)   { return m==="USD"?v*USD_RATE:v; }
function getPrecio(p,tipo) { return tipo==="mayorista"?p.precio_may:tipo==="especial"?p.precio_esp:p.precio_min; }
function estadoStock(p)    { if(p.stock===0)return"agotado"; if(p.stock<=p.stock_min)return"bajo"; return"ok"; }
function iniciales(n)      { return n.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase(); }

function calcTotalItems(items,desc=0){
  const bruto=items.reduce((s,i)=>s+(i.precio||0)*(i.cantidad||0),0);
  return bruto*(1-desc/100);
}
function calcGananciaItems(items,desc=0){
  const v=items.reduce((s,i)=>s+(i.precio||0)*(i.cantidad||0),0);
  const c=items.reduce((s,i)=>s+(i.costo||0)*(i.cantidad||0),0);
  return (v-c)*(1-desc/100);
}

// ============================================================
// DESIGN TOKENS
// ============================================================
const G={verde:"#00C48C",fondo:"#0F1117",sup:"#181C25",sup2:"#1E2330",borde:"#2A3045",texto:"#E8EAF0",textoSec:"#7A8099",rojo:"#FF4D6A",amarillo:"#FFB800",azul:"#4D9EFF",naranja:"#FF8C42",violeta:"#A78BFA"};

const css=`
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:${G.fondo};color:${G.texto};font-family:'DM Sans',sans-serif;}
  ::-webkit-scrollbar{width:5px;height:5px;}
  ::-webkit-scrollbar-track{background:${G.sup};}
  ::-webkit-scrollbar-thumb{background:${G.borde};border-radius:3px;}
  input,select,textarea{font-family:'DM Sans',sans-serif;}
  input[type=checkbox]{accent-color:${G.verde};width:15px;height:15px;cursor:pointer;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
`;

// ============================================================
// COMPONENTES BASE
// ============================================================
function Badge({color,children,small}){
  const m={verde:{bg:"#00C48C22",t:G.verde,b:"#00C48C44"},rojo:{bg:"#FF4D6A22",t:G.rojo,b:"#FF4D6A44"},amarillo:{bg:"#FFB80022",t:G.amarillo,b:"#FFB80044"},azul:{bg:"#4D9EFF22",t:G.azul,b:"#4D9EFF44"},naranja:{bg:"#FF8C4222",t:G.naranja,b:"#FF8C4244"},violeta:{bg:"#A78BFA22",t:G.violeta,b:"#A78BFA44"},gris:{bg:"#7A809922",t:G.textoSec,b:"#7A809944"},usd:{bg:"#4D9EFF15",t:"#7BC8FF",b:"#4D9EFF33"}};
  const c=m[color]||m.gris;
  return <span style={{background:c.bg,color:c.t,border:`1px solid ${c.b}`,borderRadius:6,padding:small?"1px 6px":"2px 9px",fontSize:small?10:11,fontWeight:500,letterSpacing:0.3,whiteSpace:"nowrap"}}>{children}</span>;
}
function Card({children,style}){return <div style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:12,padding:"18px 22px",animation:"fadeIn .2s ease",...style}}>{children}</div>;}
function MetricCard({label,value,sub,color,accent}){return(<div style={{background:G.sup,border:`1px solid ${accent||G.borde}`,borderRadius:12,padding:"16px 18px"}}><div style={{fontSize:11,color:G.textoSec,textTransform:"uppercase",letterSpacing:1,marginBottom:6}}>{label}</div><div style={{fontSize:24,fontWeight:600,color:color||G.texto,fontFamily:"'DM Mono',monospace"}}>{value}</div>{sub&&<div style={{fontSize:12,color:G.textoSec,marginTop:3}}>{sub}</div>}</div>);}
function Btn({children,onClick,variant="primary",small,disabled,style,full}){
  const base={border:"none",borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:500,transition:"all .15s",opacity:disabled?.4:1,width:full?"100%":undefined,...style};
  const v={primary:{background:G.verde,color:"#000",padding:small?"5px 12px":"9px 18px",fontSize:small?12:13},secondary:{background:G.sup2,color:G.texto,border:`1px solid ${G.borde}`,padding:small?"5px 12px":"9px 18px",fontSize:small?12:13},danger:{background:"#FF4D6A18",color:G.rojo,border:`1px solid #FF4D6A33`,padding:small?"5px 12px":"9px 18px",fontSize:small?12:13},ghost:{background:"transparent",color:G.textoSec,padding:small?"3px 8px":"6px 12px",fontSize:small?11:13},outline:{background:"transparent",color:G.verde,border:`1px solid ${G.verde}55`,padding:small?"5px 12px":"9px 18px",fontSize:small?12:13}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>;
}
function Fi({label,value,onChange,type="text",options,placeholder,style,min,rows}){
  const s={background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 11px",color:G.texto,fontSize:13,width:"100%",outline:"none"};
  return(<div style={{display:"flex",flexDirection:"column",gap:5,...style}}>{label&&<label style={{fontSize:11,color:G.textoSec,fontWeight:500,textTransform:"uppercase",letterSpacing:0.5}}>{label}</label>}{options?<select value={value} onChange={e=>onChange(e.target.value)} style={{...s,cursor:"pointer"}}>{options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select>:rows?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{...s,resize:"vertical"}}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} min={min} style={s}/>}</div>);
}
function ST({children}){return <div style={{fontSize:11,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:1.2,marginBottom:12}}>{children}</div>;}
function Div(){return <div style={{height:1,background:G.borde,margin:"14px 0"}}/>;}
function Avatar({nombre,size=36,color}){const bg=color||G.verde;return(<div style={{width:size,height:size,borderRadius:"50%",background:bg+"22",border:`1px solid ${bg}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.33,fontWeight:600,color:bg,flexShrink:0}}>{iniciales(nombre)}</div>);}
function Spinner(){return <div style={{width:20,height:20,border:`2px solid ${G.borde}`,borderTopColor:G.verde,borderRadius:"50%",animation:"spin .7s linear infinite"}}/>;}
function Modal({title,onClose,children,footer,maxWidth=520}){return(<div style={{position:"fixed",inset:0,background:"#00000088",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={e=>e.target===e.currentTarget&&onClose()}><div style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:14,width:"100%",maxWidth,maxHeight:"92vh",overflowY:"auto"}}><div style={{padding:"16px 22px",borderBottom:`1px solid ${G.borde}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div style={{fontWeight:600,fontSize:15}}>{title}</div><Btn small variant="ghost" onClick={onClose}>✕</Btn></div><div style={{padding:"20px 22px"}}>{children}</div>{footer&&<div style={{padding:"14px 22px",borderTop:`1px solid ${G.borde}`,display:"flex",justifyContent:"flex-end",gap:10}}>{footer}</div>}</div></div>);}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================
function Toast({toasts}){
  return(<div style={{position:"fixed",bottom:24,right:24,zIndex:200,display:"flex",flexDirection:"column",gap:8}}>
    {toasts.map(t=>(
      <div key={t.id} style={{background:t.type==="error"?G.rojo:G.verde,color:"#000",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:500,animation:"fadeIn .2s ease",boxShadow:"0 4px 20px #00000044"}}>
        {t.type==="error"?"✕":"✓"} {t.msg}
      </div>
    ))}
  </div>);
}

function useToast(){
  const [toasts,setToasts]=useState([]);
  const add=useCallback((msg,type="ok")=>{
    const id=Date.now();
    setToasts(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  },[]);
  return{toasts,ok:msg=>add(msg,"ok"),err:msg=>add(msg,"error")};
}

// ============================================================
// PANTALLA LOGIN
// ============================================================
function PantallaLogin({onLogin}){
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [modo,setModo]=useState("login"); // login | registro

  async function handleSubmit(){
    setLoading(true);setError("");
    if(modo==="login"){
      const{error:e}=await supabase.auth.signInWithPassword({email,password:pass});
      if(e)setError("Email o contrasena incorrectos");
      else onLogin();
    } else {
      const{error:e}=await supabase.auth.signUp({email,password:pass});
      if(e)setError(e.message);
      else{setError("");setModo("login");setError("Cuenta creada. Chequea tu email para confirmar.");}
    }
    setLoading(false);
  }

  return(
    <div style={{minHeight:"100vh",background:G.fondo,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:48,height:48,background:G.verde,borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:16}}>
            <span style={{fontSize:22,fontWeight:700,color:"#000"}}>P</span>
          </div>
          <div style={{fontSize:24,fontWeight:600,letterSpacing:-0.5}}>Pensok</div>
          <div style={{fontSize:13,color:G.textoSec,marginTop:4}}>Sistema de gestion</div>
        </div>
        <Card>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Email" value={email} onChange={setEmail} type="email" placeholder="tu@email.com"/>
            <Fi label="Contrasena" value={pass} onChange={setPass} type="password" placeholder="••••••••"/>
            {error&&<div style={{fontSize:12,color:error.includes("creada")?G.verde:G.rojo,background:error.includes("creada")?"#00C48C11":"#FF4D6A11",border:`1px solid ${error.includes("creada")?"#00C48C33":"#FF4D6A33"}`,borderRadius:8,padding:"8px 12px"}}>{error}</div>}
            <Btn full disabled={!email||!pass||loading} onClick={handleSubmit}>
              {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/> Entrando...</span>:modo==="login"?"Ingresar":"Crear cuenta"}
            </Btn>
            <div style={{textAlign:"center",fontSize:12,color:G.textoSec}}>
              {modo==="login"?"Primera vez? ":"Ya tenes cuenta? "}
              <span style={{color:G.verde,cursor:"pointer"}} onClick={()=>{setModo(m=>m==="login"?"registro":"login");setError("");}}>
                {modo==="login"?"Crear cuenta":"Iniciar sesion"}
              </span>
            </div>
          </div>
        </Card>
        <div style={{textAlign:"center",marginTop:16,fontSize:11,color:G.textoSec}}>
          Base de datos Supabase · Datos seguros en la nube
        </div>
      </div>
    </div>
  );
}

// ============================================================
// HOOK: useSupabase — carga todos los datos
// ============================================================
function useData(toast){
  const [clientes,       setClientes]       = useState([]);
  const [productos,      setProductos]      = useState([]);
  const [ventas,         setVentas]         = useState([]);
  const [ventaItems,     setVentaItems]     = useState([]);
  const [egresos,        setEgresos]        = useState([]);
  const [abastecimiento, setAbastecimiento] = useState([]);
  const [vendedores,     setVendedores]     = useState([]);
  const [proveedores,    setProveedores]    = useState([]);
  const [tipoCambio,     setTipoCambio]     = useState(1200);
  const [totalVentas,    setTotalVentas]    = useState(0);
  const [loading,        setLoading]        = useState(true);

  async function cargar(){
    setLoading(true);
    const[{data:cls},{data:prds},{data:vts},{data:vis},{data:egs},{data:abs},{data:vends},{data:provs}]=await Promise.all([
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("ventas").select("*, venta_items(*)").order("fecha",{ascending:false}).order("hora",{ascending:false}).limit(5000),
      supabase.from("venta_items").select("id").limit(1),
      supabase.from("egresos").select("*").order("fecha",{ascending:false}),
      supabase.from("abastecimiento").select("*").order("fecha",{ascending:false}),
      supabase.from("vendedores").select("*").eq("activo",true).order("nombre"),
      supabase.from("proveedores").select("*").order("nombre"),
    ]);
    setClientes(cls||[]);setProductos(prds||[]);setVentas(vts||[]);setVentaItems(vis||[]);setEgresos(egs||[]);setAbastecimiento(abs||[]);setVendedores(vends||[]);setProveedores(provs||[]);
    // Obtener count real de ventas
    const{count}=await supabase.from("ventas").select("*",{count:"exact",head:true});
    setTotalVentas(count||0);
    setLoading(false);
  }

  useEffect(()=>{cargar();},[]);

  // Enriquecer ventas con sus items
  const ventasConItems = useMemo(()=>
    ventas.map(v=>({...v,items:(v.venta_items||[])}))
  ,[ventas]);

  // ── VENTAS ──────────────────────────────────────────────
  async function registrarVenta(venta,items){
    // 1. Insertar venta
    const total    = calcTotalItems(items,venta.descuento||0);
    const ganancia = calcGananciaItems(items,venta.descuento||0);
    const{data:vData,error:vErr}=await supabase.from("ventas").insert({
      fecha:venta.fecha, hora:venta.hora,
      cliente_id:venta.clienteId||null, cliente_nombre:venta.clienteNombre||"",
      vendedor:venta.vendedor, metodo_pago:venta.metodoPago,
      modalidad:venta.modalidad, descuento:venta.descuento||0,
      cobrado:venta.cobrado, entregado:venta.entregado,
      total,ganancia
    }).select().single();
    if(vErr){toast.err("Error al registrar venta");return;}

    // 2. Insertar items
    await supabase.from("venta_items").insert(
      items.map(i=>({venta_id:vData.id,producto_id:i.productoId||null,nombre:i.nombre,cantidad:i.cantidad,precio:i.precio,costo:i.costo}))
    );

    // 3. Descontar stock y sumar vendidos por producto
    for(const item of items){
      if(item.productoId){
        const prod=productos.find(p=>p.id===item.productoId);
        if(prod){
          await supabase.from("productos").update({
            stock:Math.max(0,prod.stock-item.cantidad),
            vendidos:(prod.vendidos||0)+item.cantidad
          }).eq("id",prod.id);
        }
      }
    }

    // 4. Si es cuenta corriente, actualizar saldo del cliente
    if(venta.metodoPago==="Cuenta corriente"&&venta.clienteId){
      const cli=clientes.find(c=>c.id===venta.clienteId);
      if(cli){
        await supabase.from("clientes").update({cuenta_corriente:cli.cuenta_corriente-total}).eq("id",cli.id);
      }
    }

    toast.ok("Venta registrada");
    await cargar();
  }

  // ── EGRESOS ──────────────────────────────────────────────
  async function registrarEgreso(eg){
    const{error}=await supabase.from("egresos").insert(eg);
    if(error){toast.err("Error al guardar egreso");return;}
    toast.ok("Egreso registrado");
    await cargar();
  }
  async function marcarReembolsado(id){
    await supabase.from("egresos").update({reembolsado:true,reembolso_pendiente:false}).eq("id",id);
    toast.ok("Marcado como reembolsado");
    await cargar();
  }

  // ── CLIENTES ──────────────────────────────────────────────
  async function guardarCliente(datos,id=null){
    if(id){
      const{error}=await supabase.from("clientes").update(datos).eq("id",id);
      if(error){toast.err("Error al actualizar cliente");return;}
      toast.ok("Cliente actualizado");
    } else {
      const{error}=await supabase.from("clientes").insert(datos);
      if(error){toast.err("Error al crear cliente");return;}
      toast.ok("Cliente creado");
    }
    await cargar();
  }

  // ── PRODUCTOS ──────────────────────────────────────────────
  async function guardarProducto(datos,id=null){
    if(id){
      const{error}=await supabase.from("productos").update(datos).eq("id",id);
      if(error){toast.err("Error al actualizar producto");return;}
      toast.ok("Producto actualizado");
    } else {
      const{error}=await supabase.from("productos").insert(datos);
      if(error){toast.err("Error al crear producto");return;}
      toast.ok("Producto creado");
    }
    await cargar();
  }

  // ── ABASTECIMIENTO ────────────────────────────────────────
  async function registrarAbastecimiento(datos){
    const{error}=await supabase.from("abastecimiento").insert(datos);
    if(error){toast.err("Error al registrar ingreso");return;}
    // actualizar stock y costo del producto
    const prod=productos.find(p=>p.id===datos.producto_id);
    if(prod){
      await supabase.from("productos").update({
        stock:prod.stock+datos.cantidad,
        costo:datos.costo_unit
      }).eq("id",prod.id);
    }
    toast.ok("Ingreso de mercaderia registrado");
    await cargar();
  }

  // ── PROVEEDORES ──────────────────────────────────────────
  async function guardarProveedor(datos,id=null){
    if(id){
      const{error}=await supabase.from("proveedores").update(datos).eq("id",id);
      if(error){toast.err("Error al actualizar proveedor");return;}
      toast.ok("Proveedor actualizado");
    } else {
      const{error}=await supabase.from("proveedores").insert(datos);
      if(error){toast.err("Error al crear proveedor");return;}
      toast.ok("Proveedor creado");
    }
    await cargar();
  }
  async function toggleProveedor(id,activo){
    await supabase.from("proveedores").update({activo}).eq("id",id);
    toast.ok(activo?"Proveedor activado":"Proveedor desactivado");
    await cargar();
  }

  // ── VENDEDORES ───────────────────────────────────────────
  async function guardarVendedor(datos,id=null){
    if(id){
      const{error}=await supabase.from("vendedores").update(datos).eq("id",id);
      if(error){toast.err("Error al actualizar vendedor");return;}
      toast.ok("Vendedor actualizado");
    } else {
      const{error}=await supabase.from("vendedores").insert(datos);
      if(error){toast.err("Error al crear vendedor");return;}
      toast.ok("Vendedor creado");
    }
    await cargar();
  }
  async function toggleVendedor(id,activo){
    await supabase.from("vendedores").update({activo}).eq("id",id);
    toast.ok(activo?"Vendedor activado":"Vendedor desactivado");
    await cargar();
  }

  // ── ACTUALIZAR PRECIOS ───────────────────────────────────
  async function actualizarTipoCambio(nuevoTC, soloProveedor=null){
    // Filtrar proveedores USD (o uno especifico)
    const provsUSD=(proveedores||[]).filter(p=>p.moneda==="USD"&&(soloProveedor?p.nombre===soloProveedor:true));
    const nombresUSD=provsUSD.map(p=>p.nombre);
    const prodsUSD=productos.filter(p=>nombresUSD.includes(p.proveedor)&&(p.costo_usd||0)>0);
    let actualizados=0;
    for(const prod of prodsUSD){
      // Usar costo_usd guardado (ya tiene descuentos aplicados) + iva del producto
      const costoUSD=prod.costo_usd||0;
      const iva=1+((prod.iva_pct||21)/100);
      const costoARS=Math.round(costoUSD*iva*nuevoTC);
      const ganMin=(prod.ganancia_min||0); const ganMay=(prod.ganancia_may||0);
      await supabase.from("productos").update({
        costo:costoARS,
        precio_min:ganMin>0?Math.round(costoARS*(1+ganMin/100)):prod.precio_min,
        precio_esp:ganMin>0?Math.round(costoARS*(1+ganMin/100)*0.95):prod.precio_esp,
        precio_may:ganMay>0?Math.round(costoARS*(1+ganMay/100)):prod.precio_may
      }).eq("id",prod.id);
      actualizados++;
    }
    // Guardar nuevo TC en el proveedor
    for(const prov of provsUSD){
      await supabase.from("proveedores").update({tipo_cambio_usd:nuevoTC}).eq("id",prov.id);
    }
    setTipoCambio(nuevoTC);
    toast.ok(`TC $${nuevoTC.toLocaleString("es-AR")} — ${actualizados} productos recalculados`);
    await cargar();
  }

  async function actualizarPorcentaje(proveedorNombre,porcentaje){
    const prods=productos.filter(p=>p.proveedor===proveedorNombre);
    const factor=1+porcentaje/100;
    for(const prod of prods){
      const nuevoCosto=Math.round(prod.costo*factor);
      const ganMin=(prod.ganancia_min||0); const ganMay=(prod.ganancia_may||0);
      await supabase.from("productos").update({
        costo:nuevoCosto,
        precio_min:Math.round(nuevoCosto*(1+ganMin/100)),
        precio_esp:Math.round(nuevoCosto*(1+ganMin/100)*0.95),
        precio_may:Math.round(nuevoCosto*(1+ganMay/100))
      }).eq("id",prod.id);
    }
    toast.ok(`${prods.length} productos de ${proveedorNombre} actualizados (+${porcentaje}%)`);
    await cargar();
  }

  async function actualizarDesdeCSV(proveedorNombre,filas){
    const prov=(proveedores||[]).find(p=>p.nombre===proveedorNombre);
    const desc=(prov?.descuento||0)/100;
    let ok=0;
    for(const fila of filas){
      const prod=productos.find(p=>
        (fila.codigo&&p.codigo?.toLowerCase()===fila.codigo.toLowerCase())||
        (fila.nombre&&p.nombre?.toLowerCase().includes(fila.nombre.toLowerCase().substring(0,15)))
      );
      if(!prod)continue;
      const costo=Math.round(fila.costo*(1-desc));
      const ganMin=(prod.ganancia_min||0); const ganMay=(prod.ganancia_may||0);
      await supabase.from("productos").update({
        costo,
        precio_min:Math.round(costo*(1+ganMin/100)),
        precio_esp:Math.round(costo*(1+ganMin/100)*0.95),
        precio_may:Math.round(costo*(1+ganMay/100))
      }).eq("id",prod.id);
      ok++;
    }
    toast.ok(`${ok} de ${filas.length} productos actualizados desde lista`);
    await cargar();
    return ok;
  }

  // ── EDICION ──────────────────────────────────────────────
  async function editarVenta(id,datos){
    const{error}=await supabase.from("ventas").update(datos).eq("id",id);
    if(error){toast.err("Error al editar venta");return;}
    toast.ok("Venta actualizada");await cargar();
  }
  async function eliminarVenta(id){
    await supabase.from("ventas").delete().eq("id",id);
    await supabase.from("venta_items").delete().eq("venta_id",id);
    toast.ok("Venta eliminada");await cargar();
  }
  async function editarEgreso(id,datos){
    const{error}=await supabase.from("egresos").update(datos).eq("id",id);
    if(error){toast.err("Error al editar egreso");return;}
    toast.ok("Egreso actualizado");await cargar();
  }
  async function eliminarEgreso(id){
    await supabase.from("egresos").delete().eq("id",id);
    toast.ok("Egreso eliminado");await cargar();
  }
  async function editarAbastecimiento(id,datos,stockAnterior,stockNuevo,productoId){
    const{error}=await supabase.from("abastecimiento").update(datos).eq("id",id);
    if(error){toast.err("Error al editar ingreso");return;}
    // Recalcular stock
    if(productoId&&stockAnterior!==stockNuevo){
      const prod=productos.find(p=>p.id===productoId);
      if(prod){
        const diff=stockNuevo-stockAnterior;
        await supabase.from("productos").update({stock:Math.max(0,prod.stock+diff),costo:datos.costo_unit}).eq("id",productoId);
      }
    }
    toast.ok("Ingreso actualizado");await cargar();
  }
  async function eliminarAbastecimiento(id,cantidad,productoId){
    await supabase.from("abastecimiento").delete().eq("id",id);
    // Revertir stock
    if(productoId){
      const prod=productos.find(p=>p.id===productoId);
      if(prod) await supabase.from("productos").update({stock:Math.max(0,prod.stock-cantidad)}).eq("id",prod.id);
    }
    toast.ok("Ingreso eliminado");await cargar();
  }

  return{clientes,productos,ventasConItems,egresos,abastecimiento,vendedores,proveedores,tipoCambio,totalVentas,loading,cargar,registrarVenta,registrarEgreso,marcarReembolsado,guardarCliente,guardarProducto,registrarAbastecimiento,guardarVendedor,toggleVendedor,guardarProveedor,toggleProveedor,editarVenta,eliminarVenta,editarEgreso,eliminarEgreso,editarAbastecimiento,eliminarAbastecimiento,actualizarTipoCambio,actualizarPorcentaje,actualizarDesdeCSV};
}

// ============================================================
// MODULO: ANALISIS / DASHBOARD
// ============================================================
function ModuloAnalisis({ventas,egresos,productos,vendedores}){
  const hoyStr=hoy();const mes=mesAct();
  const vHoy=ventas.filter(v=>v.fecha===hoyStr);
  const vMes=ventas.filter(v=>v.fecha?.startsWith(mes));
  const eMes=egresos.filter(e=>e.fecha?.startsWith(mes));
  const tHoy=vHoy.reduce((s,v)=>s+(v.total||0),0);
  const gHoy=vHoy.reduce((s,v)=>s+(v.ganancia||0),0);
  const tMes=vMes.reduce((s,v)=>s+(v.total||0),0);
  const gMes=vMes.reduce((s,v)=>s+(v.ganancia||0),0);
  const eMesTotal=eMes.reduce((s,e)=>s+(e.monto||0),0);
  const resultado=gMes-eMesTotal;

  const porVend=(vendedores||[]).map(({nombre:v})=>({v,total:vMes.filter(x=>x.vendedor===v).reduce((s,x)=>s+(x.total||0),0),cant:vMes.filter(x=>x.vendedor===v).length})).sort((a,b)=>b.total-a.total);
  const maxV=Math.max(...porVend.map(x=>x.total),1);

  const porMet=METODOS_PAGO.map(m=>({m,total:ventas.filter(v=>v.metodo_pago===m).reduce((s,v)=>s+(v.total||0),0),cant:ventas.filter(v=>v.metodo_pago===m).length})).filter(x=>x.cant>0).sort((a,b)=>b.total-a.total);
  const maxM=Math.max(...porMet.map(x=>x.total),1);

  const topProd=productos.filter(p=>p.vendidos>0).sort((a,b)=>b.vendidos-a.vendidos).slice(0,5);
  const maxP=Math.max(...topProd.map(p=>p.vendidos),1);

  const sinCobrar=ventas.filter(v=>!v.cobrado);
  const sinEntregar=ventas.filter(v=>!v.entregado);
  const alertasStock=productos.filter(p=>p.activo&&estadoStock(p)!=="ok");

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Ventas hoy"     value={fmtNum(vHoy.length)} sub={`Total: ${fmt(tHoy)}`}/>
        <MetricCard label="Ganancia hoy"   value={fmt(gHoy)} color={G.verde}/>
        <MetricCard label="Ventas del mes" value={fmtNum(vMes.length)} sub={`Total: ${fmt(tMes)}`}/>
        <MetricCard label="Resultado neto" value={fmt(resultado)} color={resultado>=0?G.verde:G.rojo} sub={`Gan. ${fmt(gMes)} − Egr. ${fmt(eMesTotal)}`}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        <Card>
          <ST>Vendedores — mes</ST>
          {porVend.map(x=>(
            <div key={x.v} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:500}}>{x.v}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.verde}}>{fmt(x.total)}</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(x.total/maxV)*100}%`,background:G.verde,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>{x.cant} ventas</div>
            </div>
          ))}
        </Card>
        <Card>
          <ST>Metodo de pago</ST>
          {porMet.map(x=>(
            <div key={x.m} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:500}}>{x.m}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.azul}}>{fmt(x.total)}</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(x.total/maxM)*100}%`,background:G.azul,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>{x.cant} transacciones</div>
            </div>
          ))}
        </Card>
        <Card>
          <ST>Mas vendidos</ST>
          {topProd.map(p=>(
            <div key={p.id} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:500}}>{p.nombre}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.violeta}}>{fmtNum(p.vendidos)} u.</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(p.vendidos/maxP)*100}%`,background:G.violeta,borderRadius:3}}/></div>
            </div>
          ))}
        </Card>
      </div>
      {(sinCobrar.length>0||sinEntregar.length>0||alertasStock.length>0)&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
          {sinCobrar.length>0&&(<Card style={{border:`1px solid #FF4D6A33`}}><ST>Sin cobrar ({sinCobrar.length})</ST>{sinCobrar.slice(0,5).map(v=>(<div key={v.id} style={{fontSize:13,display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${G.borde}22`}}><span style={{color:G.textoSec,fontSize:12}}>{v.cliente_nombre}</span><span style={{color:G.rojo,fontFamily:"'DM Mono',monospace"}}>{fmt(v.total)}</span></div>))}</Card>)}
          {sinEntregar.length>0&&(<Card style={{border:`1px solid #FFB80033`}}><ST>Sin entregar ({sinEntregar.length})</ST>{sinEntregar.slice(0,5).map(v=>(<div key={v.id} style={{fontSize:13,display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${G.borde}22`}}><span style={{color:G.textoSec,fontSize:12}}>{v.cliente_nombre}</span><span style={{color:G.amarillo}}>{v.fecha}</span></div>))}</Card>)}
          {alertasStock.length>0&&(<Card style={{border:`1px solid #FF8C4233`}}><ST>Stock critico ({alertasStock.length})</ST>{alertasStock.slice(0,5).map(p=>(<div key={p.id} style={{fontSize:12,display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${G.borde}22`}}><span style={{color:G.textoSec}}>{p.nombre}</span><Badge color={estadoStock(p)==="agotado"?"rojo":"amarillo"} small>{p.stock===0?"AGOTADO":p.stock}</Badge></div>))}</Card>)}
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODULO: NUEVA VENTA
// ============================================================
function ModuloVenta({clientes,productos,onRegistrar,vendedores}){
  const [clienteId, setClienteId] = useState("");
  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  const [vendedor,  setVendedor]  = useState(nombresVend[0]||"");
  const [metodo,    setMetodo]    = useState(METODOS_PAGO[0]);
  const [modalidad, setModalidad] = useState(MODALIDADES[0]);
  const [descuento, setDescuento] = useState("0");
  const [items,     setItems]     = useState([]);
  const [busqueda,  setBusqueda]  = useState("");
  const [cobrado,   setCobrado]   = useState(true);
  const [entregado, setEntregado] = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [ok,        setOk]        = useState(false);

  const cliente     = clientes.find(c=>String(c.id)===String(clienteId));
  const tipoCliente = cliente?.tipo||"minorista";

  const prodFiltrados=useMemo(()=>{
    if(!busqueda)return productos.filter(p=>p.activo);
    const q=busqueda.toLowerCase();
    return productos.filter(p=>p.activo&&(p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q)||p.categoria.toLowerCase().includes(q)));
  },[busqueda,productos]);

  useEffect(()=>{
    if(clientes.length>0&&!clienteId) setClienteId(String(clientes[0].id));
  },[clientes]);

  function agregarItem(prod){
    setItems(prev=>{
      const ex=prev.find(i=>i.productoId===prod.id);
      if(ex)return prev.map(i=>i.productoId===prod.id?{...i,cantidad:i.cantidad+1}:i);
      return [...prev,{productoId:prod.id,nombre:prod.nombre,cantidad:1,precio:precioARS(getPrecio(prod,tipoCliente),prod.moneda),costo:precioARS(prod.costo,prod.moneda)}];
    });
    setBusqueda("");
  }

  const total    = calcTotalItems(items,parseFloat(descuento)||0);
  const ganancia = calcGananciaItems(items,parseFloat(descuento)||0);

  async function cerrarVenta(){
    if(!items.length)return;
    setLoading(true);
    const ahora=new Date();
    await onRegistrar({
      fecha:ahora.toISOString().split("T")[0],
      hora:ahora.toTimeString().slice(0,5),
      clienteId:cliente?.id||null,
      clienteNombre:cliente?.nombre||"Consumidor Final",
      vendedor,metodoPago:metodo,modalidad,
      descuento:parseFloat(descuento)||0,cobrado,entregado
    },items);
    setLoading(false);setOk(true);
    setTimeout(()=>{setItems([]);setDescuento("0");setOk(false);},2000);
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:360,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>Venta registrada</div><div style={{color:G.textoSec}}>Guardada en la base de datos</div></div>);

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 310px",gap:18,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card>
          <ST>Datos de la venta</ST>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Fi label="Cliente" value={clienteId} onChange={setClienteId} options={clientes.map(c=>({value:String(c.id),label:`${c.nombre} (${c.tipo})`}))}/>
            <Fi label="Vendedor"       value={vendedor}  onChange={setVendedor}  options={(vendedores||[]).map(v=>v.nombre)}/>
            <Fi label="Metodo de pago" value={metodo}    onChange={setMetodo}    options={METODOS_PAGO}/>
            <Fi label="Modalidad"      value={modalidad} onChange={setModalidad} options={MODALIDADES}/>
          </div>
          <div style={{display:"flex",gap:20,marginTop:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}><input type="checkbox" checked={cobrado}   onChange={e=>setCobrado(e.target.checked)}/> Cobrado</label>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}><input type="checkbox" checked={entregado} onChange={e=>setEntregado(e.target.checked)}/> Entregado</label>
          </div>
        </Card>
        <Card>
          <ST>Agregar productos</ST>
          <div style={{position:"relative"}}>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre, codigo o categoria..."
              style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"9px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
            {busqueda&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,marginTop:4,zIndex:10,maxHeight:220,overflowY:"auto"}}>
                {prodFiltrados.length===0?<div style={{padding:"12px 16px",color:G.textoSec,fontSize:13}}>Sin resultados</div>
                :prodFiltrados.map(p=>(
                  <div key={p.id} onClick={()=>agregarItem(p)} style={{padding:"9px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${G.borde}22`}} onMouseEnter={e=>e.currentTarget.style.background=G.borde} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div><div style={{fontSize:13,fontWeight:500}}>{p.nombre}</div><div style={{fontSize:11,color:G.textoSec}}>{p.codigo} · Stock: {p.stock}</div></div>
                    <div style={{fontSize:13,fontWeight:600,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(precioARS(getPrecio(p,tipoCliente),p.moneda))}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {items.length>0&&(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:14}}>
              <thead><tr style={{borderBottom:`1px solid ${G.borde}`}}>{["Producto","Cant.","Precio","Subtotal",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:h==="Subtotal"||h==="Precio"?"right":"left",color:G.textoSec,fontWeight:500,fontSize:11}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map(item=>(
                  <tr key={item.productoId} style={{borderBottom:`1px solid ${G.borde}22`}}>
                    <td style={{padding:"8px 8px"}}>{item.nombre}</td>
                    <td style={{padding:"8px 8px"}}><input type="number" value={item.cantidad} onChange={e=>{const n=parseInt(e.target.value)||0;if(n<=0)setItems(p=>p.filter(i=>i.productoId!==item.productoId));else setItems(p=>p.map(i=>i.productoId===item.productoId?{...i,cantidad:n}:i));}} style={{width:52,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"4px 8px",color:G.texto,fontSize:13,textAlign:"center"}}/></td>
                    <td style={{padding:"8px 8px",textAlign:"right"}}><input type="number" value={item.precio} onChange={e=>setItems(p=>p.map(i=>i.productoId===item.productoId?{...i,precio:parseFloat(e.target.value)||0}:i))} style={{width:88,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"4px 8px",color:G.texto,fontSize:13,textAlign:"right"}}/></td>
                    <td style={{padding:"8px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{fmt(item.precio*item.cantidad)}</td>
                    <td style={{padding:"8px 8px"}}><Btn small variant="danger" onClick={()=>setItems(p=>p.filter(i=>i.productoId!==item.productoId))}>✕</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card style={{position:"sticky",top:60}}>
        <ST>Resumen</ST>
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:G.textoSec}}>Lista</span><Badge color={tipoCliente==="mayorista"?"azul":tipoCliente==="especial"?"amarillo":"gris"}>{tipoCliente}</Badge></div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:G.textoSec}}>Unidades</span><span>{items.reduce((s,i)=>s+i.cantidad,0)}</span></div>
        </div>
        <Div/>
        <Fi label="Descuento (%)" value={descuento} onChange={setDescuento} type="number" placeholder="0"/>
        <Div/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <span style={{fontSize:14,fontWeight:600}}>Total</span>
          <span style={{fontSize:22,fontWeight:700,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(total)}</span>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:G.textoSec,marginTop:4}}><span>Ganancia</span><span style={{color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(ganancia)}</span></div>
        <Btn full disabled={items.length===0||loading} onClick={cerrarVenta} style={{marginTop:16,padding:"11px 0",fontSize:14}}>
          {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"Cerrar venta →"}
        </Btn>
      </Card>
    </div>
  );
}

// ============================================================
// MODULO: INGRESOS
// ============================================================
function ModuloIngresos({ventas,vendedores,onEditar,onEliminar,totalVentas}){
  const [fVend,setFV]=useState("Todos");
  const [fMet,setFM]=useState("Todos");
  const [fFecha,setFF]=useState(hoy());
  const [confirmarElim,setConfirmarElim]=useState(null);
  const [editandoV,  setEditandoV]  = useState(null);
  const [evCliente,  setEvCliente]  = useState("");
  const [evVendedor, setEvVendedor] = useState("");
  const [evMetodo,   setEvMetodo]   = useState("");
  const [evCobrado,  setEvCobrado]  = useState(true);
  const [evEntregado,setEvEntregado]= useState(true);
  const [evLoading,  setEvLoading]  = useState(false);

  function abrirEditarVenta(v){
    setEditandoV(v);
    setEvCliente(v.cliente_nombre||"");
    setEvVendedor(v.vendedor||"");
    setEvMetodo(v.metodo_pago||METODOS_PAGO[0]);
    setEvCobrado(v.cobrado??true);
    setEvEntregado(v.entregado??true);
  }
  async function guardarVenta(){
    if(!editandoV)return; setEvLoading(true);
    await onEditar(editandoV.id,{
      cliente_nombre:evCliente,
      vendedor:evVendedor,
      metodo_pago:evMetodo,
      cobrado:evCobrado,
      entregado:evEntregado
    });
    setEvLoading(false);setEditandoV(null);
  }
  const filtrados=useMemo(()=>ventas.filter(v=>{if(fVend!=="Todos"&&v.vendedor!==fVend)return false;if(fMet!=="Todos"&&v.metodo_pago!==fMet)return false;if(fFecha&&v.fecha!==fFecha)return false;return true;}),[ventas,fVend,fMet,fFecha]);
  const totalF=filtrados.reduce((s,v)=>s+(v.total||0),0);
  const ganF=filtrados.reduce((s,v)=>s+(v.ganancia||0),0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label={fFecha?"Ventas del dia":"Ventas (filtro)"} value={fmtNum(filtrados.length)} sub={fFecha?fFecha:`de ${fmtNum(totalVentas)} historicas`}/>
        <MetricCard label="Total"           value={fmt(totalF)}   color={G.verde}/>
        <MetricCard label="Ganancia neta"   value={fmt(ganF)}     color={G.verde} sub={`${totalF>0?Math.round(ganF/totalF*100):0}% margen`}/>
      </div>
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <Fi value={fVend} onChange={setFV} options={["Todos",...(vendedores||[]).map(v=>v.nombre)]}   style={{flex:1,minWidth:130}}/>
          <Fi value={fMet}  onChange={setFM} options={["Todos",...METODOS_PAGO]} style={{flex:1,minWidth:130}}/>
          <Fi value={fFecha} onChange={setFF} type="date" style={{flex:1,minWidth:130}}/>
          {fFecha&&<Btn small variant="ghost" onClick={()=>setFF("")}>Ver todos</Btn>}
        </div>
      </Card>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(v=>(
          <Card key={v.id} style={{padding:"12px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{v.cliente_nombre}</div>
                <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{v.fecha} · {v.hora?.slice(0,5)} · {v.vendedor} · {v.metodo_pago}</div>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <Badge color={v.modalidad?.includes("local")?"azul":"gris"}>{v.modalidad?.includes("local")?"Local":"Delivery"}</Badge>
                  <Badge color={v.cobrado?"verde":"rojo"}>{v.cobrado?"Cobrado":"Sin cobrar"}</Badge>
                  <Badge color={v.entregado?"verde":"amarillo"}>{v.entregado?"Entregado":"Sin entregar"}</Badge>
                  {v.descuento>0&&<Badge color="amarillo">-{v.descuento}%</Badge>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:700,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(v.total)}</div>
                  <div style={{fontSize:11,color:G.textoSec}}>Ganancia: {fmt(v.ganancia)}</div>
                </div>
                <Btn small variant="ghost" onClick={()=>abrirEditarVenta(v)}>Editar</Btn>
                <Btn small variant="danger" onClick={()=>setConfirmarElim(v)}>Eliminar</Btn>
              </div>
            </div>
            {v.items?.length>0&&(
              <div style={{marginTop:10,borderTop:`1px solid ${G.borde}22`,paddingTop:8}}>
                {v.items.map((item,idx)=>(
                  <div key={idx} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"2px 0",color:G.textoSec}}>
                    <span>{item.nombre} <span style={{color:G.texto,fontWeight:500}}>×{item.cantidad}</span></span>
                    <span style={{fontFamily:"DM Mono,monospace"}}>{fmt(item.precio*item.cantidad)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
        {filtrados.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin ventas en esta seleccion</div>}
      </div>

      {editandoV&&(
        <Modal title="Editar venta" onClose={()=>setEditandoV(null)}
          footer={<><Btn variant="secondary" onClick={()=>setEditandoV(null)}>Cancelar</Btn><Btn disabled={evLoading} onClick={guardarVenta}>{evLoading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cambios"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              {editandoV.fecha} · {fmt(editandoV.total)}
            </div>
            <Fi label="Cliente" value={evCliente} onChange={setEvCliente} placeholder="Nombre del cliente"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Vendedor"       value={evVendedor}  onChange={setEvVendedor}  options={(vendedores||[]).map(v=>v.nombre)}/>
              <Fi label="Metodo de pago" value={evMetodo}    onChange={setEvMetodo}    options={METODOS_PAGO}/>
            </div>
            <div style={{display:"flex",gap:20}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={evCobrado}   onChange={e=>setEvCobrado(e.target.checked)}/> Cobrado
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={evEntregado} onChange={e=>setEvEntregado(e.target.checked)}/> Entregado
              </label>
            </div>
          </div>
        </Modal>
      )}

      {confirmarElim&&(
        <Modal title="Eliminar venta" onClose={()=>setConfirmarElim(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElim(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElim.id);setConfirmarElim(null);}}>Si, eliminar</Btn></>}>
          <div style={{fontSize:14,lineHeight:1.6}}>
            <p>Vas a eliminar la venta de <strong>{confirmarElim.cliente_nombre}</strong> del {confirmarElim.fecha} por <strong>{fmt(confirmarElim.total)}</strong>.</p>
            <p style={{marginTop:8,color:G.rojo,fontSize:13}}>⚠ Esta accion no se puede deshacer.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: EGRESOS
// ============================================================
function ModuloEgresos({egresos,onRegistrar,onReembolsar,vendedores,proveedores,onEditar,onEliminar}){
  const [filtroT,setFT]=useState("Todos");
  const [filtroP,setFP]=useState("Todos");
  const [filtroF,setFF]=useState("");
  const [modal,setModal]=useState(false);
  const [modalEdit,setModalEdit]=useState(false);
  const [editandoEg,setEditandoEg]=useState(null);
  const [confirmarElimEg,setConfirmarElimEg]=useState(null);
  const [efConcepto,setEFC]=useState(""); const [efMonto,setEFM]=useState("");
  const [efTipo,setEFTipo]=useState(""); const [efMetodo,setEFMet]=useState("");
  const [efPagador,setEFPag]=useState(""); const [efNotas,setEFNotas]=useState("");
  const [eLoading,setELoad]=useState(false);

  function abrirEditarEgreso(e){
    setEditandoEg(e);setEFC(e.concepto);setEFM(String(e.monto));setEFTipo(e.tipo);
    setEFMet(e.metodo_pago);setEFPag(e.pagador);setEFNotas(e.notas||"");setModalEdit(true);
  }
  async function guardarEgreso(){
    if(!editandoEg)return; setELoad(true);
    await onEditar(editandoEg.id,{concepto:efConcepto,monto:parseFloat(efMonto)||0,tipo:efTipo,metodo_pago:efMetodo,pagador:efPagador,notas:efNotas,reembolso_pendiente:efPagador!=="Pensok"&&!editandoEg.reembolsado});
    setELoad(false);setModalEdit(false);
  }
  const [fConcepto,setFC]=useState(""); const [fTipo,setFTipo]=useState(TIPOS_EGRESO[0]);
  const [fMonto,setFM]=useState(""); const [fMetodo,setFMet]=useState(METODOS_PAGO[0]);
  const [fPagador,setFPag]=useState("Pensok"); const [fFecha,setFFecha]=useState(hoy());
  const [fProv,setFProv]=useState(""); const [fNotas,setFNotas]=useState("");
  const [loading,setLoading]=useState(false);

  const reembolso=fPagador!=="Pensok";
  const filtrados=useMemo(()=>egresos.filter(e=>{if(filtroT!=="Todos"&&e.tipo!==filtroT)return false;if(filtroP!=="Todos"&&e.pagador!==filtroP)return false;if(filtroF&&e.fecha!==filtroF)return false;return true;}),[egresos,filtroT,filtroP,filtroF]);
  const totalF=filtrados.reduce((s,e)=>s+(e.monto||0),0);
  const pendReem=egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado);
  const totalPend=pendReem.reduce((s,e)=>s+(e.monto||0),0);
  const totalMes=egresos.filter(e=>e.fecha?.startsWith(mesAct())).reduce((s,e)=>s+(e.monto||0),0);
  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  const deudasPers=nombresVend.map(v=>({persona:v,deuda:egresos.filter(e=>e.pagador===v&&e.reembolso_pendiente&&!e.reembolsado).reduce((s,e)=>s+(e.monto||0),0)})).filter(d=>d.deuda>0);
  const colorT={"Gasto fijo":"azul","Gasto variable":"gris","Compra a proveedor":"verde","Servicio":"violeta","Impuesto / Tasa":"naranja","Devolucion":"rojo"};

  async function guardar(){
    if(!fConcepto||!fMonto)return;
    setLoading(true);
    await onRegistrar({fecha:fFecha,concepto:fConcepto,tipo:fTipo,monto:parseFloat(fMonto),metodo_pago:fMetodo,pagador:fPagador,reembolso_pendiente:reembolso,reembolsado:false,proveedor:fProv,notas:fNotas});
    setLoading(false);setModal(false);
    setFC("");setFM("");setFNotas("");setFProv("");setFPag("Pensok");
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Total del mes"    value={fmt(totalMes)}   color={G.rojo}/>
        <MetricCard label="Seleccion"        value={fmt(totalF)}/>
        <MetricCard label="A reembolsar"     value={fmt(totalPend)}  color={G.amarillo} accent={totalPend>0?"#FFB80044":undefined}/>
        <MetricCard label="Registros"        value={fmtNum(filtrados.length)}/>
      </div>
      {deudasPers.length>0&&(
        <Card style={{border:`1px solid #FFB80033`,background:"#FFB80006"}}>
          <ST>💸 Reembolsos pendientes</ST>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {deudasPers.map(d=>(
              <div key={d.persona} style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:10,padding:"10px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><Avatar nombre={d.persona} size={28}/><span style={{fontWeight:600,fontSize:13}}>{d.persona}</span></div>
                <div style={{fontSize:18,fontWeight:700,color:G.amarillo,fontFamily:"'DM Mono',monospace"}}>{fmt(d.deuda)}</div>
                <div style={{fontSize:11,color:G.textoSec}}>Pensok le debe</div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <Fi value={filtroT} onChange={setFT} options={["Todos",...TIPOS_EGRESO]}  style={{flex:1,minWidth:150}}/>
          <Fi value={filtroP} onChange={setFP} options={["Todos","Pensok",...(vendedores||[]).map(v=>v.nombre)]}     style={{flex:1,minWidth:130}}/>
          <Fi value={filtroF} onChange={setFF} type="date"                          style={{flex:1,minWidth:130}}/>
          {filtroF&&<Btn small variant="ghost" onClick={()=>setFF("")}>Limpiar</Btn>}
          <Btn onClick={()=>setModal(true)}>+ Nuevo egreso</Btn>
        </div>
      </Card>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(e=>(
          <Card key={e.id} style={{padding:"12px 18px",border:e.reembolso_pendiente&&!e.reembolsado?`1px solid #FFB80033`:undefined}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <Avatar nombre={e.pagador} size={32}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{e.concepto}</div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{e.fecha} · {e.metodo_pago} · Pago: {e.pagador}{e.proveedor&&` · ${e.proveedor}`}</div>
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                    <Badge color={colorT[e.tipo]||"gris"}>{e.tipo}</Badge>
                    {e.reembolso_pendiente&&!e.reembolsado&&<Badge color="amarillo">⏳ Reembolso pendiente</Badge>}
                    {e.reembolsado&&<Badge color="verde">✓ Reembolsado</Badge>}
                    {e.notas&&<span style={{fontSize:11,color:G.textoSec,fontStyle:"italic"}}>{e.notas}</span>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <div style={{fontSize:18,fontWeight:700,color:G.rojo,fontFamily:"'DM Mono',monospace"}}>{fmt(e.monto)}</div>
                {e.reembolso_pendiente&&!e.reembolsado&&<Btn small variant="outline" onClick={()=>onReembolsar(e.id)}>Marcar reembolsado</Btn>}
                <div style={{display:"flex",gap:6}}>
                  <Btn small variant="ghost" onClick={()=>abrirEditarEgreso(e)}>Editar</Btn>
                  <Btn small variant="danger" onClick={()=>setConfirmarElimEg(e)}>Eliminar</Btn>
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filtrados.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin registros</div>}
      </div>
      {modalEdit&&editandoEg&&(
        <Modal title="Editar egreso" onClose={()=>setModalEdit(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModalEdit(false)}>Cancelar</Btn><Btn disabled={eLoading} onClick={guardarEgreso}>{eLoading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cambios"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Concepto" value={efConcepto} onChange={setEFC}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Tipo" value={efTipo} onChange={setEFTipo} options={TIPOS_EGRESO}/>
              <Fi label="Monto ($)" value={efMonto} onChange={setEFM} type="number"/>
              <Fi label="Metodo pago" value={efMetodo} onChange={setEFMet} options={METODOS_PAGO}/>
              <Fi label="Quien pago" value={efPagador} onChange={setEFPag} options={["Pensok",...(vendedores||[]).map(v=>v.nombre)]}/>
            </div>
            <Fi label="Notas" value={efNotas} onChange={setEFNotas} rows={2}/>
          </div>
        </Modal>
      )}

      {confirmarElimEg&&(
        <Modal title="Eliminar egreso" onClose={()=>setConfirmarElimEg(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElimEg(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElimEg.id);setConfirmarElimEg(null);}}>Si, eliminar</Btn></>}>
          <div style={{fontSize:14,lineHeight:1.6}}>
            <p>Vas a eliminar <strong>{confirmarElimEg.concepto}</strong> del {confirmarElimEg.fecha} por <strong>{fmt(confirmarElimEg.monto)}</strong>.</p>
            <p style={{marginTop:8,color:G.rojo,fontSize:13}}>⚠ Esta accion no se puede deshacer.</p>
          </div>
        </Modal>
      )}

      {modal&&(
        <Modal title="Registrar egreso" onClose={()=>setModal(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fConcepto||!fMonto||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar egreso"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Concepto" value={fConcepto} onChange={setFC} placeholder="Ej: Alquiler del local"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Tipo"        value={fTipo}    onChange={setFTipo}  options={TIPOS_EGRESO}/>
              <Fi label="Fecha"       value={fFecha}   onChange={setFFecha} type="date"/>
              <Fi label="Monto ($)"   value={fMonto}   onChange={setFM}     type="number" placeholder="0"/>
              <Fi label="Metodo pago" value={fMetodo}  onChange={setFMet}   options={METODOS_PAGO}/>
              <Fi label="Quien pago?" value={fPagador} onChange={setFPag}  options={["Pensok",...(vendedores||[]).map(v=>v.nombre)]}/>
              <Fi label="Proveedor"   value={fProv}    onChange={setFProv}  options={["",...(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)]}/>
            </div>
            {reembolso&&<div style={{background:"#FFB80011",border:`1px solid #FFB80033`,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.amarillo}}>⚡ <strong>{fPagador}</strong> adelanto este gasto. Quedara como reembolso pendiente.</div>}
            <Fi label="Notas" value={fNotas} onChange={setFNotas} rows={2} placeholder="Observaciones..."/>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: CLIENTES
// ============================================================
function ModuloClientes({clientes,onGuardar,ventas}){
  const [busqueda,setBusq]=useState("");
  const [filtroT,setFT]=useState("Todos");
  const [selecId,setSelecId]=useState(null);
  const [modal,setModal]=useState(false);
  const [editando,setEditando]=useState(null);
  const [fNombre,setFN]=useState(""); const [fTipo,setFTipo]=useState("minorista");
  const [fTel,setFTel]=useState(""); const [fEmail,setFEmail]=useState("");
  const [fDir,setFDir]=useState(""); const [fLimite,setFLim]=useState("0");
  const [fNotas,setFNotas]=useState(""); const [loading,setLoading]=useState(false);

  function abrirNuevo(){setEditando(null);setFN("");setFTipo("minorista");setFTel("");setFEmail("");setFDir("");setFLim("0");setFNotas("");setModal(true);}
  function abrirEditar(c){setEditando(c);setFN(c.nombre);setFTipo(c.tipo);setFTel(c.telefono||"");setFEmail(c.email||"");setFDir(c.direccion||"");setFLim(String(c.limite_cuenta||0));setFNotas(c.notas||"");setModal(true);}

  async function guardar(){
    if(!fNombre)return;setLoading(true);
    const datos={nombre:fNombre,tipo:fTipo,telefono:fTel,email:fEmail,direccion:fDir,limite_cuenta:parseFloat(fLimite)||0,notas:fNotas};
    await onGuardar(datos,editando?.id||null);
    setLoading(false);setModal(false);
  }

  const filtrados=useMemo(()=>clientes.filter(c=>{if(filtroT!=="Todos"&&c.tipo!==filtroT)return false;if(busqueda){const q=busqueda.toLowerCase();if(!c.nombre.toLowerCase().includes(q)&&!(c.telefono||"").includes(q))return false;}return c.activo;}),[clientes,filtroT,busqueda]);
  const clienteSelec=selecId?clientes.find(c=>c.id===selecId):null;
  const ventasCli=selecId?ventas.filter(v=>v.cliente_id===selecId):[];
  const totalComprado=ventasCli.reduce((s,v)=>s+(v.total||0),0);
  const sinCobrarCli=ventasCli.filter(v=>!v.cobrado).reduce((s,v)=>s+(v.total||0),0);
  const colorT={minorista:"gris",especial:"amarillo",mayorista:"azul"};

  return(
    <div style={{display:"flex",gap:16,alignItems:"start"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          <MetricCard label="Total clientes"  value={fmtNum(clientes.filter(c=>c.activo).length)}/>
          <MetricCard label="Con cuenta cte." value={fmtNum(clientes.filter(c=>(c.cuenta_corriente||0)<0).length)} color={G.amarillo}/>
          <MetricCard label="Saldo adeudado"  value={fmt(Math.abs(clientes.reduce((s,c)=>s+Math.min(0,c.cuenta_corriente||0),0)))} color={G.rojo}/>
        </div>
        <Card style={{padding:"12px 18px"}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:1,minWidth:180}}><input value={busqueda} onChange={e=>setBusq(e.target.value)} placeholder="Buscar cliente..." style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/></div>
            <Fi value={filtroT} onChange={setFT} options={["Todos","minorista","especial","mayorista"]} style={{width:140}}/>
            <Btn onClick={abrirNuevo}>+ Nuevo cliente</Btn>
          </div>
        </Card>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtrados.map(c=>{
            const vCli=ventas.filter(v=>v.cliente_id===c.id);
            const tCli=vCli.reduce((s,v)=>s+(v.total||0),0);
            const selec=selecId===c.id;
            return(
              <div key={c.id} onClick={()=>setSelecId(selec?null:c.id)} style={{background:selec?G.sup2:G.sup,border:`1px solid ${selec?G.verde+"55":G.borde}`,borderRadius:12,padding:"12px 18px",cursor:"pointer",transition:"all .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <Avatar nombre={c.nombre} size={38} color={c.tipo==="mayorista"?G.azul:c.tipo==="especial"?G.amarillo:G.textoSec}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{c.nombre}</div>
                      <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{c.telefono&&<span>{c.telefono} · </span>}{vCli.length} compras · {fmt(tCli)}</div>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        <Badge color={colorT[c.tipo]}>{c.tipo}</Badge>
                        {(c.cuenta_corriente||0)<0&&<Badge color="rojo">Debe {fmt(Math.abs(c.cuenta_corriente||0))}</Badge>}
                        {(c.limite_cuenta||0)>0&&<Badge color="gris">Limite {fmt(c.limite_cuenta)}</Badge>}
                      </div>
                    </div>
                  </div>
                  <Btn small variant="ghost" onClick={e=>{e.stopPropagation();abrirEditar(c);}}>Editar</Btn>
                </div>
              </div>
            );
          })}
          {filtrados.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin clientes</div>}
        </div>
      </div>
      {clienteSelec&&(
        <div style={{width:290,flexShrink:0,position:"sticky",top:60}}>
          <Card>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,marginBottom:14}}>
              <Avatar nombre={clienteSelec.nombre} size={52} color={clienteSelec.tipo==="mayorista"?G.azul:clienteSelec.tipo==="especial"?G.amarillo:G.textoSec}/>
              <div style={{textAlign:"center"}}><div style={{fontWeight:600,fontSize:15}}>{clienteSelec.nombre}</div><Badge color={colorT[clienteSelec.tipo]}>{clienteSelec.tipo}</Badge></div>
            </div>
            <Div/>
            <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:13}}>
              {clienteSelec.telefono&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Telefono</span><span>{clienteSelec.telefono}</span></div>}
              {clienteSelec.email&&<div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Email</span><span style={{fontSize:12}}>{clienteSelec.email}</span></div>}
              {clienteSelec.direccion&&<div style={{display:"flex",justifyContent:"space-between",gap:8}}><span style={{color:G.textoSec,flexShrink:0}}>Direccion</span><span style={{textAlign:"right",fontSize:12}}>{clienteSelec.direccion}</span></div>}
            </div>
            <Div/>
            <ST>Cuenta corriente</ST>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
              <div style={{background:G.sup2,borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Saldo</div><div style={{fontSize:16,fontWeight:700,color:(clienteSelec.cuenta_corriente||0)<0?G.rojo:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(clienteSelec.cuenta_corriente||0)}</div></div>
              <div style={{background:G.sup2,borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Limite</div><div style={{fontSize:16,fontWeight:700,color:G.textoSec,fontFamily:"'DM Mono',monospace"}}>{(clienteSelec.limite_cuenta||0)>0?fmt(clienteSelec.limite_cuenta):"—"}</div></div>
            </div>
            <Div/>
            <ST>Historial</ST>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:8}}><span style={{color:G.textoSec}}>Total comprado</span><span style={{fontFamily:"'DM Mono',monospace",color:G.verde,fontWeight:600}}>{fmt(totalComprado)}</span></div>
            {sinCobrarCli>0&&<div style={{background:"#FF4D6A11",border:`1px solid #FF4D6A33`,borderRadius:8,padding:"8px 12px",fontSize:12,color:G.rojo,marginBottom:8}}>Sin cobrar: {fmt(sinCobrarCli)}</div>}
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
              {ventasCli.slice(0,10).map(v=>(
                <div key={v.id} style={{fontSize:12,display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${G.borde}22`}}>
                  <span style={{color:G.textoSec}}>{v.fecha}</span>
                  <span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(v.total)}</span>
                  {!v.cobrado&&<Badge color="rojo" small>Pendiente</Badge>}
                </div>
              ))}
              {ventasCli.length===0&&<div style={{color:G.textoSec,fontSize:12}}>Sin compras</div>}
            </div>
            {clienteSelec.notas&&<><Div/><div style={{fontSize:12,color:G.textoSec,fontStyle:"italic"}}>{clienteSelec.notas}</div></>}
          </Card>
        </div>
      )}
      {modal&&(
        <Modal title={editando?"Editar cliente":"Nuevo cliente"} onClose={()=>setModal(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fNombre||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cliente"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Nombre / razon social" value={fNombre} onChange={setFN} placeholder="Ej: Club Nautico Pilar"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Tipo de precio"  value={fTipo}  onChange={setFTipo}  options={["minorista","especial","mayorista"]}/>
              <Fi label="Telefono"        value={fTel}   onChange={setFTel}   placeholder="0230-444-0000"/>
              <Fi label="Email"           value={fEmail} onChange={setFEmail} type="email" placeholder="contacto@empresa.com"/>
              <Fi label="Limite cta. cte." value={fLimite} onChange={setFLim} type="number" placeholder="0"/>
            </div>
            <Fi label="Direccion" value={fDir}   onChange={setFDir}   placeholder="Calle y numero, localidad"/>
            <Fi label="Notas"     value={fNotas} onChange={setFNotas} rows={2} placeholder="Ej: pago a 30 dias..."/>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: PRODUCTOS
// ============================================================
function ModuloProductos({productos,onGuardar,proveedores}){
  const [busqueda,  setB]       = useState("");
  const [filtroC,   setFC]      = useState("Todas");
  const [filtroE,   setFE]      = useState("Todos");
  const [filtroProv,setFPr]     = useState("Todos");
  const [filtroMarca,setFMarca] = useState("Todas");
  const [sortCol,   setSortCol] = useState("nombre");
  const [sortDir,   setSortDir] = useState("asc");
  const [modal,setModal]=useState(false); const [editando,setEditando]=useState(null);
  const [fCodigo,setFK]=useState(""); const [fNombre,setFN]=useState(""); const [fCat,setFCat]=useState(CATEGORIAS[0]);
  const [fMoneda,setFMon]=useState("ARS"); const [fCosto,setFCosto]=useState("");
  const [fGanMin,setFGanMin]=useState(""); const [fGanMay,setFGanMay]=useState("");
  const [fStock,setFStock]=useState(""); const [fStockMin,setFStockMin]=useState("");
  const [fProv,setFProv]=useState("");
  const [fIva,setFIva]=useState("21"); const [fDescProv,setFDescProv]=useState("0");
  const [loading,setLoading]=useState(false);

  // Calcular precios en tiempo real
  const costo   = parseFloat(fCosto)||0;
  const ganMin  = parseFloat(fGanMin)||0;
  const ganMay  = parseFloat(fGanMay)||0;
  const precioMin = costo>0&&ganMin>0 ? Math.round(costo*(1+ganMin/100)) : 0;
  const precioEsp = precioMin>0 ? Math.round(precioMin*0.95) : 0;
  const precioMay = costo>0&&ganMay>0 ? Math.round(costo*(1+ganMay/100)) : 0;

  function abrirEditar(p){
    setEditando(p);setFK(p.codigo);setFN(p.nombre);setFCat(p.categoria||CATEGORIAS[0]);setFMon(p.moneda||"ARS");
    setFCosto(String(p.costo||""));
    const gMin = p.costo>0&&p.precio_min>0 ? Math.round((p.precio_min/p.costo-1)*100) : (p.ganancia_min||0);
    const gMay = p.costo>0&&p.precio_may>0 ? Math.round((p.precio_may/p.costo-1)*100) : (p.ganancia_may||0);
    setFGanMin(String(gMin));setFGanMay(String(gMay));
    setFStock(String(p.stock||0));setFStockMin(String(p.stock_min||0));
    setFProv(p.proveedor||"");
    setFIva(String(p.iva_pct||21));
    setFDescProv(String(p.descuento_proveedor||0));
    setModal(true);
  }
  function abrirNuevo(){
    setEditando(null);setFK("");setFN("");setFCat(CATEGORIAS[0]);setFMon("ARS");
    setFCosto("");setFGanMin("");setFGanMay("");setFStock("");setFStockMin("");
    setFProv("");setFIva("21");setFDescProv("0");setModal(true);
  }

  async function guardar(){
    if(!fCodigo||!fNombre||!fCosto||!fGanMin||!fGanMay)return;
    setLoading(true);
    const datos={
      codigo:fCodigo, nombre:fNombre, categoria:fCat, moneda:fMoneda,
      costo:costo, ganancia_min:ganMin, ganancia_may:ganMay,
      precio_min:precioMin, precio_esp:precioEsp, precio_may:precioMay,
      stock:parseInt(fStock)||0, stock_min:parseInt(fStockMin)||0,
      proveedor:fProv, activo:true,
      iva_pct:parseFloat(fIva)||21,
      descuento_proveedor:parseFloat(fDescProv)||0
    };
    await onGuardar(datos,editando?.id||null);
    setLoading(false);setModal(false);
  }

  const alertas=productos
    .filter(p=>p.activo && estadoStock(p)!=="ok" && (p.stock_min||0)>0)
    .sort((a,b)=>{
      // Agotados primero, luego bajo stock
      const ea=estadoStock(a)==="agotado"?0:1;
      const eb=estadoStock(b)==="agotado"?0:1;
      if(ea!==eb)return ea-eb;
      return (a.proveedor||"").localeCompare(b.proveedor||"");
    });
  const valorStock=productos.reduce((s,p)=>s+precioARS(p.costo,p.moneda)*p.stock,0);
  const marcasUnicas=useMemo(()=>["Todas",...new Set(productos.map(p=>p.marca||"").filter(Boolean)).values()].sort(),[productos]);
  const provsUnicos =useMemo(()=>["Todos",...new Set(productos.map(p=>p.proveedor||"").filter(Boolean)).values()].sort(),[productos]);

  const filtrados=useMemo(()=>{
    let list=productos.filter(p=>{
      if(!p.activo&&filtroE!=="Inactivos")return false;
      if(filtroC!=="Todas"&&p.categoria!==filtroC)return false;
      if(filtroE==="Bajo stock"&&estadoStock(p)!=="bajo")return false;
      if(filtroE==="Agotados"&&estadoStock(p)!=="agotado")return false;
      if(filtroE==="Inactivos"&&p.activo)return false;
      if(filtroProv!=="Todos"&&(p.proveedor||"")!==filtroProv)return false;
      if(filtroMarca!=="Todas"&&(p.marca||"")!==filtroMarca)return false;
      if(busqueda){
        const q=busqueda.toLowerCase();
        if(!p.nombre.toLowerCase().includes(q)&&!p.codigo.toLowerCase().includes(q)&&!(p.marca||"").toLowerCase().includes(q)&&!(p.proveedor||"").toLowerCase().includes(q))return false;
      }
      return true;
    });
    // Ordenamiento
    list=[...list].sort((a,b)=>{
      let va=a[sortCol]??""
      let vb=b[sortCol]??""
      if(sortCol==="stock"||sortCol==="precio_min"||sortCol==="precio_may"||sortCol==="costo"||sortCol==="vendidos"){
        va=parseFloat(va)||0; vb=parseFloat(vb)||0;
        return sortDir==="asc"?va-vb:vb-va;
      }
      return sortDir==="asc"?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
    return list;
  },[productos,busqueda,filtroC,filtroE,filtroProv,filtroMarca,sortCol,sortDir]);

  function toggleSort(col){
    if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc");
    else{setSortCol(col);setSortDir("asc");}
  }
  function SortIcon({col}){
    if(sortCol!==col)return <span style={{color:G.borde,marginLeft:4}}>⇅</span>;
    return <span style={{color:G.verde,marginLeft:4}}>{sortDir==="asc"?"↑":"↓"}</span>;
  }
  const colorE={ok:"verde",bajo:"amarillo",agotado:"rojo"};const labelE={ok:"OK",bajo:"Bajo stock",agotado:"Agotado"};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Activos"     value={fmtNum(productos.filter(p=>p.activo).length)}/>
        <MetricCard label="Valor stock" value={fmt(valorStock)} color={G.azul} sub="a costo"/>
        <MetricCard label="Bajo stock"  value={fmtNum(alertas.filter(p=>estadoStock(p)==="bajo").length)}    color={G.amarillo}/>
        <MetricCard label="Agotados"    value={fmtNum(alertas.filter(p=>estadoStock(p)==="agotado").length)} color={G.rojo}/>
      </div>
      {alertas.length>0&&<PanelReposicion alertas={alertas}/>}
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <div style={{flex:"2 1 200px"}}><input value={busqueda} onChange={e=>setB(e.target.value)} placeholder="Buscar por nombre, codigo, marca, proveedor..." style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/></div>
          <Fi value={filtroC}    onChange={setFC}     options={["Todas",...CATEGORIAS]}                   style={{flex:"1 1 120px"}}/>
          <Fi value={filtroProv} onChange={setFPr}    options={provsUnicos}                               style={{flex:"1 1 140px"}}/>
          <Fi value={filtroMarca} onChange={setFMarca} options={marcasUnicas}                             style={{flex:"1 1 120px"}}/>
          <Fi value={filtroE}    onChange={setFE}     options={["Todos","Bajo stock","Agotados","Inactivos"]} style={{flex:"1 1 120px"}}/>
          <Btn onClick={abrirNuevo}>+ Nuevo producto</Btn>
        </div>
        <div style={{marginTop:8,fontSize:11,color:G.textoSec}}>{filtrados.length} productos · Hacer clic en encabezado de columna para ordenar</div>
      </Card>
      <div style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${G.borde}`,background:G.sup2}}>
                {[
                  {label:"Codigo",   col:"codigo"},
                  {label:"Producto", col:"nombre"},
                  {label:"Grupo",    col:"categoria"},
                  {label:"Marca",    col:"marca"},
                  {label:"Proveedor",col:"proveedor"},
                  {label:"Stock",    col:"stock"},
                  {label:"Costo",    col:"costo"},
                  {label:"Minorista",col:"precio_min"},
                  {label:"Especial", col:"precio_esp"},
                  {label:"Mayorista",col:"precio_may"},
                  {label:"Vendidos", col:"vendidos"},
                  {label:"Estado",   col:"estado"},
                  {label:"",         col:null},
                ].map(({label,col})=>(
                  <th key={label} onClick={col?()=>toggleSort(col):undefined}
                    style={{padding:"10px 12px",textAlign:"left",color:sortCol===col?G.verde:G.textoSec,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:0.5,whiteSpace:"nowrap",cursor:col?"pointer":"default",userSelect:"none"}}>
                    {label}{col&&<SortIcon col={col}/>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p,i)=>{
                const e=estadoStock(p);const pF=v=>p.moneda==="USD"?fmtUSD(v):fmt(v);
                return(
                  <tr key={p.id} style={{borderBottom:`1px solid ${G.borde}22`,background:i%2===0?"transparent":G.sup2+"44"}}>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",fontSize:10,color:G.textoSec,whiteSpace:"nowrap"}}>{p.codigo}</td>
                    <td style={{padding:"9px 12px",fontWeight:500,maxWidth:220}}>{p.nombre}{p.moneda==="USD"&&<Badge color="usd" small> USD</Badge>}</td>
                    <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><Badge color="gris">{p.categoria}</Badge></td>
                    <td style={{padding:"9px 12px",color:G.textoSec,whiteSpace:"nowrap",fontSize:11}}>{p.marca||"—"}</td>
                    <td style={{padding:"9px 12px",color:G.textoSec,whiteSpace:"nowrap",fontSize:11}}>{p.proveedor||"—"}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",fontWeight:600,whiteSpace:"nowrap",color:e==="agotado"?G.rojo:e==="bajo"?G.amarillo:G.texto}}>{p.stock}<span style={{color:G.textoSec,fontWeight:400,fontSize:10}}> /{p.stock_min}</span></td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.costo)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",fontWeight:600}}>{pF(p.precio_min)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.precio_esp)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.precio_may)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.verde,whiteSpace:"nowrap"}}>{fmtNum(p.vendidos)}</td>
                    <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><Badge color={colorE[e]}>{labelE[e]}</Badge></td>
                    <td style={{padding:"9px 12px"}}><Btn small variant="ghost" onClick={()=>abrirEditar(p)}>Editar</Btn></td>
                  </tr>
                );
              })}
              {filtrados.length===0&&<tr><td colSpan={13} style={{padding:"32px",textAlign:"center",color:G.textoSec}}>Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modal&&(
        <Modal title={editando?"Editar producto":"Nuevo producto"} onClose={()=>setModal(false)} maxWidth={520}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fCodigo||!fNombre||!fCosto||!fGanMin||!fGanMay||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar producto"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Identificacion */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Codigo"    value={fCodigo} onChange={setFK}   placeholder="PIL001"/>
              <Fi label="Categoria" value={fCat}    onChange={setFCat} options={CATEGORIAS}/>
            </div>
            <Fi label="Nombre del producto" value={fNombre} onChange={setFN} placeholder="Ej: Cloro liquido 5L"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Proveedor" value={fProv}   onChange={setFProv} options={(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)}/>
              <Fi label="Moneda"    value={fMoneda}  onChange={setFMon} options={["ARS","USD"]}/>
            </div>
            <Div/>
            {/* Costo y margenes */}
            <ST>Costo y margenes</ST>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <Fi label={`Costo (${fMoneda})`}      value={fCosto}   onChange={setFCosto}   type="number" placeholder="0"/>
              <Fi label="Margen minorista (%)"       value={fGanMin}  onChange={setFGanMin}  type="number" placeholder="Ej: 100"/>
              <Fi label="Margen mayorista (%)"       value={fGanMay}  onChange={setFGanMay}  type="number" placeholder="Ej: 40"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <Fi label="IVA (%)"                   value={fIva}     onChange={setFIva}     type="number" placeholder="21" options={["21","10.5","0"]}/>
              <Fi label="Descuento proveedor (%)"   value={fDescProv} onChange={setFDescProv} type="number" placeholder="0"/>
              <div style={{display:"flex",flexDirection:"column",gap:5,justifyContent:"flex-end"}}>
                {fCosto&&fDescProv&&parseFloat(fDescProv)>0&&(
                  <div style={{fontSize:11,color:G.textoSec,background:G.sup2,borderRadius:6,padding:"6px 10px"}}>
                    Costo c/desc: <strong style={{color:G.verde}}>{fmt(parseFloat(fCosto)*(1-parseFloat(fDescProv)/100))}</strong>
                  </div>
                )}
              </div>
            </div>
            {/* Preview precios calculados */}
            {costo>0&&ganMin>0&&ganMay>0&&(
              <div style={{background:G.sup2,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:11,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Precios calculados</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                  <div style={{background:G.fondo,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:G.textoSec,marginBottom:4}}>MINORISTA</div>
                    <div style={{fontSize:16,fontWeight:700,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(precioMin)}</div>
                    <div style={{fontSize:10,color:G.textoSec,marginTop:2}}>+{ganMin}% sobre costo</div>
                  </div>
                  <div style={{background:G.fondo,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:G.textoSec,marginBottom:4}}>ESPECIAL (−5%)</div>
                    <div style={{fontSize:16,fontWeight:700,color:G.amarillo,fontFamily:"'DM Mono',monospace"}}>{fmt(precioEsp)}</div>
                    <div style={{fontSize:10,color:G.textoSec,marginTop:2}}>automatico</div>
                  </div>
                  <div style={{background:G.fondo,borderRadius:8,padding:"10px 12px"}}>
                    <div style={{fontSize:10,color:G.textoSec,marginBottom:4}}>MAYORISTA</div>
                    <div style={{fontSize:16,fontWeight:700,color:G.azul,fontFamily:"'DM Mono',monospace"}}>{fmt(precioMay)}</div>
                    <div style={{fontSize:10,color:G.textoSec,marginTop:2}}>+{ganMay}% sobre costo</div>
                  </div>
                </div>
              </div>
            )}
            <Div/>
            {/* Stock */}
            <ST>Stock</ST>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Stock actual" value={fStock}    onChange={setFStock}    type="number" min="0" placeholder="0"/>
              <Fi label="Stock minimo" value={fStockMin} onChange={setFStockMin} type="number" min="0" placeholder="0"/>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: ABASTECIMIENTO
// ============================================================
function ModuloAbastecimiento({productos,abastecimiento,onRegistrar,vendedores,proveedores,onEditar,onEliminar}){
  const [vista,setV]=useState("historial");
  const [prodBusq,setPB]=useState(""); const [prodSelec,setPS]=useState(null);
  const [cantidad,setCant]=useState(""); const [costoUnit,setCU]=useState("");
  const [proveedor,setProv]=useState(""); const [metodo,setMet]=useState(METODOS_PAGO[0]);
  const [resp,setResp]=useState(""); const [notas,setNotas]=useState("");
  const [loading,setLoading]=useState(false); const [ok,setOk]=useState(false);
  const [editando,setEditando]=useState(null);
  const [eQty,setEQty]=useState(""); const [eCosto,setECosto]=useState("");
  const [eProv,setEProv]=useState(""); const [eMetodo,setEMetodo]=useState(METODOS_PAGO[0]);
  const [eResp,setEResp]=useState(""); const [eNotas,setENotas]=useState("");
  const [eLoading,setELoading]=useState(false);
  const [confirmarElim,setConfirmarElim]=useState(null);

  function abrirEditar(a){
    setEditando(a);setEQty(String(a.cantidad));setECosto(String(a.costo_unit));
    setEProv(a.proveedor||"");setEMetodo(a.metodo_pago||METODOS_PAGO[0]);
    setEResp(a.responsable||"");setENotas(a.notas||"");
  }
  async function guardarEdicion(){
    if(!editando)return; setELoading(true);
    const datos={cantidad:parseInt(eQty)||0,costo_unit:parseFloat(eCosto)||0,proveedor:eProv,metodo_pago:eMetodo,responsable:eResp,notas:eNotas};
    await onEditar(editando.id,datos,editando.cantidad,parseInt(eQty)||0,editando.producto_id);
    setELoading(false);setEditando(null);
  }

  const prodFilt=useMemo(()=>{if(!prodBusq)return[];const q=prodBusq.toLowerCase();return productos.filter(p=>p.activo&&(p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q)));},[prodBusq,productos]);
  const total=(parseFloat(cantidad)||0)*(parseFloat(costoUnit)||0);
  const valido=prodSelec&&cantidad&&costoUnit;

  async function registrar(){
    if(!valido)return;setLoading(true);
    await onRegistrar({fecha:hoy(),producto_id:prodSelec.id,nombre:prodSelec.nombre,cantidad:parseInt(cantidad),costo_unit:parseFloat(costoUnit),proveedor,metodo_pago:metodo,responsable:resp,notas});
    setLoading(false);setOk(true);
    setTimeout(()=>{setPS(null);setPB("");setCant("");setCU("");setNotas("");setOk(false);setV("historial");},2000);
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>Ingreso registrado</div></div>);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Ingresos totales" value={fmtNum(abastecimiento.length)}/>
        <MetricCard label="Total invertido"  value={fmt(abastecimiento.reduce((s,a)=>s+(a.cantidad||0)*(a.costo_unit||0),0))} color={G.naranja}/>
        <MetricCard label="Ultimo ingreso"   value={abastecimiento[0]?.fecha||"—"} sub={abastecimiento[0]?.nombre||""}/>
      </div>
      <div style={{display:"flex",gap:8}}>
        <Btn variant={vista==="historial"?"primary":"secondary"} onClick={()=>setV("historial")}>Historial</Btn>
        <Btn variant={vista==="nuevo"?"primary":"secondary"}     onClick={()=>setV("nuevo")}>+ Registrar ingreso</Btn>
      </div>
      {vista==="nuevo"&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:16,alignItems:"start"}}>
          <Card>
            <ST>Producto</ST>
            <div style={{position:"relative"}}>
              <input value={prodSelec?prodSelec.nombre:prodBusq} onChange={e=>{setPS(null);setPB(e.target.value);}} placeholder="Buscar producto..."
                style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"9px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
              {!prodSelec&&prodFilt.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,marginTop:4,zIndex:10,maxHeight:200,overflowY:"auto"}}>
                  {prodFilt.map(p=>(
                    <div key={p.id} onClick={()=>{setPS(p);setPB("");setCU(String(p.costo));setProv(p.proveedor||"");}} style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${G.borde}22`}} onMouseEnter={e=>e.currentTarget.style.background=G.borde} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{fontSize:13,fontWeight:500}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:G.textoSec}}>Stock: {p.stock} · Ultimo costo: {p.moneda==="USD"?fmtUSD(p.costo):fmt(p.costo)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {prodSelec&&<div style={{marginTop:10,background:G.sup2,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontWeight:500,fontSize:13}}>{prodSelec.nombre}</div><div style={{fontSize:11,color:G.textoSec,marginTop:2}}>Stock actual: <strong style={{color:estadoStock(prodSelec)==="agotado"?G.rojo:estadoStock(prodSelec)==="bajo"?G.amarillo:G.texto}}>{prodSelec.stock}</strong></div></div><Btn small variant="ghost" onClick={()=>{setPS(null);setPB("");}}>✕</Btn></div>}
            <Div/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Cantidad"   value={cantidad}  onChange={setCant} type="number" min="1" placeholder="0"/>
              <Fi label={`Costo unit. (${prodSelec?.moneda||"ARS"})`} value={costoUnit} onChange={setCU} type="number" placeholder="0"/>
              <Fi label="Proveedor"  value={proveedor} onChange={setProv} options={(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)}/>
              <Fi label="Metodo pago" value={metodo}   onChange={setMet} options={METODOS_PAGO}/>
              <Fi label="Responsable" value={resp}     onChange={setResp} options={(vendedores||[]).map(v=>v.nombre)}/>
            </div>
            <div style={{marginTop:12}}><Fi label="Notas" value={notas} onChange={setNotas} placeholder="Ej: descuento por volumen"/></div>
          </Card>
          <Card>
            <ST>Resumen</ST>
            <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:13}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Producto</span><span style={{fontWeight:500,textAlign:"right",maxWidth:140,wordBreak:"break-word"}}>{prodSelec?.nombre||"—"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Cantidad</span><span style={{fontFamily:"'DM Mono',monospace"}}>{cantidad||0} u.</span></div>
              {prodSelec&&cantidad&&costoUnit&&<><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Nuevo stock</span><span style={{color:G.verde,fontFamily:"'DM Mono',monospace"}}>{prodSelec.stock+parseInt(cantidad||0)} u.</span></div><Div/><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}><span style={{fontWeight:600}}>Total a pagar</span><span style={{fontSize:20,fontWeight:700,color:G.naranja,fontFamily:"'DM Mono',monospace"}}>{fmt(total)}</span></div>{parseFloat(costoUnit)!==prodSelec.costo&&<div style={{background:"#FFB80011",border:`1px solid #FFB80033`,borderRadius:8,padding:"8px 12px",fontSize:12,color:G.amarillo}}>⚡ Costo actualizado de {fmt(prodSelec.costo)} a {fmt(parseFloat(costoUnit))}</div>}</>}
            </div>
            <Btn full disabled={!valido||loading} onClick={registrar} style={{marginTop:16,padding:"11px 0",fontSize:14}}>
              {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"Registrar ingreso →"}
            </Btn>
          </Card>
        </div>
      )}
      {vista==="historial"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {abastecimiento.map(a=>(
            <Card key={a.id} style={{padding:"12px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14}}>{a.nombre}</div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{a.fecha} · {a.proveedor} · {a.metodo_pago} · {a.responsable}</div>
                  {a.notas&&<div style={{fontSize:11,color:G.textoSec,marginTop:2,fontStyle:"italic"}}>{a.notas}</div>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:17,fontWeight:700,color:G.naranja,fontFamily:"'DM Mono',monospace"}}>{fmt((a.cantidad||0)*(a.costo_unit||0))}</div>
                    <div style={{fontSize:11,color:G.textoSec}}>{fmtNum(a.cantidad)} u. × {fmt(a.costo_unit)}</div>
                  </div>
                  <Btn small variant="ghost" onClick={()=>abrirEditar(a)}>Editar</Btn>
                  <Btn small variant="danger" onClick={()=>setConfirmarElim(a)}>Eliminar</Btn>
                </div>
              </div>
            </Card>
          ))}
          {abastecimiento.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin registros</div>}
        </div>
      )}

      {/* Modal editar abastecimiento */}
      {editando&&(
        <Modal title="Editar ingreso de mercaderia" onClose={()=>setEditando(null)}
          footer={<><Btn variant="secondary" onClick={()=>setEditando(null)}>Cancelar</Btn><Btn disabled={eLoading} onClick={guardarEdicion}>{eLoading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cambios"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:13,fontWeight:500}}>{editando.nombre}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Cantidad" value={eQty} onChange={setEQty} type="number" min="0"/>
              <Fi label="Costo unitario" value={eCosto} onChange={setECosto} type="number"/>
              <Fi label="Proveedor" value={eProv} onChange={setEProv} options={(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)}/>
              <Fi label="Metodo de pago" value={eMetodo} onChange={setEMetodo} options={METODOS_PAGO}/>
              <Fi label="Responsable" value={eResp} onChange={setEResp} options={(vendedores||[]).map(v=>v.nombre)}/>
            </div>
            <Fi label="Notas" value={eNotas} onChange={setENotas} rows={2}/>
          </div>
        </Modal>
      )}

      {/* Modal confirmar eliminacion */}
      {confirmarElim&&(
        <Modal title="Eliminar ingreso" onClose={()=>setConfirmarElim(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElim(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElim.id,confirmarElim.cantidad,confirmarElim.producto_id);setConfirmarElim(null);}}>Si, eliminar</Btn></>}>
          <div style={{fontSize:14,lineHeight:1.6}}>
            <p>Estas por eliminar el ingreso de <strong>{confirmarElim.nombre}</strong> ({fmtNum(confirmarElim.cantidad)} u. del {confirmarElim.fecha}).</p>
            <p style={{marginTop:8,color:G.amarillo,fontSize:13}}>⚠ Esto va a restar {confirmarElim.cantidad} unidades del stock del producto.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// APP PRINCIPAL
// ============================================================
export default function App(){
  const [session,  setSession]  = useState(null);
  const [checking, setChecking] = useState(true);
  const [modulo,   setModulo]   = useState("analisis");
  const toast = useToast();

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setChecking(false);});
    supabase.auth.onAuthStateChange((_,session)=>setSession(session));
  },[]);

  const data = useData(toast);

  async function handleLogout(){
    await supabase.auth.signOut();
    setSession(null);
  }

  if(checking) return(
    <div style={{minHeight:"100vh",background:G.fondo,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
      <Spinner/><span style={{color:G.textoSec}}>Verificando sesion...</span>
    </div>
  );

  if(!session) return <PantallaLogin onLogin={()=>supabase.auth.getSession().then(({data:{session}})=>setSession(session))}/>;

  const alertasStock    = data.productos.filter(p=>p.activo&&estadoStock(p)!=="ok").length;
  const pendientesCobro = data.ventasConItems.filter(v=>!v.cobrado).length;
  const reembolsosPend  = data.egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado).length;

  const tabs=[
    {id:"analisis",       label:"Dashboard"},
    {id:"venta",          label:"Nueva venta",    alerta:0},
    {id:"ingresos",       label:"Ingresos",       alerta:pendientesCobro},
    {id:"egresos",        label:"Egresos",        alerta:reembolsosPend},
    {id:"clientes",       label:"Clientes",       alerta:0},
    {id:"productos",      label:"Productos",      alerta:alertasStock},
    {id:"abastecimiento", label:"Abastecimiento", alerta:0},
    {id:"configuracion",  label:"Configuracion",  alerta:0},
  ];

  return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:G.fondo}}>
        <div style={{background:G.sup,borderBottom:`1px solid ${G.borde}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:50,position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:24,height:24,background:G.verde,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#000"}}>P</span>
            </div>
            <span style={{fontWeight:600,fontSize:14,letterSpacing:-0.3}}>Pensok</span>
            <span style={{color:G.textoSec,fontSize:12}}>gestion</span>
          </div>
          <nav style={{display:"flex",gap:1}}>
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setModulo(t.id)}
                style={{background:modulo===t.id?G.verde:"transparent",color:modulo===t.id?"#000":G.textoSec,border:"none",borderRadius:7,padding:"5px 11px",fontSize:12,fontWeight:modulo===t.id?600:400,cursor:"pointer",position:"relative",transition:"all .15s"}}>
                {t.label}
                {t.alerta>0&&<span style={{position:"absolute",top:2,right:2,minWidth:14,height:14,background:modulo===t.id?"#00000055":G.rojo,borderRadius:7,fontSize:9,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{t.alerta}</span>}
              </button>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {data.loading&&<Spinner/>}
            <div style={{fontSize:11,color:G.textoSec}}>{session.user.email}</div>
            <Btn small variant="ghost" onClick={handleLogout}>Salir</Btn>
          </div>
        </div>

        <div style={{padding:"20px 22px",maxWidth:1200,margin:"0 auto"}}>
          {data.loading&&modulo!=="venta"
            ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,gap:12}}><Spinner/><span style={{color:G.textoSec}}>Cargando datos...</span></div>
            :(<>
              {modulo==="analisis"       && <ModuloAnalisis       ventas={data.ventasConItems} egresos={data.egresos} productos={data.productos} vendedores={data.vendedores}/>}
              {modulo==="venta"          && <ModuloVenta          clientes={data.clientes} productos={data.productos} onRegistrar={data.registrarVenta} vendedores={data.vendedores}/>}
              {modulo==="ingresos"       && <ModuloIngresos       ventas={data.ventasConItems} vendedores={data.vendedores} onEditar={data.editarVenta} onEliminar={data.eliminarVenta} totalVentas={data.totalVentas}/>}
              {modulo==="egresos"        && <ModuloEgresos        egresos={data.egresos} onRegistrar={data.registrarEgreso} onReembolsar={data.marcarReembolsado} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarEgreso} onEliminar={data.eliminarEgreso}/>}
              {modulo==="clientes"       && <ModuloClientes       clientes={data.clientes} onGuardar={data.guardarCliente} ventas={data.ventasConItems}/>}
              {modulo==="productos"      && <ModuloProductos      productos={data.productos} onGuardar={data.guardarProducto} proveedores={data.proveedores}/>}
              {modulo==="abastecimiento" && <ModuloAbastecimiento productos={data.productos} abastecimiento={data.abastecimiento} onRegistrar={data.registrarAbastecimiento} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarAbastecimiento} onEliminar={data.eliminarAbastecimiento}/>}
              {modulo==="configuracion"  && <ModuloConfiguracion  vendedores={data.vendedores} onGuardar={data.guardarVendedor} onToggle={data.toggleVendedor} proveedores={data.proveedores} onGuardProv={data.guardarProveedor} onToggleProv={data.toggleProveedor} productos={data.productos} tipoCambio={data.tipoCambio} onActualizarTC={data.actualizarTipoCambio} onActualizarPct={data.actualizarPorcentaje} onActualizarCSV={data.actualizarDesdeCSV}/>}
            </>)
          }
        </div>
      </div>
      <Toast toasts={toast.toasts}/>
    </>
  );
}

// ============================================================
// MODULO: CONFIGURACION — Vendedores
// ============================================================
function ModuloConfiguracion({vendedores,onGuardar,onToggle,proveedores,onGuardProv,onToggleProv,productos,tipoCambio,onActualizarTC,onActualizarPct,onActualizarCSV}){
  const [subTab, setSubTab] = useState('vendedores');
  const [modal,  setModal]  = useState(false);
  const [editando,setEdit]  = useState(null);
  const [fNombre, setFN]    = useState("");
  const [fEmail,  setFE]    = useState("");
  const [fTel,    setFT]    = useState("");
  const [loading, setLoad]  = useState(false);

  function abrirNuevo(){setEdit(null);setFN("");setFE("");setFT("");setModal(true);}
  function abrirEditar(v){setEdit(v);setFN(v.nombre);setFE(v.email||"");setFT(v.telefono||"");setModal(true);}

  async function guardar(){
    if(!fNombre.trim())return;
    setLoad(true);
    await onGuardar({nombre:fNombre.trim(),email:fEmail,telefono:fTel,activo:true},editando?.id||null);
    setLoad(false);setModal(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Sub-tabs */}
      <div style={{display:"flex",gap:6}}>
        <Btn variant={subTab==="vendedores"?"primary":"secondary"} onClick={()=>setSubTab("vendedores")}>Vendedores</Btn>
        <Btn variant={subTab==="proveedores"?"primary":"secondary"} onClick={()=>setSubTab("proveedores")}>Proveedores</Btn>
        <Btn variant={subTab==="precios"?"primary":"secondary"} onClick={()=>setSubTab("precios")}>Actualizar precios</Btn>
      </div>

      {subTab==="vendedores"&&<>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Vendedores activos"   value={vendedores.filter(v=>v.activo).length}/>
        <MetricCard label="Vendedores inactivos" value={vendedores.filter(v=>!v.activo).length} color={G.textoSec}/>
        <MetricCard label="Total"                value={vendedores.length}/>
      </div>

      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <ST>Equipo de ventas</ST>
          <Btn onClick={abrirNuevo}>+ Nuevo vendedor</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {vendedores.map(v=>(
            <div key={v.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:G.sup2,borderRadius:10,border:`1px solid ${v.activo?G.borde:"#FF4D6A22"}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <Avatar nombre={v.nombre} size={38}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{v.nombre}</div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>
                    {v.email&&<span>{v.email}</span>}
                    {v.telefono&&<span style={{marginLeft:8}}>{v.telefono}</span>}
                    {!v.email&&!v.telefono&&<span>Sin datos de contacto</span>}
                  </div>
                </div>
                <Badge color={v.activo?"verde":"rojo"}>{v.activo?"Activo":"Inactivo"}</Badge>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn small variant="ghost" onClick={()=>abrirEditar(v)}>Editar</Btn>
                <Btn small variant={v.activo?"danger":"outline"} onClick={()=>onToggle(v.id,!v.activo)}>
                  {v.activo?"Desactivar":"Activar"}
                </Btn>
              </div>
            </div>
          ))}
          {vendedores.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:G.textoSec}}>No hay vendedores cargados</div>}
        </div>
      </Card>
      </>}

      {subTab==="proveedores"&&<ModuloProveedores proveedores={proveedores} onGuardar={onGuardProv} onToggle={onToggleProv}/>}
      {subTab==="precios"&&<ModuloActualizarPrecios proveedores={proveedores} productos={productos} tipoCambio={tipoCambio} onActualizarTC={onActualizarTC} onActualizarPct={onActualizarPct} onActualizarCSV={onActualizarCSV}/>}

      {modal&&(
        <Modal title={editando?"Editar vendedor":"Nuevo vendedor"} onClose={()=>setModal(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fNombre||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Nombre"   value={fNombre} onChange={setFN} placeholder="Ej: Juan"/>
            <Fi label="Email"    value={fEmail}  onChange={setFE} type="email" placeholder="juan@ejemplo.com"/>
            <Fi label="Telefono" value={fTel}    onChange={setFT} placeholder="11-1234-5678"/>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: PROVEEDORES (dentro de Configuracion)
// ============================================================
function ModuloProveedores({proveedores,onGuardar,onToggle}){
  const [modal,   setModal]  = useState(false);
  const [editando,setEdit]   = useState(null);
  const [fNombre, setFN]     = useState("");
  const [fContacto,setFC]    = useState("");
  const [fTel,    setFT]     = useState("");
  const [fEmail,  setFE]     = useState("");
  const [fDir,    setFD]     = useState("");
  const [fNotas,  setFNotas] = useState("");
  const [loading, setLoad]   = useState(false);

  const [fMoneda,  setFMoneda]  = useState("ARS");
  const [fDesc,    setFDesc]    = useState("0");
  const [fFactura, setFFactura] = useState(true);

  function abrirNuevo(){setEdit(null);setFN("");setFC("");setFT("");setFE("");setFD("");setFNotas("");setFMoneda("ARS");setFDesc("0");setFFactura(true);setModal(true);}
  function abrirEditar(p){setEdit(p);setFN(p.nombre);setFC(p.contacto||"");setFT(p.telefono||"");setFE(p.email||"");setFD(p.direccion||"");setFNotas(p.notas||"");setFMoneda(p.moneda||"ARS");setFDesc(String(p.descuento||0));setFFactura(p.factura??true);setModal(true);}

  async function guardar(){
    if(!fNombre.trim())return;
    setLoad(true);
    await onGuardar({nombre:fNombre.trim(),contacto:fContacto,telefono:fTel,email:fEmail,direccion:fDir,notas:fNotas,moneda:fMoneda,descuento:parseFloat(fDesc)||0,factura:fFactura,activo:true},editando?.id||null);
    setLoad(false);setModal(false);
  }

  const activos   = (proveedores||[]).filter(p=>p.activo);
  const inactivos = (proveedores||[]).filter(p=>!p.activo);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Proveedores activos"   value={activos.length}/>
        <MetricCard label="Proveedores inactivos" value={inactivos.length} color={G.textoSec}/>
        <MetricCard label="Total"                 value={(proveedores||[]).length}/>
      </div>
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <ST>Proveedores</ST>
          <Btn onClick={abrirNuevo}>+ Nuevo proveedor</Btn>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {(proveedores||[]).map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",background:G.sup2,borderRadius:10,border:`1px solid ${p.activo?G.borde:"#FF4D6A22"}`}}>
              <div style={{display:"flex",gap:12,alignItems:"center"}}>
                <Avatar nombre={p.nombre} size={38} color={G.naranja}/>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{fontWeight:600,fontSize:14}}>{p.nombre}</div>
                    <Badge color={p.moneda==="USD"?"usd":"gris"}>{p.moneda||"ARS"}</Badge>
                    {(p.descuento||0)>0&&<Badge color="verde">-{p.descuento}%</Badge>}
                    {p.factura&&<Badge color="azul">Factura</Badge>}
                  </div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2,display:"flex",gap:12}}>
                    {p.contacto&&<span>{p.contacto}</span>}
                    {p.telefono&&<span>{p.telefono}</span>}
                    {p.email&&<span>{p.email}</span>}
                    {!p.contacto&&!p.telefono&&!p.email&&<span>Sin datos de contacto</span>}
                  </div>
                  {p.notas&&<div style={{fontSize:11,color:G.textoSec,marginTop:2,fontStyle:"italic"}}>{p.notas}</div>}
                </div>
                <Badge color={p.activo?"verde":"rojo"}>{p.activo?"Activo":"Inactivo"}</Badge>
              </div>
              <div style={{display:"flex",gap:8}}>
                <Btn small variant="ghost" onClick={()=>abrirEditar(p)}>Editar</Btn>
                <Btn small variant={p.activo?"danger":"outline"} onClick={()=>onToggle(p.id,!p.activo)}>
                  {p.activo?"Desactivar":"Activar"}
                </Btn>
              </div>
            </div>
          ))}
          {(proveedores||[]).length===0&&<div style={{textAlign:"center",padding:"32px 0",color:G.textoSec}}>No hay proveedores cargados</div>}
        </div>
      </Card>
      {modal&&(
        <Modal title={editando?"Editar proveedor":"Nuevo proveedor"} onClose={()=>setModal(false)} maxWidth={480}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fNombre||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar proveedor"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Nombre del proveedor" value={fNombre}   onChange={setFN}    placeholder="Ej: Vulcano, Trapur"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <Fi label="Moneda de lista"    value={fMoneda}   onChange={setFMoneda}  options={["ARS","USD"]}/>
              <Fi label="Descuento habitual (%)" value={fDesc} onChange={setFDesc}   type="number" placeholder="0"/>
              <div style={{display:"flex",flexDirection:"column",gap:5,justifyContent:"flex-end"}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                  <input type="checkbox" checked={fFactura} onChange={e=>setFFactura(e.target.checked)}/> Emite factura
                </label>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Contacto (nombre)"  value={fContacto} onChange={setFC}    placeholder="Ej: Juan Gomez"/>
              <Fi label="Telefono"           value={fTel}      onChange={setFT}    placeholder="11-1234-5678"/>
              <Fi label="Email"              value={fEmail}    onChange={setFE}    type="email" placeholder="ventas@proveedor.com"/>
              <Fi label="Direccion"          value={fDir}      onChange={setFD}    placeholder="Calle y numero"/>
            </div>
            <Fi label="Notas internas"       value={fNotas}    onChange={setFNotas} rows={2} placeholder="Condiciones de pago, dias de entrega, etc."/>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// PANEL REPOSICION DE STOCK
// ============================================================
function PanelReposicion({alertas}){
  const [abierto,    setAbierto]    = useState(false);
  const [filtroProv, setFiltroProv] = useState("Todos");
  const [seleccion,  setSeleccion]  = useState({});
  const [cantidades, setCantidades] = useState({});

  const proveedores = useMemo(()=>{
    const s=new Set(alertas.map(p=>p.proveedor||"Sin proveedor"));
    return ["Todos",...Array.from(s).sort()];
  },[alertas]);

  const alertasFiltradas = useMemo(()=>{
    const base = filtroProv==="Todos"
      ? [...alertas]
      : alertas.filter(p=>(p.proveedor||"Sin proveedor")===filtroProv);
    return base.sort((a,b)=>{
      // Agotados primero dentro de cada proveedor
      if(filtroProv==="Todos"){
        const provCmp=(a.proveedor||"").localeCompare(b.proveedor||"");
        if(provCmp!==0)return provCmp;
      }
      const ea=estadoStock(a)==="agotado"?0:1;
      const eb=estadoStock(b)==="agotado"?0:1;
      return ea-eb;
    });
  },[alertas,filtroProv]);

  // Agrupar por proveedor (para la vista agrupada)
  const porProv = useMemo(()=>{
    const m={};
    alertasFiltradas.forEach(p=>{
      const pv=p.proveedor||"Sin proveedor";
      if(!m[pv])m[pv]=[];
      m[pv].push(p);
    });
    return m;
  },[alertasFiltradas]);

  function toggleSelec(id){
    setSeleccion(prev=>({...prev,[id]:!prev[id]}));
    if(!cantidades[id]){
      const p=alertas.find(x=>x.id===id);
      if(p) setCantidades(prev=>({...prev,[id]:Math.max(0,p.stock_min*2-p.stock)}));
    }
  }
  function seleccionarTodos(){
    const todos={};alertasFiltradas.forEach(p=>{todos[p.id]=true;});setSeleccion(todos);
    const cants={};alertasFiltradas.forEach(p=>{cants[p.id]=Math.max(0,p.stock_min*2-p.stock);});setCantidades(prev=>({...prev,...cants}));
  }
  function deseleccionarTodos(){setSeleccion({});}

  const seleccionados = alertasFiltradas.filter(p=>seleccion[p.id]);

  async function exportarExcel(){
    if(seleccionados.length===0)return;
    // Importar SheetJS dinamicamente
    const XLSX=await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");

    // Agrupar por proveedor para multiples hojas
    const porP={};
    seleccionados.forEach(p=>{
      const pv=p.proveedor||"Sin proveedor";
      if(!porP[pv])porP[pv]=[];
      porP[pv].push(p);
    });

    const wb=XLSX.utils.book_new();
    const fecha=new Date().toLocaleDateString("es-AR");

    // Hoja resumen general
    const resumenData=[
      ["PEDIDO DE REPOSICION DE STOCK"],
      ["Fecha: "+fecha],
      [""],
      ["Codigo","Producto","Proveedor","Stock actual","Stock minimo","Cantidad a pedir"],
    ];
    seleccionados.forEach(p=>{
      const cant=cantidades[p.id]??Math.max(0,p.stock_min*2-p.stock);
      resumenData.push([p.codigo,p.nombre,p.proveedor||"",p.stock,p.stock_min,cant]);
    });
    const wsResumen=XLSX.utils.aoa_to_sheet(resumenData);
    // Anchos de columna
    wsResumen["!cols"]=[{wch:12},{wch:45},{wch:20},{wch:14},{wch:14},{wch:18}];
    XLSX.utils.book_append_sheet(wb,wsResumen,"Resumen");

    // Una hoja por proveedor
    Object.keys(porP).sort().forEach(pv=>{
      const sheetData=[
        ["PEDIDO — "+pv.toUpperCase()],
        ["Fecha: "+fecha],
        [""],
        ["Codigo","Producto","Stock actual","Stock minimo","Cantidad a pedir"],
      ];
      porP[pv].forEach(p=>{
        const cant=cantidades[p.id]??Math.max(0,p.stock_min*2-p.stock);
        sheetData.push([p.codigo,p.nombre,p.stock,p.stock_min,cant]);
      });
      const ws=XLSX.utils.aoa_to_sheet(sheetData);
      ws["!cols"]=[{wch:12},{wch:45},{wch:14},{wch:14},{wch:18}];
      // Nombre de hoja max 31 chars
      const sheetName=pv.substring(0,30).replace(/[:\/?*[\]]/g,"");
      XLSX.utils.book_append_sheet(wb,ws,sheetName);
    });

    const nombreArchivo=`pedido-reposicion-${new Date().toISOString().split("T")[0]}.xlsx`;
    XLSX.writeFile(wb,nombreArchivo);
  }

  function exportarTexto(){
    if(seleccionados.length===0)return;
    const porP={};
    seleccionados.forEach(p=>{
      const pv=p.proveedor||"Sin proveedor";
      if(!porP[pv])porP[pv]=[];
      porP[pv].push(p);
    });
    let texto="PEDIDO DE REPOSICION DE STOCK\n";
    texto+="Fecha: "+new Date().toLocaleDateString("es-AR")+"\n\n";
    Object.keys(porP).sort().forEach(pv=>{
      texto+="--- "+pv.toUpperCase()+" ---\n";
      porP[pv].forEach(p=>{
        const cant=cantidades[p.id]||Math.max(0,p.stock_min*2-p.stock);
        texto+=`[${p.codigo}] ${p.nombre} — PEDIR: ${cant} u.\n`;
      });
      texto+="\n";
    });
    const blob=new Blob([texto],{type:"text/plain;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=`pedido-reposicion-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();URL.revokeObjectURL(url);
  }

  return(
    <div style={{marginBottom:4}}>
      {/* Boton colapsable */}
      <div onClick={()=>setAbierto(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#FF4D6A18",border:"1px solid #FF4D6A44",borderRadius:abierto?"12px 12px 0 0":"12px",padding:"12px 18px",cursor:"pointer",transition:"all .2s"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:16}}>⚠</span>
          <span style={{fontWeight:600,fontSize:14,color:G.rojo}}>Reposicion de Stock Necesaria</span>
          <Badge color="rojo">{alertas.length} productos</Badge>
          <Badge color="naranja">{proveedores.length-1} proveedores</Badge>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {seleccionados.length>0&&<Badge color="verde">{seleccionados.length} seleccionados</Badge>}
          <span style={{color:G.textoSec,fontSize:18,transition:"transform .2s",display:"inline-block",transform:abierto?"rotate(180deg)":"rotate(0deg)"}}>▾</span>
        </div>
      </div>

      {/* Panel desplegable */}
      {abierto&&(
        <div style={{background:G.sup,border:"1px solid #FF4D6A33",borderTop:"none",borderRadius:"0 0 12px 12px",padding:"16px 18px"}}>
          {/* Controles */}
          <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:14}}>
            <Fi value={filtroProv} onChange={v=>{setFiltroProv(v);setSeleccion({});}} options={proveedores} style={{width:200}}/>
            <Btn small variant="secondary" onClick={seleccionarTodos}>Seleccionar todos</Btn>
            <Btn small variant="ghost"     onClick={deseleccionarTodos}>Limpiar seleccion</Btn>
            <div style={{flex:1}}/>
            {seleccionados.length>0&&<>
              <span style={{fontSize:12,color:G.textoSec}}>{seleccionados.length} productos seleccionados</span>
              <Btn small variant="outline" onClick={exportarExcel}>↓ Exportar Excel</Btn>
              <Btn small onClick={exportarTexto}>↓ Exportar lista .txt</Btn>
            </>}
          </div>

          {/* Lista agrupada */}
          <div style={{display:"flex",flexDirection:"column",gap:14,maxHeight:500,overflowY:"auto"}}>
            {Object.keys(porProv).sort().map(prov=>(
              <div key={prov}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,paddingBottom:4,borderBottom:"1px solid #2A3045"}}>
                  <span style={{fontSize:11,fontWeight:700,color:G.naranja,textTransform:"uppercase",letterSpacing:0.8}}>{prov}</span>
                  <span style={{fontSize:11,color:G.textoSec}}>({porProv[prov].length} productos)</span>
                  <Btn small variant="ghost" onClick={()=>{
                    const todos={...seleccion};
                    const cants={...cantidades};
                    porProv[prov].forEach(p=>{
                      todos[p.id]=true;
                      if(!cants[p.id])cants[p.id]=Math.max(0,p.stock_min*2-p.stock);
                    });
                    setSeleccion(todos);setCantidades(cants);
                  }}>Seleccionar proveedor</Btn>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:3}}>
                  {porProv[prov].map(p=>{
                    const sel=!!seleccion[p.id];
                    const cant=cantidades[p.id]??Math.max(0,p.stock_min*2-p.stock);
                    return(
                      <div key={p.id} onClick={()=>toggleSelec(p.id)} style={{display:"grid",gridTemplateColumns:"28px 90px 1fr 150px 110px",gap:8,alignItems:"center",fontSize:12,padding:"6px 8px",borderRadius:8,cursor:"pointer",background:sel?"#00C48C11":"transparent",border:sel?"1px solid #00C48C33":"1px solid transparent",transition:"all .1s"}}>
                        <input type="checkbox" checked={sel} onChange={()=>toggleSelec(p.id)} onClick={e=>e.stopPropagation()} style={{accentColor:G.verde,width:14,height:14,cursor:"pointer"}}/>
                        <span style={{fontFamily:"DM Mono,monospace",fontSize:10,color:G.textoSec}}>{p.codigo}</span>
                        <span style={{fontWeight:sel?600:400}}>{p.nombre}</span>
                        <span style={{fontFamily:"DM Mono,monospace",color:p.stock===0?G.rojo:G.amarillo,fontSize:11}}>
                          {p.stock===0?"AGOTADO":"stock "+p.stock+" / min "+p.stock_min}
                        </span>
                        <div style={{display:"flex",alignItems:"center",gap:6}} onClick={e=>e.stopPropagation()}>
                          <span style={{fontSize:11,color:G.textoSec,whiteSpace:"nowrap"}}>Pedir:</span>
                          <input type="number" value={cant} min={0}
                            onChange={e=>setCantidades(prev=>({...prev,[p.id]:parseInt(e.target.value)||0}))}
                            onClick={e=>{e.stopPropagation();if(!sel)toggleSelec(p.id);}}
                            style={{width:52,background:G.sup2,border:"1px solid #2A3045",borderRadius:6,padding:"3px 6px",color:G.texto,fontSize:12,textAlign:"center"}}/>
                          <span style={{fontSize:11,color:G.textoSec}}>u.</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// MODULO: ACTUALIZAR PRECIOS
// ============================================================
function ModuloActualizarPrecios({proveedores,productos,tipoCambio,onActualizarTC,onActualizarPct,onActualizarCSV}){
  const [modo,       setModo]       = useState("tc"); // tc | pct | csv
  const [nuevoTC,    setNuevoTC]    = useState(String(tipoCambio||1200));
  const [provSelec,  setProvSelec]  = useState("");
  const [cotizaciones, setCotizaciones] = useState({loading:false, error:null, tipos:[]});

  async function cargarCotizaciones(){
    setCotizaciones(p=>({...p,loading:true,error:null}));
    try{
      const res = await fetch("https://dolarapi.com/v1/dolares");
      if(!res.ok) throw new Error("Error al consultar");
      const data = await res.json();
      const tipos = data
        .filter(d=>["oficial","blue","bolsa","cripto"].includes(d.casa))
        .map(d=>({
          nombre: d.nombre,
          compra: d.compra||0,
          venta:  d.venta||0,
          casa:   d.casa
        }))
        .sort((a,b)=>a.venta-b.venta);
      setCotizaciones({loading:false,error:null,tipos});
    } catch(e){
      setCotizaciones({loading:false,error:"No se pudo obtener la cotizacion. Verificá tu conexion.",tipos:[]});
    }
  }

  // Cargar cotizaciones al abrir el tab TC
  useEffect(()=>{
    if(modo==="tc") cargarCotizaciones();
  },[modo]);
  const [porcentaje, setPorcentaje] = useState("");
  const [loading,    setLoading]    = useState(false);
  const [csvData,    setCsvData]    = useState(null);   // {filas:[{codigo,nombre,costo}]}
  const [preview,    setPreview]    = useState([]);
  const [confirmar,  setConfirmar]  = useState(false);

  const provsUSD = (proveedores||[]).filter(p=>p.moneda==="USD");
  const provsARS = (proveedores||[]).filter(p=>p.moneda!=="USD");
  const prodsProv = provSelec ? productos.filter(p=>p.proveedor===provSelec) : [];

  // Procesar CSV subido
  function procesarCSV(e){
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const text=ev.target.result;
      const lines=text.split('\n').filter(l=>l.trim());
      if(lines.length<2){setCsvData(null);return;}
      // Detectar separador
      const sep=lines[0].includes('\t')?'\t':',';
      const headers=lines[0].split(sep).map(h=>h.trim().toLowerCase().replace(/['"]/g,''));
      
      // Buscar columnas de codigo, nombre y costo
      const iCod   = headers.findIndex(h=>h.includes('cod'))||0;
      const iNom   = headers.findIndex(h=>h.includes('prod')||h.includes('nom')||h.includes('desc'));
      const iCosto = headers.findIndex(h=>h.includes('cost')||h.includes('precio')||h.includes('unit'));
      
      const filas=[];
      for(let i=1;i<lines.length;i++){
        const cols=lines[i].split(sep).map(c=>c.trim().replace(/['"]/g,''));
        const costo=parseFloat((cols[iCosto]||'').replace(/[$.\s]/g,'').replace(',','.'));
        if(!costo||isNaN(costo))continue;
        filas.push({
          codigo: iCod>=0?(cols[iCod]||''):'',
          nombre: iNom>=0?(cols[iNom]||''):'',
          costo
        });
      }
      
      // Preview: matchear con productos
      const prov=(proveedores||[]).find(p=>p.nombre===provSelec);
      const desc=(prov?.descuento||0)/100;
      const prev=filas.map(f=>{
        const prod=productos.find(p=>
          (f.codigo&&p.codigo?.toLowerCase()===f.codigo.toLowerCase())||
          (f.nombre&&p.nombre?.toLowerCase().includes(f.nombre.toLowerCase().substring(0,15)))
        );
        return {...f,productoEncontrado:prod?.nombre||null,costoConDesc:Math.round(f.costo*(1-desc))};
      }).filter(f=>f.productoEncontrado);
      
      setCsvData({filas,total:filas.length,matcheados:prev.length});
      setPreview(prev);
    };
    reader.readAsText(file,'utf-8');
  }

  async function ejecutarTC(soloProveedor=null){
    const tc=parseFloat(nuevoTC);
    if(!tc||tc<1)return;
    setLoading(true);
    await onActualizarTC(tc, soloProveedor);
    setLoading(false);setConfirmar(false);setNuevoTC(String(tc));
  }

  async function ejecutarPct(){
    const pct=parseFloat(porcentaje);
    if(!pct||!provSelec)return;
    setLoading(true);
    await onActualizarPct(provSelec,pct);
    setLoading(false);setPorcentaje("");setConfirmar(false);
  }

  async function ejecutarCSV(){
    if(!csvData||!provSelec)return;
    setLoading(true);
    const {filas}=csvData;
    await onActualizarCSV(provSelec,filas);
    setLoading(false);setCsvData(null);setPreview([]);setConfirmar(false);
  }

  const LoadBtn=({onClick,disabled,children})=>(
    <Btn onClick={onClick} disabled={disabled||loading}>
      {loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Actualizando...</span>:children}
    </Btn>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Métricas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Proveedores USD" value={provsUSD.length} color={G.azul}/>
        <MetricCard label="Proveedores ARS" value={provsARS.length}/>
        <MetricCard label="Tipo de cambio actual" value={`$${Number(tipoCambio).toLocaleString("es-AR")}`} color={G.verde}/>
      </div>

      {/* Tabs de modo */}
      <div style={{display:"flex",gap:6}}>
        <Btn variant={modo==="tc"?"primary":"secondary"}  onClick={()=>setModo("tc")}>Tipo de cambio USD</Btn>
        <Btn variant={modo==="pct"?"primary":"secondary"} onClick={()=>setModo("pct")}>% de aumento</Btn>
        <Btn variant={modo==="csv"?"primary":"secondary"} onClick={()=>setModo("csv")}>Subir lista del proveedor</Btn>
      </div>

      {/* ── MODO TC ── */}
      {modo==="tc"&&(
        <Card>
          <ST>Actualizar tipo de cambio USD</ST>
          <div style={{fontSize:13,color:G.textoSec,marginBottom:14}}>
            Al confirmar, se recalculan los precios de venta de todos los productos del proveedor seleccionado,
            usando el costo en USD guardado × IVA de cada producto × nuevo TC.
          </div>

          {/* Cotizaciones en tiempo real */}
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Cotizaciones del dia</div>
            {cotizaciones.loading&&<div style={{display:"flex",gap:8,alignItems:"center",fontSize:12,color:G.textoSec}}><Spinner/> Consultando...</div>}
            {cotizaciones.error&&<div style={{fontSize:12,color:G.rojo}}>{cotizaciones.error}</div>}
            {!cotizaciones.loading&&!cotizaciones.error&&(
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                {cotizaciones.tipos.map(t=>(
                  <div key={t.nombre} onClick={()=>setNuevoTC(String(t.venta))}
                    style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:10,padding:"10px 16px",cursor:"pointer",transition:"all .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=G.verde}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=G.borde}>
                    <div style={{fontSize:11,color:G.textoSec,marginBottom:4}}>{t.nombre}</div>
                    <div style={{fontSize:16,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>${t.venta.toLocaleString("es-AR")}</div>
                    <div style={{fontSize:10,color:G.textoSec,marginTop:2}}>Compra: ${t.compra.toLocaleString("es-AR")}</div>
                    <div style={{fontSize:10,color:G.azul,marginTop:4}}>→ Usar este TC</div>
                  </div>
                ))}
                <div onClick={cargarCotizaciones}
                  style={{background:"transparent",border:`1px dashed ${G.borde}`,borderRadius:10,padding:"10px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",minWidth:80}}>
                  <span style={{fontSize:18,color:G.textoSec}}>↻</span>
                </div>
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
            <Fi label="Nuevo tipo de cambio ($)" value={nuevoTC} onChange={setNuevoTC} type="number" style={{width:220}} placeholder="1200"/>
            <div style={{fontSize:13,color:G.textoSec}}>
              {nuevoTC&&<span style={{color:parseFloat(nuevoTC)>0?G.texto:G.textoSec}}>
                TC seleccionado: <strong style={{color:G.verde,fontFamily:"DM Mono,monospace"}}>${Number(parseFloat(nuevoTC)||0).toLocaleString("es-AR")}</strong>
              </span>}
            </div>
          </div>
          {/* Selector de proveedor USD especifico o todos */}
          <div style={{marginTop:14,display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
            <Fi label="Aplicar a" value={provSelec} onChange={setProvSelec}
              options={[{value:"",label:"Todos los proveedores USD"},...provsUSD.map(p=>({value:p.nombre,label:`${p.nombre} (TC actual: $${(p.tipo_cambio_usd||0).toLocaleString("es-AR")})`}))]}
              style={{flex:1,minWidth:250}}/>
          </div>
          {provsUSD.length>0&&(
            <div style={{marginTop:12,background:G.sup2,borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:12,color:G.textoSec,marginBottom:8}}>Proveedores USD:</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {provsUSD.filter(p=>!provSelec||p.nombre===provSelec).map(p=>{
                  const prods=productos.filter(pr=>pr.proveedor===p.nombre&&(pr.costo_usd||0)>0);
                  return(
                    <div key={p.id} style={{fontSize:12,background:G.fondo,borderRadius:8,padding:"8px 12px"}}>
                      <div style={{fontWeight:500}}>{p.nombre}</div>
                      <div style={{color:G.textoSec,marginTop:2}}>
                        TC actual: <strong style={{color:G.azul}}>${(p.tipo_cambio_usd||0).toLocaleString("es-AR")}</strong>
                        {p.descuento>0&&<span style={{color:G.verde,marginLeft:6}}>desc {p.descuento}%</span>}
                        <span style={{marginLeft:6}}>{prods.length} productos con USD</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!confirmar
            ?<Btn style={{marginTop:14}} disabled={!nuevoTC} onClick={()=>setConfirmar(true)}>
               Previsualizar cambios
             </Btn>
            :<div style={{marginTop:14,background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:10,padding:"14px 16px"}}>
               <div style={{fontSize:13,color:G.amarillo,fontWeight:600,marginBottom:10}}>
                 ⚠ Se actualizarán {productos.filter(p=>(provSelec?p.proveedor===provSelec:provsUSD.map(v=>v.nombre).includes(p.proveedor))&&(p.costo_usd||0)>0).length} productos
                 {provSelec?` de ${provSelec}`:" de todos los proveedores USD"}
               </div>
               <div style={{display:"flex",gap:10}}>
                 <LoadBtn onClick={()=>ejecutarTC(provSelec||null)}>Confirmar actualización</LoadBtn>
                 <Btn variant="secondary" onClick={()=>setConfirmar(false)}>Cancelar</Btn>
               </div>
             </div>
          }
        </Card>
      )}

      {/* ── MODO PCT ── */}
      {modo==="pct"&&(
        <Card>
          <ST>Actualizar costos por porcentaje</ST>
          <div style={{fontSize:13,color:G.textoSec,marginBottom:14}}>
            Aumenta o reduce el costo de todos los productos de un proveedor y recalcula los precios automáticamente.
            Usá número positivo para aumento y negativo para baja (ej: -5 para bajar 5%).
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,maxWidth:440}}>
            <Fi label="Proveedor" value={provSelec} onChange={setProvSelec}
              options={["",...(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)]}/>
            <Fi label="Porcentaje de cambio" value={porcentaje} onChange={setPorcentaje} type="number" placeholder="Ej: 7 o -5"/>
          </div>
          {provSelec&&prodsProv.length>0&&(
            <div style={{marginTop:10,fontSize:12,color:G.textoSec}}>
              {prodsProv.length} productos de {provSelec}
              {porcentaje&&(
                <span style={{color:parseFloat(porcentaje)>0?G.rojo:G.verde,marginLeft:8,fontWeight:600}}>
                  → costos {parseFloat(porcentaje)>0?"suben":"bajan"} {Math.abs(parseFloat(porcentaje))}%
                </span>
              )}
            </div>
          )}
          {!confirmar
            ?<Btn style={{marginTop:14}} disabled={!provSelec||!porcentaje} onClick={()=>setConfirmar(true)}>
               Aplicar cambio
             </Btn>
            :<div style={{marginTop:14,background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:10,padding:"14px 16px"}}>
               <div style={{fontSize:13,color:G.amarillo,fontWeight:600,marginBottom:10}}>
                 ⚠ Se actualizarán {prodsProv.length} productos de {provSelec} ({parseFloat(porcentaje)>0?"+":""}{porcentaje}%)
               </div>
               <div style={{display:"flex",gap:10}}>
                 <LoadBtn onClick={ejecutarPct}>Confirmar</LoadBtn>
                 <Btn variant="secondary" onClick={()=>setConfirmar(false)}>Cancelar</Btn>
               </div>
             </div>
          }
        </Card>
      )}

      {/* ── MODO CSV ── */}
      {modo==="csv"&&(
        <Card>
          <ST>Actualizar desde lista del proveedor</ST>
          <div style={{fontSize:13,color:G.textoSec,marginBottom:14}}>
            Subí el Excel o CSV que te mandó el proveedor. El sistema va a matchear por código o nombre de producto,
            aplicar el descuento del proveedor y recalcular los precios automáticamente.
          </div>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap",marginBottom:14}}>
            <Fi label="Proveedor" value={provSelec} onChange={v=>{setProvSelec(v);setCsvData(null);setPreview([]);}}
              options={["",...(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)]} style={{width:220}}/>
            {provSelec&&(
              <div>
                <label style={{fontSize:11,color:G.textoSec,fontWeight:500,textTransform:"uppercase",letterSpacing:0.5,display:"block",marginBottom:5}}>
                  Archivo CSV o Excel (guardado como CSV)
                </label>
                <input type="file" accept=".csv,.txt" onChange={procesarCSV}
                  style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"7px 12px",color:G.texto,fontSize:13,cursor:"pointer"}}/>
              </div>
            )}
          </div>
          {provSelec&&(()=>{
            const prov=(proveedores||[]).find(p=>p.nombre===provSelec);
            return prov&&(
              <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,marginBottom:14,display:"flex",gap:16}}>
                <span>Moneda: <strong style={{color:prov.moneda==="USD"?G.azul:G.texto}}>{prov.moneda||"ARS"}</strong></span>
                <span>Descuento habitual: <strong style={{color:G.verde}}>{prov.descuento||0}%</strong></span>
                <span>Productos en sistema: <strong>{productos.filter(p=>p.proveedor===provSelec).length}</strong></span>
              </div>
            );
          })()}
          {csvData&&(
            <div>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:10}}>
                <Badge color="verde">{csvData.matcheados} productos encontrados</Badge>
                <Badge color="gris">{csvData.total-csvData.matcheados} sin match</Badge>
                <span style={{fontSize:12,color:G.textoSec}}>de {csvData.total} en la lista</span>
              </div>
              {preview.length>0&&(
                <div style={{maxHeight:300,overflowY:"auto",border:`1px solid ${G.borde}`,borderRadius:8,marginBottom:14}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                    <thead><tr style={{background:G.sup2,borderBottom:`1px solid ${G.borde}`}}>
                      {["Cod. lista","Producto en lista","Match en sistema","Costo lista","Costo c/desc"].map(h=>
                        <th key={h} style={{padding:"8px 12px",textAlign:"left",color:G.textoSec,fontWeight:500,fontSize:10,textTransform:"uppercase"}}>{h}</th>
                      )}
                    </tr></thead>
                    <tbody>
                      {preview.map((f,i)=>(
                        <tr key={i} style={{borderBottom:`1px solid ${G.borde}22`}}>
                          <td style={{padding:"6px 12px",fontFamily:"DM Mono,monospace",fontSize:10,color:G.textoSec}}>{f.codigo||"—"}</td>
                          <td style={{padding:"6px 12px",color:G.textoSec}}>{f.nombre}</td>
                          <td style={{padding:"6px 12px",fontWeight:500,color:G.verde}}>{f.productoEncontrado}</td>
                          <td style={{padding:"6px 12px",fontFamily:"DM Mono,monospace"}}>{fmt(f.costo)}</td>
                          <td style={{padding:"6px 12px",fontFamily:"DM Mono,monospace",color:G.verde}}>{fmt(f.costoConDesc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!confirmar
                ?<Btn disabled={preview.length===0} onClick={()=>setConfirmar(true)}>
                   Aplicar {preview.length} actualizaciones
                 </Btn>
                :<div style={{background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:10,padding:"14px 16px"}}>
                   <div style={{fontSize:13,color:G.amarillo,fontWeight:600,marginBottom:10}}>
                     ⚠ Se actualizarán {preview.length} productos de {provSelec}
                   </div>
                   <div style={{display:"flex",gap:10}}>
                     <LoadBtn onClick={ejecutarCSV}>Confirmar</LoadBtn>
                     <Btn variant="secondary" onClick={()=>setConfirmar(false)}>Cancelar</Btn>
                   </div>
                 </div>
              }
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
