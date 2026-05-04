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
const METODOS_PAGO = ["Efectivo", "Transferencia MP", "Transferencia Banco", "Debito MP", "Debito Banco", "Credito MP", "Credito Banco", "Credito Cuotas Banco", "Cuenta corriente"];
const MODALIDADES  = ["En el local", "Telefonica / Delivery"];
const CATEGORIAS   = ["Accesorios","Acido","Atermico","Bombas","Cloro","Envases","Filtros","Fumigacion","General","Granel","Jardinería","Limpieza","Perfumería","Pintura","PVC","Quimicos","Repuestos","Revestimiento","Sanitarios"];
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
  return Math.ceil(bruto*(1-desc/100)/100)*100;
}
function calcGananciaItems(items,desc=0){
  // Total redondeado (lo que cobra el cliente) menos costos
  const totalRedondeado=calcTotalItems(items,desc);
  const costos=items.reduce((s,i)=>s+(i.costo||0)*(i.cantidad||0),0);
  return totalRedondeado-costos;
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
function Card({children,style,onClick}){return <div onClick={onClick} style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:12,padding:"18px 22px",animation:"fadeIn .2s ease",...style}}>{children}</div>;}
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
          <div style={{marginBottom:16,display:"inline-block"}}>
            <img src="data:image/jpeg;base64,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" alt="Pensok" style={{width:80,height:80,borderRadius:20,objectFit:"cover"}}/>
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
  const [totalNosDeben,  setTotalNosDeben]  = useState(0);
  const [anioStats,      setAnioStats]      = useState({facturacion:0,ganancia:0,cantidad:0});
  const [loading,        setLoading]        = useState(true);

  async function cargar(){
    setLoading(true);
    const[{data:cls},{data:prds},{data:vts},{data:vis},{data:egs},{data:abs},{data:vends},{data:provs}]=await Promise.all([
      supabase.from("clientes").select("*").order("nombre"),
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("ventas").select("*, venta_items(*)").order("fecha",{ascending:false}).order("hora",{ascending:false}).limit(8000),
      supabase.from("venta_items").select("id").limit(1),
      supabase.from("egresos").select("*").order("fecha",{ascending:false}),
      supabase.from("abastecimiento").select("*").order("fecha",{ascending:false}),
      supabase.from("vendedores").select("*").eq("activo",true).order("nombre"),
      supabase.from("proveedores").select("*").order("nombre"),
    ]);
    setClientes(cls||[]);setProductos(prds||[]);setVentas(vts||[]);setVentaItems(vis||[]);setEgresos(egs||[]);setAbastecimiento(abs||[]);setVendedores(vends||[]);setProveedores(provs||[]);
    // Count real de ventas
    const{count}=await supabase.from("ventas").select("*",{count:"exact",head:true});
    setTotalVentas(count||0);
    // Total "nos deben" directo desde Supabase (no limitado a 5000)
    const{data:saldoData}=await supabase.from("ventas").select("saldo_cobro").gt("saldo_cobro",0);
    const totalSaldo=(saldoData||[]).reduce((s,v)=>s+(v.saldo_cobro||0),0);
    setTotalNosDeben(totalSaldo);
    // Agregados del año actual desde Supabase (sin limite)
    const anioStr=new Date().getFullYear().toString();
    const{data:anioData}=await supabase.from("ventas").select("total,ganancia").gte("fecha",`${anioStr}-01-01`).lte("fecha",`${anioStr}-12-31`).limit(100000);
    const anioFact=(anioData||[]).reduce((s,v)=>s+(v.total||0),0);
    const anioGan=(anioData||[]).reduce((s,v)=>s+(v.ganancia||0),0);
    setAnioStats({facturacion:anioFact,ganancia:anioGan,cantidad:(anioData||[]).length});
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

  return{clientes,productos,ventasConItems,egresos,abastecimiento,vendedores,proveedores,tipoCambio,totalVentas,totalNosDeben,anioStats,loading,cargar,registrarVenta,registrarEgreso,marcarReembolsado,guardarCliente,guardarProducto,registrarAbastecimiento,guardarVendedor,toggleVendedor,guardarProveedor,toggleProveedor,editarVenta,eliminarVenta,editarEgreso,eliminarEgreso,editarAbastecimiento,eliminarAbastecimiento,actualizarTipoCambio,actualizarPorcentaje,actualizarDesdeCSV};
}

// ============================================================
// MODULO: ANALISIS / DASHBOARD
// ============================================================
function ModuloAnalisis({ventas,egresos,productos,vendedores,totalNosDeben,anioStats,onNavegar,onFiltroIngresos}){
  const hoyStr=hoy();const mesAct_=mesAct();const anio=new Date().getFullYear().toString();
  const [periodo,setPeriodo]=useState("mes"); // "hoy"|"dia"|"mes"|"mesEsp"|"anio"
  const [diaEsp,setDiaEsp]=useState(hoyStr);
  const [mesEsp,setMesEsp]=useState(mesAct_);

  // ── Prefijo activo para filtros ──
  const prefijoDia  = periodo==="hoy"?hoyStr:diaEsp;
  const prefijoMes  = periodo==="mes"?mesAct_:mesEsp;

  // ── Ventas y egresos filtrados ──
  const vSel = periodo==="hoy"||periodo==="dia"
    ? ventas.filter(v=>v.fecha===prefijoDia)
    : periodo==="mes"||periodo==="mesEsp"
    ? ventas.filter(v=>v.fecha?.startsWith(prefijoMes))
    : ventas.filter(v=>v.fecha?.startsWith(anio));

  const eSel = periodo==="hoy"||periodo==="dia"
    ? egresos.filter(e=>e.fecha===prefijoDia)
    : periodo==="mes"||periodo==="mesEsp"
    ? egresos.filter(e=>e.fecha?.startsWith(prefijoMes))
    : egresos.filter(e=>e.fecha?.startsWith(anio));

  // ── Metricas ──
  const facturacion  = periodo==="anio" ? anioStats.facturacion : vSel.reduce((s,v)=>s+(v.total||0),0);
  const gananciaNeta = periodo==="anio" ? anioStats.ganancia    : vSel.reduce((s,v)=>s+(v.ganancia||0),0);
  const cantVentas   = periodo==="anio" ? anioStats.cantidad    : vSel.length;
  const pctGanancia=facturacion>0?Math.round(gananciaNeta/facturacion*100):0;
  const ticketProm=cantVentas>0?Math.round(facturacion/cantVentas):0;
  const gastosFijos=eSel.filter(e=>e.tipo==="Gasto fijo").reduce((s,e)=>s+(e.monto||0),0);
  const gastosVar=eSel.filter(e=>e.tipo==="Gasto variable").reduce((s,e)=>s+(e.monto||0),0);
  const gananciaReal=gananciaNeta-gastosFijos;
  const pctGananciaReal=facturacion>0?Math.round(gananciaReal/facturacion*100):0;

  // ── Graficos responden al periodo (usan vSel) ──
  const porVend=(vendedores||[]).map(({nombre:v})=>({v,total:vSel.filter(x=>x.vendedor===v).reduce((s,x)=>s+(x.total||0),0),cant:vSel.filter(x=>x.vendedor===v).length})).sort((a,b)=>b.total-a.total);
  const maxV=Math.max(...porVend.map(x=>x.total),1);
  const porMet=METODOS_PAGO.map(m=>({m,total:vSel.filter(v=>v.metodo_pago===m).reduce((s,v)=>s+(v.total||0),0),cant:vSel.filter(v=>v.metodo_pago===m).length})).filter(x=>x.cant>0).sort((a,b)=>b.total-a.total);
  const maxM=Math.max(...porMet.map(x=>x.total),1);
  // Mas vendidos: calcular desde vSel en lugar del campo vendidos global
  const vendidosPorProd=vSel.reduce((acc,v)=>{(v.items||[]).forEach(i=>{if(i.nombre)acc[i.nombre]=(acc[i.nombre]||0)+(i.cantidad||0);});return acc;},{});
  const topProd=Object.entries(vendidosPorProd).map(([nombre,cant])=>({nombre,cant})).sort((a,b)=>b.cant-a.cant).slice(0,5);
  const maxP=Math.max(...topProd.map(p=>p.cant),1);
  const sinCobrar=ventas.filter(v=>!v.cobrado);
  const sinEntregar=ventas.filter(v=>!v.entregado);
  const alertasStock=productos.filter(p=>p.activo&&estadoStock(p)!=="ok");

  const labelPeriodo=periodo==="hoy"?"Hoy":periodo==="dia"?diaEsp:periodo==="mes"?"Este mes":periodo==="mesEsp"?mesEsp:"Este año";

  const btnStyle=(activo)=>({background:activo?G.verde:G.sup2,color:activo?"#000":G.textoSec,border:`1px solid ${activo?G.verde:G.borde}`,borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",transition:"all .15s"});

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>

      {/* Selector de periodo */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <button onClick={()=>setPeriodo("hoy")} style={btnStyle(periodo==="hoy")}>Hoy</button>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>setPeriodo("dia")} style={btnStyle(periodo==="dia")}>Día</button>
          {periodo==="dia"&&(
            <input type="date" value={diaEsp} onChange={e=>setDiaEsp(e.target.value)}
              style={{background:G.sup2,border:`1px solid ${G.verde}`,borderRadius:7,padding:"5px 8px",color:G.texto,fontSize:12,outline:"none"}}/>
          )}
        </div>
        <button onClick={()=>setPeriodo("mes")} style={btnStyle(periodo==="mes")}>Este mes</button>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <button onClick={()=>setPeriodo("mesEsp")} style={btnStyle(periodo==="mesEsp")}>Mes</button>
          {periodo==="mesEsp"&&(
            <input type="month" value={mesEsp} onChange={e=>setMesEsp(e.target.value)}
              style={{background:G.sup2,border:`1px solid ${G.verde}`,borderRadius:7,padding:"5px 8px",color:G.texto,fontSize:12,outline:"none"}}/>
          )}
        </div>
        <button onClick={()=>setPeriodo("anio")} style={btnStyle(periodo==="anio")}>Este año</button>
        <span style={{fontSize:12,color:G.textoSec,marginLeft:4}}>{cantVentas} ventas</span>
      </div>

      {/* Fila 1: Ventas y Ganancia */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label={`Facturación Neta — ${labelPeriodo}`} value={fmt(facturacion)} sub={`${cantVentas} ventas`} color={G.verde} accent={"#00C48C33"}/>
        <MetricCard label="Ganancia Neta" value={fmt(gananciaNeta)} color={G.verde} sub={`${pctGanancia}% sobre ventas`}/>
        <MetricCard label="% Ganancia" value={`${pctGanancia}%`} color={pctGanancia>=30?G.verde:pctGanancia>=15?G.amarillo:G.rojo} sub="Ganancia / Facturación"/>
        <MetricCard label="Ticket Promedio" value={fmt(ticketProm)} color={G.azul} sub="Por venta"/>
      </div>

      {/* Fila 2: Gastos y Ganancia Real */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Gastos Fijos" value={fmt(gastosFijos)} color={G.rojo} accent={"#FF4D6A33"}/>
        <MetricCard label="Gastos Variables" value={fmt(gastosVar)} color={G.naranja} accent={"#FF8C4233"}/>
        <MetricCard label="Ganancia Real" value={fmt(gananciaReal)} color={gananciaReal>=0?G.verde:G.rojo} sub={`Gan. Neta − G.Fijos (${fmt(gastosFijos)})`} accent={gananciaReal>=0?"#00C48C22":"#FF4D6A22"}/>
        <MetricCard label="% Ganancia Real" value={`${pctGananciaReal}%`} color={pctGananciaReal>=20?G.verde:pctGananciaReal>=5?G.amarillo:G.rojo} sub="Ganancia Real / Facturación"/>
      </div>

      {/* Nos deben + Sin entregar clickeables */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        <div onClick={()=>{onFiltroIngresos("sinCobrar");onNavegar("ingresos");}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <MetricCard label="Nos deben — click para ver" value={fmt(totalNosDeben)} color={G.azul} sub={`${sinCobrar.length} ventas sin cobrar`} accent={"#4D9EFF44"}/>
        </div>
        <div onClick={()=>{onFiltroIngresos("sinEntregar");onNavegar("ingresos");}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <MetricCard label="Sin entregar — click para ver" value={fmtNum(sinEntregar.length)} color={G.amarillo} sub="ventas pendientes de entrega" accent={"#FFB80033"}/>
        </div>
      </div>
      {alertasStock.length>0&&(
        <div onClick={()=>{onNavegar("productos");setTimeout(()=>{const el=document.getElementById("panel-reposicion");if(el)el.scrollIntoView({behavior:"smooth"});},300);}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <Card style={{border:`1px solid #FF8C4233`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <ST>Stock critico ({alertasStock.length} productos) — click para ver</ST>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
              {alertasStock.slice(0,6).map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:6,background:G.sup2,borderRadius:6,padding:"4px 10px",fontSize:12}}>
                  <span style={{color:G.textoSec}}>{p.nombre}</span>
                  <Badge color={estadoStock(p)==="agotado"?"rojo":"amarillo"} small>{p.stock===0?"AGOTADO":p.stock}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
        <Card>
          <ST>Vendedores — {labelPeriodo}</ST>
          {porVend.map(x=>(
            <div key={x.v} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:500}}>{x.v}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.verde}}>{fmt(x.total)}</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(x.total/maxV)*100}%`,background:G.verde,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>{x.cant} ventas</div>
            </div>
          ))}
        </Card>
        <Card>
          <ST>Metodo de pago — {labelPeriodo}</ST>
          {porMet.map(x=>(
            <div key={x.m} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,fontWeight:500}}>{x.m}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.azul}}>{fmt(x.total)}</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(x.total/maxM)*100}%`,background:G.azul,borderRadius:3}}/></div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>{x.cant} transacciones</div>
            </div>
          ))}
        </Card>
        <Card>
          <ST>Mas vendidos — {labelPeriodo}</ST>
          {topProd.length===0&&<div style={{fontSize:12,color:G.textoSec}}>Sin datos para este periodo</div>}
          {topProd.map((p,i)=>(
            <div key={i} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:500}}>{p.nombre}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.violeta}}>{fmtNum(p.cant)} u.</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(p.cant/maxP)*100}%`,background:G.violeta,borderRadius:3}}/></div>
            </div>
          ))}
        </Card>
      </div>

    </div>
  );
}

// ============================================================
// MODULO: NUEVA VENTA
// ============================================================
function ModuloVenta({clientes,productos,onRegistrar,vendedores,esAdmin=true}){
  const METODOS_VENTA = ["Efectivo","Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const DESC_POR_METODO = {
    "Efectivo":10,
    "Transferencia MP":5,"Transferencia Banco":5,
    "Debito MP":0,"Debito Banco":0,
    "Credito MP":0,"Credito Banco":0,"Credito Cuotas Banco":0,
  };

  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  const [vendedor,  setVendedor]  = useState(nombresVend[0]||"");
  const [metodo,    setMetodo]    = useState("Efectivo");
  const [modalidad, setModalidad] = useState(MODALIDADES[0]);
  const [descuento, setDescuento] = useState("10");
  const [items,     setItems]     = useState([]);
  const [busqueda,  setBusqueda]  = useState("");
  const [cobrado,   setCobrado]   = useState(true);
  const [entregado, setEntregado] = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [ok,        setOk]        = useState(false);

  // Metodo de pago cambia el descuento automaticamente
  function cambiarMetodo(nuevoMetodo){
    setMetodo(nuevoMetodo);
    // Si es delivery/telefonica, sin descuento sin importar el metodo
    if(modalidad==="Telefonica / Delivery"){
      setDescuento("0");
    } else {
      setDescuento(String(DESC_POR_METODO[nuevoMetodo]??0));
    }
  }

  function cambiarModalidad(nuevaModalidad){
    setModalidad(nuevaModalidad);
    if(nuevaModalidad==="Telefonica / Delivery"){
      setDescuento("0");
    } else {
      // Restaurar descuento según metodo de pago actual
      setDescuento(String(DESC_POR_METODO[metodo]??0));
    }
  }

  // Cliente siempre Consumidor Final por default (no hay clienteId)
  const [clienteId, setClienteId] = useState("");
  const cliente     = clientes.find(c=>String(c.id)===String(clienteId));
  const tipoCliente = cliente?.tipo||"minorista";

  const prodFiltrados=useMemo(()=>{
    if(!busqueda)return productos.filter(p=>p.activo);
    const q=busqueda.toLowerCase();
    return productos.filter(p=>p.activo&&(p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q)||p.categoria.toLowerCase().includes(q)));
  },[busqueda,productos]);

  // No auto-seleccionar cliente: default es Consumidor Final (sin clienteId)

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
    setTimeout(()=>{setItems([]);setDescuento("10");setMetodo("Efectivo");setModalidad(MODALIDADES[0]);setClienteId("");setOk(false);},2000);
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:360,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>Venta registrada</div><div style={{color:G.textoSec}}>Guardada en la base de datos</div></div>);

  return(
    <div style={{display:"grid",gridTemplateColumns:"1fr 310px",gap:18,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card>
          <ST>Datos de la venta</ST>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Fi label="Cliente" value={clienteId} onChange={setClienteId} options={[{value:"",label:"Consumidor Final (minorista)"},...clientes.map(c=>({value:String(c.id),label:`${c.nombre} (${c.tipo})`}))]}/>
            <Fi label="Vendedor"       value={vendedor}  onChange={setVendedor}  options={(vendedores||[]).map(v=>v.nombre)}/>
            <Fi label="Metodo de pago" value={metodo}    onChange={cambiarMetodo} options={METODOS_VENTA}/>
            <Fi label="Modalidad"      value={modalidad} onChange={cambiarModalidad} options={MODALIDADES}/>
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
        {esAdmin
          ? <Fi label="Descuento (%)" value={descuento} onChange={setDescuento} type="number" placeholder="0"/>
          : <div style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:2,textTransform:"uppercase",letterSpacing:0.5}}>Descuento</div>
              <div style={{fontFamily:"DM Mono,monospace",fontWeight:600,fontSize:15}}>{descuento}%</div>
            </div>
        }
        <Div/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <span style={{fontSize:14,fontWeight:600}}>Total</span>
          <span style={{fontSize:22,fontWeight:700,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(total)}</span>
        </div>
        {esAdmin&&<div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:G.textoSec,marginTop:4}}><span>Ganancia</span><span style={{color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(ganancia)}</span></div>}
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
function ModuloIngresos({ventas,vendedores,productos,onEditar,onEliminar,totalVentas,filtroInicial="",esAdmin=true}){
  const [fVend,setFV]=useState("Todos");
  const [fMet,setFM]=useState("Todos");
  const [fFecha,setFF]=useState(filtroInicial?"":hoy());
  const [fEstado,setFEstado]=useState(filtroInicial); // "sinCobrar" | "sinEntregar" | 
  const [confirmarElim,setConfirmarElim]=useState(null);
  const [ventasFecha,setVentasFecha]=useState(null); // ventas cargadas por fecha especifica
  const [loadingFecha,setLoadingFecha]=useState(false);

  // Cuando cambia la fecha, si no está en las ventas cargadas, buscar en Supabase
  useEffect(()=>{
    if(!fFecha){setVentasFecha(null);return;}
    const enMemoria=ventas.some(v=>v.fecha===fFecha);
    if(enMemoria){setVentasFecha(null);return;}
    // No está en memoria, buscar en Supabase
    setLoadingFecha(true);
    supabase.from("ventas").select("*, venta_items(*)")
      .eq("fecha",fFecha).order("hora",{ascending:false})
      .then(({data})=>{
        setVentasFecha(data||[]);
        setLoadingFecha(false);
      });
  },[fFecha,ventas]);

  // Usar ventasFecha si está disponible, sino filtrar de las cargadas en memoria
  const ventasBase = ventasFecha !== null ? ventasFecha : ventas;
  const [editandoV,    setEditandoV]    = useState(null);
  const [quickEditV,   setQuickEditV]   = useState(null);
  const [qeCobrado,    setQeCobrado]    = useState(true);
  const [qeEntregado,  setQeEntregado]  = useState(true);
  const [qeComision,   setQeComision]   = useState("0");
  const [qeLoading,    setQeLoading]    = useState(false);

  function abrirQuickEdit(v){
    setQuickEditV(v);
    setQeCobrado(v.cobrado??true);
    setQeEntregado(v.entregado??true);
    setQeComision(String(v.comision_plataforma||0));
  }
  async function guardarQuickEdit(){
    if(!quickEditV)return; setQeLoading(true);
    const comision=parseFloat(qeComision)||0;
    await onEditar(quickEditV.id,{cobrado:qeCobrado,entregado:qeEntregado,comision_plataforma:comision});
    setQeLoading(false);setQuickEditV(null);
  }
  const [evCliente,  setEvCliente]  = useState("");
  const [evVendedor, setEvVendedor] = useState("");
  const [evMetodo,   setEvMetodo]   = useState("");
  const [evCobrado,  setEvCobrado]  = useState(true);
  const [evEntregado,setEvEntregado]= useState(true);
  const [evComision, setEvComision] = useState("0");
  const [evItems,    setEvItems]    = useState([]);
  const [evLoading,  setEvLoading]  = useState(false);

  const METODOS_CON_COMISION = ["Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const redondear100 = n => Math.ceil(n/100)*100;

  function abrirEditarVenta(v){
    setEditandoV(v);
    setEvCliente(v.cliente_nombre||"");
    setEvVendedor(v.vendedor||"");
    setEvMetodo(v.metodo_pago||METODOS_PAGO[0]);
    setEvCobrado(v.cobrado??true);
    setEvEntregado(v.entregado??true);
    setEvComision(String(v.comision_plataforma||0));
    setEvItems((v.items||[]).map(i=>({...i,precio:String(i.precio),cantidad:String(i.cantidad)})));
  }
  const [evBusqueda, setEvBusqueda] = useState("");

  function actualizarItem(idx,campo,valor){
    setEvItems(prev=>prev.map((it,i)=>i===idx?{...it,[campo]:valor}:it));
  }
  function agregarItemDesdeProducto(prod){
    setEvItems(prev=>[...prev,{
      nombre:prod.nombre,
      cantidad:"1",
      precio:String(prod.precio_min),
      costo:prod.costo||0,
      producto_id:prod.id
    }]);
    setEvBusqueda("");
  }
  function eliminarItem(idx){
    setEvItems(prev=>prev.filter((_,i)=>i!==idx));
  }
  async function guardarVenta(){
    if(!editandoV)return; setEvLoading(true);
    const itemsNum=evItems.map(i=>({...i,cantidad:parseFloat(i.cantidad)||0,precio:parseFloat(i.precio)||0}));
    const bruto=itemsNum.reduce((s,i)=>s+i.precio*i.cantidad,0);
    const desc=editandoV.descuento||0;
    const total=redondear100(bruto*(1-desc/100));
    const ganBruta=itemsNum.reduce((s,i)=>s+(i.precio-(i.costo||0))*i.cantidad,0);
    const comision=parseFloat(evComision)||0;
    const ganancia=Math.round(ganBruta*(1-desc/100)-comision);
    await onEditar(editandoV.id,{
      cliente_nombre:evCliente,vendedor:evVendedor,metodo_pago:evMetodo,
      cobrado:evCobrado,entregado:evEntregado,comision_plataforma:comision,total,ganancia,
    });
    await supabase.from("venta_items").delete().eq("venta_id",editandoV.id);
    if(itemsNum.length>0){
      await supabase.from("venta_items").insert(
        itemsNum.map(i=>({venta_id:editandoV.id,nombre:i.nombre,cantidad:i.cantidad,precio:i.precio,costo:i.costo||0,producto_id:i.producto_id||null}))
      );
    }
    setEvLoading(false);setEditandoV(null);
  }
  const filtrados=useMemo(()=>ventas.filter(v=>{
    if(fVend!=="Todos"&&v.vendedor!==fVend)return false;
    if(fMet!=="Todos"&&v.metodo_pago!==fMet)return false;
    if(fFecha&&v.fecha!==fFecha)return false;
    if(fEstado==="sinCobrar"&&v.cobrado)return false;
    if(fEstado==="sinEntregar"&&v.entregado)return false;
    return true;
  }),[ventas,fVend,fMet,fFecha,fEstado]);
  const totalF=filtrados.reduce((s,v)=>s+(v.total||0),0);
  const ganF=filtrados.reduce((s,v)=>s+(v.ganancia||0),0);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:esAdmin?"repeat(3,1fr)":"repeat(2,1fr)",gap:12}}>
        <MetricCard label={fFecha?"Ventas del dia":"Ventas (filtro)"} value={fmtNum(filtrados.length)} sub={fFecha?fFecha:`de ${fmtNum(totalVentas)} historicas`}/>
        <MetricCard label="Total"           value={fmt(totalF)}   color={G.verde}/>
        {esAdmin&&<MetricCard label="Ganancia neta"   value={fmt(ganF)}     color={G.verde} sub={`${totalF>0?Math.round(ganF/totalF*100):0}% margen`}/>}
      </div>
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <Fi value={fVend} onChange={setFV} options={["Todos",...(vendedores||[]).map(v=>v.nombre)]}   style={{flex:1,minWidth:130}}/>
          <Fi value={fMet}  onChange={setFM} options={["Todos",...METODOS_PAGO]} style={{flex:1,minWidth:130}}/>
          <Fi value={fFecha} onChange={setFF} type="date" style={{flex:1,minWidth:130}}/>
          <Fi value={fEstado} onChange={setFEstado} options={[{value:"",label:"Todos los estados"},{value:"sinCobrar",label:"Sin cobrar"},{value:"sinEntregar",label:"Sin entregar"}]} style={{flex:1,minWidth:130}}/>
          {(fFecha||fEstado)&&<Btn small variant="ghost" onClick={()=>{setFF("");setFEstado("");}}>Limpiar</Btn>}
        </div>
      </Card>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(v=>(
          <Card key={v.id} style={{padding:"12px 18px",cursor:esAdmin?undefined:"pointer"}} onClick={!esAdmin?()=>abrirQuickEdit(v):undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{v.cliente_nombre}</div>
                <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{v.fecha} · {v.hora?.slice(0,5)} · {v.vendedor} · {v.metodo_pago}</div>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <Badge color={v.modalidad?.includes("local")?"azul":"gris"}>{v.modalidad?.includes("local")?"Local":"Delivery"}</Badge>
                  <Badge color={v.cobrado?"verde":"rojo"}>{v.cobrado?"Cobrado":"Sin cobrar"}</Badge>
                  <Badge color={v.entregado?"verde":"amarillo"}>{v.entregado?"Entregado":"Sin entregar"}</Badge>
                  {v.descuento>0&&<Badge color="amarillo">-{v.descuento}%</Badge>}
                  {v.metodo_pago!=="Efectivo"&&!(v.comision_plataforma>0)&&(
                    <span style={{background:"#FFB80022",color:G.amarillo,border:"1px solid #FFB80055",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:600,letterSpacing:0.3,cursor:"pointer"}} title="Falta cargar la comisión de plataforma">⚠ Sin comisión</span>
                  )}
                  {v.metodo_pago!=="Efectivo"&&v.comision_plataforma>0&&(
                    <Badge color="gris">Comisión {fmt(v.comision_plataforma)}</Badge>
                  )}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:18,fontWeight:700,color:G.verde,fontFamily:"'DM Mono',monospace"}}>{fmt(v.total)}</div>
                  {esAdmin&&<div style={{fontSize:11,color:G.textoSec}}>Ganancia: {fmt(v.ganancia)}</div>}
                </div>
                {esAdmin&&<Btn small variant="ghost" onClick={()=>abrirEditarVenta(v)}>Editar</Btn>}
                {esAdmin&&<Btn small variant="danger" onClick={()=>setConfirmarElim(v)}>Eliminar</Btn>}
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

      {editandoV&&(()=>{
        const itemsNum=evItems.map(i=>({...i,cantidad:parseFloat(i.cantidad)||0,precio:parseFloat(i.precio)||0}));
        const bruto=itemsNum.reduce((s,i)=>s+i.precio*i.cantidad,0);
        const desc=editandoV.descuento||0;
        const totalPreview=redondear100(bruto*(1-desc/100));
        const ganBruta=itemsNum.reduce((s,i)=>s+(i.precio-(i.costo||0))*i.cantidad,0);
        const comision=parseFloat(evComision)||0;
        const ganPreview=Math.round(ganBruta*(1-desc/100)-comision);
        const conComision=METODOS_CON_COMISION.includes(evMetodo);
        return(
        <Modal title="Editar venta" onClose={()=>setEditandoV(null)} maxWidth={640}
          footer={<><Btn variant="secondary" onClick={()=>setEditandoV(null)}>Cancelar</Btn><Btn disabled={evLoading} onClick={guardarVenta}>{evLoading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cambios"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec,display:"flex",justifyContent:"space-between"}}>
              <span>{editandoV.fecha} · {editandoV.nro_factura}</span>
              <span style={{color:G.verde,fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(totalPreview)}</span>
            </div>
            <Fi label="Cliente" value={evCliente} onChange={setEvCliente} placeholder="Nombre del cliente"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Vendedor"       value={evVendedor} onChange={setEvVendedor} options={(vendedores||[]).map(v=>v.nombre)}/>
              <Fi label="Metodo de pago" value={evMetodo}   onChange={v=>{setEvMetodo(v);if(!METODOS_CON_COMISION.includes(v))setEvComision("0");}} options={METODOS_PAGO}/>
            </div>
            {conComision&&(
              <div style={{background:"#4D9EFF11",border:"1px solid #4D9EFF33",borderRadius:8,padding:"10px 14px"}}>
                <Fi label="Comision plataforma ($)" value={evComision} onChange={setEvComision} type="number" min="0" placeholder="0"/>
                {comision>0&&<div style={{fontSize:11,color:G.textoSec,marginTop:6}}>Ganancia luego de comision: <strong style={{color:G.verde}}>{fmt(ganPreview)}</strong></div>}
              </div>
            )}
            <div style={{display:"flex",gap:20}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={evCobrado}   onChange={e=>setEvCobrado(e.target.checked)}/> Cobrado
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={evEntregado} onChange={e=>setEvEntregado(e.target.checked)}/> Entregado
              </label>
            </div>
            <Div/>
            <ST>Productos de la venta</ST>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 70px 100px 32px",gap:8,fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,padding:"0 2px"}}>
                <span>Producto</span><span style={{textAlign:"center"}}>Cant.</span><span style={{textAlign:"right"}}>Precio unit.</span><span/>
              </div>
              {evItems.map((item,idx)=>(
                <div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 70px 100px 32px",gap:8,alignItems:"center"}}>
                  <div style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:7,padding:"7px 10px",fontSize:12,color:G.texto,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={item.nombre}>{item.nombre}</div>
                  <input type="number" min="1" value={item.cantidad} onChange={e=>actualizarItem(idx,"cantidad",e.target.value)}
                    style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:7,padding:"7px 8px",color:G.texto,fontSize:12,outline:"none",textAlign:"center",width:"100%"}}/>
                  <input type="number" min="0" value={item.precio} onChange={e=>actualizarItem(idx,"precio",e.target.value)}
                    style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:7,padding:"7px 8px",color:G.texto,fontSize:12,outline:"none",textAlign:"right",width:"100%"}}/>
                  <button onClick={()=>eliminarItem(idx)} style={{background:"#FF4D6A18",border:"1px solid #FF4D6A33",borderRadius:7,color:G.rojo,cursor:"pointer",fontSize:14,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
              ))}
              {/* Buscador para agregar producto */}
              <div style={{marginTop:6,position:"relative"}}>
                <input
                  value={evBusqueda}
                  onChange={e=>setEvBusqueda(e.target.value)}
                  placeholder="+ Buscar y agregar producto..."
                  style={{background:G.sup2,border:`1px solid ${G.verde}55`,borderRadius:7,padding:"8px 12px",color:G.texto,fontSize:12,outline:"none",width:"100%"}}
                />
                {evBusqueda.length>1&&(()=>{
                  const hits=(productos||[]).filter(p=>p.nombre.toLowerCase().includes(evBusqueda.toLowerCase())&&p.activo!==false).slice(0,8);
                  if(!hits.length) return <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:7,zIndex:50,padding:"10px 14px",fontSize:12,color:G.textoSec}}>Sin resultados</div>;
                  return(
                    <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:7,zIndex:50,maxHeight:220,overflowY:"auto"}}>
                      {hits.map(p=>(
                        <div key={p.id} onClick={()=>agregarItemDesdeProducto(p)}
                          style={{padding:"9px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${G.borde}22`,fontSize:12}}
                          onMouseEnter={e=>e.currentTarget.style.background=G.sup2}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <span>{p.nombre}</span>
                          <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontSize:11}}>{fmt(p.precio_min)}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
            {desc>0&&<div style={{fontSize:12,color:G.textoSec}}>Descuento: <strong style={{color:G.amarillo}}>{desc}%</strong> · Total redondeado al multiplo de $100 superior</div>}
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",fontSize:13}}>
              <span style={{color:G.textoSec}}>Total venta</span>
              <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde}}>{fmt(totalPreview)}</span>
            </div>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",fontSize:13}}>
              <span style={{color:G.textoSec}}>Ganancia neta{comision>0?" (−comision)":""}</span>
              <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:ganPreview>=0?G.verde:G.rojo}}>{fmt(ganPreview)}</span>
            </div>
          </div>
        </Modal>
        );
      })()}

      {/* Quick edit para usuario local */}
      {quickEditV&&(
        <Modal title="Actualizar venta" onClose={()=>setQuickEditV(null)}
          footer={<><Btn variant="secondary" onClick={()=>setQuickEditV(null)}>Cancelar</Btn><Btn disabled={qeLoading} onClick={guardarQuickEdit}>{qeLoading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              <div style={{fontWeight:600,color:G.texto}}>{quickEditV.cliente_nombre}</div>
              <div>{quickEditV.fecha} · {quickEditV.vendedor} · {fmt(quickEditV.total)}</div>
            </div>
            <div style={{display:"flex",gap:20}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={qeCobrado} onChange={e=>setQeCobrado(e.target.checked)}/> Cobrado
              </label>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}>
                <input type="checkbox" checked={qeEntregado} onChange={e=>setQeEntregado(e.target.checked)}/> Entregado
              </label>
            </div>
            {quickEditV.metodo_pago!=="Efectivo"&&(
              <div style={{background:"#4D9EFF11",border:"1px solid #4D9EFF33",borderRadius:8,padding:"10px 14px"}}>
                <Fi label="Comisión plataforma ($)" value={qeComision} onChange={setQeComision} type="number" min="0" placeholder="0"/>
              </div>
            )}
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
function ModuloEgresos({egresos,onRegistrar,onReembolsar,vendedores,proveedores,onEditar,onEliminar,esAdmin=true}){
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
  const [efReembolsado,setEFReemb]=useState("0");
  const [eLoading,setELoad]=useState(false);

  function abrirEditarEgreso(e){
    setEditandoEg(e);setEFC(e.concepto);setEFM(String(e.monto));setEFTipo(e.tipo);
    setEFMet(e.metodo_pago);setEFPag(e.pagador);setEFNotas(e.notas||"");
    setEFReemb(String(e.monto_reembolsado||0));setModalEdit(true);
  }
  async function guardarEgreso(){
    if(!editandoEg)return; setELoad(true);
    const montoR=parseFloat(efReembolsado)||0;
    const montoT=parseFloat(efMonto)||0;
    const saldoPend=Math.max(0,montoT-montoR);
    await onEditar(editandoEg.id,{concepto:efConcepto,monto:montoT,tipo:efTipo,metodo_pago:efMetodo,pagador:efPagador,notas:efNotas,monto_reembolsado:montoR,saldo_pendiente:saldoPend,reembolso_pendiente:efPagador!=="Pensok"&&saldoPend>0,reembolsado:efPagador!=="Pensok"&&saldoPend===0});
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
  const totalPendVend=pendReem.reduce((s,e)=>s+(e.monto||0)-(e.monto_reembolsado||0),0);
  const totalPendPensok=egresos.filter(e=>e.pagador==="Pensok"&&(e.saldo_pendiente||0)>0).reduce((s,e)=>s+(e.saldo_pendiente||0),0);
  const totalPend=totalPendVend+totalPendPensok;
  const egresosMes=egresos.filter(e=>e.fecha?.startsWith(mesAct()));
  const totalMes=egresosMes.reduce((s,e)=>s+(e.monto||0),0);
  const totalMesPagado=egresosMes.filter(e=>e.pagador==="Pensok"||(e.reembolsado===true)).reduce((s,e)=>s+(e.monto||0),0);
  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  const deudasPers=nombresVend.map(v=>({persona:v,deuda:egresos.filter(e=>e.pagador===v&&e.reembolso_pendiente&&!e.reembolsado).reduce((s,e)=>s+(e.monto||0)-(e.monto_reembolsado||0),0)})).filter(d=>d.deuda>0);
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
        {esAdmin&&<MetricCard label="Pagado este mes"  value={fmt(totalMesPagado)} color={G.rojo} sub={`Total devengado: ${fmt(totalMes)}`}/>}
        {esAdmin&&<MetricCard label="Seleccion"        value={fmt(totalF)}/>}
        {esAdmin&&<MetricCard label="A reembolsar"     value={fmt(totalPend)}  color={G.amarillo} accent={totalPend>0?"#FFB80044":undefined}/>}
        {esAdmin&&<MetricCard label="Registros"        value={fmtNum(filtrados.length)}/>}
      </div>
      {deudasPers.length>0&&(
        <Card style={{border:`1px solid #FFB80033`,background:"#FFB80006"}}>
          <ST>💸 Reembolsos pendientes</ST>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {deudasPers.map(d=>(
              <div key={d.persona} style={{background:G.sup2,border:`1px solid ${d.esPensok?"#FF4D6A44":G.borde}`,borderRadius:10,padding:"10px 16px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <Avatar nombre={d.persona} size={28} color={d.esPensok?G.rojo:undefined}/>
                  <span style={{fontWeight:600,fontSize:13}}>{d.persona}</span>
                  {d.esPensok&&<Badge color="rojo">Deuda propia</Badge>}
                </div>
                <div style={{fontSize:18,fontWeight:700,color:d.esPensok?G.rojo:G.amarillo,fontFamily:"'DM Mono',monospace"}}>{fmt(d.deuda)}</div>
                <div style={{fontSize:11,color:G.textoSec}}>{d.esPensok?"Pensok debe a proveedores":"Pensok le debe"}</div>
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
                    {e.reembolso_pendiente&&!e.reembolsado&&(e.monto_reembolsado||0)>0&&<span style={{fontSize:11,color:G.amarillo}}>Abonado: {fmt(e.monto_reembolsado)} · Saldo: {fmt(e.saldo_pendiente||0)}</span>}
                    {e.reembolsado&&<Badge color="verde">✓ Reembolsado</Badge>}
                    {e.notas&&<span style={{fontSize:11,color:G.textoSec,fontStyle:"italic"}}>{e.notas}</span>}
                  </div>
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <div style={{fontSize:18,fontWeight:700,color:G.rojo,fontFamily:"'DM Mono',monospace"}}>{fmt(e.monto)}</div>
                {esAdmin&&e.reembolso_pendiente&&!e.reembolsado&&<Btn small variant="outline" onClick={()=>onReembolsar(e.id)}>Marcar reembolsado</Btn>}
                <div style={{display:"flex",gap:6}}>
                  {esAdmin&&<Btn small variant="ghost" onClick={()=>abrirEditarEgreso(e)}>Editar</Btn>}
                  {esAdmin&&<Btn small variant="danger" onClick={()=>setConfirmarElimEg(e)}>Eliminar</Btn>}
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
              <Fi label="Monto total ($)" value={efMonto} onChange={setEFM} type="number"/>
              <Fi label="Metodo pago" value={efMetodo} onChange={setEFMet} options={METODOS_PAGO}/>
              <Fi label="Quien pago" value={efPagador} onChange={setEFPag} options={["Pensok",...(vendedores||[]).map(v=>v.nombre)]}/>
              <Fi label="Ya reembolsado ($)" value={efReembolsado} onChange={setEFReemb} type="number" placeholder="0"/>
            </div>
            {parseFloat(efReembolsado)>0&&parseFloat(efReembolsado)<parseFloat(efMonto)&&(
              <div style={{background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:8,padding:"8px 12px",fontSize:12,color:G.amarillo}}>
                Saldo pendiente: <strong>{fmt(parseFloat(efMonto)-parseFloat(efReembolsado))}</strong>
              </div>
            )}
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
function ModuloProductos({productos,onGuardar,proveedores,esAdmin=true}){
  const [busqueda,  setB]       = useState("");
  const [filtroC,   setFC]      = useState("Todas");
  const [filtroE,   setFE]      = useState("Todos");
  const [filtroProv,setFPr]     = useState("Todos");
  const [filtroMarca,setFMarca] = useState("Todas");
  const [sortCol,   setSortCol] = useState("nombre");
  const [sortDir,   setSortDir] = useState("asc");
  const [modal,setModal]=useState(false); const [editando,setEditando]=useState(null);
  const [fCodigo,setFK]=useState(""); const [fNombre,setFN]=useState(""); const [fCat,setFCat]=useState(CATEGORIAS[0]);
  const [modalLista, setModalLista] = useState(false);
  const [tipoLista,  setTipoLista]  = useState("minorista");
  const [generando,  setGenerando]  = useState(false);
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
  const r100 = n => Math.ceil(n/100)*100;
  const precioMin = costo>0&&ganMin>0 ? r100(costo*(1+ganMin/100)) : 0;
  const precioEsp = precioMin>0 ? r100(precioMin*0.95) : 0;
  const precioMay = costo>0&&ganMay>0 ? r100(costo*(1+ganMay/100)) : 0;

  async function generarListaPDF(tipo, productos_filtrados){
    setGenerando(true);
    // Cargar jsPDF dinámicamente
    if(!window.jspdf){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W=210, H=297;
    const azul=[20,53,107], azulClaro=[41,98,180], gris=[100,100,100], grisClar=[240,242,245], negro=[30,30,30], blanco=[255,255,255], verde=[0,168,120];

    const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAQABAADASIAAhEBAxEB/8QAGwABAQADAQEBAAAAAAAAAAAAAAEEBQYDAgf/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAC1Q78rAAAAABAAAAAAAUEABQQAAAAFABAAUAAEABQAQFAAAAAABAAUEAABQAAAAQAAFBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCoKAAAAAhaAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQACABYKACBAWoKCWCpQESwAAWVQCUELABFhalBBYSpQAFABAAUAAEAAAAAAAAAJQAAAAAAAQAAAqVUAEqFqUEKgssAQAChRAEAAqVYAEBQQAAAFBAAAUAEBQQUEAAAAAAAKgqCoAKlEABYLAAAqUAAAAJQBLAAAAAAAACoUEBbLAEUVABAAAAAAAAAUUgAQAFABAAAAKgsoiwAKIAAAAAFBABSLAAAAAABYKgoUQWVAAAEsUEAAAAAAAAABalIAEBQAQAAAAAFoEAEAFWKIoiiLAEAAoAAEsAAAAAFgAAWCyiAKIAAAAABZVSiAqCpQEQUEBQQAAAAFBAAAUEBQQAAAAAAAAFBAAKFBBFABAAAKAABKWKIEAAAAWVQSUAJYKCAAsoiwAAoAWBAAWoAAAAAAQAAFBAAAAAAAAAAAAAAUAAABYAAQAAAAABYKAACLFBAAAAAAAAAAAFgAAUAAEpYEAAAABQAAQAAAAAAAAAAAAAFABAUAAAEBQAQAAAFBAAAKgsFWCwQAAAAAAAAAAAAAACpSBagBAAAAAClgAQAFBAAAAACiAKIAAAAFBAUEAAAAAAABQQFABAAAAAAAAAAAAAAAAAAAAAFgAAABQQAACwUEABQQAAAABYKgAAAAAAAMnYy6V1OZm8Zk9ml5P26ZLzv3vxoPnoRzfl1I4/w7hZwM7vDrkHQ67WdesoEAABQQAAAAAAAAAAAAAAFBAAAABSAAAAAAAAAABQAQAAAAAAAAAAAbNdZkdLsca0G2yWNWY+tN05XC1ns8XkFdP5c4s3/wAaMbv60Sug9ObR1mRxdjvLweXL2Lndjm52s2tl5PXd747zw7f6XefIUCAAAAAAoIAAAAKRRFgAAAAAAAAAAAAAAAAAACgAgAKCAAAAAADLXE2W82HPWJlsTGsvy5zVbz0OoxG8rFgAAAAAAAAH3tNQXrthwOVjXa/Go3HPWk0Pd+WpwrdabpiCwAAFABAAAAAFlAAEsAAAAAAAUAAEAAAABQAQAAAAFABAAAAF9uqmtdvbOW7j6jRazs9XHTIIAAAAABleGz9vO0dzsHsStIAAABkY5en2/A5uNdjhXN564rG7vm+mNONwAAAEAAAAFJQAASwAAAAAAABSwBAAAAUAAEAAAAAAAAAAZ/v0+N+fq0/PWby+N89cBrIAAAAApFgKbn7PAuNkjRza6r2PrLweo1rmHdazN5dstdvMCAAXf8+l768h1PLprea7zA1OQenn0wACAAAAFgAAAAAAAAAAAAosACAAAAoAICgAgAAAAAADdOkxsnLY176Q68woEAACl+snDD9M/wBObB9cpznl9/dwVc2iKBrtj87aP38Htve3V7Th0eHuOc0/d+O5w7cafpgEAZGOXs8vher5b++R7rEOMenn1wAACACiAAAAAAAAAAAABQCKACAAAAAAAAKCUQAAADa4/X419S8tjc1Z25ggAAC3Lyx8r0vGUc1spRFssWyxQtEAajwysX3Nn1HC/TXduY3fPeYJWFmk4rG7zmeuNSNZAffwXr8/hOw5b8+S7zU1y46YBAAAAAAAAAAAAAAAAKBLFBAUEAAAAAAAqVUAEAAevl1cuZ7tXx6YmgO3MLAABSe/368pfr5+uUt+bFspRLbPqFyMm3X3becut+8rxieZmAavF9fL3A0WDadFxP1nXeOf3/PdEuj57vdNvHNLOmAHv4F7j24/r+O+d0ne8buYg3kEAAAAAAAAAAAABQCgESlgQAAAApYoiiABAUAEAHsuy6bz9OPTw43M1/TEGsgAD6GS++OaMLZYtli1sl12XufS7wsvE1q7bAwmc+klxKWAHn6a3bEle1AAAMzDL2uTwvV8t54zrS8333O7xox0wA3uisve4nzm8enBTe6LtzCwAAAAAAAAAAAAFWUBAEFBAAAAKhQAAQAAAAFdNo+zxq6jacVm+UOvMAAC5U++OVlwoLZmxi7PZe16fH38ae62OpxrzxaZzaLbLFsRbIeen9PP2BOgAAAKfXzTq9lwfWcumwGNcjr+44vrz8xrIGX2XBdJje44nuNNm80OuAQAAAAAAAAAAAFABKCLFBAAAAAAAAAAFlIsBkL0G2fHDppOf9PPtzCwAB7+eTzlHPKyw+vromsXaF7MTE1Ux7ecuMWyxbKWxFsstPhPvVfPl6qh1AAACjqvna8983pu952tH6+Tpntcni+y47+tPuGbwLMw+/MEevkXu/rSb3j04jH6PnOvMLAAAAAAAAAAAAAAKFQAQAAAAAAAAABYLAdDoO3xr10e84rOseHXmAAr1j0+jhgC5M6Zv59UvVpPPDzzpc4WWW2D6SxbLFvzh1ka34eqoboIAAA6bH6DnsMbeXrprOaHbk3WlL3zCzeHTXcl33G9M4Y3kE9+34Hqsb2PDd5y8akdMggAAAAAAAAAAAALUAAIAAACgAgAAAAAGx63T7jl0wOR3Om3mDWQBRlePvyyHOMjy6i6+/QvaaH612edssxbLCywqivmX788PH7X08juAAAAAffwXufXkeu49AlYGeTgXQ6Htz+G7xD57DgerzrZ6fcfHPXCPr578wRs9Z9L3muz7w6cE+/jvzBAAAAAAAAAAAAUAAAAAEAAAFWLEAAAAGSvX+zE4dOT8DvzBAFn0ZH1Z58LNqufnF7tRk89MLmZ0xpvro8hrnPfeLrUemzLrvn453WcvA+XXIUAAAAAAA6LnfuXu3j7cegKAxsknAZ/1ru/Pv2LlcOnKazo+c7YC5A6racz0/Hpymr6Tm+uQsBAUEAAAAAAABQQFAoEsAAQAAAAAAAABuNP0mdbrTbnmMa1A68wAHt45OZ9jhn26rA2N7Bd4Gb9JBLaxca42bTeWpueYnjvGI9PPVCAAAAAUAEAA3XScJ3HPf2MbAA1XLd3wvTnvOh4rts6wuN73gtQN4Ayu14DvOe8bjO94OoN4AAAAAAAABQAAQFAABAAAAAAAAAAAL1vI9tjeRx3Y8LHmOmAAGZi5fPLMdDz16C9jz1VxuMDSfPXlnYUdOZFlQJfBceWc+wAAAqpYAgAAADqOX2+ddOOXQAc/ZveJeXTDt+I6eNxw3c8VLijpgB2XG9TjW24rtOSl1w6YAAAAAAAAAAAAAoIFAABAAAAFlUCBAAHecL3nPc4LuOHoN4AA9N3hdZy1Kxc7ydPrPPtx9InXiAAAAxMvBm5LMdAAAFgsAAAAABk41XvRw6gjhu55DecAdMN5o9lL1vGdnxeNYg6YAdHzm+zroeY6fnMa0Y68wAAAAAAAAAABQCBQAQAAAAAACwUEAA9O74buee8Xi+y42oN4ACt50XP+nLeRoPl24/Xr8/WsAgAFudiHlZRr8/Az0gzsAAAAAAAAABLDu/Ty9eHUFcv1Gk1nnB15szDyF7fiO34HnqDpgBu9JuprpNBv9Dz1z468wAAAAAAAAAAAABVgAQAAAAAAAAAAD27ng+857xOM7biKDeAArI+vH21gLn2WMgAMry2UjX7DDTEst01+wwZv4GOgAAAAAAAAAA9F7j6OHUAD40u911zyft45HbHXcR1XLYsG8gN3pN7NdDod/zvPWiHXmAAAAABZYAAACrAgCyrFCUQIAAAAAAAAABe94HuMb++E77gz5G8ALLX17eHvrD6+fq59QyAsyzI9DOXj7Q1NTWri5XmuEOfcAEAAAAAAFIomfg72XoBx6gANTttDc8/nYO07Y99LkY8RZYA6Lnepzrbcz03J41rB15gAAAAAAAAAVKARQAAgoIAAAAAAAsolgA7Dj+nzrccV2nK51qx05gLKMjH99Z+rGsewZA+tnjZUgSLBhY2z1uqC4fnm4WesVncWAIAAAA+/jp5czzz3Hpotd1zU4Pssj6AzoA8PBM7lui4/efHY6726Z8QiUQF7Dj+7xv74vs+Dj5HTAFlgAAAAAAAABUoItCAQKACAAAAAALAAA3mjzpew0W9wOXTkB25AAX087ZkI3z9r8fbKz3M6mcgAXXbDGrDhdPL1GAysbHaSpqBAABSPro5fDoHjy6ezj7qde0GzzcwSgCHJ6/08u/KiwIJQCAye25jp+XTF4rpuZ3kNZAoIsAAAAAAAAAWggFgBAAAAAAAAAAAH18l7y67ZcOnB/Oz1nfmCAAZF8vXpzvt4erP1mYeczkDMAAfH2rUqupQfH2ML42HxneEyPOb859l+Wbn5uj2XQ5WNY2VrtFLuua8p0wFgGVuecS9398Lu8b374+8a8eb6pZwTpub68/gWAVKCnT7Xz9OHXmNR6+XbmFgFSiAAAAAAAACgWAAACWUQAAAAAAAAAAG46fhe459NVy/ecNZ8DeAFgvv4ems+n18tYyMvAyGNiM5BQR8feNbiKaiiKrFuThZ3sMznbnp1vtxkzrsMXmhuNb4yyossAAoiiWD36PlU13zmOl5b+ud3vE6nwOnMBQbHXdRnW1wc7mue9MO3IAAFBAAAAAAAAUAAEAAqUiwAAFVKIEAAAAAdVyuwzrr+Z6bF574pZ25ggCwZF8fbpze3jWdhmaj3Z2DH+5PV4+BkYfn9W0SxSxRKJiY+z8J0w59TO4ogABQAABKEqpmYv0my1Nk0CAUHr2+i33Lp88P0PN6zBvIAAAKCAAAoAIAClgCAACgAEAAsoABFiggAAAHZ5nKdXx6crqu24rpmDWQAL6eash8/W+V9PImQ8vRKEUPq/H1KUsUSgBMXMS6ubPwm8J7eTUKBAABfWvFm/bON9vjWXjfmbgzQAL6efQS7r7arj00OKd+aCAAAAAAACqlECAAtgAigBKAAECgiygACWKCAAAAOw4/Mzrs+b6P4574R7+HbmCAVKX18bZ7pd81g9fvwqe74+2QPr687L9lliiKIoihLTw+ckuIyy4n1k1Mf0+/E9vPG+a+/gp5PjO0M6AAWWsjs8DY8ek4vcc/qIbwAoJRFgAAAAsFQAAAAAUAALAAgKCVBQAQKACAAAAdJu+D7Ll08OS73n7NCOmAAFgvt4WzIfH3vmAsHr945Mlj/ae314/R7Xx+pfRPrKKWKD5+a9Hh8GVMKVk+XmAqAeU+c7EzoAABusDsca+sfI5HGsL5O2EsQCgASwAAAAABQQABQSglUEIAAAAAAAAAAAAAAGbhF728103HpyOu7vjumMUayAAA9PO173w9NY+xcgAAALBUFAQVBUFQWTzl+/KM7CWAAFJ6/HWy+2S13Hph89Z25hYKSgAAlgAAAAACggALQgAKCQAAKCAAAAFgAAAAAAA6PnEvfeOv2/HpxON2/JdcYo1kACoKC+nksyHh9az6vn6uQAAAAAAD4+JfXz+E2GaABAAPp1MrZvDj0+OQ+/DriLNZAoBACglBKIsAAAAAACxahAKACAAAAAFJQAASiLAAAAAAC9Ry1l77y1e549OPwe85rpjTjeQAAFgqC2K+vrzJ6/Xgs97jjIY4954j1nml+vkUISgQqAAUnp7dXnXhsGLy398j8+PXAayAlhUAAFAAIVBUpFgAAAAKQAFABAFiggAFSgBCgiwVAAAAAAACt9oUd9eS6jl01vNd5j2cQ2Wt64BAAAAAAKgqCoFgoACCwAC+64+42ez56+Pto86zeV851wFyAsAAAAFAIWAABUoBFgAAspAoJQJRLKIKCALKsCAAAAAAAAAAAAAPfwL1uy4Db89dPrM72xricfvdP0zzLJxt5BAAAAAAAAKABKIv0fH1ud7nWk3/ANOe74aznrM7WnXAAIAAAAKRQAlEAAAsoAAQAAACqCAARYoIAAAAACggAAAAAAAAAAH3vefS9598Luue9/rs30zeU13e+e88I6nW6moe3jqAgAAApFUPqPlsNjNc9l9Tk4ul2/2zqtXorOg53DbyGsgAAAAAAUAAACUQAoBAAAAAAqiAAoIligAAAAAgAKCAAAoIAAAAAAAB9bTUl63Y8D6413Tl9jm7fw+cnN1mLvZXOePUrOS+evHIXr5XKe3TI5/J2yMXKfEvpNfrq6HH5TE1noNPjt5CwFBAAAABSLFBFlAAAAEsAKCAABSiKJQEKEAEUAAUgFlAIAUlBKSKIAAAAAFBAAAAAAAHr5DYZOmS9B7cyl6r65Mdb88oOo8ucG9xtWsyceKBAAAAUAEAAAAoIsVRABAAAAUAABQQAAQsFoQFAlBKIUgAFgAWBYKEAAgAAAAAAAAAAAAAAAAUEAAAAAAABQAQAAAFoRABaESlikgAAKAAAQqCoLAAoAUAEAEUAAAAEBQAAQAAAAAAAAoiiKIogAAAAAAAAAAAAAAAAAAClBEolAACAAAAWUIAAAAAAKAFABEFABAWgQAQAFBAAAPXOnW43ybq2byrqhxuJ3uNZxTNwumfbN+uqxrk3Vs3lHVjlHVjhPRm9MfPx17G+Cm21PTAJ75n31GN8lr+14mxXT2aHP6ac9895dNTjMTvtbqcks3g9unmudzennPXO+HUjhvPu9FrOgWbz9bHB7rOuT13ecQeA1ln5vRY3ynx1fJGEN4AAAgAAAAAAAAAAAAKAABLFAAAAABAAAAAAANj13I9dy6fOk3PC10H1zs1ntcnhu4xr44ju+Ts++q5bqJfjT7TibOhnPNTopzw9NhrNnZ1Q49fnkOx8bnh3v4dsbbqOX6jlvw4jt+J1ncdLp9xnXzpMvk7Nx76Budlq9DYnp576zbZT449PrWaHD6Z6LN5CWfoDmem570nN99xm8+Pc8N3MOI7fiTH3TpKfN5PGmuO3MEAWAAAAAAAAAAAAABYKAAAFgAAAAQApYoiiKIsAQDY9dyXW8unxwneaCzRN99ami7nFy8acr0/E2bHqOX6iXz0PRJeddEs53A7Hn7NDtNXtN56r4+/Dj0+vXj+usxeQ7vWVquo5jpzw4ntuI1N30fB9HG5wM9jXPYHYNTg/nuOa3nWdlxvcy+uj3nNZumHXmA7XiusxrZaHfabGuf7nhu51Gh3zOgl5XV7HXduQWAAAAKEUQABQAAAlEAAABQoIAAgoAIKsUSgCAAAIAAGy63kut5dI+eal6dzCzp/LlcKzYa06Z23Ucv1PLflznQcTZtpqpvO2xMRTaavaR1Xh7+HHpw+31Lvz75z/QcemLlEePD9vxHTB9/e5NjqadJs+I9MXuZXPfE9Xz2d0zvtJu/jGuEZmH25gjtdJ0nPbQb/AI2Xw7nhu6shzudbbM4LsLMnje2xTi338dcAgApKAACURYVBQAAAJSwAAFCAAAQKCALC0IAAAAQAUEBsut5LreXT44PvOD1A3gADa9Vy3U8unnp94l0c3pNG3g4nL8/TpnqvH28eW+HHfm6nlvqO8uDncenhw/ccP0zvOg0O+zdZhdGjmtjswk5pdf8AHw7c+1yOI6blvYa3Zs3SZ2baj50R7c1Z15+vdcN3ONOH7jhzwyMd0z3Ptx/Xcd63lO/5/U0BemYollQACWUAAiiUCUAAAixRSKJRAAEpYAEBQFlAQACLAAAAU9MzXlz9fQCRRFHrl68uwa6xsGvGwa8el8lbD5wUBZKHrma4ufr7B9/A2WTpLG8x9XD08ylhKgys7T2XdeGrHr5FLKl2GuLsdfIAjNwquwmvsWFgAAAAAAAAAAAAECqAIABLBUoCxQABKAIAACxRFJAoIABUoAAlEWCygEABQARQlEWBRAAAAAALKAAJRFEUSgAAAAAAAAAAAAAAAAAABKAAAAKCAAAAoICggKABFEogAAAAAAAAAAAAACUSygAEURQAAAAAAAAAAAAAIUAAAAAAAAAKCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASgAAAAAAAAAAAAAAAABFgBQAAAAAAAAAAAAAAAAAAAAAAAAEoAAAAAAAILKAAAAAAAEFQUCWKBUqAAAAAAAAAAAAAAJRALKAAAAAAAAAAAAAAAAAAAAAAAARQSgAAAAhUFgAVKAAAAAAJYAUAEWCygAAABBUoAAAAAAAAAlEUAAAAAAAAAAAAAAAAAAAAAAAAAIAoAAAlEAAAAsoAABFAEAAsoABKAAACUQCwUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAoAAAAJRAAAAUAAACWApFEoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARQAAAAAAlEAAAsFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFEAUSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACggKCAAAAAAAAAAACCwtSoCgAAgKCAAAoAIQUAAAAKACAoAIAACkJQAAAAAoAICgAgAH/9oADAMBAAIAAwAAACH54576oP8A/wD/AP8ArCDTy37z/wD8ks8wgggw9vvysgksllv/AP7/AP8A/uoksv8A+tKMMMP/AP8A4/6wwwwwwwwwwwwwwwwwwwwwwwwwwwxzwwwwwzggwwwwwwwwwwwwwwwwwwwwww9/w/wwwwwwwwwwwwwggjvrggv/AI4K4oNf/wDqCKGe/uKGvLDCCDDCCCDDDDDDDDDDLDD/AAwwwx//AP8AKe/OKGOW/wD/AMIb/wD/ACvv/v8A/wD/APv/AP8A++/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APywwwwyw1//AP8A/wD/AP8A/O/+W/ie/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPCGrDDDW//wD/AP8A/wD/AP8A/wDivv8A77//AP8A/wD/AOCe/wD+ssstv/8A8MMNf/8A/wD/AO//APvT/wA//wD/AP8A/wCpL44oN7/7/wD/AP8A/wC//wD/AL/7/wD/AP8A/wD/AP8A/wC//wDwgxvv/wD/APDDDSy//wD/AP8AqDjDvD//AE9//wAML/8A+O++u++//wD/AL//AP8A/wD/AP8A/wD/AP8A/wD/AC+yy+u+/wD/AP8A/wD/AO8MMPb/AP8A/wD/AP8A/wD/AP8A/wC//wDjDDS//wD/AP8A+++//wD/AP8A/wD/AP8A/wD/AP8A/wDvv/ggggwvv/8A/wD+/wD/AP8APeuf/wD/AP8A/wD/AP8A/wD/AP8A/wD/AMv47/8A/wD/AP8Ay+//APv/AP8A/wD/APP/AD//AP8A+LPIe88N/wD/AP8ALPb7/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wB7/wD6/wD/AP8A/wD7z/8A/wD/AP8AsMMef7204F6UoMMPL/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+/8A/wD/AP8A/wD/AP8A/wCG/wD/AP8A/wD/AP8A/wD+9+OLEPQrjrPm/wDvf+sINf8A/wD/AP7/AP8A/wD/ALz3/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AL7/AP8Av/8A/wD/AP8A9r9+3Gf/AP8A43//AP8AzEYfWzf/AP6lv/8A/wD/AP6ww1//AP8A/wD/AP777/8A/wD/AP77/wD/AP8A8pb/AP8A4w8GLbL3/wD/APjXdrT/APw8/jOx7lvvv/8A/wD/AO4ww1//AP8A/wD/AP8A+2//AP8A/r77/wD/AP8A/wD/AP8A/sN7u7//AP8A/wD9vd/VMuSaA8MMMKhL7/8A/wD/APf/AP8A/wD/AP8A/wD/AP8A/wCL7/8A/wD/AL7/AO+//wD/AP8A/wDz1IK0v/8A/wBrq3TSXBJK/wDbLTwxtumvvv8A/t//AP8A/wD/AP8A/wD/AP8A/wAMb7//AP8A/wD/AP8A/wCNP/8A/wA9xCA3y96gFoFf61FfV4evL8bwwuqDv/8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AA1v/v8A/wD/AP8A/wD/ACnv/wD8398d/wD/AJyT6VOlbqE/X/76sPD5w0t0tv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A68D/AP8A/tlTzM9cJUBB31P8sNLLzu8MPc//AP8A/wD/AP8A/wD/AP8A/wD/AOqDDe//AP8A/wDO++//AP8A/wD+Eyf/AM956lM91TtxCBqkx/8A8+1nSz2Nfh77/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r3+zX//AP70a7yrSAwR+lSX/wD/AP8A5aLGewE9sH//AP8A/wD/AP8A/wD/AP8A/wD/AP8ACe//AP8A/wD/AP8A/wD/AP7384n/AP8Aj9xYZ5R6Ed/rxe//AP8AvuAQtT9j5Ox37/8A/wD/AP8A/wD/AP8A/wD/API77/8A/wD/AI7/AP8A/wD/AP8A9Yv/APv+s12ekO/HKj3/AP8A/wD/AOyInrTQvKDA3S//AP8A/wD/AP8A/wD/AP8A/wCO++++/wD/AP8A63//AP8A/wCPe/8A71bNJTSzDBzf/wD/AP8A/wD/APD1Ag9918LTb0+/+/8A/wD/AP8A/wD/AO/++CW+/wD/AP8A/wD/AP8Ar/qtz/8A/fyrLvP/AKu3/wD/AP8A/wC+/wD/APEgDR9LQMMtj/8A/wD/AP8A/wD/AP777/777/8A/wD/AP8A/wD/AP8A/wDzrw3/AP0DzdpI46zf/wD/AOlv/wD/AP8A+rBHJjxww5zT/wD/AP8A/wD/AP8A/wD/AP8A/wAP777/AP8A/wD+oL//AP3Ur/8A+OkpfutvvF//AP8Avf8A/wD/AP8A+tPec7UQwxgf/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97//ALjKvz9WOe+iCArK/wD/AP8A/wD/AP8A/wD/AP8A189HoHDD49//AP8A/wD/AP8A/wD/AP8A/wD/AOvv/wD/AP8A/wD/AP8A/wD88ub/AP8Aaht7x0/axf8A/wD/AP8A/wD/AP8A/wDqcAQHGj/Dslv/AP8A/wD/AP1//wD/AK//AKskv/8A/wD/AP8A/wD/AP8A+xz/APp8+/7EiGvVue//AP8A/wD/AP8AvOGAABO0Pf8A8S//AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX/xIj/ryWKDc+uxCFy2//wD/AP8A/f8A5QDL+xA0/wBAPf8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO//ALHqD/8A1zrjvutjXrq0v/8A/vvjjjyziwEMsP8AiV3/AA9//wD/AP8A/wD/AP8Agvrv/wD/AP8A/wD/AP8A/wD/APGHA/8A/wBnbjIILjKYqMZF+eUX/wDNQ8uL/wDyw2w1/wAt/wD/AP8A/wD/AP8A757779P/AP8A/wD/AP8A/wD/APfAC/8A78Tixwg0G88Z+NMRz3/8873MLP8A+Na7/wD/APv/AP8A/wD/AP8A/wDvvv8A/wDL3/8A+kv/AP8A/wD/AOoLb/8A/trYMEpP+6vMTz//AOwww00f1P8A8O7v/wD/AP8A7/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wD7D1//AP1E33v47/PLDAiseQwwxDzQP/8A8MsB/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD/AOP5z7/8tLb7YN897/331mWwmS6op/8A/pdKf/jT3/8A/wD+8/8A/wD/AP8ADDC+/wDvzww/vv8A/wDv/Gr/AP8A+/8A3++P74kT+6IMoyC6BH//AP794l/ww1//AP8A/wD/AL//APjTKDP/AP8A/wD/AP8A/wD/AP8A/wD/APwANf8A/wD/AKItvvvvrvgjjjjmgw//APuH/wD/AO4ww1//AP8A/wD/AL//AODDCD//APv/AP8A/wD9/wD/AP8A/wD88ftv/wD/ADw85vvvttvvuv0Iww//AOPuLf8ADH/DjT3/AP8A/wD/AP8AY/8ADD//AP8A/wD7jDDT3/8A/wD/APvRDf8A/wD/APvPBzhiiBCBDTHP/wC8u+gw1z//AMMMc8vf/wD/AP8Av/8ADD/2/wD/AMsM7+8//wD/AP8A/wD+HiWg/wD/AP8A/wD/AM88+8MM9/8Ayv4U/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A/wA8auOaJ/8A/wD/AP8A/wD/AMMNPf2haj7/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/AP8A/wD/AP8A/wD+9xh4div/AP8A/wC8QzBzCXv/AP8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A/v8A/wD/AP8A/wD/AIwCAW5jvhIvz1oz+/v/AP8A/wD+9v6wwww1/wAP/wD+yyiGDDG++6+qC+6iTz//AP8A/wD+/wD/AP8ALX/zDPudN+di/vP/AOtv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AP8A/wDPP/7yDDDDf/8A/wCZ7/8A/wD/AIN/4NLP/wD/AAwwxzz3/wAMIIMMb7777/777/8A/wD/AP8A/wD/APPPPP8A/wD/AP8A/wDz3/8A+8//AP8A/wD/APyDTjDD/wD/AP8ArP8A/wD/AP8A/wAMIIN77/4J7/8A+/8A/wDvL46uCh776Pxz9Q6fbkTfRZ6vNlnfzgMMMP8A/wD/AP8A/wD/AP8A/wD/AP8ADDDW+++++/8A/wD/AP8A/wCurib02aFI4fy+ZZP2dS2/0QUiz3vTbz/+/wD/AP8A/wD/AP8A/wD/AP8A/wDvDDDC++++/wD8ssstv64jQpYdmDW86d7lps93l+Oawy7/APgiP/8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AKwuMr+Eg17a/wCDx18IjeUbwgO3tGj5n7//ALjDDT3PDDDDS+++DDDD+/8A7gwwwwz/AMO8JD/8+IBNO6kY2tLHO/DJq+jz+sO4fPrKsMOsMPOMsMMPbrKMMNL7/wC+qDDD3/8A/wDvDAPPPAvMNLMOMBS7kX68+v16uBT+jsMMMMMMMMMMMMMP6IMMO8sLIIKIMMMLLP7/AP8Ayww096w//wAMPNPfP/8A/wD/AP8ArDDTzzjDDDDDDDDDDDDDDDDDDDjDDDCDDDDCDCDCCCyjDDDDDDDDDDDDDDTrDDzzDDDDDDDDDDDDDHDDDDDDDDDCDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDjDDDDDDDDDDDDDDDDD3/DDDDDDDDDDDDDDDDDDDDDDDDDLDDDDDDDHrDDDDDDDPPDW+LDDDDDDDDDDDDDDT/rDDDDDDDDDDDDDDDDDDDDDDDDzLDDDDHPf/LDDDDDDX/DD3rDDDDPLDDDDDDDDDTzDDDDDDDDDDDDDDDDDDDDDDDDDf7DDDT/AP8A/wDrDDDzD/8A6ww4www0/wC8MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMP+MMMMNP/AP8A/wAMMMNfvOMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMPMMMMMMNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwzwwwwwwwwwwwwwwwwwwwwwwwww8/84wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0/wB/8MMMMMIMIMMMMMMMMMMMMe4sIIIMIMMMIIM8MMMMIIMIIMMMI8MMMMMIIMIIMP8A/9oADAMBAAIAAwAAABDxjCABT3HFHHFXzHUxnV3HGyT33zzT31jCHQzCAyijHHDHHHARzwzHFWR2Ff8AT/vd9X3/AOww0/8AuMMMMEMMMMPMMMMMMPMMc8MPPMM4AMNOMPPPPfPMMMMNesMMMOPduP8AjrDDDDDDDDDDDAACM8sAC/8ADALCg1//AOoIoZ7+4gS8sMIIMMIIAMMMMMMMMMMtPNPMMMMf/wB/Ic/MIFMU/wD/AMAb/wD/ACPv/v8A/wD/APv/AP8A+c/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APyw0wwyw1//AP8A/wD/AP8A/M/+U/gc/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPAGrDDDW//wD/AP8A/wD/AP8A/wDifv7Pv/8A/wD/AP8A4Bz/AP6www2//wDwww1//wD/AP8A7/8A+9P/AD//AP8A/wD/AKEvjig3v+P/AP8A/wD/AD//AP8Av/v/AP8A/wD/AP8A/wD/AL//APADG+//AP8A8MMNLL//AP8A/wCoOMO8P/8AT3//AAwv/wD477xFTz//AP8AP/8A/wD/AP8A/wD/AP8A/wD/AP3sLDsrvv8A/wD/AP8A/wDvDDD2/wD/AP8A/wD/AP8A/wD/AP8Av/8A4ww0v/8A/wD/APvPv/8A/wD/AP8A/wD/AP8A/wD/AP6gv6vvvv8A5L//AP8A0v8A/wD/AD3rn/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDL8O//AP8A/wD/AMPv/wB7/wD/AP8A/wDz/wA//wD/APePu7f7/j3j7OPay3//AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wBz/wD2/wD/AP8A/wD7z/8A/wD/AP77xuzTXHPQ2H/v/wD97f8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+3//AP8A/wD/AP8A/wD6un//AP8A/wD/AP8A/wD52/z3neULfpDS8eXjRXv6/wD/AL72/wD/AP8A/wC89/8A/wD/AP8A/wD/AH//AP8A/wD/AP8A/wD7lv8A/L//AP8A+8/7Amt36/8A/N+N/wD7PppCiGv73Wu//wD/AP8A/rDDX/8A/wD/AP8A/vvv/wD/AP8A6lv/AP8A/v2+/wD63/2DYbU53/8AN+9adP8AP/fkfivSque//wD/AP8A7jDDX/8A/wD/AP8A/wD7b/8A/wD7lvv/AP8A/wDz3/8A+e9j7P8A/wD/AP8AvrHlqUBwibz/AO1pCJNv/wD/AP8A9/8A/wD/AP8A/wD/AP8A/wD/AIvv/wD/APuW/wDvv/8A/wD/AP696Ttrt/8A/wBuoRbS+e0uWvqczLgJJky2/wD+3/8A/wD/AP8A/wD/AP8A/wDrDG+//wD/AP8A/wD/AP8AjT//AOz3/tf4926T9GdoV9avn9tPLcW28k6On/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDvDW/+/wD/AP8A/wD/AP8AKe//AK94qu5/+SKDcdrYE8DVv/6weaFky1E9mv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A4ag//wD/AEtXsy4NPRLuQ7P/AH/c/Mqb/auy/wD/AP8A/wD/AP8A/wD/AP8A/wDqgw3v/wD/AP8Azvvv/wD/AP8A6p/X/wD9/vxK1viKaZaUR8f+/d3lyxJ+vsn7/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r38yW/vPGhja2LXOilsFYf/AP8A/uvPT3769jlH/wD/AP8A/wD/AP8A/wD/AP8A/wD/AAnv/wD/AP8A/wD/AP8A/wD+9+fN/wD/AImyQ3ZUbpWuSSHv/wD/AH0cp3V9tivCf+//AP8A/wD/AP8A/wD/AP8A/wDuM+//AP8A+rL/AP8A/wD/AP8A1kf/APs1Y/nDSDuker3/AP8A/wD+iDQl8+Wrb/8Aiu3/AP8A/wD/AP8A/wD/AP8A+7r7/wC+/wD/AP8A63//AO9/OHP/AOmcEkYfE2zm/wD/AP8A/wD/AP67D/DBzPxN72xGv9v/AP8A/wD/AP8A/wDv6vglvv8A/wD/AP8A/wD/AH16vD8/7dpUJ+J/F3H/AP8A/wD/AL7/APfV08YrTW/LMWj/AH//AP8A/wD/AP777+777/8A/wD/AP8A/wD/AP8A/wB1Pf5/4S3O88zS3/8A/wD/AOlv/wD/AP8A+mOITR0f/wBs3P8A/wD/AP8A/wD/AP8A/wD/AP8AD+++/wD/AP8A/qC//wDzg1//ANb2Mbvds/tf/wD/AL3/AP8A/wD/AODxWf8A7T//AK1v/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97/+ekBM+Fi1Sl/MKhL/AP8A/wD/AP8A/wD/AP8Az90Ju69P/wADnv8A/wD/AP8A/wD/AP8A/wD/AP8A6+//AP8A/wD/AP8A/wD/AP8AMgz8+1AVRjroOBHvf/8A/wD/AP8A/wD/AOgjyytBsv8AUx7/AP8A/wD/AP1//wD/AK/vqyS//wD/AP8A/wD/AP8A/wD0ae/6f7sJO99rlEtv/wD/AP8A/wD/ADzzc8878C3v7Bj/AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX78Iffr/AB89rv7mAqOtv/8A/wD/ANXvOvNHnX30/wAJw/8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO/++3j/AP8A1z84H5yjnvWEv/8A/sUOTqRzwdGMsP8Aq5f/AA9//wD/AP8A/wD/AP8AgPrv/wD/AP8A/wD/AP8A/wD+uoZVf/8AM/POzSg0oRj9QNmCXvfvQ8EN/wDyx/nr/wAt/wD/AP8A/wD/AP8A75z779P/AP8A/wD/AP8A/wD++eRT/wDvbjl7Kf8AbzzEYRcNj3/887yutP8A+NLg9/8A+/8A/wD/AP8A/wD/AO++3/8Ay9//APpL/wD/AP8A/wDmEW//AL8J6MPtacNJb08//wDsMMNNG1X/APHXJ/8A/wD87/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wDHDS//AP0rF7xwwscYVUn9ORzy9eXqv/8A9R6J/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD+31lmP/y137sj5Jqcc8lquLKUzFMX/wD+15B/+NPf/wD/AP7z/wD/AP8A/wAMML7/AO/PDD++/wD733wif/8A+/ojP5zhXys30Vqj6Lyof/8A/r7AX/DDX/8A/wD/AP8Av/8A+NMoM/8A/wD/AP8A/wD/AP8A/wD/AP8Arrzt/wD/AP8ArwW/xd98sAMNNMbJD/8A+74lv+4ww1//AP8A/wD/AL//AODDCD//AKv/AP8A/wD9/wD/AP8A/wC/u3Lz/wD/AD80lCdKWefePcAMww//AOl4Pf8ADH/DjT3/AP8A/wD/AP8AY/sMP/8A/wD/APuMMNPf/wD/AP8A/s9of/vf+8+HCLAzqNANMc//ALvCZjDXP/8Awwxzy9//AP8A/wC//wAMP/b/AP8Aywzv7z//AP8A/wD/AOpmBNdfP/8A/wD/AM88+8MM9/8Ay+xs/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A7+6AMhHI/wDPf/8A/wD/AMMNPOa9rVb/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/APP/AP8A/wD8+9me7fvh/wD/AP8AvEcL5kze9/8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A7v8A/wD/AP8A+8t80sklT07SF/hT7Gdb/wD/AP8A/vb+sMMMNf8AD/8A/ssohgwxv/8Ar+gL7qJPP/8A/wD/AP7/AP8A796+z7xPfdTW7M2c3/uv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AD37/wD98cz/AP8A/wCf/wD7am//AP8A/wCDf+DSz/8A/wAMMMc89/8ADCCDDG++++/+++//AP8Atf8A/wC/8888/wD/APv/AD7+5/8A9Pd//wD/AP8A/INOMMP/AP8A/wCs/wD/AP8A/wD/AAwgg3vv/gHP/wD7/wD/AL8D33l2vvtiiF8/j7dmgdzlrf5waG4j4www/wD/AP8A/wD/AP8A/wD/AP8A7www1vvvvvv/AP8A/wD/AP8AXKIH6bFHfXh8bYd5VGeKmzy8BfXoRAP/AP7/AP8A/wD/AP8A/wD/AP8A/wD/AO8MMML/AP8Avv8A/LLLLb9eqXZ790YYoi9vt0xIR1A7xcMP/XWAVf8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AFyutQF0RhTGLNXfyck6+ULSix4G0ebnP/8AuMMNPc8MMMNL774MMMP7/wDuDDDDDP8Aw+y5f7f4cUw+r2p6RMAz4gHTKvZQQBB0esqww6ww84ywww9usIww0vv/AL6oMMPf/wD/AO4Uw884egsoAg44RnuxfLz2v/K49f6mn4wwwwwwwwwwww/ohww7ywsgAogwwwsM/v8A/wDLDDT3rD//AAw8098/f/8A/wD/AKww0884wwwwwwwwwwQwwwwwx7w4wwwwgwwwwgwgwAAMowwwwwwwwwwwwww06ww88wwwwwwwwwwwwwxwwwwwwwww3v8A8MMMMMMMMMMMMEMMMMMMMMMMMMMMMMMMMOMMMMMMMMMMMMMMMMMPf8MMMMMMcvNOMMMMMMMMMMMMMMMsMMMMMMMesMMMMMMM88Nb4sMMMMMMMMMMMMMNP+sMMMMNfcMMMMMMMMMNMMMMMMPMsMMMMc9/8sMMMMMNf8MPesMMMM8sMMMMMMMMNPMMMMMMMMMMMMMMMMMMMMMMMMMN/sMMNP8A/wD/AOsMMPMP/wDrDDjDDDT/ALwwwwwwwwwwwwwwwwwwxwwwwwwwwwwwwwwwww/4wwww0/8A/wD/AAwww1+84wwwwwwwwwwwwwwwwwwwwwwwwwwz/wD8MOMMMMMMMMMMMMMPMMMM8sNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww3/APP/APDDDDDDDDDDX/PDDDDDDzDDDz/zjDDDDDDDDDDDDDDPDDPLDDDDDDDDDDDDD/v3nP8A/wD8MMIMIMNP/wDDDDDDDDHuLCOKDCDDDCCDPDDDDCC/+CTzDCPDDDDD6CXqe/8A1//EADcRAAEDAgMGBQMEAQMFAAAAAAEAAgMEERIhMRATIDJBURQiMFBhBTNAQlJxgZEjkNFTcKGx4f/aAAgBAgEBPwDgt6Nlb0behb0LcdttvSt/swOmYzUp1awaC6NcegRrJCvFS914qXuhVyIVzuoTa1vUJtRG7Q+6Pe1gu4qStH6AnzvfqUyF7+UJtE86myFE3qUKSMdF4aLsvDRdkaSLsjRM6FOoj+kp1PI3UJsjmcpTK0jnCjmZJyn29zg0XKlrOjF5pD3Kjo3HN5smQRs0Hpvja/mCkohqwp8boz5goqtzcnZhRyNkF2n2yaobF/KkldIbuUVIXZvyCYxrBZo9B31aSKZzTm25VPVR1LcUZ4iARYqWjBzYvNG7sVBVB/lfkfaqiqw+VmqYx0rrBQ07Y89T6JNhcp7sRJUUz4Xh7DYqirG1bMQ1GoUz3xjE3RMrWHmFk17X8p4JImyCzlNA6I56KCqLfK/RA3zHs9TU28jFFC6U2CjjbGLN4pauKHJxzUv1b/pt/wAqT6jUO/Vb+E+eV2rj/lOJOqOyiqTTTB/Tr/CIDhboU9uBxagSDcKOscMn5pkjZBdp2kAixVRTGPzN0VPUGPyu0QN8x7LU1GAYG6qGIyusExgYMLeGeqjh1zPZT1skuV7D4RRRRRR2BUbsUDCewU1KJDiBsVJTvj1Gxri03aoKoP8AK7I7ddVU0+7OJuipZ8BwO09knlETb9U1rpXWGpUUYjbhHASBmVU1x5Yv8o5oooohCF7tAjTlvOQE7djQ3/pOI6IKkZggY09ANstKx+YyKkidGbO2U9TbyP2kAixU8Jid8KkmxDAdR7ESALlTSmR11TQ7ttzqeAkAXKqakynCNEUUUGF2ibTj9SdLHHk3VSVL3aZJ1zrt+n03iJg3oMz/ABwuaHCxU9MY/M3TZS1H6Hf1tljEjcJXmjd8hRSCRocPYayWwwBUsWN2I6DhqqjeHC3TYVYnRNi7p8jYwpJnP/hFFFFBpcbDVfTqPwsdjzHX/jjqafB5m6bKabeNsdRtrIrjGFSS4HYTofYCQ0XKe4yOv3UUe7YG8FZPhG7b/e0NugLKSa2TUbnMooooprC8hrRmvp300U/+pJzf+v8A7xVNTi8jNFTVV/I9EA5FVEO6dloo3ljg4Jrg4YhsIBFipWGNxaoJN4wH8+sfhbh7qkjxPxduCWQRsLinOLiSdgF1opJL5DYUUUVBSyVDsLB/wqOgjphcZu7/APHFVVF/I3ZEzG8N2SRiRuEpzS02KopNWHbWx3AeFRPs4tPX8+qfikPwqVmGO/fgrpbuwDpsAvse6+QVlZFFBpcbNFyqb6ST5psvhRxtjbhYLDiOanhMTrdNjXFhDgopWyNxBNnY52EHNVkX6wo34HBy12PaHtLUxxY4Hsgb5/muOEXQBe63dAWFhtc4NBJTnFzi4oBBOd0CwEoRd1ugt01RfT95m4WChp44R5B6MsYkbhRBBsdrSWm4WUrP5TgWmxVO7FGNtQ3DIVTOxRj82pdhjKpW4pBwVr8MVu+wDYABsbTSv0aUPp8x6KH6fu83ZlOFjb06yPC7EOvBRPu0t7KsZhffuqF3lI21rcw5ULsiPza0+UBUI8xPB9QdmGoDZDTSTcoUX0xjc5DdRwsj5Bba52EX9SqZijPxtjidIbNUEG6uSc1WNuwHsqE+YjbWC7LqiPnI+Pza46BUIyJ4KzOVMY55wtFyqf6c1vmlzPZAWyHDOcreo4XBG2iPmI2Ti8ZVFzn+NtULxlUh/wBUfm1uoVFyngfA+eYtaoKdkAs3Xvwh1zbZP09V2uylcGyC+yQXaVQjMnbU/aKpfuj82u1CouU8EIAblwvd0CZrsnGQPqE2Wu2B7g8AFP5SqJtmE99tT9oql+6Pza4ZAqhPMOCHl4CbC61Qy2Pbibb1J3YYyeCmF5QpjaNx+FEzAwN21ZtGqMXk/NrBdl1RGzyOCA5kcDzc22sNxslZhPoTSiJt1vXg3BTauRuuanqTKALW2iNxFwMlRMOIuKeMQtwVrvKAqEZk/mztxRkKB2GQHgjNnA7SbDgYbHY5ocLFPYWnPilmbELlPe6Z1yvBPte6fBIzUcEbQ1oAV+Gsdd9uyo22Zfv+c9uBxHZMdjaHcDHYm32P04Arq6NjkU6Dq1GNw6K3dOnjbqVJWE5MCZBJKbn/AMqKBsWmu2SBkmoUlG5ubc1oop3RaaKKZsouOGR2NxKibgYG/nVjLOxd1RPu0t7cELrGx2OFxwDZdXTw5ubU4Odo8j+06lxcziU2jjGqZExnKOOWBsuuqlhdEbFUcd3Y+3BUvwRn5VOzHIB+fUR42H4UEm7eDwxvxDY5t8wrFBpKLbDhdH1Ct6W6xtOLRMYGDC3gq5MT8I6Kjjs0uPX2Coj3b7dFSy42WOo4GOwm6BDhccLm2zV1dXV0QDqiw9ERbia0u0TYQM3KWTFkNOCaTdsxJjDI63dNaGiw9gqIt4zLUKGQxOxIEEXHBHJg/hAgi44XN7LRXV1dXV1krBWCDb6BCLugLZBSyX8o4amXeOsNAqOLCMZ6+xVUOA4hoVSTWO7dwskLU1wcLjhIvqjGeiII1V1dAE9EI3FCLuUGNGw5ZqSW+Q4aqbCMDdVTxbx1unsbmhwwlSxGJ1iqafeDC7Xha4tNwmSg68N/QdIGp8hfrwzzCJvygHSusNSooxG3CPZJYhI2xTmujdY6qnqBILHXibI5qEzTqgQdFbjdK0J0rjpxTTCIXOqc50rrnMlU8AiGevs00IlFjqnsdG6xVPVB/lfrxg2QkcOqEzlv/hb/AOEZz2RlcUSTrxzVAiyGqJdK7uSqenEQudfaJI2yCzlLA6I56KGqLMnZhMe14u0/gkhouVNV3yj/AMpkbpDYKGBsQ+faiARYqaktmxNc6M5ZFRVgOT0CHC49XRSVbG5NzUkzpD5lDSOfm7IJjGsFm+2yQtk5gpKRzc25prnRnLJMrXDmF0yqjd1sgQdOM5ap1RG3Up9b+0J8r5OYqOme/PQKKnZHnqfcXxtfzBPogeUp1NI3pdeZp7JtRI3QoVcgXjX9gvGv7BGskRqZD1RLnHPNNp5HaBMov3FMhYzlHu2uqMEZ1ajSR9l4OP5Xg4/lCkjCFPGOiADdB/2uqKh8brNXjJPheMk+Eyt/cE1wcLhT1D434QvGyfC8bJ8LxknwnuLWFw7IVsnUBMeJG4hsnqHxvwhU0rpQS5SzNiFynVjzpkhVy91HWEmzhslnbFrqnVjzpkhVyBRVbXZOy2VM7oiA1U07pSQ7ZNVYThYoJpZT8ex1n3P6VLEyQHEvCxdlUQbo5aFUTziLVV/cVLCyQEuC8JF2XhYuymyjP8bIJjE74QIIuFWfcVDylVLi6Q3VLAx7cTs0aaI9Eylax+IFTSbtpciS43Oqioxa706kjOmSliMZsVSSkjAVW6hUPMVU1NvIxQwmU26JjAwYW+x1n3P6VLK2MHEV4qLuqmcSkW0ComkuLlWfcUcz4xZq8XL3VPUPfIGuKm+25NFyAp4TE74VNPgOF2iq/uKh5SqqnJONqa5zTcGybWSDXNRVTZDY5FVp8oCpQDIL7aweQFUxtKFW8wTJCwHD12QhuAYNPZKz7ijhdJyrwkiZRH9RTGBgwtVZ9xUkbXtOIXW4j/amxMabgKf7bv4TeYKRge3C5SRmN2EouJ1VDylYheyfGx/ME+iYR5ctk4L4Q5RP3bw5NcHC42VcoccA6KkZikv2VbqFFEZHWCqKfd5t0VPPujY6IG+Y9jrPuf0qHR3BWfcTJXsyaV4mXuvEy9083gueybqNk0IlbbqnNLTYqh5SqnHjLiE2pkb1TqmRwsSooXSmw0WEWt0U9MWG7cwmvczlKdPI7IlRxOkNmqKIRNsFW6hUPMUQCLFTwmJ3wqWe3kd7G5jXZuCaxreUW4HRtcbkLcx/tC3Mf7Qt1H+0Kwtbotyz9o2uja43ITWNbyi2wwRn9KFPGOiGWQ2uiY7UIU8Y/SgLZDY5jXcwumsa3lFtjmh2RC3Mf7R/tJf/xAAzEQACAQIEBAUEAgEEAwAAAAABAgADEQQSITEQICJBEzJAUFEUMEJhUnEFI2BwkYCBkP/aAAgBAwEBPwD/AJZP+xbS3/j4tNm2EGHY7wYYdzBh0ngJ8TwE+J9OkOGXsYcMexhpOO3uiqWNhFw/8jFpquwjVFXcw4lRsIcS3YQ13njP8zxn+Z47/MGIbvBiR3EWqjd4yK24jYcfiY1Nk39vAJNhEw/dp0oPiNiAPLGqs25+2rsuxi4j+QisrjSPQB1XSMhU2PtlOkX/AKiIqDSPXA0WMxY3P2L84JGoiYjs06XHyJUoFdV9qpUb6tGYINZUrF/6+0ONNVY2MbDsNoyld+RHKG4lOqH2lWjm1Xf2ijRv1NKlQINYzlzc8xYCFviXPMDY3EVswBhAOhj4cHVYyFTY8QbG4lKtn0O8q0s+o3m3stGlm6jtKlQILxmLG55WcCFiftU6xQWtEqq23AqGFjKlErqNuSlVz6HeVqWbqG/slOnnNoSEF47lzc8rVL6DkvwWi7bCHDlfMQJlUd4bduA4pXZd9REcONOFWjfqXiDY3EpVM4/cr08pzD2IC+kpoEFpWqZzYbchNo75uSnTap5REwYGrmGpSpaKI2Idv1N/sAlTcSlWD6HfhXpfkOKOUNxNHH6MdchsfYcOlzmMrvlFh35aj5tBxRGc2WUsGF1fWPVSkLSpXap/XMOejWzdJ34VqeQ3G3Gg9jlMrpmF/j2AC5sIqhFtHfO1+Sq/YcaGHaqf1KdNaYssrYq3SkJJNzzAW5qNG3U0rUbdS8KVTOP3HUMLGEEGx4A21iNnW8qJka3r8Ot2v8Su1lt88jNlF5e/DDYY1OptoAFFhtK+JzdKbcwBMAtzUaX5Hg7ZVJ4I5Q3EBDC4mIT8uOHbXLMQtxm9fQWySu2Z/wCuSq1zbhhqHim52EAAFhMTiM3Qu3C/EQL884lOoHHBgGFjHQqbQ02AuRMO/wCJjrmUjijZSDGGYWm3rQLm0PSP6l768SbC8JvKVM1GCiIgRQqzFV7f6a7xMNUbtFwJ/IwYJBvBhaY7RxRXQC5mn2ab5GvAe/Ei+hmqN/UBuLysLOeNFroJWFnPraIu4lc2Q8lU2XhhKORcx3PBaarsITaPi6KbsI3+ToDYk/8AqVP8mjaC9ojBgGH28O9xl5MQtmvMO11t8TEjUHjhjoRMSNQfW4YdRMxJ0A5K51AmGwxch224V8XSoec6/Erf5V20pi0qVqlTzsTxpJ4jhYNOW/NRazji7hBcyrV8SYdrNaYnYccOeq0xI6QfW4bvMSdRyUsMHbO20Z1QXbQTFf5FjpS0Hz3hN9Ty4JbuT9wGxvxxI6QeFI2cTE+UcaHnEr+T1uG2MxPmHJ460aQZpXrtWN2jm55A1zbhgfy+6NuFYEppwXzCYk6AcaPnEreQ+tw2xmJ3HJiCc+svyObaRD1cMEeoj0FVQVN4u4mIN2txo+cSv5D63DHeYkbHkxI67w7cWNhCYDY3m8oPkqA/cpC7gclY2QymLuI7ZmJ40B1yuej1uHPVaYgdN+TFDQGHbi5ueNM3HDC1vESx3H2KaFzaZFta0OHQ7SnRyG/EuAbEzEOLWimxvyYYakzEnQD1tM2cGVRdCOSsuZCIIRY2hNoeKGx4I5RsyyjWWqLjfmSmXOkVRTE+oW8WorbHkc3Yk82HFlvMQbtb1ynMoMYZSRyVVyNaVR3jHTnUspuu8p47tUEXEUm2aBgdjFps2wiYf+UaqiaCPVL78VqMuxiYgHRtOD0lfePTKHXlRcqgR2zMT67DtdbTELY5uTEJmXMO03Edbacii5twtLSgyVemoNYKNIfgP+otUJ5VAhxDmM7NuedKrJtEqBxpMQ1hl5KK5nlVsqn19FsrSomZbctWn4bfqMuYR6ZBhUiBSZTULy0cVbpqf9wG+o+0a2RrLvGYsbnkoJZb/MxDXOX49gpPnW8rpla/zyVEDixhBU2MZc28II34q19OFpaWlOq9PaJi1Pm0isG2PKzqu5jYlRtrHru8oUsgud+SmmdrRmCLeE3Nz7BRqZG12lRM62hFtDyVqXiC43hBBsZaGn8Qgjfgr9jziq42M8ep8w16h7wu53PGhRt1Ny0aeQXO8xD3OUexUKmYZTK9O/UOWrSFT+4yFDY8TTB2hpmAMu0D/MFjtLS0tyi5NhKNDL1Nvy0KeY5jKtTIP37GpKm4iOHF5WpZdRtyugcWMqYdl1Gol+W0tzU6LVNtpTpLT235aVMuf1CQi/qO5c3PsiOUNxAwcSrSyajbmeir7xsMw21hBXfn32i4d2/UTDqup15qdMudIAEW3aVauc6bezU6hQxWDi4lWhl1XbnIB3hoIe0OFXsZ9KPmfS/uDCr3MGHQdoFC7Dnp0i+vaAKg/Uq1c+g29oRyhuIlQPtKlANqN4ylTY+hAvoJTw/dozqg1lSoXP69qBI1Ep4js0KhxrHw5GqwgjQ/d3iUGO+kSmqbSpXC6LrGYsbn21KjJtExCnfSEBhrGww/ExqLjtCLb/YWk7douG/kYqKuwj1lX9x6rP6y0tLS3olcrsYuJP5CLWQ95o0NJD2hw6T6dZ9Os+nSCig7SwXaGqg7xsT/ABEaozbn3bbaCo47wV3+Z9Q0+oeeO8NVz3hJO/Nb/iilSV1uZ9Ok+nSNhv4mEFTYylSV1uZ9Ok+nSfTpFUFrT6ZYylTY8KVFXW5lZAhAEp0y50gw6jeGgkfD2FweFOkX2gw694cOkfDldRrwo0g4N5WphALcKdC4u0qU0Qfv2PD+SV3ZLWnjv8ylUzjWYldAZQ8kr1GQgCeO/wAzx3+ZT844VafiD9wi2hmH8kxO4lEAIJXqMpsIKzjvGrllyymmdrQAKI+IP4xa7jeI4cXExCW6hMNsZithKNG/U0qVAgjMWNz7Hh/JK6M1rTwX+JRp5N5iW0AmH8kemr6meAnxKtJVW4lPziHa8pVA4/crUs3UN5h/JMTuJRqgDKYVDbw4dDtHoldRMMNSZWNkPHDnqtKw6DMNsYyBrX4VM2bq9kw/kj1Am8+oSNiR+IjMWNzMP5JiHZSLGeK/zC7EWJlPziHYxGKm4iOHFxAANpidxLG14rsuxi4hh5uFIhahEdcykQgqbHhh6ZHUZXay2mG2MdwguZSq59DvKtPONN/ZMP5JidxyYfyRqatuJ4KfE8FPiAWqWHzDtwp1ChvAQwuJidxKOXLYQ0UPaLRRdQJUqBBrLm95TrBtDvGUNuIKSLsI7qmpjuXNzMNsZidhASDcSnUziV6V+oeot9sMw2MLE7nkDMNjPEb5niN8zO3zLm95nb54hmGxhJO54Cq47w1XPfkDsNjDVc9+IYjYwsTueAYjaeI3z/8AJL//xABNEAACAQEDBQoIDQQBAwQDAAABAgMEAAUREBIhMVEGEyAiMDJBUmFxFCMzQnKSscEVNDVAUFNgYnOBkaHRFkOColQkk+FEY2SwJZCy/9oACAEBAAE/Av8A6jpEZ+YrN3CyXfWPzaeT89FluWtOtFXvay3BU9MkQ/Ww3PydM6erb+nv/k/6f+bf09/8n/T/AM2O55+ioX1bHc/P0TR/vZriqxq3o/5We6q1f7BPcQbPS1Cc+CUf4/bGChqZ/JQuRtOgWhuCZvLSonYNNobipU5+fJ3nC0VDSxcyCMflYaNXKSRRyeURW7xaW6KOT+1mn7pwtNueX+xOR2OMbT3PWRf2xIPuGzqyNg6lTsIw+1NNR1FT5GJiNvRam3P9NTL/AIp/NqegpqfyUS47TpPBknij8pKi95s97USf3wfRGNnv2lHNErflZt0EfmwOe82O6E9FP/tb+oJPqE9a39QS/UR/rYboX6adfWsN0O2m/wBrLugh86GQfpZL7o21s6962jvCkk5tRH+uFgwbmkHu4EsSSrhKiuO0WqbjppNMWdEezSLVNzVUOlVEq/c/ixBU4MCDsP2ko7nqZ9Ljek2tr/S1JdFLT6Su+vtfgVFbTU/lZlB2dNp7/iHkYmbtbRaa+6t+aUjHYLS1U8vlJpG/y5VWKHFCV7jaG86uLmzsfS02hv8AkHloVbtU4Wp75pJdbGM/fsrK4xQhhtGWopoagYTRq1qy4POpJP8AB/5tUQS075s0bIe37QUNz1FTgz+Kj2tr/S1Fd1PSeTTF+u2vLUVENOuM0ip32qr/AEGimjLfefRapvGqqOfKc3qroHzWKV4mxidkP3Thamvyoj0TBZV/Q2pb3pZ9Bbe22PlkjSVM2RQy7DauuJTi1I2aeo2q08MkEmZMhVu37OUNBPWHxS8Tpc6rUF1QUmDeUl6ze7LWXhT0nlH4/VXSbVl91EuIh8Sn72ZizZzEltp+dUtbUUvkZCB1TpFqO/Yn4tSu9N1hqsjK6hkIKnpGSeCOoTMmQMvba8LkePF6TGROr0ixGBwOv7MKCxAUYk9Atd1yapKz/t/zZVCqFUAAdAyVdZBSLjM+B6F6Tauvqefiw+Jj7OcfmENLvsOcGwbG0kbxnBxhy1LVzUrYwuV7Og2ob7ilwWp8U+3zbA4jRkr7uhrBiRmy9cWraKajfNlGjoYaj9lqOllq5cyFcdp6Ba7ruiolxHGl6XOR2VFLOQFGsm14X5rSi/7h91nZnYs5LMdZPzGjGFMliARgRiLVFF50Pq8vQXjNRnBTnR9Q2oLwgrBxDhJ0odeSWNJUKSKGU9BtedzvDjJTYvH1ekfZS67tkrWzjxIeltvdangjp4hHCuaoyV9fDRJ4w4v0INZtX181a/jDgnQg1D5nGMI1HZlqqYTDEaH9tmBViGGByQpvkipnKuPS2q0111kWuEsPuabEFTgwwPbySkqwZSQRqItdl96o638pP5sDiMRpGS9boWfGWnwWXpHQ1nUoxVwQw1g/ZG6LpNThLUAiHoHW/wDFlUKoCjADoGS9L4WHGKmwaXpboWzu0jlnJZjrJ+ZqMWA7eDV0+/LiPKDV25dz9d4RBvMh8bH+4tNDHMMJUVx2i1RcdNJ5ItEf1Fqq5qqHSqiVfufxYgg4EYHYeRu285aI5vPh6uzutTVEdTEJIWxX2ZL0u1K1cRxZhqb+bTxPBKY5VzXH2PuW6t9wnqR4vzUPnZCcBidAte18b5jDSHBOl9vdy6xO3NU2Wkc6yBZaNelibCniHm499hGg8xf0sANg4d4Q4Nvi6jryUVQaWqjmHmnT3WUhlDLpB05amkgqVwmjDdvTasuJ041K2eOq2u0iNGxWRSrDoPIUdVLSS58R7x0G1310VbHimhxzl2ZLyoI62LA8WQc1rVEMlPK0cq4MPsbcl179hUVA8X5q9bI7BFLMcFGsm173o1WTHFisH/8AXKpG780WSl67fpZI0XmqOVkTfEKnpsdB05Nzs++0GYdcRzfy4NTTQ1KZsyBvdavuSSLF6bGVOr5w/m3Tp4cMrwSCSJs1x02uu8UrUw5sw1rkvKhStiwOiQc1tlp4XglaOUYMPsXct3eFPvsw8Qv+2RmCqWY4Aaza+LzNWd7i0QD/AG5SOFn7BtNo4EXtPb8xrFzaqT9clxViUlQ+/HCNx+9opY5lzonVx2HhXhdsNYMSM2Xri1bRzUb5sq6OhhqPDikaKRXjbNYaja6rwWtjwPFmXnL78l7XetbDowEy80+6zqyOVcYMNBH2Juuhatnw1RLz2tGixoFQYKNAGS+ry8KfeoT4gf7cmiFzxbRwquvSfmd5fGf8RlR2jbOjYq20G1Lfk8WiYCVf0NqO8aer0I+D9VtfBljSWMpIoZT0G16XS9NjJBi8P7rw4ZXhlWSNs111G12VqVsGcNDjnLsyX5d3hK79CPHLrHWH2IpoXqJlijHGa1HTJSwLFHqHTtyX/eOulgP4h93Jxw46X/SwGGrlwrHUrfpbeZPq2/TgXif+p7gOFQ3xPT4LL42Pt1/rajrYKtfEvp6VOscG97ozsZqRdPnRjp7uHRVL0k4lj/MbRakqEqoFliOg/tk3QUG9t4TEOI3PGw7fsPclB4JBnyDxz6+wbMl93h4LFvcR8c/+o5IDE4C0cWbpOk8mBicBpNo6Kd/Mw9K0d2Hz5B+Qt4DTxjFyf8jZpaKPmIGPYLNXH+3GiWapmbXIfysdOvTwKls+dz28NGKMGQlWGoi13X5hglbp/wDcHvsjB1DIQVOojgXzdW/Yz048b5y9b/zw7qrjRVGJ0xNzx77KwZQynEHSDZ1WRCrjFToIteVG1FUlPMOlDtH2F3P0O/S+ESDxaHR2nJW1K0lO0r9GobTaeV55mkkOLNyKgscBaNAo5EWgoJ5NYzB960V2xLz8XNkjSMcRQvdaathi6c5ti2lvGV+Zggszs5xcknt4c8m9RM36cld94S0TcXjR9KG1FWRVkedEdPSp1jgX3dm+g1FOPGecvW4e52vzT4JKdB8mfdkvOjFZTFPPGlD22YFWKsMCNBH2DpIGqahIk1t+1oIlghWOMYKowyXxW+GVPF8imhe3t5FVzjgLIoUaOQRGkbNRSx7LU91k6Z2w+6LQwRwjxaAZKi8Y49EfHb9rT1Us3PbRsHJXhLnSZg1L7eTgmeCUSRNmsLXXeKVqYHizDWv8cC/ruzCamAcQ88bO3hDQcRoNrprPDKUE+VXQ+TdHRYMKqMaDof8An7B7naPeoPCHHHk1di5N0FZvMG8IePJr7ByIGJwFkXNHDVSxwUEnYLUt1k8aoOA6otFEkS5sahRkqq6KDRzn2C1RVS1HOOC9UcnUzbzHj5x1crG7RuHQlWGoi103ktYuZJxZx/tlIxGB1Wvih8DqOJ5F+b2dnCu2rNHVLJ5mph2WUhgCNINpY1liaNxirDA2q4Gpqh4X1r+/2Bu2l8Lq0i83W3dYDAYDVaeVYYXkfmqMTaqnapneV9bH9ORjTNHbw6KhkqONzI9tqamip1wjXTt6cksqQpnSNgLVd4PLisXET9zyjuI0LNqFp5TNJnH8hs5ZGKMGQkMNRFrpvAVkWDaJl5w29uWsp0qqdopNR6dlp4ngmaKQYMp4W5usz4jTOeMmle7JujpN8gFQg40fO7vsDudpd5pN9YceXT+WTdLVc2lQ/ef3cjAnnH8uEoLMAoxJ6LUN2BMHqNLdXoGWtrkp+KONJs2WmmeZ86Q4nlGYIpZjgBaqnMzbFGocmqlmCqMSdQtdN1rTR50wDTMNPZ2Wve6d5xmphjH0r1ctPM8EqyRHBha76tKyDPTQfOXYcu6Gi32HwhBx49faOFSzNTVCSprU2ikWWJZE0qwxFmAZSrDEHRaupzS1UkJ806O76foKfwqrji6CdPdYDAYDVaeVYIXlfmqMbTyNNM8j85jieQjXOPZwqeF6iTMiGJ9lqKijpV0caTpbLX3lrjpj3v8AxyskixrnObVE7TNp0L0DkwMTgNJtc12eCrvsw8ef9ct93ZvedUU44nnrs7ct3VjUdQJBpXUw2i0TrLGrocVYYg5b2pPA6xkHk24yd3C3M1WKPTMebxl7sm6amzokqF1pxW7vp/cxT4JJUHp4q5N01TgiU69PGbkUXNXg0VK9VJguhRrbZamp46ePMjH/AJyEhRiTgBa8K/fsY4tEe3rcrPULD2tstLI0rYueUuS7N4AnnHjjqHV/88CrcR0srPzQp4G52u3uTwaQ8RuZ2HLftL4TRFlHjI+MPfwqKc01VHKPNOnuspDKCNRtPEJ4XjfUwwtIhjkZH5ynA/TqgswA1nRalhFPTxxDzRhY6BptXT+E1ckvQTo7uQhXTjs4NDSPVy4DQg5zWhiSGMJGMFGRmCKWY4AWvCtNS2auiIfvymoabT1nRD63K3DduqqnH4a+/g7ppylMkQ/uHT3DgDQdFrprPDKUMfKLofLe1N4LXSIOYeMvdwtz1Rv1DvZ50Wj8ujJukp97rRKObKP3+nbih368UPmx8c5L8n3i73w5z8QciozRhwKKlaqlzF1dJ2WghSCIJGMFGQkAEk4AWvGt8IbNTyQ/flJp0i16W2C00zy87Vs5WEqsqtIuegOldtqeVJ4VkiOKHg3zR+GUvE8qmlf4tqOB18C6KvwSsUnybcVsu6Wnz6ZZhrj193C3PT71eAU82UZuS/oN+u5yOdHxx9O7moc2leU63P7DJulnz6pIRqjGJ7zyEIxbHZwIYmmlWOMYsbUdOtLCET8zty3pXb8d6iPihrPW5N5FjGLnC0tUzaE4o/f5hdFeaKfB/IPzhs7bDSMRq4N/XaXPhNOuLeeo6e2yRu7ZqKxbYBakuF3XOqZN7+6NJtet3GhKkNnxt05LgqvCKPMY8eLR+XRkmjEsTxtqYYWkQxyMjc5TgeCjFHV11qcRaJxLEjrqYY2YBlKnUdFpozDM8Z1oc36co4t4pYo+quSrl3+qll6zY8hGMEHAuuj8Gizm8q2vs7Mt8VuuniPpn3cBQW5oJ7rJR1LaoW/PRZbsqDrzB+dhdL9Mq/pYXSOmb/W3wUn1rfpaWgghQvLOVUdJtV1cQ4tLnn77fxYkscScT8y3OVucvgsh0jSnds5C8afwqjki6fN77d+u1yVPg1emPMfiHLuhh3q8S3RIM7hbnZt8oMw64zm5N0cW93jndEi4/Td2xb9XwJ0Z2JyXrLvN3zt05uA/PkEGLAcC5KTPff3HFXm9+W9KzwePNTyrftZVZ2wUFm7LQ3ZUya1EY+9aK6Ix5WRm7tFo6Knj5sS/npsBhq4N4X1FBilP42Tb5otU1MtS+fO5Y+z5pFI0UiyIcGU4i1HOtTTpKnnftyF/U+8XgxHNk449+S7KjwmiikPOwwbvybqIsYIZeq2b+vC3MS5tXJH11x/TJuoixp4Zeq2H6/Te5mPOrXfqJ7cm6eTNpYo+s2P6chANZy0sBqJ1jXp/a0aLHGqJoUaBlF3I8hkqWMjn8haONIxhGoUdnDqaiOmiz5mwHtteV6S1ZKrjHD1R09/zfc3VZk7U7HivpXv5DdHBvlDvg1xHH8sm5ifCSWA9IzxkviPfbtnGwZ36cK7JN6vCB/vYZL4j327ZxsXO/T6b3LphTzPtbDJumkzq1E6ichEMEGW5qXeYN8Ycd/2HDYhRixAHbaSvpk/uA+jps97xebG5s17v5sSjvNmvWoOrMH5WqmNTJnzMWPstvKWmVVOC/No3MUiunOU4i0EgmhSRdTDHhzRiWJ421MMLMCrFTrGi13TeD10MnQG092SRc+NlPSMLauDjhptE++RI/WGNnXOQqdRGFiM0lT0aPpq4UzLsi+9i2S+H3y86g7DhyA0DJddN4RUjHmLpbguyoMXIA7bT3pCnk8ZD2arTXnUPzSIx2Wdmc4uxY9vCY5oJsTicfm+5ubfKExnXG2H5cOaVIYy8rBVHSbVUglqZZAMAzE5KCXf6KGTpK6clYuZVzrsdvbwrmfPuynP3cP0yXmm93hUL98/TV3rmUNOv3BkqGz6iVtrE8NBi4yUFC9UcebF1rQQRwJmxLgMs00cC4ysFtUXsx0QLm/ea0kjytjIxY9vI1J0AfONzUuZXNH0SL7OFeN9OJWjpMABozzaaaSds6Z2c9uXc1JnULJ1HyXoMLyqfT4W5tsbuw6rkZN0C5t6SfeAP01GM2NV2C0hzY2OwchD5S12Xfv8AhJNoi6B1rKAoAUYAZGYIpZiAB0m1ZfGnMpBj982ZixxYlm2nk6g4yns+cXbJvV4U7ffA4VSm91MqHzWI4G5d8J502qDkvj5UqfS93C3LHxE67GB/bJumH/XRnbH7/plNLqO3JXHCinP3D7OQuGmSprDvnNRccNuWtrYqReNpfoUWrKyWqbGQ8XoUahaMYDlG0sfnAOawbZpsNIx4N+JmXpN24N+3A3Ptm3on3gRkvY43nU+nwtyp41SPROTdSPHwH7p+mabTUwj749uS9NF3VP4Z5DcsPH1B+6Ml5XoIcY6fBpOk9C2Zi7FmJLHWTZRieQAxOA12YZrEHo+eHVanOdBGdqjg7plwvBTtjHAug5t503pZLxOdX1J/9w8Lct8YnH3R7cm6r/03+Xu+maP45B+IvtyXv8mVPoHkNyuuq/x99rzvTOxipjo6X/jLGNHIUsO9jObnH9rVHl378p1H5ydVqT4pD6A9nB3R0jyhJ4wWzBgwGzgXfor6b8RbarO2e7NtOPC3L/G5vQ9+TdTqpv8AL3fTNJ8bg9NfbkvX5NqfQPIU0rpHLGpwV8M7t4A1cOjhx8Y35ZKwYTntHzw6rRDNiRdgHCeKN+fGjd4tfd2wx0xngXMK6wNRyUPx2n/EX22vCTeqGd9iHh7lvjM/oD25N1P/AKb/AC930zCcJozsYZLwGNDUfhn2chDrOVecOHTxb4/YNeWvHMb8uBKMJG+cQJvk8adZgOQv84XXJ2kD98l3DG8Kb8QW3SS5lBmdMjYcPcqOPUnsX35N1J8ZTjsP0zqsNIFqgZ0Ei7VNujhxc7KnO4QGJwFoY97TD9ctWudAezTwKoaQfnFyR75ecOxeNyG6VsLvA6zjJcq516U/fj+1t08udUxRdRcf14e5ZfE1DbWAybpz/wBZENie/wCmqJs+jgbagyOM12XYcOGnOGVOdwqKP+4fy4GvRZhmsV2ZZlzoz843LxceabZxByG6l9FOne2Tc4udeWPVQm14TeEVs0nQW0d3D3NLhd2PWc5N0LY3m/3VA+mrkbOuuDsGGS803u8Khfvk8knO4Ma57hR02UZoAGocGtTCQNt4E6Zr9h+YwxtNIscYxZtAtS0EENMsTIj7SRrNpbpo5P7Wb6JwtNufX+xMR2OLT3RWRf288bUONipVs1gQ2w2uyn8Foo4/O1t38huikz7wzeooGS7X8Hoq2fzsBGveeQuVMy7IBtGOS9Xz7yqD9/D6a3MvjQunVfJujjzLyLddQeQTmjINfBok0Fz06uFOm+REdPRwJEz1wtqOn5hcN3+Dx7/KPGuNA6o4Loj4Z6q2G0cKqqoaVQZ3C46u20V6UchwEwB+9otLVQRR57ypm99quXf6mSXrNjkeT/pY4htLtw9ei0Kb3EiDzRhYnAYnos7Z7s3WOP01uXkwnnj2qGybqY+JBLsJXkIj0ZRpGUDEgCyjNUAdHDqVzJTsOngTR52ka+XuW69K1FSvaiH2nlL+m328nA1RjM5S7Y99r4E+9kvSTervnb7uH03ckm9XnDsbi5L9i327Zdq8fkEODZY8tGuM2OzkK1eIG2cGWLO0rrsdGvk0RpGCoCzHUBa6rnEOEtVg0nQvQuSqqYqWLfJmwHttXXlNVS52cY1HNVTqtDe1ZF/dzxsfTaDdB9fD+aG1NeVLUaElAbY2jhPjmnN53RapjlimYTqRJrOPKbmos6teToRfbk3Ty5tJHH129n02rFGDDWDjaJxJEjjUwxs6h0ZTqIwtIhjkZG1qcOQU4jIpwOWhHFY8hMM6Jx2cKSMPr17bPEy9o5GhuiepwLjeo9ra/wBLUVFDRrhEunpY6zkvG94abFIsJZdg1DvtU1EtTJnzNnN7ODTV1TTeSlOHVOkWpL+VtFUmb95dVoZo50zoXV17OBU00VTHmTJnD2WvG6JaXF4/GRbekcnuchzKDP6ZGxybpZc+uWP6tfb9Obn5t8u5V6Yzm5N0MO9XizDVIM7kIj0ZUOIyUXkj38gdXINErdFmpuq362MLjosUbqmyo7HBUYnsForrrJNUBX0tFoLgc+XmA7E02pbupqXTHHxus2k21a7Vd700GhW319ifzatvWoqsVx3uPqryMUrwvnROUbaLUN+nQtYP81/i0UiSoHiYMp6RwLzudJ8ZKbBJdnQ1pUaJykilWGsHkFBZgq6zoFoIxDCka6lGFtWu1VLv9TLL12x+nNzU+ZVtEdUg/cZN0sG+UayjXEf2PICw0jIpwOShPOH58hKc2Nj2cOVWiOKHi2iqAD41Cw+6cLRVF3Hn+Er+htH8En+8f8iRaM3YvNen/NreG0SDRPCO42e9qJf74PojG0t/wDyccj/tae/qhvJIkf72nqp6jy0rP2E6OVpqmWmfPgcqf2NruveKpwSXCOX9jwN08qGWKMAb4oxJ93IXBBv14Kx5sfG/jJfU+8XdIRzm4g/P6dp5TBOkq61ONkYOisuojEWmjEsTxtzWGFpUMUrRtzlOB5CI9GWM9FoXzJAeQq38z9eQnizNI5vze7L4enwjqMXi29K2ikSVA8bBlOoi1VMtPTvK+pRaaRppXkfnMcTyG52n3qi3w86U4/lk3Sz59SkI1RjE95+ntztRvtFvZ50Wj8ujJulpt7qVnHNk0Hv5FTiMqNjr12pp83ivq28KaUR+lYnE4nkZoM3jJq2fN7urpKKTFdMZ5ybbX3eIq97jhx3scY47eQpYTUVEcS+cbIoRQq6gMBaVxFGzvzVGJtPIZpnlbW5x+nrkqfB69MeZJxDkvKm8Lo3i87WvfbVr18gjYHgK2PfaKZo9WrZZapDzgRbf4utY1MY6Se60lUx5gzba7DkpqcNpXQbMpU4MMD80Ck2wCjt5Hc1S8+pb0V9+TdLU5lOsC65NJ7vsBdVV4XRI5544rd+TdDSbxV76o4kun8+Rjbo4Cvjr18MckyhxgwxtJSkczT2WIwOB+YR0ztpPFG02wjj5gz26xsx6TYnE8hTxNPMkSc5jhaCJYYUjTmqMLHQNNryqfC6x5PN1L3fYC4KvweszGPi5dH59GS8KYVdK8R161Ow2YFWKsMGGgjkVbHgK+Gvhg8myhhxhjZ6UHmHDvs0Ei+bj3W1a+RAJ1DGy00jdGHfZKMee2PdbOii8moxs7s+vI7Y93I7mqTBWqnGvip/OTdBVbzS7yp48vs+wVz1fhdIC3lF4rZN0dHmSeFIOK2h+/kQcLKceADhqsr7eEDypAOsA2NPEfNw7reCJta3gY65/S3gf3/2t4H9/9rCkXpY2FLH2n87CGMakFtVnmVdWk2eRn16tmV2x0DkaGmarqViX8zsFkUIgVBgoGAs7BELMcFAxJtX1Jq6p5TqOobB9grqq/A6sOfJnQ/dbXqtNGs0TRyDFWGBtW0zUlS0T9Go7RyIOFlOPBDEWDg9nBB+ZsQvOOFmn6o/WzOzazwHboHJXLQ+CU+Ljxz6W7OzJujrMAKVDpOl/4+wm56uz08FkPGXmdoyXzQ+GU+KeWTSvb2ckDhZWx4QJGqwk22DA9PADcsWVdZFmnXzRjZpnPZ3cJ2x1auS3P0O+yeEyjiIeL2nJXVK0lM0rfkNptI7SSM7nFmOJ+wkbtFIrocGU4g2u+rWsphIuvUw2HJugu/NJqoRoPlB7+TV8dfIAkajYSGwlHSLb4ts4bbBrZwyYZdG0WLoPOFjMljUDoWxnbowFi7HWx4ZOGuzNjyV20bVtQEGhBpZtgtGixxqiDBV0AWOgYm1713hlRxfJJoX+fsNdVaaKoztcbaHFkYOoZTip0g2IBBB0g2vigNHNinkG5vZ2cmr4a7a+VxO22J2m2J2nlWfCxOOvkqeF55VjiGLNagpUo6cRpr847Tk3Q1+ANLCdJ8ofd9iLhvHeX8HmPim5p6pyTxJPE0coxVrXhRPRT5j6VPNbbyYOGqyvt+ckgWZ8eTRWdwqDFjoAtdN3iii42BmbnH3ZL4vDwOLNTy7auztsTicTpP2JuG8t8ApqhuOOYx6ezJV08dVCY5RoP7WrqSSjn3uT/FtvKBiLBx81LAWMmzlFBZgFGJOoWue7RSJvkumc/wCuS8axKKDPbSx5q7bTyvPK0khxZvsUNGq1y3n4SN5nPjxqPWyVlLHVwmOUdx2WrqOSjlzJNXmt0HlQcNVhJtsGB5fHCxkHRYuTyqqXYKoJY6gLXRdgpBvkuBnP+uStqo6SEyS/kNtqypkq5zJLr6Bs+xgJUgg4Eaja5r0FUBFPonH+2SpgjqIjHKuKm15XdJRPp40R1P8Azy+OFt8Nt87LZ4tnDbbHgYjbbPG22+C2+dlix28vBE88gjiUsx6LXXdqUS5zYNMdbbO7JWVUdJDvkp7h0m1dVyVk2+Sfkuz7HA4EEaCLXPewnwhqThL0N1v/ADkdVdCrgFTrBtet0NBjJTYtF1elfomhopayTNiHFGtjqFqGiio482IaeljrOS8K2Oiizn0seau21ZVSVc2+THT0DoH2Rum+MMIaxtHRJ/NterJedzpPjJT4JLs6GtNE8MhSVSrDoP0NdtzPPhJU4xx7Ok2ijSGMJEoVR0DJed5R0QzRx5uhdnfaomeolMkrZzH7J3ZeklHgj4vBs2d1qeeOojEkLBlyVdJDVx5sy47D0i143TNSYuvjYesNY7/oOlpZqp82FMdp6Ba7roipcHk8ZNt6BlvS+guMVGcW6ZP4sSWJJOJPT9laSplpZM+FsD0joNruvWGrwRvFzdU9Pdlr7nhqcWi8VL2ajaro56RsJkwHQw1H5+iNIwVFLMegWoLiJwasOA6i2ijSJAkShVHQMlVUxUsefM+aPba871lq8UTxcOzpPf8AZm7r5lgwSoxlj2+cLU1TFUpnQuGHsyMAwwYAg9BtW3HFJi1Od6bZ5tquiqKXy0ZA6w0j53HG8rZsas7bALUdwu2DVTZg6q67U1NDTJmwIF9+TUMTa8L7SPFKTCR+t5o/m000k8heVizbT9m4pXhfPico20WoL91LWD/Nf4tFIkqZ0bBl2jJr12q7npZ8Sq70+1P4tU3LVReTAlX7uv8ASzKUbNcFW2H5tTXfU1Hk4jm9ZtAtS3DGumpcuequgWhhjhTNiRUXsy1t7U9NiAd9k6q2rrxnrDx2wj6i6vs/BPLTvnQuyHstR39qWrT/ADT+LQTxVC50Lq47MssMcy4SorjtFqi4qaTTEXiPZpFp7iqU8mySD9DaalqIfKwyL+XLxxvIcI0Z/RGNoLnrJdcYjH3zaDc+g0zzFuxRhanoaan8lCoO06TlOgYm1ZfNPBoj8c/3dX62rLzqarEM+anVX7Ro7RtnIxVtoNqW/KmLRLhMvboNqa+aSbQzGJvv2UhhipBHZwJaWCbykMbd4tLctG+pWT0Ws+55PMqGHeuNm3PzeZPGe8EWa46wat6P+Vjc1aP7QPcwt8E131B9YW+Ca76g+sLC6K76n/YWFyVh81B/lZbgqDzpIh+psm57r1H6LaO4qVee0j/nhaK7qSLmwJ+YxsAAMAMBwKitp6fysqg7Om1Vf/RSxf5P/FqmsnqT46QsNnR9qIZpIDjDIydxtBftSnlQko/Q2gv2nfyqvGf1Foq2mm8nPGfz5eSWOIYyOq95tNfFHHqkMh+4LT7oGPkIQO1zaovCqn58zYbF0D7XxzyxeTlde5rR3vWp/ezvSAsl/wBQOfHE37WXdCPOpz+TWW/6fzopR+lhflJ/7g/xt8NUXXb1Db4aovrG9Q2N+Ue2Q/42N/UvQsp/KzboI/Ngc95s+6CTzIEHe1pL8rG5pjTuW0tfVS8+ok/I4W1nE6//ANbdNA9TMIosM47bfAlZ1Y/Wt8CVnVT1rfAlZ1U9a3wJWdVPWt8CVnVT1rS3bVxc6B8OzTwKSnkqpd7hALYY6Tb4FreqnrW+Ba3qp61vgWs6qetb4FrOqnrW+Bazqp61vgWs6qetb4FrOqnrWkQo7I2tTgbU1O9TLvcQBbDG3wNW9RfWtNdVXDE0joM1deBx4NJTSVUu9wgFsMdJt8C1nVT1rS3RVxRs7KmaoxPG4FPQVNRpihbDadAslwVB58sa/vb+n3/5C+rZ7hqBzZIm/a0931UHlIWw2jTwqegqqjTHC2G06BZLgqDzpIl/ex3PydE6eraS46tebvb9xtNBJA2bMjIe3gIpd1UaycLfAtZ1U9a3wLWdVPWtIpR2RtanA8CC6quaMOqAKdWccLfAtZ1U9a0t01USF5N7VBrJf7C7n/lSP0W4dZQwVY8anG6w12vK75KGTjcaM818m5r5RP4Z93IVvxyf8Rvbbc78pj0Dlvy7vBn36EeJbWOqeBua+UT+GfdkvD4hUfht7MgBYgKMSdQtdd0JAokqAHm2dC8K9qWkNPJNMmBUc5dBy0tPJVTCOFcT7LUF0wUoDMN8l6x93BkRZFzXUMuw2vK5MMZKP/t/xY6DpyUfxyD8Rfblrfjk/wCI3ty3JdefhUVK8XzEPT25JZEhjaSQ5qLrNrzvB62XqxDmr9hdz/ypH6JyMc1Sdlv6gT/jt61v6gX/AI7etZd0EePGgcDsNqOtgqx4l8T0qdeSphSohaKQcVrTRmKV435ynA23NfKJ/DPuyTyb1C8mGOaMbf1BH/x39a39Qp/x29a39Qp/x29a39Qp/wAdvWt/UK/8dvWtM++TSPqzmJtud+Ux6ByyIsiFHGKnQRa9KFqKfDXGea2Xc18on8M+7JX/ABGo/Db2ZNzVOJKh5m/t6B35JHWKNnkOao1m1Rf4DYU8OI2vb4fqceZF+htDug+ug9Q2pbypanQkmDdVtBtumqcWSmU6uM3uyQxtNKscYxZjgLXfRpRwZic7zm25HZUUs5CqOk2nvuljOCZ0vo6rf1CmOmnfD0rUt7UtQc0PmPsfRlv+7xIhqYR4xeeNoyUfxyD8RfblrvjtR+I3tyXLde+4VFSPF+ap87JI6xoXchVGsm173i1a+amiBdQ29v2G3PfKieick3kn7jboy00zU86SprU2U5ygjUcm6BM283+8AbbmvlE/hn3ZLw+I1H4Z9nD3OfKQ9A8Crp0qoGik1H9rVlM9JO0UmsajtGTc18on8M+7JX/Eaj8NvZk3M4eBSbd892TdCjvdx3vTgwLd3BYljixJPbk3MU3lKlvQX35JpVhiaSQ4Kuk2vGukrZcW0Rjmps4FyXo0ci09Q2MZ0Kx83LetN4LWyIOZzl7rUfxyD019uWu+O1H4je21y3Xv2E9QPFeavWyOyohZyAo1k2va8mrHzU0QDUNvb9h9z/yononJN5J+48CGJppVjTnMcLKM1QuzRk3QtnXk33VAtua+UT+GfdkqY99p5IwcCykW/p+T69P0t/T8n16fpb+npPr09W39Py/Xp6tryoGoTHnurZ+OrJuc+Uv8Dknfe4XfqqTalnSphWWM8U5LzolrYM3VIOa1pY2ikZJBmsugi25r5RP4Z92Sv+I1H4bezJuaqAk0kDefpXvy1N1Us+nMzG2potNufceRmU9jDC011VkWuEsPuabEEHAjA7Mt0R73dsA2rnfrk3TzYRRQjzjnHhXZMaighkbnEae/Jupj0QSdOlbUfxyD8Rfblpbs8Ir555x4nfDgOtpyEgDEnAWvq8vC33qI+IX/AG+xG5/5UT0WyOM5SNot/Tx/5I9S39PH/kj1LLufGPGqD+S2orvgo9MYxfrHXkmkWGJpJDgqjE2qJTPO8ja2ONtzXyifwz7uHup59N3Nk3OfKY9A5K74lP6B9lrrr2optsTc5ffaN1kQOhxU6Qcl9Xd4XHvkY8ev+3Zbc2P/AMi34ZyV/wARqPw29mRWKsCpwI1G13X0kgCVfEfr9BsCCMQcRwKqlhqlwmjDdvTa9Lqek48eLw7ele+x1WpPisPoD2ZN0/x2L8P38Lc78mL6RybqPicXp+61H8cg9NfbwSARgdItfN3+BzZyeQfm9nZ9iNz/AMqJ6J4dRURUyZ0zhRa9rzatOYgKwjo25NzXyifwz7slU5ippXXWqki3w7VbIvVt8O1WyL1bfDtXsi9W3w7V7IvVtXV0taU37N4urNGTc58pj0DkrviVR+G3syXHePgz7zMfEt09U5RRql4eEpozlIYe/JXfEqj8NvZwIZ5YD4mR07jaC/KpPKBJO8YWhv8Ahbysbp3abU9VDUjGCRXyMoZSrDEHWLVsHg1XLF0KdHda6X3y7ac/dwybp4c6GKYeYcD+fCuyDwehijPOA09+TdTJ5CPva1J8bg9NfbwILwgnq3gjbFl6eg92SohSohaOUYq1q6lejqDE/wCR2j7D7n/lRPROSQ5sbEdAt8PVXVh9W3w9V9WH1bfD1V1Yv0tJe1bJ/ezfRGFnZnbOclm2nLua+UT+GfdkvD4hUfhnh7nflMegcld8Sn/Db2ZbgvLVSzn8Nj7OBX/Eqj8NvZkhjaaVY0GLMcBapppaZ8ydCp/Y8CnkeKZHiODg6LDJug+VJMNgtuYqeLJTN6a+/JLGssbRyDFWGBteV3yUUmnjRHmvwLjuxnkWoqFwQaVU9OW9anwqukccwcVe61J8bg9Nfblvy8yzNTU5wUaHbb2WRmRwyHBhpBtdVctbBjqlXnDJeNGlbBmNoYc1tlpo3hlaOQYOuv7DbnvlRPROSbyT9xt0cPc18on8M+7JPHvsLxk4Zwwt/T8f17/pb+no/r3/AEt/T0f/ACH9UW/p6P69/wBBb+n4/r3/AEteFOKWreENnBem2535THoHJW/E5/Qb2cC47x8JTeZj45f9hlrviU/4bezJuZpcZHqW1LxVtIiyLmyKGXYbVFx0smmPOiPZpFm3PyeZOh7xZbgnx0yxAfnagueKmkEjsZXGrYMjEKCW0AWrp/CauWXoY6O60ErQTLJGcGU42oatKyASJr85dmRgGBDAEHoNp7kpJDioaM/dNhufix0zyYdwtS3XS0xzljzm2vpy39eIijNPCfGtzj1RkpPjcHpr7ctd8eqPxG9uSiqXpKhZY+jWNotS1CVMCyxHQf2yX3d/hcW+RDx6f7DZ9htz/wAqJ6JyTeRf0TYauHua+UT+GfdyF/fKs35ey25z5THoHJW/E5/Qb2cCN2jdXQ4MukG111y1sGOqVecuSu+JVH4bezJdN7QwwpBMuYF84e+0UqSrnROrDsPBlkSJC8jBVHSbXvevhQMUGIh6T1stLUyUsufC2B9tqC9oKnBXO9y7D08GR1jUs7BV2m1433oMdF/3D7rE4nE68lH8bg9NfblrvjtR+I3ty3TXmin0+RbnD32VgyhlOIOo5N0F3a6qEfiD3/YWnnkp5RJCc1x02+GK767/AFFmvesZSDLoP3RyFNUSU0mfC2a2GGq3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i1RM9RKZJTi51m1NUSU0m+Qtmthhqt8MVv1o9UWe9ax0ZWl4rDA8UcGmnkppd8hbNa3wxW/Wj1RaS9qyRGRpBmsMDxRljkeNs6NmU7QbQ3zWR63D+kLLugm86GM9xsd0EmGiBPWtLfdW/NzE7haaaSZs6V2c9p4VPXVNP5KZgNh0iyX9UjnJE37WO6CXDRAn62kvurfmlE7ltNPJOcZpGc9p4CMUcMvOBxFvhit+tHqi3wxW/Wj1RaRjI7O3OY4ngU95VVPEI4pMEHRhjb4ZrvrR6ot8L1p1yj1RY6T/wDVRf/EAC0QAAECAwUIAwEBAQEAAAAAAAEAESExURAgQWFxMIGRobHB0fBg4fFQQLCQ/9oACAEBAAE/If8Akc6ouxTPK6ancuUt9kR1ouywa0IoQxjyUaVsZtTHdCTuoBdCP0U390TXNRNGBYwND8wbyUYXMKGA5Ak+yYiZtFyU2ypeeaAAwADLaAGD5ZT3PYm+iMc0LqQTsQBxc5TWqtU+UlRmLDiKletqTWypuYbocwKiFONSJydG9UNyxCwmNfqjh8d4X7lY26F4QMTd9URyYkudD9kWAeHA9xCnC5nuZGheTqX1hin+qUyHIjmBiPkYiWEymUQ2q08kyNTOG4SQDBhAC10FCS/AE4g3Ub5RMvDPPEovuwk3BYvjtHoarSkYU8qhuspwKYwd4Aw4yQyacRxbq9pERvmpnoMPJUViyB0OPyBgD+BFp5IADvI+lrK5midydS3QcJ9ERLcvWH+XM0CB4VCPXCPg0+VzkgQQCIg2GB+mFwtVYOQ4IiA+AdK/HJDAoQ8p4AxhS0YWuQe9RTeioYqCJ78EbFqZHJ/1HR6EWTTvQH3CkgUI4NhrQYJaUTuMQfKr1RCAICBBw+MFKFMAOShtqQB6uyFiZgBgLG0iSI6QTw7mOZhuRLkkxJmdu9xgABECn0aDgdtG3Jz6gRwIcS8IACQIMiLD2CoBjvqpzf3HT4tE2YsnMocA+ICOgoLAkUchgFKUJEPR3KitQIcn/DqgOiIImBU/el2RgSDA7YeqmTuomW3CheRZAdOQOFVazN5x8UCnAnwkHhosczU2OByHsIDNORsPtIn/AB5fCLSRur3IqQMwbAPlNhiM1H64L9oxMBgDHZFAM5DEFOOmMgj1vQBFBIgjGxps3J8BRbqsAxB+Imps5J8UBkGYAYAWGTQoTPIUYebkOT/jzuAXRSUEXQjCc0UQjoECZ190lvP5J8OXTyCnOqcyGZwZgYjYiJOWZnioQ8Bp1KhsgWG1csiLKmQeunw8pt83ODl1UpIBiAESTgjPuSOeWgZ7edoVkvKegeVQXfIpcgFIG5C9Cru7HkWgK4gioMmGoteSsJA0Kftx7cMipvSAsdgNt6smhTo8Yz8hZCTg+WRyWKW4rmMvhryF4n5jl1sBbFeQARCwTvznLLaz1apgEGb2SSUGszcCCCF4EnCyAkEwgbCAK/eA9yutpmBx0FPZqSBBBACCIEG+exIgnmYHWzGVkH+F/TJ7r4juMvhePQgK6aIAAAAMBghYhnIYAKM8/edTlltImAgiJGdcC0bJoCRPNY5CJDs7AYd1nll68S0UCO+qmlPuPa+fsW4FBwBqZMrHE1NXNkirT3EwfhM54jsDMoA0VhgESAHJYIpGhYkY66bNiBvwCju9yQQtCFoQ2PNtB3IZFNVcj1U3bt32uwVzkCqqJE9SozvmREOBQUQ9Z4sdYcgez/CHXROAqUDmpiLEmx3TQ9Pfhsz4AcSEAAACgQQuC4EELAVPBoSguQjNlxwxRXcU7A0jh08k4gEaDdXQg1T8wzZI3i2xEMCkU7AnDEqGx3jyB6AevwfCRvyXlZhUp8zWiOxMIDlC/AoIIIXgjMBoAOpE3UmWBmTyDqgqyFzVxzKlxmjlcvMCIk5Esy9yk8A3QvxaoEMQiyJIA6O4QaKOQ4NwDbEwOcenRBBIIIIwN5/Bgg9GYQvQbDEIY0VxiEYbn0JiPguRpT7wsjUycCCfHJye2xZBFQFPE2iwIWBASQACScAmU5v4KNnnoBNIdkZPw445o0QOSiVnAonQvVlAbVso1umMgdKFS43mNyXTiLBUZ9b7DiImBx8bIXxpHwKLgPJGB+BzM6dGJUOYhGAcwCOwczqtiMgZXFYLgQQqUcATc26p4pvZzid6JABJgKp4HnCTesDdMLAgghdajVNmJqkiOhyUOQ+tnkuVfQeLsvGQEIC4IwKCZiRZ132YUiMVw7OHwN4gmf0j4sbIKl9Y+diYUxDaG83ghcxyA5Kb8xcd5Wl2MbHF/L9SjmmSPuwWBBC0WCOFAc6olySS5O0ILN5gKGIGIwCo8WgMAEgxBxR3gMw+a8joJa76TRSwE4IxCe1IDJT3CBowPwEmuWgz8IQgMAYAYIibHIxK41GA2AU6mneCZS1YnoFBSKZxLfYYCddR8V/RkEEEELoQRo2UWQ8KDbFuq8wCoXQ/AWhWgwxFgQoapjnnekWMXGndZTks31+AuDTgMPmyHSO078NuA+Q5gEymYicOsqhAMLHPQ/UsrUoNLAgghYLoIU0SsV/qDsyIDmBMlQt8OiBo7orrmjicwy6WuNe48HJBcJhaWFql9YXsU5NUYhGVZiZIKAJwOITjDRNSkf75q/joE0AQGAMAMEYliiRU3O8Gwn8k0Lo7WhwCpWMwIo5CgskmNA9HNRJJJJJmShYELAhdhMDmdE8oDc/ezIAJIWAEyhAGIICmmtuveHlZWucl9Zigh2wYiwgEEEOCmc+gG7xemZcSmOPWxp0beJcD1/vsnjwwnz6WOGjwwkOPTYwjHG4Fm7FL7IDZjEmZVNhyNEEnBHeTi4vpYLQhYEELRTHLHuophwGA2kjMj4bhiZ2L4wQkLcYy5Hg7+tscDeowcOl7JTFcQ4IobicGoU67mhfMVrD+6ENzMGalEj1HFECEmAiSjm+ihLYPOyk1u9IYPte7+RsFCCck4KLM6AxznwhYLoQQsJBCQAEyVP4zsiSSSS5Mydo8YXMnX2ukPaJ7KtcIgJEEFwRggFglWdd9rGGJvXguL0cXJ7OW6xi8wdMDyb+6+AcHAlzsiM3NJ8n2ADmE00hhcB4IxplzlwOZsE2Ack4I72QeGetgQuCwIIKCF6UUdibCMtqzpAvMyiHaBg2GV0rAczrvIgkAQBYg4XHZ9FrutZ/HbV+2vOemOsx7nY1BycCfJ/7rdpMelXseJ6Q3ddhHErh7AeGai1GeOVbXuIIGLxcCFotaxoGJT/3N/gfASTUUIgAgJRBF0qLwJHIzqgs11BU2hIPEMkfzBgwxBobGR1Gvjidt1kznnvUDcvWF2GwJrBSwuO9BRcThkp454D/b0mhhwzAOuKJYOZLPiDTDlsM+GJtAJLCJOCC0w9xaZmUgoELD7HcjqSn0xXXCuEmhFYw3IPqSnsGZCJHcqOHkjgomJ/xYJl044ty8wBdg9bAtEYcqBJEEEgGCBFE4jbmsjxtYYQe/I9L0fIvcmLHQZDfED0H9uFrkOgI9rGNLcSg7qWz8xrDCcat1se4cMtU4BMAcpsNYFHgFHSNBYsbVQdzQAYABldKgAcC7mY7lS5Qw0DD/ACRnSGaktBEVYjYN/Ye8+3Wx7D8CQNjUCJC0DyLzrmDLUvBsYgRMegeR/bceUDUvo2NrN9oHkjYRtxbjbImjEoaDFiwuxaaLc1yJGSyHcLXzYQcqlQBFjqCOp2/z9KBhnxHTYMwusIHtY8qG+RA9rK6Mua9Hpg0tDDvZBeLDWLt/bdMSxOg+7GEkDiT+bDWUbZAhv0BfzYETJ1BNogDnLBFc4CugBcD6iLAMgso8UAuPjH/Me5gNYKTDx335hDPep6uS1CjkwA1IHrYORjcQTGAzELoIgExEIQSQeMIE6It6PNBkt39p5YlxDZTRnuAGwBgUFjOH3gLpSK8SZO4DdHEnUZUx4lZqUN7wCsgjEKZ/zuoit5Ed783KxERUHQcATY+ZcPekbMhFzXnMmOabtZQZzjHv/ZksnOnZ6zxvtHOybwDGrIITExqnW1sUwGJ0Cegw1DwWePifYt1sT/ocQxPGLo94cxckJyTkFn0k3a1+zEw3GPmxo5zefvZA97HV+O3b+yYgrLpHJZph5IFwDW/KyCKxneH0QSgTACQsjQ2JGATxPkm4bgic8TM5Oz4Af6KAgjQw73jTtzS5HGU7i3ez2Ml5/wC0n0sbpDkX9kc2Ec7MiuuQkL4BeeIkigAAwgBZHF8VR8BQuwSIoZnaG5qf9BwEzHAiYDEPdhOXOBcbP479rHho5C9qkdSxmrDzHn+yGYD5LCderI33qEPM2GypGb5CjQkchyU002BhhcoAI89ExtMj/pnaLNdcrvoUc3HVp4giwITHq3i1xrAT6P7L2lFpjO/AYwACDOMSixy8rWH12EJO0QtbuWKw/wBExe3oundhBDnE6xtJ16OiQBJkEYvM/EXvcrsc7/ZDYlOksBwKN/DJgoeGkbgMApfcAEBL3seVA3CGJH+iZosuFyvBW0BKHMMGGCWlhZ6ihRmaA1aCZrwRcixKP9kzoHMWMPYLkrYtS+Ro1iQAAAAYCyPqXDWzf/R+hKdh78mWNb1dMIGA3BHtf3EOdjR5+Y/sguBpFG6GIdZPLkhJpf6Nsu8YAHJgAhDGcyqbcw3Jmth/obzRCe4eW2GRi6mxpULgJMAYEPUvq+19BB92O514l4/smRWbP5IhwyOcmfgN+DWtl3p2h53CABKRgimJk1rExmP9DpQgA6h7bDeM3IWNuHpQ7qLLlbiA5C+7VroO1jG/Cfv/AGn7iQ9xIs9GBj3viBe2RdLMCBgsDC61MhY63JHUH+F2zmE29Q4s1CsKnUyGOaI45hOJh/wJrLhgxToiTfJ7B5dDfhjYyxYt9GwqdzZeyhbuCHb+1Xg/AgHzZQDsvbYE9gbCbrc4g0Xt6bVcEfFgUQSAGI/wEgqMPRzdKkUJxEY3sGKEzoC0WFPWjgZUBL6VUGmeAHAYWAB/rUhyHO+AYEzAIEkB4QhHkA5Rz8ycZf8AtPDhG4t3sdCExOsR0OwnWiYNpp4JYIchA19tiguNm4ee3OWMBAPTTaPccQOp5mwQ2UHnBEnQR7WVPeGph3/tugliE948tZAWCG6fJ9g08LSgRS1iwC+wfDmTHQ3R4brQEiAYjZwi4AOSig4MZ+pU2GVAATKgCFwK4yNRImU1MdA/SlD3WBRYE7P87zJxBYWEwdHPYmofHPaPQJPf9AbGNMXzpF1b+3KPwahSU2O9RQzi0KmLc9xbYNJsaaW6zLbbQDwUFGyMwbEkUp0WiTa9VvrKKC5x3ZHZ8gUCgGF04GvsAU3PevwTCzJQb3GssA46CokRxYOKO+zejERuCA72NoYBB1i6N/cewuYekxyNjOGGHWR6c9hENVusiznuwmPRCVrWFgHJYWRssNRBEwDklS6FAT4KyQMUo/AqmFOAi6DuJRgAH2FESAJJgMSn9gZg3yINEm91MzsRSsiyEiopdfBS+PFe5WUjL4ii2DaYGwGo5xqFSznwokASTATRzmIGmHL+456bHpR7GUTp4B7bAmIImiYIxsjeFkHYbJIkya4ycEBclxcB9CmFp9xyRtcLtCDPuIeqDUPoFD+bE4nxYVBRlTH4RiFegJbWtwh1BijoZcgTwz2uEr6hgGXdsGEQX6y5uljxGDvfo/8AdkCNTxOMTIoHLlHvU2V7rYRX7rcVuVKZHRCIcSvwAGt8QCCCHBRTmny/zvTlxP5ggGjciBWLnmqcAj9vsMPI24AgO532P79Abuv96J8TjehusYTB3PyOmwBYuExG1o32KZstF4K0CUgiEiE7AhwQQ4KO4D46P87/AF5EMMwoVC4FBMTTu2E3pp6DE8EA5hgZBFuYg2QU3Wnl/eja3MZHj1sBAnBygSRBIgCAgQcNhOpG0FihixSBk9ZTQ+KBsPAqVaEoCwqYlEkiSXJxKN4HZOLdPAp7jM/yBnZhUouU0Mdg0A5/e7WOejbn5PwB4XQXmdngVsfGfHYuB08LQpS+E+ybgBRA2VTRGgg0P+AGyNNXLAwGgU07ozx2ASZJlmgJsyIgQkwESUyfjZed/wAAkGiXwxu1jfAPQEkXQSSMDsAWTXO5IRBAghxec12bWGGaixckQVOKxIgkwMc9iZYxZB1SvOyDifJApEiseUcjhTBFOYSbGaFOUx7LJcoRyx+PgT/H47XfY2USYYDv2JCcIIuLhCQBhAb2CdqN4wHXfYyOGLgjgWRAMVYt7kDMaydbYdAAIMAoFuUlPDULcobF94Ax4wUPYCAMAh7iRGATkYI1IkPgRzTBurcgQAJODEEKDIQUfabhx2JicIIuLsplRTyJC43OSDGSZNayZMmTJrGTJkyZMpMIMQezScxywuO0NjoqHnIYWMNYbph3fBMKW5HgbulkJB9oQggkEEETBw2JCcIA50vTUyp94UiC0QVRAgyN5kyZNayl2QUzVBSEsQlzG4YTUlsjLhJ4ug62RxSIcICfTITP4JphsBULayTIUjA+47IFi4mhQQHYTQCDmAVigIFxbUIFkPFFqCgTJCMo2GTIkJg3qacZB4k6BYiOpR/YKdzffELoc6CmydA9CMShoxmGARAhAAIklGjcJr9vgzvPBGldQg/hWGIQmQAxBxTaiSxV1dtmaCIIEA42uY4r95fsbUEAiUQnLZONcwHc5KKNNzazJVDAeo/CGpuSPwNDY21zEI0ciqfzsyE5IBoP+melEgEBsyrTWEyU9WNBwyZWCdQQw01Ixikhck4n4TRMMJqzsdeSjiVQjILgxBIa7SUyojpwP+WclGNCfZlCFMCJJQUAB8FB5sLMFPRPwny+cn4URIEiCIgjBBGAAaHzY9WEwTOoTfXOTJ85bUkxkTBwWLcduQmICAqWNMMtqemrTBKHW23DQZ52EYyHM6BEGigCQ0HwwxYpwFiCiFAKBkBqM8rAPuWzGaezjoQ5UHbgpCQgGbFAcUGeEC4Eyo4p7HFQsoikcAFEsARfht5NowUCjeBYNoKQZtAiErCQpDT4cYxJDggsQU0ZJlCyGtVgHBRMabM3kH8mBx6ZxyUbg/c9LHY4JmfjNEjmQEmg+Iz5SGwy8kCABJwZEWV0oyeIqZlb+MVgES+MKWFYFhawUTeKhFlYqmQy+JntQsfbBH4imGRpY0PQw0CokQYHAd/4b6TcjUKgRFFw4I72GAimGpWAO7VHLFOSLkn4q7/+wBQw1CGp2thSJiHECfSLUb7/AHyi0BclamlR3nwpbHgNYxFgDHIBioqqM8V2+MwVGHoiq36aeoYWFsIxA4K5mTLwiuUYjv8A9YyeKoo3mfPvGQTaPiRPUbCQQgAESSmcSD+Qhg79MvjYqNcVBMHNKG/wQUfpFcWEACAcHAqIhaHYjZNRw8RHgImFj/mbyCSBs9aAzQlTAWth7uLLU4IkFKgb1fj9ccunqMV7ga+C1ywlqLcqePJyzAcgp0NJP1vKOlkqXjiEDtnEqhUZjUDHIRTRorOKj1A3MNpAhAAJkpyMxgUGvgoyXljfifkYiNpMimgPsLhNJIwgHGSDTFIk4ucegLqbfmd0YYVQXghjAPQminI+YspL2nuvae6Kp18ynWqXlT+BG7fnKmhZscljXq95ppKgA1x7b+EvwBBj6GhPbdyG75Q/RaXJQmqCOkmYaG6SanmjQeG3bD8sJ1yA5zknIaqOQTu3PG6Xy4xmjT63BUYzS5Ujp7N8kX0Iu6PnvlBcNHrPZAy0hoTokd0Py5CK5pFdQC6pycg4MuSJLg9Rj/5tjxIRIcwheyta1vRODHxoggkEEETBti4FKQFl/wAqvzq/Or8yvzq/Pphh41UIXOJMJaS/LpgCHZk2l0mcBKQs24OAwGQuCwQP9woADkQdC1B3X5QYnKHKD33K+V4ICh+8UxboJRnFnMkJfhc81pQiz3JQeDUr86vzqZYeNVFyK/GJNovzqA+FcAw+C+4pfJQKiEO9CgJ/AE8jQ2e9rsHrKl73K3ExwPZjc9pWx7SqwxQpgTJUzU3R0KnO9HTZNDgM7XYnEnAKlCBU2A0YXS06TC4TAE1JHq7ICQAQRAg4Wekot95Va/r3mDKwZMByLGRf3nP4L7mlkN3YSvyS/MI7VgJRGWigDdY66A2mamcPdL3NbADzB21YL8gvxS/HL8MqHC+FC2SaOV73K0DsdxiFMWLrChzFvta2PcVWBGcCNVjw62DihuTBHGYpn3BTUOn2LB3vZKOgY/qYqWRxeDvZBkIIGE5RxDsmsQIwCjhqg3EUOLAA6FyDSFFvlbBOjg42os9JRb6iqx9CUeeHLrYF2byACCXDHNM6vg3paWeuohJpafEh5qMQgyEOLHKB4duy9bXYmvU5XBw0jiVQgU4gJVhZ7Stj3FVkqxH4LGcEBIUei6fmvEnNjjCX2ugsa0ZxFhSZkaqm0o1KPWJYB6WGIjJNbYuK9IXpqLfcVJ5D0Tcxy62DWq8gAozjfNfB/e0s9VRCQtAs7KhjpALAAh6R7r1tbBh4CScHC/Vr9+v1y/bIOMog0hmbzZJ95WHHgEtJxYJ2kHeDQ2O40bSNNESKU4wXrK2PYVWGAblkxw6Wnyb7G6JI4SNzTiE4moC/aMzgzIMRaIXNxrFYc0gTcy68rxwHYnkgelgGYmIeY7r2lFskMU/s3VAAAABgjMIESTgiOIG466U+Ee0pZFdnA69R5XqfKHiw0e6eiyBjH+lke4wps3MUyXra33sMrPQ5W/PIvLXRmgux2GIsBJTDJ6gjB8EEBIOERZ7iqwiQpwTBR6hL7uhQmESRBcG5kzUgaFOJnfodVMTIEuysEuYGDivOiZPGzePMvRUXTIIJAg4ojaSSKurt8I9rS/TjzzOgxQAQ7gpnU+LPU1sMnR6k4C/XeV++8r9t5X7LyjAAl4gJ/lnocrPcVISWPjgXsxU5WGgwVVjBuSz3FVx+ZLC4STIAeo4jwmoH6wfKNWJMAxGosFgCYmIXsJHHJDA4Ceoh2sKFzNOTmOd4mNzrRNgIZjEHId17qi43EDjidyxuKmOWYUeUTw63wf2tLCzEQjgoPceV+g8olEnMH5TwHhQSFBMmVzb72tj2tL/tcrPSVISsYMLl1Htc9RVZBtMKlwj0DjcJ2CQY5JzBwxpYQOo9WQCQiDucHffZC8YZImaSpHI0NwtSHSJ1aloiN+AF7qi04yA0CWIZI601hgU4bQGfUZGw5aiqzwigzGD4N62lnrqISX/U1sCPAHeMHX59fh7RHvz6I6YRBncAr2uVnsqkJC3BzwJ42tbfeVWMT6nieyLzdMLhFCXOeQUOSwZ4RW5gEouA3BiVawpQCck4BegsYclCnIRoWkxDpZB6MQOCiIraXAoeKUACBWXIzh2tcWgYXA1NnuqLfaVWEAjBgYwT2DDxKhswEEPRuRgWMD8F9rSz2lFI0v8Aqa7B6eVehys99UhIWmZnMMCpWQFI1GRs9xVZLLwDcHQgch4vXZqPisESokQPiLRTCZGAUKAgK3DQboK0mVghmYGBB0d0QxCSLkmZs9VRb6iq2Z5g0smaFgCcEiLGJfMPvf8ABWkIIDAZrKe2SBHIGP5bCv8AIww3rKe2Synvksp75LKe2Syntksp75L0+NQLtgNIMp3ScwwXvXZDbEgGAd10MICGebhe9dkQmIFhG3STaKgAfX5hkJzQClmOZHsgzFnvnmsxsvNeZgC43IK4zDHuUiJ1oc2Zxua31mmuHWYIlCF712XvXZFJcgmZuYSEELOK9K7IjEFA4fWicLAOXYBh/wAqL//EACsQAQABAgQFBAMBAQEBAAAAAAERACEQMUFRIDBhcYFAkaGxUMHw0eHxYP/aAAgBAQABPxCj0LxPIeLX1B+OeJqeW8E08E1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1LU1NTU1NTU1NTU1NTU1NTUtTU1NTU4zU1NTU1NTU1NTU1ODU1NTU1NTU1NTU1OE1NTU1NTU1NTU1NTU1NTS1NTU1NS1NTU1NThNTU1NTwHNeQ8man0k1NTyzF5E1NTU4PMmpwmpqfTvJmpxnFw1pywcJqampqeRNTU+hnkT6CampqeVNTU+impqanmTU82cZpxafwLy55jzZ5U/i54VwfXTxHA8Ji4TwPGYzU1NTxzi8qanin001NTxzU1PJnhmp4Z5U+hMHgmp9PNPHPPnhngcJqampqeI4DlvPn0M/iT0U8l508nX0xTzJ/FmMeoj0+vrJp4X00YPqIqKio9GeiOM/LHLjgio5B6x9Mch9POD6UxeKOeeqOCMI9EfnzinknqXg14HhjlvBPA/mD0E+rcJ5LynmP4qeGanhmp9Q86fRHE82Pxc1PDPrH15yH8fPC8ueVPKP/AKF9K0cqfwpjP5NwnmnImpqan8rPNPSnE+gMYqPQTU1NHpI/Fv4J4lDNHeiq9p9CU4Qx1M/MqPgv5ZqLHpp+qpzbv5rlf8kaJoeaBtj/AJLqOe1/qGpufdyfcU2wZr9ZKiVJM2D7hFGc4Og+1NPKP/hJ9eoZoUHkJfRkfE0c/cwPzZ90MF8/qY/dRqcyJ70mhgFoIKeQYeWuijPuSglDad8T9Km99AHwPw1sNB2+UfBpAR5q9h/+LfUTxTRNyo/aPaa97EPhD6KIQz/3QniOFsBzTntNWhM0+iIpyOqifkV/Mz7TSC6d/wCqaNd6X9X+qC+xKlv3sb90j5vpP2VCjz0B5lTt+VLe0K6zwEfHAkbNOfmpqTcHd948JUEBvNadVf2mmsjCHcDcppwngPTx+JcD0rjNBAFSALq7FD39oGDoX+FTFXUID7L2XrQAACACAwKhC/8A6Ya2Q0D2SfpQjbQDD3fqkj0IPYg+KbqBLNc6V3qamp4ppuQwnWjgDkh+4lQQH2x8J+aMDW4+YPkpS35mztn5FZTWBt5MCnZuII/aNnhqG9ay/AfQ81LEn9JLeDUVHAck9BHoj0r6rUzk+H3vMDvQdBLwP2cuwDGULkhH2Mz4K0Bie4hu80CdfCxtFz5WhiYtOca1NTxPJmpwLZ/yZd4s+aLWswsew+SrChgQr0zvcaVEBIjImGQMNW8NQpXGcrpn9jJ1K2ZiaTdZDqSVGJwuJzT8lPLmpqeCxVkSOjHNdCesVBPfQYfs913rWuBo5El57n2RSIpYhN1dvA80gjZX75b8BwzU4nG8BWkNyoiay3jyy8RT7yWud9+2TrQMcksHRMEprqFus11KfzVL95kelu6k1qgIo0RyeCanB9AekK19BNHLfQH0w4Q6AZtRFlYs7xfTy6VAhIgGwGWBEoSHxC/lg60jPFpkDqfh7qZgolGVd114Y4nGKaIqQRAalyrrZ1Ow5YxyJwGnIhS3um3mz1pE6sTle+fnbrQZGlEibjU0a60M7A5HvfZKI3akl7bo9V++dJTxHOPwutHMeS4zgIgkNrvNLtm6FBSiPOB+Iu6rhAtUYG6tKoGbMvd/jTWmE3J1dVxcI454CmKkKe9astqTkagJKZql89ezQQCDCJCOMVHHNThch0rXz5vtbo1MlMKDcTTqHmMBKxdx/wB61Goo5I9P/Y6512xPTvrZ9BHIeCxRZS8Mwc3dyOrarz7IzLVM03cL07Kx6j9j5yqAKeUm0v2PgKmp5ThFRUYOTX9XQUUN6hDZbKdH+qeIsCuNNKGauQLIQMC2nImgUV0h9j9KzQHMDw3pp45ofZmm5CXGjjdiAD0Jl2W3DOiuiJSByR1MC7vQwn66uTrvSYGRQtEwPQThNTU1P4A9M4tAsaXX7fUzdLXog9jAGQBkYTrgfdah9eRrOVXgsDHq8uOGMJNymgn7hCsrGVFGdFRbOxDf+nSgpAgYRzHarpHKmClz5yJ1OZ4daWwREHHstzxUpiyL17ns1HwLzWnVX9ppVWwh3A3KioxcSmAU1zcjm6ZPTOrXNBlqA0emCW3iKx0iz6sz4p3uRttA6rRMB/DaYPLaPUOVIPGCL7D+J9MwAAALAaUVsVCAGauhRyGl6C11PcOkF3SCxgckwWKjVJqIe7UUlbSv4qCmtoD91vx1X91k38GizxhKBGR7UUUYw8BoBppfP2daSp6Fh69vaudQo7IY8kJH2xZRZEPhtyoaivIH0+wikKtCpeGnimpixgvNgfTmaUzgMl39z4E+GirDgYZL+R6nkvSNnRmA0TVaP7kwOUHqnF/AuISOkLmNLbofTMAIMqXNBiBZq1DgImUXs7PJ2G/BPIjF39haOCF2z3ah+qB8jQzQUF6FChgKKMIo77nsdHwxQhQyGyMOE6Vbs5H0qcKFbF8jrBcqPMSsEHSLDtD0adISBCOyaNRwlObyfmCajqNJRPM9h8/yNd2msILdK2d1qeS9M7jkuJomqzHmT65z9LGDxuBUYmxW0P06uuW9G2FACANikc2iQs1dClaTC9gZBoNPJvAcc4GEFLegeDWo2F6FjsZUORRRgKMAUUUUUZ1GBREoGTsH7mgqXWaWJBIXiG6jyLpid4y808JLDIO7A6e99ko3CdJT2tD1X+6SmnAwmyWm4/sckbNLRKINh8q+G2ylEJTL5DXqvhvvLDtjwLMf/gHicRingGho3/gX2kD3wYAyCkQgJVYAph8OqI3N0uRrntTwRUcBV/EM1buNQUZaizsf7iFDiFDiFFFFGeJQhoRI75mA0SUZO94qOP2tEdhD5PNPSUX+O08F4Sx1dg/49cymCGnIP+GzXetLUlOM19sYACajkmpQg4OfPUN1o+MzCNRtdcNO3TctthH/AMNb/YLlrdILtWnjLEL90/BBpRR30TN/J9v9U8qJkzwZu+1B3eQQVmwFFDgGijEFqyztQOTPakwdcpX6pPqMQfNIijZLYkZmh8v74RgIwjImY706A7ZR+TtLuU+Ok+6mzqSdacUnOgmXSINSOm7I6XshFERGESEpwcdRRthGf6nRhqLgYXI5lon/AGiijKOWz5Q0TPbu/OHKhWAV2NatHBCl87u69VtDCAONgZ5D3rnk6UlVVVZVZXgjhWEuQVBw7mnZ/vCBRRRRgDLGSk+Co9R9B8c/ilom6q+T/lQLHP6NFKoK6KgM6Ir9CCkWOOpH4iuokGXzgUEtQuymnSx9U8M0mm5O/olJCbN3nbz/APQ1qDYogNxM+AApiFB9D+L0zIEQhEzE3pp4ACrLxBoH/oSbUSXqMiEiU564MiEI1eLZu5kvgfDr+AOJ5kYx6AbgjGsN57WveNnDL+IbCmT330BdK6a38aA2AgDY5EUZlL2O9QK9+X/lFGAcQwWGzASvYpANdaGOmb3ihzVgXxl/dqKzl4fc1lLOweuQ960QpfttvYrqO4L5pUUUZ1GBS2UN3Y/3xWl2Xenj1qP3yW6yvmM9RpNl3IM7NupZ4CsuweVpbdtHXMZyp4WvmqHW7Dd6pNsEYTLNIyfYffShNlDCTCPZ9YepedZfhsZBuvQJfY1qP8Q6u67qyru0hkAJVYAp0uUBktXvp0jdp4yg431XIN6gNnms1owFFGJlAKmPnY6tRU5svgch4nvUkFF4z3lekRAJUwB1paArSQ328e9Joy5fX6+Zo4QM6MbgzzHVf4fbTg4RxPB/qjUMlajULZhLY/N0ZnzwZ/RB52k3a7N8ljhH2J6EGRHcatRCG2SxNhfvJpgcYIEyy+bN1pHqzkvNnnuFryIRcG3uv2MFvd8lfJfOQ6UeKcDIlZVmXW+40UUUUYEPjCHYFAJ5wCfwHY96Harhv1LmvfCII2sXewffSlJedCe/+qMAUMQozxPEMz9dzoZ+xrTMSJVzXVxeKMIqfiKoSjLTUbAz6++jti1tQEgcxNSgSTuclqvTM3Ozg4lTUsa1W7G+R2TWg7gekQkTxRoml1R91J4w1M259yPM+vn8C1B5uifwNh3obZQEALAVJHlawaHVyO9IbviTIHoEHICoAq2A1opYOc26UUUUNGC73uY/N3y71AACPen9C2BwtYXNbBmvaropZDBdUydD3oYgvgCijLDNWaopcldXYDVatWtRJoH+u+LwvBGAcGtQLJGmUWIbAyg2dTR8Y6FKRI/dD+zWpzCGZbB0SE78Bg0hSNXRv5H2TbC4QNou7n5M9l/BvqYqOC7swSXHL5v5GBl0Ni6avm7tu4YqMIqACvo/dFGJUIeiymwURq3c/sOmXegAAAQBkGFgblmt1PTtnSteUMh2GhRQoYhgKKKKMgk6L/XpR6BJnf4frCeSVuxMqyA3pO5wAfLyWV1a5ZZkjWZb5A9OfZk4P4kjRNQ1RZKhmTOZYMuo5jqYgcuKRfPfObtNDiYTjJL8aS9xSutJFET70tgY1kIR8VNamL13tWeo/mjFwMo2C6p+1u6UV8oCAFgK68g2wWDqsHmujuNC5DoEB25Fl3H+KAABAaVNTRgshbpbeGh8ulTAkFeHofB74KBVALq6UqCm4dNz+Om9CkAlEq7rrgMQxCiiik8DsBddhq0MuO026nfq9uWWkw8o2ANVrcCORNHXq+DVamhsJMXmcx+RpmWyqaynRLrfTM9taG8DIEwJsCESRNmmTAptk371J26uEq9ZOa5pa7KcA2pDGr3Ps+dGD699QcOZE396X5gYEvywm9Dd5PhTxgqASuRUVr3XXCamlUaJRGkNuq0K1kXfb41frTAhVK8ANVpIK2yv8OjXXai+AoxDgBRWYVJVfutD5pppALDsGnLLoAq2A1ow5kHmQzeoz2Lb04hMg3IJ285eaKE5gGKZtTmZn25j/WOb14y8Hyie4ouSXHhl2Q0Na3vHyFCPKNkhI+1FVPTCSz3GHxUOxR1If9wfWTi+rKRcWLVMB7tDeSxNi7yy0IQSjIDNp8GWB6I+wPdaeOfPQ6sDThfG0VLHY3Wh5aLIOAM11Tqurg5ny8A3aeZsGyGX6dGt8qGAooo4AUIRpRAG60jk9Evq/b7U7ZUolXdcJ5DglqUE57B9PO3Dd3ODWBjyvZg4GEYhChkR3mrDYhtaWjsL+5pj4ByrrB/AHDNRFy+W67r2nAsQywLEPuSe/wCBeW+gKv8AQbE2H3D4wXL6hYd7wKMaZcRTACUwFDo5d3dacZKIiyTf6roa1HFHk1TVd8HREXgBmrV35GhDX02POeWIUUYDgEjadkud2n3UJhWbEd93q83RMmlN5f21T52sRsUaJkmnC5Au6GXM6MuoU0lQEKGETRHEpoHiHQbbzX7LQiSIjqYXt5qF1QfaTy8ViBNy0bvuJgOHWgLxYfd7Knap9U46c6OeVa0l/g+V7MLwUQ83wCjxFThbHd4LcBA0Gq2Au0N0FwRq1+jQwUBVALq1u7IZH6uW7fahooxAooUFBREA9TsGtXkraRsdXTx70ufXnxygM7SC3NdzqFDqUQkRyR4YshzYDIjMZAzIcxlq6QMl7UOkRIwdyx6E96f4jGTvEWuXHWHap3p3WM6li+gcA85IegiaNuA3UR+p4XxVAaIJ9UsU9hQP7ozSatUQns0H9/dZAfJD5wPxpzCWwlWDd0qZo8eyvdaBEAEq6FOk26MnA9hTxFQBP2FNRRMVAAJV2KiSQL8wP3u9qMNfIkcuh+/belgLErB1qU3aP9ajYh1iPkVBfPI9imhN7feJQs72j7aLmvanRr8o6ZXelESAwiCdqfPsrOLAkr6BwVpL1rh/0HTtwzQyAWYLvmtafQZc6p+9uy0nRijNFkfNbpqWwI9qHhcSBgtG3/M+eEYqLmeaf908UUAOLPLf9o81HrNfRvHPBLUAHn/EPNN6eRlJ4tAgBkW45OyWXsU4NSE6MFiz7ch17YFRZ1G/RX10Ot9KmfSZDO7F6lyv8wvvFQmxE967UQtP/cSqDNaAD44Ms6mnQC56jP09xUPBzrFsdvtutFT6Bwgpdtxv0cnotW/Jsso2XsycRhogsZCYHsnwoHRR3NKh1X+GZxPnDNeR7g+H34Gpq1tHP6ZnthnAF9x9Pv689O4GJkZULYAfGBKDJk7ihNTxTv0IfvGSkZtt+g+UoAoewD94OyjGwsC1C1JXogF0CxeiILoR8cRVvewz8wLS8HYtfcM+y3fOnK0RgekSzygtgWHY9+QKYSy1tj9vFRDS2rwLsCdxXiigg589R+rTnbFwa2FPz8EEhZ0UKuplhr6wx1p9OVnybwE/26ipvNyOqX4MU8BXUTVijRmgl83uOb42xjgVDGYB7tNhnQX7lvmpkY0WP2tTH9y5BUtZ9V+2lsZwPQgWD71pk/fomoCWyjY9M8RMdSf+Ug09NQTHjKnhKLQZk2CfuhbQbdER+SpFkj/mtLxgDUvzoh+68zfcs/XCzMOd4uVlDu8D+6LeQDcCP3QIIVO6R+vwE+pK0UVeWPgMGkJD2vvB4DEJyzqN9AqKuRxbCT8r8DQAQEG3BmNcODy0oO9ftM/A0+gbRN8j4CnrFeS/nGaWmskll60jspLTyY5twEyan7ZHinhKL9MwHg3ehesxsvyCT1pJEGF12q/gVdJ9g0Z1ZmA06cIZ07aZXyVTUTEAp0t+uR6tYLsTW+EzulfujOmRZZzu3j6gCgqY7KcvvHV65HxRN/dF13Wa479IGeyXady5gC9TIeZralNk7GR4qZxnhcdu/Af9pp5TzHWAIJzaHywuMUCCaBzDNYJtLM1ADsl+AyPAU1FPMQA2MPy4P6xMP74mcZjDYf8AVhaKALCHqTgfQHKMIzSKhbL2sFGywe3ppHMxL5p4hPVH4o+Vs5P+PXrpvQ8MDwBoGB0mhAOq0AEt1g6vn3bdGrl+5od9umVPIjCMTYB/f3g8p5l749yHTLg1O9a6BnWHD7RwTHYK6svg4ACNrxKy2ieDBFJERd/+n1R6/wD9YoGDn5vKBAbBTxDtLJycQ6GrvEUSEBABAGEau07zP2PiagSTNr1o1er8V/5FmDjOJiZ0quavzT6dVYCd0P6ocqEPN+BoiCED3HyPBcuBTrlYOjy9gfrig0vyhw/8C1vVD0xg8ZuZe9Vatdsj3VZqcCpxslqvdv1UUM4zmxt+nI12q/dEAbrUOcl3kJNbAzWoxl0WUmNjbC/FTJNPp/lvqpmz9zLg4gSZh7h/5Rj1RP8AU3oypApBnhn6o4Cof+Bl/uF3V/0fmRJ12r3pRF/BWZwlNMTEjVgCue+14d6aHudN6jbCYea+KePTdWH2O7r7VFd5+4ON0Wf6qMnb1HxGiguZLwkN8AgmBC6DM95pQQoJosNGCk5nzE/dMVAKuwUhEq3eT9uExA/sbYJ9a+qmzJVTm13+fiszxNJgehYiwnuSa0s4dq6EI4Soob5VzV/Q0w2A+Bj9UYRIm9qmDMU9QZhzlVlo+NBTwpBDmTvuVkbH2AkagplbOmhMedQSEkl1I+SUQBtaopxKl2Pul/mDN5L+PQH8PGH/AIK7Vq1NpM2fKswenFFKA7vnBoQNIcDiDmIui27tG2BAGQYWZkifZ+6Mds7XZv6hjf8AKT905tPFAf8ApN+sHB1T2l+qs4Qfe5+nvTxIxbE3yYTf9hj+sNec8ZhHGep66z2M0aqQB5KshNr7sr4r64TBR3IxE9GX44HBHCwGq1BM/wBBtpjMwlA+M/heBxyxn3P+eokKXRWaPlyFx7wfY/RhqRP+TRjaEmkQ+Png4xgmg/JOGPN1gGvqo4n09wbiVeCVF6xmgRZJDQjQjNpD9YTiYOT2e+PxGjhFQ5ST8/p74TgRMko6NZ5rfhrTCEySeYovUehUGFJ2moqKjB26TY1f1nv5BwW6B0APtrSl1MDtP+ioRgh/w2Hzxo0RBu4f6sL/AMnZ7vThy305mUM5PRp+sDBliAIdLeIxKcA0ZoZJNb4OOvJw5mpE7Gr7UXEAHSpqanBAHxh/pHtWmMkiPGbmEc9KQ4dV1dgzXQGlYkx1twsbGgFSqt/8SMfFTa+gn4H4aZiaBSO6PhV7FRNV2hvUHRfDW/7LHjkOTKI7SP7KavMXdcxHYh8UAAGRYxcTOpYEU/N+xgQbMA9CfmJwJp03oj5wIMZq6kv6cRRU+1CHxh0CSnPgh99EzfL9cJUSFp4mXvl54GLAbto04RUI6NRi8trITQd3vDtYXYg34TBickTIi5M8RIFpCws4Lvep99kAPZEfNBxZIh6QKroUq6GdhGx7AYWwFs3wb2Zwzg4qAy8HVsVlLO8B+qVaGNsBNZgZvJ+3E+m14Wn1BMMo9WXwcPgACByAsNpcow64FRUUcUm7jWT9B4xcRoREfJ5nvPBNW1cNP+4PNek0giuYD7nk6HHFRwdsFLJ+0PFTQMgHYxePIk/8v4wQswXfD+aQFjItwGL6p9T7fhNo+GCz0++f7OMVIVssvOM7c1PhowmQu/PI+/jFxKKip/OPJ88BU4JqmR/lpSioRISnCKjgioqKSzcmR0Cm4ABZWjo+E6t8DNHa+98n61ikqyfBIO5kadUQM0ZfNvlQwvOsw/rrWRALOemR8LRkOnCil2ilGwuhMVF2aWdKhyCrcwOCeEp72MPWgoFW2ChOZS+XCOB9S+pdWFPqCfJTJz2kA/uiRgnuEP3R9wD9W/Tj0rd+Ie+E2c1nETXCXsT+8JwnAorURUncufVZk71GJViUCDMP9KleheTyaUYRhGAVGXWxTdBdsX3vLB3pZZce9Gg6EGBDRyrg6OvRfeKQoC5bxEPvWcHBuQgmzRIP1Z/o8RST72Ze8v4JoggaWHR1Ho8DK4s1m3zBrMNysrpZnR5CiEkuU8mxfOd/8pecAno42aXw4phNPoyteAxj1BRWcm930h4orJEcZaf3Dxio25XHfGGF0n/aSkQaknsYuJRUHTSn2o29qiowRTWILq6UOo23GlmV9VQZekEPuU5fvE1kY86BqFhA+AodIbxw8LPxWvG7fgA9mijPW9pbeAUZQUqQB1ak8tpgH2HiXpRGFusiNvjCDpUBYANjjKCtdWno7nRpXRbPnUs+/srJQooenR6cENHzmh2PeLOprUN5hQn+dcnhMV6Co1QD5aj8j0awhfLLRlBKnQM6me8OnA8A4in8oVaais9Y917KKubSDtewz8PIRxYyUeQhOEJ2E6UQgjI0AvOQfT+sXh7Kju2PuiIGCKioqCQgjmU6dVwuPZNqhG5hH3B+KgWslQeTPxT6Wf4sKFKdV/k1HAdHPYqRKdk/gqXEDIEe6vxQr1mvngezTJWMyAdjHwxeKMJqan5DbuOz2+2yVabNcXrZPVfZeBORDnXrbOGlt+Exu0P+Oe6cFukrl8hfElABBlUVHBP5aeSEBqDc8knmuoi5Ak+6jzCegij1jukonzn54iioElm/dgVGz21fqpanS9Wf+0gEFEiZJg1FRiU/dTpGh+6SoqKioqKNkCEbiU4mR5ez/tBQprhlUtThPFHIzzypgpxKgffSbmk5Vca8IH9pTq3l6+UHVYPNTl5bQXQ6BAdDFwMUtClc/wBzgL7sbNq3tD8KMHkRz89NuW7eX3gJB8kCwP8Ah7qOIaYEhGShF8mzis1ZrsoARp3vi9PqpEERG4mvCVlqXl1en3TaKpV1aikqGoavV6hoSIEIkjU4WfmPbuYOM8UciMIwkumo7+hnXWaPSXKQCyOmekvThMSDY7Hd8AWjtnBoEB7FBFfDQJay+YOpseCDxyWj1ZyDgjmxDVC2FfFA7LCEVwHVe7J6LT1UcwQwj2eMasK0np1qcEBFE1q0gGm/aoY3ezxtRBuiCPxf4oCY+4fqibxsv2xQiVNb/ifNMWVKkrWeLnzUVFRhFRUYDFJpTd/jDSAg0Hyb4RUehMTLlYHtvWshYWkpVleMpMibKaTZ8h4NFWQbYclGPYOw/hTgeU8tq8yKOiZnWo6k4DzPhHlhkUmUFjy/D/hyYh7M25Q1NJERRMkooOGh0eCKiizahPUpKio4Y6UFbdYnM7OlTWu8gdtGmg3mENRTzQlAFXIM2oYPdWw7Z0JiC6q9nyzTK0s1c2nHgNqeIqbwexbcugSvaosCnuGr1WXzQ5DKGADNpnzJhdLHuvgPo45D6E9A4EVuZFi+yXyNsI2gkd07aPRazSSQEwj2TiMEQjCa0V3LmfujFgS6DqUaUR1KOAUZGGiN7bKjrUVFRUVFRUY7Omhc7OZUwt/oc/up1WerD2z+KmA2hDgYRw9PLN9KjpKah8M6vAi6MPdv9VFT62ZHdXfFSqcZGw8UgFWxVhsyOvXkpEhIjKdrukOg74ZaAxNzz+fs7U+meIp4orXlHG8lwOijuMJUKsMdUFvFfvO2FntARbL7Is9Q34jEi8JWoTU2oxmyj91DwdbJxMCRkzolyXfeoqKioqKioqKiooKLVFjdi+1MKhO5RD4OV+qWsQ6h/dR0/nzUq54/7oTYugP9p+f5DSKjWTvI+aUAHsAFSnlkDz/lSx4RPO+DV0nW7/8AKanjmEOPp/JodUrL+OUBAVkXlIAlauqA3/URd6rwmMVHLn07wHG8h4Fs29PJt3q/aTWjKCEJEcko3rTdR266jvU0clhAuT9OyPJFrf7rV5qbcNsU7mVWJ9zL3q65cqMIpLbqMZU4kVHGBFHAE6FQs9GW/tU8t9o9qdtngPHBfr1u/wDzB4igVAKtgCVelWgAbj9RMvVdsCzSAss3mzdA3weA4X1jU1NTU8JxPDHGUVGyJLXHPv0f4wG0wrlDVesW2Q60iIEBCjMTfjnA28P3UyLDPZxMXejStGX+Mq12bNmoqKkpGGoLGepROZUVFRUFRwhFBRKs8TaZfYoVF97H+1Og7Qj5zpEUq5rnTigKoDNaWcxq68qFmxDWL+v+MA6C3sL/APo7A03lp9Vn40OmDyX0Z6OeF5z2xBaH60TaoDdZynmdtR2cM8kkXQAbOXVDvTbkFOSIMkqMj3dHCeL2YJtXyBkNfQZmtc9xSkzfCjZh73rPlXWomWdl6ls+1T2asztXy8Ar6Yy+qyHv390f3Yj6msjH0k/NTMHtYexRbhKlpB8tbScsU8dvtxbmR7B5dKDMnIAyKGA6hABmrSmQZ+RRvo2I3eBwOJ9GemnntNG47LgugnUe4pRU4oyMSJSpSDyBIRNShT5auot9tTqNPInCEk3dSpwibmBxRwCmSnZoDIeyr/2dK5p50q5q92oNjlz8PxlP5Di8afNkAapoC60PJpWGC66aBoUUJAkSeoF3c+i2tThPAcT6M4Dgn1zgeda2yOd0b2ejahsTuz6I6I3HRq98kC36Rqeck5dvB+6s/daUM0YvJnGampqampqcBNbYzqf7GZtPKMZ8OVZBS6MWcDnLs1dW+wVJ9Oa5kJdNDV6DSXRPyoyq6q8B+EeGeXHoEEhJHSroBSFyMzaZOp1L1nn4Pbton/G1XZgAjbtk1NHpC8mcGL+5lVt87KhEkZN+OanmZBTsXasRjvrSllVeJ4T3eJksgNWoI+FLja2+/gWzqAmYWEH4Ga6d0KX1oiDYDQCwU8bicMegOCeF4TlRg86MFKMIQouI6JV46osFqdOprmaxUil0LSto/CWaf3NQwLbYa6OpDUVHFNTjNLyvZRLG9bKygjtZRc4I5RU94atQX7FSh2FnMiinIKlWQFD9DJLsz3d3gWzpesZjl7B9uQXaMu3S6XpddW+DxuJxxzT1kVHPMliJFcR0a2GOEvY3+RsUPJcmytE0G9ZBDe0f+Q6bCU8g4Jq/dsa+6JTM47NLze4VknmtQ+T0g6nvSmqe9Jf6Unn7tB3dhaDmfitNO7NZqg2spZZc+A4XhUi0B01VyA1W1GLTIbBzmyN3N+KKhu7k0Ib9cjNofACpO3bu7q+Anh1wmp9Qcp5Ry45w9aR4MkTJrVX7jo3Q6MnTbBUTCgHRKEL5NI9evXzNZzqRJGTpjPFNTU1PBOMG2Fqmp43F43w0EZi6uuwX7F6susiEnV0NhY+aasfRH2n0NVl1bVmbKx7F0N3N15pxTjPBHIPSHFNTU1PoGtfm1PKLN/dn6ffvRlBCiRNxwTneVkjqHuFnU1pD32UPc0TqWp501PHPInjiq2Mm/wCrt3QM6ORcRwder1buF4rw2SyQydM3Tcz+hqwNA0GhjOE859Acs5EUVOE1PpyjalXflp06rbRVtm85nsZro4WQGcw99Ltk6lQluDZPR06LbxRckub1GE1PPnE4XjkP0C+TkHbPYpnLYvrra9V9owQigAlXSs0CRZ3w6vYaTSEsOks1XNqfRTxnDFRwHJeSYPqXgFoECXHbW+zRqRCyMw/J3X74NJGlFv7p69SHvU4IR7KaXow9KSnGfQHC8KUmh3xCml88ufbsdrupQfAiGHXq9c8Fd9TOfZXVIBfZtHoadFt5wPRPpjhcX8HGP6ZKEtQDZHu5ejfrQc1yqG2S674C7CEA2Rs1dzryFHbPxt0pPdMfDHLsw0XwjgnmnHlcyd5oyOrRYs2E/T6SalxBbT1lu+XA8DKEAbrUdqlZ58l2g6tWifqZGwZDoQYnMOOOM5xyH8LGOV4OIxs6J0ZKiVyi/fMd5HQrIn+Pwa4GUFCEidSpxriIG9czxFG91xoDqk+y02GIVLw34TlRUUcDBnal9JRtby3fA1qai6XRzPEUGMaWXVc16uJeSCIi9vsu9KvJq6f2n3t0Kn0BzTGamp5R+AaPQFSArNa+J5FWOjpfP+jxQ3WtnejMHuY9JVuPacqSYeR94vslQZTIJPFlBQlrflD5oFgRTSeTGEVFNiWx1ouk2/QCkEPp18nuCmW3UXalL9UiGn/oBPGIwGlEAdWp+5RGm9j5Vpiadc2X2MdKiCAA2PXmD+eccy0bH5KRGNptDtQ+TzSGkF3Ohn3RQoykROycBDOuaXuiaVVl0ntIpK6S+UDRtsac+KOhjux9FZH3i+0q5gEy7EOstFjx/wDoaGHoiT6VYJH87/oqIQGYKeAPzSAvP/YToUKZCB4Mc6PBhrP3mhji5Fo7iS+U7UylyQvjG3vLU29Ic0/+AeIYRs3g98j5Khv/AGwFnxQyIzWJ5u+KjC3L5yhoRJLm5g8Zg4rh/X7lo4ENSfdHyojZuZ+I+WlDaBsjaIL5WtV1brvU1NTgeiPQRwRUVFRxPPOW+meRNAyB7lGlJsHtMVAlpp86A/NQoCZoZ+UpQBnVF+EUSSPQNF/un0tGX7z9ZSJm1JDwC+4ou99PsUCZjSL+Joy+7/AgVKwHde7aZ1QfEolOENmsvdvUrxHPOE5M8B6s4Z4TijCPSOJxnBPBPFNThFR+DOc8mOfNT+EOCanlHG4nKOZFRwnNaebH5J5hxzhFR+Fn0jzpqcJ/FnC8B6h5BwT6d4o9HFRUVFRwxUVFRUVFRUVHNioqKio44qKioqOCKj1R6h4zgec0VhiswlvRq+x/ykdfx/yj/jf8o/4P/KYLJ0B/lBZgBg+S/FM2KAQj1NKcFJpEAyA3e5R/yP8Alf136o1P5ulfw36r+O/VP8t9UK/xe1B6ChSCIw63KPEQGYhN3vV+re7tJGphoZvThFFWAGCDd7lH/L/5RkzwCBLbWxjYJWsmgUTdSCfE07Cc5I+ArNVsYKPwTKSfcSnDIumD3ZR5it+lngsErBWUzoBOzCfE0Wp/MSPYCjz2yE95aVQJp8MT7ra54o7HJ8NJTS0DYiawKQX7tf236pp4fQUKQRGHW5U4aS5UV2bAuhlcHSnR/u6VA7gUH+uQa0ZcifwTyl9FC8KEcID4oz7MlSCCIAWcezpk5mocgUZlOkLsDIIiCNoalo8UFk0+rZttjNLgecHU0TKmADdafbAFx7DIN3jdingGm3bZNsJULjnWl88M5EhbXLofeRNFpxLPXq27mXrg4g7eBW8NTFAGWPm+3h0pBjoEKLImjTVwUDm0ZnehB4BpUgMYIz5g/A1zbRNaTuMh+3QNWk+d7n/u/jI1WeN/BT6l4IyRghTWCasiXCf6KS/q+KCm5B+zFCUHII+6tOpJgfh1bvQbIwnah2iFslUSdHPzi6Qc3lhCMT4pA/h9qS/v+K/p/wBVs/z9KZ/l0DAYkbLIYnzRxO97YMiZlJXPqvI3ubl+JUQ0o6wBS0bPgKFODu/ACowSwN7xeDuz0ps385eiyWWs34P3WQZopnpNvBayXgMdVk8T5GDtTuodXYCVdij9RXkbnoGQaHnAQ8SeDqtPyLmH4CfBVoFvH2QHzS2NiSLYkp6TOMIOAeVnHY9zsU4AHNozKMUA0y2MHZtD+J9M4tamljagGrQNZZLYO+xp3ywmpqampqfVH4J4G7f4rqfsvqnADqnD3DoklNPI+0kn3gZsDMbslDhU4b+ZU5U0YzV3B6TmMjk8usf8rTjhXGXSfhEqOA9QMiiLLzMWf3hALNcrNLGsKvE6VMk6YFJJe9CCAFiQQSt8gMAZ6pm0sPye5gFddOgaBquQbtO0JG2NH5LpkVLU1cQ3NqdTZME2RZvInJjTKgIAUQjk0Mq+DQvgdn2MJDm0Z0KYzdwLzml8T6ZgAAAGQUqZrUCzVpGk/Wyj+Q075TPoDiio5ZyXnRwxUVHA8FYn+a6vgFRUU8MgQynN7BK9qclRi6gR+sHGGVjRhhiFDqWqRISnmlP6/mlf4/mv5n906X8vWkaPcCCf5FTT/t1wg9QNBIYnrFaDqHug0RwerNvPM6sk7OZTfy5ov2ajqPBOYGXih7gjLmMdxg+WDel93bdHdzPatCEFfIHxRQT0o9j9KtqtS7gblNNC5AerI/vCLcJapEHaU+FPAE6p1KgObvFU8svNNZejcxB9HuwQObRmVIADtEhXel/hmSICACANqFdanADNWnMoMlodfRo8ukUcqKio4oqPUvqHg0geSwpiRJqIAtbupqeJVEdJmvdVIScBsbGg7YCoQ6Q0Orkd6IeOqA28CDxSwKcDH+xvUxntU0+9R2eQuOwbPkttRXtpyJk4QTFrLR3l13eNaFiACFRomjjQm1FP8zAriO9FroCEdT/xdTKhXfIwNxMSrNSRH4Lcpt03MzMiGZ0eY1Hsv1XgbjACjKHcSfqmnEom/hfs/wC5wh7LS4phzanAoXtocgcxNSiySOZrLfK1O1FHJPRvoHkRUVHKeB5PbyOrH4wuuxUxZtW2UNiNNGbeImr66isqPJmQSTa1EdBcecHqGSZhbCZldlRwHgMjtQWvJZZNfu2b70IBQjcTXAkXmsOoOtw72d6M6ukoNDtS4T7kzJF3zPJUOXzZP4aJrrOI/aPhRQATBd8ueTBHTyJEIR8UzKqhOqJfcUgkvuh4H4s6NIpPQAo8BdsK6Bm0HsQLZYPCx4w+kDi2AFOb3wyzrOXIyUyrX7XjLAHkQarRNEbjQMoW5Eqw66Jo+KOA5bieqfSPA8ERLDN2UiShw5xg6aEHPQ/epiL/APTRPzWapFW8t6XgFOP4b6mnkTUBZ2MF3PB8n28bYmCDTxUA5GMCu7oGa7FJ5JvEhvlD53iigwlISc6WJ7jlHWkmmAXY7VrWtQP+u0UIMcC5qAOzHkwNis/VfvrR9BgbE0/8VzNiopsStqYWZGh5NZHMnNjTOmAVQN2plQH0bM+WXzgIc3BefskFbYDJdcssyXfXhLJKB2MPpo+I2uaYXHGiyx/KyT9hSrVt0dx1EuOo8Ry49W+kcXhL/lbq+KfXJ9K8flKAkg96ajcG4DUqtulsjNmWhDviuJOo+EYEiIolxGEqxq9skPo/1vFRV1IaHamtSMpmy12I8msv1at4aRA7x9gR4Stquy/mFoIa4WfaD7pt5SntyTLsrbBvoHoAJV8UkOiEOYA+EVDMZdHRHcSR70dIIQ5G66bOpgZcIQDZGzV/4kZ3tIeIqW7mB7w1niHKTcGx6hiQaTHPLy2vYZ2qILWKNMObRmVelQVLCvFhGb330QaiUK6yGZaJRQwWTEtqK669VtaCgIKIkImYm+EVGBxTxxy3gj1c1NTiYxRw2ofb7FfBfXPJWF0qiU2w+YqPhFRUUETubh/ZalCLcBeD4ja5piAMjtUbtS6UyuYKsqSdqysjEPxlwlSyRQ96uxuMstI+HN1jLFLgEq+2NT60phjIYje29mHhFm8il5amEZIZB1terwOdNbUuqN1VzaijNcObRngYKmpg3gd9gWzXc7FA6+zKCRHbCbclhydh/Nd6OCOKPUHG8k5DyYrICgFBCQiYDkkbKGRIcqAABkW4opsZE3ckUgJocc44AFAiHSUBHGAGUAsAZBQkF07lEkImhTXaPKhOQhJJFmoqMUBsiAJmI2TLPbDNAZSBIIkhazUYEwvVfFnQ4D6GvkVmEb/bzTEbzI9oU7Ov/WN+q2du7wGR4CpqanDSG51oTJYgXS6HiKGCPzln2RSkblVPaKekHdDy0+KgoOSw7DI8FN8bE+kGRIw9TFtGOwAgEpKwZXcSpuwW9W6CFDpTRYwBQphNml80liJdDQ6YPqnnRyT1s0c6cHE5k1OJwuJg4TU/jYxio9LPIeOeRNTg+iOJwj8U4nqIqPQRUcDicqORHGfj9uGMI9dGJ66Kjhio/JH4iP8A4WfRn/xGv4R9If8A1jwHNMHgmpqfx8+ingcJqfwZz38o+kOCMT8eeoin1k+jeN5s+oPwZU+hnkzyJ5ryzln/AMU4noTjcDjOKOS4n/y0ck5TwnoY/wDjTlvIOZH/ANbHIOQ4H5qOF4D85H/wD+JjB4XkH/wscMemMI581PHHDFR+Ej8Q8EehOB9PFR+BKfwRwmMcEVHoz0s/jHhfz7z3jPSTU+lnimp9BNTyCiv//gADAP/Z";
    const fmtP = n => n>0 ? '$ '+Math.round(n).toLocaleString('es-AR') : '-';

    // Agrupar por categoria
    const activos = productos_filtrados.filter(p=>p.activo);
    const grupos = {};
    activos.forEach(p=>{
      const cat = p.categoria||'Sin categoría';
      if(!grupos[cat]) grupos[cat]=[];
      grupos[cat].push(p);
    });
    const cats = Object.keys(grupos).sort();

    let pag = 1;
    const totalPags = () => doc.internal.getNumberOfPages();

    function dibujarEncabezado(){
      // Fondo azul header
      doc.setFillColor(...azul);
      doc.rect(0,0,W,38,'F');
      // Logo
      try{ doc.addImage(LOGO_B64,'JPEG',8,4,28,28); }catch(e){}
      // Nombre empresa
      doc.setTextColor(...blanco);
      doc.setFont('helvetica','bold');
      doc.setFontSize(22);
      doc.text('PENSOK',44,16);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text('Piletas · Jardín · Limpieza · Fumigación',44,22);
      // Contacto
      doc.setFontSize(8.5);
      doc.text('📞 11-7064-5115',44,29);
      doc.text('@pensok.piletas',90,29);
      // Tipo lista badge
      const label = tipo==='minorista'?'LISTA MINORISTA':'LISTA MAYORISTA';
      doc.setFillColor(...azulClaro);
      doc.roundedRect(W-52,8,46,16,3,3,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...blanco);
      doc.text(label,W-29,18,{align:'center'});
      // Fecha
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(200,220,255);
      const hoy=new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
      doc.text('Actualizado: '+hoy,W-29,27,{align:'center'});
      // Linea separadora
      doc.setDrawColor(...azulClaro);
      doc.setLineWidth(0.3);
      doc.line(0,38,W,38);
    }

    function dibujarPie(pNum, total){
      doc.setFillColor(...azul);
      doc.rect(0,H-12,W,12,'F');
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...blanco);
      doc.text('PENSOK — Lista de precios '+tipo+' — Válida al '+new Date().toLocaleDateString('es-AR'),14,H-5);
      doc.text('Página '+pNum+' / '+total,W-14,H-5,{align:'right'});
    }

    // Primera página
    dibujarEncabezado();
    let y = 44;
    const COL_PROD=14, COL_CAT=120, COL_PRECIO=170;
    const ROW_H=7, CAT_H=9;

    // Header columnas
    function dibujarHeaderColumnas(){
      doc.setFillColor(...azulClaro);
      doc.rect(10,y,W-20,7,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.setTextColor(...blanco);
      doc.text('PRODUCTO',COL_PROD+2,y+5);
      doc.text('MARCA',COL_CAT-30,y+5);
      doc.text('PRECIO',COL_PRECIO,y+5);
      y+=8;
    }
    dibujarHeaderColumnas();

    let filaPar = false;
    for(const cat of cats){
      const prods = grupos[cat];
      // Espacio para titulo de categoria + al menos 2 filas
      if(y > H-30){
        dibujarPie(doc.internal.getNumberOfPages(), '??');
        doc.addPage();
        dibujarEncabezado();
        y=44;
        dibujarHeaderColumnas();
        filaPar=false;
      }
      // Titulo categoria
      doc.setFillColor(220,230,245);
      doc.rect(10,y,W-20,CAT_H,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...azul);
      doc.text(cat.toUpperCase(),COL_PROD+2,y+6.5);
      y+=CAT_H+1;
      filaPar=false;

      for(const p of prods){
        if(y>H-20){
          dibujarPie(doc.internal.getNumberOfPages(),'??');
          doc.addPage();
          dibujarEncabezado();
          y=44;
          dibujarHeaderColumnas();
          filaPar=false;
        }
        // Fila alternada
        if(filaPar){ doc.setFillColor(...grisClar); doc.rect(10,y,W-20,ROW_H,'F'); }
        filaPar=!filaPar;
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.setTextColor(...negro);
        // Nombre (truncar si es largo)
        const nombre = p.nombre?.length>55 ? p.nombre.substring(0,52)+'...' : (p.nombre||'');
        doc.text(nombre,COL_PROD+2,y+5);
        // Marca
        doc.setTextColor(...gris);
        doc.setFontSize(7.5);
        doc.text(p.marca||'',COL_CAT-30,y+5);
        // Precio
        const precio = tipo==='minorista' ? p.precio_min : p.precio_may;
        doc.setFont('helvetica','bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...azul);
        doc.text(fmtP(precio),COL_PRECIO,y+5);
        // Linea separadora suave
        doc.setDrawColor(220,220,220);
        doc.setLineWidth(0.1);
        doc.line(10,y+ROW_H,W-10,y+ROW_H);
        y+=ROW_H;
      }
      y+=3; // espacio entre categorias
    }

    // Actualizar numeros de pagina en pies
    const totalP = doc.internal.getNumberOfPages();
    for(let i=1;i<=totalP;i++){
      doc.setPage(i);
      dibujarPie(i,totalP);
    }

    const fname = 'pensok-lista-'+tipo+'-'+new Date().toISOString().split('T')[0]+'.pdf';
    doc.save(fname);
    setGenerando(false);
    setModalLista(false);
  }

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

  // Validacion codigo duplicado en tiempo real
  const codigoExiste = !editando && fCodigo.trim().length > 0 &&
    productos.some(p=>p.codigo?.toLowerCase()===fCodigo.trim().toLowerCase());

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
        {esAdmin&&<MetricCard label="Activos"     value={fmtNum(productos.filter(p=>p.activo).length)}/>}
        {esAdmin&&<MetricCard label="Valor stock" value={fmt(valorStock)} color={G.azul} sub="a costo"/>}
        {esAdmin&&<MetricCard label="Bajo stock"  value={fmtNum(alertas.filter(p=>estadoStock(p)==="bajo").length)}    color={G.amarillo}/>}
        {esAdmin&&<MetricCard label="Agotados"    value={fmtNum(alertas.filter(p=>estadoStock(p)==="agotado").length)} color={G.rojo}/>}
      </div>
      {alertas.length>0&&<PanelReposicion alertas={alertas}/>}
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:"2 1 200px"}}>
            <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Buscar</div>
            <input value={busqueda} onChange={e=>setB(e.target.value)} placeholder="Nombre, código, marca, proveedor..." style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
          </div>
          <div style={{flex:"1 1 120px"}}>
            <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Grupo</div>
            <Fi value={filtroC}     onChange={setFC}     options={["Todas",...CATEGORIAS]}/>
          </div>
          <div style={{flex:"1 1 140px"}}>
            <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Proveedor</div>
            <Fi value={filtroProv}  onChange={setFPr}    options={provsUnicos}/>
          </div>
          <div style={{flex:"1 1 120px"}}>
            <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Marca</div>
            <Fi value={filtroMarca} onChange={setFMarca} options={marcasUnicas}/>
          </div>
          <div style={{flex:"1 1 120px"}}>
            <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:0.5}}>Estado</div>
            <Fi value={filtroE}     onChange={setFE}     options={["Todos","Bajo stock","Agotados","Inactivos"]}/>
          </div>
          <div style={{paddingBottom:1,display:"flex",gap:8}}>
            <Btn variant="secondary" onClick={()=>setModalLista(true)}>📄 Lista de precios</Btn>
            {esAdmin&&<Btn onClick={abrirNuevo}>+ Nuevo producto</Btn>}
          </div>
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
                  {label:"Proveedor",col:"proveedor",soloAdmin:true},
                  {label:"Stock",    col:"stock"},
                  {label:"Costo",    col:"costo",soloAdmin:true},
                  {label:"Minorista",col:"precio_min"},
                  {label:"Especial", col:"precio_esp"},
                  {label:"Mayorista",col:"precio_may"},
                  {label:"Vendidos", col:"vendidos",soloAdmin:true},
                  {label:"Estado",   col:"estado"},
                  {label:"",         col:null,soloAdmin:true},
                ].filter(c=>esAdmin||!c.soloAdmin).map(({label,col})=>(
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
                    {esAdmin&&<td style={{padding:"9px 12px",color:G.textoSec,whiteSpace:"nowrap",fontSize:11}}>{p.proveedor||"—"}</td>}
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",fontWeight:600,whiteSpace:"nowrap",color:e==="agotado"?G.rojo:e==="bajo"?G.amarillo:G.texto}}>{p.stock}<span style={{color:G.textoSec,fontWeight:400,fontSize:10}}> /{p.stock_min}</span></td>
                    {esAdmin&&<td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.costo)}</td>}
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",fontWeight:600}}>{pF(p.precio_min)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.precio_esp)}</td>
                    <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{pF(p.precio_may)}</td>
                    {esAdmin&&<td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.verde,whiteSpace:"nowrap"}}>{fmtNum(p.vendidos)}</td>}
                    <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><Badge color={colorE[e]}>{labelE[e]}</Badge></td>
                    {esAdmin&&<td style={{padding:"9px 12px"}}><Btn small variant="ghost" onClick={()=>abrirEditar(p)}>Editar</Btn></td>}
                  </tr>
                );
              })}
              {filtrados.length===0&&<tr><td colSpan={13} style={{padding:"32px",textAlign:"center",color:G.textoSec}}>Sin resultados</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {/* Modal lista de precios */}
      {modalLista&&(
        <Modal title="Exportar lista de precios" onClose={()=>setModalLista(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModalLista(false)}>Cancelar</Btn><Btn disabled={generando} onClick={()=>generarListaPDF(tipoLista,filtrados)}>{generando?"Generando...":"📥 Descargar PDF"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div style={{fontSize:13,color:G.textoSec}}>
              Se exportarán <strong style={{color:G.texto}}>{filtrados.filter(p=>p.activo).length} productos</strong> según el filtro actual.
              {filtroC!=="Todas"&&<span> Grupo: <strong style={{color:G.verde}}>{filtroC}</strong></span>}
            </div>
            <div>
              <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Tipo de lista</div>
              <div style={{display:"flex",gap:10}}>
                {[{k:"minorista",l:"Minorista"},{k:"mayorista",l:"Mayorista"}].map(t=>(
                  <button key={t.k} onClick={()=>setTipoLista(t.k)}
                    style={{flex:1,padding:"12px",borderRadius:10,border:`2px solid ${tipoLista===t.k?G.verde:G.borde}`,background:tipoLista===t.k?"#00C48C18":G.sup2,color:tipoLista===t.k?G.verde:G.textoSec,fontWeight:600,fontSize:13,cursor:"pointer",transition:"all .15s"}}>
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
      {modal&&(
        <Modal title={editando?"Editar producto":"Nuevo producto"} onClose={()=>setModal(false)} maxWidth={520}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fCodigo||!fNombre||!fCosto||!fGanMin||!fGanMay||loading||codigoExiste} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar producto"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* Identificacion */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <Fi label="Codigo" value={fCodigo} onChange={setFK} placeholder="PIL001"
                  style={{...(codigoExiste?{outline:`1px solid ${G.rojo}`}:{})}}/>
                {codigoExiste&&<span style={{fontSize:11,color:G.rojo,fontWeight:500}}>⚠ Este código ya existe</span>}
              </div>
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
  const valido=prodSelec&&cantidad;

  async function registrar(){
    if(!valido)return;setLoading(true);
    await onRegistrar({fecha:hoy(),producto_id:prodSelec.id,nombre:prodSelec.nombre,cantidad:parseInt(cantidad),costo_unit:prodSelec.costo||0,proveedor,responsable:resp,notas});
    setLoading(false);setOk(true);
    setTimeout(()=>{setPS(null);setPB("");setCant("");setNotas("");setOk(false);setV("historial");},2000);
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>Ingreso registrado</div></div>);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(1,1fr)",gap:12}}>
        <MetricCard label="Ultimo ingreso" value={abastecimiento[0]?.fecha||"—"} sub={abastecimiento[0]?.nombre||""}/>
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
                    <div key={p.id} onClick={()=>{setPS(p);setPB("");setProv(p.proveedor||"");}} style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${G.borde}22`}} onMouseEnter={e=>e.currentTarget.style.background=G.borde} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
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
              <Fi label="Proveedor"  value={proveedor} onChange={setProv} options={(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)}/>
              <Fi label="Responsable" value={resp}     onChange={setResp} options={(vendedores||[]).map(v=>v.nombre)}/>
            </div>
            <div style={{marginTop:12}}><Fi label="Notas" value={notas} onChange={setNotas} placeholder="Ej: descuento por volumen"/></div>
          </Card>
          <Card>
            <ST>Resumen</ST>
            <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:13}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Producto</span><span style={{fontWeight:500,textAlign:"right",maxWidth:140,wordBreak:"break-word"}}>{prodSelec?.nombre||"—"}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Cantidad</span><span style={{fontFamily:"'DM Mono',monospace"}}>{cantidad||0} u.</span></div>
              {prodSelec&&cantidad&&<><div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Nuevo stock</span><span style={{color:G.verde,fontFamily:"'DM Mono',monospace"}}>{prodSelec.stock+parseInt(cantidad||0)} u.</span></div></>}
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
  const [rol,      setRol]      = useState("admin"); // 'admin' | 'local'
  const [modulo,   setModulo]   = useState("analisis");
  const [filtroIngresos, setFiltroIngresos] = useState("");
  const toast = useToast();

  const esAdmin = rol === "admin";

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session);
      setChecking(false);
      if(session?.user?.email){
        supabase.from("user_roles").select("rol").eq("email",session.user.email).single()
          .then(({data})=>{
            const r = data?.rol||"local";
            setRol(r);
            // Si es local, arrancar en venta en lugar de dashboard
            if(r==="local") setModulo("venta");
          });
      }
    });
    supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session);
      if(!session) setRol("admin");
    });
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

  const tabsTodos=[
    {id:"analisis",       label:"Dashboard",      soloAdmin:true},
    {id:"venta",          label:"Nueva venta",    alerta:0},
    {id:"ingresos",       label:"Ingresos",       alerta:pendientesCobro},
    {id:"egresos",        label:"Egresos",        alerta:reembolsosPend},
    {id:"caja",           label:"Cierre de Caja", alerta:0, soloAdmin:true},
    {id:"clientes",       label:"Clientes",       alerta:0},
    {id:"productos",      label:"Productos",      alerta:alertasStock},
    {id:"abastecimiento", label:"Abastecimiento", alerta:0},
    {id:"configuracion",  label:"Configuracion",  alerta:0, soloAdmin:true},
  ];
  const tabs = tabsTodos.filter(t=>esAdmin||!t.soloAdmin);

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
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div style={{fontSize:11,color:G.textoSec}}>{session.user.email}</div>
              {!esAdmin&&<span style={{background:"#4D9EFF22",color:G.azul,border:"1px solid #4D9EFF44",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:600}}>LOCAL</span>}
            </div>
            <Btn small variant="ghost" onClick={handleLogout}>Salir</Btn>
          </div>
        </div>

        <div style={{padding:"20px 22px",maxWidth:1200,margin:"0 auto"}}>
          {data.loading&&modulo!=="venta"
            ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,gap:12}}><Spinner/><span style={{color:G.textoSec}}>Cargando datos...</span></div>
            :(<>
              {modulo==="analisis"       && <ModuloAnalisis       ventas={data.ventasConItems} egresos={data.egresos} productos={data.productos} vendedores={data.vendedores} totalNosDeben={data.totalNosDeben} anioStats={data.anioStats} onNavegar={setModulo} onFiltroIngresos={setFiltroIngresos}/>}
              {modulo==="venta"          && <ModuloVenta          clientes={data.clientes} productos={data.productos} onRegistrar={data.registrarVenta} vendedores={data.vendedores} esAdmin={esAdmin}/>}
              {modulo==="ingresos"       && <ModuloIngresos       ventas={data.ventasConItems} vendedores={data.vendedores} productos={data.productos} onEditar={data.editarVenta} onEliminar={data.eliminarVenta} totalVentas={data.totalVentas} filtroInicial={filtroIngresos} esAdmin={esAdmin}/>}
              {modulo==="egresos"        && <ModuloEgresos  esAdmin={esAdmin}        egresos={data.egresos} onRegistrar={data.registrarEgreso} onReembolsar={data.marcarReembolsado} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarEgreso} onEliminar={data.eliminarEgreso}/>}
              {modulo==="clientes"       && <ModuloClientes       clientes={data.clientes} onGuardar={data.guardarCliente} ventas={data.ventasConItems}/>}
              {modulo==="productos"      && <ModuloProductos      productos={data.productos} onGuardar={data.guardarProducto} proveedores={data.proveedores} esAdmin={esAdmin}/>}
              {modulo==="abastecimiento" && <ModuloAbastecimiento productos={data.productos} abastecimiento={data.abastecimiento} onRegistrar={data.registrarAbastecimiento} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarAbastecimiento} onEliminar={data.eliminarAbastecimiento}/>}
              {modulo==="caja"           && <ModuloCaja          ventas={data.ventasConItems} egresos={data.egresos} toast={toast}/>}
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
// MODULO: CIERRE DE CAJA
// ============================================================
function ModuloCaja({ventas,egresos,toast}){
  const [fecha,       setFecha]      = useState(hoy());
  const [cajChica,    setCajChica]   = useState("");
  const [saldoMP,     setSaldoMP]    = useState("");
  const [saldoBanco,  setSaldoBanco] = useState("");
  const [saldoAhorro, setSaldoAhorro]= useState("");
  const [notas,       setNotas]      = useState("");
  const [loading,     setLoading]    = useState(false);
  const [cierres,     setCierres]    = useState([]);
  const [movimientos, setMovimientos]= useState([]);
  const [tab,         setTab]        = useState("nuevo");
  const [modalMov,    setModalMov]   = useState(false);
  const [movOrigen,   setMovOrigen]  = useState("caja_chica");
  const [movDestino,  setMovDestino] = useState("banco");
  const [movMonto,    setMovMonto]   = useState("");
  const [movConcepto, setMovConcepto]= useState("");
  const [loadingMov,  setLoadingMov] = useState(false);
  // Saldos iniciales (cuando no hay cierre previo)
  const [initCaja,    setInitCaja]   = useState("");
  const [initMP,      setInitMP]     = useState("");
  const [initBanco,   setInitBanco]  = useState("");
  const [initAhorro,  setInitAhorro] = useState("");

  const BOLSILLOS = [
    {key:"caja_chica", label:"Caja Chica"},
    {key:"mp",         label:"Mercado Pago"},
    {key:"banco",      label:"Banco"},
    {key:"ahorro",     label:"Ahorro"},
  ];

  useEffect(()=>{ cargarHistorial(); },[]);

  async function cargarHistorial(){
    const[{data:c},{data:m}]=await Promise.all([
      supabase.from("cierres_caja").select("*").order("fecha",{ascending:false}).limit(30),
      supabase.from("movimientos_caja").select("*").order("fecha",{ascending:false}).limit(50),
    ]);
    setCierres(c||[]);
    setMovimientos(m||[]);
  }

  // Cierre anterior a la fecha seleccionada (para tomar saldo inicial)
  const cierreAnterior = useMemo(()=>{
    return cierres.find(c=>c.fecha < fecha) || null;
  },[cierres, fecha]);

  const hayHistorial = cierres.length > 0;
  const esPrimerCierre = !hayHistorial;

  // Saldo inicial: del cierre anterior o lo que ingresa el usuario (primer cierre)
  const inicialCaja  = esPrimerCierre ? (parseFloat(initCaja)||0)  : (cierreAnterior?.saldo_caja_chica||0);
  const inicialMP    = esPrimerCierre ? (parseFloat(initMP)||0)    : (cierreAnterior?.saldo_mp||0);
  const inicialBanco = esPrimerCierre ? (parseFloat(initBanco)||0) : (cierreAnterior?.saldo_banco||0);
  const inicialAhorro= esPrimerCierre ? (parseFloat(initAhorro)||0): (cierreAnterior?.saldo_ahorro||0);

  // Calcular datos del sistema para la fecha seleccionada
  const ventasDia  = ventas.filter(v=>v.fecha===fecha);
  const egresosDia = egresos.filter(e=>e.fecha===fecha);

  // Metodos que van a cada bolsillo
  const MP_METODOS     = ["Transferencia MP","Debito MP","Credito MP"];
  const BANCO_METODOS  = ["Transferencia Banco","Debito Banco","Credito Banco","Credito Cuotas Banco"];

  const vEfectivo  = ventasDia.filter(v=>v.metodo_pago==="Efectivo").reduce((s,v)=>s+(v.total||0),0);
  const vMP        = ventasDia.filter(v=>MP_METODOS.includes(v.metodo_pago)).reduce((s,v)=>s+(v.total||0),0);
  const vBanco     = ventasDia.filter(v=>BANCO_METODOS.includes(v.metodo_pago)).reduce((s,v)=>s+(v.total||0),0);
  const vCC        = ventasDia.filter(v=>v.metodo_pago==="Cuenta corriente").reduce((s,v)=>s+(v.total||0),0);
  const vTotal     = ventasDia.reduce((s,v)=>s+(v.total||0),0);
  // Para compatibilidad con campos guardados
  const vTransf    = vBanco;
  const vDebito    = 0;
  const vCredito   = 0;

  const gEfectivo  = egresosDia.filter(e=>e.metodo_pago==="Efectivo").reduce((s,e)=>s+(e.monto||0),0);
  const gOtros     = egresosDia.filter(e=>e.metodo_pago!=="Efectivo").reduce((s,e)=>s+(e.monto||0),0);
  const gTotal     = egresosDia.reduce((s,e)=>s+(e.monto||0),0);
  const ganNeta    = ventasDia.reduce((s,v)=>s+(v.ganancia||0),0);

  // Movimientos entre bolsillos del día
  const movsDia = movimientos.filter(m=>m.fecha===fecha);
  const movNet = (bolsillo) => {
    const entra = movsDia.filter(m=>m.destino===bolsillo).reduce((s,m)=>s+(m.monto||0),0);
    const sale  = movsDia.filter(m=>m.origen===bolsillo).reduce((s,m)=>s+(m.monto||0),0);
    return entra - sale;
  };

  // Esperado = saldo_inicial + entradas - salidas + movimientos_netos
  const esperadoCaja  = inicialCaja  + vEfectivo - gEfectivo + movNet("caja_chica");
  const esperadoMP    = inicialMP    + vMP                   + movNet("mp");
  const esperadoBanco = inicialBanco + vBanco                + movNet("banco");

  // Real ingresado por el usuario
  const realCaja   = parseFloat(cajChica)||0;
  const realMP     = parseFloat(saldoMP)||0;
  const realBanco  = parseFloat(saldoBanco)||0;
  const realAhorro = parseFloat(saldoAhorro)||0;
  const diffCaja   = realCaja  - esperadoCaja;
  const diffMP     = realMP    - esperadoMP;
  const diffBanco  = realBanco - esperadoBanco;

  async function guardarCierre(){
    if(!fecha){toast.err("Seleccioná una fecha");return;}
    setLoading(true);
    const{error}=await supabase.from("cierres_caja").upsert({
      fecha,
      saldo_caja_chica: realCaja, saldo_mp: realMP,
      saldo_banco: realBanco, saldo_ahorro: realAhorro,
      ventas_efectivo: vEfectivo, ventas_transferencia: vTransf,
      ventas_mp: vMP, ventas_debito: vDebito,
      ventas_credito: vCredito, ventas_cuenta_corriente: vCC,
      ventas_total: vTotal, gastos_efectivo: gEfectivo,
      gastos_otros: gOtros, gastos_total: gTotal,
      ganancia_neta: ganNeta,
      diff_caja_chica: diffCaja, diff_mp: diffMP, diff_banco: diffBanco,
      notas,
    },{onConflict:"fecha"});
    if(error){toast.err("Error al guardar cierre");setLoading(false);return;}
    toast.ok("Cierre guardado");
    setLoading(false);
    cargarHistorial();
    setTab("historial");
  }

  async function guardarMovimiento(){
    if(!movMonto||movOrigen===movDestino){toast.err("Revisá los datos del movimiento");return;}
    setLoadingMov(true);
    await supabase.from("movimientos_caja").insert({
      fecha, origen:movOrigen, destino:movDestino,
      monto:parseFloat(movMonto)||0, concepto:movConcepto,
    });
    toast.ok("Movimiento registrado");
    setLoadingMov(false);
    setModalMov(false);
    setMovMonto("");setMovConcepto("");
    cargarHistorial();
  }

  const diffColor=(d)=>d>0?G.verde:d<0?G.rojo:G.textoSec;
  const diffLabel=(d)=>d===0?"✓ Cuadra":d>0?`+${fmt(d)} sobrante`:`${fmt(d)} faltante`;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:8}}>
        {[{k:"nuevo",l:"Nuevo cierre"},{k:"historial",l:"Historial"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            style={{background:tab===t.k?G.verde:G.sup2,color:tab===t.k?"#000":G.textoSec,border:`1px solid ${tab===t.k?G.verde:G.borde}`,borderRadius:8,padding:"6px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {t.l}
          </button>
        ))}
        <div style={{flex:1}}/>
        <Btn small variant="secondary" onClick={()=>setModalMov(true)}>↔ Registrar movimiento</Btn>
      </div>

      {tab==="nuevo"&&(<>
        {/* Selector fecha */}
        <Card>
          <div style={{display:"flex",gap:12,alignItems:"flex-end",flexWrap:"wrap"}}>
            <Fi label="Fecha del cierre" value={fecha} onChange={setFecha} type="date" style={{width:200}}/>
            <div style={{fontSize:13,color:G.textoSec}}>
              {ventasDia.length} ventas · {egresosDia.length} egresos registrados en sistema
            </div>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Columna izquierda: lo que dice el sistema */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card>
              <ST>Ingresos del día — sistema</ST>
              {[
                {l:"Efectivo",             v:vEfectivo, c:G.verde},
                {l:"MP (Transf+Déb+Cred)", v:vMP,       c:G.azul},
                {l:"Banco (Transf+Déb+Cred+Cuotas)", v:vBanco, c:G.azul},
                {l:"Cuenta corriente",     v:vCC,       c:G.amarillo},
              ].filter(x=>x.v>0).map(x=>(
                <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${G.borde}22`,fontSize:13}}>
                  <span style={{color:G.textoSec}}>{x.l}</span>
                  <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:x.c}}>{fmt(x.v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:14,fontWeight:600,marginTop:4}}>
                <span>Total ventas</span>
                <span style={{fontFamily:"DM Mono,monospace",color:G.verde}}>{fmt(vTotal)}</span>
              </div>
            </Card>
            <Card>
              <ST>Egresos del día — sistema</ST>
              {[
                {l:"Efectivo",  v:gEfectivo, c:G.rojo},
                {l:"Otros",     v:gOtros,    c:G.naranja},
              ].filter(x=>x.v>0).map(x=>(
                <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${G.borde}22`,fontSize:13}}>
                  <span style={{color:G.textoSec}}>{x.l}</span>
                  <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:x.c}}>{fmt(x.v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:14,fontWeight:600,marginTop:4}}>
                <span>Total gastos</span>
                <span style={{fontFamily:"DM Mono,monospace",color:G.rojo}}>{fmt(gTotal)}</span>
              </div>
            </Card>
            <Card style={{border:`1px solid ${G.verde}33`}}>
              <ST>Ganancia neta del día</ST>
              <div style={{fontSize:28,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(ganNeta)}</div>
            </Card>
          </div>

          {/* Columna derecha: lo que hay realmente */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Saldo inicial — solo si es el primer cierre */}
            {esPrimerCierre&&(
              <Card style={{border:`1px solid ${G.amarillo}44`,background:"#FFB80008"}}>
                <ST>⚡ Primer cierre — saldos antes de hoy</ST>
                <div style={{fontSize:12,color:G.textoSec,marginBottom:10}}>
                  Ingresá cuánto había en cada bolsillo ANTES de las operaciones de este día. A partir del próximo cierre el sistema lo toma automáticamente.
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <Fi label="Caja Chica inicial" value={initCaja} onChange={setInitCaja} type="number" placeholder="0"/>
                  <Fi label="Mercado Pago inicial" value={initMP} onChange={setInitMP} type="number" placeholder="0"/>
                  <Fi label="Banco inicial" value={initBanco} onChange={setInitBanco} type="number" placeholder="0"/>
                  <Fi label="Ahorro inicial" value={initAhorro} onChange={setInitAhorro} type="number" placeholder="0"/>
                </div>
              </Card>
            )}
            {!esPrimerCierre&&cierreAnterior&&(
              <Card style={{background:G.sup2,border:`1px solid ${G.borde}`}}>
                <ST>Saldos iniciales — del cierre del {cierreAnterior.fecha}</ST>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
                  {[
                    {l:"Caja Chica", v:inicialCaja},
                    {l:"MP",         v:inicialMP},
                    {l:"Banco",      v:inicialBanco},
                    {l:"Ahorro",     v:inicialAhorro},
                  ].map(x=>(
                    <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                      <span style={{color:G.textoSec}}>{x.l}</span>
                      <span style={{fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(x.v)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            <Card>
              <ST>Saldos reales al cierre — ingresá lo que tenés</ST>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Fi label="Caja Chica (efectivo en local)" value={cajChica} onChange={setCajChica} type="number" placeholder="0"/>
                <Fi label="Mercado Pago" value={saldoMP} onChange={setSaldoMP} type="number" placeholder="0"/>
                <Fi label="Banco" value={saldoBanco} onChange={setSaldoBanco} type="number" placeholder="0"/>
                <Fi label="Ahorro (caja de seguridad)" value={saldoAhorro} onChange={setSaldoAhorro} type="number" placeholder="0"/>
              </div>
            </Card>

            {/* Diferencias */}
            {(cajChica||saldoMP||saldoBanco)&&(
              <Card>
                <ST>Diferencias (real vs esperado)</ST>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[
                    {l:"Caja Chica",           esp:esperadoCaja,  real:realCaja,  diff:diffCaja,
                      det:`Inicial ${fmt(inicialCaja)} + Ventas ${fmt(vEfectivo)} − Gastos ${fmt(gEfectivo)}${movNet("caja_chica")!==0?` + Mov. ${fmt(movNet("caja_chica"))}`:""}` },
                    {l:"Mercado Pago",          esp:esperadoMP,   real:realMP,   diff:diffMP,
                      det:`Inicial ${fmt(inicialMP)} + Cobros MP ${fmt(vMP)}${movNet("mp")!==0?` + Mov. ${fmt(movNet("mp"))}`:""}` },
                    {l:"Banco",                 esp:esperadoBanco,real:realBanco,diff:diffBanco,
                      det:`Inicial ${fmt(inicialBanco)} + Cobros Banco ${fmt(vBanco)}${movNet("banco")!==0?` + Mov. ${fmt(movNet("banco"))}`:""}` },
                  ].map(x=>(
                    <div key={x.l} style={{background:G.sup2,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                        <span style={{fontSize:12,fontWeight:600}}>{x.l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:diffColor(x.diff)}}>{diffLabel(x.diff)}</span>
                      </div>
                      <div style={{fontSize:11,color:G.textoSec,marginBottom:3}}>{x.det}</div>
                      <div style={{display:"flex",gap:16,fontSize:11,color:G.textoSec}}>
                        <span>Esperado: <strong style={{color:G.texto}}>{fmt(x.esp)}</strong></span>
                        <span>Real: <strong style={{color:G.texto}}>{fmt(x.real)}</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <Fi label="Notas del cierre" value={notas} onChange={setNotas} rows={3} placeholder="Observaciones, aclaraciones..."/>
            </Card>

            <Btn full onClick={guardarCierre} disabled={loading}>
              {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"💾 Guardar cierre de caja"}
            </Btn>
          </div>
        </div>
      </>)}

      {tab==="historial"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {cierres.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>No hay cierres guardados aún</div>}
          {cierres.map(c=>(
            <Card key={c.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontWeight:600,fontSize:15,marginBottom:4}}>{c.fecha}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Badge color="verde">Ventas {fmt(c.ventas_total)}</Badge>
                    <Badge color="rojo">Gastos {fmt(c.gastos_total)}</Badge>
                    <Badge color={c.ganancia_neta>=0?"verde":"rojo"}>Gan. {fmt(c.ganancia_neta)}</Badge>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,textAlign:"center"}}>
                  {[
                    {l:"Caja",   v:c.saldo_caja_chica, d:c.diff_caja_chica},
                    {l:"MP",     v:c.saldo_mp,         d:c.diff_mp},
                    {l:"Banco",  v:c.saldo_banco,      d:c.diff_banco},
                    {l:"Ahorro", v:c.saldo_ahorro,     d:null},
                  ].map(x=>(
                    <div key={x.l} style={{background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
                      <div style={{fontSize:10,color:G.textoSec,marginBottom:2}}>{x.l}</div>
                      <div style={{fontSize:13,fontWeight:600,fontFamily:"DM Mono,monospace"}}>{fmt(x.v)}</div>
                      {x.d!==null&&<div style={{fontSize:10,color:x.d===0?G.verde:x.d>0?G.verde:G.rojo}}>{x.d===0?"✓":x.d>0?`+${fmt(x.d)}`:fmt(x.d)}</div>}
                    </div>
                  ))}
                </div>
              </div>
              {c.notas&&<div style={{marginTop:10,fontSize:12,color:G.textoSec,fontStyle:"italic"}}>"{c.notas}"</div>}
              {/* Movimientos del dia */}
              {movimientos.filter(m=>m.fecha===c.fecha).length>0&&(
                <div style={{marginTop:10,borderTop:`1px solid ${G.borde}22`,paddingTop:8}}>
                  <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:6}}>MOVIMIENTOS</div>
                  {movimientos.filter(m=>m.fecha===c.fecha).map(m=>(
                    <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",color:G.textoSec}}>
                      <span>{BOLSILLOS.find(b=>b.key===m.origen)?.label||m.origen} → {BOLSILLOS.find(b=>b.key===m.destino)?.label||m.destino}{m.concepto?` · ${m.concepto}`:""}</span>
                      <span style={{fontFamily:"DM Mono,monospace",color:G.azul}}>{fmt(m.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Modal movimiento */}
      {modalMov&&(
        <Modal title="Registrar movimiento entre bolsillos" onClose={()=>setModalMov(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModalMov(false)}>Cancelar</Btn><Btn disabled={loadingMov||!movMonto||movOrigen===movDestino} onClick={guardarMovimiento}>{loadingMov?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Registrar"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              Fecha: {fecha}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Origen" value={movOrigen} onChange={setMovOrigen} options={BOLSILLOS.map(b=>({value:b.key,label:b.label}))}/>
              <Fi label="Destino" value={movDestino} onChange={setMovDestino} options={BOLSILLOS.map(b=>({value:b.key,label:b.label}))}/>
            </div>
            {movOrigen===movDestino&&<div style={{fontSize:12,color:G.rojo}}>El origen y destino no pueden ser iguales</div>}
            <Fi label="Monto ($)" value={movMonto} onChange={setMovMonto} type="number" placeholder="0"/>
            <Fi label="Concepto (opcional)" value={movConcepto} onChange={setMovConcepto} placeholder="Ej: depósito del día"/>
          </div>
        </Modal>
      )}
    </div>
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
  async function generarListaPDF(tipo, productos_filtrados){
    setGenerando(true);
    // Cargar jsPDF dinámicamente
    if(!window.jspdf){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W=210, H=297;
    const azul=[20,53,107], azulClaro=[41,98,180], gris=[100,100,100], grisClar=[240,242,245], negro=[30,30,30], blanco=[255,255,255], verde=[0,168,120];

    const LOGO_B64 = "data:image/jpeg;base64,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";
    const fmtP = n => n>0 ? '$ '+Math.round(n).toLocaleString('es-AR') : '-';

    // Agrupar por categoria
    const activos = productos_filtrados.filter(p=>p.activo);
    const grupos = {};
    activos.forEach(p=>{
      const cat = p.categoria||'Sin categoría';
      if(!grupos[cat]) grupos[cat]=[];
      grupos[cat].push(p);
    });
    const cats = Object.keys(grupos).sort();

    let pag = 1;
    const totalPags = () => doc.internal.getNumberOfPages();

    function dibujarEncabezado(){
      // Fondo azul header
      doc.setFillColor(...azul);
      doc.rect(0,0,W,38,'F');
      // Logo
      try{ doc.addImage(LOGO_B64,'JPEG',8,4,28,28); }catch(e){}
      // Nombre empresa
      doc.setTextColor(...blanco);
      doc.setFont('helvetica','bold');
      doc.setFontSize(22);
      doc.text('PENSOK',44,16);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text('Piletas · Jardín · Limpieza · Fumigación',44,22);
      // Contacto
      doc.setFontSize(8.5);
      doc.text('📞 11-7064-5115',44,29);
      doc.text('@pensok.piletas',90,29);
      // Tipo lista badge
      const label = tipo==='minorista'?'LISTA MINORISTA':'LISTA MAYORISTA';
      doc.setFillColor(...azulClaro);
      doc.roundedRect(W-52,8,46,16,3,3,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...blanco);
      doc.text(label,W-29,18,{align:'center'});
      // Fecha
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(200,220,255);
      const hoy=new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
      doc.text('Actualizado: '+hoy,W-29,27,{align:'center'});
      // Linea separadora
      doc.setDrawColor(...azulClaro);
      doc.setLineWidth(0.3);
      doc.line(0,38,W,38);
    }

    function dibujarPie(pNum, total){
      doc.setFillColor(...azul);
      doc.rect(0,H-12,W,12,'F');
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...blanco);
      doc.text('PENSOK — Lista de precios '+tipo+' — Válida al '+new Date().toLocaleDateString('es-AR'),14,H-5);
      doc.text('Página '+pNum+' / '+total,W-14,H-5,{align:'right'});
    }

    // Primera página
    dibujarEncabezado();
    let y = 44;
    const COL_PROD=14, COL_CAT=120, COL_PRECIO=170;
    const ROW_H=7, CAT_H=9;

    // Header columnas
    function dibujarHeaderColumnas(){
      doc.setFillColor(...azulClaro);
      doc.rect(10,y,W-20,7,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.setTextColor(...blanco);
      doc.text('PRODUCTO',COL_PROD+2,y+5);
      doc.text('MARCA',COL_CAT-30,y+5);
      doc.text('PRECIO',COL_PRECIO,y+5);
      y+=8;
    }
    dibujarHeaderColumnas();

    let filaPar = false;
    for(const cat of cats){
      const prods = grupos[cat];
      // Espacio para titulo de categoria + al menos 2 filas
      if(y > H-30){
        dibujarPie(doc.internal.getNumberOfPages(), '??');
        doc.addPage();
        dibujarEncabezado();
        y=44;
        dibujarHeaderColumnas();
        filaPar=false;
      }
      // Titulo categoria
      doc.setFillColor(220,230,245);
      doc.rect(10,y,W-20,CAT_H,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(9);
      doc.setTextColor(...azul);
      doc.text(cat.toUpperCase(),COL_PROD+2,y+6.5);
      y+=CAT_H+1;
      filaPar=false;

      for(const p of prods){
        if(y>H-20){
          dibujarPie(doc.internal.getNumberOfPages(),'??');
          doc.addPage();
          dibujarEncabezado();
          y=44;
          dibujarHeaderColumnas();
          filaPar=false;
        }
        // Fila alternada
        if(filaPar){ doc.setFillColor(...grisClar); doc.rect(10,y,W-20,ROW_H,'F'); }
        filaPar=!filaPar;
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.setTextColor(...negro);
        // Nombre (truncar si es largo)
        const nombre = p.nombre?.length>55 ? p.nombre.substring(0,52)+'...' : (p.nombre||'');
        doc.text(nombre,COL_PROD+2,y+5);
        // Marca
        doc.setTextColor(...gris);
        doc.setFontSize(7.5);
        doc.text(p.marca||'',COL_CAT-30,y+5);
        // Precio
        const precio = tipo==='minorista' ? p.precio_min : p.precio_may;
        doc.setFont('helvetica','bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...azul);
        doc.text(fmtP(precio),COL_PRECIO,y+5);
        // Linea separadora suave
        doc.setDrawColor(220,220,220);
        doc.setLineWidth(0.1);
        doc.line(10,y+ROW_H,W-10,y+ROW_H);
        y+=ROW_H;
      }
      y+=3; // espacio entre categorias
    }

    // Actualizar numeros de pagina en pies
    const totalP = doc.internal.getNumberOfPages();
    for(let i=1;i<=totalP;i++){
      doc.setPage(i);
      dibujarPie(i,totalP);
    }

    const fname = 'pensok-lista-'+tipo+'-'+new Date().toISOString().split('T')[0]+'.pdf';
    doc.save(fname);
    setGenerando(false);
    setModalLista(false);
  }

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
    <div id="panel-reposicion" style={{marginBottom:4}}>
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
