import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// ⚙️  CONFIGURACION — reemplaza estos dos valores
//     Los encontras en: Supabase > Settings > API
// ============================================================
// ── CONFIGURACIÓN DE LOCALES ────────────────────────────────
const LOCALES = {
  pilar: {
    nombre: "Pensok Pilar",
    url:    "https://dupatnbwrgdtxalpqgqi.supabase.co",
    anon:   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1cGF0bmJ3cmdkdHhhbHBxZ3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDI3MTYsImV4cCI6MjA5MjYxODcxNn0.boipXsRYdS98KjU8A2edDbAMEprFGT_1iL6rwkbHres",
  },
  camanio: {
    nombre: "Pensok Caamaño",
    url:    "https://kggpwndbdbqfmupiqrqp.supabase.co",
    anon:   "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ3B3bmRiZGJxZm11cGlxcnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzgyMTcsImV4cCI6MjA5MzY1NDIxN30.N0UihJY_WSfFARChle_HMtZ-jvKDPbIo0fOZDCdJvV0",
  },
};

// El local se guarda en localStorage para recordarlo entre sesiones
const localKey = localStorage.getItem("pensok_local") || "pilar";
const localActivo = LOCALES[localKey] || LOCALES.pilar;
const supabase = createClient(localActivo.url, localActivo.anon);
// Clientes "cruzados" hacia la otra base. No manejan sesión propia: acceden solo con la anon key.
// (Si no se desactiva la sesión, se crean varias instancias de GoTrue sobre el mismo storage y
//  el navegador tira el warning de "Multiple GoTrueClient instances".)
const OPCIONES_CRUZADO = {auth:{persistSession:false,autoRefreshToken:false}};
const otroLocalKey = localKey === "pilar" ? "camanio" : "pilar";
const supabaseOtro = createClient(LOCALES[otroLocalKey].url, LOCALES[otroLocalKey].anon, OPCIONES_CRUZADO);
// Replicar productos nuevos en Caamaño (solo desde Pilar) — reutiliza el cliente cruzado
const supabaseCamanio = localKey === "pilar" ? supabaseOtro : null;
// Las tareas viven SIEMPRE en la base de Pilar: es una sola tabla compartida por los dos locales
// (con un campo "local" para saber a cuál corresponde cada tarea). Fuente única de verdad, sin
// replicación entre bases — así no puede desincronizarse.
const supabaseTareas = localKey === "pilar" ? supabase : supabaseOtro;

// Datos de cada local para tickets, presupuestos y PDFs
const LOCALES_INFO = {
  pilar: {
    razonSocial: "DOMOKIP SAS",
    cuit:        "30-71686952-7",
    direccion:   "Gelves 1126, B1629 Pilar, Buenos Aires",
    direccionCorta: "Gelves 1126, Pilar, Bs As",
    telefono:    "11-7064-5115",
    instagram:   "@pensok.piletas",
  },
  camanio: {
    razonSocial: "Patricia Rita Dieguez",
    cuit:        "27-17363512-0",
    direccion:   "R. Caamaño 914 Local 4, B1631 Villa Rosa, Buenos Aires",
    direccionCorta: "R. Caamaño 914 L.4, Villa Rosa, Bs As",
    telefono:    "11-2393-2702",
    instagram:   "@pensok.piletas",
  },
};
const LI = LOCALES_INFO[localKey] || LOCALES_INFO.pilar;

// ============================================================
// CONSTANTES
// ============================================================
// VENDEDORES ahora se cargan desde Supabase (tabla vendedores)
const METODOS_PAGO = ["Efectivo", "Transferencia MP", "Transferencia Banco", "Debito MP", "Debito Banco", "Credito MP", "Credito Banco", "Credito Cuotas Banco", "Cuenta corriente"];
const MODALIDADES  = ["En el local", "Telefonica / Delivery"];
const CATEGORIAS   = ["Accesorios","Acido","Atermico","Bombas","Cloro","Envases","Filtros","Fumigacion","General","Granel","Jardinería","Limpieza","Perfumería","Pintura","PVC","Quimicos","Repuestos","Revestimiento","Sanitarios"];
const TIPOS_EGRESO = ["Gasto fijo", "Gasto variable", "Retiro de capital", "Inversión inicial"];
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
function getPrecio(p,tipo) { return tipo==="mayorista"?p.precio_may:tipo==="especial"?p.precio_esp:tipo==="costo"?p.costo:p.precio_min; }
function estadoStock(p)    { if(p.stock<0)return"negativo"; if(p.stock===0)return"agotado"; if(p.stock<=(p.stock_min||0))return"bajo"; return"ok"; }
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
const G = localKey === "camanio"
  ? {verde:"#00A876",fondo:"#F2F4F8",sup:"#FFFFFF",sup2:"#E8EBF2",borde:"#CDD3E0",texto:"#1A1F2E",textoSec:"#5C6478",rojo:"#D93050",amarillo:"#CC9200",azul:"#2B7FD4",naranja:"#D46B20",violeta:"#7C5FD4"}
  : {verde:"#00C48C",fondo:"#0F1117",sup:"#181C25",sup2:"#1E2330",borde:"#2A3045",texto:"#E8EAF0",textoSec:"#7A8099",rojo:"#FF4D6A",amarillo:"#FFB800",azul:"#4D9EFF",naranja:"#FF8C42",violeta:"#A78BFA"};

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

  /* ── RESPONSIVO MOBILE ─────────────────────────────────────── */
  @media (max-width: 768px) {
    .psk-topbar-email { display: none !important; }
    .psk-nav { display:flex !important; flex-wrap:nowrap !important; overflow-x:auto !important; gap:2px !important; -webkit-overflow-scrolling:touch; scrollbar-width:none; padding-bottom:2px; }
    .psk-nav::-webkit-scrollbar { display:none; }
    .psk-nav button { white-space:nowrap !important; padding:5px 9px !important; font-size:11px !important; flex-shrink:0 !important; }
    .psk-main { padding:12px 10px !important; }
    .psk-grid-4 { grid-template-columns:repeat(2,1fr) !important; }
    .psk-grid-3 { grid-template-columns:1fr !important; }
    .psk-grid-2 { grid-template-columns:1fr !important; }
    .psk-venta-layout { grid-template-columns:1fr !important; }
    .psk-venta-resumen { position:static !important; top:unset !important; }
    .psk-venta-form { grid-template-columns:1fr !important; }
    .psk-venta-tabla input[type=number] { width:60px !important; padding:6px 8px !important; font-size:14px !important; }
    select, input[type=text], input[type=number], input[type=email], input[type=date], input[type=month], input[type=password] { min-height:40px !important; font-size:14px !important; }
    .psk-btn-full { padding:13px 0 !important; font-size:15px !important; }
    .psk-modal-inner { max-width:100% !important; max-height:95vh !important; border-radius:14px 14px 0 0 !important; }
    .psk-modal-wrap { align-items:flex-end !important; padding:0 !important; }
    .psk-tabla-wrap { overflow-x:auto !important; -webkit-overflow-scrolling:touch; }
    .psk-tabla-wrap table { min-width:480px !important; }
  }
  @media (max-width: 420px) {
    .psk-grid-4 { grid-template-columns:1fr !important; }
  }
`;

// ============================================================
// COMPONENTES BASE
// ============================================================
function Badge({color,children,small}){
  const m={verde:{bg:"#00C48C22",t:G.verde,b:"#00C48C44"},rojo:{bg:"#FF4D6A22",t:G.rojo,b:"#FF4D6A44"},amarillo:{bg:"#FFB80022",t:G.amarillo,b:"#FFB80044"},azul:{bg:"#4D9EFF22",t:G.azul,b:"#4D9EFF44"},naranja:{bg:"#FF8C4222",t:G.naranja,b:"#FF8C4244"},violeta:{bg:"#A78BFA22",t:G.violeta,b:"#A78BFA44"},gris:{bg:"#7A809922",t:G.textoSec,b:"#7A809944"},usd:{bg:"#4D9EFF15",t:"#7BC8FF",b:"#4D9EFF33"}};
  const c=m[color]||m.gris;
  return <span style={{background:c.bg,color:c.t,border:`1px solid ${c.b}`,borderRadius:6,padding:small?"1px 6px":"2px 9px",fontSize:small?10:11,fontWeight:500,letterSpacing:0.3,whiteSpace:"nowrap"}}>{children}</span>;
}
function Card({children,style,onClick,className}){return <div onClick={onClick} className={className} style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:12,padding:"18px 22px",animation:"fadeIn .2s ease",...style}}>{children}</div>;}
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

// Nav superior agrupada: cada grupo es un botón con dropdown de sus tabs (ver App > tabsTodos/GRUPOS_NAV).
function NavGroupDropdown({label,items,modulo,onSelect}){
  const [open,setOpen]=useState(false);
  const [pos,setPos]=useState(null); // {top,left} del menu, calculado desde el boton
  const btnRef=useRef(null);
  const menuRef=useRef(null);

  function actualizarPos(){
    if(btnRef.current){
      const r=btnRef.current.getBoundingClientRect();
      setPos({top:r.bottom+4,left:r.left});
    }
  }

  useEffect(()=>{
    function onDocClick(e){
      if(btnRef.current?.contains(e.target)) return;
      if(menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown",onDocClick);
    return ()=>document.removeEventListener("mousedown",onDocClick);
  },[]);

  // El menu se renderiza vía portal (ver abajo) para no quedar recortado por el
  // overflow-x:auto de la barra de nav en mobile -- por eso hace falta recalcular
  // su posición en pantalla en vez de usar position:absolute relativo al boton.
  useEffect(()=>{
    if(!open) return;
    actualizarPos();
    window.addEventListener("resize",actualizarPos);
    window.addEventListener("scroll",actualizarPos,true);
    return ()=>{
      window.removeEventListener("resize",actualizarPos);
      window.removeEventListener("scroll",actualizarPos,true);
    };
  },[open]);

  if(items.length===0) return null;
  const activo = items.some(t=>t.id===modulo);
  const alertaTotal = items.reduce((s,t)=>s+(t.alerta||0),0);
  return(
    <div style={{position:"relative"}}>
      <button ref={btnRef} onClick={()=>setOpen(o=>!o)}
        style={{background:activo?G.verde:"transparent",color:activo?"#000":G.textoSec,border:"none",borderRadius:7,padding:"5px 11px",fontSize:12,fontWeight:activo?600:400,cursor:"pointer",position:"relative",display:"flex",alignItems:"center",gap:4,transition:"all .15s"}}>
        {label}
        <span style={{fontSize:8,opacity:0.7}}>▾</span>
        {alertaTotal>0&&<span style={{position:"absolute",top:2,right:-4,minWidth:14,height:14,background:activo?"#00000055":G.rojo,borderRadius:7,fontSize:9,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{alertaTotal}</span>}
      </button>
      {open&&pos&&createPortal(
        <div ref={menuRef} style={{position:"fixed",top:pos.top,left:pos.left,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,minWidth:180,zIndex:500,overflow:"hidden",boxShadow:"0 8px 24px #00000055"}}>
          {items.map(t=>(
            <button key={t.id} onClick={()=>{onSelect(t.id);setOpen(false);}}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,width:"100%",textAlign:"left",background:modulo===t.id?G.borde:"transparent",color:modulo===t.id?G.texto:G.textoSec,border:"none",padding:"9px 12px",fontSize:12,fontWeight:modulo===t.id?600:400,cursor:"pointer"}}>
              {t.label}
              {t.alerta>0&&<span style={{minWidth:14,height:14,background:G.rojo,borderRadius:7,fontSize:9,fontWeight:700,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px"}}>{t.alerta}</span>}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

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
  const [modo,setModo]=useState("login"); // login | recuperar
  const [localSel,setLocalSel]=useState(localStorage.getItem("pensok_local")||"pilar");

  function cambiarLocal(key){
    setLocalSel(key);
    localStorage.setItem("pensok_local",key);
    // Recargar la página para reinicializar el cliente de Supabase con la nueva base
    window.location.reload();
  }

  async function handleSubmit(){
    setLoading(true);setError("");
    if(modo==="login"){
      const{error:e}=await supabase.auth.signInWithPassword({email,password:pass});
      if(e)setError("Email o contrasena incorrectos");
      else onLogin();
    } else if(modo==="recuperar"){
      const{error:e}=await supabase.auth.resetPasswordForEmail(email,{
        redirectTo:window.location.origin
      });
      if(e)setError(e.message);
      else{
        setModo("login");
        setError("Te enviamos un email con instrucciones para recuperar tu contrasena.");
      }
    }
    setLoading(false);
  }

  return(
    <div style={{minHeight:"100vh",background:G.fondo,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:380}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{marginBottom:16,display:"inline-block"}}>
            <img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAQABAADASIAAhEBAxEB/8QAGwABAQADAQEBAAAAAAAAAAAAAAEEBQYDAgf/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAC1Q78rAAAAABAAAAAAAUEABQQAAAAFABAAUAAEABQAQFAAAAAABAAUEAABQAAAAQAAFBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCoKAAAAAhaAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQACABYKACBAWoKCWCpQESwAAWVQCUELABFhalBBYSpQAFABAAUAAEAAAAAAAAAJQAAAAAAAQAAAqVUAEqFqUEKgssAQAChRAEAAqVYAEBQQAAAFBAAAUAEBQQUEAAAAAAAKgqCoAKlEABYLAAAqUAAAAJQBLAAAAAAAACoUEBbLAEUVABAAAAAAAAAUUgAQAFABAAAAKgsoiwAKIAAAAAFBABSLAAAAAABYKgoUQWVAAAEsUEAAAAAAAAABalIAEBQAQAAAAAFoEAEAFWKIoiiLAEAAoAAEsAAAAAFgAAWCyiAKIAAAAABZVSiAqCpQEQUEBQQAAAAFBAAAUEBQQAAAAAAAAFBAAKFBBFABAAAKAABKWKIEAAAAWVQSUAJYKCAAsoiwAAoAWBAAWoAAAAAAQAAFBAAAAAAAAAAAAAAUAAABYAAQAAAAABYKAACLFBAAAAAAAAAAAFgAAUAAEpYEAAAABQAAQAAAAAAAAAAAAAFABAUAAAEBQAQAAAFBAAAKgsFWCwQAAAAAAAAAAAAAACpSBagBAAAAAClgAQAFBAAAAACiAKIAAAAFBAUEAAAAAAABQQFABAAAAAAAAAAAAAAAAAAAAAFgAAABQQAACwUEABQQAAAABYKgAAAAAAAMnYy6V1OZm8Zk9ml5P26ZLzv3vxoPnoRzfl1I4/w7hZwM7vDrkHQ67WdesoEAABQQAAAAAAAAAAAAAAFBAAAABSAAAAAAAAAABQAQAAAAAAAAAAAbNdZkdLsca0G2yWNWY+tN05XC1ns8XkFdP5c4s3/wAaMbv60Sug9ObR1mRxdjvLweXL2Lndjm52s2tl5PXd747zw7f6XefIUCAAAAAAoIAAAAKRRFgAAAAAAAAAAAAAAAAAACgAgAKCAAAAAADLXE2W82HPWJlsTGsvy5zVbz0OoxG8rFgAAAAAAAAH3tNQXrthwOVjXa/Go3HPWk0Pd+WpwrdabpiCwAAFABAAAAAFlAAEsAAAAAAAUAAEAAAABQAQAAAAFABAAAAF9uqmtdvbOW7j6jRazs9XHTIIAAAAABleGz9vO0dzsHsStIAAABkY5en2/A5uNdjhXN564rG7vm+mNONwAAAEAAAAFJQAASwAAAAAAABSwBAAAAUAAEAAAAAAAAAAZ/v0+N+fq0/PWby+N89cBrIAAAAApFgKbn7PAuNkjRza6r2PrLweo1rmHdazN5dstdvMCAAXf8+l768h1PLprea7zA1OQenn0wACAAAAFgAAAAAAAAAAAAosACAAAAoAICgAgAAAAAADdOkxsnLY176Q68woEAACl+snDD9M/wBObB9cpznl9/dwVc2iKBrtj87aP38Htve3V7Th0eHuOc0/d+O5w7cafpgEAZGOXs8vher5b++R7rEOMenn1wAACACiAAAAAAAAAAAABQCKACAAAAAAAAKCUQAAADa4/X419S8tjc1Z25ggAAC3Lyx8r0vGUc1spRFssWyxQtEAajwysX3Nn1HC/TXduY3fPeYJWFmk4rG7zmeuNSNZAffwXr8/hOw5b8+S7zU1y46YBAAAAAAAAAAAAAAAAKBLFBAUEAAAAAAAqVUAEAAevl1cuZ7tXx6YmgO3MLAABSe/368pfr5+uUt+bFspRLbPqFyMm3X3becut+8rxieZmAavF9fL3A0WDadFxP1nXeOf3/PdEuj57vdNvHNLOmAHv4F7j24/r+O+d0ne8buYg3kEAAAAAAAAAAAABQCgESlgQAAAApYoiiABAUAEAHsuy6bz9OPTw43M1/TEGsgAD6GS++OaMLZYtli1sl12XufS7wsvE1q7bAwmc+klxKWAHn6a3bEle1AAAMzDL2uTwvV8t54zrS8333O7xox0wA3uisve4nzm8enBTe6LtzCwAAAAAAAAAAAAFWUBAEFBAAAAKhQAAQAAAAFdNo+zxq6jacVm+UOvMAAC5U++OVlwoLZmxi7PZe16fH38ae62OpxrzxaZzaLbLFsRbIeen9PP2BOgAAAKfXzTq9lwfWcumwGNcjr+44vrz8xrIGX2XBdJje44nuNNm80OuAQAAAAAAAAAAAFABKCLFBAAAAAAAAAAFlIsBkL0G2fHDppOf9PPtzCwAB7+eTzlHPKyw+vromsXaF7MTE1Ux7ecuMWyxbKWxFsstPhPvVfPl6qh1AAACjqvna8983pu952tH6+Tpntcni+y47+tPuGbwLMw+/MEevkXu/rSb3j04jH6PnOvMLAAAAAAAAAAAAAAKFQAQAAAAAAAAABYLAdDoO3xr10e84rOseHXmAAr1j0+jhgC5M6Zv59UvVpPPDzzpc4WWW2D6SxbLFvzh1ka34eqoboIAAA6bH6DnsMbeXrprOaHbk3WlL3zCzeHTXcl33G9M4Y3kE9+34Hqsb2PDd5y8akdMggAAAAAAAAAAAALUAAIAAACgAgAAAAAGx63T7jl0wOR3Om3mDWQBRlePvyyHOMjy6i6+/QvaaH612edssxbLCywqivmX788PH7X08juAAAAAffwXufXkeu49AlYGeTgXQ6Htz+G7xD57DgerzrZ6fcfHPXCPr578wRs9Z9L3muz7w6cE+/jvzBAAAAAAAAAAAAUAAAAAEAAAFWLEAAAAGSvX+zE4dOT8DvzBAFn0ZH1Z58LNqufnF7tRk89MLmZ0xpvro8hrnPfeLrUemzLrvn453WcvA+XXIUAAAAAAA6LnfuXu3j7cegKAxsknAZ/1ru/Pv2LlcOnKazo+c7YC5A6racz0/Hpymr6Tm+uQsBAUEAAAAAAABQQFAoEsAAQAAAAAAAABuNP0mdbrTbnmMa1A68wAHt45OZ9jhn26rA2N7Bd4Gb9JBLaxca42bTeWpueYnjvGI9PPVCAAAAAUAEAA3XScJ3HPf2MbAA1XLd3wvTnvOh4rts6wuN73gtQN4Ayu14DvOe8bjO94OoN4AAAAAAAABQAAQFAABAAAAAAAAAAAL1vI9tjeRx3Y8LHmOmAAGZi5fPLMdDz16C9jz1VxuMDSfPXlnYUdOZFlQJfBceWc+wAAAqpYAgAAADqOX2+ddOOXQAc/ZveJeXTDt+I6eNxw3c8VLijpgB2XG9TjW24rtOSl1w6YAAAAAAAAAAAAAoIFAABAAAAFlUCBAAHecL3nPc4LuOHoN4AA9N3hdZy1Kxc7ydPrPPtx9InXiAAAAxMvBm5LMdAAAFgsAAAAABk41XvRw6gjhu55DecAdMN5o9lL1vGdnxeNYg6YAdHzm+zroeY6fnMa0Y68wAAAAAAAAAABQCBQAQAAAAAACwUEAA9O74buee8Xi+y42oN4ACt50XP+nLeRoPl24/Xr8/WsAgAFudiHlZRr8/Az0gzsAAAAAAAAABLDu/Ty9eHUFcv1Gk1nnB15szDyF7fiO34HnqDpgBu9JuprpNBv9Dz1z468wAAAAAAAAAAAABVgAQAAAAAAAAAAD27ng+857xOM7biKDeAArI+vH21gLn2WMgAMry2UjX7DDTEst01+wwZv4GOgAAAAAAAAAA9F7j6OHUAD40u911zyft45HbHXcR1XLYsG8gN3pN7NdDod/zvPWiHXmAAAAABZYAAACrAgCyrFCUQIAAAAAAAAABe94HuMb++E77gz5G8ALLX17eHvrD6+fq59QyAsyzI9DOXj7Q1NTWri5XmuEOfcAEAAAAAAFIomfg72XoBx6gANTttDc8/nYO07Y99LkY8RZYA6Lnepzrbcz03J41rB15gAAAAAAAAAVKARQAAgoIAAAAAAAsolgA7Dj+nzrccV2nK51qx05gLKMjH99Z+rGsewZA+tnjZUgSLBhY2z1uqC4fnm4WesVncWAIAAAA+/jp5czzz3Hpotd1zU4Pssj6AzoA8PBM7lui4/efHY6726Z8QiUQF7Dj+7xv74vs+Dj5HTAFlgAAAAAAAABUoItCAQKACAAAAAALAAA3mjzpew0W9wOXTkB25AAX087ZkI3z9r8fbKz3M6mcgAXXbDGrDhdPL1GAysbHaSpqBAABSPro5fDoHjy6ezj7qde0GzzcwSgCHJ6/08u/KiwIJQCAye25jp+XTF4rpuZ3kNZAoIsAAAAAAAAAWggFgBAAAAAAAAAAAH18l7y67ZcOnB/Oz1nfmCAAZF8vXpzvt4erP1mYeczkDMAAfH2rUqupQfH2ML42HxneEyPOb859l+Wbn5uj2XQ5WNY2VrtFLuua8p0wFgGVuecS9398Lu8b374+8a8eb6pZwTpub68/gWAVKCnT7Xz9OHXmNR6+XbmFgFSiAAAAAAAACgWAAACWUQAAAAAAAAAAG46fhe459NVy/ecNZ8DeAFgvv4ems+n18tYyMvAyGNiM5BQR8feNbiKaiiKrFuThZ3sMznbnp1vtxkzrsMXmhuNb4yyossAAoiiWD36PlU13zmOl5b+ud3vE6nwOnMBQbHXdRnW1wc7mue9MO3IAAFBAAAAAAAAUAAEAAqUiwAAFVKIEAAAAAdVyuwzrr+Z6bF574pZ25ggCwZF8fbpze3jWdhmaj3Z2DH+5PV4+BkYfn9W0SxSxRKJiY+z8J0w59TO4ogABQAABKEqpmYv0my1Nk0CAUHr2+i33Lp88P0PN6zBvIAAAKCAAAoAIAClgCAACgAEAAsoABFiggAAAHZ5nKdXx6crqu24rpmDWQAL6eash8/W+V9PImQ8vRKEUPq/H1KUsUSgBMXMS6ubPwm8J7eTUKBAABfWvFm/bON9vjWXjfmbgzQAL6efQS7r7arj00OKd+aCAAAAAAACqlECAAtgAigBKAAECgiygACWKCAAAAOw4/Mzrs+b6P4574R7+HbmCAVKX18bZ7pd81g9fvwqe74+2QPr687L9lliiKIoihLTw+ckuIyy4n1k1Mf0+/E9vPG+a+/gp5PjO0M6AAWWsjs8DY8ek4vcc/qIbwAoJRFgAAAAsFQAAAAAUAALAAgKCVBQAQKACAAAAdJu+D7Ll08OS73n7NCOmAAFgvt4WzIfH3vmAsHr945Mlj/ae314/R7Xx+pfRPrKKWKD5+a9Hh8GVMKVk+XmAqAeU+c7EzoAABusDsca+sfI5HGsL5O2EsQCgASwAAAAABQQABQSglUEIAAAAAAAAAAAAAAGbhF728103HpyOu7vjumMUayAAA9PO173w9NY+xcgAAALBUFAQVBUFQWTzl+/KM7CWAAFJ6/HWy+2S13Hph89Z25hYKSgAAlgAAAAACggALQgAKCQAAKCAAAAFgAAAAAAA6PnEvfeOv2/HpxON2/JdcYo1kACoKC+nksyHh9az6vn6uQAAAAAAD4+JfXz+E2GaABAAPp1MrZvDj0+OQ+/DriLNZAoBACglBKIsAAAAAACxahAKACAAAAAFJQAASiLAAAAAAC9Ry1l77y1e549OPwe85rpjTjeQAAFgqC2K+vrzJ6/Xgs97jjIY4954j1nml+vkUISgQqAAUnp7dXnXhsGLy398j8+PXAayAlhUAAFAAIVBUpFgAAAAKQAFABAFiggAFSgBCgiwVAAAAAAACt9oUd9eS6jl01vNd5j2cQ2Wt64BAAAAAAKgqCoFgoACCwAC+64+42ez56+Pto86zeV851wFyAsAAAAFAIWAABUoBFgAAspAoJQJRLKIKCALKsCAAAAAAAAAAAAAPfwL1uy4Db89dPrM72xricfvdP0zzLJxt5BAAAAAAAAKABKIv0fH1ud7nWk3/ANOe74aznrM7WnXAAIAAAAKRQAlEAAAsoAAQAAACqCAARYoIAAAAACggAAAAAAAAAAH3vefS9598Luue9/rs30zeU13e+e88I6nW6moe3jqAgAAApFUPqPlsNjNc9l9Tk4ul2/2zqtXorOg53DbyGsgAAAAAAUAAACUQAoBAAAAAAqiAAoIligAAAAAgAKCAAAoIAAAAAAAB9bTUl63Y8D6413Tl9jm7fw+cnN1mLvZXOePUrOS+evHIXr5XKe3TI5/J2yMXKfEvpNfrq6HH5TE1noNPjt5CwFBAAAABSLFBFlAAAAEsAKCAABSiKJQEKEAEUAAUgFlAIAUlBKSKIAAAAAFBAAAAAAAHr5DYZOmS9B7cyl6r65Mdb88oOo8ucG9xtWsyceKBAAAAUAEAAAAoIsVRABAAAAUAABQQAAQsFoQFAlBKIUgAFgAWBYKEAAgAAAAAAAAAAAAAAAAUEAAAAAAABQAQAAAFoRABaESlikgAAKAAAQqCoLAAoAUAEAEUAAAAEBQAAQAAAAAAAAoiiKIogAAAAAAAAAAAAAAAAAAClBEolAACAAAAWUIAAAAAAKAFABEFABAWgQAQAFBAAAPXOnW43ybq2byrqhxuJ3uNZxTNwumfbN+uqxrk3Vs3lHVjlHVjhPRm9MfPx17G+Cm21PTAJ75n31GN8lr+14mxXT2aHP6ac9895dNTjMTvtbqcks3g9unmudzennPXO+HUjhvPu9FrOgWbz9bHB7rOuT13ecQeA1ln5vRY3ynx1fJGEN4AAAgAAAAAAAAAAAAKAABLFAAAAABAAAAAAANj13I9dy6fOk3PC10H1zs1ntcnhu4xr44ju+Ts++q5bqJfjT7TibOhnPNTopzw9NhrNnZ1Q49fnkOx8bnh3v4dsbbqOX6jlvw4jt+J1ncdLp9xnXzpMvk7Nx76Budlq9DYnp576zbZT449PrWaHD6Z6LN5CWfoDmem570nN99xm8+Pc8N3MOI7fiTH3TpKfN5PGmuO3MEAWAAAAAAAAAAAAABYKAAAFgAAAAQApYoiiKIsAQDY9dyXW8unxwneaCzRN99ami7nFy8acr0/E2bHqOX6iXz0PRJeddEs53A7Hn7NDtNXtN56r4+/Dj0+vXj+usxeQ7vWVquo5jpzw4ntuI1N30fB9HG5wM9jXPYHYNTg/nuOa3nWdlxvcy+uj3nNZumHXmA7XiusxrZaHfabGuf7nhu51Gh3zOgl5XV7HXduQWAAAAKEUQABQAAAlEAAABQoIAAgoAIKsUSgCAAAIAAGy63kut5dI+eal6dzCzp/LlcKzYa06Z23Ucv1PLflznQcTZtpqpvO2xMRTaavaR1Xh7+HHpw+31Lvz75z/QcemLlEePD9vxHTB9/e5NjqadJs+I9MXuZXPfE9Xz2d0zvtJu/jGuEZmH25gjtdJ0nPbQb/AI2Xw7nhu6shzudbbM4LsLMnje2xTi338dcAgApKAACURYVBQAAAJSwAAFCAAAQKCALC0IAAAAQAUEBsut5LreXT44PvOD1A3gADa9Vy3U8unnp94l0c3pNG3g4nL8/TpnqvH28eW+HHfm6nlvqO8uDncenhw/ccP0zvOg0O+zdZhdGjmtjswk5pdf8AHw7c+1yOI6blvYa3Zs3SZ2baj50R7c1Z15+vdcN3ONOH7jhzwyMd0z3Ptx/Xcd63lO/5/U0BemYollQACWUAAiiUCUAAAixRSKJRAAEpYAEBQFlAQACLAAAAU9MzXlz9fQCRRFHrl68uwa6xsGvGwa8el8lbD5wUBZKHrma4ufr7B9/A2WTpLG8x9XD08ylhKgys7T2XdeGrHr5FLKl2GuLsdfIAjNwquwmvsWFgAAAAAAAAAAAAECqAIABLBUoCxQABKAIAACxRFJAoIABUoAAlEWCygEABQARQlEWBRAAAAAALKAAJRFEUSgAAAAAAAAAAAAAAAAAABKAAAAKCAAAAoICggKABFEogAAAAAAAAAAAAACUSygAEURQAAAAAAAAAAAAAIUAAAAAAAAAKCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASgAAAAAAAAAAAAAAAABFgBQAAAAAAAAAAAAAAAAAAAAAAAAEoAAAAAAAILKAAAAAAAEFQUCWKBUqAAAAAAAAAAAAAAJRALKAAAAAAAAAAAAAAAAAAAAAAAARQSgAAAAhUFgAVKAAAAAAJYAUAEWCygAAABBUoAAAAAAAAAlEUAAAAAAAAAAAAAAAAAAAAAAAAAIAoAAAlEAAAAsoAABFAEAAsoABKAAACUQCwUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAoAAAAJRAAAAUAAACWApFEoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARQAAAAAAlEAAAsFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFEAUSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACggKCAAAAAAAAAAACCwtSoCgAAgKCAAAoAIQUAAAAKACAoAIAACkJQAAAAAoAICgAgAH/9oADAMBAAIAAwAAACH54576oP8A/wD/AP8ArCDTy37z/wD8ks8wgggw9vvysgksllv/AP7/AP8A/uoksv8A+tKMMMP/AP8A4/6wwwwwwwwwwwwwwwwwwwwwwwwwwwxzwwwwwzggwwwwwwwwwwwwwwwwwwwwww9/w/wwwwwwwwwwwwwggjvrggv/AI4K4oNf/wDqCKGe/uKGvLDCCDDCCCDDDDDDDDDDLDD/AAwwwx//AP8AKe/OKGOW/wD/AMIb/wD/ACvv/v8A/wD/APv/AP8A++/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APywwwwyw1//AP8A/wD/AP8A/O/+W/ie/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPCGrDDDW//wD/AP8A/wD/AP8A/wDivv8A77//AP8A/wD/AOCe/wD+ssstv/8A8MMNf/8A/wD/AO//APvT/wA//wD/AP8A/wCpL44oN7/7/wD/AP8A/wC//wD/AL/7/wD/AP8A/wD/AP8A/wC//wDwgxvv/wD/APDDDSy//wD/AP8AqDjDvD//AE9//wAML/8A+O++u++//wD/AL//AP8A/wD/AP8A/wD/AP8A/wD/AC+yy+u+/wD/AP8A/wD/AO8MMPb/AP8A/wD/AP8A/wD/AP8A/wC//wDjDDS//wD/AP8A+++//wD/AP8A/wD/AP8A/wD/AP8A/wDvv/ggggwvv/8A/wD+/wD/AP8APeuf/wD/AP8A/wD/AP8A/wD/AP8A/wD/AMv47/8A/wD/AP8Ay+//APv/AP8A/wD/APP/AD//AP8A+LPIe88N/wD/AP8ALPb7/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wB7/wD6/wD/AP8A/wD7z/8A/wD/AP8AsMMef7204F6UoMMPL/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+/8A/wD/AP8A/wD/AP8A/wCG/wD/AP8A/wD/AP8A/wD+9+OLEPQrjrPm/wDvf+sINf8A/wD/AP7/AP8A/wD/ALz3/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AL7/AP8Av/8A/wD/AP8A9r9+3Gf/AP8A43//AP8AzEYfWzf/AP6lv/8A/wD/AP6ww1//AP8A/wD/AP777/8A/wD/AP77/wD/AP8A8pb/AP8A4w8GLbL3/wD/APjXdrT/APw8/jOx7lvvv/8A/wD/AO4ww1//AP8A/wD/AP8A+2//AP8A/r77/wD/AP8A/wD/AP8A/sN7u7//AP8A/wD9vd/VMuSaA8MMMKhL7/8A/wD/APf/AP8A/wD/AP8A/wD/AP8A/wCL7/8A/wD/AL7/AO+//wD/AP8A/wDz1IK0v/8A/wBrq3TSXBJK/wDbLTwxtumvvv8A/t//AP8A/wD/AP8A/wD/AP8A/wAMb7//AP8A/wD/AP8A/wCNP/8A/wA9xCA3y96gFoFf61FfV4evL8bwwuqDv/8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AA1v/v8A/wD/AP8A/wD/ACnv/wD8398d/wD/AJyT6VOlbqE/X/76sPD5w0t0tv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A68D/AP8A/tlTzM9cJUBB31P8sNLLzu8MPc//AP8A/wD/AP8A/wD/AP8A/wD/AOqDDe//AP8A/wDO++//AP8A/wD+Eyf/AM956lM91TtxCBqkx/8A8+1nSz2Nfh77/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r3+zX//AP70a7yrSAwR+lSX/wD/AP8A5aLGewE9sH//AP8A/wD/AP8A/wD/AP8A/wD/AP8ACe//AP8A/wD/AP8A/wD/AP7384n/AP8Aj9xYZ5R6Ed/rxe//AP8AvuAQtT9j5Ox37/8A/wD/AP8A/wD/AP8A/wD/API77/8A/wD/AI7/AP8A/wD/AP8A9Yv/APv+s12ekO/HKj3/AP8A/wD/AOyInrTQvKDA3S//AP8A/wD/AP8A/wD/AP8A/wCO++++/wD/AP8A63//AP8A/wCPe/8A71bNJTSzDBzf/wD/AP8A/wD/APD1Ag9918LTb0+/+/8A/wD/AP8A/wD/AO/++CW+/wD/AP8A/wD/AP8Ar/qtz/8A/fyrLvP/AKu3/wD/AP8A/wC+/wD/APEgDR9LQMMtj/8A/wD/AP8A/wD/AP777/777/8A/wD/AP8A/wD/AP8A/wDzrw3/AP0DzdpI46zf/wD/AOlv/wD/AP8A+rBHJjxww5zT/wD/AP8A/wD/AP8A/wD/AP8A/wAP777/AP8A/wD+oL//AP3Ur/8A+OkpfutvvF//AP8Avf8A/wD/AP8A+tPec7UQwxgf/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97//ALjKvz9WOe+iCArK/wD/AP8A/wD/AP8A/wD/AP8A189HoHDD49//AP8A/wD/AP8A/wD/AP8A/wD/AOvv/wD/AP8A/wD/AP8A/wD88ub/AP8Aaht7x0/axf8A/wD/AP8A/wD/AP8A/wDqcAQHGj/Dslv/AP8A/wD/AP1//wD/AK//AKskv/8A/wD/AP8A/wD/AP8A+xz/APp8+/7EiGvVue//AP8A/wD/AP8AvOGAABO0Pf8A8S//AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX/xIj/ryWKDc+uxCFy2//wD/AP8A/f8A5QDL+xA0/wBAPf8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO//ALHqD/8A1zrjvutjXrq0v/8A/vvjjjyziwEMsP8AiV3/AA9//wD/AP8A/wD/AP8Agvrv/wD/AP8A/wD/AP8A/wD/APGHA/8A/wBnbjIILjKYqMZF+eUX/wDNQ8uL/wDyw2w1/wAt/wD/AP8A/wD/AP8A757779P/AP8A/wD/AP8A/wD/APfAC/8A78Tixwg0G88Z+NMRz3/8873MLP8A+Na7/wD/APv/AP8A/wD/AP8A/wDvvv8A/wDL3/8A+kv/AP8A/wD/AOoLb/8A/trYMEpP+6vMTz//AOwww00f1P8A8O7v/wD/AP8A7/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wD7D1//AP1E33v47/PLDAiseQwwxDzQP/8A8MsB/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD/AOP5z7/8tLb7YN897/331mWwmS6op/8A/pdKf/jT3/8A/wD+8/8A/wD/AP8ADDC+/wDvzww/vv8A/wDv/Gr/AP8A+/8A3++P74kT+6IMoyC6BH//AP794l/ww1//AP8A/wD/AL//APjTKDP/AP8A/wD/AP8A/wD/AP8A/wD/APwANf8A/wD/AKItvvvvrvgjjjjmgw//APuH/wD/AO4ww1//AP8A/wD/AL//AODDCD//APv/AP8A/wD9/wD/AP8A/wD88ftv/wD/ADw85vvvttvvuv0Iww//AOPuLf8ADH/DjT3/AP8A/wD/AP8AY/8ADD//AP8A/wD7jDDT3/8A/wD/APvRDf8A/wD/APvPBzhiiBCBDTHP/wC8u+gw1z//AMMMc8vf/wD/AP8Av/8ADD/2/wD/AMsM7+8//wD/AP8A/wD+HiWg/wD/AP8A/wD/AM88+8MM9/8Ayv4U/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A/wA8auOaJ/8A/wD/AP8A/wD/AMMNPf2haj7/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/AP8A/wD/AP8A/wD+9xh4div/AP8A/wC8QzBzCXv/AP8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A/v8A/wD/AP8A/wD/AIwCAW5jvhIvz1oz+/v/AP8A/wD+9v6wwww1/wAP/wD+yyiGDDG++6+qC+6iTz//AP8A/wD+/wD/AP8ALX/zDPudN+di/vP/AOtv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AP8A/wDPP/7yDDDDf/8A/wCZ7/8A/wD/AIN/4NLP/wD/AAwwxzz3/wAMIIMMb7777/777/8A/wD/AP8A/wD/APPPPP8A/wD/AP8A/wDz3/8A+8//AP8A/wD/APyDTjDD/wD/AP8ArP8A/wD/AP8A/wAMIIN77/4J7/8A+/8A/wDvL46uCh776Pxz9Q6fbkTfRZ6vNlnfzgMMMP8A/wD/AP8A/wD/AP8A/wD/AP8ADDDW+++++/8A/wD/AP8A/wCurib02aFI4fy+ZZP2dS2/0QUiz3vTbz/+/wD/AP8A/wD/AP8A/wD/AP8A/wDvDDDC++++/wD8ssstv64jQpYdmDW86d7lps93l+Oawy7/APgiP/8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AKwuMr+Eg17a/wCDx18IjeUbwgO3tGj5n7//ALjDDT3PDDDDS+++DDDD+/8A7gwwwwz/AMO8JD/8+IBNO6kY2tLHO/DJq+jz+sO4fPrKsMOsMPOMsMMPbrKMMNL7/wC+qDDD3/8A/wDvDAPPPAvMNLMOMBS7kX68+v16uBT+jsMMMMMMMMMMMMMP6IMMO8sLIIKIMMMLLP7/AP8Ayww096w//wAMPNPfP/8A/wD/AP8ArDDTzzjDDDDDDDDDDDDDDDDDDDjDDDCDDDDCDCDCCCyjDDDDDDDDDDDDDDTrDDzzDDDDDDDDDDDDDHDDDDDDDDDCDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDjDDDDDDDDDDDDDDDDD3/DDDDDDDDDDDDDDDDDDDDDDDDDLDDDDDDDHrDDDDDDDPPDW+LDDDDDDDDDDDDDDT/rDDDDDDDDDDDDDDDDDDDDDDDDzLDDDDHPf/LDDDDDDX/DD3rDDDDPLDDDDDDDDDTzDDDDDDDDDDDDDDDDDDDDDDDDDf7DDDT/AP8A/wDrDDDzD/8A6ww4www0/wC8MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMP+MMMMNP/AP8A/wAMMMNfvOMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMPMMMMMMNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwzwwwwwwwwwwwwwwwwwwwwwwwww8/84wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0/wB/8MMMMMIMIMMMMMMMMMMMMe4sIIIMIMMMIIM8MMMMIIMIIMMMI8MMMMMIIMIIMP8A/9oADAMBAAIAAwAAABDxjCABT3HFHHFXzHUxnV3HGyT33zzT31jCHQzCAyijHHDHHHARzwzHFWR2Ff8AT/vd9X3/AOww0/8AuMMMMEMMMMPMMMMMMPMMc8MPPMM4AMNOMPPPPfPMMMMNesMMMOPduP8AjrDDDDDDDDDDDAACM8sAC/8ADALCg1//AOoIoZ7+4gS8sMIIMMIIAMMMMMMMMMMtPNPMMMMf/wB/Ic/MIFMU/wD/AMAb/wD/ACPv/v8A/wD/APv/AP8A+c/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APyw0wwyw1//AP8A/wD/AP8A/M/+U/gc/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPAGrDDDW//wD/AP8A/wD/AP8A/wDifv7Pv/8A/wD/AP8A4Bz/AP6www2//wDwww1//wD/AP8A7/8A+9P/AD//AP8A/wD/AKEvjig3v+P/AP8A/wD/AD//AP8Av/v/AP8A/wD/AP8A/wD/AL//APADG+//AP8A8MMNLL//AP8A/wCoOMO8P/8AT3//AAwv/wD477xFTz//AP8AP/8A/wD/AP8A/wD/AP8A/wD/AP3sLDsrvv8A/wD/AP8A/wDvDDD2/wD/AP8A/wD/AP8A/wD/AP8Av/8A4ww0v/8A/wD/APvPv/8A/wD/AP8A/wD/AP8A/wD/AP6gv6vvvv8A5L//AP8A0v8A/wD/AD3rn/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDL8O//AP8A/wD/AMPv/wB7/wD/AP8A/wDz/wA//wD/APePu7f7/j3j7OPay3//AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wBz/wD2/wD/AP8A/wD7z/8A/wD/AP77xuzTXHPQ2H/v/wD97f8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+3//AP8A/wD/AP8A/wD6un//AP8A/wD/AP8A/wD52/z3neULfpDS8eXjRXv6/wD/AL72/wD/AP8A/wC89/8A/wD/AP8A/wD/AH//AP8A/wD/AP8A/wD7lv8A/L//AP8A+8/7Amt36/8A/N+N/wD7PppCiGv73Wu//wD/AP8A/rDDX/8A/wD/AP8A/vvv/wD/AP8A6lv/AP8A/v2+/wD63/2DYbU53/8AN+9adP8AP/fkfivSque//wD/AP8A7jDDX/8A/wD/AP8A/wD7b/8A/wD7lvv/AP8A/wDz3/8A+e9j7P8A/wD/AP8AvrHlqUBwibz/AO1pCJNv/wD/AP8A9/8A/wD/AP8A/wD/AP8A/wD/AIvv/wD/APuW/wDvv/8A/wD/AP696Ttrt/8A/wBuoRbS+e0uWvqczLgJJky2/wD+3/8A/wD/AP8A/wD/AP8A/wDrDG+//wD/AP8A/wD/AP8AjT//AOz3/tf4926T9GdoV9avn9tPLcW28k6On/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDvDW/+/wD/AP8A/wD/AP8AKe//AK94qu5/+SKDcdrYE8DVv/6weaFky1E9mv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A4ag//wD/AEtXsy4NPRLuQ7P/AH/c/Mqb/auy/wD/AP8A/wD/AP8A/wD/AP8A/wDqgw3v/wD/AP8Azvvv/wD/AP8A6p/X/wD9/vxK1viKaZaUR8f+/d3lyxJ+vsn7/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r38yW/vPGhja2LXOilsFYf/AP8A/uvPT3769jlH/wD/AP8A/wD/AP8A/wD/AP8A/wD/AAnv/wD/AP8A/wD/AP8A/wD+9+fN/wD/AImyQ3ZUbpWuSSHv/wD/AH0cp3V9tivCf+//AP8A/wD/AP8A/wD/AP8A/wDuM+//AP8A+rL/AP8A/wD/AP8A1kf/APs1Y/nDSDuker3/AP8A/wD+iDQl8+Wrb/8Aiu3/AP8A/wD/AP8A/wD/AP8A+7r7/wC+/wD/AP8A63//AO9/OHP/AOmcEkYfE2zm/wD/AP8A/wD/AP67D/DBzPxN72xGv9v/AP8A/wD/AP8A/wDv6vglvv8A/wD/AP8A/wD/AH16vD8/7dpUJ+J/F3H/AP8A/wD/AL7/APfV08YrTW/LMWj/AH//AP8A/wD/AP777+777/8A/wD/AP8A/wD/AP8A/wB1Pf5/4S3O88zS3/8A/wD/AOlv/wD/AP8A+mOITR0f/wBs3P8A/wD/AP8A/wD/AP8A/wD/AP8AD+++/wD/AP8A/qC//wDzg1//ANb2Mbvds/tf/wD/AL3/AP8A/wD/AODxWf8A7T//AK1v/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97/+ekBM+Fi1Sl/MKhL/AP8A/wD/AP8A/wD/AP8Az90Ju69P/wADnv8A/wD/AP8A/wD/AP8A/wD/AP8A6+//AP8A/wD/AP8A/wD/AP8AMgz8+1AVRjroOBHvf/8A/wD/AP8A/wD/AOgjyytBsv8AUx7/AP8A/wD/AP1//wD/AK/vqyS//wD/AP8A/wD/AP8A/wD0ae/6f7sJO99rlEtv/wD/AP8A/wD/ADzzc8878C3v7Bj/AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX78Iffr/AB89rv7mAqOtv/8A/wD/ANXvOvNHnX30/wAJw/8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO/++3j/AP8A1z84H5yjnvWEv/8A/sUOTqRzwdGMsP8Aq5f/AA9//wD/AP8A/wD/AP8AgPrv/wD/AP8A/wD/AP8A/wD+uoZVf/8AM/POzSg0oRj9QNmCXvfvQ8EN/wDyx/nr/wAt/wD/AP8A/wD/AP8A75z779P/AP8A/wD/AP8A/wD++eRT/wDvbjl7Kf8AbzzEYRcNj3/887yutP8A+NLg9/8A+/8A/wD/AP8A/wD/AO++3/8Ay9//APpL/wD/AP8A/wDmEW//AL8J6MPtacNJb08//wDsMMNNG1X/APHXJ/8A/wD87/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wDHDS//AP0rF7xwwscYVUn9ORzy9eXqv/8A9R6J/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD+31lmP/y137sj5Jqcc8lquLKUzFMX/wD+15B/+NPf/wD/AP7z/wD/AP8A/wAMML7/AO/PDD++/wD733wif/8A+/ojP5zhXys30Vqj6Lyof/8A/r7AX/DDX/8A/wD/AP8Av/8A+NMoM/8A/wD/AP8A/wD/AP8A/wD/AP8Arrzt/wD/AP8ArwW/xd98sAMNNMbJD/8A+74lv+4ww1//AP8A/wD/AL//AODDCD//AKv/AP8A/wD9/wD/AP8A/wC/u3Lz/wD/AD80lCdKWefePcAMww//AOl4Pf8ADH/DjT3/AP8A/wD/AP8AY/sMP/8A/wD/APuMMNPf/wD/AP8A/s9of/vf+8+HCLAzqNANMc//ALvCZjDXP/8Awwxzy9//AP8A/wC//wAMP/b/AP8Aywzv7z//AP8A/wD/AOpmBNdfP/8A/wD/AM88+8MM9/8Ay+xs/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A7+6AMhHI/wDPf/8A/wD/AMMNPOa9rVb/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/APP/AP8A/wD8+9me7fvh/wD/AP8AvEcL5kze9/8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A7v8A/wD/AP8A+8t80sklT07SF/hT7Gdb/wD/AP8A/vb+sMMMNf8AD/8A/ssohgwxv/8Ar+gL7qJPP/8A/wD/AP7/AP8A796+z7xPfdTW7M2c3/uv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AD37/wD98cz/AP8A/wCf/wD7am//AP8A/wCDf+DSz/8A/wAMMMc89/8ADCCDDG++++/+++//AP8Atf8A/wC/8888/wD/APv/AD7+5/8A9Pd//wD/AP8A/INOMMP/AP8A/wCs/wD/AP8A/wD/AAwgg3vv/gHP/wD7/wD/AL8D33l2vvtiiF8/j7dmgdzlrf5waG4j4www/wD/AP8A/wD/AP8A/wD/AP8A7www1vvvvvv/AP8A/wD/AP8AXKIH6bFHfXh8bYd5VGeKmzy8BfXoRAP/AP7/AP8A/wD/AP8A/wD/AP8A/wD/AO8MMML/AP8Avv8A/LLLLb9eqXZ790YYoi9vt0xIR1A7xcMP/XWAVf8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AFyutQF0RhTGLNXfyck6+ULSix4G0ebnP/8AuMMNPc8MMMNL774MMMP7/wDuDDDDDP8Aw+y5f7f4cUw+r2p6RMAz4gHTKvZQQBB0esqww6ww84ywww9usIww0vv/AL6oMMPf/wD/AO4Uw884egsoAg44RnuxfLz2v/K49f6mn4wwwwwwwwwwww/ohww7ywsgAogwwwsM/v8A/wDLDDT3rD//AAw8098/f/8A/wD/AKww0884wwwwwwwwwwQwwwwwx7w4wwwwgwwwwgwgwAAMowwwwwwwwwwwwww06ww88wwwwwwwwwwwwwxwwwwwwwww3v8A8MMMMMMMMMMMMEMMMMMMMMMMMMMMMMMMMOMMMMMMMMMMMMMMMMMPf8MMMMMMcvNOMMMMMMMMMMMMMMMsMMMMMMMesMMMMMMM88Nb4sMMMMMMMMMMMMMNP+sMMMMNfcMMMMMMMMMNMMMMMMPMsMMMMc9/8sMMMMMNf8MPesMMMM8sMMMMMMMMNPMMMMMMMMMMMMMMMMMMMMMMMMMN/sMMNP8A/wD/AOsMMPMP/wDrDDjDDDT/ALwwwwwwwwwwwwwwwwwwxwwwwwwwwwwwwwwwww/4wwww0/8A/wD/AAwww1+84wwwwwwwwwwwwwwwwwwwwwwwwwwz/wD8MOMMMMMMMMMMMMMPMMMM8sNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww3/APP/APDDDDDDDDDDX/PDDDDDDzDDDz/zjDDDDDDDDDDDDDDPDDPLDDDDDDDDDDDDD/v3nP8A/wD8MMIMIMNP/wDDDDDDDDHuLCOKDCDDDCCDPDDDDCC/+CTzDCPDDDDD6CXqe/8A1//EADcRAAEDAgMGBQMEAQMFAAAAAAEAAgMEERIhMRATIDJBURQiMFBhBTNAQlJxgZEjkNFTcKGx4f/aAAgBAgEBPwDgt6Nlb0behb0LcdttvSt/swOmYzUp1awaC6NcegRrJCvFS914qXuhVyIVzuoTa1vUJtRG7Q+6Pe1gu4qStH6AnzvfqUyF7+UJtE86myFE3qUKSMdF4aLsvDRdkaSLsjRM6FOoj+kp1PI3UJsjmcpTK0jnCjmZJyn29zg0XKlrOjF5pD3Kjo3HN5smQRs0Hpvja/mCkohqwp8boz5goqtzcnZhRyNkF2n2yaobF/KkldIbuUVIXZvyCYxrBZo9B31aSKZzTm25VPVR1LcUZ4iARYqWjBzYvNG7sVBVB/lfkfaqiqw+VmqYx0rrBQ07Y89T6JNhcp7sRJUUz4Xh7DYqirG1bMQ1GoUz3xjE3RMrWHmFk17X8p4JImyCzlNA6I56KCqLfK/RA3zHs9TU28jFFC6U2CjjbGLN4pauKHJxzUv1b/pt/wAqT6jUO/Vb+E+eV2rj/lOJOqOyiqTTTB/Tr/CIDhboU9uBxagSDcKOscMn5pkjZBdp2kAixVRTGPzN0VPUGPyu0QN8x7LU1GAYG6qGIyusExgYMLeGeqjh1zPZT1skuV7D4RRRRRR2BUbsUDCewU1KJDiBsVJTvj1Gxri03aoKoP8AK7I7ddVU0+7OJuipZ8BwO09knlETb9U1rpXWGpUUYjbhHASBmVU1x5Yv8o5oooohCF7tAjTlvOQE7djQ3/pOI6IKkZggY09ANstKx+YyKkidGbO2U9TbyP2kAixU8Jid8KkmxDAdR7ESALlTSmR11TQ7ttzqeAkAXKqakynCNEUUUGF2ibTj9SdLHHk3VSVL3aZJ1zrt+n03iJg3oMz/ABwuaHCxU9MY/M3TZS1H6Hf1tljEjcJXmjd8hRSCRocPYayWwwBUsWN2I6DhqqjeHC3TYVYnRNi7p8jYwpJnP/hFFFFBpcbDVfTqPwsdjzHX/jjqafB5m6bKabeNsdRtrIrjGFSS4HYTofYCQ0XKe4yOv3UUe7YG8FZPhG7b/e0NugLKSa2TUbnMooooprC8hrRmvp300U/+pJzf+v8A7xVNTi8jNFTVV/I9EA5FVEO6dloo3ljg4Jrg4YhsIBFipWGNxaoJN4wH8+sfhbh7qkjxPxduCWQRsLinOLiSdgF1opJL5DYUUUVBSyVDsLB/wqOgjphcZu7/APHFVVF/I3ZEzG8N2SRiRuEpzS02KopNWHbWx3AeFRPs4tPX8+qfikPwqVmGO/fgrpbuwDpsAvse6+QVlZFFBpcbNFyqb6ST5psvhRxtjbhYLDiOanhMTrdNjXFhDgopWyNxBNnY52EHNVkX6wo34HBy12PaHtLUxxY4Hsgb5/muOEXQBe63dAWFhtc4NBJTnFzi4oBBOd0CwEoRd1ugt01RfT95m4WChp44R5B6MsYkbhRBBsdrSWm4WUrP5TgWmxVO7FGNtQ3DIVTOxRj82pdhjKpW4pBwVr8MVu+wDYABsbTSv0aUPp8x6KH6fu83ZlOFjb06yPC7EOvBRPu0t7KsZhffuqF3lI21rcw5ULsiPza0+UBUI8xPB9QdmGoDZDTSTcoUX0xjc5DdRwsj5Bba52EX9SqZijPxtjidIbNUEG6uSc1WNuwHsqE+YjbWC7LqiPnI+Pza46BUIyJ4KzOVMY55wtFyqf6c1vmlzPZAWyHDOcreo4XBG2iPmI2Ti8ZVFzn+NtULxlUh/wBUfm1uoVFyngfA+eYtaoKdkAs3Xvwh1zbZP09V2uylcGyC+yQXaVQjMnbU/aKpfuj82u1CouU8EIAblwvd0CZrsnGQPqE2Wu2B7g8AFP5SqJtmE99tT9oql+6Pza4ZAqhPMOCHl4CbC61Qy2Pbibb1J3YYyeCmF5QpjaNx+FEzAwN21ZtGqMXk/NrBdl1RGzyOCA5kcDzc22sNxslZhPoTSiJt1vXg3BTauRuuanqTKALW2iNxFwMlRMOIuKeMQtwVrvKAqEZk/mztxRkKB2GQHgjNnA7SbDgYbHY5ocLFPYWnPilmbELlPe6Z1yvBPte6fBIzUcEbQ1oAV+Gsdd9uyo22Zfv+c9uBxHZMdjaHcDHYm32P04Arq6NjkU6Dq1GNw6K3dOnjbqVJWE5MCZBJKbn/AMqKBsWmu2SBkmoUlG5ubc1oop3RaaKKZsouOGR2NxKibgYG/nVjLOxd1RPu0t7cELrGx2OFxwDZdXTw5ubU4Odo8j+06lxcziU2jjGqZExnKOOWBsuuqlhdEbFUcd3Y+3BUvwRn5VOzHIB+fUR42H4UEm7eDwxvxDY5t8wrFBpKLbDhdH1Ct6W6xtOLRMYGDC3gq5MT8I6Kjjs0uPX2Coj3b7dFSy42WOo4GOwm6BDhccLm2zV1dXV0QDqiw9ERbia0u0TYQM3KWTFkNOCaTdsxJjDI63dNaGiw9gqIt4zLUKGQxOxIEEXHBHJg/hAgi44XN7LRXV1dXV1krBWCDb6BCLugLZBSyX8o4amXeOsNAqOLCMZ6+xVUOA4hoVSTWO7dwskLU1wcLjhIvqjGeiII1V1dAE9EI3FCLuUGNGw5ZqSW+Q4aqbCMDdVTxbx1unsbmhwwlSxGJ1iqafeDC7Xha4tNwmSg68N/QdIGp8hfrwzzCJvygHSusNSooxG3CPZJYhI2xTmujdY6qnqBILHXibI5qEzTqgQdFbjdK0J0rjpxTTCIXOqc50rrnMlU8AiGevs00IlFjqnsdG6xVPVB/lfrxg2QkcOqEzlv/hb/AOEZz2RlcUSTrxzVAiyGqJdK7uSqenEQudfaJI2yCzlLA6I56KGqLMnZhMe14u0/gkhouVNV3yj/AMpkbpDYKGBsQ+faiARYqaktmxNc6M5ZFRVgOT0CHC49XRSVbG5NzUkzpD5lDSOfm7IJjGsFm+2yQtk5gpKRzc25prnRnLJMrXDmF0yqjd1sgQdOM5ap1RG3Up9b+0J8r5OYqOme/PQKKnZHnqfcXxtfzBPogeUp1NI3pdeZp7JtRI3QoVcgXjX9gvGv7BGskRqZD1RLnHPNNp5HaBMov3FMhYzlHu2uqMEZ1ajSR9l4OP5Xg4/lCkjCFPGOiADdB/2uqKh8brNXjJPheMk+Eyt/cE1wcLhT1D434QvGyfC8bJ8LxknwnuLWFw7IVsnUBMeJG4hsnqHxvwhU0rpQS5SzNiFynVjzpkhVy91HWEmzhslnbFrqnVjzpkhVyBRVbXZOy2VM7oiA1U07pSQ7ZNVYThYoJpZT8ex1n3P6VLEyQHEvCxdlUQbo5aFUTziLVV/cVLCyQEuC8JF2XhYuymyjP8bIJjE74QIIuFWfcVDylVLi6Q3VLAx7cTs0aaI9Eylax+IFTSbtpciS43Oqioxa706kjOmSliMZsVSSkjAVW6hUPMVU1NvIxQwmU26JjAwYW+x1n3P6VLK2MHEV4qLuqmcSkW0ComkuLlWfcUcz4xZq8XL3VPUPfIGuKm+25NFyAp4TE74VNPgOF2iq/uKh5SqqnJONqa5zTcGybWSDXNRVTZDY5FVp8oCpQDIL7aweQFUxtKFW8wTJCwHD12QhuAYNPZKz7ijhdJyrwkiZRH9RTGBgwtVZ9xUkbXtOIXW4j/amxMabgKf7bv4TeYKRge3C5SRmN2EouJ1VDylYheyfGx/ME+iYR5ctk4L4Q5RP3bw5NcHC42VcoccA6KkZikv2VbqFFEZHWCqKfd5t0VPPujY6IG+Y9jrPuf0qHR3BWfcTJXsyaV4mXuvEy9083gueybqNk0IlbbqnNLTYqh5SqnHjLiE2pkb1TqmRwsSooXSmw0WEWt0U9MWG7cwmvczlKdPI7IlRxOkNmqKIRNsFW6hUPMUQCLFTwmJ3wqWe3kd7G5jXZuCaxreUW4HRtcbkLcx/tC3Mf7Qt1H+0Kwtbotyz9o2uja43ITWNbyi2wwRn9KFPGOiGWQ2uiY7UIU8Y/SgLZDY5jXcwumsa3lFtjmh2RC3Mf7R/tJf/xAAzEQACAQIEBAUEAgEEAwAAAAABAgADEQQSITEQICJBEzJAUFEUMEJhUnEFI2BwkYCBkP/aAAgBAwEBPwD/AJZP+xbS3/j4tNm2EGHY7wYYdzBh0ngJ8TwE+J9OkOGXsYcMexhpOO3uiqWNhFw/8jFpquwjVFXcw4lRsIcS3YQ13njP8zxn+Z47/MGIbvBiR3EWqjd4yK24jYcfiY1Nk39vAJNhEw/dp0oPiNiAPLGqs25+2rsuxi4j+QisrjSPQB1XSMhU2PtlOkX/AKiIqDSPXA0WMxY3P2L84JGoiYjs06XHyJUoFdV9qpUb6tGYINZUrF/6+0ONNVY2MbDsNoyld+RHKG4lOqH2lWjm1Xf2ijRv1NKlQINYzlzc8xYCFviXPMDY3EVswBhAOhj4cHVYyFTY8QbG4lKtn0O8q0s+o3m3stGlm6jtKlQILxmLG55WcCFiftU6xQWtEqq23AqGFjKlErqNuSlVz6HeVqWbqG/slOnnNoSEF47lzc8rVL6DkvwWi7bCHDlfMQJlUd4bduA4pXZd9REcONOFWjfqXiDY3EpVM4/cr08pzD2IC+kpoEFpWqZzYbchNo75uSnTap5REwYGrmGpSpaKI2Idv1N/sAlTcSlWD6HfhXpfkOKOUNxNHH6MdchsfYcOlzmMrvlFh35aj5tBxRGc2WUsGF1fWPVSkLSpXap/XMOejWzdJ34VqeQ3G3Gg9jlMrpmF/j2AC5sIqhFtHfO1+Sq/YcaGHaqf1KdNaYssrYq3SkJJNzzAW5qNG3U0rUbdS8KVTOP3HUMLGEEGx4A21iNnW8qJka3r8Ot2v8Su1lt88jNlF5e/DDYY1OptoAFFhtK+JzdKbcwBMAtzUaX5Hg7ZVJ4I5Q3EBDC4mIT8uOHbXLMQtxm9fQWySu2Z/wCuSq1zbhhqHim52EAAFhMTiM3Qu3C/EQL884lOoHHBgGFjHQqbQ02AuRMO/wCJjrmUjijZSDGGYWm3rQLm0PSP6l768SbC8JvKVM1GCiIgRQqzFV7f6a7xMNUbtFwJ/IwYJBvBhaY7RxRXQC5mn2ab5GvAe/Ei+hmqN/UBuLysLOeNFroJWFnPraIu4lc2Q8lU2XhhKORcx3PBaarsITaPi6KbsI3+ToDYk/8AqVP8mjaC9ojBgGH28O9xl5MQtmvMO11t8TEjUHjhjoRMSNQfW4YdRMxJ0A5K51AmGwxch224V8XSoec6/Erf5V20pi0qVqlTzsTxpJ4jhYNOW/NRazji7hBcyrV8SYdrNaYnYccOeq0xI6QfW4bvMSdRyUsMHbO20Z1QXbQTFf5FjpS0Hz3hN9Ty4JbuT9wGxvxxI6QeFI2cTE+UcaHnEr+T1uG2MxPmHJ460aQZpXrtWN2jm55A1zbhgfy+6NuFYEppwXzCYk6AcaPnEreQ+tw2xmJ3HJiCc+svyObaRD1cMEeoj0FVQVN4u4mIN2txo+cSv5D63DHeYkbHkxI67w7cWNhCYDY3m8oPkqA/cpC7gclY2QymLuI7ZmJ40B1yuej1uHPVaYgdN+TFDQGHbi5ueNM3HDC1vESx3H2KaFzaZFta0OHQ7SnRyG/EuAbEzEOLWimxvyYYakzEnQD1tM2cGVRdCOSsuZCIIRY2hNoeKGx4I5RsyyjWWqLjfmSmXOkVRTE+oW8WorbHkc3Yk82HFlvMQbtb1ynMoMYZSRyVVyNaVR3jHTnUspuu8p47tUEXEUm2aBgdjFps2wiYf+UaqiaCPVL78VqMuxiYgHRtOD0lfePTKHXlRcqgR2zMT67DtdbTELY5uTEJmXMO03Edbacii5twtLSgyVemoNYKNIfgP+otUJ5VAhxDmM7NuedKrJtEqBxpMQ1hl5KK5nlVsqn19FsrSomZbctWn4bfqMuYR6ZBhUiBSZTULy0cVbpqf9wG+o+0a2RrLvGYsbnkoJZb/MxDXOX49gpPnW8rpla/zyVEDixhBU2MZc28II34q19OFpaWlOq9PaJi1Pm0isG2PKzqu5jYlRtrHru8oUsgud+SmmdrRmCLeE3Nz7BRqZG12lRM62hFtDyVqXiC43hBBsZaGn8Qgjfgr9jziq42M8ep8w16h7wu53PGhRt1Ny0aeQXO8xD3OUexUKmYZTK9O/UOWrSFT+4yFDY8TTB2hpmAMu0D/MFjtLS0tyi5NhKNDL1Nvy0KeY5jKtTIP37GpKm4iOHF5WpZdRtyugcWMqYdl1Gol+W0tzU6LVNtpTpLT235aVMuf1CQi/qO5c3PsiOUNxAwcSrSyajbmeir7xsMw21hBXfn32i4d2/UTDqup15qdMudIAEW3aVauc6bezU6hQxWDi4lWhl1XbnIB3hoIe0OFXsZ9KPmfS/uDCr3MGHQdoFC7Dnp0i+vaAKg/Uq1c+g29oRyhuIlQPtKlANqN4ylTY+hAvoJTw/dozqg1lSoXP69qBI1Ep4js0KhxrHw5GqwgjQ/d3iUGO+kSmqbSpXC6LrGYsbn21KjJtExCnfSEBhrGww/ExqLjtCLb/YWk7douG/kYqKuwj1lX9x6rP6y0tLS3olcrsYuJP5CLWQ95o0NJD2hw6T6dZ9Os+nSCig7SwXaGqg7xsT/ABEaozbn3bbaCo47wV3+Z9Q0+oeeO8NVz3hJO/Nb/iilSV1uZ9Ok+nSNhv4mEFTYylSV1uZ9Ok+nSfTpFUFrT6ZYylTY8KVFXW5lZAhAEp0y50gw6jeGgkfD2FweFOkX2gw694cOkfDldRrwo0g4N5WphALcKdC4u0qU0Qfv2PD+SV3ZLWnjv8ylUzjWYldAZQ8kr1GQgCeO/wAzx3+ZT844VafiD9wi2hmH8kxO4lEAIJXqMpsIKzjvGrllyymmdrQAKI+IP4xa7jeI4cXExCW6hMNsZithKNG/U0qVAgjMWNz7Hh/JK6M1rTwX+JRp5N5iW0AmH8kemr6meAnxKtJVW4lPziHa8pVA4/crUs3UN5h/JMTuJRqgDKYVDbw4dDtHoldRMMNSZWNkPHDnqtKw6DMNsYyBrX4VM2bq9kw/kj1Am8+oSNiR+IjMWNzMP5JiHZSLGeK/zC7EWJlPziHYxGKm4iOHFxAANpidxLG14rsuxi4hh5uFIhahEdcykQgqbHhh6ZHUZXay2mG2MdwguZSq59DvKtPONN/ZMP5JidxyYfyRqatuJ4KfE8FPiAWqWHzDtwp1ChvAQwuJidxKOXLYQ0UPaLRRdQJUqBBrLm95TrBtDvGUNuIKSLsI7qmpjuXNzMNsZidhASDcSnUziV6V+oeot9sMw2MLE7nkDMNjPEb5niN8zO3zLm95nb54hmGxhJO54Cq47w1XPfkDsNjDVc9+IYjYwsTueAYjaeI3z/8AJL//xABNEAACAQEDBQoIDQQBAwQDAAABAgMEAAUREBIhMVEGEyAiMDJBUmFxFCMzQnKSscEVNDVAUFNgYnOBkaHRFkOColQkk+FEY2SwJZCy/9oACAEBAAE/Av8A6jpEZ+YrN3CyXfWPzaeT89FluWtOtFXvay3BU9MkQ/Ww3PydM6erb+nv/k/6f+bf09/8n/T/AM2O55+ioX1bHc/P0TR/vZriqxq3o/5We6q1f7BPcQbPS1Cc+CUf4/bGChqZ/JQuRtOgWhuCZvLSonYNNobipU5+fJ3nC0VDSxcyCMflYaNXKSRRyeURW7xaW6KOT+1mn7pwtNueX+xOR2OMbT3PWRf2xIPuGzqyNg6lTsIw+1NNR1FT5GJiNvRam3P9NTL/AIp/NqegpqfyUS47TpPBknij8pKi95s97USf3wfRGNnv2lHNErflZt0EfmwOe82O6E9FP/tb+oJPqE9a39QS/UR/rYboX6adfWsN0O2m/wBrLugh86GQfpZL7o21s6962jvCkk5tRH+uFgwbmkHu4EsSSrhKiuO0WqbjppNMWdEezSLVNzVUOlVEq/c/ixBU4MCDsP2ko7nqZ9Ljek2tr/S1JdFLT6Su+vtfgVFbTU/lZlB2dNp7/iHkYmbtbRaa+6t+aUjHYLS1U8vlJpG/y5VWKHFCV7jaG86uLmzsfS02hv8AkHloVbtU4Wp75pJdbGM/fsrK4xQhhtGWopoagYTRq1qy4POpJP8AB/5tUQS075s0bIe37QUNz1FTgz+Kj2tr/S1Fd1PSeTTF+u2vLUVENOuM0ip32qr/AEGimjLfefRapvGqqOfKc3qroHzWKV4mxidkP3Thamvyoj0TBZV/Q2pb3pZ9Bbe22PlkjSVM2RQy7DauuJTi1I2aeo2q08MkEmZMhVu37OUNBPWHxS8Tpc6rUF1QUmDeUl6ze7LWXhT0nlH4/VXSbVl91EuIh8Sn72ZizZzEltp+dUtbUUvkZCB1TpFqO/Yn4tSu9N1hqsjK6hkIKnpGSeCOoTMmQMvba8LkePF6TGROr0ixGBwOv7MKCxAUYk9Atd1yapKz/t/zZVCqFUAAdAyVdZBSLjM+B6F6Tauvqefiw+Jj7OcfmENLvsOcGwbG0kbxnBxhy1LVzUrYwuV7Og2ob7ilwWp8U+3zbA4jRkr7uhrBiRmy9cWraKajfNlGjoYaj9lqOllq5cyFcdp6Ba7ruiolxHGl6XOR2VFLOQFGsm14X5rSi/7h91nZnYs5LMdZPzGjGFMliARgRiLVFF50Pq8vQXjNRnBTnR9Q2oLwgrBxDhJ0odeSWNJUKSKGU9BtedzvDjJTYvH1ekfZS67tkrWzjxIeltvdangjp4hHCuaoyV9fDRJ4w4v0INZtX181a/jDgnQg1D5nGMI1HZlqqYTDEaH9tmBViGGByQpvkipnKuPS2q0111kWuEsPuabEFTgwwPbySkqwZSQRqItdl96o638pP5sDiMRpGS9boWfGWnwWXpHQ1nUoxVwQw1g/ZG6LpNThLUAiHoHW/wDFlUKoCjADoGS9L4WHGKmwaXpboWzu0jlnJZjrJ+ZqMWA7eDV0+/LiPKDV25dz9d4RBvMh8bH+4tNDHMMJUVx2i1RcdNJ5ItEf1Fqq5qqHSqiVfufxYgg4EYHYeRu285aI5vPh6uzutTVEdTEJIWxX2ZL0u1K1cRxZhqb+bTxPBKY5VzXH2PuW6t9wnqR4vzUPnZCcBidAte18b5jDSHBOl9vdy6xO3NU2Wkc6yBZaNelibCniHm499hGg8xf0sANg4d4Q4Nvi6jryUVQaWqjmHmnT3WUhlDLpB05amkgqVwmjDdvTasuJ041K2eOq2u0iNGxWRSrDoPIUdVLSS58R7x0G1310VbHimhxzl2ZLyoI62LA8WQc1rVEMlPK0cq4MPsbcl179hUVA8X5q9bI7BFLMcFGsm173o1WTHFisH/8AXKpG780WSl67fpZI0XmqOVkTfEKnpsdB05Nzs++0GYdcRzfy4NTTQ1KZsyBvdavuSSLF6bGVOr5w/m3Tp4cMrwSCSJs1x02uu8UrUw5sw1rkvKhStiwOiQc1tlp4XglaOUYMPsXct3eFPvsw8Qv+2RmCqWY4Aaza+LzNWd7i0QD/AG5SOFn7BtNo4EXtPb8xrFzaqT9clxViUlQ+/HCNx+9opY5lzonVx2HhXhdsNYMSM2Xri1bRzUb5sq6OhhqPDikaKRXjbNYaja6rwWtjwPFmXnL78l7XetbDowEy80+6zqyOVcYMNBH2Juuhatnw1RLz2tGixoFQYKNAGS+ry8KfeoT4gf7cmiFzxbRwquvSfmd5fGf8RlR2jbOjYq20G1Lfk8WiYCVf0NqO8aer0I+D9VtfBljSWMpIoZT0G16XS9NjJBi8P7rw4ZXhlWSNs111G12VqVsGcNDjnLsyX5d3hK79CPHLrHWH2IpoXqJlijHGa1HTJSwLFHqHTtyX/eOulgP4h93Jxw46X/SwGGrlwrHUrfpbeZPq2/TgXif+p7gOFQ3xPT4LL42Pt1/rajrYKtfEvp6VOscG97ozsZqRdPnRjp7uHRVL0k4lj/MbRakqEqoFliOg/tk3QUG9t4TEOI3PGw7fsPclB4JBnyDxz6+wbMl93h4LFvcR8c/+o5IDE4C0cWbpOk8mBicBpNo6Kd/Mw9K0d2Hz5B+Qt4DTxjFyf8jZpaKPmIGPYLNXH+3GiWapmbXIfysdOvTwKls+dz28NGKMGQlWGoi13X5hglbp/wDcHvsjB1DIQVOojgXzdW/Yz048b5y9b/zw7qrjRVGJ0xNzx77KwZQynEHSDZ1WRCrjFToIteVG1FUlPMOlDtH2F3P0O/S+ESDxaHR2nJW1K0lO0r9GobTaeV55mkkOLNyKgscBaNAo5EWgoJ5NYzB960V2xLz8XNkjSMcRQvdaathi6c5ti2lvGV+Zggszs5xcknt4c8m9RM36cld94S0TcXjR9KG1FWRVkedEdPSp1jgX3dm+g1FOPGecvW4e52vzT4JKdB8mfdkvOjFZTFPPGlD22YFWKsMCNBH2DpIGqahIk1t+1oIlghWOMYKowyXxW+GVPF8imhe3t5FVzjgLIoUaOQRGkbNRSx7LU91k6Z2w+6LQwRwjxaAZKi8Y49EfHb9rT1Us3PbRsHJXhLnSZg1L7eTgmeCUSRNmsLXXeKVqYHizDWv8cC/ruzCamAcQ88bO3hDQcRoNrprPDKUE+VXQ+TdHRYMKqMaDof8An7B7naPeoPCHHHk1di5N0FZvMG8IePJr7ByIGJwFkXNHDVSxwUEnYLUt1k8aoOA6otFEkS5sahRkqq6KDRzn2C1RVS1HOOC9UcnUzbzHj5x1crG7RuHQlWGoi103ktYuZJxZx/tlIxGB1Wvih8DqOJ5F+b2dnCu2rNHVLJ5mph2WUhgCNINpY1liaNxirDA2q4Gpqh4X1r+/2Bu2l8Lq0i83W3dYDAYDVaeVYYXkfmqMTaqnapneV9bH9ORjTNHbw6KhkqONzI9tqamip1wjXTt6cksqQpnSNgLVd4PLisXET9zyjuI0LNqFp5TNJnH8hs5ZGKMGQkMNRFrpvAVkWDaJl5w29uWsp0qqdopNR6dlp4ngmaKQYMp4W5usz4jTOeMmle7JujpN8gFQg40fO7vsDudpd5pN9YceXT+WTdLVc2lQ/ef3cjAnnH8uEoLMAoxJ6LUN2BMHqNLdXoGWtrkp+KONJs2WmmeZ86Q4nlGYIpZjgBaqnMzbFGocmqlmCqMSdQtdN1rTR50wDTMNPZ2Wve6d5xmphjH0r1ctPM8EqyRHBha76tKyDPTQfOXYcu6Gi32HwhBx49faOFSzNTVCSprU2ikWWJZE0qwxFmAZSrDEHRaupzS1UkJ806O76foKfwqrji6CdPdYDAYDVaeVYIXlfmqMbTyNNM8j85jieQjXOPZwqeF6iTMiGJ9lqKijpV0caTpbLX3lrjpj3v8AxyskixrnObVE7TNp0L0DkwMTgNJtc12eCrvsw8ef9ct93ZvedUU44nnrs7ct3VjUdQJBpXUw2i0TrLGrocVYYg5b2pPA6xkHk24yd3C3M1WKPTMebxl7sm6amzokqF1pxW7vp/cxT4JJUHp4q5N01TgiU69PGbkUXNXg0VK9VJguhRrbZamp46ePMjH/AJyEhRiTgBa8K/fsY4tEe3rcrPULD2tstLI0rYueUuS7N4AnnHjjqHV/88CrcR0srPzQp4G52u3uTwaQ8RuZ2HLftL4TRFlHjI+MPfwqKc01VHKPNOnuspDKCNRtPEJ4XjfUwwtIhjkZH5ynA/TqgswA1nRalhFPTxxDzRhY6BptXT+E1ckvQTo7uQhXTjs4NDSPVy4DQg5zWhiSGMJGMFGRmCKWY4AWvCtNS2auiIfvymoabT1nRD63K3DduqqnH4a+/g7ppylMkQ/uHT3DgDQdFrprPDKUMfKLofLe1N4LXSIOYeMvdwtz1Rv1DvZ50Wj8ujJukp97rRKObKP3+nbih368UPmx8c5L8n3i73w5z8QciozRhwKKlaqlzF1dJ2WghSCIJGMFGQkAEk4AWvGt8IbNTyQ/flJp0i16W2C00zy87Vs5WEqsqtIuegOldtqeVJ4VkiOKHg3zR+GUvE8qmlf4tqOB18C6KvwSsUnybcVsu6Wnz6ZZhrj193C3PT71eAU82UZuS/oN+u5yOdHxx9O7moc2leU63P7DJulnz6pIRqjGJ7zyEIxbHZwIYmmlWOMYsbUdOtLCET8zty3pXb8d6iPihrPW5N5FjGLnC0tUzaE4o/f5hdFeaKfB/IPzhs7bDSMRq4N/XaXPhNOuLeeo6e2yRu7ZqKxbYBakuF3XOqZN7+6NJtet3GhKkNnxt05LgqvCKPMY8eLR+XRkmjEsTxtqYYWkQxyMjc5TgeCjFHV11qcRaJxLEjrqYY2YBlKnUdFpozDM8Z1oc36co4t4pYo+quSrl3+qll6zY8hGMEHAuuj8Gizm8q2vs7Mt8VuuniPpn3cBQW5oJ7rJR1LaoW/PRZbsqDrzB+dhdL9Mq/pYXSOmb/W3wUn1rfpaWgghQvLOVUdJtV1cQ4tLnn77fxYkscScT8y3OVucvgsh0jSnds5C8afwqjki6fN77d+u1yVPg1emPMfiHLuhh3q8S3RIM7hbnZt8oMw64zm5N0cW93jndEi4/Td2xb9XwJ0Z2JyXrLvN3zt05uA/PkEGLAcC5KTPff3HFXm9+W9KzwePNTyrftZVZ2wUFm7LQ3ZUya1EY+9aK6Ix5WRm7tFo6Knj5sS/npsBhq4N4X1FBilP42Tb5otU1MtS+fO5Y+z5pFI0UiyIcGU4i1HOtTTpKnnftyF/U+8XgxHNk449+S7KjwmiikPOwwbvybqIsYIZeq2b+vC3MS5tXJH11x/TJuoixp4Zeq2H6/Te5mPOrXfqJ7cm6eTNpYo+s2P6chANZy0sBqJ1jXp/a0aLHGqJoUaBlF3I8hkqWMjn8haONIxhGoUdnDqaiOmiz5mwHtteV6S1ZKrjHD1R09/zfc3VZk7U7HivpXv5DdHBvlDvg1xHH8sm5ifCSWA9IzxkviPfbtnGwZ36cK7JN6vCB/vYZL4j327ZxsXO/T6b3LphTzPtbDJumkzq1E6ichEMEGW5qXeYN8Ycd/2HDYhRixAHbaSvpk/uA+jps97xebG5s17v5sSjvNmvWoOrMH5WqmNTJnzMWPstvKWmVVOC/No3MUiunOU4i0EgmhSRdTDHhzRiWJ421MMLMCrFTrGi13TeD10MnQG092SRc+NlPSMLauDjhptE++RI/WGNnXOQqdRGFiM0lT0aPpq4UzLsi+9i2S+H3y86g7DhyA0DJddN4RUjHmLpbguyoMXIA7bT3pCnk8ZD2arTXnUPzSIx2Wdmc4uxY9vCY5oJsTicfm+5ubfKExnXG2H5cOaVIYy8rBVHSbVUglqZZAMAzE5KCXf6KGTpK6clYuZVzrsdvbwrmfPuynP3cP0yXmm93hUL98/TV3rmUNOv3BkqGz6iVtrE8NBi4yUFC9UcebF1rQQRwJmxLgMs00cC4ysFtUXsx0QLm/ea0kjytjIxY9vI1J0AfONzUuZXNH0SL7OFeN9OJWjpMABozzaaaSds6Z2c9uXc1JnULJ1HyXoMLyqfT4W5tsbuw6rkZN0C5t6SfeAP01GM2NV2C0hzY2OwchD5S12Xfv8AhJNoi6B1rKAoAUYAZGYIpZiAB0m1ZfGnMpBj982ZixxYlm2nk6g4yns+cXbJvV4U7ffA4VSm91MqHzWI4G5d8J502qDkvj5UqfS93C3LHxE67GB/bJumH/XRnbH7/plNLqO3JXHCinP3D7OQuGmSprDvnNRccNuWtrYqReNpfoUWrKyWqbGQ8XoUahaMYDlG0sfnAOawbZpsNIx4N+JmXpN24N+3A3Ptm3on3gRkvY43nU+nwtyp41SPROTdSPHwH7p+mabTUwj749uS9NF3VP4Z5DcsPH1B+6Ml5XoIcY6fBpOk9C2Zi7FmJLHWTZRieQAxOA12YZrEHo+eHVanOdBGdqjg7plwvBTtjHAug5t503pZLxOdX1J/9w8Lct8YnH3R7cm6r/03+Xu+maP45B+IvtyXv8mVPoHkNyuuq/x99rzvTOxipjo6X/jLGNHIUsO9jObnH9rVHl378p1H5ydVqT4pD6A9nB3R0jyhJ4wWzBgwGzgXfor6b8RbarO2e7NtOPC3L/G5vQ9+TdTqpv8AL3fTNJ8bg9NfbkvX5NqfQPIU0rpHLGpwV8M7t4A1cOjhx8Y35ZKwYTntHzw6rRDNiRdgHCeKN+fGjd4tfd2wx0xngXMK6wNRyUPx2n/EX22vCTeqGd9iHh7lvjM/oD25N1P/AKb/AC930zCcJozsYZLwGNDUfhn2chDrOVecOHTxb4/YNeWvHMb8uBKMJG+cQJvk8adZgOQv84XXJ2kD98l3DG8Kb8QW3SS5lBmdMjYcPcqOPUnsX35N1J8ZTjsP0zqsNIFqgZ0Ei7VNujhxc7KnO4QGJwFoY97TD9ctWudAezTwKoaQfnFyR75ecOxeNyG6VsLvA6zjJcq516U/fj+1t08udUxRdRcf14e5ZfE1DbWAybpz/wBZENie/wCmqJs+jgbagyOM12XYcOGnOGVOdwqKP+4fy4GvRZhmsV2ZZlzoz843LxceabZxByG6l9FOne2Tc4udeWPVQm14TeEVs0nQW0d3D3NLhd2PWc5N0LY3m/3VA+mrkbOuuDsGGS803u8Khfvk8knO4Ma57hR02UZoAGocGtTCQNt4E6Zr9h+YwxtNIscYxZtAtS0EENMsTIj7SRrNpbpo5P7Wb6JwtNufX+xMR2OLT3RWRf288bUONipVs1gQ2w2uyn8Foo4/O1t38huikz7wzeooGS7X8Hoq2fzsBGveeQuVMy7IBtGOS9Xz7yqD9/D6a3MvjQunVfJujjzLyLddQeQTmjINfBok0Fz06uFOm+REdPRwJEz1wtqOn5hcN3+Dx7/KPGuNA6o4Loj4Z6q2G0cKqqoaVQZ3C46u20V6UchwEwB+9otLVQRR57ypm99quXf6mSXrNjkeT/pY4htLtw9ei0Kb3EiDzRhYnAYnos7Z7s3WOP01uXkwnnj2qGybqY+JBLsJXkIj0ZRpGUDEgCyjNUAdHDqVzJTsOngTR52ka+XuW69K1FSvaiH2nlL+m328nA1RjM5S7Y99r4E+9kvSTervnb7uH03ckm9XnDsbi5L9i327Zdq8fkEODZY8tGuM2OzkK1eIG2cGWLO0rrsdGvk0RpGCoCzHUBa6rnEOEtVg0nQvQuSqqYqWLfJmwHttXXlNVS52cY1HNVTqtDe1ZF/dzxsfTaDdB9fD+aG1NeVLUaElAbY2jhPjmnN53RapjlimYTqRJrOPKbmos6teToRfbk3Ty5tJHH129n02rFGDDWDjaJxJEjjUwxs6h0ZTqIwtIhjkZG1qcOQU4jIpwOWhHFY8hMM6Jx2cKSMPr17bPEy9o5GhuiepwLjeo9ra/wBLUVFDRrhEunpY6zkvG94abFIsJZdg1DvtU1EtTJnzNnN7ODTV1TTeSlOHVOkWpL+VtFUmb95dVoZo50zoXV17OBU00VTHmTJnD2WvG6JaXF4/GRbekcnuchzKDP6ZGxybpZc+uWP6tfb9Obn5t8u5V6Yzm5N0MO9XizDVIM7kIj0ZUOIyUXkj38gdXINErdFmpuq362MLjosUbqmyo7HBUYnsForrrJNUBX0tFoLgc+XmA7E02pbupqXTHHxus2k21a7Vd700GhW319ifzatvWoqsVx3uPqryMUrwvnROUbaLUN+nQtYP81/i0UiSoHiYMp6RwLzudJ8ZKbBJdnQ1pUaJykilWGsHkFBZgq6zoFoIxDCka6lGFtWu1VLv9TLL12x+nNzU+ZVtEdUg/cZN0sG+UayjXEf2PICw0jIpwOShPOH58hKc2Nj2cOVWiOKHi2iqAD41Cw+6cLRVF3Hn+Er+htH8En+8f8iRaM3YvNen/NreG0SDRPCO42e9qJf74PojG0t/wDyccj/tae/qhvJIkf72nqp6jy0rP2E6OVpqmWmfPgcqf2NruveKpwSXCOX9jwN08qGWKMAb4oxJ93IXBBv14Kx5sfG/jJfU+8XdIRzm4g/P6dp5TBOkq61ONkYOisuojEWmjEsTxtzWGFpUMUrRtzlOB5CI9GWM9FoXzJAeQq38z9eQnizNI5vze7L4enwjqMXi29K2ikSVA8bBlOoi1VMtPTvK+pRaaRppXkfnMcTyG52n3qi3w86U4/lk3Sz59SkI1RjE95+ntztRvtFvZ50Wj8ujJulpt7qVnHNk0Hv5FTiMqNjr12pp83ivq28KaUR+lYnE4nkZoM3jJq2fN7urpKKTFdMZ5ybbX3eIq97jhx3scY47eQpYTUVEcS+cbIoRQq6gMBaVxFGzvzVGJtPIZpnlbW5x+nrkqfB69MeZJxDkvKm8Lo3i87WvfbVr18gjYHgK2PfaKZo9WrZZapDzgRbf4utY1MY6Se60lUx5gzba7DkpqcNpXQbMpU4MMD80Ck2wCjt5Hc1S8+pb0V9+TdLU5lOsC65NJ7vsBdVV4XRI5544rd+TdDSbxV76o4kun8+Rjbo4Cvjr18MckyhxgwxtJSkczT2WIwOB+YR0ztpPFG02wjj5gz26xsx6TYnE8hTxNPMkSc5jhaCJYYUjTmqMLHQNNryqfC6x5PN1L3fYC4KvweszGPi5dH59GS8KYVdK8R161Ow2YFWKsMGGgjkVbHgK+Gvhg8myhhxhjZ6UHmHDvs0Ei+bj3W1a+RAJ1DGy00jdGHfZKMee2PdbOii8moxs7s+vI7Y93I7mqTBWqnGvip/OTdBVbzS7yp48vs+wVz1fhdIC3lF4rZN0dHmSeFIOK2h+/kQcLKceADhqsr7eEDypAOsA2NPEfNw7reCJta3gY65/S3gf3/2t4H9/9rCkXpY2FLH2n87CGMakFtVnmVdWk2eRn16tmV2x0DkaGmarqViX8zsFkUIgVBgoGAs7BELMcFAxJtX1Jq6p5TqOobB9grqq/A6sOfJnQ/dbXqtNGs0TRyDFWGBtW0zUlS0T9Go7RyIOFlOPBDEWDg9nBB+ZsQvOOFmn6o/WzOzazwHboHJXLQ+CU+Ljxz6W7OzJujrMAKVDpOl/4+wm56uz08FkPGXmdoyXzQ+GU+KeWTSvb2ckDhZWx4QJGqwk22DA9PADcsWVdZFmnXzRjZpnPZ3cJ2x1auS3P0O+yeEyjiIeL2nJXVK0lM0rfkNptI7SSM7nFmOJ+wkbtFIrocGU4g2u+rWsphIuvUw2HJugu/NJqoRoPlB7+TV8dfIAkajYSGwlHSLb4ts4bbBrZwyYZdG0WLoPOFjMljUDoWxnbowFi7HWx4ZOGuzNjyV20bVtQEGhBpZtgtGixxqiDBV0AWOgYm1713hlRxfJJoX+fsNdVaaKoztcbaHFkYOoZTip0g2IBBB0g2vigNHNinkG5vZ2cmr4a7a+VxO22J2m2J2nlWfCxOOvkqeF55VjiGLNagpUo6cRpr847Tk3Q1+ANLCdJ8ofd9iLhvHeX8HmPim5p6pyTxJPE0coxVrXhRPRT5j6VPNbbyYOGqyvt+ckgWZ8eTRWdwqDFjoAtdN3iii42BmbnH3ZL4vDwOLNTy7auztsTicTpP2JuG8t8ApqhuOOYx6ezJV08dVCY5RoP7WrqSSjn3uT/FtvKBiLBx81LAWMmzlFBZgFGJOoWue7RSJvkumc/wCuS8axKKDPbSx5q7bTyvPK0khxZvsUNGq1y3n4SN5nPjxqPWyVlLHVwmOUdx2WrqOSjlzJNXmt0HlQcNVhJtsGB5fHCxkHRYuTyqqXYKoJY6gLXRdgpBvkuBnP+uStqo6SEyS/kNtqypkq5zJLr6Bs+xgJUgg4Eaja5r0FUBFPonH+2SpgjqIjHKuKm15XdJRPp40R1P8Azy+OFt8Nt87LZ4tnDbbHgYjbbPG22+C2+dlix28vBE88gjiUsx6LXXdqUS5zYNMdbbO7JWVUdJDvkp7h0m1dVyVk2+Sfkuz7HA4EEaCLXPewnwhqThL0N1v/ADkdVdCrgFTrBtet0NBjJTYtF1elfomhopayTNiHFGtjqFqGiio482IaeljrOS8K2Oiizn0seau21ZVSVc2+THT0DoH2Rum+MMIaxtHRJ/NterJedzpPjJT4JLs6GtNE8MhSVSrDoP0NdtzPPhJU4xx7Ok2ijSGMJEoVR0DJed5R0QzRx5uhdnfaomeolMkrZzH7J3ZeklHgj4vBs2d1qeeOojEkLBlyVdJDVx5sy47D0i143TNSYuvjYesNY7/oOlpZqp82FMdp6Ba7roipcHk8ZNt6BlvS+guMVGcW6ZP4sSWJJOJPT9laSplpZM+FsD0joNruvWGrwRvFzdU9Pdlr7nhqcWi8VL2ajaro56RsJkwHQw1H5+iNIwVFLMegWoLiJwasOA6i2ijSJAkShVHQMlVUxUsefM+aPba871lq8UTxcOzpPf8AZm7r5lgwSoxlj2+cLU1TFUpnQuGHsyMAwwYAg9BtW3HFJi1Od6bZ5tquiqKXy0ZA6w0j53HG8rZsas7bALUdwu2DVTZg6q67U1NDTJmwIF9+TUMTa8L7SPFKTCR+t5o/m000k8heVizbT9m4pXhfPico20WoL91LWD/Nf4tFIkqZ0bBl2jJr12q7npZ8Sq70+1P4tU3LVReTAlX7uv8ASzKUbNcFW2H5tTXfU1Hk4jm9ZtAtS3DGumpcuequgWhhjhTNiRUXsy1t7U9NiAd9k6q2rrxnrDx2wj6i6vs/BPLTvnQuyHstR39qWrT/ADT+LQTxVC50Lq47MssMcy4SorjtFqi4qaTTEXiPZpFp7iqU8mySD9DaalqIfKwyL+XLxxvIcI0Z/RGNoLnrJdcYjH3zaDc+g0zzFuxRhanoaan8lCoO06TlOgYm1ZfNPBoj8c/3dX62rLzqarEM+anVX7Ro7RtnIxVtoNqW/KmLRLhMvboNqa+aSbQzGJvv2UhhipBHZwJaWCbykMbd4tLctG+pWT0Ws+55PMqGHeuNm3PzeZPGe8EWa46wat6P+Vjc1aP7QPcwt8E131B9YW+Ca76g+sLC6K76n/YWFyVh81B/lZbgqDzpIh+psm57r1H6LaO4qVee0j/nhaK7qSLmwJ+YxsAAMAMBwKitp6fysqg7Om1Vf/RSxf5P/FqmsnqT46QsNnR9qIZpIDjDIydxtBftSnlQko/Q2gv2nfyqvGf1Foq2mm8nPGfz5eSWOIYyOq95tNfFHHqkMh+4LT7oGPkIQO1zaovCqn58zYbF0D7XxzyxeTlde5rR3vWp/ezvSAsl/wBQOfHE37WXdCPOpz+TWW/6fzopR+lhflJ/7g/xt8NUXXb1Db4aovrG9Q2N+Ue2Q/42N/UvQsp/KzboI/Ngc95s+6CTzIEHe1pL8rG5pjTuW0tfVS8+ok/I4W1nE6//ANbdNA9TMIosM47bfAlZ1Y/Wt8CVnVT1rfAlZ1U9a3wJWdVPWt8CVnVT1rS3bVxc6B8OzTwKSnkqpd7hALYY6Tb4FreqnrW+Ba3qp61vgWs6qetb4FrOqnrW+Bazqp61vgWs6qetb4FrOqnrWkQo7I2tTgbU1O9TLvcQBbDG3wNW9RfWtNdVXDE0joM1deBx4NJTSVUu9wgFsMdJt8C1nVT1rS3RVxRs7KmaoxPG4FPQVNRpihbDadAslwVB58sa/vb+n3/5C+rZ7hqBzZIm/a0931UHlIWw2jTwqegqqjTHC2G06BZLgqDzpIl/ex3PydE6eraS46tebvb9xtNBJA2bMjIe3gIpd1UaycLfAtZ1U9a3wLWdVPWtIpR2RtanA8CC6quaMOqAKdWccLfAtZ1U9a0t01USF5N7VBrJf7C7n/lSP0W4dZQwVY8anG6w12vK75KGTjcaM818m5r5RP4Z93IVvxyf8Rvbbc78pj0Dlvy7vBn36EeJbWOqeBua+UT+GfdkvD4hUfht7MgBYgKMSdQtdd0JAokqAHm2dC8K9qWkNPJNMmBUc5dBy0tPJVTCOFcT7LUF0wUoDMN8l6x93BkRZFzXUMuw2vK5MMZKP/t/xY6DpyUfxyD8Rfblrfjk/wCI3ty3JdefhUVK8XzEPT25JZEhjaSQ5qLrNrzvB62XqxDmr9hdz/ypH6JyMc1Sdlv6gT/jt61v6gX/AI7etZd0EePGgcDsNqOtgqx4l8T0qdeSphSohaKQcVrTRmKV435ynA23NfKJ/DPuyTyb1C8mGOaMbf1BH/x39a39Qp/x29a39Qp/x29a39Qp/wAdvWt/UK/8dvWtM++TSPqzmJtud+Ux6ByyIsiFHGKnQRa9KFqKfDXGea2Xc18on8M+7JX/ABGo/Db2ZNzVOJKh5m/t6B35JHWKNnkOao1m1Rf4DYU8OI2vb4fqceZF+htDug+ug9Q2pbypanQkmDdVtBtumqcWSmU6uM3uyQxtNKscYxZjgLXfRpRwZic7zm25HZUUs5CqOk2nvuljOCZ0vo6rf1CmOmnfD0rUt7UtQc0PmPsfRlv+7xIhqYR4xeeNoyUfxyD8RfblrvjtR+I3tyXLde+4VFSPF+ap87JI6xoXchVGsm173i1a+amiBdQ29v2G3PfKieick3kn7jboy00zU86SprU2U5ygjUcm6BM283+8AbbmvlE/hn3ZLw+I1H4Z9nD3OfKQ9A8Crp0qoGik1H9rVlM9JO0UmsajtGTc18on8M+7JX/Eaj8NvZk3M4eBSbd892TdCjvdx3vTgwLd3BYljixJPbk3MU3lKlvQX35JpVhiaSQ4Kuk2vGukrZcW0Rjmps4FyXo0ci09Q2MZ0Kx83LetN4LWyIOZzl7rUfxyD019uWu+O1H4je21y3Xv2E9QPFeavWyOyohZyAo1k2va8mrHzU0QDUNvb9h9z/yononJN5J+48CGJppVjTnMcLKM1QuzRk3QtnXk33VAtua+UT+GfdkqY99p5IwcCykW/p+T69P0t/T8n16fpb+npPr09W39Py/Xp6tryoGoTHnurZ+OrJuc+Uv8Dknfe4XfqqTalnSphWWM8U5LzolrYM3VIOa1pY2ikZJBmsugi25r5RP4Z92Sv+I1H4bezJuaqAk0kDefpXvy1N1Us+nMzG2potNufceRmU9jDC011VkWuEsPuabEEHAjA7Mt0R73dsA2rnfrk3TzYRRQjzjnHhXZMaighkbnEae/Jupj0QSdOlbUfxyD8Rfblpbs8Ir555x4nfDgOtpyEgDEnAWvq8vC33qI+IX/AG+xG5/5UT0WyOM5SNot/Tx/5I9S39PH/kj1LLufGPGqD+S2orvgo9MYxfrHXkmkWGJpJDgqjE2qJTPO8ja2ONtzXyifwz7uHup59N3Nk3OfKY9A5K74lP6B9lrrr2optsTc5ffaN1kQOhxU6Qcl9Xd4XHvkY8ev+3Zbc2P/AMi34ZyV/wARqPw29mRWKsCpwI1G13X0kgCVfEfr9BsCCMQcRwKqlhqlwmjDdvTa9Lqek48eLw7ele+x1WpPisPoD2ZN0/x2L8P38Lc78mL6RybqPicXp+61H8cg9NfbwSARgdItfN3+BzZyeQfm9nZ9iNz/AMqJ6J4dRURUyZ0zhRa9rzatOYgKwjo25NzXyifwz7slU5ippXXWqki3w7VbIvVt8O1WyL1bfDtXsi9W3w7V7IvVtXV0taU37N4urNGTc58pj0DkrviVR+G3syXHePgz7zMfEt09U5RRql4eEpozlIYe/JXfEqj8NvZwIZ5YD4mR07jaC/KpPKBJO8YWhv8Ahbysbp3abU9VDUjGCRXyMoZSrDEHWLVsHg1XLF0KdHda6X3y7ac/dwybp4c6GKYeYcD+fCuyDwehijPOA09+TdTJ5CPva1J8bg9NfbwILwgnq3gjbFl6eg92SohSohaOUYq1q6lejqDE/wCR2j7D7n/lRPROSQ5sbEdAt8PVXVh9W3w9V9WH1bfD1V1Yv0tJe1bJ/ezfRGFnZnbOclm2nLua+UT+GfdkvD4hUfhnh7nflMegcld8Sn/Db2ZbgvLVSzn8Nj7OBX/Eqj8NvZkhjaaVY0GLMcBapppaZ8ydCp/Y8CnkeKZHiODg6LDJug+VJMNgtuYqeLJTN6a+/JLGssbRyDFWGBteV3yUUmnjRHmvwLjuxnkWoqFwQaVU9OW9anwqukccwcVe61J8bg9Nfblvy8yzNTU5wUaHbb2WRmRwyHBhpBtdVctbBjqlXnDJeNGlbBmNoYc1tlpo3hlaOQYOuv7DbnvlRPROSbyT9xt0cPc18on8M+7JPHvsLxk4Zwwt/T8f17/pb+no/r3/AEt/T0f/ACH9UW/p6P69/wBBb+n4/r3/AEteFOKWreENnBem2535THoHJW/E5/Qb2cC47x8JTeZj45f9hlrviU/4bezJuZpcZHqW1LxVtIiyLmyKGXYbVFx0smmPOiPZpFm3PyeZOh7xZbgnx0yxAfnagueKmkEjsZXGrYMjEKCW0AWrp/CauWXoY6O60ErQTLJGcGU42oatKyASJr85dmRgGBDAEHoNp7kpJDioaM/dNhufix0zyYdwtS3XS0xzljzm2vpy39eIijNPCfGtzj1RkpPjcHpr7ctd8eqPxG9uSiqXpKhZY+jWNotS1CVMCyxHQf2yX3d/hcW+RDx6f7DZ9htz/wAqJ6JyTeRf0TYauHua+UT+GfdyF/fKs35ey25z5THoHJW/E5/Qb2cCN2jdXQ4MukG111y1sGOqVecuSu+JVH4bezJdN7QwwpBMuYF84e+0UqSrnROrDsPBlkSJC8jBVHSbXvevhQMUGIh6T1stLUyUsufC2B9tqC9oKnBXO9y7D08GR1jUs7BV2m1433oMdF/3D7rE4nE68lH8bg9NfblrvjtR+I3ty3TXmin0+RbnD32VgyhlOIOo5N0F3a6qEfiD3/YWnnkp5RJCc1x02+GK767/AFFmvesZSDLoP3RyFNUSU0mfC2a2GGq3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i1RM9RKZJTi51m1NUSU0m+Qtmthhqt8MVv1o9UWe9ax0ZWl4rDA8UcGmnkppd8hbNa3wxW/Wj1RaS9qyRGRpBmsMDxRljkeNs6NmU7QbQ3zWR63D+kLLugm86GM9xsd0EmGiBPWtLfdW/NzE7haaaSZs6V2c9p4VPXVNP5KZgNh0iyX9UjnJE37WO6CXDRAn62kvurfmlE7ltNPJOcZpGc9p4CMUcMvOBxFvhit+tHqi3wxW/Wj1RaRjI7O3OY4ngU95VVPEI4pMEHRhjb4ZrvrR6ot8L1p1yj1RY6T/wDVRf/EAC0QAAECAwUIAwEBAQEAAAAAAAEAESExURAgQWFxMIGRobHB0fBg4fFQQLCQ/9oACAEBAAE/If8Akc6ouxTPK6ancuUt9kR1ouywa0IoQxjyUaVsZtTHdCTuoBdCP0U390TXNRNGBYwND8wbyUYXMKGA5Ak+yYiZtFyU2ypeeaAAwADLaAGD5ZT3PYm+iMc0LqQTsQBxc5TWqtU+UlRmLDiKletqTWypuYbocwKiFONSJydG9UNyxCwmNfqjh8d4X7lY26F4QMTd9URyYkudD9kWAeHA9xCnC5nuZGheTqX1hin+qUyHIjmBiPkYiWEymUQ2q08kyNTOG4SQDBhAC10FCS/AE4g3Ub5RMvDPPEovuwk3BYvjtHoarSkYU8qhuspwKYwd4Aw4yQyacRxbq9pERvmpnoMPJUViyB0OPyBgD+BFp5IADvI+lrK5midydS3QcJ9ERLcvWH+XM0CB4VCPXCPg0+VzkgQQCIg2GB+mFwtVYOQ4IiA+AdK/HJDAoQ8p4AxhS0YWuQe9RTeioYqCJ78EbFqZHJ/1HR6EWTTvQH3CkgUI4NhrQYJaUTuMQfKr1RCAICBBw+MFKFMAOShtqQB6uyFiZgBgLG0iSI6QTw7mOZhuRLkkxJmdu9xgABECn0aDgdtG3Jz6gRwIcS8IACQIMiLD2CoBjvqpzf3HT4tE2YsnMocA+ICOgoLAkUchgFKUJEPR3KitQIcn/DqgOiIImBU/el2RgSDA7YeqmTuomW3CheRZAdOQOFVazN5x8UCnAnwkHhosczU2OByHsIDNORsPtIn/AB5fCLSRur3IqQMwbAPlNhiM1H64L9oxMBgDHZFAM5DEFOOmMgj1vQBFBIgjGxps3J8BRbqsAxB+Imps5J8UBkGYAYAWGTQoTPIUYebkOT/jzuAXRSUEXQjCc0UQjoECZ190lvP5J8OXTyCnOqcyGZwZgYjYiJOWZnioQ8Bp1KhsgWG1csiLKmQeunw8pt83ODl1UpIBiAESTgjPuSOeWgZ7edoVkvKegeVQXfIpcgFIG5C9Cru7HkWgK4gioMmGoteSsJA0Kftx7cMipvSAsdgNt6smhTo8Yz8hZCTg+WRyWKW4rmMvhryF4n5jl1sBbFeQARCwTvznLLaz1apgEGb2SSUGszcCCCF4EnCyAkEwgbCAK/eA9yutpmBx0FPZqSBBBACCIEG+exIgnmYHWzGVkH+F/TJ7r4juMvhePQgK6aIAAAAMBghYhnIYAKM8/edTlltImAgiJGdcC0bJoCRPNY5CJDs7AYd1nll68S0UCO+qmlPuPa+fsW4FBwBqZMrHE1NXNkirT3EwfhM54jsDMoA0VhgESAHJYIpGhYkY66bNiBvwCju9yQQtCFoQ2PNtB3IZFNVcj1U3bt32uwVzkCqqJE9SozvmREOBQUQ9Z4sdYcgez/CHXROAqUDmpiLEmx3TQ9Pfhsz4AcSEAAACgQQuC4EELAVPBoSguQjNlxwxRXcU7A0jh08k4gEaDdXQg1T8wzZI3i2xEMCkU7AnDEqGx3jyB6AevwfCRvyXlZhUp8zWiOxMIDlC/AoIIIXgjMBoAOpE3UmWBmTyDqgqyFzVxzKlxmjlcvMCIk5Esy9yk8A3QvxaoEMQiyJIA6O4QaKOQ4NwDbEwOcenRBBIIIIwN5/Bgg9GYQvQbDEIY0VxiEYbn0JiPguRpT7wsjUycCCfHJye2xZBFQFPE2iwIWBASQACScAmU5v4KNnnoBNIdkZPw445o0QOSiVnAonQvVlAbVso1umMgdKFS43mNyXTiLBUZ9b7DiImBx8bIXxpHwKLgPJGB+BzM6dGJUOYhGAcwCOwczqtiMgZXFYLgQQqUcATc26p4pvZzid6JABJgKp4HnCTesDdMLAgghdajVNmJqkiOhyUOQ+tnkuVfQeLsvGQEIC4IwKCZiRZ132YUiMVw7OHwN4gmf0j4sbIKl9Y+diYUxDaG83ghcxyA5Kb8xcd5Wl2MbHF/L9SjmmSPuwWBBC0WCOFAc6olySS5O0ILN5gKGIGIwCo8WgMAEgxBxR3gMw+a8joJa76TRSwE4IxCe1IDJT3CBowPwEmuWgz8IQgMAYAYIibHIxK41GA2AU6mneCZS1YnoFBSKZxLfYYCddR8V/RkEEEELoQRo2UWQ8KDbFuq8wCoXQ/AWhWgwxFgQoapjnnekWMXGndZTks31+AuDTgMPmyHSO078NuA+Q5gEymYicOsqhAMLHPQ/UsrUoNLAgghYLoIU0SsV/qDsyIDmBMlQt8OiBo7orrmjicwy6WuNe48HJBcJhaWFql9YXsU5NUYhGVZiZIKAJwOITjDRNSkf75q/joE0AQGAMAMEYliiRU3O8Gwn8k0Lo7WhwCpWMwIo5CgskmNA9HNRJJJJJmShYELAhdhMDmdE8oDc/ezIAJIWAEyhAGIICmmtuveHlZWucl9Zigh2wYiwgEEEOCmc+gG7xemZcSmOPWxp0beJcD1/vsnjwwnz6WOGjwwkOPTYwjHG4Fm7FL7IDZjEmZVNhyNEEnBHeTi4vpYLQhYEELRTHLHuophwGA2kjMj4bhiZ2L4wQkLcYy5Hg7+tscDeowcOl7JTFcQ4IobicGoU67mhfMVrD+6ENzMGalEj1HFECEmAiSjm+ihLYPOyk1u9IYPte7+RsFCCck4KLM6AxznwhYLoQQsJBCQAEyVP4zsiSSSS5Mydo8YXMnX2ukPaJ7KtcIgJEEFwRggFglWdd9rGGJvXguL0cXJ7OW6xi8wdMDyb+6+AcHAlzsiM3NJ8n2ADmE00hhcB4IxplzlwOZsE2Ack4I72QeGetgQuCwIIKCF6UUdibCMtqzpAvMyiHaBg2GV0rAczrvIgkAQBYg4XHZ9FrutZ/HbV+2vOemOsx7nY1BycCfJ/7rdpMelXseJ6Q3ddhHErh7AeGai1GeOVbXuIIGLxcCFotaxoGJT/3N/gfASTUUIgAgJRBF0qLwJHIzqgs11BU2hIPEMkfzBgwxBobGR1Gvjidt1kznnvUDcvWF2GwJrBSwuO9BRcThkp454D/b0mhhwzAOuKJYOZLPiDTDlsM+GJtAJLCJOCC0w9xaZmUgoELD7HcjqSn0xXXCuEmhFYw3IPqSnsGZCJHcqOHkjgomJ/xYJl044ty8wBdg9bAtEYcqBJEEEgGCBFE4jbmsjxtYYQe/I9L0fIvcmLHQZDfED0H9uFrkOgI9rGNLcSg7qWz8xrDCcat1se4cMtU4BMAcpsNYFHgFHSNBYsbVQdzQAYABldKgAcC7mY7lS5Qw0DD/ACRnSGaktBEVYjYN/Ye8+3Wx7D8CQNjUCJC0DyLzrmDLUvBsYgRMegeR/bceUDUvo2NrN9oHkjYRtxbjbImjEoaDFiwuxaaLc1yJGSyHcLXzYQcqlQBFjqCOp2/z9KBhnxHTYMwusIHtY8qG+RA9rK6Mua9Hpg0tDDvZBeLDWLt/bdMSxOg+7GEkDiT+bDWUbZAhv0BfzYETJ1BNogDnLBFc4CugBcD6iLAMgso8UAuPjH/Me5gNYKTDx335hDPep6uS1CjkwA1IHrYORjcQTGAzELoIgExEIQSQeMIE6It6PNBkt39p5YlxDZTRnuAGwBgUFjOH3gLpSK8SZO4DdHEnUZUx4lZqUN7wCsgjEKZ/zuoit5Ed783KxERUHQcATY+ZcPekbMhFzXnMmOabtZQZzjHv/ZksnOnZ6zxvtHOybwDGrIITExqnW1sUwGJ0Cegw1DwWePifYt1sT/ocQxPGLo94cxckJyTkFn0k3a1+zEw3GPmxo5zefvZA97HV+O3b+yYgrLpHJZph5IFwDW/KyCKxneH0QSgTACQsjQ2JGATxPkm4bgic8TM5Oz4Af6KAgjQw73jTtzS5HGU7i3ez2Ml5/wC0n0sbpDkX9kc2Ec7MiuuQkL4BeeIkigAAwgBZHF8VR8BQuwSIoZnaG5qf9BwEzHAiYDEPdhOXOBcbP479rHho5C9qkdSxmrDzHn+yGYD5LCderI33qEPM2GypGb5CjQkchyU002BhhcoAI89ExtMj/pnaLNdcrvoUc3HVp4giwITHq3i1xrAT6P7L2lFpjO/AYwACDOMSixy8rWH12EJO0QtbuWKw/wBExe3oundhBDnE6xtJ16OiQBJkEYvM/EXvcrsc7/ZDYlOksBwKN/DJgoeGkbgMApfcAEBL3seVA3CGJH+iZosuFyvBW0BKHMMGGCWlhZ6ihRmaA1aCZrwRcixKP9kzoHMWMPYLkrYtS+Ro1iQAAAAYCyPqXDWzf/R+hKdh78mWNb1dMIGA3BHtf3EOdjR5+Y/sguBpFG6GIdZPLkhJpf6Nsu8YAHJgAhDGcyqbcw3Jmth/obzRCe4eW2GRi6mxpULgJMAYEPUvq+19BB92O514l4/smRWbP5IhwyOcmfgN+DWtl3p2h53CABKRgimJk1rExmP9DpQgA6h7bDeM3IWNuHpQ7qLLlbiA5C+7VroO1jG/Cfv/AGn7iQ9xIs9GBj3viBe2RdLMCBgsDC61MhY63JHUH+F2zmE29Q4s1CsKnUyGOaI45hOJh/wJrLhgxToiTfJ7B5dDfhjYyxYt9GwqdzZeyhbuCHb+1Xg/AgHzZQDsvbYE9gbCbrc4g0Xt6bVcEfFgUQSAGI/wEgqMPRzdKkUJxEY3sGKEzoC0WFPWjgZUBL6VUGmeAHAYWAB/rUhyHO+AYEzAIEkB4QhHkA5Rz8ycZf8AtPDhG4t3sdCExOsR0OwnWiYNpp4JYIchA19tiguNm4ee3OWMBAPTTaPccQOp5mwQ2UHnBEnQR7WVPeGph3/tugliE948tZAWCG6fJ9g08LSgRS1iwC+wfDmTHQ3R4brQEiAYjZwi4AOSig4MZ+pU2GVAATKgCFwK4yNRImU1MdA/SlD3WBRYE7P87zJxBYWEwdHPYmofHPaPQJPf9AbGNMXzpF1b+3KPwahSU2O9RQzi0KmLc9xbYNJsaaW6zLbbQDwUFGyMwbEkUp0WiTa9VvrKKC5x3ZHZ8gUCgGF04GvsAU3PevwTCzJQb3GssA46CokRxYOKO+zejERuCA72NoYBB1i6N/cewuYekxyNjOGGHWR6c9hENVusiznuwmPRCVrWFgHJYWRssNRBEwDklS6FAT4KyQMUo/AqmFOAi6DuJRgAH2FESAJJgMSn9gZg3yINEm91MzsRSsiyEiopdfBS+PFe5WUjL4ii2DaYGwGo5xqFSznwokASTATRzmIGmHL+456bHpR7GUTp4B7bAmIImiYIxsjeFkHYbJIkya4ycEBclxcB9CmFp9xyRtcLtCDPuIeqDUPoFD+bE4nxYVBRlTH4RiFegJbWtwh1BijoZcgTwz2uEr6hgGXdsGEQX6y5uljxGDvfo/8AdkCNTxOMTIoHLlHvU2V7rYRX7rcVuVKZHRCIcSvwAGt8QCCCHBRTmny/zvTlxP5ggGjciBWLnmqcAj9vsMPI24AgO532P79Abuv96J8TjehusYTB3PyOmwBYuExG1o32KZstF4K0CUgiEiE7AhwQQ4KO4D46P87/AF5EMMwoVC4FBMTTu2E3pp6DE8EA5hgZBFuYg2QU3Wnl/eja3MZHj1sBAnBygSRBIgCAgQcNhOpG0FihixSBk9ZTQ+KBsPAqVaEoCwqYlEkiSXJxKN4HZOLdPAp7jM/yBnZhUouU0Mdg0A5/e7WOejbn5PwB4XQXmdngVsfGfHYuB08LQpS+E+ybgBRA2VTRGgg0P+AGyNNXLAwGgU07ozx2ASZJlmgJsyIgQkwESUyfjZed/wAAkGiXwxu1jfAPQEkXQSSMDsAWTXO5IRBAghxec12bWGGaixckQVOKxIgkwMc9iZYxZB1SvOyDifJApEiseUcjhTBFOYSbGaFOUx7LJcoRyx+PgT/H47XfY2USYYDv2JCcIIuLhCQBhAb2CdqN4wHXfYyOGLgjgWRAMVYt7kDMaydbYdAAIMAoFuUlPDULcobF94Ax4wUPYCAMAh7iRGATkYI1IkPgRzTBurcgQAJODEEKDIQUfabhx2JicIIuLsplRTyJC43OSDGSZNayZMmTJrGTJkyZMpMIMQezScxywuO0NjoqHnIYWMNYbph3fBMKW5HgbulkJB9oQggkEEETBw2JCcIA50vTUyp94UiC0QVRAgyN5kyZNayl2QUzVBSEsQlzG4YTUlsjLhJ4ug62RxSIcICfTITP4JphsBULayTIUjA+47IFi4mhQQHYTQCDmAVigIFxbUIFkPFFqCgTJCMo2GTIkJg3qacZB4k6BYiOpR/YKdzffELoc6CmydA9CMShoxmGARAhAAIklGjcJr9vgzvPBGldQg/hWGIQmQAxBxTaiSxV1dtmaCIIEA42uY4r95fsbUEAiUQnLZONcwHc5KKNNzazJVDAeo/CGpuSPwNDY21zEI0ciqfzsyE5IBoP+melEgEBsyrTWEyU9WNBwyZWCdQQw01Ixikhck4n4TRMMJqzsdeSjiVQjILgxBIa7SUyojpwP+WclGNCfZlCFMCJJQUAB8FB5sLMFPRPwny+cn4URIEiCIgjBBGAAaHzY9WEwTOoTfXOTJ85bUkxkTBwWLcduQmICAqWNMMtqemrTBKHW23DQZ52EYyHM6BEGigCQ0HwwxYpwFiCiFAKBkBqM8rAPuWzGaezjoQ5UHbgpCQgGbFAcUGeEC4Eyo4p7HFQsoikcAFEsARfht5NowUCjeBYNoKQZtAiErCQpDT4cYxJDggsQU0ZJlCyGtVgHBRMabM3kH8mBx6ZxyUbg/c9LHY4JmfjNEjmQEmg+Iz5SGwy8kCABJwZEWV0oyeIqZlb+MVgES+MKWFYFhawUTeKhFlYqmQy+JntQsfbBH4imGRpY0PQw0CokQYHAd/4b6TcjUKgRFFw4I72GAimGpWAO7VHLFOSLkn4q7/+wBQw1CGp2thSJiHECfSLUb7/AHyi0BclamlR3nwpbHgNYxFgDHIBioqqM8V2+MwVGHoiq36aeoYWFsIxA4K5mTLwiuUYjv8A9YyeKoo3mfPvGQTaPiRPUbCQQgAESSmcSD+Qhg79MvjYqNcVBMHNKG/wQUfpFcWEACAcHAqIhaHYjZNRw8RHgImFj/mbyCSBs9aAzQlTAWth7uLLU4IkFKgb1fj9ccunqMV7ga+C1ywlqLcqePJyzAcgp0NJP1vKOlkqXjiEDtnEqhUZjUDHIRTRorOKj1A3MNpAhAAJkpyMxgUGvgoyXljfifkYiNpMimgPsLhNJIwgHGSDTFIk4ucegLqbfmd0YYVQXghjAPQminI+YspL2nuvae6Kp18ynWqXlT+BG7fnKmhZscljXq95ppKgA1x7b+EvwBBj6GhPbdyG75Q/RaXJQmqCOkmYaG6SanmjQeG3bD8sJ1yA5zknIaqOQTu3PG6Xy4xmjT63BUYzS5Ujp7N8kX0Iu6PnvlBcNHrPZAy0hoTokd0Py5CK5pFdQC6pycg4MuSJLg9Rj/5tjxIRIcwheyta1vRODHxoggkEEETBti4FKQFl/wAqvzq/Or8yvzq/Pphh41UIXOJMJaS/LpgCHZk2l0mcBKQs24OAwGQuCwQP9woADkQdC1B3X5QYnKHKD33K+V4ICh+8UxboJRnFnMkJfhc81pQiz3JQeDUr86vzqZYeNVFyK/GJNovzqA+FcAw+C+4pfJQKiEO9CgJ/AE8jQ2e9rsHrKl73K3ExwPZjc9pWx7SqwxQpgTJUzU3R0KnO9HTZNDgM7XYnEnAKlCBU2A0YXS06TC4TAE1JHq7ICQAQRAg4Wekot95Va/r3mDKwZMByLGRf3nP4L7mlkN3YSvyS/MI7VgJRGWigDdY66A2mamcPdL3NbADzB21YL8gvxS/HL8MqHC+FC2SaOV73K0DsdxiFMWLrChzFvta2PcVWBGcCNVjw62DihuTBHGYpn3BTUOn2LB3vZKOgY/qYqWRxeDvZBkIIGE5RxDsmsQIwCjhqg3EUOLAA6FyDSFFvlbBOjg42os9JRb6iqx9CUeeHLrYF2byACCXDHNM6vg3paWeuohJpafEh5qMQgyEOLHKB4duy9bXYmvU5XBw0jiVQgU4gJVhZ7Stj3FVkqxH4LGcEBIUei6fmvEnNjjCX2ugsa0ZxFhSZkaqm0o1KPWJYB6WGIjJNbYuK9IXpqLfcVJ5D0Tcxy62DWq8gAozjfNfB/e0s9VRCQtAs7KhjpALAAh6R7r1tbBh4CScHC/Vr9+v1y/bIOMog0hmbzZJ95WHHgEtJxYJ2kHeDQ2O40bSNNESKU4wXrK2PYVWGAblkxw6Wnyb7G6JI4SNzTiE4moC/aMzgzIMRaIXNxrFYc0gTcy68rxwHYnkgelgGYmIeY7r2lFskMU/s3VAAAABgjMIESTgiOIG466U+Ee0pZFdnA69R5XqfKHiw0e6eiyBjH+lke4wps3MUyXra33sMrPQ5W/PIvLXRmgux2GIsBJTDJ6gjB8EEBIOERZ7iqwiQpwTBR6hL7uhQmESRBcG5kzUgaFOJnfodVMTIEuysEuYGDivOiZPGzePMvRUXTIIJAg4ojaSSKurt8I9rS/TjzzOgxQAQ7gpnU+LPU1sMnR6k4C/XeV++8r9t5X7LyjAAl4gJ/lnocrPcVISWPjgXsxU5WGgwVVjBuSz3FVx+ZLC4STIAeo4jwmoH6wfKNWJMAxGosFgCYmIXsJHHJDA4Ceoh2sKFzNOTmOd4mNzrRNgIZjEHId17qi43EDjidyxuKmOWYUeUTw63wf2tLCzEQjgoPceV+g8olEnMH5TwHhQSFBMmVzb72tj2tL/tcrPSVISsYMLl1Htc9RVZBtMKlwj0DjcJ2CQY5JzBwxpYQOo9WQCQiDucHffZC8YZImaSpHI0NwtSHSJ1aloiN+AF7qi04yA0CWIZI601hgU4bQGfUZGw5aiqzwigzGD4N62lnrqISX/U1sCPAHeMHX59fh7RHvz6I6YRBncAr2uVnsqkJC3BzwJ42tbfeVWMT6nieyLzdMLhFCXOeQUOSwZ4RW5gEouA3BiVawpQCck4BegsYclCnIRoWkxDpZB6MQOCiIraXAoeKUACBWXIzh2tcWgYXA1NnuqLfaVWEAjBgYwT2DDxKhswEEPRuRgWMD8F9rSz2lFI0v8Aqa7B6eVehys99UhIWmZnMMCpWQFI1GRs9xVZLLwDcHQgch4vXZqPisESokQPiLRTCZGAUKAgK3DQboK0mVghmYGBB0d0QxCSLkmZs9VRb6iq2Z5g0smaFgCcEiLGJfMPvf8ABWkIIDAZrKe2SBHIGP5bCv8AIww3rKe2Synvksp75LKe2Syntksp75L0+NQLtgNIMp3ScwwXvXZDbEgGAd10MICGebhe9dkQmIFhG3STaKgAfX5hkJzQClmOZHsgzFnvnmsxsvNeZgC43IK4zDHuUiJ1oc2Zxua31mmuHWYIlCF712XvXZFJcgmZuYSEELOK9K7IjEFA4fWicLAOXYBh/wAqL//EACsQAQABAgQFBAMBAQEBAAAAAAERACEQMUFRIDBhcYFAkaGxUMHw0eHxYP/aAAgBAQABPxCj0LxPIeLX1B+OeJqeW8E08E1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1LU1NTU1NTU1NTU1NTU1NTUtTU1NTU4zU1NTU1NTU1NTU1ODU1NTU1NTU1NTU1OE1NTU1NTU1NTU1NTU1NTS1NTU1NS1NTU1NThNTU1NTwHNeQ8man0k1NTyzF5E1NTU4PMmpwmpqfTvJmpxnFw1pywcJqampqeRNTU+hnkT6CampqeVNTU+impqanmTU82cZpxafwLy55jzZ5U/i54VwfXTxHA8Ji4TwPGYzU1NTxzi8qanin001NTxzU1PJnhmp4Z5U+hMHgmp9PNPHPPnhngcJqampqeI4DlvPn0M/iT0U8l508nX0xTzJ/FmMeoj0+vrJp4X00YPqIqKio9GeiOM/LHLjgio5B6x9Mch9POD6UxeKOeeqOCMI9EfnzinknqXg14HhjlvBPA/mD0E+rcJ5LynmP4qeGanhmp9Q86fRHE82Pxc1PDPrH15yH8fPC8ueVPKP/AKF9K0cqfwpjP5NwnmnImpqan8rPNPSnE+gMYqPQTU1NHpI/Fv4J4lDNHeiq9p9CU4Qx1M/MqPgv5ZqLHpp+qpzbv5rlf8kaJoeaBtj/AJLqOe1/qGpufdyfcU2wZr9ZKiVJM2D7hFGc4Og+1NPKP/hJ9eoZoUHkJfRkfE0c/cwPzZ90MF8/qY/dRqcyJ70mhgFoIKeQYeWuijPuSglDad8T9Km99AHwPw1sNB2+UfBpAR5q9h/+LfUTxTRNyo/aPaa97EPhD6KIQz/3QniOFsBzTntNWhM0+iIpyOqifkV/Mz7TSC6d/wCqaNd6X9X+qC+xKlv3sb90j5vpP2VCjz0B5lTt+VLe0K6zwEfHAkbNOfmpqTcHd948JUEBvNadVf2mmsjCHcDcppwngPTx+JcD0rjNBAFSALq7FD39oGDoX+FTFXUID7L2XrQAACACAwKhC/8A6Ya2Q0D2SfpQjbQDD3fqkj0IPYg+KbqBLNc6V3qamp4ppuQwnWjgDkh+4lQQH2x8J+aMDW4+YPkpS35mztn5FZTWBt5MCnZuII/aNnhqG9ay/AfQ81LEn9JLeDUVHAck9BHoj0r6rUzk+H3vMDvQdBLwP2cuwDGULkhH2Mz4K0Bie4hu80CdfCxtFz5WhiYtOca1NTxPJmpwLZ/yZd4s+aLWswsew+SrChgQr0zvcaVEBIjImGQMNW8NQpXGcrpn9jJ1K2ZiaTdZDqSVGJwuJzT8lPLmpqeCxVkSOjHNdCesVBPfQYfs913rWuBo5El57n2RSIpYhN1dvA80gjZX75b8BwzU4nG8BWkNyoiay3jyy8RT7yWud9+2TrQMcksHRMEprqFus11KfzVL95kelu6k1qgIo0RyeCanB9AekK19BNHLfQH0w4Q6AZtRFlYs7xfTy6VAhIgGwGWBEoSHxC/lg60jPFpkDqfh7qZgolGVd114Y4nGKaIqQRAalyrrZ1Ow5YxyJwGnIhS3um3mz1pE6sTle+fnbrQZGlEibjU0a60M7A5HvfZKI3akl7bo9V++dJTxHOPwutHMeS4zgIgkNrvNLtm6FBSiPOB+Iu6rhAtUYG6tKoGbMvd/jTWmE3J1dVxcI454CmKkKe9astqTkagJKZql89ezQQCDCJCOMVHHNThch0rXz5vtbo1MlMKDcTTqHmMBKxdx/wB61Goo5I9P/Y6512xPTvrZ9BHIeCxRZS8Mwc3dyOrarz7IzLVM03cL07Kx6j9j5yqAKeUm0v2PgKmp5ThFRUYOTX9XQUUN6hDZbKdH+qeIsCuNNKGauQLIQMC2nImgUV0h9j9KzQHMDw3pp45ofZmm5CXGjjdiAD0Jl2W3DOiuiJSByR1MC7vQwn66uTrvSYGRQtEwPQThNTU1P4A9M4tAsaXX7fUzdLXog9jAGQBkYTrgfdah9eRrOVXgsDHq8uOGMJNymgn7hCsrGVFGdFRbOxDf+nSgpAgYRzHarpHKmClz5yJ1OZ4daWwREHHstzxUpiyL17ns1HwLzWnVX9ppVWwh3A3KioxcSmAU1zcjm6ZPTOrXNBlqA0emCW3iKx0iz6sz4p3uRttA6rRMB/DaYPLaPUOVIPGCL7D+J9MwAAALAaUVsVCAGauhRyGl6C11PcOkF3SCxgckwWKjVJqIe7UUlbSv4qCmtoD91vx1X91k38GizxhKBGR7UUUYw8BoBppfP2daSp6Fh69vaudQo7IY8kJH2xZRZEPhtyoaivIH0+wikKtCpeGnimpixgvNgfTmaUzgMl39z4E+GirDgYZL+R6nkvSNnRmA0TVaP7kwOUHqnF/AuISOkLmNLbofTMAIMqXNBiBZq1DgImUXs7PJ2G/BPIjF39haOCF2z3ah+qB8jQzQUF6FChgKKMIo77nsdHwxQhQyGyMOE6Vbs5H0qcKFbF8jrBcqPMSsEHSLDtD0adISBCOyaNRwlObyfmCajqNJRPM9h8/yNd2msILdK2d1qeS9M7jkuJomqzHmT65z9LGDxuBUYmxW0P06uuW9G2FACANikc2iQs1dClaTC9gZBoNPJvAcc4GEFLegeDWo2F6FjsZUORRRgKMAUUUUUZ1GBREoGTsH7mgqXWaWJBIXiG6jyLpid4y808JLDIO7A6e99ko3CdJT2tD1X+6SmnAwmyWm4/sckbNLRKINh8q+G2ylEJTL5DXqvhvvLDtjwLMf/gHicRingGho3/gX2kD3wYAyCkQgJVYAph8OqI3N0uRrntTwRUcBV/EM1buNQUZaizsf7iFDiFDiFFFFGeJQhoRI75mA0SUZO94qOP2tEdhD5PNPSUX+O08F4Sx1dg/49cymCGnIP+GzXetLUlOM19sYACajkmpQg4OfPUN1o+MzCNRtdcNO3TctthH/AMNb/YLlrdILtWnjLEL90/BBpRR30TN/J9v9U8qJkzwZu+1B3eQQVmwFFDgGijEFqyztQOTPakwdcpX6pPqMQfNIijZLYkZmh8v74RgIwjImY706A7ZR+TtLuU+Ok+6mzqSdacUnOgmXSINSOm7I6XshFERGESEpwcdRRthGf6nRhqLgYXI5lon/AGiijKOWz5Q0TPbu/OHKhWAV2NatHBCl87u69VtDCAONgZ5D3rnk6UlVVVZVZXgjhWEuQVBw7mnZ/vCBRRRRgDLGSk+Co9R9B8c/ilom6q+T/lQLHP6NFKoK6KgM6Ir9CCkWOOpH4iuokGXzgUEtQuymnSx9U8M0mm5O/olJCbN3nbz/APQ1qDYogNxM+AApiFB9D+L0zIEQhEzE3pp4ACrLxBoH/oSbUSXqMiEiU564MiEI1eLZu5kvgfDr+AOJ5kYx6AbgjGsN57WveNnDL+IbCmT330BdK6a38aA2AgDY5EUZlL2O9QK9+X/lFGAcQwWGzASvYpANdaGOmb3ihzVgXxl/dqKzl4fc1lLOweuQ960QpfttvYrqO4L5pUUUZ1GBS2UN3Y/3xWl2Xenj1qP3yW6yvmM9RpNl3IM7NupZ4CsuweVpbdtHXMZyp4WvmqHW7Dd6pNsEYTLNIyfYffShNlDCTCPZ9YepedZfhsZBuvQJfY1qP8Q6u67qyru0hkAJVYAp0uUBktXvp0jdp4yg431XIN6gNnms1owFFGJlAKmPnY6tRU5svgch4nvUkFF4z3lekRAJUwB1paArSQ328e9Joy5fX6+Zo4QM6MbgzzHVf4fbTg4RxPB/qjUMlajULZhLY/N0ZnzwZ/RB52k3a7N8ljhH2J6EGRHcatRCG2SxNhfvJpgcYIEyy+bN1pHqzkvNnnuFryIRcG3uv2MFvd8lfJfOQ6UeKcDIlZVmXW+40UUUUYEPjCHYFAJ5wCfwHY96Harhv1LmvfCII2sXewffSlJedCe/+qMAUMQozxPEMz9dzoZ+xrTMSJVzXVxeKMIqfiKoSjLTUbAz6++jti1tQEgcxNSgSTuclqvTM3Ozg4lTUsa1W7G+R2TWg7gekQkTxRoml1R91J4w1M259yPM+vn8C1B5uifwNh3obZQEALAVJHlawaHVyO9IbviTIHoEHICoAq2A1opYOc26UUUUNGC73uY/N3y71AACPen9C2BwtYXNbBmvaropZDBdUydD3oYgvgCijLDNWaopcldXYDVatWtRJoH+u+LwvBGAcGtQLJGmUWIbAyg2dTR8Y6FKRI/dD+zWpzCGZbB0SE78Bg0hSNXRv5H2TbC4QNou7n5M9l/BvqYqOC7swSXHL5v5GBl0Ni6avm7tu4YqMIqACvo/dFGJUIeiymwURq3c/sOmXegAAAQBkGFgblmt1PTtnSteUMh2GhRQoYhgKKKKMgk6L/XpR6BJnf4frCeSVuxMqyA3pO5wAfLyWV1a5ZZkjWZb5A9OfZk4P4kjRNQ1RZKhmTOZYMuo5jqYgcuKRfPfObtNDiYTjJL8aS9xSutJFET70tgY1kIR8VNamL13tWeo/mjFwMo2C6p+1u6UV8oCAFgK68g2wWDqsHmujuNC5DoEB25Fl3H+KAABAaVNTRgshbpbeGh8ulTAkFeHofB74KBVALq6UqCm4dNz+Om9CkAlEq7rrgMQxCiiik8DsBddhq0MuO026nfq9uWWkw8o2ANVrcCORNHXq+DVamhsJMXmcx+RpmWyqaynRLrfTM9taG8DIEwJsCESRNmmTAptk371J26uEq9ZOa5pa7KcA2pDGr3Ps+dGD699QcOZE396X5gYEvywm9Dd5PhTxgqASuRUVr3XXCamlUaJRGkNuq0K1kXfb41frTAhVK8ANVpIK2yv8OjXXai+AoxDgBRWYVJVfutD5pppALDsGnLLoAq2A1ow5kHmQzeoz2Lb04hMg3IJ285eaKE5gGKZtTmZn25j/WOb14y8Hyie4ouSXHhl2Q0Na3vHyFCPKNkhI+1FVPTCSz3GHxUOxR1If9wfWTi+rKRcWLVMB7tDeSxNi7yy0IQSjIDNp8GWB6I+wPdaeOfPQ6sDThfG0VLHY3Wh5aLIOAM11Tqurg5ny8A3aeZsGyGX6dGt8qGAooo4AUIRpRAG60jk9Evq/b7U7ZUolXdcJ5DglqUE57B9PO3Dd3ODWBjyvZg4GEYhChkR3mrDYhtaWjsL+5pj4ByrrB/AHDNRFy+W67r2nAsQywLEPuSe/wCBeW+gKv8AQbE2H3D4wXL6hYd7wKMaZcRTACUwFDo5d3dacZKIiyTf6roa1HFHk1TVd8HREXgBmrV35GhDX02POeWIUUYDgEjadkud2n3UJhWbEd93q83RMmlN5f21T52sRsUaJkmnC5Au6GXM6MuoU0lQEKGETRHEpoHiHQbbzX7LQiSIjqYXt5qF1QfaTy8ViBNy0bvuJgOHWgLxYfd7Knap9U46c6OeVa0l/g+V7MLwUQ83wCjxFThbHd4LcBA0Gq2Au0N0FwRq1+jQwUBVALq1u7IZH6uW7fahooxAooUFBREA9TsGtXkraRsdXTx70ufXnxygM7SC3NdzqFDqUQkRyR4YshzYDIjMZAzIcxlq6QMl7UOkRIwdyx6E96f4jGTvEWuXHWHap3p3WM6li+gcA85IegiaNuA3UR+p4XxVAaIJ9UsU9hQP7ozSatUQns0H9/dZAfJD5wPxpzCWwlWDd0qZo8eyvdaBEAEq6FOk26MnA9hTxFQBP2FNRRMVAAJV2KiSQL8wP3u9qMNfIkcuh+/belgLErB1qU3aP9ajYh1iPkVBfPI9imhN7feJQs72j7aLmvanRr8o6ZXelESAwiCdqfPsrOLAkr6BwVpL1rh/0HTtwzQyAWYLvmtafQZc6p+9uy0nRijNFkfNbpqWwI9qHhcSBgtG3/M+eEYqLmeaf908UUAOLPLf9o81HrNfRvHPBLUAHn/EPNN6eRlJ4tAgBkW45OyWXsU4NSE6MFiz7ch17YFRZ1G/RX10Ot9KmfSZDO7F6lyv8wvvFQmxE967UQtP/cSqDNaAD44Ms6mnQC56jP09xUPBzrFsdvtutFT6Bwgpdtxv0cnotW/Jsso2XsycRhogsZCYHsnwoHRR3NKh1X+GZxPnDNeR7g+H34Gpq1tHP6ZnthnAF9x9Pv689O4GJkZULYAfGBKDJk7ihNTxTv0IfvGSkZtt+g+UoAoewD94OyjGwsC1C1JXogF0CxeiILoR8cRVvewz8wLS8HYtfcM+y3fOnK0RgekSzygtgWHY9+QKYSy1tj9vFRDS2rwLsCdxXiigg589R+rTnbFwa2FPz8EEhZ0UKuplhr6wx1p9OVnybwE/26ipvNyOqX4MU8BXUTVijRmgl83uOb42xjgVDGYB7tNhnQX7lvmpkY0WP2tTH9y5BUtZ9V+2lsZwPQgWD71pk/fomoCWyjY9M8RMdSf+Ug09NQTHjKnhKLQZk2CfuhbQbdER+SpFkj/mtLxgDUvzoh+68zfcs/XCzMOd4uVlDu8D+6LeQDcCP3QIIVO6R+vwE+pK0UVeWPgMGkJD2vvB4DEJyzqN9AqKuRxbCT8r8DQAQEG3BmNcODy0oO9ftM/A0+gbRN8j4CnrFeS/nGaWmskll60jspLTyY5twEyan7ZHinhKL9MwHg3ehesxsvyCT1pJEGF12q/gVdJ9g0Z1ZmA06cIZ07aZXyVTUTEAp0t+uR6tYLsTW+EzulfujOmRZZzu3j6gCgqY7KcvvHV65HxRN/dF13Wa479IGeyXady5gC9TIeZralNk7GR4qZxnhcdu/Af9pp5TzHWAIJzaHywuMUCCaBzDNYJtLM1ADsl+AyPAU1FPMQA2MPy4P6xMP74mcZjDYf8AVhaKALCHqTgfQHKMIzSKhbL2sFGywe3ppHMxL5p4hPVH4o+Vs5P+PXrpvQ8MDwBoGB0mhAOq0AEt1g6vn3bdGrl+5od9umVPIjCMTYB/f3g8p5l749yHTLg1O9a6BnWHD7RwTHYK6svg4ACNrxKy2ieDBFJERd/+n1R6/wD9YoGDn5vKBAbBTxDtLJycQ6GrvEUSEBABAGEau07zP2PiagSTNr1o1er8V/5FmDjOJiZ0quavzT6dVYCd0P6ocqEPN+BoiCED3HyPBcuBTrlYOjy9gfrig0vyhw/8C1vVD0xg8ZuZe9Vatdsj3VZqcCpxslqvdv1UUM4zmxt+nI12q/dEAbrUOcl3kJNbAzWoxl0WUmNjbC/FTJNPp/lvqpmz9zLg4gSZh7h/5Rj1RP8AU3oypApBnhn6o4Cof+Bl/uF3V/0fmRJ12r3pRF/BWZwlNMTEjVgCue+14d6aHudN6jbCYea+KePTdWH2O7r7VFd5+4ON0Wf6qMnb1HxGiguZLwkN8AgmBC6DM95pQQoJosNGCk5nzE/dMVAKuwUhEq3eT9uExA/sbYJ9a+qmzJVTm13+fiszxNJgehYiwnuSa0s4dq6EI4Soob5VzV/Q0w2A+Bj9UYRIm9qmDMU9QZhzlVlo+NBTwpBDmTvuVkbH2AkagplbOmhMedQSEkl1I+SUQBtaopxKl2Pul/mDN5L+PQH8PGH/AIK7Vq1NpM2fKswenFFKA7vnBoQNIcDiDmIui27tG2BAGQYWZkifZ+6Mds7XZv6hjf8AKT905tPFAf8ApN+sHB1T2l+qs4Qfe5+nvTxIxbE3yYTf9hj+sNec8ZhHGep66z2M0aqQB5KshNr7sr4r64TBR3IxE9GX44HBHCwGq1BM/wBBtpjMwlA+M/heBxyxn3P+eokKXRWaPlyFx7wfY/RhqRP+TRjaEmkQ+Png4xgmg/JOGPN1gGvqo4n09wbiVeCVF6xmgRZJDQjQjNpD9YTiYOT2e+PxGjhFQ5ST8/p74TgRMko6NZ5rfhrTCEySeYovUehUGFJ2moqKjB26TY1f1nv5BwW6B0APtrSl1MDtP+ioRgh/w2Hzxo0RBu4f6sL/AMnZ7vThy305mUM5PRp+sDBliAIdLeIxKcA0ZoZJNb4OOvJw5mpE7Gr7UXEAHSpqanBAHxh/pHtWmMkiPGbmEc9KQ4dV1dgzXQGlYkx1twsbGgFSqt/8SMfFTa+gn4H4aZiaBSO6PhV7FRNV2hvUHRfDW/7LHjkOTKI7SP7KavMXdcxHYh8UAAGRYxcTOpYEU/N+xgQbMA9CfmJwJp03oj5wIMZq6kv6cRRU+1CHxh0CSnPgh99EzfL9cJUSFp4mXvl54GLAbto04RUI6NRi8trITQd3vDtYXYg34TBickTIi5M8RIFpCws4Lvep99kAPZEfNBxZIh6QKroUq6GdhGx7AYWwFs3wb2Zwzg4qAy8HVsVlLO8B+qVaGNsBNZgZvJ+3E+m14Wn1BMMo9WXwcPgACByAsNpcow64FRUUcUm7jWT9B4xcRoREfJ5nvPBNW1cNP+4PNek0giuYD7nk6HHFRwdsFLJ+0PFTQMgHYxePIk/8v4wQswXfD+aQFjItwGL6p9T7fhNo+GCz0++f7OMVIVssvOM7c1PhowmQu/PI+/jFxKKip/OPJ88BU4JqmR/lpSioRISnCKjgioqKSzcmR0Cm4ABZWjo+E6t8DNHa+98n61ikqyfBIO5kadUQM0ZfNvlQwvOsw/rrWRALOemR8LRkOnCil2ilGwuhMVF2aWdKhyCrcwOCeEp72MPWgoFW2ChOZS+XCOB9S+pdWFPqCfJTJz2kA/uiRgnuEP3R9wD9W/Tj0rd+Ie+E2c1nETXCXsT+8JwnAorURUncufVZk71GJViUCDMP9KleheTyaUYRhGAVGXWxTdBdsX3vLB3pZZce9Gg6EGBDRyrg6OvRfeKQoC5bxEPvWcHBuQgmzRIP1Z/o8RST72Ze8v4JoggaWHR1Ho8DK4s1m3zBrMNysrpZnR5CiEkuU8mxfOd/8pecAno42aXw4phNPoyteAxj1BRWcm930h4orJEcZaf3Dxio25XHfGGF0n/aSkQaknsYuJRUHTSn2o29qiowRTWILq6UOo23GlmV9VQZekEPuU5fvE1kY86BqFhA+AodIbxw8LPxWvG7fgA9mijPW9pbeAUZQUqQB1ak8tpgH2HiXpRGFusiNvjCDpUBYANjjKCtdWno7nRpXRbPnUs+/srJQooenR6cENHzmh2PeLOprUN5hQn+dcnhMV6Co1QD5aj8j0awhfLLRlBKnQM6me8OnA8A4in8oVaais9Y917KKubSDtewz8PIRxYyUeQhOEJ2E6UQgjI0AvOQfT+sXh7Kju2PuiIGCKioqCQgjmU6dVwuPZNqhG5hH3B+KgWslQeTPxT6Wf4sKFKdV/k1HAdHPYqRKdk/gqXEDIEe6vxQr1mvngezTJWMyAdjHwxeKMJqan5DbuOz2+2yVabNcXrZPVfZeBORDnXrbOGlt+Exu0P+Oe6cFukrl8hfElABBlUVHBP5aeSEBqDc8knmuoi5Ak+6jzCegij1jukonzn54iioElm/dgVGz21fqpanS9Wf+0gEFEiZJg1FRiU/dTpGh+6SoqKioqKNkCEbiU4mR5ez/tBQprhlUtThPFHIzzypgpxKgffSbmk5Vca8IH9pTq3l6+UHVYPNTl5bQXQ6BAdDFwMUtClc/wBzgL7sbNq3tD8KMHkRz89NuW7eX3gJB8kCwP8Ah7qOIaYEhGShF8mzis1ZrsoARp3vi9PqpEERG4mvCVlqXl1en3TaKpV1aikqGoavV6hoSIEIkjU4WfmPbuYOM8UciMIwkumo7+hnXWaPSXKQCyOmekvThMSDY7Hd8AWjtnBoEB7FBFfDQJay+YOpseCDxyWj1ZyDgjmxDVC2FfFA7LCEVwHVe7J6LT1UcwQwj2eMasK0np1qcEBFE1q0gGm/aoY3ezxtRBuiCPxf4oCY+4fqibxsv2xQiVNb/ifNMWVKkrWeLnzUVFRhFRUYDFJpTd/jDSAg0Hyb4RUehMTLlYHtvWshYWkpVleMpMibKaTZ8h4NFWQbYclGPYOw/hTgeU8tq8yKOiZnWo6k4DzPhHlhkUmUFjy/D/hyYh7M25Q1NJERRMkooOGh0eCKiizahPUpKio4Y6UFbdYnM7OlTWu8gdtGmg3mENRTzQlAFXIM2oYPdWw7Z0JiC6q9nyzTK0s1c2nHgNqeIqbwexbcugSvaosCnuGr1WXzQ5DKGADNpnzJhdLHuvgPo45D6E9A4EVuZFi+yXyNsI2gkd07aPRazSSQEwj2TiMEQjCa0V3LmfujFgS6DqUaUR1KOAUZGGiN7bKjrUVFRUVFRUY7Omhc7OZUwt/oc/up1WerD2z+KmA2hDgYRw9PLN9KjpKah8M6vAi6MPdv9VFT62ZHdXfFSqcZGw8UgFWxVhsyOvXkpEhIjKdrukOg74ZaAxNzz+fs7U+meIp4orXlHG8lwOijuMJUKsMdUFvFfvO2FntARbL7Is9Q34jEi8JWoTU2oxmyj91DwdbJxMCRkzolyXfeoqKioqKioqKiooKLVFjdi+1MKhO5RD4OV+qWsQ6h/dR0/nzUq54/7oTYugP9p+f5DSKjWTvI+aUAHsAFSnlkDz/lSx4RPO+DV0nW7/8AKanjmEOPp/JodUrL+OUBAVkXlIAlauqA3/URd6rwmMVHLn07wHG8h4Fs29PJt3q/aTWjKCEJEcko3rTdR266jvU0clhAuT9OyPJFrf7rV5qbcNsU7mVWJ9zL3q65cqMIpLbqMZU4kVHGBFHAE6FQs9GW/tU8t9o9qdtngPHBfr1u/wDzB4igVAKtgCVelWgAbj9RMvVdsCzSAss3mzdA3weA4X1jU1NTU8JxPDHGUVGyJLXHPv0f4wG0wrlDVesW2Q60iIEBCjMTfjnA28P3UyLDPZxMXejStGX+Mq12bNmoqKkpGGoLGepROZUVFRUFRwhFBRKs8TaZfYoVF97H+1Og7Qj5zpEUq5rnTigKoDNaWcxq68qFmxDWL+v+MA6C3sL/APo7A03lp9Vn40OmDyX0Z6OeF5z2xBaH60TaoDdZynmdtR2cM8kkXQAbOXVDvTbkFOSIMkqMj3dHCeL2YJtXyBkNfQZmtc9xSkzfCjZh73rPlXWomWdl6ls+1T2asztXy8Ar6Yy+qyHv390f3Yj6msjH0k/NTMHtYexRbhKlpB8tbScsU8dvtxbmR7B5dKDMnIAyKGA6hABmrSmQZ+RRvo2I3eBwOJ9GemnntNG47LgugnUe4pRU4oyMSJSpSDyBIRNShT5auot9tTqNPInCEk3dSpwibmBxRwCmSnZoDIeyr/2dK5p50q5q92oNjlz8PxlP5Di8afNkAapoC60PJpWGC66aBoUUJAkSeoF3c+i2tThPAcT6M4Dgn1zgeda2yOd0b2ejahsTuz6I6I3HRq98kC36Rqeck5dvB+6s/daUM0YvJnGampqampqcBNbYzqf7GZtPKMZ8OVZBS6MWcDnLs1dW+wVJ9Oa5kJdNDV6DSXRPyoyq6q8B+EeGeXHoEEhJHSroBSFyMzaZOp1L1nn4Pbton/G1XZgAjbtk1NHpC8mcGL+5lVt87KhEkZN+OanmZBTsXasRjvrSllVeJ4T3eJksgNWoI+FLja2+/gWzqAmYWEH4Ga6d0KX1oiDYDQCwU8bicMegOCeF4TlRg86MFKMIQouI6JV46osFqdOprmaxUil0LSto/CWaf3NQwLbYa6OpDUVHFNTjNLyvZRLG9bKygjtZRc4I5RU94atQX7FSh2FnMiinIKlWQFD9DJLsz3d3gWzpesZjl7B9uQXaMu3S6XpddW+DxuJxxzT1kVHPMliJFcR0a2GOEvY3+RsUPJcmytE0G9ZBDe0f+Q6bCU8g4Jq/dsa+6JTM47NLze4VknmtQ+T0g6nvSmqe9Jf6Unn7tB3dhaDmfitNO7NZqg2spZZc+A4XhUi0B01VyA1W1GLTIbBzmyN3N+KKhu7k0Ib9cjNofACpO3bu7q+Anh1wmp9Qcp5Ry45w9aR4MkTJrVX7jo3Q6MnTbBUTCgHRKEL5NI9evXzNZzqRJGTpjPFNTU1PBOMG2Fqmp43F43w0EZi6uuwX7F6susiEnV0NhY+aasfRH2n0NVl1bVmbKx7F0N3N15pxTjPBHIPSHFNTU1PoGtfm1PKLN/dn6ffvRlBCiRNxwTneVkjqHuFnU1pD32UPc0TqWp501PHPInjiq2Mm/wCrt3QM6ORcRwder1buF4rw2SyQydM3Tcz+hqwNA0GhjOE859Acs5EUVOE1PpyjalXflp06rbRVtm85nsZro4WQGcw99Ltk6lQluDZPR06LbxRckub1GE1PPnE4XjkP0C+TkHbPYpnLYvrra9V9owQigAlXSs0CRZ3w6vYaTSEsOks1XNqfRTxnDFRwHJeSYPqXgFoECXHbW+zRqRCyMw/J3X74NJGlFv7p69SHvU4IR7KaXow9KSnGfQHC8KUmh3xCml88ufbsdrupQfAiGHXq9c8Fd9TOfZXVIBfZtHoadFt5wPRPpjhcX8HGP6ZKEtQDZHu5ejfrQc1yqG2S674C7CEA2Rs1dzryFHbPxt0pPdMfDHLsw0XwjgnmnHlcyd5oyOrRYs2E/T6SalxBbT1lu+XA8DKEAbrUdqlZ58l2g6tWifqZGwZDoQYnMOOOM5xyH8LGOV4OIxs6J0ZKiVyi/fMd5HQrIn+Pwa4GUFCEidSpxriIG9czxFG91xoDqk+y02GIVLw34TlRUUcDBnal9JRtby3fA1qai6XRzPEUGMaWXVc16uJeSCIi9vsu9KvJq6f2n3t0Kn0BzTGamp5R+AaPQFSArNa+J5FWOjpfP+jxQ3WtnejMHuY9JVuPacqSYeR94vslQZTIJPFlBQlrflD5oFgRTSeTGEVFNiWx1ouk2/QCkEPp18nuCmW3UXalL9UiGn/oBPGIwGlEAdWp+5RGm9j5Vpiadc2X2MdKiCAA2PXmD+eccy0bH5KRGNptDtQ+TzSGkF3Ohn3RQoykROycBDOuaXuiaVVl0ntIpK6S+UDRtsac+KOhjux9FZH3i+0q5gEy7EOstFjx/wDoaGHoiT6VYJH87/oqIQGYKeAPzSAvP/YToUKZCB4Mc6PBhrP3mhji5Fo7iS+U7UylyQvjG3vLU29Ic0/+AeIYRs3g98j5Khv/AGwFnxQyIzWJ5u+KjC3L5yhoRJLm5g8Zg4rh/X7lo4ENSfdHyojZuZ+I+WlDaBsjaIL5WtV1brvU1NTgeiPQRwRUVFRxPPOW+meRNAyB7lGlJsHtMVAlpp86A/NQoCZoZ+UpQBnVF+EUSSPQNF/un0tGX7z9ZSJm1JDwC+4ou99PsUCZjSL+Joy+7/AgVKwHde7aZ1QfEolOENmsvdvUrxHPOE5M8B6s4Z4TijCPSOJxnBPBPFNThFR+DOc8mOfNT+EOCanlHG4nKOZFRwnNaebH5J5hxzhFR+Fn0jzpqcJ/FnC8B6h5BwT6d4o9HFRUVFRwxUVFRUVFRUVHNioqKio44qKioqOCKj1R6h4zgec0VhiswlvRq+x/ykdfx/yj/jf8o/4P/KYLJ0B/lBZgBg+S/FM2KAQj1NKcFJpEAyA3e5R/yP8Alf136o1P5ulfw36r+O/VP8t9UK/xe1B6ChSCIw63KPEQGYhN3vV+re7tJGphoZvThFFWAGCDd7lH/L/5RkzwCBLbWxjYJWsmgUTdSCfE07Cc5I+ArNVsYKPwTKSfcSnDIumD3ZR5it+lngsErBWUzoBOzCfE0Wp/MSPYCjz2yE95aVQJp8MT7ra54o7HJ8NJTS0DYiawKQX7tf236pp4fQUKQRGHW5U4aS5UV2bAuhlcHSnR/u6VA7gUH+uQa0ZcifwTyl9FC8KEcID4oz7MlSCCIAWcezpk5mocgUZlOkLsDIIiCNoalo8UFk0+rZttjNLgecHU0TKmADdafbAFx7DIN3jdingGm3bZNsJULjnWl88M5EhbXLofeRNFpxLPXq27mXrg4g7eBW8NTFAGWPm+3h0pBjoEKLImjTVwUDm0ZnehB4BpUgMYIz5g/A1zbRNaTuMh+3QNWk+d7n/u/jI1WeN/BT6l4IyRghTWCasiXCf6KS/q+KCm5B+zFCUHII+6tOpJgfh1bvQbIwnah2iFslUSdHPzi6Qc3lhCMT4pA/h9qS/v+K/p/wBVs/z9KZ/l0DAYkbLIYnzRxO97YMiZlJXPqvI3ubl+JUQ0o6wBS0bPgKFODu/ACowSwN7xeDuz0ps385eiyWWs34P3WQZopnpNvBayXgMdVk8T5GDtTuodXYCVdij9RXkbnoGQaHnAQ8SeDqtPyLmH4CfBVoFvH2QHzS2NiSLYkp6TOMIOAeVnHY9zsU4AHNozKMUA0y2MHZtD+J9M4tamljagGrQNZZLYO+xp3ywmpqampqfVH4J4G7f4rqfsvqnADqnD3DoklNPI+0kn3gZsDMbslDhU4b+ZU5U0YzV3B6TmMjk8usf8rTjhXGXSfhEqOA9QMiiLLzMWf3hALNcrNLGsKvE6VMk6YFJJe9CCAFiQQSt8gMAZ6pm0sPye5gFddOgaBquQbtO0JG2NH5LpkVLU1cQ3NqdTZME2RZvInJjTKgIAUQjk0Mq+DQvgdn2MJDm0Z0KYzdwLzml8T6ZgAAAGQUqZrUCzVpGk/Wyj+Q075TPoDiio5ZyXnRwxUVHA8FYn+a6vgFRUU8MgQynN7BK9qclRi6gR+sHGGVjRhhiFDqWqRISnmlP6/mlf4/mv5n906X8vWkaPcCCf5FTT/t1wg9QNBIYnrFaDqHug0RwerNvPM6sk7OZTfy5ov2ajqPBOYGXih7gjLmMdxg+WDel93bdHdzPatCEFfIHxRQT0o9j9KtqtS7gblNNC5AerI/vCLcJapEHaU+FPAE6p1KgObvFU8svNNZejcxB9HuwQObRmVIADtEhXel/hmSICACANqFdanADNWnMoMlodfRo8ukUcqKio4oqPUvqHg0geSwpiRJqIAtbupqeJVEdJmvdVIScBsbGg7YCoQ6Q0Orkd6IeOqA28CDxSwKcDH+xvUxntU0+9R2eQuOwbPkttRXtpyJk4QTFrLR3l13eNaFiACFRomjjQm1FP8zAriO9FroCEdT/xdTKhXfIwNxMSrNSRH4Lcpt03MzMiGZ0eY1Hsv1XgbjACjKHcSfqmnEom/hfs/wC5wh7LS4phzanAoXtocgcxNSiySOZrLfK1O1FHJPRvoHkRUVHKeB5PbyOrH4wuuxUxZtW2UNiNNGbeImr66isqPJmQSTa1EdBcecHqGSZhbCZldlRwHgMjtQWvJZZNfu2b70IBQjcTXAkXmsOoOtw72d6M6ukoNDtS4T7kzJF3zPJUOXzZP4aJrrOI/aPhRQATBd8ueTBHTyJEIR8UzKqhOqJfcUgkvuh4H4s6NIpPQAo8BdsK6Bm0HsQLZYPCx4w+kDi2AFOb3wyzrOXIyUyrX7XjLAHkQarRNEbjQMoW5Eqw66Jo+KOA5bieqfSPA8ERLDN2UiShw5xg6aEHPQ/epiL/APTRPzWapFW8t6XgFOP4b6mnkTUBZ2MF3PB8n28bYmCDTxUA5GMCu7oGa7FJ5JvEhvlD53iigwlISc6WJ7jlHWkmmAXY7VrWtQP+u0UIMcC5qAOzHkwNis/VfvrR9BgbE0/8VzNiopsStqYWZGh5NZHMnNjTOmAVQN2plQH0bM+WXzgIc3BefskFbYDJdcssyXfXhLJKB2MPpo+I2uaYXHGiyx/KyT9hSrVt0dx1EuOo8Ry49W+kcXhL/lbq+KfXJ9K8flKAkg96ajcG4DUqtulsjNmWhDviuJOo+EYEiIolxGEqxq9skPo/1vFRV1IaHamtSMpmy12I8msv1at4aRA7x9gR4Stquy/mFoIa4WfaD7pt5SntyTLsrbBvoHoAJV8UkOiEOYA+EVDMZdHRHcSR70dIIQ5G66bOpgZcIQDZGzV/4kZ3tIeIqW7mB7w1niHKTcGx6hiQaTHPLy2vYZ2qILWKNMObRmVelQVLCvFhGb330QaiUK6yGZaJRQwWTEtqK669VtaCgIKIkImYm+EVGBxTxxy3gj1c1NTiYxRw2ofb7FfBfXPJWF0qiU2w+YqPhFRUUETubh/ZalCLcBeD4ja5piAMjtUbtS6UyuYKsqSdqysjEPxlwlSyRQ96uxuMstI+HN1jLFLgEq+2NT60phjIYje29mHhFm8il5amEZIZB1terwOdNbUuqN1VzaijNcObRngYKmpg3gd9gWzXc7FA6+zKCRHbCbclhydh/Nd6OCOKPUHG8k5DyYrICgFBCQiYDkkbKGRIcqAABkW4opsZE3ckUgJocc44AFAiHSUBHGAGUAsAZBQkF07lEkImhTXaPKhOQhJJFmoqMUBsiAJmI2TLPbDNAZSBIIkhazUYEwvVfFnQ4D6GvkVmEb/bzTEbzI9oU7Ov/WN+q2du7wGR4CpqanDSG51oTJYgXS6HiKGCPzln2RSkblVPaKekHdDy0+KgoOSw7DI8FN8bE+kGRIw9TFtGOwAgEpKwZXcSpuwW9W6CFDpTRYwBQphNml80liJdDQ6YPqnnRyT1s0c6cHE5k1OJwuJg4TU/jYxio9LPIeOeRNTg+iOJwj8U4nqIqPQRUcDicqORHGfj9uGMI9dGJ66Kjhio/JH4iP8A4WfRn/xGv4R9If8A1jwHNMHgmpqfx8+ingcJqfwZz38o+kOCMT8eeoin1k+jeN5s+oPwZU+hnkzyJ5ryzln/AMU4noTjcDjOKOS4n/y0ck5TwnoY/wDjTlvIOZH/ANbHIOQ4H5qOF4D85H/wD+JjB4XkH/wscMemMI581PHHDFR+Ej8Q8EehOB9PFR+BKfwRwmMcEVHoz0s/jHhfz7z3jPSTU+lnimp9BNTyCiv//gADAP/Z" alt="Pensok" style={{width:80,height:80,borderRadius:20,objectFit:"cover"}}/>
          </div>
          <div style={{fontSize:24,fontWeight:600,letterSpacing:-0.5}}>Pensok</div>
          <div style={{fontSize:13,color:G.textoSec,marginTop:4}}>{localActivo.nombre}</div>
        </div>
        {/* Selector de local */}
        <div style={{display:"flex",gap:8,marginBottom:4}}>
          {Object.entries(LOCALES).map(([key,loc])=>(
            <button key={key} onClick={()=>cambiarLocal(key)}
              style={{flex:1,padding:"10px",borderRadius:10,border:`2px solid ${localSel===key?G.verde:G.borde}`,background:localSel===key?"#00C48C18":G.sup2,color:localSel===key?G.verde:G.textoSec,fontWeight:600,fontSize:13,cursor:"pointer"}}>
              {loc.nombre}
            </button>
          ))}
        </div>
        <Card>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Email" value={email} onChange={setEmail} type="email" placeholder="tu@email.com"/>
            {modo!=="recuperar"&&<Fi label="Contrasena" value={pass} onChange={setPass} type="password" placeholder="••••••••"/>}
            {error&&<div style={{fontSize:12,color:(error.includes("creada")||error.includes("enviamos"))?G.verde:G.rojo,background:(error.includes("creada")||error.includes("enviamos"))?"#00C48C11":"#FF4D6A11",border:`1px solid ${(error.includes("creada")||error.includes("enviamos"))?"#00C48C33":"#FF4D6A33"}`,borderRadius:8,padding:"8px 12px"}}>{error}</div>}
            <Btn full disabled={!email||(modo!=="recuperar"&&!pass)||loading} onClick={handleSubmit}>
              {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/> Procesando...</span>:modo==="login"?"Ingresar":"Enviar email de recuperacion"}
            </Btn>
            {modo==="login"&&(
              <div style={{textAlign:"center",fontSize:12,color:G.textoSec}}>
                <span style={{color:G.verde,cursor:"pointer"}} onClick={()=>{setModo("recuperar");setError("");setPass("");}}>
                  ¿Olvidaste tu contrasena?
                </span>
              </div>
            )}
            <div style={{textAlign:"center",fontSize:12,color:G.textoSec,paddingTop:modo==="login"?0:4}}>
              {"Recordaste tu contrasena? "}
              <span style={{color:G.verde,cursor:"pointer"}} onClick={()=>{setModo("login");setError("");}}>
                {"Iniciar sesion"}
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
  const [devoluciones,   setDevoluciones]   = useState([]);
  const [egresos,        setEgresos]        = useState([]);
  const [abastecimiento, setAbastecimiento] = useState([]);
  const [vendedores,     setVendedores]     = useState([]);
  const [proveedores,    setProveedores]    = useState([]);
  const [tipoCambio,     setTipoCambio]     = useState(1200);
  const [totalVentas,    setTotalVentas]    = useState(0);
  const [totalNosDeben,  setTotalNosDeben]  = useState(0);
  const [anioStats,      setAnioStats]      = useState({facturacion:0,ganancia:0,cantidad:0});
  const [pedidosWeb,     setPedidosWeb]     = useState([]);
  const [pagosEgreso,    setPagosEgreso]    = useState([]);
  const [descuentosEgreso, setDescuentosEgreso] = useState([]);
  const [tareas,         setTareas]         = useState([]);
  const [vendedoresOtro, setVendedoresOtro] = useState([]); // vendedores del OTRO local (para la lista de responsables)
  const [conteosStock,   setConteosStock]   = useState([]);
  const [historialValorStock, setHistorialValorStock] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
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
    // Cargar pagos parciales de egresos
    const{data:pegs}=await supabase.from("pagos_egreso").select("*").order("fecha",{ascending:false});
    setPagosEgreso(pegs||[]);
    // Descuentos de proveedor recibidos sobre egresos ya pagados — si la tabla aún no existe, queda vacío sin romper
    try{
      const{data:degs}=await supabase.from("descuentos_egreso").select("*").order("fecha",{ascending:false});
      setDescuentosEgreso(degs||[]);
    }catch(e){ console.warn("No se pudieron cargar los descuentos de egreso:",e); setDescuentosEgreso([]); }
    // Cargar devoluciones (notas de crédito) con sus items — si la tabla aún no existe, queda vacío sin romper
    const{data:devs}=await supabase.from("devoluciones").select("*, devolucion_items(*)").order("fecha",{ascending:false});
    setDevoluciones(devs||[]);
    // Tareas: viven en la base de Pilar (compartidas entre los dos locales)
    try{
      const{data:tks}=await supabaseTareas.from("tareas").select("*").order("fecha_limite",{ascending:true,nullsFirst:false});
      setTareas(tks||[]);
    }catch(e){ console.warn("No se pudieron cargar las tareas:",e); setTareas([]); }
    // Vendedores del otro local — la lista de responsables es la unión de los dos locales
    try{
      const{data:vOtro}=await supabaseOtro.from("vendedores").select("*").eq("activo",true);
      setVendedoresOtro(vOtro||[]);
    }catch(e){ console.warn("No se pudieron cargar los vendedores del otro local:",e); setVendedoresOtro([]); }
    // Conteos de stock (control de inventario) — si la tabla aún no existe, queda vacío sin romper
    try{
      const{data:cst}=await supabase.from("conteos_stock").select("*, conteos_stock_items(*)").order("creado_en",{ascending:false});
      setConteosStock(cst||[]);
    }catch(e){ console.warn("No se pudieron cargar los conteos de stock:",e); setConteosStock([]); }
    // Historial diario de valor de stock — si la tabla aún no existe, queda vacío sin romper
    try{
      const{data:hvs}=await supabase.from("historial_valor_stock").select("*").order("fecha",{ascending:true});
      setHistorialValorStock(hvs||[]);
    }catch(e){ console.warn("No se pudo cargar el historial de valor de stock:",e); setHistorialValorStock([]); }
    // Presupuestos — si la tabla aún no existe, queda vacío sin romper
    try{
      const{data:preds}=await supabase.from("presupuestos").select("*, presupuesto_items(*)").order("creado_en",{ascending:false});
      setPresupuestos(preds||[]);
    }catch(e){ console.warn("No se pudieron cargar los presupuestos:",e); setPresupuestos([]); }
    // Count real de ventas
    const{count}=await supabase.from("ventas").select("*",{count:"exact",head:true});
    setTotalVentas(count||0);
    // Total "nos deben" directo desde Supabase (no limitado a 5000)
    const{data:saldoData}=await supabase.from("ventas").select("saldo_cobro,cobrado,total").or("saldo_cobro.gt.0,cobrado.eq.false");
    const totalSaldo=(saldoData||[]).reduce((s,v)=>{
      // Priorizar saldo_cobro si existe; si no, usar total solo cuando no hay monto cobrado
      if((v.saldo_cobro||0)>0) return s+(v.saldo_cobro||0);
      if(!v.cobrado&&!(v.monto_cobrado>0)) return s+(v.total||0);
      return s;
    },0);
    setTotalNosDeben(totalSaldo);
    // Deuda Caamaño se calcula por separado en cargarTraspasos()
    // Agregados del año actual desde Supabase (sin limite)
    const anioStr=new Date().getFullYear().toString();
    const{data:anioData}=await supabase.from("ventas").select("total,ganancia").gte("fecha",`${anioStr}-01-01`).lte("fecha",`${anioStr}-12-31`).limit(100000);
    const anioFact=(anioData||[]).reduce((s,v)=>s+(v.total||0),0);
    const anioGan=(anioData||[]).reduce((s,v)=>s+(v.ganancia||0),0);
    setAnioStats({facturacion:anioFact,ganancia:anioGan,cantidad:(anioData||[]).length});
    setLoading(false);
  }

  useEffect(()=>{
    cargar();
    // Auto-refresh cada 30 minutos para mantener los datos actualizados
    const interval = setInterval(cargar, 30 * 60 * 1000);
    return () => clearInterval(interval);
  },[]);

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
    if(vErr){toast.err("Error al registrar venta");return null;}

    // 2. Insertar items
    if(items.length>0){
      const itemsData = items.map(i=>({
        venta_id:vData.id,
        nombre:i.nombre,
        cantidad:i.cantidad,
        precio:i.precio,
        costo:i.costo||0
      }));
      const{error:iErr}=await supabase.from("venta_items").insert(itemsData);
      if(iErr){ console.error("Error insertando items:", iErr); toast.err("Error al guardar items"); }
    }

    // 3. Descontar stock y sumar vendidos por producto
    for(const item of items){
      if(item.productoId){
        const prod=productos.find(p=>p.id===item.productoId);
        if(prod){
          await supabase.from("productos").update({
            stock:(prod.stock||0)-item.cantidad,
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

    // 5. Registrar pago en pagos_deuda para trazabilidad
    if(venta.cobrado){
      const montoCobrado = venta.monto_cobrado||total;
      await supabase.from("pagos_deuda").insert({
        referencia_id: vData.id,
        fecha: venta.fecha,
        monto: montoCobrado,
        tipo: "ingreso",
        metodo_pago: venta.metodoPago,
        concepto: `Cobro venta - ${venta.clienteNombre||"Consumidor Final"}`,
      });
      // Si hubo pago parcial, también actualizar monto_cobrado y saldo_cobro en la venta
      if(venta.monto_cobrado&&venta.monto_cobrado<total){
        await supabase.from("ventas").update({
          monto_cobrado:venta.monto_cobrado,
          saldo_cobro:venta.saldo_cobro||0
        }).eq("id",vData.id);
      }
    }

    toast.ok("Venta registrada");
    await cargar();
    return vData.id;
  }

  // ── PRESUPUESTOS ─────────────────────────────────────────
  // items: [{productoId, nombre, cantidad, precio, costo}] -- mismo formato que usa registrarVenta.
  async function crearPresupuesto({clienteId,clienteNombre,vendedor,tipoLista,modalidad,descuento,items}){
    if(!items||!items.length) return null;
    const total = calcTotalItems(items,descuento||0);
    const ganancia = calcGananciaItems(items,descuento||0);
    const hoyStr = hoy();
    // Nº correlativo del día: PRE-AAAAMMDD-00X, mismo patrón que las notas de crédito.
    const nHoy = presupuestos.filter(p=>p.fecha===hoyStr).length + 1;
    const nroPresupuesto = `PRE-${hoyStr.replace(/-/g,"")}-${String(nHoy).padStart(3,"0")}`;

    const{data:pData,error:pErr}=await supabase.from("presupuestos").insert({
      nro_presupuesto:nroPresupuesto, fecha:hoyStr, hora:new Date().toTimeString().slice(0,8),
      cliente_id:clienteId||null, cliente_nombre:clienteNombre||"",
      vendedor:vendedor||"", tipo_lista:tipoLista||"minorista", modalidad:modalidad||"En el local",
      descuento:descuento||0, total, ganancia_estimada:ganancia,
    }).select().single();
    if(pErr){ console.error("Error creando presupuesto:",pErr); toast.err("Error al guardar el presupuesto"); return null; }

    const filas = items.map(i=>({
      presupuesto_id:pData.id, producto_id:i.productoId||null, nombre:i.nombre,
      cantidad:i.cantidad, precio:i.precio, costo:i.costo||0
    }));
    const{error:iErr}=await supabase.from("presupuesto_items").insert(filas);
    if(iErr){ console.error("Error guardando items del presupuesto:",iErr); toast.err("Se guardó el presupuesto pero no se pudieron guardar los items"); }

    await cargar();
    return nroPresupuesto;
  }

  // Convierte un presupuesto pendiente en una venta real -- reusa registrarVenta para no
  // duplicar la lógica de descuento de stock, cuenta corriente, etc. Pide método de pago y
  // cobrado/entregado porque el presupuesto todavía no los tiene definidos.
  async function aprobarPresupuesto(presupuestoId,{metodoPago,cobrado,entregado},aprobadoPor){
    const pres = presupuestos.find(p=>p.id===presupuestoId);
    if(!pres||pres.estado!=="pendiente") return;
    const items = (pres.presupuesto_items||[]).map(i=>({
      productoId:i.producto_id, nombre:i.nombre, cantidad:i.cantidad, precio:i.precio, costo:i.costo||0
    }));
    const ventaId = await registrarVenta({
      fecha:hoy(), hora:new Date().toTimeString().slice(0,8),
      clienteId:pres.cliente_id, clienteNombre:pres.cliente_nombre,
      vendedor:pres.vendedor, metodoPago, modalidad:pres.modalidad,
      descuento:pres.descuento, cobrado, entregado,
    },items);
    if(!ventaId){ toast.err("No se pudo crear la venta -- el presupuesto sigue pendiente"); return; }
    const{error}=await supabase.from("presupuestos").update({
      estado:"aprobado", venta_id:ventaId, aprobado_por:aprobadoPor, aprobado_en:new Date().toISOString()
    }).eq("id",presupuestoId);
    if(error){ console.error("Error marcando presupuesto como aprobado:",error); toast.err("Se creó la venta pero no se pudo marcar el presupuesto como aprobado"); }
    else toast.ok("Presupuesto aprobado -- venta registrada en Ingresos");
    await cargar();
  }

  async function cancelarPresupuesto(presupuestoId,motivo,canceladoPor){
    const{error}=await supabase.from("presupuestos").update({
      estado:"cancelado", motivo_cancelacion:motivo||"", cancelado_por:canceladoPor, cancelado_en:new Date().toISOString()
    }).eq("id",presupuestoId);
    if(error){ console.error("Error cancelando presupuesto:",error); toast.err("Error al cancelar el presupuesto"); return; }
    toast.ok("Presupuesto cancelado");
    await cargar();
  }

  // Edita los items de un presupuesto TODAVÍA PENDIENTE (el cliente pidió agregar/sacar
  // algo antes de cerrar la venta) -- mismo número de presupuesto, pero suma versión y
  // refresca la fecha (así un presupuesto vencido vuelve a quedar vigente al editarlo).
  async function editarPresupuestoItems(presupuestoId,items,editadoPor){
    if(!items||!items.length){ toast.err("El presupuesto necesita al menos un producto"); return; }
    const pres = presupuestos.find(p=>p.id===presupuestoId);
    if(!pres) return;
    const total = calcTotalItems(items,pres.descuento||0);
    const ganancia = calcGananciaItems(items,pres.descuento||0);
    const{error:pErr}=await supabase.from("presupuestos").update({
      total, ganancia_estimada:ganancia, fecha:hoy(),
      version:(pres.version||1)+1, editado_por:editadoPor, editado_en:new Date().toISOString()
    }).eq("id",presupuestoId);
    if(pErr){ console.error("Error editando presupuesto:",pErr); toast.err("Error al actualizar el presupuesto"); return; }
    await supabase.from("presupuesto_items").delete().eq("presupuesto_id",presupuestoId);
    const filas = items.map(i=>({
      presupuesto_id:presupuestoId, producto_id:i.productoId||null, nombre:i.nombre,
      cantidad:i.cantidad, precio:i.precio, costo:i.costo||0
    }));
    const{error:iErr}=await supabase.from("presupuesto_items").insert(filas);
    if(iErr){ console.error("Error guardando items del presupuesto:",iErr); toast.err("Se actualizó el presupuesto pero no se pudieron guardar los items"); }
    toast.ok("Presupuesto actualizado");
    await cargar();
  }

  // ── DEVOLUCIONES (NOTAS DE CRÉDITO) ─────────────────────
  // dev = { ventaId, ventaNro, clienteNombre, clienteId, tipo:'dinero'|'saldo',
  //         metodoDevolucion, motivo, vendedor,
  //         items:[{nombre, cantidad, precio, costo, reingresaStock, productoId}] }
  async function registrarDevolucion(dev){
    if(!dev.items||!dev.items.length){toast.err("No hay ítems para devolver");return false;}
    const montoTotal = dev.items.reduce((s,i)=>s+(Number(i.precio)||0)*(Number(i.cantidad)||0),0);
    const gananciaRev = dev.items.reduce((s,i)=>s+((Number(i.precio)||0)-(Number(i.costo)||0))*(Number(i.cantidad)||0),0);
    const hoyStr = hoy();
    const horaStr = new Date().toTimeString().slice(0,8);
    // Nº correlativo de nota de crédito del día: NC-AAAAMMDD-00X
    const nHoy = devoluciones.filter(d=>d.fecha===hoyStr).length + 1;
    const nroNota = `NC-${hoyStr.replace(/-/g,"")}-${String(nHoy).padStart(3,"0")}`;

    // 1. Insertar la nota de crédito
    const{data:dData,error:dErr}=await supabase.from("devoluciones").insert({
      venta_id: dev.ventaId||null,
      nro_nota: nroNota,
      fecha: hoyStr, hora: horaStr,
      cliente_id: dev.clienteId||null,
      cliente_nombre: dev.clienteNombre||"",
      tipo: dev.tipo,
      metodo_devolucion: dev.tipo==="dinero" ? (dev.metodoDevolucion||"Efectivo") : null,
      monto_total: montoTotal,
      ganancia_revertida: gananciaRev,
      motivo: dev.motivo||"",
      vendedor: dev.vendedor||"",
    }).select().single();
    if(dErr){console.error("Error devolución:",dErr);toast.err("Error al registrar la devolución");return false;}

    // 2. Insertar los ítems devueltos
    if(dev.items.length>0){
      await supabase.from("devolucion_items").insert(dev.items.map(i=>({
        devolucion_id: dData.id,
        nombre: i.nombre,
        cantidad: Number(i.cantidad)||0,
        precio: Number(i.precio)||0,
        costo: Number(i.costo)||0,
        reingresa_stock: !!i.reingresaStock,
      })));
    }

    // 3. Reingresar stock (espejo de registrarVenta) — solo los ítems marcados
    for(const i of dev.items){
      if(!i.reingresaStock) continue;
      const prod = (i.productoId && productos.find(p=>p.id===i.productoId)) || productos.find(p=>p.nombre===i.nombre);
      if(prod){
        await supabase.from("productos").update({
          stock:(prod.stock||0)+(Number(i.cantidad)||0),
          vendidos:Math.max(0,(prod.vendidos||0)-(Number(i.cantidad)||0)),
        }).eq("id",prod.id);
      }
    }

    // 4. Saldo a favor → acreditar al cliente en su cuenta corriente (positivo = a favor)
    if(dev.tipo==="saldo" && dev.clienteId){
      const cli = clientes.find(c=>c.id===dev.clienteId);
      if(cli){
        await supabase.from("clientes").update({
          cuenta_corriente:(cli.cuenta_corriente||0)+montoTotal
        }).eq("id",cli.id);
      }
    }

    toast.ok(`Nota de crédito ${nroNota} registrada`);
    await cargar();
    return true;
  }

  // ── EGRESOS ──────────────────────────────────────────────
  async function registrarEgreso(eg){
    // El egreso siempre nace sin pagar — los pagos se registran por separado en pagos_egreso
    const payload = {
      ...eg,
      monto_reembolsado: 0,
      saldo_pendiente: eg.monto,
      reembolso_pendiente: true,
      reembolsado: false,
    };
    const{data,error}=await supabase.from("egresos").insert(payload).select().single();
    if(error){toast.err("Error al guardar egreso");return;}

    // Si es una compra de productos, crear una tarea de aviso para no olvidarse de cargar
    // Abastecimiento. A diferencia de la de Control de Stock, esta se tilda a mano (no se
    // autocompleta por monto) porque el monto cargado casi nunca va a coincidir exacto con
    // el del egreso por actualizaciones de precio -- el monto se muestra solo como referencia.
    if(eg.es_compra_productos){
      try{
        await supabaseTareas.from("tareas").insert({
          titulo: `Cargar en Abastecimiento: ${eg.proveedor||"(sin proveedor)"} — ${fmt(data.monto)}`,
          descripcion: `Egreso #${data.id}: "${data.concepto}". Cargar los productos correspondientes desde Abastecimiento, vinculándolos a esta compra. Tildar cuando esté todo cargado.`,
          responsable: null,
          local: localKey,
          prioridad: "media",
          fecha_limite: hoy(),
          proyecto: "Abastecimiento pendiente",
          estado: "pendiente",
          creado_por: "Sistema (automático)",
        });
      }catch(e){ console.warn("No se pudo crear la tarea de aviso del egreso:",e); }
    }

    toast.ok("Egreso registrado — recordá cargar los pagos");
    await cargar();
    return data;
  }

  async function registrarPagoEgreso(egresoId, pago){
    // pago = {fecha, monto, metodo_pago, notas, comision_plataforma}
    const egreso = egresos.find(e=>e.id===egresoId);
    if(!egreso){toast.err("Egreso no encontrado");return;}
    const pagosAnteriores = pagosEgreso.filter(p=>p.egreso_id===egresoId).reduce((s,p)=>s+(p.monto||0),0);
    const nuevoTotal = pagosAnteriores + (pago.monto||0);
    const totalEgreso = egreso.monto||0;
    const saldado = nuevoTotal >= totalEgreso;
    // Insertar el pago en pagos_egreso
    // La comisión NO cuenta para saldar la deuda con el proveedor (nuevoTotal/saldado usan
    // solo pago.monto) -- es un costo aparte que hace que salga más plata de la billetera de
    // la que efectivamente se le debía al proveedor. Se refleja en el Libro de Movimientos.
    const{error:pErr}=await supabase.from("pagos_egreso").insert({
      egreso_id: egresoId,
      fecha: pago.fecha,
      monto: pago.monto,
      metodo_pago: pago.metodo_pago || egreso.metodo_pago,
      notas: pago.notas||"",
      comision_plataforma: pago.comision_plataforma||0,
    });
    if(pErr){toast.err("Error al registrar pago: "+pErr.message);return;}
    // Actualizar saldos en el egreso
    await supabase.from("egresos").update({
      monto_reembolsado: nuevoTotal,
      saldo_pendiente: Math.max(0, totalEgreso - nuevoTotal),
      reembolsado: saldado,
      reembolso_pendiente: !saldado,
    }).eq("id",egresoId);
    toast.ok(saldado ? "✓ Egreso saldado" : "Pago parcial registrado");
    await cargar();
  }

  async function eliminarPagoEgreso(pagoId){
    const pago = pagosEgreso.find(p=>p.id===pagoId);
    if(!pago){return;}
    const{error}=await supabase.from("pagos_egreso").delete().eq("id",pagoId);
    if(error){toast.err("Error al eliminar pago");return;}
    // Recalcular saldos en el egreso
    const egreso = egresos.find(e=>e.id===pago.egreso_id);
    if(egreso){
      const nuevoTotal = Math.max(0,(egreso.monto_reembolsado||0)-(pago.monto||0));
      const nuevoSaldo = Math.max(0,(egreso.monto||0)-nuevoTotal);
      await supabase.from("egresos").update({
        monto_reembolsado: nuevoTotal,
        saldo_pendiente: nuevoSaldo,
        reembolsado: nuevoSaldo===0,
        reembolso_pendiente: nuevoSaldo>0,
      }).eq("id",pago.egreso_id);
    }
    toast.ok("Pago eliminado");await cargar();
  }

  // Descuento que un proveedor devuelve en plata real, días después de haber pagado un
  // egreso completo -- no toca el egreso ni el pago original, queda como evento propio
  // con su fecha/monto/método reales para que el Libro de Movimientos sume bien.
  async function registrarDescuentoEgreso(egresoId,{fecha,monto,metodoPago,notas},registradoPor){
    if(!monto||monto<=0){ toast.err("El monto del descuento tiene que ser mayor a 0"); return; }
    const{error}=await supabase.from("descuentos_egreso").insert({
      egreso_id:egresoId, fecha:fecha||hoy(), monto, metodo_pago:metodoPago,
      notas:notas||"", registrado_por:registradoPor,
    });
    if(error){ console.error("Error registrando descuento de egreso:",error); toast.err("Error al registrar el descuento"); return; }
    toast.ok("Descuento registrado");
    await cargar();
  }
  async function eliminarDescuentoEgreso(id){
    const{error}=await supabase.from("descuentos_egreso").delete().eq("id",id);
    if(error){ toast.err("Error al eliminar el descuento"); return; }
    toast.ok("Descuento eliminado");
    await cargar();
  }

  async function marcarReembolsado(id, pago){
    // pago = {monto, metodo_pago, fecha, concepto}
    const egreso = egresos.find(e=>e.id===id);
    const montoAnterior = egreso?.monto_reembolsado||0;
    const nuevoMonto = montoAnterior + (pago.monto||0);
    const totalEgreso = egreso?.monto||0;
    const saldado = nuevoMonto >= totalEgreso;
    await supabase.from("egresos").update({
      monto_reembolsado: nuevoMonto,
      saldo_pendiente: Math.max(0, totalEgreso - nuevoMonto),
      reembolsado: saldado,
      reembolso_pendiente: !saldado
    }).eq("id",id);
    await supabase.from("pagos_deuda").insert({
      fecha: pago.fecha,
      tipo: "egreso",
      referencia_id: id,
      concepto: pago.concepto || (egreso?.concepto||""),
      monto: pago.monto,
      metodo_pago: pago.metodo_pago
    });
    toast.ok(saldado ? "Reembolso completado" : "Pago parcial registrado");
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
  async function eliminarProducto(id){
    const prod = productos.find(p=>p.id===id);
    await supabase.from("productos").delete().eq("id",id);
    // Eliminar también en Caamaño si estamos en Pilar
    if(supabaseCamanio && prod?.codigo){
      try{ await supabaseCamanio.from("productos").delete().eq("codigo",prod.codigo); }
      catch(e){ console.warn("No se pudo eliminar en Caamaño:", e); }
    }
    toast.ok("Producto eliminado");
    await cargar();
  }

  async function guardarProducto(datos,id=null){
    if(id){
      // Solo campos válidos de la tabla productos
      const CAMPOS_PRODUCTO = ["codigo","nombre","categoria","marca","costo","costo_usd","precio_min","precio_esp","precio_may","stock","stock_min","proveedor","activo","vendidos","moneda","ganancia_min","ganancia_may","iva_pct","mostrar_siempre_en_catalogo","granel_id","consumo_granel"];
      const datosLimpios = Object.fromEntries(Object.entries(datos).filter(([k])=>CAMPOS_PRODUCTO.includes(k)));
      const{error}=await supabase.from("productos").update(datosLimpios).eq("id",id);
      if(error){toast.err("Error al actualizar producto");return;}
      toast.ok("Producto actualizado");
      // Replicar en Caamaño todo excepto stock (solo desde Pilar)
      if(supabaseCamanio){
        try{
          const prod = productos.find(p=>p.id===id);
          if(prod?.codigo){
            // granel_id/consumo_granel NO se replican: granel_id es un id numérico interno de
            // esta base, en Caamaño ese mismo número puede apuntar a un producto distinto.
            // Si hace falta el mismo vínculo en Caamaño, se configura ahí directamente.
            const CAMPOS_REPLICAR = ["nombre","categoria","marca","costo","costo_usd","precio_min","precio_esp","precio_may","stock_min","proveedor","activo","moneda","ganancia_min","ganancia_may","iva_pct","mostrar_siempre_en_catalogo"];
            const datosReplica = Object.fromEntries(Object.entries(datosLimpios).filter(([k])=>CAMPOS_REPLICAR.includes(k)));
            if(Object.keys(datosReplica).length>0){
              await supabaseCamanio.from("productos").update(datosReplica).eq("codigo",prod.codigo);
            }
          }
        }catch(e){ console.warn("No se pudo replicar en Caamaño:", e); }
      }
    } else {
      const{error}=await supabase.from("productos").insert(datos);
      if(error){toast.err("Error al crear producto");return;}
      toast.ok("Producto creado");
      // Replicar en Caamaño con stock 0 si estamos en Pilar
      if(supabaseCamanio && datos.codigo && datos.nombre){
        try{
          await supabaseCamanio.from("productos").insert({
            codigo: datos.codigo,
            nombre: datos.nombre,
            categoria: datos.categoria||"",
            marca: datos.marca||"",
            costo: datos.costo||0,
            precio_min: datos.precio_min||0,
            precio_esp: datos.precio_esp||0,
            precio_may: datos.precio_may||0,
            stock: 0,
            stock_min: datos.stock_min||0,
            proveedor: datos.proveedor||"",
            activo: datos.activo!==false,
            vendidos: 0,
            moneda: datos.moneda||"ARS"
          });
        }catch(e){
          console.warn("No se pudo replicar en Caamaño:", e);
        }
      }
    }
    await cargar();
  }

  // ── ABASTECIMIENTO ────────────────────────────────────────
  // Núcleo de un ingreso de abastecimiento (insert + stock + consumo de granel), sin
  // toast ni cargar() -- así lo puede reusar tanto un ingreso suelto como un lote de
  // varios productos de una misma compra, sin duplicar la lógica.
  // `overrides` lleva el stock "en curso" durante un lote (producto_id -> stock), para
  // que si dos productos del mismo lote consumen el mismo granel, el segundo no pise el
  // descuento que ya hizo el primero (ambos leerían productos.stock desactualizado si no).
  async function _procesarUnIngresoAbastecimiento(datos, overrides={}){
    const{error}=await supabase.from("abastecimiento").insert(datos);
    if(error){
      console.error("Error abastecimiento:", error);
      if(error.code==="23505"||error.status===409){
        toast.err(`Ya existe un registro para "${datos.nombre}" con esos datos (conflicto único). Revisá si ya fue cargado.`);
      } else {
        toast.err(`Error al registrar "${datos.nombre}": `+error.message);
      }
      return false;
    }
    const prod=productos.find(p=>p.id===datos.producto_id);
    if(prod){
      const stockBase = overrides[prod.id]!==undefined ? overrides[prod.id] : (prod.stock||0);
      const nuevoStock = stockBase+datos.cantidad;
      await supabase.from("productos").update({stock:nuevoStock, costo:datos.costo_unit}).eq("id",prod.id);
      overrides[prod.id]=nuevoStock;
      // Si este producto se envasa desde un producto a granel (ej. bidones de Cloro 10L
      // que salen del vinner "CLORO LIQUIDO x Litro"), descontar del granel lo consumido,
      // y dejarlo como movimiento propio en Abastecimiento para que quede trazable.
      if(prod.granel_id&&prod.consumo_granel>0){
        const granel=productos.find(p=>p.id===prod.granel_id);
        if(granel){
          const litrosConsumidos=datos.cantidad*prod.consumo_granel;
          const granelStockBase = overrides[granel.id]!==undefined ? overrides[granel.id] : (granel.stock||0);
          const nuevoGranelStock = granelStockBase-litrosConsumidos;
          await supabase.from("productos").update({stock:nuevoGranelStock}).eq("id",granel.id);
          overrides[granel.id]=nuevoGranelStock;
          await supabase.from("abastecimiento").insert({
            fecha:datos.fecha||hoy(), producto_id:granel.id, nombre:granel.nombre,
            cantidad:-litrosConsumidos, costo_unit:granel.costo||0,
            proveedor:"Envasado interno", metodo_pago:"Envasado interno",
            responsable:datos.responsable||"Pensok",
            notas:`Envasado en ${prod.nombre} (${datos.cantidad} u. × ${prod.consumo_granel})`,
          });
        }
      }
    }
    return true;
  }

  async function registrarAbastecimiento(datos){
    const ok = await _procesarUnIngresoAbastecimiento(datos);
    if(ok){ toast.ok("Ingreso de mercaderia registrado"); await cargar(); }
  }

  // Registra varios productos de una misma compra de una sola vez (mismo proveedor/fecha/
  // responsable/compra vinculada), en vez de tener que repetir el formulario producto por
  // producto. `items` ya viene como filas completas, mismo formato que espera un ingreso suelto.
  async function registrarAbastecimientoLote(items){
    if(!items||!items.length) return;
    const overrides={};
    let okCount=0;
    for(const datos of items){
      const ok = await _procesarUnIngresoAbastecimiento(datos,overrides);
      if(ok) okCount++;
    }
    if(okCount>0) toast.ok(`${okCount} de ${items.length} producto${items.length!==1?"s":""} registrado${okCount!==1?"s":""}`);
    await cargar();
  }

  // ── PROVEEDORES ──────────────────────────────────────────
  // Normaliza un nombre de proveedor para matchear entre locales sin importar mayúsculas/espacios
  const normalizarNombreProv = (n) => (n||"").trim().toLowerCase().replace(/\s+/g," ");

  async function guardarProveedor(datos,id=null){
    // Nombre "anterior" del proveedor que estamos editando (antes de aplicar el cambio), para poder
    // encontrar su contraparte en el otro local incluso si se está renombrando en esta misma operación.
    const nombreAnterior = id ? (proveedores.find(p=>p.id===id)?.nombre || datos.nombre) : datos.nombre;

    if(id){
      const{error}=await supabase.from("proveedores").update(datos).eq("id",id);
      if(error){toast.err("Error al actualizar proveedor");return;}
      toast.ok("Proveedor actualizado");
    } else {
      const{error}=await supabase.from("proveedores").insert(datos);
      if(error){toast.err("Error al crear proveedor");return;}
      toast.ok("Proveedor creado");
    }

    // Replicar en el otro local (bidireccional): buscamos por nombre normalizado: si existe, lo
    // actualizamos con los mismos datos; si no existe, lo creamos.
    try{
      const{data:otros}=await supabaseOtro.from("proveedores").select("id,nombre");
      const match = (otros||[]).find(p=>normalizarNombreProv(p.nombre)===normalizarNombreProv(nombreAnterior));
      if(match){
        await supabaseOtro.from("proveedores").update(datos).eq("id",match.id);
      }else{
        await supabaseOtro.from("proveedores").insert(datos);
      }
    }catch(e){
      console.warn("No se pudo replicar proveedor en el otro local:",e);
      toast.err("Proveedor guardado acá, pero no se pudo replicar en el otro local (revisalo a mano)");
    }
    await cargar();
  }
  async function toggleProveedor(id,activo){
    const prov = proveedores.find(p=>p.id===id);
    await supabase.from("proveedores").update({activo}).eq("id",id);
    toast.ok(activo?"Proveedor activado":"Proveedor desactivado");

    // Replicar el activo/inactivo en el otro local
    if(prov){
      try{
        const{data:otros}=await supabaseOtro.from("proveedores").select("id,nombre");
        const match = (otros||[]).find(p=>normalizarNombreProv(p.nombre)===normalizarNombreProv(prov.nombre));
        if(match) await supabaseOtro.from("proveedores").update({activo}).eq("id",match.id);
      }catch(e){
        console.warn("No se pudo replicar estado del proveedor en el otro local:",e);
      }
    }
    await cargar();
  }

  // ── TAREAS ───────────────────────────────────────────────
  // Viven en la base de Pilar (supabaseTareas), compartidas por los dos locales.
  async function guardarTarea(datos,id=null){
    if(id){
      const{error}=await supabaseTareas.from("tareas").update(datos).eq("id",id);
      if(error){console.error(error);toast.err("Error al actualizar la tarea");return false;}
      toast.ok("Tarea actualizada");
    }else{
      const{error}=await supabaseTareas.from("tareas").insert(datos);
      if(error){console.error(error);toast.err("Error al crear la tarea");return false;}
      toast.ok("Tarea creada");
    }
    await cargar();
    return true;
  }
  // Cambia el estado. Al marcarla hecha se guarda quién, cuándo, y el comentario opcional de cierre:
  // eso alimenta el historial del calendario.
  async function cambiarEstadoTarea(id,estado,quien,comentario=""){
    const datos = estado==="hecha"
      ? {estado, completada_at:new Date().toISOString(), completada_por:quien||"", comentario_cierre:comentario||null}
      : {estado, completada_at:null, completada_por:null, comentario_cierre:null};
    const{error}=await supabaseTareas.from("tareas").update(datos).eq("id",id);
    if(error){console.error(error);toast.err("Error al cambiar el estado");return;}
    await cargar();
  }
  async function eliminarTarea(id){
    const{error}=await supabaseTareas.from("tareas").delete().eq("id",id);
    if(error){console.error(error);toast.err("Error al eliminar la tarea");return;}
    toast.ok("Tarea eliminada");
    await cargar();
  }

  // Tarea mensual automática de Control de Stock: si todavía no existe una para este mes
  // y este local, se crea sin responsable asignado (cualquiera del equipo la puede tomar).
  // Se llama al cargar la app (ver App > useEffect de asegurarTareasControlStockMensual).
  const PROYECTO_CONTROL_STOCK = "Control de Stock (mensual)";
  async function asegurarTareasControlStockMensual(){
    const mesActual = mesAct(); // "YYYY-MM"
    const [y,m] = mesActual.split("-").map(Number);
    const nombreMes = MESES_CAL[m-1];
    const ultimoDia = new Date(y,m,0).getDate();
    const fechaLimite = `${mesActual}-${String(ultimoDia).padStart(2,"0")}`;
    let creadas = false;
    for(const loc of ["pilar","camanio"]){
      const tareasDeEsteLocal = tareas.filter(t=>t.proyecto===PROYECTO_CONTROL_STOCK && t.local===loc);
      const yaExiste = tareasDeEsteLocal.some(t=>(t.fecha_limite||"").startsWith(mesActual));
      if(yaExiste) continue;
      // Cada dos meses, no todos los meses: solo crear si pasaron al menos 2 meses
      // desde la última tarea de este tipo para este local.
      const ultimaFecha = tareasDeEsteLocal.map(t=>t.fecha_limite).filter(Boolean).sort().pop();
      if(ultimaFecha){
        const [uy,um] = ultimaFecha.split("-").map(Number);
        const mesesTranscurridos = (y-uy)*12 + (m-um);
        if(mesesTranscurridos < 2) continue;
      }
      const{error}=await supabaseTareas.from("tareas").insert({
        titulo: `Control de stock mensual — ${nombreMes} ${y}`,
        descripcion: "Contar el stock físico de todas las categorías del mes. Se puede hacer de a poco (una categoría por vez) desde Control de Stock.",
        responsable: null,
        local: loc,
        prioridad: "media",
        fecha_limite: fechaLimite,
        proyecto: PROYECTO_CONTROL_STOCK,
        estado: "pendiente",
        creado_por: "Sistema (automático)",
      });
      if(error) console.warn("No se pudo crear la tarea mensual de Control de Stock:",error);
      else creadas = true;
    }
    if(creadas) await cargar();
  }

  // Guarda una foto diaria del valor de stock a costo (ARS y USD al tipo de cambio actual),
  // si todavía no hay una para hoy -- para poder graficar su evolución en el tiempo.
  // Se llama al cargar la app, mismo patrón que asegurarTareasControlStockMensual.
  async function asegurarValorStockDiario(){
    const fechaHoy = hoy();
    if(historialValorStock.some(h=>h.fecha===fechaHoy)) return;
    const valorArs = productos.reduce((s,p)=>s+precioARS(p.costo,p.moneda)*p.stock,0);
    // Dólar oficial venta del día, misma fuente (dolarapi.com) que usa la pestaña de
    // Actualizar Precios -- no el tipoCambio en memoria, que no se persiste entre sesiones.
    let tcOficialVenta = null;
    try{
      const res = await fetch("https://dolarapi.com/v1/dolares/oficial");
      if(res.ok){ const d = await res.json(); tcOficialVenta = d?.venta || null; }
    }catch(e){ console.warn("No se pudo obtener el dólar oficial para la foto de valor de stock:",e); }
    if(!tcOficialVenta){
      console.warn("No se guardó la foto de valor de stock de hoy: no se pudo obtener el dólar oficial (se reintenta la próxima vez que se abra la app).");
      return;
    }
    const valorUsd = valorArs/tcOficialVenta;
    const{error}=await supabase.from("historial_valor_stock").insert({
      fecha:fechaHoy, valor_ars:Math.round(valorArs), valor_usd:Math.round(valorUsd*100)/100, tipo_cambio_usado:tcOficialVenta
    });
    if(error){
      // 23505 = ya existe una fila para hoy (otra sesión la guardó justo antes) -- no es un error real.
      if(error.code!=="23505") console.warn("No se pudo guardar el valor de stock diario:",error);
      return;
    }
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
    const provsUSD=(proveedores||[]).filter(p=>p.moneda==="USD"&&(soloProveedor?p.nombre===soloProveedor:true));
    const nombresUSD=provsUSD.map(p=>p.nombre);
    const prodsUSD=productos.filter(p=>nombresUSD.includes(p.proveedor)&&(p.costo_usd||0)>0);
    let actualizados=0;
    for(const prod of prodsUSD){
      const costoUSD=prod.costo_usd||0;
      const iva=1+((prod.iva_pct||21)/100);
      const costoARS=Math.round(costoUSD*iva*nuevoTC);
      const ganMin=(prod.ganancia_min||0); const ganMay=(prod.ganancia_may||0);
      const cambios={
        costo:costoARS,
        precio_min:ganMin>0?Math.round(costoARS*(1+ganMin/100)):prod.precio_min,
        precio_esp:ganMin>0?Math.round(costoARS*(1+ganMin/100)*0.95):prod.precio_esp,
        precio_may:ganMay>0?Math.round(costoARS*(1+ganMay/100)):prod.precio_may
      };
      await supabase.from("productos").update(cambios).eq("id",prod.id);
      // Replicar costo en Caamaño (por código)
      if(supabaseCamanio && prod.codigo){
        try{ await supabaseCamanio.from("productos").update({costo:costoARS}).eq("codigo",prod.codigo); }
        catch(e){ console.warn("No se pudo replicar TC en Caamaño:", e); }
      }
      actualizados++;
    }
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
      // Replicar costo en Caamaño (por código)
      if(supabaseCamanio && prod.codigo){
        try{ await supabaseCamanio.from("productos").update({costo:nuevoCosto}).eq("codigo",prod.codigo); }
        catch(e){ console.warn("No se pudo replicar porcentaje en Caamaño:", e); }
      }
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
      // Replicar costo en Caamaño (por código)
      if(supabaseCamanio && prod.codigo){
        try{ await supabaseCamanio.from("productos").update({costo}).eq("codigo",prod.codigo); }
        catch(e){ console.warn("No se pudo replicar CSV en Caamaño:", e); }
      }
      ok++;
    }
    toast.ok(`${ok} de ${filas.length} productos actualizados desde lista`);
    await cargar();
    return ok;
  }

  // ── EDICION ──────────────────────────────────────────────
  async function editarPagoDeuda(pagoId, nuevoMonto, nuevoMetodo){
    // Obtener el pago actual
    const {data:pago} = await supabase.from("pagos_deuda").select("*").eq("id",pagoId).maybeSingle();
    if(!pago) return false;
    const diff = nuevoMonto - (pago.monto||0);
    // Actualizar el pago
    const{error} = await supabase.from("pagos_deuda").update({monto:nuevoMonto,metodo_pago:nuevoMetodo}).eq("id",pagoId);
    if(error) return false;
    // Revertir el efecto en la venta/egreso
    if(pago.tipo==="ingreso"&&pago.referencia_id){
      const{data:venta}=await supabase.from("ventas").select("monto_cobrado,saldo_cobro,total,cobrado").eq("id",pago.referencia_id).maybeSingle();
      if(venta){
        const nuevoMontoCobrado = Math.max(0,(venta.monto_cobrado||0)+diff);
        const nuevoSaldo = Math.max(0,(venta.total||0)-nuevoMontoCobrado);
        await supabase.from("ventas").update({monto_cobrado:nuevoMontoCobrado,saldo_cobro:nuevoSaldo,cobrado:nuevoSaldo===0}).eq("id",pago.referencia_id);
      }
    }
    toast.ok("Pago actualizado");await cargar();return true;
  }

  async function eliminarPagoDeuda(pagoId){
    const {data:pago} = await supabase.from("pagos_deuda").select("*").eq("id",pagoId).maybeSingle();
    if(!pago) return false;
    // Revertir efecto en venta
    if(pago.tipo==="ingreso"&&pago.referencia_id){
      const{data:venta}=await supabase.from("ventas").select("monto_cobrado,saldo_cobro,total").eq("id",pago.referencia_id).maybeSingle();
      if(venta){
        const nuevoMontoCobrado = Math.max(0,(venta.monto_cobrado||0)-(pago.monto||0));
        const nuevoSaldo = Math.max(0,(venta.total||0)-nuevoMontoCobrado);
        await supabase.from("ventas").update({monto_cobrado:nuevoMontoCobrado,saldo_cobro:nuevoSaldo,cobrado:false}).eq("id",pago.referencia_id);
      }
    }
    // Revertir efecto en egreso
    if(pago.tipo==="egreso"&&pago.referencia_id){
      const{data:eg}=await supabase.from("egresos").select("monto_reembolsado,monto,saldo_pendiente").eq("id",pago.referencia_id).maybeSingle();
      if(eg){
        const nuevoReemb = Math.max(0,(eg.monto_reembolsado||0)-(pago.monto||0));
        const nuevoSaldo = Math.max(0,(eg.monto||0)-nuevoReemb);
        await supabase.from("egresos").update({monto_reembolsado:nuevoReemb,saldo_pendiente:nuevoSaldo,reembolsado:nuevoSaldo===0,reembolso_pendiente:nuevoSaldo>0}).eq("id",pago.referencia_id);
      }
    }
    await supabase.from("pagos_deuda").delete().eq("id",pagoId);
    toast.ok("Pago eliminado");await cargar();return true;
  }

  async function editarVenta(id,datos,pago=null){
    const ventaAnterior = ventasConItems.find(v=>v.id===id);
    const{error}=await supabase.from("ventas").update(datos).eq("id",id);
    if(error){toast.err("Error al editar venta");return;}

    // Si viene un pago de deuda explícito, registrarlo en pagos_deuda
    if(pago&&pago.monto>0){
      await supabase.from("pagos_deuda").insert({
        fecha: pago.fecha,
        tipo: "ingreso",
        referencia_id: id,
        concepto: "Cobro deuda - "+(ventaAnterior?.cliente_nombre||""),
        monto: pago.monto,
        metodo_pago: pago.metodo_pago
      });
    }

    // Si se desmarca cobrado → eliminar registros en pagos_deuda vinculados a esta venta
    if(ventaAnterior?.cobrado && datos.cobrado===false){
      await supabase.from("pagos_deuda").delete().eq("referencia_id",id).eq("tipo","ingreso");
    }

    // Si se marca cobrado (y antes no lo estaba) → crear registro automático en pagos_deuda
    if(!ventaAnterior?.cobrado && datos.cobrado===true && !pago){
      const venta = {...ventaAnterior,...datos};
      await supabase.from("pagos_deuda").insert({
        fecha: hoy(), // fecha REAL del cobro (hoy) — no la fecha de la venta, que puede ser vieja
        tipo: "ingreso",
        referencia_id: id,
        concepto: "Cobro venta - "+(venta.cliente_nombre||"Consumidor Final"),
        monto: venta.monto_cobrado||venta.total||0,
        metodo_pago: venta.metodo_pago
      });
    }

    // Si la venta YA estaba cobrada (no se está marcando/desmarcando cobrado ni registrando un pago
    // nuevo) y cambió el método de pago, corregir también el registro en pagos_deuda — si no, el Libro
    // de Movimientos y el Cierre de Caja siguen usando el método viejo (ver CLAUDE.md: usan el método
    // REAL de pagos_deuda, no el metodo_pago nominal de la venta). Solo se toca si hay un único pago
    // simple: si la venta tiene cobros partidos (varios registros en pagos_deuda), no se sabe a cuál de
    // esos pagos parciales se refiere el cambio, así que esos se corrigen desde "Editar pago" uno por uno.
    if(datos.metodo_pago&&ventaAnterior?.cobrado&&datos.cobrado!==false&&!pago){
      const{data:pagosExistentes}=await supabase.from("pagos_deuda").select("id,metodo_pago").eq("referencia_id",id).eq("tipo","ingreso");
      if(pagosExistentes&&pagosExistentes.length===1&&pagosExistentes[0].metodo_pago!==datos.metodo_pago){
        await supabase.from("pagos_deuda").update({metodo_pago:datos.metodo_pago}).eq("id",pagosExistentes[0].id);
      }
    }

    toast.ok("Venta actualizada");await cargar();
  }
  async function eliminarVenta(id){
    // Si ya existe una nota de crédito ligada a esta venta, no se elimina: dejaría la NC apuntando
    // a una venta inexistente (stock y caja ya se movieron a través de esa devolución).
    if((devoluciones||[]).some(d=>String(d.venta_id)===String(id))){
      toast.err("No se puede eliminar: esta venta tiene una nota de crédito asociada. Si fue cargada por error, contactá para revertir la devolución primero.");
      return;
    }

    const {data:items} = await supabase.from("venta_items").select("*").eq("venta_id",id);
    const noEncontrados = [];
    if(items&&items.length>0){
      for(const item of items){
        if(!item.nombre)continue;
        // Match tolerante (sin importar mayúsculas ni espacios extra) para no fallar en silencio
        const nombreBuscado = item.nombre.trim().toLowerCase();
        const prod = productos.find(p=>(p.nombre||"").trim().toLowerCase()===nombreBuscado);
        if(prod&&prod.id){
          await supabase.from("productos").update({
            stock:(prod.stock||0)+(item.cantidad||0),
            vendidos:Math.max(0,(prod.vendidos||0)-(item.cantidad||0)), // espejo exacto de registrarVenta
          }).eq("id",prod.id);
        }else{
          noEncontrados.push(item.nombre); // no existe / fue renombrado — no se puede reponer stock automáticamente
        }
      }
    }

    // Borrar los cobros (pagos_deuda) ligados a esta venta — si no, quedan "fantasma" en el Libro de movimientos
    await supabase.from("pagos_deuda").delete().eq("referencia_id",id);
    await supabase.from("venta_items").delete().eq("venta_id",id);
    await supabase.from("ventas").delete().eq("id",id);

    if(noEncontrados.length>0){
      toast.err(`Venta eliminada, pero no se pudo reponer el stock de: ${noEncontrados.join(", ")} (producto no encontrado — revisalo a mano)`);
    }else{
      toast.ok("Venta eliminada, stock repuesto y cobros asociados eliminados");
    }
    await cargar();
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
        // Corregir también el consumo del granel vinculado, en la misma proporción del ajuste.
        if(prod.granel_id&&prod.consumo_granel>0){
          const granel=productos.find(p=>p.id===prod.granel_id);
          if(granel) await supabase.from("productos").update({stock:granel.stock-diff*prod.consumo_granel}).eq("id",granel.id);
        }
      }
    }
    toast.ok("Ingreso actualizado");await cargar();
  }
  async function eliminarAbastecimiento(id,cantidad,productoId){
    await supabase.from("abastecimiento").delete().eq("id",id);
    // Revertir stock
    if(productoId){
      const prod=productos.find(p=>p.id===productoId);
      if(prod){
        await supabase.from("productos").update({stock:(prod.stock||0)-cantidad}).eq("id",prod.id);
        // Devolver al granel vinculado lo que este ingreso había consumido.
        if(prod.granel_id&&prod.consumo_granel>0){
          const granel=productos.find(p=>p.id===prod.granel_id);
          if(granel) await supabase.from("productos").update({stock:granel.stock+cantidad*prod.consumo_granel}).eq("id",granel.id);
        }
      }
    }
    toast.ok("Ingreso eliminado");await cargar();
  }

  // ── TRASPASOS ──────────────────────────────────────────────
  const [traspasos,        setTraspasos]        = useState([]);
  const [pagosTraspaso,    setPagosTraspaso]    = useState([]);
  const [totalDeudaCamanio,setTotalDeudaCamanio]= useState(0);

  async function cargarTraspasos(){
    const [{data:tr},{data:pg}] = await Promise.all([
      supabase.from("traspasos").select("*").order("created_at",{ascending:false}).limit(200),
      localKey==="pilar" ? supabase.from("pagos_traspaso").select("*").order("created_at",{ascending:false}).limit(500) : {data:[]},
    ]);
    setTraspasos(tr||[]);
    setPagosTraspaso(pg||[]);
    // Total deuda Caamaño (solo en Pilar)
    if(localKey==="pilar"){
      const {data:saldo} = await supabase.from("traspasos").select("saldo_pendiente").neq("estado","pagado");
      setTotalDeudaCamanio((saldo||[]).reduce((s,t)=>s+(t.saldo_pendiente||0),0));
    }
  }

  async function registrarTraspaso(items, notas){
    const total = items.reduce((s,i)=>s+(i.costo*i.cantidad),0);
    const payload = {
      fecha: hoy(),
      productos: items.map(i=>({id:i.id,codigo:i.codigo,nombre:i.nombre,cantidad:i.cantidad,costo:i.costo,subtotal:i.costo*i.cantidad})),
      total, markup_pct:0, estado:"pendiente",
      monto_pagado:0, saldo_pendiente:total, notas:notas||""
    };
    // Insertar en Pilar
    const {error} = await supabase.from("traspasos").insert(payload);
    if(error) return false;
    // Descontar stock en Pilar
    for(const it of items){
      const prod = productos.find(p=>p.id===it.id);
      if(prod) await supabase.from("productos").update({stock:(prod.stock||0)-it.cantidad}).eq("id",it.id);
    }
    // Registrar en historial de abastecimiento de Pilar como egreso de stock (cantidad negativa)
    try{
      for(const it of items){
        await supabase.from("abastecimiento").insert({
          fecha: hoy(),
          producto_id: it.id,
          nombre: it.nombre,
          cantidad: -Math.abs(it.cantidad),
          costo_unit: it.costo,
          proveedor: "Traspaso a Caamaño",
          metodo_pago: "Traspaso interno",
          responsable: "Sistema",
          notas: notas||"Traspaso de mercadería a Caamaño",
        });
      }
    }catch(e){console.warn("No se pudo registrar traspaso en historial de abastecimiento Pilar:",e);}
    // Insertar en Caamaño y sumar stock allí
    if(supabaseCamanio){
      try{
        await supabaseCamanio.from("traspasos").insert(payload);
        for(const it of items){
          const {data:pc}=await supabaseCamanio.from("productos").select("id,stock").eq("codigo",it.codigo).maybeSingle();
          if(pc){
            await supabaseCamanio.from("productos").update({stock:(pc.stock||0)+it.cantidad}).eq("id",pc.id);
            // Registrar en historial de abastecimiento de Caamaño como ingreso de stock
            try{
              await supabaseCamanio.from("abastecimiento").insert({
                fecha: hoy(),
                producto_id: pc.id,
                nombre: it.nombre,
                cantidad: Math.abs(it.cantidad),
                costo_unit: it.costo,
                proveedor: "Traspaso desde Pilar",
                metodo_pago: "Traspaso interno",
                responsable: "Sistema",
                notas: notas||"Traspaso de mercadería desde Pilar",
              });
            }catch(e2){console.warn("No se pudo registrar traspaso en historial de abastecimiento Caamaño:",e2);}
          }
        }
      }catch(e){console.warn("Error replicando traspaso a Caamaño:",e);}
    }
    await cargar(); await cargarTraspasos();
    return true;
  }

  async function registrarPagoTraspaso(traspasoId, monto, metodoPago, notas){
    const traspaso = traspasos.find(t=>t.id===traspasoId);
    if(!traspaso) return false;
    const nuevoMontoPagado = (traspaso.monto_pagado||0)+monto;
    const nuevoSaldo = Math.max(0,traspaso.total-nuevoMontoPagado);
    const nuevoEstado = nuevoSaldo===0?"pagado":nuevoMontoPagado>0?"pagado_parcial":"pendiente";
    // Actualizar traspaso en Pilar
    await supabase.from("traspasos").update({monto_pagado:nuevoMontoPagado,saldo_pendiente:nuevoSaldo,estado:nuevoEstado}).eq("id",traspasoId);
    // Registrar pago en pagos_traspaso (Pilar)
    await supabase.from("pagos_traspaso").insert({traspaso_id:traspasoId,fecha:hoy(),monto,metodo_pago:metodoPago,notas:notas||""});
    // Registrar egreso en Caamaño
    if(supabaseCamanio){
      try{
        await supabaseCamanio.from("egresos").insert({
          fecha:hoy(), concepto:"Traspaso a Pilar", tipo:"Gasto variable",
          monto, metodo_pago:metodoPago, pagador:"Pensok",
          reembolso_pendiente:false, reembolsado:true,
          monto_reembolsado:monto, saldo_pendiente:0, notas:notas||""
        });
        // Actualizar saldo traspaso en Caamaño
        const {data:tc}=await supabaseCamanio.from("traspasos").select("id,monto_pagado,total").eq("fecha",traspaso.fecha).maybeSingle();
        if(tc){
          const nm=(tc.monto_pagado||0)+monto;
          const ns=Math.max(0,tc.total-nm);
          await supabaseCamanio.from("traspasos").update({monto_pagado:nm,saldo_pendiente:ns,estado:ns===0?"pagado":nm>0?"pagado_parcial":"pendiente"}).eq("id",tc.id);
        }
      }catch(e){console.warn("Error registrando pago en Caamaño:",e);}
    }
    await cargarTraspasos();
    return true;
  }

  useEffect(()=>{if(!loading) cargarTraspasos();},[loading]);

  // ── PEDIDOS WEB ────────────────────────────────────────────
  async function cargarPedidosWeb(){
    const {data,error} = await supabase
      .from("pedidos_web_pendientes")
      .select("*")
      .eq("estado","pendiente")
      .order("created_at",{ascending:false});
    if(error){ console.error("Error cargando pedidos web:", error); return; }
    setPedidosWeb(data||[]);
  }

  async function aceptarPedidoWeb(pedido){
    // 1. Construir items de venta a partir de items del pedido
    // Resolver producto_id real para descontar stock
    const items = (pedido.items||[]).map(i=>{
      const prod = productos.find(p=>p.id===i.producto_id);
      return {
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio: i.precio,
        costo: prod?.costo || 0,
        productoId: i.producto_id,
      };
    });

    // 2. Crear venta con datos del pedido web
    const ahora = new Date();
    const fechaStr = ahora.toISOString().split("T")[0];
    const horaStr = ahora.toTimeString().slice(0,5);

    const total = items.reduce((s,i)=>s+(i.precio||0)*(i.cantidad||0),0);
    const ganancia = total - items.reduce((s,i)=>s+(i.costo||0)*(i.cantidad||0),0);

    const ventaPayload = {
      fecha: fechaStr,
      hora: horaStr,
      cliente_id: null,
      cliente_nombre: pedido.cliente_nombre || "CONSUMIDOR FINAL",
      vendedor: "Pedido Web",
      metodo_pago: null,           // lo cargás vos después
      modalidad: pedido.tipo_entrega === "envio" ? "Telefonica / Delivery" : "En el local",
      descuento: 0,
      cobrado: false,
      entregado: false,
      total,
      ganancia,
      origen: "web",
      tipo_entrega: pedido.tipo_entrega,
      direccion_envio: pedido.direccion_envio,
      telefono_contacto: pedido.telefono_contacto || pedido.cliente_telefono,
      notas_pedido_web: pedido.notas,
    };

    const {data:vData,error:vErr} = await supabase
      .from("ventas")
      .insert(ventaPayload)
      .select()
      .single();
    if(vErr){ console.error(vErr); toast.err("Error al crear la venta: "+vErr.message); return false; }

    // 3. Insertar items
    if(items.length>0){
      const itemsData = items.map(i=>({
        venta_id: vData.id,
        nombre: i.nombre,
        cantidad: i.cantidad,
        precio: i.precio,
        costo: i.costo||0,
      }));
      const {error:iErr} = await supabase.from("venta_items").insert(itemsData);
      if(iErr) console.error("Error items pedido web:", iErr);
    }

    // 4. Descontar stock de productos (solo de los que NO son granel/mostrar siempre)
    for(const item of items){
      if(item.productoId){
        const prod = productos.find(p=>p.id===item.productoId);
        if(prod && !prod.mostrar_siempre_en_catalogo){
          await supabase.from("productos").update({
            stock:(prod.stock||0)-item.cantidad,
            vendidos:(prod.vendidos||0)+item.cantidad,
          }).eq("id",prod.id);
        } else if(prod) {
          // Producto a granel: solo sumar vendidos, no tocar stock
          await supabase.from("productos").update({
            vendidos:(prod.vendidos||0)+item.cantidad,
          }).eq("id",prod.id);
        }
      }
    }

    // 5. Marcar pedido web como aceptado
    await supabase.from("pedidos_web_pendientes")
      .update({estado:"aceptado"})
      .eq("id",pedido.id);

    toast.ok(`Pedido #${pedido.id} aceptado — ahora aparece en Ingresos`);
    await cargarPedidosWeb();
    await cargar();
    return true;
  }

  async function rechazarPedidoWeb(pedidoId){
    const {error} = await supabase.from("pedidos_web_pendientes")
      .update({estado:"rechazado"})
      .eq("id",pedidoId);
    if(error){ toast.err("Error al rechazar"); return; }
    toast.ok("Pedido rechazado");
    await cargarPedidosWeb();
  }

  // Cargar pedidos web al inicio + polling cada 30 segundos
  useEffect(()=>{
    if(loading) return;
    cargarPedidosWeb();
    const interval = setInterval(cargarPedidosWeb, 30000);
    return () => clearInterval(interval);
  },[loading]);

  // ── CONTROL DE STOCK (conteo físico + ajuste) ───────────────
  // items: [{id, codigo, nombre, stock (stock de sistema al momento de contar), contado}]
  async function crearConteoStock({categoria,responsable,items}){
    const{data:conteo,error}=await supabase.from("conteos_stock").insert({
      categoria, responsable, fecha:hoy()
    }).select().single();
    if(error){ console.error("Error creando conteo de stock:",error); toast.err("Error al guardar el conteo"); return false; }

    const filas = items.map(it=>({
      conteo_id:conteo.id, producto_id:it.id, codigo:it.codigo||"", nombre:it.nombre,
      stock_sistema:it.stock||0, stock_contado:it.contado
    }));
    const{error:errItems}=await supabase.from("conteos_stock_items").insert(filas);
    if(errItems){ console.error("Error guardando items del conteo:",errItems); toast.err("Error al guardar el detalle del conteo"); return false; }

    // Avisar a los admins: crear una tarea pendiente para que revisen y apliquen el ajuste.
    // Sin responsable asignado — la puede tomar cualquier admin (Pablo o Kito). Queda vinculada a este
    // conteo por el "Conteo #id" en la descripción, para poder cerrarla sola cuando se aplique el ajuste.
    try{
      await supabaseTareas.from("tareas").insert({
        titulo: `Aplicar ajuste de stock: ${categoria} (${localActivo.nombre})`,
        descripcion: `Conteo #${conteo.id} registrado por ${responsable} el ${hoy()}. Revisar diferencias y aplicar el ajuste desde Control de Stock.`,
        responsable: null,
        local: localKey,
        prioridad: "alta",
        fecha_limite: hoy(),
        proyecto: "Control de Stock (ajuste)",
        estado: "pendiente",
        creado_por: "Sistema (automático)",
      });
    }catch(e){ console.warn("No se pudo crear la tarea de aviso del conteo:",e); }

    toast.ok(`Conteo de "${categoria}" guardado — ${items.length} productos`);
    await cargar();
    return true;
  }

  // Aplica la DIFERENCIA encontrada en el conteo (stock_contado - stock_sistema) sobre
  // el stock actual del sistema al momento de aplicar -- no pisa con el valor contado
  // directamente, porque entre que se contó y se aplica pueden haber pasado ventas,
  // compras o traspasos que ya movieron el stock real. Lee el stock actual fresco de
  // la base (no del estado en memoria, que puede estar desactualizado) justo antes de
  // ajustar, para no perder movimientos que pasaron mientras tanto.
  async function aplicarConteoStock(conteoId,aplicadoPor){
    const conteo = conteosStock.find(c=>c.id===conteoId);
    if(!conteo) return;
    const items = (conteo.conteos_stock_items||[]).filter(it=>it.stock_contado!==it.stock_sistema);
    if(items.length){
      const idsProductos = items.map(it=>it.producto_id);
      const{data:productosActuales,error:errActuales}=await supabase.from("productos").select("id,stock,costo").in("id",idsProductos);
      if(errActuales){ console.error("Error leyendo stock actual para aplicar el conteo:",errActuales); toast.err("No se pudo leer el stock actual, no se aplicó nada"); return; }
      const actualPorId = Object.fromEntries((productosActuales||[]).map(p=>[p.id,p]));
      for(const item of items){
        const diferencia = item.stock_contado - item.stock_sistema;
        const actual = actualPorId[item.producto_id];
        const stockActual = actual?.stock ?? item.stock_sistema;
        await supabase.from("productos").update({stock:stockActual+diferencia}).eq("id",item.producto_id);
      }
      // Dejar rastro en el historial de abastecimiento, mismo patrón que usan los traspasos
      // (cantidad con signo, costo del producto) -- así todo movimiento de stock que no es una
      // venta queda auditable en un solo lugar.
      try{
        const filasAbastecimiento = items.map(item=>{
          const actual = actualPorId[item.producto_id];
          return{
            fecha: hoy(), producto_id: item.producto_id, nombre: item.nombre,
            cantidad: item.stock_contado-item.stock_sistema, costo_unit: actual?.costo||0,
            proveedor: "Ajuste por inventario", metodo_pago: "Ajuste interno",
            responsable: aplicadoPor, notas: `Ajuste por conteo de stock #${conteoId} (${conteo.categoria})`,
          };
        });
        await supabase.from("abastecimiento").insert(filasAbastecimiento);
      }catch(e){ console.warn("No se pudo dejar rastro del ajuste en abastecimiento:",e); }
    }
    const{error}=await supabase.from("conteos_stock").update({
      aplicado:true, aplicado_en:new Date().toISOString(), aplicado_por:aplicadoPor
    }).eq("id",conteoId);
    if(error){ console.error("Error marcando conteo como aplicado:",error); toast.err("Se ajustó el stock pero no se pudo marcar el conteo como aplicado"); await cargar(); return; }

    // Cerrar sola la tarea de aviso vinculada a este conteo, si sigue pendiente.
    try{
      const tareaVinculada = (tareas||[]).find(t=>t.proyecto==="Control de Stock (ajuste)"&&(t.descripcion||"").includes(`Conteo #${conteoId} `)&&t.estado!=="hecha");
      if(tareaVinculada){
        await supabaseTareas.from("tareas").update({
          estado:"hecha", completada_at:new Date().toISOString(), completada_por:aplicadoPor,
          comentario_cierre:"Ajuste de stock aplicado automáticamente"
        }).eq("id",tareaVinculada.id);
      }
    }catch(e){ console.warn("No se pudo cerrar la tarea vinculada al conteo:",e); }

    toast.ok("Ajuste de stock aplicado");
    await cargar();
  }

  // Corrige los números contados de un conteo TODAVÍA NO aplicado (ej: un vendedor se confundió de
  // producto al contar). No toca productos.stock — eso sigue haciendo falta aplicarlo aparte.
  async function editarConteoStockItems(itemsEditados){
    for(const it of itemsEditados){
      const{error}=await supabase.from("conteos_stock_items").update({stock_contado:it.contado}).eq("id",it.id);
      if(error){ console.error("Error corrigiendo item de conteo:",error); toast.err("Error al corregir el conteo"); return; }
    }
    toast.ok("Conteo corregido");
    await cargar();
  }

  // Lista fija de responsables: unión de los vendedores activos de AMBOS locales, sin repetir.
  // Las tareas son compartidas, así que una tarea de Pilar puede asignarse a alguien de Caamaño.
  const responsables = useMemo(()=>{
    const vistos = new Set();
    const out = [];
    [...(vendedores||[]),...(vendedoresOtro||[])].forEach(v=>{
      const clave = (v.nombre||"").trim().toLowerCase();
      if(!clave||vistos.has(clave)) return;
      vistos.add(clave);
      out.push(v.nombre.trim());
    });
    return out.sort((a,b)=>a.localeCompare(b));
  },[vendedores,vendedoresOtro]);

  return{clientes,productos,ventasConItems,egresos,abastecimiento,vendedores,vendedoresOtro,proveedores,tipoCambio,totalVentas,totalNosDeben,anioStats,traspasos,pagosTraspaso,totalDeudaCamanio,pedidosWeb,pagosEgreso,loading,cargar,cargarPedidosWeb,aceptarPedidoWeb,rechazarPedidoWeb,registrarVenta,registrarDevolucion,devoluciones,registrarEgreso,marcarReembolsado,registrarPagoEgreso,eliminarPagoEgreso,guardarCliente,guardarProducto,registrarAbastecimiento,guardarVendedor,toggleVendedor,guardarProveedor,toggleProveedor,editarVenta,eliminarVenta,editarEgreso,eliminarEgreso,editarAbastecimiento,eliminarAbastecimiento,eliminarProducto,actualizarTipoCambio,actualizarPorcentaje,actualizarDesdeCSV,registrarTraspaso,registrarPagoTraspaso,editarPagoDeuda,eliminarPagoDeuda,tareas,responsables,guardarTarea,cambiarEstadoTarea,eliminarTarea,conteosStock,crearConteoStock,aplicarConteoStock,editarConteoStockItems,asegurarTareasControlStockMensual,historialValorStock,asegurarValorStockDiario,presupuestos,crearPresupuesto,aprobarPresupuesto,cancelarPresupuesto,editarPresupuestoItems,descuentosEgreso,registrarDescuentoEgreso,eliminarDescuentoEgreso,registrarAbastecimientoLote};
}

// ============================================================
// MODULO: ANALISIS / DASHBOARD
// ============================================================
function ModuloAnalisis({ventas,egresos,productos,vendedores,totalNosDeben,totalDeudaCamanio,anioStats,devoluciones=[],descuentosEgreso=[],pagosEgreso=[],onNavegar,onFiltroIngresos,onFiltroEgresos}){
  const hoyStr=hoy();const mesAct_=mesAct();const anio=new Date().getFullYear().toString();
  const [periodo,setPeriodo]=useState("mes"); // "hoy"|"dia"|"mes"|"mesEsp"|"anio"
  const [paretoOpen,setParetoOpen]=useState(false);
  const [paretoTipo,setParetoTipo]=useState("cantidad"); // "cantidad" | "ganancia"
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

  // Devoluciones del mismo período — su ganancia revertida se descuenta para no inflar los reportes
  const devSel = periodo==="hoy"||periodo==="dia"
    ? (devoluciones||[]).filter(d=>d.fecha===prefijoDia)
    : periodo==="mes"||periodo==="mesEsp"
    ? (devoluciones||[]).filter(d=>d.fecha?.startsWith(prefijoMes))
    : (devoluciones||[]).filter(d=>d.fecha?.startsWith(anio));
  const gananciaRevertidaSel = devSel.reduce((s,d)=>s+(d.ganancia_revertida||0),0);

  // ── Metricas ──
  const facturacion  = periodo==="anio" ? anioStats.facturacion : vSel.reduce((s,v)=>s+(v.total||0),0);
  const gananciaNeta = (periodo==="anio" ? anioStats.ganancia    : vSel.reduce((s,v)=>s+(v.ganancia||0),0)) - gananciaRevertidaSel;
  const cantVentas   = periodo==="anio" ? anioStats.cantidad    : vSel.length;
  const pctGanancia=facturacion>0?Math.round(gananciaNeta/facturacion*100):0;
  const ticketProm=cantVentas>0?Math.round(facturacion/cantVentas):0;
  // Neto de descuentos de proveedor recibidos sobre ese egreso (ej. descuento por pronto
  // pago) -- el costo real fue siempre el neto, aunque el descuento haya llegado después.
  const descXEgreso = id => descuentosEgreso.filter(d=>d.egreso_id===id).reduce((s,d)=>s+(d.monto||0),0);
  // Comisiones de plataforma pagadas al saldar ese egreso -- al revés que el descuento,
  // suman: el costo real fue mayor al nominal porque la plataforma cobró de más por pagar así.
  const comisionXEgreso = id => pagosEgreso.filter(p=>p.egreso_id===id).reduce((s,p)=>s+(p.comision_plataforma||0),0);
  const gastosFijos=eSel.filter(e=>e.tipo==="Gasto fijo").reduce((s,e)=>s+(e.monto||0)-descXEgreso(e.id)+comisionXEgreso(e.id),0);
  const gastosVar=eSel.filter(e=>e.tipo==="Gasto variable").reduce((s,e)=>s+(e.monto||0)-descXEgreso(e.id)+comisionXEgreso(e.id),0);
  const gananciaReal=gananciaNeta-gastosFijos;
  const pctGananciaReal=facturacion>0?Math.round(gananciaReal/facturacion*100):0;

  // ── Lo que debemos (egresos con reembolso pendiente) ──
  const egresosADeber = egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado);
  const totalDebemos = egresosADeber.reduce((s,e)=>{
    const saldo=(e.saldo_pendiente||0)>0 ? e.saldo_pendiente : (e.monto||0)-(e.monto_reembolsado||0);
    return s+saldo;
  },0);
  // Acreedores distintos (a quién le debemos)
  const acreedores = [...new Set(egresosADeber.map(e=>e.pagador||e.proveedor||"Sin especificar"))];

  // ── Graficos responden al periodo (usan vSel) ──
  const porVend=(vendedores||[]).map(({nombre:v})=>({v,total:vSel.filter(x=>x.vendedor===v).reduce((s,x)=>s+(x.total||0),0),cant:vSel.filter(x=>x.vendedor===v).length})).sort((a,b)=>b.total-a.total);
  const maxV=Math.max(...porVend.map(x=>x.total),1);
  const porMet=METODOS_PAGO.map(m=>({m,total:vSel.filter(v=>v.metodo_pago===m).reduce((s,v)=>s+(v.total||0),0),cant:vSel.filter(v=>v.metodo_pago===m).length})).filter(x=>x.cant>0).sort((a,b)=>b.total-a.total);
  const maxM=Math.max(...porMet.map(x=>x.total),1);
  // Mas vendidos: calcular desde vSel
  const vendidosPorProd=vSel.reduce((acc,v)=>{(v.items||[]).forEach(i=>{if(i.nombre)acc[i.nombre]=(acc[i.nombre]||0)+(i.cantidad||0);});return acc;},{});
  const topProd=Object.entries(vendidosPorProd).map(([nombre,cant])=>({nombre,cant})).sort((a,b)=>b.cant-a.cant).slice(0,5);
  const maxP=Math.max(...topProd.map(p=>p.cant),1);

  // Pareto data — top 20 por cantidad o ganancia
  const paretoCantData=Object.entries(vendidosPorProd).map(([nombre,cant])=>({nombre,valor:cant})).sort((a,b)=>b.valor-a.valor).slice(0,20);
  // Ganancia por producto: (precio − costo) × cantidad de cada item, sumados por nombre
  const gananciaPorProd=vSel.reduce((acc,v)=>{
    const desc=v.descuento||0;
    (v.items||[]).forEach(i=>{
      if(!i.nombre)return;
      const precioConDesc=(i.precio||0)*(1-desc/100);
      const ganItem=(precioConDesc-(i.costo||0))*(i.cantidad||0);
      acc[i.nombre]=(acc[i.nombre]||0)+ganItem;
    });
    return acc;
  },{});
  const paretoGanData=Object.entries(gananciaPorProd).map(([nombre,valor])=>({nombre,valor:Math.round(valor)})).sort((a,b)=>b.valor-a.valor).slice(0,20);
  const sinCobrar=ventas.filter(v=>!v.cobrado);
  const sinEntregar=ventas.filter(v=>!v.entregado);
  const alertasStock=productos.filter(p=>p.activo&&estadoStock(p)!=="ok");
  const valorStock=productos.reduce((s,p)=>s+precioARS(p.costo,p.moneda)*p.stock,0);

  const labelPeriodo=periodo==="hoy"?"Hoy":periodo==="dia"?diaEsp:periodo==="mes"?"Este mes":periodo==="mesEsp"?mesEsp:"Este año";

  // ── FACTURACIÓN OBJETIVO ────────────────────────────────────
  // Calcula gastos fijos y % ganancia de un mes dado (formato "YYYY-MM")
  function statsDelMes(mesStr){
    const vMes = ventas.filter(v=>v.fecha?.startsWith(mesStr));
    const eMes = egresos.filter(e=>e.fecha?.startsWith(mesStr));
    const gFijos = eMes.filter(e=>e.tipo==="Gasto fijo").reduce((s,e)=>s+(e.monto||0),0);
    const fact   = vMes.reduce((s,v)=>s+(v.total||0),0);
    const gan    = vMes.reduce((s,v)=>s+(v.ganancia||0),0);
    const pctGan = fact>0 ? gan/fact : 0;
    return { gFijos, pctGan, fact };
  }

  // Devuelve "YYYY-MM" del mes anterior a una fecha dada
  function mesAnterior(refMes){ // refMes = "YYYY-MM"
    const [y,m] = refMes.split("-").map(Number);
    const d = new Date(y, m-1, 1);
    d.setMonth(d.getMonth()-1);
    return d.toISOString().slice(0,7);
  }

  // Cuenta días hábiles (lun-sab) de un mes dado
  function diasHabilesDelMes(mesStr){
    const [y,m] = mesStr.split("-").map(Number);
    const diasEnMes = new Date(y, m, 0).getDate();
    let count = 0;
    for(let d=1; d<=diasEnMes; d++){
      const dia = new Date(y, m-1, d).getDay(); // 0=dom,6=sab
      if(dia !== 0) count++; // excluye domingos
    }
    return count;
  }

  // Calcula facturación objetivo según el periodo activo
  const calcObjetivo = ()=>{
    const mesActStr = mesAct_; // "YYYY-MM" del mes actual
    let gFijos=0, pctGan=0, refMesStr="", esDiario=false;

    if(periodo==="hoy"||periodo==="dia"){
      // Referencia: mes inmediato anterior al día seleccionado
      const fechaRef = periodo==="hoy" ? hoyStr : diaEsp;
      refMesStr = mesAnterior(fechaRef.slice(0,7));
      const s = statsDelMes(refMesStr);
      gFijos=s.gFijos; pctGan=s.pctGan;
      esDiario=true;
    } else if(periodo==="mes"){
      // Mes actual en curso → referencia: mes anterior
      refMesStr = mesAnterior(mesActStr);
      const s = statsDelMes(refMesStr);
      gFijos=s.gFijos; pctGan=s.pctGan;
    } else if(periodo==="mesEsp"){
      // Mes específico: si es el mes actual → mes anterior; si está cerrado → mismo mes
      if(mesEsp===mesActStr){
        refMesStr = mesAnterior(mesActStr);
        const s = statsDelMes(refMesStr);
        gFijos=s.gFijos; pctGan=s.pctGan;
      } else {
        refMesStr = mesEsp;
        const s = statsDelMes(refMesStr);
        gFijos=s.gFijos; pctGan=s.pctGan;
      }
    } else if(periodo==="anio"){
      // Promedio de los últimos 3 meses completos
      const meses3 = [mesAnterior(mesActStr), mesAnterior(mesAnterior(mesActStr)), mesAnterior(mesAnterior(mesAnterior(mesActStr)))];
      const stats3 = meses3.map(m=>statsDelMes(m));
      gFijos = stats3.reduce((s,x)=>s+x.gFijos,0) / 3;
      const factProm = stats3.reduce((s,x)=>s+x.fact,0) / 3;
      const ganProm  = stats3.reduce((s,x)=>s+(x.fact*x.pctGan),0) / 3;
      pctGan = factProm>0 ? ganProm/factProm : 0;
    }

    if(pctGan<=0) return { valor:0, label:"Sin datos de referencia", sinDatos:true };

    const factMensualMin = gFijos / pctGan;

    if(esDiario){
      const diasHab = diasHabilesDelMes(refMesStr);
      const factDia = diasHab>0 ? factMensualMin/diasHab : 0;
      return { valor:factDia, label:`Base: ${refMesStr} · ${diasHab} días háb.+sáb`, sinDatos:false };
    } else if(periodo==="anio"){
      return { valor:factMensualMin*12, label:"Prom. últ. 3 meses × 12", sinDatos:false };
    } else {
      return { valor:factMensualMin, label:`Base: ${refMesStr}`, sinDatos:false };
    }
  };

  const objetivo = calcObjetivo();
  const pctCumplimiento = objetivo.valor>0 ? Math.round((facturacion/objetivo.valor)*100) : 0;
  const colorObjetivo = pctCumplimiento>=100?G.verde:pctCumplimiento>=70?G.amarillo:G.rojo;

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
      <div className="psk-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label={`Facturación Neta — ${labelPeriodo}`} value={fmt(facturacion)} sub={`${cantVentas} ventas`} color={G.verde} accent={"#00C48C33"}/>
        <MetricCard label="Ganancia Neta" value={fmt(gananciaNeta)} color={G.verde} sub={`${pctGanancia}% sobre ventas`}/>
        <MetricCard label="% Ganancia" value={`${pctGanancia}%`} color={pctGanancia>=30?G.verde:pctGanancia>=15?G.amarillo:G.rojo} sub="Ganancia / Facturación"/>
        <MetricCard label="Ticket Promedio" value={fmt(ticketProm)} color={G.azul} sub="Por venta"/>
      </div>

      {/* Fila 2: Gastos y Ganancia Real */}
      <div className="psk-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Gastos Fijos" value={fmt(gastosFijos)} color={G.rojo} accent={"#FF4D6A33"}/>
        <MetricCard label="Gastos Variables" value={fmt(gastosVar)} color={G.naranja} accent={"#FF8C4233"}/>
        <MetricCard label="Ganancia Real" value={fmt(gananciaReal)} color={gananciaReal>=0?G.verde:G.rojo} sub={`Gan. Neta − G.Fijos (${fmt(gastosFijos)})`} accent={gananciaReal>=0?"#00C48C22":"#FF4D6A22"}/>
        <MetricCard label="% Ganancia Real" value={`${pctGananciaReal}%`} color={pctGananciaReal>=20?G.verde:pctGananciaReal>=5?G.amarillo:G.rojo} sub="Ganancia Real / Facturación"/>
      </div>

      {/* Fila 3: Facturación Objetivo */}
      <div className="psk-grid-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard
          label={`Facturación Objetivo — ${labelPeriodo}`}
          value={objetivo.sinDatos ? "Sin datos" : fmt(objetivo.valor)}
          color={objetivo.sinDatos ? G.textoSec : colorObjetivo}
          sub={objetivo.sinDatos ? "No hay egresos del mes anterior" : `${objetivo.label} · ${pctCumplimiento}% cumplido`}
          accent={objetivo.sinDatos ? undefined : colorObjetivo+"33"}
        />
        <MetricCard
          label="Cumplimiento del objetivo"
          value={objetivo.sinDatos ? "—" : `${pctCumplimiento}%`}
          color={objetivo.sinDatos ? G.textoSec : colorObjetivo}
          sub={objetivo.sinDatos ? "" : pctCumplimiento>=100?"✓ Objetivo alcanzado":pctCumplimiento>=70?"En camino":"Por debajo del objetivo"}
          accent={objetivo.sinDatos ? undefined : colorObjetivo+"22"}
        />
        <MetricCard
          label={gananciaReal>=0?"Ganancia disponible":"Pérdida del periodo"}
          value={fmt(Math.abs(gananciaReal))}
          color={gananciaReal>=0?G.verde:G.rojo}
          sub={gananciaReal>=0?"Ganancia Neta − Gastos Fijos":"Gastos Fijos superan la Ganancia Neta"}
          accent={gananciaReal>=0?"#00C48C22":"#FF4D6A22"}
        />
      </div>

      {/* Grafico de evolución de facturación */}
      {(()=>{
        // ── Preparar series y meta granular según periodo ──
        let puntos = []; // [{label, valor}]
        let metaGranular = 0; // objetivo a la misma escala que cada punto

        if(periodo==="hoy"||periodo==="dia"){
          // Serie: facturación acumulada por hora del día
          const fechaRef = periodo==="hoy" ? hoyStr : diaEsp;
          const ventasDia = ventas.filter(v=>v.fecha===fechaRef);
          const porHora = {};
          ventasDia.forEach(v=>{
            const h = (v.hora||"00:00").slice(0,2);
            porHora[h] = (porHora[h]||0)+(v.total||0);
          });
          const horas = Object.keys(porHora).sort();
          puntos = horas.map(h=>({label:h+"h", valor:porHora[h]}));
          // Meta diaria = objetivo.valor (ya calculado como diario)
          metaGranular = objetivo.sinDatos ? 0 : objetivo.valor;

        } else if(periodo==="mes"||periodo==="mesEsp"){
          // Serie: facturación de cada día del mes (solo días con ventas o todos)
          const mesRef = periodo==="mes" ? mesAct_ : mesEsp;
          const [y,m] = mesRef.split("-").map(Number);
          const diasEnMes = new Date(y,m,0).getDate();
          const ventasMes = ventas.filter(v=>v.fecha?.startsWith(mesRef));
          const porDia = {};
          ventasMes.forEach(v=>{
            const d = v.fecha?.slice(8,10);
            if(d) porDia[d]=(porDia[d]||0)+(v.total||0);
          });
          for(let d=1;d<=diasEnMes;d++){
            const key=String(d).padStart(2,"0");
            // Incluir todos los días (0 si no hubo ventas)
            puntos.push({label:String(d), valor:porDia[key]||0});
          }
          // Meta diaria = objetivo mensual / días hábiles del mes
          if(!objetivo.sinDatos){
            const diasHab = diasHabilesDelMes(mesRef);
            metaGranular = diasHab>0 ? objetivo.valor/diasHab : 0;
          }

        } else if(periodo==="anio"){
          // Serie: facturación de cada mes del año
          const mesesLabel=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
          for(let m=1;m<=12;m++){
            const mesStr=anio+"-"+String(m).padStart(2,"0");
            const total=ventas.filter(v=>v.fecha?.startsWith(mesStr)).reduce((s,v)=>s+(v.total||0),0);
            puntos.push({label:mesesLabel[m-1], valor:total});
          }
          // Meta mensual = objetivo anual / 12
          metaGranular = objetivo.sinDatos ? 0 : objetivo.valor/12;
        }

        if(puntos.length===0) return null;

        const meta = metaGranular;

        // ── Dimensiones SVG ──
        const W=900, H=240, PL=68, PR=20, PT=24, PB=36;
        const cW=W-PL-PR, cH=H-PT-PB;
        const maxVal=Math.max(...puntos.map(p=>p.valor), meta*1.15, 1);

        const bandW = cW/puntos.length;
        const xPos=(i)=>PL + bandW*(i+0.5); // centro de banda (usado para labels y barras)
        const yPos=(v)=>PT + cH - Math.min(v/maxVal,1)*cH;
        const metaY = meta>0 ? yPos(meta) : -999;

        const gridVals=[0,0.25,0.5,0.75,1].map(f=>Math.round(maxVal*f));
        const fmtY=v=>v>=1000000?"$"+(v/1000000).toFixed(1)+"M":v>=1000?"$"+(v/1000).toFixed(0)+"k":"$"+v;

        return(
          <Card>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
              <ST style={{margin:0}}>Evolución de facturación — {labelPeriodo}</ST>
              <div style={{display:"flex",gap:16,fontSize:11,color:G.textoSec,alignItems:"center"}}>
                {meta>0&&<span style={{color:G.verde}}>┄ Objetivo: {fmt(Math.round(meta))}</span>}
                <span style={{color:G.verde}}>■ Facturación</span>
              </div>
            </div>
            <div style={{overflowX:"auto"}}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",minWidth:320,height:H,display:"block"}}>
                {/* Grilla Y */}
                {gridVals.map((v,i)=>(
                  <g key={i}>
                    <line x1={PL} y1={yPos(v)} x2={W-PR} y2={yPos(v)} stroke="#2A3045" strokeWidth="0.8"/>
                    <text x={PL-6} y={yPos(v)+4} fontSize="9" fill="#7A8099" textAnchor="end">{fmtY(v)}</text>
                  </g>
                ))}

                {/* Línea objetivo punteada verde */}
                {meta>0&&metaY>PT&&metaY<PT+cH&&(
                  <line x1={PL} y1={metaY} x2={W-PR} y2={metaY}
                    stroke={G.verde} strokeWidth="1.5" strokeDasharray="7,4" opacity="0.8"/>
                )}

                {/* Barras de facturación */}
                {puntos.map((p,i)=>{
                  const barW = Math.max(bandW*0.55, 2);
                  const x = xPos(i) - barW/2;
                  const y = yPos(p.valor);
                  const h = Math.max(PT+cH-y, p.valor>0?1:0);
                  const col = meta>0
                    ? (p.valor>=meta ? G.verde : p.valor>=meta*0.7 ? G.amarillo : G.rojo)
                    : G.verde;
                  return(
                    <rect key={i} x={x} y={y} width={barW} height={h} fill={col} rx="2" opacity="0.9">
                      <title>{p.label}: {fmt(p.valor)}{meta>0?" · Objetivo: "+fmt(Math.round(meta)):""}</title>
                    </rect>
                  );
                })}

                {/* Labels eje X */}
                {puntos.map((p,i)=>{
                  const step = puntos.length>24?4:puntos.length>15?3:puntos.length>10?2:1;
                  if(i%step!==0&&i!==puntos.length-1) return null;
                  return(
                    <text key={i} x={xPos(i)} y={H-6} fontSize="9" fill="#7A8099" textAnchor="middle">{p.label}</text>
                  );
                })}
              </svg>
            </div>
          </Card>
        );
      })()}

      {/* Lo que debemos — debajo del grafico de evolucion */}
      <div onClick={()=>{onFiltroEgresos("aReembolsar");onNavegar("egresos");}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <MetricCard
          label="Lo que debemos — click para ver"
          value={fmt(totalDebemos)}
          color={totalDebemos>0?G.naranja:G.verde}
          sub={totalDebemos>0?`${acreedores.length} ${acreedores.length===1?"acreedor":"acreedores"} · ${egresosADeber.length} egresos pendientes`:"Sin deudas pendientes"}
          accent={totalDebemos>0?"#FF8C4244":undefined}
        />
      </div>

      {/* Nos deben clientes + Nos debe Caamaño + Sin entregar */}
      <div className="psk-grid-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <div onClick={()=>{onFiltroIngresos("sinCobrar");onNavegar("ingresos");}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <MetricCard label="Nos deben clientes — click para ver" value={fmt(totalNosDeben)} color={G.azul} sub={`${sinCobrar.length} ventas sin cobrar`} accent={"#4D9EFF44"}/>
        </div>
        {totalDeudaCamanio>0&&(
          <div onClick={()=>onNavegar("traspasos")} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
            <MetricCard label="Nos debe Caamaño — click para ver" value={fmt(totalDeudaCamanio)} color={G.rojo} sub="Saldo pendiente de traspasos" accent={"#FF4D6A22"}/>
          </div>
        )}
        <div onClick={()=>{onFiltroIngresos("sinEntregar");onNavegar("ingresos");}} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
          <MetricCard label="Sin entregar — click para ver" value={fmtNum(sinEntregar.length)} color={G.amarillo} sub="ventas pendientes de entrega" accent={"#FFB80033"}/>
        </div>
      </div>
      <div onClick={()=>onNavegar("valor_stock")} style={{cursor:"pointer",transition:"opacity .15s"}} onMouseEnter={e=>e.currentTarget.style.opacity=".8"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <MetricCard label="Valor stock a costo — click para ver evolución" value={fmt(valorStock)} color={G.azul} sub="a costo · ver evolución en ARS/USD" accent={"#4D9EFF33"}/>
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
      <div className="psk-grid-3" style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
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
        <Card style={{cursor:"pointer",transition:"all .15s"}} onClick={()=>setParetoOpen(true)} onMouseEnter={e=>e.currentTarget.style.borderColor=G.verde} onMouseLeave={e=>e.currentTarget.style.borderColor=G.borde}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <ST style={{margin:0}}>Mas vendidos — {labelPeriodo}</ST>
            <span style={{fontSize:10,color:G.verde,fontWeight:600}}>📊 Ver Pareto</span>
          </div>
          {topProd.length===0&&<div style={{fontSize:12,color:G.textoSec}}>Sin datos para este periodo</div>}
          {topProd.map((p,i)=>(
            <div key={i} style={{marginBottom:11}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:12,fontWeight:500}}>{p.nombre}</span><span style={{fontSize:12,fontFamily:"'DM Mono',monospace",color:G.violeta}}>{fmtNum(p.cant)} u.</span></div>
              <div style={{height:5,background:G.sup2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${(p.cant/maxP)*100}%`,background:G.violeta,borderRadius:3}}/></div>
            </div>
          ))}
        </Card>
      </div>

      {/* Modal Pareto */}
      {paretoOpen&&(()=>{
        const data = paretoTipo==="cantidad" ? paretoCantData : paretoGanData;
        const total = data.reduce((s,d)=>s+d.valor,0);
        const maxV = Math.max(...data.map(d=>d.valor),1);
        let acum=0;
        const dataConPct = data.map(d=>{
          acum += d.valor;
          return {...d, pct:total>0?(d.valor/total*100):0, acumPct:total>0?(acum/total*100):0};
        });
        const fmtVal = v => paretoTipo==="cantidad" ? fmtNum(v)+" u." : fmt(v);
        const chartW = Math.max(800, dataConPct.length*42);
        return(
          <Modal title={"Análisis de Pareto — "+labelPeriodo} onClose={()=>setParetoOpen(false)} maxWidth={900}>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",gap:8}}>
                {[{k:"cantidad",l:"Por cantidad vendida"},{k:"ganancia",l:"Por ganancia generada"}].map(t=>(
                  <button key={t.k} onClick={()=>setParetoTipo(t.k)}
                    style={{flex:1,padding:"10px",borderRadius:10,border:"2px solid "+(paretoTipo===t.k?G.verde:G.borde),background:paretoTipo===t.k?"#00C48C18":G.sup2,color:paretoTipo===t.k?G.verde:G.textoSec,fontWeight:600,fontSize:13,cursor:"pointer"}}>
                    {t.l}
                  </button>
                ))}
              </div>
              <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
                Total {paretoTipo==="cantidad"?"unidades":"ganancia"}: <strong style={{color:G.texto}}>{fmtVal(total)}</strong> · Top {dataConPct.length} productos
              </div>
              {data.length===0?(
                <div style={{textAlign:"center",padding:"40px 0",color:G.textoSec}}>Sin datos para este periodo</div>
              ):(
                <>
                  <div style={{background:G.sup2,borderRadius:10,padding:16,overflow:"auto"}}>
                    <svg viewBox={"0 0 "+chartW+" 320"} style={{width:"100%",height:320,minWidth:800}}>
                      {[0,25,50,75,100].map(p=>(
                        <g key={p}>
                          <line x1="50" y1={280-p*2.4} x2={chartW-50} y2={280-p*2.4} stroke="#444" strokeWidth="0.5" strokeDasharray="3,3"/>
                          <text x="45" y={284-p*2.4} fontSize="9" fill="#888" textAnchor="end">{p}%</text>
                        </g>
                      ))}
                      {dataConPct.map((d,i)=>{
                        const x = 60 + i*40;
                        const altura = (d.valor/maxV)*220;
                        return(
                          <g key={i}>
                            <rect x={x-14} y={280-altura} width="28" height={altura} fill="#7B61FF" rx="2"><title>{d.nombre+": "+fmtVal(d.valor)+" ("+d.pct.toFixed(1)+"%)"}</title></rect>
                            <text x={x} y={275-altura} fontSize="8" fill="#7B61FF" textAnchor="middle" fontWeight="600">
                              {paretoTipo==="cantidad"?fmtNum(d.valor):"$"+fmtNum(Math.round(d.valor/1000))+"k"}
                            </text>
                            <text x={x} y="295" fontSize="9" fill="#888" textAnchor="middle">{i+1}</text>
                          </g>
                        );
                      })}
                      <polyline points={dataConPct.map((d,i)=>(60+i*40)+","+(280-d.acumPct*2.4)).join(" ")} fill="none" stroke="#FF8C42" strokeWidth="2"/>
                      {dataConPct.map((d,i)=>(
                        <g key={"pt-"+i}>
                          <circle cx={60+i*40} cy={280-d.acumPct*2.4} r="3" fill="#FF8C42"/>
                          <text x={60+i*40} y={275-d.acumPct*2.4} fontSize="8" fill="#FF8C42" textAnchor="middle" fontWeight="600">{d.acumPct.toFixed(0)}%</text>
                        </g>
                      ))}
                      <line x1="50" y1={280-80*2.4} x2={chartW-50} y2={280-80*2.4} stroke="#FF4D6A" strokeWidth="1" strokeDasharray="4,4"/>
                      <text x={chartW-55} y={278-80*2.4} fontSize="9" fill="#FF4D6A" textAnchor="end" fontWeight="600">80%</text>
                    </svg>
                    <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8,fontSize:11,color:G.textoSec}}>
                      <span style={{color:G.violeta}}>■ Barras: {paretoTipo==="cantidad"?"unidades":"ganancia"}</span>
                      <span style={{color:"#FF8C42"}}>━ Curva: % acumulado</span>
                      <span style={{color:"#FF4D6A"}}>┄ Línea 80%</span>
                    </div>
                  </div>
                  <div style={{maxHeight:300,overflowY:"auto",border:"1px solid "+G.borde,borderRadius:8}}>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                      <thead style={{position:"sticky",top:0,background:G.sup2,zIndex:1}}>
                        <tr>
                          <th style={{padding:"8px 10px",textAlign:"left",color:G.textoSec,fontWeight:600,fontSize:10,letterSpacing:0.5,textTransform:"uppercase"}}>#</th>
                          <th style={{padding:"8px 10px",textAlign:"left",color:G.textoSec,fontWeight:600,fontSize:10,letterSpacing:0.5,textTransform:"uppercase"}}>Producto</th>
                          <th style={{padding:"8px 10px",textAlign:"right",color:G.textoSec,fontWeight:600,fontSize:10,letterSpacing:0.5,textTransform:"uppercase"}}>{paretoTipo==="cantidad"?"Cantidad":"Ganancia"}</th>
                          <th style={{padding:"8px 10px",textAlign:"right",color:G.textoSec,fontWeight:600,fontSize:10,letterSpacing:0.5,textTransform:"uppercase"}}>%</th>
                          <th style={{padding:"8px 10px",textAlign:"right",color:G.textoSec,fontWeight:600,fontSize:10,letterSpacing:0.5,textTransform:"uppercase"}}>% acum.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataConPct.map((d,i)=>(
                          <tr key={i} style={{borderTop:"1px solid "+G.borde+"33",background:d.acumPct<=80?"#7B61FF11":"transparent"}}>
                            <td style={{padding:"7px 10px",color:G.textoSec}}>{i+1}</td>
                            <td style={{padding:"7px 10px",fontWeight:500}}>{d.nombre}</td>
                            <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"DM Mono,monospace",color:G.violeta,fontWeight:600}}>{fmtVal(d.valor)}</td>
                            <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"DM Mono,monospace",color:G.textoSec}}>{d.pct.toFixed(1)}%</td>
                            <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"DM Mono,monospace",color:d.acumPct<=80?G.verde:G.textoSec,fontWeight:600}}>{d.acumPct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

    </div>
  );
}

// ============================================================
// MODULO: EVOLUCION VALOR DE STOCK
// ============================================================
function ModuloValorStock({historial=[]}){
  const [moneda,setMoneda] = useState("ARS"); // "ARS" | "USD"
  const datos = [...historial].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
  const ultimo = datos[datos.length-1];

  function variacion(diasAtras){
    if(!ultimo) return null;
    const objetivo = new Date(ultimo.fecha); objetivo.setDate(objetivo.getDate()-diasAtras);
    // El punto más cercano a esa fecha (puede no ser exacto si hubo días sin foto)
    const candidatos = datos.filter(d=>new Date(d.fecha)<=objetivo);
    if(candidatos.length===0) return null;
    const ref = candidatos[candidatos.length-1];
    const valorRef = moneda==="ARS"?ref.valor_ars:ref.valor_usd;
    const valorAct = moneda==="ARS"?ultimo.valor_ars:ultimo.valor_usd;
    if(!valorRef) return null;
    return{ref,pct:((valorAct-valorRef)/valorRef)*100};
  }
  const var7  = variacion(7);
  const var30 = variacion(30);

  const chartW = Math.max(700, datos.length*36);
  const valores = datos.map(d=>moneda==="ARS"?d.valor_ars:d.valor_usd);
  const maxV = Math.max(...valores,1);
  const minV = Math.min(...valores,0);
  const rango = (maxV-minV)||1;
  const puntos = datos.map((d,i)=>{
    const x = 55 + i*((chartW-90)/Math.max(1,datos.length-1));
    const v = moneda==="ARS"?d.valor_ars:d.valor_usd;
    const y = 260 - ((v-minV)/rango)*220;
    return{x,y,d};
  });

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
        <ST>Evolución del valor de stock a costo</ST>
        <div style={{display:"flex",gap:8}}>
          <Btn small variant={moneda==="ARS"?"primary":"secondary"} onClick={()=>setMoneda("ARS")}>Pesos</Btn>
          <Btn small variant={moneda==="USD"?"primary":"secondary"} onClick={()=>setMoneda("USD")}>Dólares</Btn>
        </div>
      </div>

      <div className="psk-grid-3" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Valor actual" value={ultimo?(moneda==="ARS"?fmt(ultimo.valor_ars):fmtUSD(ultimo.valor_usd)):"—"} color={G.azul} sub={ultimo?`Al ${ultimo.fecha} · TC $${fmtNum(ultimo.tipo_cambio_usado)}`:"Sin datos todavía"}/>
        <MetricCard label="Variación 7 días" value={var7?`${var7.pct>=0?"+":""}${var7.pct.toFixed(1)}%`:"—"} color={!var7?undefined:var7.pct>=0?G.verde:G.rojo} sub={var7?`vs ${var7.ref.fecha}`:"Sin suficiente historial"}/>
        <MetricCard label="Variación 30 días" value={var30?`${var30.pct>=0?"+":""}${var30.pct.toFixed(1)}%`:"—"} color={!var30?undefined:var30.pct>=0?G.verde:G.rojo} sub={var30?`vs ${var30.ref.fecha}`:"Sin suficiente historial"}/>
      </div>

      <Card>
        {datos.length===0?(
          <div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>
            Todavía no hay historial guardado. Se va a empezar a registrar una foto por día a partir de hoy.
          </div>
        ):datos.length===1?(
          <div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Solo hay un día registrado ({datos[0].fecha}) — el gráfico va a aparecer a medida que se acumulen más días.</div>
        ):(
          <div style={{overflowX:"auto"}}>
            <svg viewBox={`0 0 ${chartW} 290`} style={{width:"100%",height:290,minWidth:600,display:"block"}}>
              {[0,25,50,75,100].map(p=>{
                const y = 260-p*2.2;
                const val = minV+rango*p/100;
                return(
                  <g key={p}>
                    <line x1="50" y1={y} x2={chartW-20} y2={y} stroke="#444" strokeWidth="0.5" strokeDasharray="3,3"/>
                    <text x="45" y={y+3} fontSize="9" fill="#888" textAnchor="end">{moneda==="ARS"?"$"+fmtNum(Math.round(val/1000))+"k":"U$D "+fmtNum(Math.round(val))}</text>
                  </g>
                );
              })}
              <polyline points={puntos.map(p=>`${p.x},${p.y}`).join(" ")} fill="none" stroke={G.azul} strokeWidth="2"/>
              {puntos.map((p,i)=>(
                <circle key={i} cx={p.x} cy={p.y} r="3" fill={G.azul}>
                  <title>{`${p.d.fecha}: ${moneda==="ARS"?fmt(p.d.valor_ars):fmtUSD(p.d.valor_usd)}`}</title>
                </circle>
              ))}
              {puntos.filter((_,i)=>i%Math.max(1,Math.ceil(puntos.length/12))===0).map((p,i)=>(
                <text key={"lbl"+i} x={p.x} y="278" fontSize="8" fill="#888" textAnchor="middle">{p.d.fecha.slice(5)}</text>
              ))}
            </svg>
          </div>
        )}
      </Card>

      {datos.length>0&&(
        <Card>
          <ST>Detalle por día</ST>
          <div style={{display:"flex",flexDirection:"column",gap:1,maxHeight:340,overflowY:"auto",marginTop:8}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 90px",gap:8,padding:"6px 8px",fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>
              <span>Fecha</span><span style={{textAlign:"right"}}>Valor ARS</span><span style={{textAlign:"right"}}>Valor USD</span><span style={{textAlign:"right"}}>TC usado</span>
            </div>
            {[...datos].reverse().map(d=>(
              <div key={d.fecha} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 90px",gap:8,padding:"7px 8px",background:G.sup2,borderRadius:8,fontSize:13}}>
                <span>{d.fecha}</span>
                <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{fmt(d.valor_ars)}</span>
                <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:G.textoSec}}>{fmtUSD(d.valor_usd)}</span>
                <span style={{textAlign:"right",color:G.textoSec}}>${fmtNum(d.tipo_cambio_usado)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// MODULO: NUEVA VENTA
// ============================================================
// PDF de presupuesto, compartido entre "Nueva Venta" (al generarlo por primera vez) y
// "Presupuestos" (al reimprimir uno ya editado, mostrando su version si es >1).
async function generarPDFPresupuesto({nroPresupuesto,version=1,clienteNombre="CONSUMIDOR FINAL",vendedor,tipoCliente="minorista",items}){
    if(!window.jspdf){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,H=297;
    const azul=[20,53,107],azulClaro=[41,98,180],gris=[100,100,100],grisClar=[240,242,245],negro=[30,30,30],blanco=[255,255,255],verde=[0,150,100];
    const LOGO = 'data:image/jpeg;base64,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';
    const fmtP = n => '$ '+Math.round(n||0).toLocaleString('es-AR');
    const ahora = new Date();
    const fechaStr = ahora.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const horaStr  = ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
    const validezDate = new Date(ahora.getTime()+15*24*60*60*1000);
    const validezStr = validezDate.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const tipoListaLabel = tipoCliente.charAt(0).toUpperCase()+tipoCliente.slice(1);

    // Header azul
    doc.setFillColor(...azul);
    doc.rect(0,0,W,40,'F');
    try{const _img=new Image();_img.src=LOGO;await new Promise(r=>{_img.onload=r;_img.onerror=r;setTimeout(r,500);});doc.addImage(_img,'JPEG',8,5,30,30);}catch(e){}
    doc.setTextColor(...blanco);
    doc.setFont('helvetica','bold');
    doc.setFontSize(22);
    doc.text('PENSOK',46,17);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text('Piletas · Jardín · Limpieza · Fumigación',46,23);
    doc.setFontSize(8.5);
    doc.text(`Tel: ${LI.telefono}  ·  ${LI.instagram}`,46,30);
    // Badge presupuesto
    doc.setFillColor(...azulClaro);
    doc.roundedRect(W-58,8,52,24,3,3,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...blanco);
    doc.text('PRESUPUESTO',W-32,15,{align:'center'});
    doc.setFontSize(8);
    doc.text((nroPresupuesto||'')+(version>1?` (v${version})`:''),W-32,21,{align:'center'});
    doc.setFont('helvetica','normal');
    doc.text(fechaStr+' '+horaStr+'hs',W-32,27,{align:'center'});

    // Datos cliente y vendedor
    let y=50;
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...azul);
    doc.text('CLIENTE',14,y);
    doc.text('VENDEDOR',W/2,y);
    y+=6;
    doc.setFont('helvetica','normal');
    doc.setFontSize(11);
    doc.setTextColor(...negro);
    doc.text(clienteNombre,14,y);
    doc.text(vendedor||'—',W/2,y);
    y+=6;
    doc.setFontSize(9);
    doc.setTextColor(...gris);
    doc.text('Lista aplicada: '+tipoListaLabel,14,y);
    doc.text('Validez: '+validezStr,W/2,y);
    y+=6;
    doc.setDrawColor(220,220,220);
    doc.setLineWidth(0.3);
    doc.line(14,y,W-14,y);
    y+=8;

    // Tabla items
    doc.setFillColor(...azulClaro);
    doc.rect(14,y,W-28,8,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...blanco);
    doc.text('PRODUCTO',16,y+5.5);
    doc.text('CANT.',125,y+5.5,{align:'center'});
    doc.text('PRECIO UNIT.',150,y+5.5,{align:'center'});
    doc.text('SUBTOTAL',W-16,y+5.5,{align:'right'});
    y+=14;

    let filaPar=false;
    let subtotalBruto=0;
    for(const it of items){
      if(y>H-50){
        doc.addPage();
        y=20;
      }
      if(filaPar){doc.setFillColor(...grisClar);doc.rect(14,y-5,W-28,7,'F');}
      filaPar=!filaPar;
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.setTextColor(...negro);
      const nombre = it.nombre.length>55?it.nombre.substring(0,52)+'...':it.nombre;
      doc.text(nombre,16,y);
      doc.setTextColor(...gris);
      doc.text(String(it.cantidad),125,y,{align:'center'});
      doc.text(fmtP(it.precio),150,y,{align:'center'});
      const sub = it.precio*it.cantidad;
      subtotalBruto += sub;
      doc.setFont('helvetica','bold');
      doc.setTextColor(...negro);
      doc.text(fmtP(sub),W-16,y,{align:'right'});
      y+=8;
    }

    // Linea separadora
    y+=2;
    doc.setDrawColor(...azul);
    doc.setLineWidth(0.4);
    doc.line(W-90,y,W-14,y);
    y+=6;

    // Subtotal
    doc.setFont('helvetica','normal');
    doc.setFontSize(10);
    doc.setTextColor(...gris);
    doc.text('Subtotal',W-90,y);
    doc.setTextColor(...negro);
    doc.text(fmtP(subtotalBruto),W-16,y,{align:'right'});
    y+=6;

    // Descuento — siempre $0 en el presupuesto
    doc.setTextColor(...gris);
    doc.text('Descuento',W-90,y);
    doc.setTextColor(...negro);
    doc.text(fmtP(0),W-16,y,{align:'right'});
    y+=6;

    // Total — sin descuento en el presupuesto
    doc.setFillColor(...azul);
    doc.rect(W-90,y-2,76,12,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.setTextColor(...blanco);
    doc.text('TOTAL',W-87,y+6);
    doc.text(fmtP(subtotalBruto),W-16,y+6,{align:'right'});
    y+=18;

    // Notas finales
    doc.setFont('helvetica','italic');
    doc.setFontSize(9);
    doc.setTextColor(...gris);
    const notas = [
      '• Este presupuesto tiene una validez de 15 días desde su emisión ('+validezStr+').',
      '• Consultá por descuentos adicionales según el método de pago elegido.',
      '• Los precios pueden estar sujetos a modificación sin previo aviso una vez vencido el plazo.',
    ];
    for(const n of notas){
      if(y>H-25)break;
      doc.text(n,14,y);
      y+=5;
    }

    // Footer
    doc.setFillColor(...azul);
    doc.rect(0,H-12,W,12,'F');
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...blanco);
    doc.text('PENSOK — Presupuesto generado el '+fechaStr+' '+horaStr+'hs',14,H-5);
    doc.text(clienteNombre,W-14,H-5,{align:'right'});

    const fname = 'Presupuesto Pensok - '+clienteNombre+' - '+fechaStr.replace(/\//g,'-')+'.pdf';
    doc.save(fname);
}

function ModuloVenta({clientes,productos,onRegistrar,onCrearPresupuesto,vendedores,esAdmin=true,toast}){
  const METODOS_VENTA = ["Efectivo","Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const DESC_POR_METODO = {
    "Efectivo":10,
    "Transferencia MP":5,"Transferencia Banco":5,
    "Debito MP":0,"Debito Banco":0,
    "Credito MP":0,"Credito Banco":0,"Credito Cuotas Banco":0,
  };

  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  const [vendedor,  setVendedor]  = useState(nombresVend[0]||"");
  const [metodo,    setMetodo]    = useState("Debito MP");
  const [modalidad, setModalidad] = useState(MODALIDADES[0]);
  const [descuento, setDescuento] = useState("0");
  const [items,     setItems]     = useState([]);
  const [busqueda,  setBusqueda]  = useState("");
  const [cobrado,   setCobrado]   = useState(true);
  const [entregado, setEntregado] = useState(true);
  const [loading,   setLoading]   = useState(false);
  const [genPres,   setGenPres]   = useState(false);
  const [ok,        setOk]        = useState(false);

  // Metodo de pago cambia el descuento automaticamente
  function cambiarMetodo(nuevoMetodo){
    setMetodo(nuevoMetodo);
    if(modalidad==="Telefonica / Delivery"){
      setDescuento("0");
    } else if(tipoCliente==="mayorista"||tipoCliente==="costo"){
      setDescuento("0");
    } else {
      setDescuento(String(DESC_POR_METODO[nuevoMetodo]??0));
    }
  }

  function cambiarModalidad(nuevaModalidad){
    setModalidad(nuevaModalidad);
    if(nuevaModalidad==="Telefonica / Delivery"){
      setDescuento("0");
    } else if(tipoCliente==="mayorista"||tipoCliente==="costo"){
      setDescuento("0");
    } else {
      setDescuento(String(DESC_POR_METODO[metodo]??0));
    }
  }

  // Cliente siempre Consumidor Final por default (no hay clienteId)
  const [clienteId, setClienteId] = useState("");
  const cliente     = clientes.find(c=>String(c.id)===String(clienteId));
  const tipoCliente = cliente?.tipo||"minorista";

  // Cuando cambia el cliente, recalcular descuento
  function cambiarCliente(nuevoId){
    setClienteId(nuevoId);
    const cli = clientes.find(c=>String(c.id)===String(nuevoId));
    const tipo = cli?.tipo||"minorista";
    if(tipo==="mayorista"||tipo==="costo"||modalidad==="Telefonica / Delivery"){
      setDescuento("0");
    } else {
      setDescuento(String(DESC_POR_METODO[metodo]??0));
    }
  }

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


  async function generarPresupuesto(){
    if(items.length===0)return;
    setGenPres(true);
    const nroPresupuesto = await onCrearPresupuesto({
      clienteId:clienteId||null, clienteNombre:cliente?.nombre||"CONSUMIDOR FINAL",
      vendedor, tipoLista:tipoCliente, modalidad, descuento:parseFloat(descuento)||0, items
    });
    if(!nroPresupuesto) toast.err("El presupuesto se generó pero no se pudo guardar en el sistema");
    await generarPDFPresupuesto({nroPresupuesto, version:1, clienteNombre:cliente?.nombre||"CONSUMIDOR FINAL", vendedor, tipoCliente, items});
    setGenPres(false);
  }

  const [modalPago, setModalPago] = useState(false); // abre el modal de pago
  const [tipoPago,  setTipoPago]  = useState("total"); // "total" | "parcial"
  const [montoPago, setMontoPago] = useState("");      // lo que entrega el cliente

  const esEfectivo = metodo === "Efectivo";
  const vuelto = tipoPago==="total" && esEfectivo && parseFloat(montoPago)>=total
    ? parseFloat(montoPago) - total
    : 0;
  const pagoValido = tipoPago==="total"
    ? (esEfectivo ? parseFloat(montoPago) >= total : true)
    : parseFloat(montoPago) > 0 && parseFloat(montoPago) < total;

  function abrirModalPago(){
    if(!items.length) return;
    if(!cobrado){
      // Sin cobrar: registrar directo sin modal
      cerrarVentaFinal(false, 0, 0);
      return;
    }
    setTipoPago("total");
    setMontoPago("");
    setModalPago(true);
  }

  async function confirmarPago(){
    const monto = parseFloat(montoPago)||0;
    if(tipoPago==="total"){
      await cerrarVentaFinal(true, total, 0);
    } else {
      await cerrarVentaFinal(true, monto, total - monto);
    }
    setModalPago(false);
  }

  async function cerrarVentaFinal(esCobrado, montoCobrado, saldoPendiente){
    if(!items.length)return;
    setLoading(true);
    const ahora=new Date();
    await onRegistrar({
      fecha:ahora.toISOString().split("T")[0],
      hora:ahora.toTimeString().slice(0,5),
      clienteId:cliente?.id||null,
      clienteNombre:cliente?.nombre||"Consumidor Final",
      vendedor,metodoPago:metodo,modalidad,
      descuento:parseFloat(descuento)||0,
      cobrado: esCobrado,
      entregado,
      monto_cobrado: montoCobrado || undefined,
      saldo_cobro: saldoPendiente || undefined,
    },items);
    setLoading(false);setOk(true);
    setTimeout(()=>{setItems([]);setDescuento("0");setMetodo("Debito MP");setModalidad(MODALIDADES[0]);setClienteId("");setOk(false);},2000);
  }

  async function cerrarVenta(){
    abrirModalPago();
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:360,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>Venta registrada</div><div style={{color:G.textoSec}}>Guardada en la base de datos</div></div>);

  return(
    <>
    {/* Modal de pago */}
    {modalPago&&(
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
        <div style={{background:G.sup,borderRadius:16,padding:24,width:"100%",maxWidth:380,display:"flex",flexDirection:"column",gap:18,boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,marginBottom:4}}>Registrar pago</div>
            <div style={{fontSize:13,color:G.textoSec}}>Total de la venta: <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:G.verde}}>{fmt(total)}</span></div>
          </div>

          {/* Selector total / parcial */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {["total","parcial"].map(t=>(
              <button key={t} onClick={()=>{setTipoPago(t);setMontoPago("");}} style={{
                padding:"12px 0",borderRadius:10,border:`2px solid ${tipoPago===t?G.verde:G.borde}`,
                background:tipoPago===t?`${G.verde}18`:"transparent",
                color:tipoPago===t?G.verde:G.textoSec,
                fontWeight:600,fontSize:14,cursor:"pointer",transition:"all .15s",fontFamily:"inherit"
              }}>
                {t==="total"?"💵 Pago total":"💳 Pago parcial"}
              </button>
            ))}
          </div>

          {/* Campo de monto — solo efectivo necesita saber con cuánto paga */}
          {(tipoPago==="parcial"||(tipoPago==="total"&&metodo==="Efectivo"))&&(
          <div>
            <label style={{display:"block",fontSize:12,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
              {tipoPago==="total"?"¿Con cuánto paga?":"¿Cuánto paga ahora?"}
            </label>
            <input
              autoFocus
              type="number"
              inputMode="numeric"
              value={montoPago}
              onChange={e=>setMontoPago(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&pagoValido&&confirmarPago()}
              placeholder={tipoPago==="total"?fmt(total):"Monto parcial"}
              style={{
                width:"100%",padding:"13px 14px",borderRadius:10,border:`2px solid ${G.borde}`,
                background:G.sup2,color:G.texto,fontSize:16,fontFamily:"DM Mono,monospace",
                outline:"none",transition:"border-color .15s",
              }}
              onFocus={e=>e.target.style.borderColor=G.verde}
              onBlur={e=>e.target.style.borderColor=G.borde}
            />
          </div>
          )}

          {/* Vuelto (solo pago total) */}
          {tipoPago==="total"&&parseFloat(montoPago)>0&&(
            <div style={{
              background: vuelto>0?`${G.verde}15`:`${G.rojo}15`,
              border:`1px solid ${vuelto>0?G.verde:G.rojo}44`,
              borderRadius:10,padding:"12px 16px",
              display:"flex",justifyContent:"space-between",alignItems:"center"
            }}>
              <span style={{fontSize:13,color:G.textoSec}}>{vuelto>0?"Vuelto":"Falta"}</span>
              <span style={{fontSize:20,fontWeight:700,fontFamily:"DM Mono,monospace",color:vuelto>0?G.verde:G.rojo}}>
                {vuelto>0?fmt(vuelto):fmt(total-parseFloat(montoPago))}
              </span>
            </div>
          )}

          {/* Saldo pendiente (pago parcial) */}
          {tipoPago==="parcial"&&parseFloat(montoPago)>0&&parseFloat(montoPago)<total&&(
            <div style={{background:`${G.amarillo}15`,border:`1px solid ${G.amarillo}44`,borderRadius:10,padding:"12px 16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{fontSize:13,color:G.textoSec}}>Paga ahora</span>
                <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde}}>{fmt(parseFloat(montoPago))}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:13,color:G.textoSec}}>Queda pendiente</span>
                <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:G.amarillo}}>{fmt(total-parseFloat(montoPago))}</span>
              </div>
            </div>
          )}

          {/* Botones */}
          <div style={{display:"flex",gap:10,marginTop:4}}>
            <Btn variant="secondary" onClick={()=>setModalPago(false)} style={{flex:1}}>Cancelar</Btn>
            <Btn onClick={confirmarPago} disabled={!pagoValido||loading} style={{flex:2}}>
              {loading?<span style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}><Spinner/>Guardando...</span>
                :tipoPago==="total"?"✓ Registrar venta":"✓ Registrar pago parcial"}
            </Btn>
          </div>
        </div>
      </div>
    )}
    <div className="psk-venta-layout" style={{display:"grid",gridTemplateColumns:"1fr 310px",gap:18,alignItems:"start"}}>
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Card>
          <ST>Datos de la venta</ST>
          <div className="psk-venta-form" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Fi label="Cliente" value={clienteId} onChange={v=>{
              cambiarCliente(v);
              // Actualizar precios de items al cambiar cliente
              const cli=clientes.find(c=>String(c.id)===String(v));
              const tipo=cli?.tipo||"minorista";
              setItems(prev=>prev.map(i=>{
                const prod=productos.find(p=>p.id===i.productoId);
                if(!prod)return i;
                return {...i,precio:precioARS(getPrecio(prod,tipo),prod.moneda)};
              }));
            }} options={[{value:"",label:"Consumidor Final (minorista)"},...clientes.map(c=>({value:String(c.id),label:`${c.nombre} (${c.tipo})`}))]}/>
            <Fi label="Vendedor"       value={vendedor}  onChange={setVendedor}  options={(vendedores||[]).map(v=>v.nombre)}/>
            <Fi label="Metodo de pago" value={metodo}    onChange={cambiarMetodo} options={METODOS_VENTA}/>
            <Fi label="Modalidad"      value={modalidad} onChange={cambiarModalidad} options={MODALIDADES}/>
          </div>
          <div style={{display:"flex",gap:20,marginTop:12}}>
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:G.textoSec}}><input type="checkbox" checked={cobrado} onChange={e=>{setCobrado(e.target.checked);if(!e.target.checked)setDescuento("0");}}/> Cobrado</label>
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
            <table className="psk-venta-tabla" style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginTop:14}}>
              <thead><tr style={{borderBottom:`1px solid ${G.borde}`}}>{["Producto","Cant.","Precio","Subtotal",""].map(h=><th key={h} style={{padding:"6px 8px",textAlign:h==="Subtotal"||h==="Precio"?"right":"left",color:G.textoSec,fontWeight:500,fontSize:11}}>{h}</th>)}</tr></thead>
              <tbody>
                {items.map(item=>{
                  const prod = productos.find(p=>p.id===item.productoId);
                  const sinStock = prod && prod.stock<=0;
                  return(
                  <tr key={item.productoId} style={{borderBottom:`1px solid ${G.borde}22`,background:sinStock?`${G.rojo}14`:undefined}}>
                    <td style={{padding:"8px 8px"}}>
                      {item.nombre}
                      {prod?.marca&&<div style={{fontSize:11,color:G.textoSec,marginTop:1}}>{prod.marca}</div>}
                      {sinStock&&<div style={{fontSize:10,color:G.rojo,fontWeight:600,marginTop:2}}>⚠ SIN STOCK — avisar al cliente</div>}
                    </td>
                    <td style={{padding:"8px 8px"}}><input type="number" value={item.cantidad} onChange={e=>{const n=parseInt(e.target.value)||1;setItems(p=>p.map(i=>i.productoId===item.productoId?{...i,cantidad:Math.max(1,n)}:i));}} min="1" style={{width:52,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"4px 8px",color:G.texto,fontSize:13,textAlign:"center"}}/></td>
                    <td style={{padding:"8px 8px",textAlign:"right"}}><input type="number" value={item.precio} onChange={e=>setItems(p=>p.map(i=>i.productoId===item.productoId?{...i,precio:parseFloat(e.target.value)||0}:i))} style={{width:88,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"4px 8px",color:G.texto,fontSize:13,textAlign:"right"}}/></td>
                    <td style={{padding:"8px 8px",textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{fmt(item.precio*item.cantidad)}</td>
                    <td style={{padding:"8px 8px"}}><Btn small variant="danger" onClick={()=>setItems(p=>p.filter(i=>i.productoId!==item.productoId))}>✕</Btn></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card className="psk-venta-resumen" style={{position:"sticky",top:60}}>
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
        <Btn full className="psk-btn-full" disabled={items.length===0||loading} onClick={cerrarVenta} style={{marginTop:16,padding:"11px 0",fontSize:14}}>
          {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"Cerrar venta →"}
        </Btn>
        <Btn full variant="secondary" disabled={items.length===0||genPres} onClick={generarPresupuesto} style={{marginTop:8,padding:"10px 0",fontSize:13}}>
          {genPres?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Generando...</span>:"📄 Extraer Presupuesto"}
        </Btn>
      </Card>
    </div>
    </>
  );
}

// ============================================================
// MODULO: PRESUPUESTOS
// ============================================================
const METODOS_VENTA_APROBAR = ["Efectivo","Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];

function venceElPresupuesto(fecha){
  const d = new Date(fecha+"T00:00:00");
  d.setDate(d.getDate()+15);
  return d.toISOString().slice(0,10);
}
function presupuestoVencido(p){
  return p.estado==="pendiente" && venceElPresupuesto(p.fecha) < hoy();
}

function ModuloPresupuestos({presupuestos=[],productos=[],onAprobar,onCancelar,onEditarItems,vendedores=[],vendedoresOtro=[],usuarioEmail="",esAdmin=true}){
  const miNombre = useMemo(()=>{
    const email=(usuarioEmail||"").trim().toLowerCase();
    if(!email) return "";
    const todos=[...(vendedores||[]),...(vendedoresOtro||[])];
    const match=todos.find(v=>(v.email||"").trim().toLowerCase()===email);
    return match?.nombre || "";
  },[vendedores,vendedoresOtro,usuarioEmail]);
  const responsableActual = miNombre || usuarioEmail || "—";

  const [filtro,setFiltro]     = useState("activos"); // activos|pendiente|vencido|aprobado|cancelado
  const [verPres,setVerPres]   = useState(null);
  const [accion,setAccion]     = useState(null); // null|"aprobar"|"cancelar"|"editar"
  const [metodoPago,setMetodoPago] = useState(METODOS_VENTA_APROBAR[0]);
  const [cobrado,setCobrado]   = useState(true);
  const [entregado,setEntregado] = useState(true);
  const [motivo,setMotivo]     = useState("");
  const [procesando,setProcesando] = useState(false);
  const [editItems,setEditItems]   = useState([]); // {productoId,nombre,cantidad,precio,costo}
  const [busquedaProd,setBusquedaProd] = useState("");
  const [descargando,setDescargando]   = useState(false);

  const conteos = useMemo(()=>({
    pendiente: presupuestos.filter(p=>p.estado==="pendiente"&&!presupuestoVencido(p)).length,
    vencido:   presupuestos.filter(p=>presupuestoVencido(p)).length,
    aprobado:  presupuestos.filter(p=>p.estado==="aprobado").length,
    cancelado: presupuestos.filter(p=>p.estado==="cancelado").length,
  }),[presupuestos]);

  const filtrados = useMemo(()=>{
    const lista = presupuestos.filter(p=>{
      if(filtro==="activos") return p.estado==="pendiente";
      if(filtro==="vencido") return presupuestoVencido(p);
      if(filtro==="pendiente") return p.estado==="pendiente"&&!presupuestoVencido(p);
      return p.estado===filtro;
    });
    return [...lista].sort((a,b)=>new Date(b.creado_en)-new Date(a.creado_en));
  },[presupuestos,filtro]);

  function abrir(p){ setVerPres(p); setAccion(null); setMetodoPago(METODOS_VENTA_APROBAR[0]); setCobrado(true); setEntregado(true); setMotivo(""); setBusquedaProd(""); }
  function cerrar(){ setVerPres(null); setAccion(null); }

  async function confirmarAprobar(){
    setProcesando(true);
    await onAprobar(verPres.id,{metodoPago,cobrado,entregado},responsableActual);
    setProcesando(false);
    cerrar();
  }
  async function confirmarCancelar(){
    setProcesando(true);
    await onCancelar(verPres.id,motivo,responsableActual);
    setProcesando(false);
    cerrar();
  }

  function abrirEditarItems(){
    setEditItems((verPres.presupuesto_items||[]).map(it=>({
      productoId:it.producto_id, nombre:it.nombre, cantidad:it.cantidad, precio:it.precio, costo:it.costo||0
    })));
    setBusquedaProd("");
    setAccion("editar");
  }
  function agregarItemEdit(prod){
    setEditItems(prev=>{
      const ex=prev.find(i=>i.productoId===prod.id);
      if(ex) return prev.map(i=>i.productoId===prod.id?{...i,cantidad:i.cantidad+1}:i);
      return [...prev,{productoId:prod.id,nombre:prod.nombre,cantidad:1,precio:prod.precio_min||0,costo:prod.costo||0}];
    });
    setBusquedaProd("");
  }
  async function confirmarEditar(){
    setProcesando(true);
    await onEditarItems(verPres.id,editItems,responsableActual);
    setProcesando(false);
    cerrar();
  }
  async function descargarPDFActualizado(p){
    setDescargando(true);
    const items=(p.presupuesto_items||[]).map(it=>({nombre:it.nombre,cantidad:it.cantidad,precio:it.precio}));
    await generarPDFPresupuesto({
      nroPresupuesto:p.nro_presupuesto, version:p.version||1, clienteNombre:p.cliente_nombre,
      vendedor:p.vendedor, tipoCliente:p.tipo_lista, items
    });
    setDescargando(false);
  }

  const FILTROS = [
    {k:"activos",   l:"Pendientes"},
    {k:"vencido",   l:"Vencidos"},
    {k:"aprobado",  l:"Aprobados"},
    {k:"cancelado", l:"Cancelados"},
    {k:"todos",     l:"Todos"},
  ];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="psk-grid-4" style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Pendientes" value={fmtNum(conteos.pendiente)} color={G.azul}/>
        <MetricCard label="Vencidos" value={fmtNum(conteos.vencido)} color={conteos.vencido>0?G.amarillo:undefined}/>
        <MetricCard label="Aprobados" value={fmtNum(conteos.aprobado)} color={G.verde}/>
        <MetricCard label="Cancelados" value={fmtNum(conteos.cancelado)} color={G.rojo}/>
      </div>

      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {FILTROS.map(f=>(
          <Btn key={f.k} small variant={filtro===f.k?"primary":"secondary"} onClick={()=>setFiltro(f.k)}>{f.l}</Btn>
        ))}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(p=>{
          const vencido = presupuestoVencido(p);
          const items = p.presupuesto_items||[];
          return(
            <Card key={p.id} style={{padding:"12px 18px",cursor:"pointer"}} onClick={()=>abrir(p)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{p.nro_presupuesto}{p.version>1?` · v${p.version}`:""} — {p.cliente_nombre||"Consumidor Final"}</div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{p.fecha} · {p.vendedor} · {items.length} items · {fmt(p.total)}</div>
                </div>
                {p.estado==="cancelado"&&<Badge color="rojo">Cancelado</Badge>}
                {p.estado==="aprobado"&&<Badge color="verde">Aprobado</Badge>}
                {p.estado==="pendiente"&&vencido&&<Badge color="amarillo">Vencido</Badge>}
                {p.estado==="pendiente"&&!vencido&&<Badge color="azul">Pendiente</Badge>}
              </div>
            </Card>
          );
        })}
        {filtrados.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin presupuestos en esta categoría</div>}
      </div>

      {verPres&&(()=>{
        const vencido = presupuestoVencido(verPres);
        const items = verPres.presupuesto_items||[];
        return(
          <Modal title={`${verPres.nro_presupuesto}${verPres.version>1?` · v${verPres.version}`:""} — ${verPres.fecha}`} onClose={cerrar} maxWidth={620}
            footer={accion?(<>
              <Btn variant="secondary" onClick={()=>setAccion(null)} disabled={procesando}>Volver</Btn>
              {accion==="aprobar"&&<Btn variant="primary" disabled={procesando} onClick={confirmarAprobar}>{procesando?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Aprobando...</span>:"Confirmar y crear venta"}</Btn>}
              {accion==="cancelar"&&<Btn variant="danger" disabled={procesando||!motivo.trim()} onClick={confirmarCancelar}>{procesando?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Cancelando...</span>:"Confirmar cancelación"}</Btn>}
              {accion==="editar"&&<Btn variant="primary" disabled={procesando||editItems.length===0} onClick={confirmarEditar}>{procesando?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando...</span>:"Guardar cambios"}</Btn>}
            </>):(<>
              <Btn variant="secondary" onClick={cerrar}>Cerrar</Btn>
              <Btn variant="secondary" disabled={descargando} onClick={()=>descargarPDFActualizado(verPres)}>{descargando?"Generando...":"🖨 Descargar PDF"}</Btn>
              {verPres.estado==="pendiente"&&<Btn variant="danger" onClick={()=>setAccion("cancelar")}>Cancelar presupuesto</Btn>}
              {verPres.estado==="pendiente"&&<Btn variant="secondary" onClick={abrirEditarItems}>✏️ Editar ítems</Btn>}
              {verPres.estado==="pendiente"&&!vencido&&<Btn variant="primary" onClick={()=>setAccion("aprobar")}>Aprobar → crear venta</Btn>}
            </>)}>
            <div style={{fontSize:12,color:G.textoSec,marginBottom:10}}>
              Cliente <strong style={{color:G.texto}}>{verPres.cliente_nombre||"Consumidor Final"}</strong> · Vendedor <strong style={{color:G.texto}}>{verPres.vendedor}</strong> · Lista <strong style={{color:G.texto}}>{verPres.tipo_lista}</strong>
            </div>
            {verPres.estado==="pendiente"&&vencido&&(
              <div style={{marginBottom:10,padding:"8px 12px",background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:8,fontSize:12,color:G.amarillo}}>
                Este presupuesto venció el {venceElPresupuesto(verPres.fecha)} (validez de 15 días). Los precios pueden estar desactualizados — para aprobarlo, generar uno nuevo desde Nueva Venta. Todavía se puede cancelar.
              </div>
            )}
            {verPres.estado==="aprobado"&&(
              <div style={{marginBottom:10,padding:"8px 12px",background:"#00C48C11",border:"1px solid #00C48C33",borderRadius:8,fontSize:12,color:G.verde}}>
                Aprobado por {verPres.aprobado_por} el {verPres.aprobado_en?new Date(verPres.aprobado_en).toLocaleString("es-AR"):""} — ya figura como venta en Ingresos.
              </div>
            )}
            {verPres.estado==="cancelado"&&(
              <div style={{marginBottom:10,padding:"8px 12px",background:"#FF4D6A11",border:"1px solid #FF4D6A33",borderRadius:8,fontSize:12,color:G.rojo}}>
                Cancelado por {verPres.cancelado_por} el {verPres.cancelado_en?new Date(verPres.cancelado_en).toLocaleString("es-AR"):""}{verPres.motivo_cancelacion?<> — Motivo: {verPres.motivo_cancelacion}</>:""}
              </div>
            )}

            {!accion&&(
              <div style={{display:"flex",flexDirection:"column",gap:1,maxHeight:340,overflowY:"auto"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 90px",gap:8,padding:"6px 8px",fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>
                  <span>Producto</span><span style={{textAlign:"right"}}>Cant.</span><span style={{textAlign:"right"}}>Precio</span><span style={{textAlign:"right"}}>Subtotal</span>
                </div>
                {items.map(it=>(
                  <div key={it.id} style={{display:"grid",gridTemplateColumns:"1fr 60px 90px 90px",gap:8,padding:"6px 8px",fontSize:13,borderTop:`1px solid ${G.borde}22`}}>
                    <span>{it.nombre}</span>
                    <span style={{textAlign:"right"}}>{fmtNum(it.cantidad)}</span>
                    <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace"}}>{fmt(it.precio)}</span>
                    <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{fmt(it.precio*it.cantidad)}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",padding:"10px 8px",borderTop:`1px solid ${G.borde}`,marginTop:4,fontSize:14,fontWeight:600}}>
                  <span>Total {verPres.descuento>0?`(desc. ${verPres.descuento}%)`:""}</span><span>{fmt(verPres.total)}</span>
                </div>
              </div>
            )}

            {accion==="aprobar"&&(
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <div style={{fontSize:12,color:G.textoSec}}>Esto va a crear una venta en Ingresos por {fmt(verPres.total)} y descontar el stock correspondiente. Faltan estos datos que el presupuesto todavía no tiene:</div>
                <Fi label="Método de pago" value={metodoPago} onChange={setMetodoPago} options={METODOS_VENTA_APROBAR.map(m=>({value:m,label:m}))}/>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={cobrado} onChange={e=>setCobrado(e.target.checked)}/> Ya está cobrado</label>
                <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,cursor:"pointer"}}><input type="checkbox" checked={entregado} onChange={e=>setEntregado(e.target.checked)}/> Ya está entregado</label>
              </div>
            )}

            {accion==="cancelar"&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:12,color:G.textoSec}}>Motivo de la cancelación (obligatorio):</div>
                <textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={3} placeholder="Ej: el cliente no lo confirmó, precios vencidos, etc."
                  style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 10px",color:G.texto,fontSize:13,outline:"none",resize:"vertical"}}/>
              </div>
            )}

            {accion==="editar"&&(()=>{
              const hits = busquedaProd.length>1 ? productos.filter(pr=>pr.activo&&pr.nombre.toLowerCase().includes(busquedaProd.toLowerCase())).slice(0,8) : [];
              return(
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{fontSize:12,color:G.textoSec}}>Agregá, sacá o cambiá cantidades. Al guardar queda como una nueva versión de este mismo presupuesto (v{(verPres.version||1)+1}), con la fecha actualizada.</div>
                  <div style={{position:"relative"}}>
                    <input value={busquedaProd} onChange={e=>setBusquedaProd(e.target.value)} placeholder="+ Buscar producto para agregar..."
                      style={{background:G.sup2,border:`1px solid ${G.verde}55`,borderRadius:8,padding:"8px 12px",color:G.texto,fontSize:13,outline:"none",width:"100%"}}/>
                    {hits.length>0&&(
                      <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,marginTop:4,zIndex:10,maxHeight:200,overflowY:"auto"}}>
                        {hits.map(pr=>(
                          <div key={pr.id} onClick={()=>agregarItemEdit(pr)} style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${G.borde}22`,display:"flex",justifyContent:"space-between",fontSize:12}}>
                            <span>{pr.nombre}</span><span style={{color:G.textoSec}}>Stock: {pr.stock}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto"}}>
                    {editItems.map(it=>(
                      <div key={it.productoId} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:G.sup2,borderRadius:8}}>
                        <div style={{flex:1,minWidth:0,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nombre}</div>
                        <input type="number" value={it.cantidad} min="1" onChange={e=>{const n=parseInt(e.target.value)||1;setEditItems(prev=>prev.map(i=>i.productoId===it.productoId?{...i,cantidad:Math.max(1,n)}:i));}}
                          style={{width:52,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"5px 6px",color:G.texto,fontSize:12,textAlign:"center"}}/>
                        <input type="number" value={it.precio} onChange={e=>setEditItems(prev=>prev.map(i=>i.productoId===it.productoId?{...i,precio:parseFloat(e.target.value)||0}:i))}
                          style={{width:88,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"5px 6px",color:G.texto,fontSize:12,textAlign:"right"}}/>
                        <Btn small variant="danger" onClick={()=>setEditItems(prev=>prev.filter(i=>i.productoId!==it.productoId))}>✕</Btn>
                      </div>
                    ))}
                    {editItems.length===0&&<div style={{textAlign:"center",padding:"16px 0",color:G.textoSec,fontSize:12}}>Sin productos — agregá al menos uno</div>}
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",padding:"10px 8px",borderTop:`1px solid ${G.borde}`,fontSize:14,fontWeight:600}}>
                    <span>Nuevo total</span><span>{fmt(calcTotalItems(editItems,verPres.descuento||0))}</span>
                  </div>
                </div>
              );
            })()}
          </Modal>
        );
      })()}
    </div>
  );
}

// ============================================================
// MODULO: INGRESOS
// ============================================================
function ModuloIngresos({ventas,vendedores,productos,clientes,onEditar,onEliminar,onEditarPago,onEliminarPago,totalVentas,filtroInicial="",filtrosPersistentes,onFiltrosChange,devoluciones=[],onDevolver,esAdmin=true}){
  const [tab,          setTab]          = useState("ventas");
  // ── Devoluciones / notas de crédito ──
  const [modalDevolver,setModalDevolver]=useState(null); // venta a devolver
  const [devTipo,      setDevTipo]      = useState("dinero"); // 'dinero' | 'saldo'
  const [devMetodo,    setDevMetodo]    = useState("Efectivo");
  const [devMotivo,    setDevMotivo]    = useState("");
  const [devLineas,    setDevLineas]    = useState([]); // {nombre,precio,costo,max,cantidad,reingresa,productoId}
  const [devLoading,   setDevLoading]   = useState(false);
  function abrirDevolver(v){
    const met = v.metodo_pago==="Efectivo"?"Efectivo":(v.metodo_pago||"").includes("MP")?"Transferencia MP":(v.metodo_pago||"").includes("Banco")?"Transferencia Banco":"Efectivo";
    setModalDevolver(v); setDevTipo("dinero"); setDevMetodo(met); setDevMotivo("");
    setDevLineas((v.items||[]).map(it=>{
      const prod=(productos||[]).find(p=>p.nombre===it.nombre);
      return {nombre:it.nombre,precio:Number(it.precio)||0,costo:Number(it.costo)||0,max:Number(it.cantidad)||0,cantidad:0,reingresa:true,productoId:prod?prod.id:null};
    }));
  }
  const setDevLinea=(idx,campo,val)=>setDevLineas(ls=>ls.map((l,i)=>i===idx?{...l,[campo]:val}:l));
  const [pagosDeuda,   setPagosDeuda]   = useState([]);
  const [loadingPagos, setLoadingPagos] = useState(false);
  const [editandoPago, setEditandoPago] = useState(null);
  const [editPagoMonto,setEditPagoMonto]= useState("");
  const [editPagoMet,  setEditPagoMet]  = useState("");
  const [editPagoLoad, setEditPagoLoad] = useState(false);
  const [confirmarElimPago,setConfElimPago]=useState(null);

  useEffect(()=>{
    cargarPagos(); // carga inicial para mostrar historial en las cards
  },[]);

  useEffect(()=>{
    if(tab==="pagos") cargarPagos();
  },[tab]);

  async function cargarPagos(){
    setLoadingPagos(true);
    const{data}=await supabase.from("pagos_deuda").select("*").eq("tipo","ingreso").order("created_at",{ascending:false}).limit(5000);
    setPagosDeuda(data||[]);
    setLoadingPagos(false);
  }

  const fp = filtrosPersistentes||{vend:"Todos",met:"Todos",fecha:"",estado:"",cliente:"Todos"};
  const [fVend,       setFVRaw]        = useState(fp.vend);
  const [fMet,        setFMRaw]        = useState(fp.met);
  const [fFecha,      setFFRaw]        = useState(filtroInicial?"":fp.fecha||hoy());
  const [fEstado,     setFEstadoRaw]   = useState(filtroInicial||fp.estado);
  const [fCliente,    setFClienteRaw]  = useState(fp.cliente||"Todos");
  const [fSinComision,setFSinComision] = useState(false);
  const [fProducto,   setFProducto]    = useState("");
  const [busqIng,     setBusqIng]      = useState("");

  // Wrappers que persisten los filtros al App padre
  const setFV      = v=>{setFVRaw(v);      onFiltrosChange&&onFiltrosChange(p=>({...p,vend:v}));};
  const setFM      = v=>{setFMRaw(v);      onFiltrosChange&&onFiltrosChange(p=>({...p,met:v}));};
  const setFF      = v=>{setFFRaw(v);      onFiltrosChange&&onFiltrosChange(p=>({...p,fecha:v}));};
  const setFEstado = v=>{setFEstadoRaw(v); onFiltrosChange&&onFiltrosChange(p=>({...p,estado:v}));};
  const setFCliente= v=>{setFClienteRaw(v);onFiltrosChange&&onFiltrosChange(p=>({...p,cliente:v}));};
  const [confirmarElim,setConfirmarElim]=useState(null);
  const [genTicket,setGenTicket]=useState(false);
  const [modalCobro,setModalCobro]=useState(null); // venta con saldo pendiente
  const [cobroMonto,setCobroMonto]=useState("");
  const [cobroMetodo,setCobroMetodo]=useState("Efectivo");
  const [cobroFecha,setCobroFecha]=useState(hoy());
  const [modalCorregir,setModalCorregir]=useState(null); // corregir cobro cargado mal
  const [corregirMonto,setCorregirMonto]=useState("");
  const [editandoV,   setEditandoV]  = useState(null);
  const [evCliente,   setEvCliente]  = useState("");
  const [evVendedor,  setEvVendedor] = useState("");
  const [evMetodo,    setEvMetodo]   = useState("");
  const [evCobrado,   setEvCobrado]  = useState(true);
  const [evEntregado, setEvEntregado]= useState(true);
  const [evComision,  setEvComision] = useState("0");
  const [evItems,     setEvItems]    = useState([]);
  const [evLoading,   setEvLoading]  = useState(false);
  const [evDescuento, setEvDescuento]= useState("0");
  const [evBusqueda,  setEvBusqueda] = useState("");
  const [quickEditV,  setQuickEditV] = useState(null);
  const [qeCobrado,   setQeCobrado]  = useState(true);
  const [qeEntregado, setQeEntregado]= useState(true);
  const [qeComision,  setQeComision] = useState("0");
  const [qeLoading,   setQeLoading]  = useState(false);
  const METODOS_CON_COMISION = ["Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const redondear100 = n => Math.ceil(n/100)*100;

  function abrirEditarVenta(v){
    setEditandoV(v); setEvCliente(v.cliente_nombre||""); setEvVendedor(v.vendedor||"");
    setEvMetodo(v.metodo_pago||METODOS_PAGO[0]); setEvCobrado(v.cobrado??true);
    setEvEntregado(v.entregado??true); setEvComision(String(v.comision_plataforma||0));
    setEvDescuento(String(v.descuento||0));
    setEvItems((v.items||[]).map(i=>({...i,precio:String(i.precio),cantidad:String(i.cantidad)})));
  }
  function actualizarItem(idx,campo,valor){setEvItems(prev=>prev.map((it,i)=>i===idx?{...it,[campo]:valor}:it));}
  function eliminarItem(idx){setEvItems(prev=>prev.filter((_,i)=>i!==idx));}
  function agregarItemDesdeProducto(prod){
    setEvItems(prev=>[...prev,{nombre:prod.nombre,cantidad:"1",precio:String(prod.precio_min),costo:prod.costo||0,producto_id:prod.id}]);
    setEvBusqueda("");
  }
  async function guardarVenta(){
    if(!editandoV)return; setEvLoading(true);
    const itemsNum=evItems.map(i=>({...i,cantidad:parseFloat(i.cantidad)||0,precio:parseFloat(i.precio)||0}));
    const bruto=itemsNum.reduce((s,i)=>s+i.precio*i.cantidad,0);
    const desc=editandoV.descuento||0;
    const total=redondear100(bruto*(1-desc/100));
    const costos=itemsNum.reduce((s,i)=>s+(i.costo||0)*i.cantidad,0);
    const comision=parseFloat(evComision)||0;
    const ganancia=total-costos-comision;
    await onEditar(editandoV.id,{cliente_nombre:evCliente,vendedor:evVendedor,metodo_pago:evMetodo,cobrado:evCobrado,entregado:evEntregado,comision_plataforma:comision,total,ganancia});
    await supabase.from("venta_items").delete().eq("venta_id",editandoV.id);
    if(itemsNum.length>0) await supabase.from("venta_items").insert(itemsNum.map(i=>({venta_id:editandoV.id,nombre:i.nombre,cantidad:i.cantidad,precio:i.precio,costo:i.costo||0})));
    setEvLoading(false); setEditandoV(null);
  }
  function abrirQuickEdit(v){
    setQuickEditV(v); setQeCobrado(v.cobrado??true); setQeEntregado(v.entregado??true); setQeComision(String(v.comision_plataforma||0));
  }
  async function guardarQuickEdit(){
    if(!quickEditV)return; setQeLoading(true);
    await onEditar(quickEditV.id,{entregado:qeEntregado,comision_plataforma:parseFloat(qeComision)||0});
    setQeLoading(false); setQuickEditV(null);
  }

  async function imprimirTicket(v){
    setGenTicket(v.id);
    if(!window.jspdf){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,H=297;
    const azul=[50,50,50],azulClaro=[90,90,90],gris=[120,120,120],negro=[30,30,30],blanco=[255,255,255],rojo=[70,70,70],verde=[70,70,70];
    const fmtP = n => '$ '+Math.round(n||0).toLocaleString('es-AR');

    // ── HEADER ──
    doc.setFillColor(50,50,50);
    doc.rect(0,0,W,38,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('PENSOK',14,16);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.text(LI.razonSocial,14,23);
    doc.text(LI.direccion,14,28);
    doc.text(`CUIT: ${LI.cuit}  ·  Tel: ${LI.telefono}  ·  ${LI.instagram}`,14,33);
    doc.setFillColor(90,90,90);
    doc.roundedRect(W-72,8,66,14,2,2,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255,255,255);
    doc.text('COMPROBANTE INTERNO',W-39,14,{align:'center'});
    doc.text('NO VALIDO COMO FACTURA',W-39,20,{align:'center'});

    // ── DATOS OPERACION ──
    let y=52;
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...azul);
    doc.text('DATOS DE LA OPERACION',14,y);
    y+=5;
    doc.setDrawColor(...azulClaro);
    doc.setLineWidth(0.3);
    doc.line(14,y,W-14,y);
    y+=6;
    const infoLeft=[['N Comprobante:',v.nro_factura||''],['Fecha:',v.fecha||''],['Hora:',v.hora||'']];
    const infoRight=[['Vendedor:',v.vendedor||''],['Cliente:',v.cliente_nombre||'CONSUMIDOR FINAL'],['Metodo pago:',v.metodo_pago||'']];
    doc.setFontSize(9);
    infoLeft.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],14,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],58,y+i*6);
    });
    infoRight.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],W/2,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],W/2+32,y+i*6);
    });
    y+=22;

    // ── TABLA PRODUCTOS ──
    doc.setFillColor(...azulClaro);
    doc.rect(14,y,W-28,8,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...blanco);
    doc.text('PRODUCTO',16,y+5.5);
    doc.text('CANT.',125,y+5.5,{align:'center'});
    doc.text('P.UNIT.',152,y+5.5,{align:'center'});
    doc.text('SUBTOTAL',W-16,y+5.5,{align:'right'});
    y+=12;
    let subtotal=0;
    const grisClar=[240,242,245];
    let filaPar=false;
    (v.items||[]).forEach(it=>{
      if(y>H-60){doc.addPage();y=20;}
      if(filaPar){doc.setFillColor(...grisClar);doc.rect(14,y-6,W-28,8,'F');}
      filaPar=!filaPar;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...negro);
      const nombre=it.nombre.length>50?it.nombre.substring(0,47)+'...':it.nombre;
      doc.text(nombre,16,y);
      doc.setTextColor(...gris);
      doc.text(String(it.cantidad||1),125,y,{align:'center'});
      doc.text(fmtP(it.precio),152,y,{align:'center'});
      const sub=(it.precio||0)*(it.cantidad||1); subtotal+=sub;
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro);
      doc.text(fmtP(sub),W-16,y,{align:'right'});
      y+=8;
    });
    y+=4;
    doc.setDrawColor(220,220,220); doc.setLineWidth(0.3); doc.line(W-80,y,W-14,y); y+=6;

    // ── TOTALES ──
    const desc=v.descuento||0;
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text('Subtotal',W-80,y);
    doc.setFont('helvetica','bold'); doc.setTextColor(...negro);
    doc.text(fmtP(subtotal),W-16,y,{align:'right'}); y+=7;
    if(desc>0){
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris);
      doc.text('Descuento '+desc+'% ('+v.metodo_pago+')',W-80,y);
      doc.setFont('helvetica','bold'); doc.setTextColor(...verde);
      doc.text('-'+fmtP(subtotal*desc/100),W-16,y,{align:'right'}); y+=7;
    }
    doc.setFillColor(...azul); doc.rect(W-80,y-2,66,12,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...blanco);
    doc.text('TOTAL',W-77,y+6);
    doc.text(fmtP(v.total),W-16,y+6,{align:'right'}); y+=18;

    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...gris);
    doc.text('Estado: '+(v.cobrado?'Cobrado':'Pendiente de cobro')+'  ·  '+(v.entregado?'Entregado':'Pendiente de entrega'),14,y); y+=14;

    // ── CONTACTO (sin QR) ──
    doc.setFillColor(240,245,255); doc.rect(14,y,W-28,22,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...azul);
    doc.text('Contactanos',16,y+8);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...negro);
    doc.text(`WhatsApp: ${LI.telefono}`,16,y+15);
    doc.text('Instagram: @pensok.piletas',W/2,y+15);
    y+=28;

    // ── FOOTER ──
    doc.setFillColor(...azul); doc.rect(0,H-14,W,14,'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...blanco);
    doc.text(`${LI.razonSocial}  -  CUIT ${LI.cuit}  -  ${LI.direccionCorta}`,14,H-8);
    doc.text(v.nro_factura||'',W-14,H-8,{align:'right'});
    doc.setFontSize(7); doc.setTextColor(180,200,255);
    doc.text('Comprobante interno. No valido como factura.',W/2,H-3,{align:'center'});

    const fname='Ticket Pensok - '+(v.nro_factura||v.id)+' - '+(v.cliente_nombre||'CONSUMIDOR FINAL')+'.pdf';
    doc.save(fname);
    setGenTicket(false);
  }

  const METODOS_CON_COMISION_ING=["Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const r100=n=>Math.ceil(n/100)*100;

  const [genRemito,setGenRemito]=useState(false);
  async function imprimirRemito(v){
    setGenRemito(v.id);
    if(!window.jspdf){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,H=297;
    const oscuro=[80,80,80],grisM=[130,130,130],gris=[150,150,150],negro=[50,50,50],blanco=[255,255,255];
    const grisClar=[240,242,245];

    // ── HEADER ──
    doc.setFillColor(...oscuro);
    doc.rect(0,0,W,38,'F');
    doc.setTextColor(255,255,255);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('PENSOK',14,16);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.text(LI.razonSocial,14,23);
    doc.text(LI.direccion,14,28);
    doc.text(`CUIT: ${LI.cuit}  ·  Tel: ${LI.telefono}  ·  ${LI.instagram}`,14,33);
    doc.setFillColor(...grisM);
    doc.roundedRect(W-72,8,66,14,2,2,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(255,255,255);
    doc.text('REMITO DE ENTREGA',W-39,17,{align:'center'});

    // ── DATOS ──
    let y=52;
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...oscuro);
    doc.text('DATOS DE ENTREGA',14,y);
    y+=5;
    doc.setDrawColor(...grisM);
    doc.setLineWidth(0.3);
    doc.line(14,y,W-14,y);
    y+=6;
    const infoLeft=[['N Remito:',v.nro_factura||String(v.id)],['Fecha:',v.fecha||''],['Hora:',v.hora||'']];
    const infoRight=[['Vendedor:',v.vendedor||''],['Cliente:',v.cliente_nombre||'CONSUMIDOR FINAL'],['Modalidad:',v.modalidad||'']];
    doc.setFontSize(9);
    infoLeft.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],14,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],58,y+i*6);
    });
    infoRight.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],W/2,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],W/2+32,y+i*6);
    });
    y+=26;

    // ── TABLA PRODUCTOS (sin precios) ──
    doc.setFillColor(180,180,180);
    doc.rect(14,y,W-28,8,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255,255,255);
    doc.text('PRODUCTO / DESCRIPCIÓN',16,y+5.5);
    doc.text('CANT.',W-65,y+5.5,{align:'center'});
    doc.text('RECIBIDO CONFORME',W-28,y+5.5,{align:'center'});
    y+=12;
    let filaPar=false;
    (v.items||[]).forEach(it=>{
      if(y>H-70){doc.addPage();y=20;}
      if(filaPar){doc.setFillColor(248,248,248);doc.rect(14,y-6,W-28,8,'F');}
      filaPar=!filaPar;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...negro);
      const nombre=it.nombre.length>55?it.nombre.substring(0,52)+'...':it.nombre;
      doc.text(nombre,16,y);
      doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100);
      doc.text(String(it.cantidad||1),W-65,y,{align:'center'});
      // Casilla de firma/confirmación — alineada a la derecha bien separada
      doc.setDrawColor(160,160,160); doc.setLineWidth(0.2);
      doc.rect(W-46,y-5,22,7);
      y+=8;
    });
    y+=10;

    // ── SECCIÓN DE FIRMAS ──
    doc.setDrawColor(...grisM); doc.setLineWidth(0.3);
    doc.line(14,y,80,y);
    doc.line(W-80,y,W-14,y);
    y+=5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...gris);
    doc.text('Entregado por',14,y);
    doc.text('Recibido conforme',W-80,y);
    y+=5;
    doc.text('Firma y aclaración',14,y);
    doc.text('Firma, aclaración y DNI',W-80,y);
    y+=14;

    // ── NOTAS ──
    if(v.notas_pedido_web){
      doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(...gris);
      doc.text('Notas: '+v.notas_pedido_web,14,y); y+=8;
    }

    // ── FOOTER ──
    doc.setFillColor(...oscuro); doc.rect(0,H-14,W,14,'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...blanco);
    doc.text(`${LI.razonSocial}  -  CUIT ${LI.cuit}  -  ${LI.direccionCorta}`,14,H-8);
    doc.text(v.nro_factura||'',W-14,H-8,{align:'right'});
    doc.setFontSize(7); doc.setTextColor(200,200,200);
    doc.text('Remito de entrega interno.',W/2,H-3,{align:'center'});

    const fname='Remito Pensok - '+(v.nro_factura||v.id)+' - '+(v.cliente_nombre||'CONSUMIDOR FINAL')+'.pdf';
    doc.save(fname);
    setGenRemito(false);
  }
  function abrirEditarVenta(v){setEditandoV(v);setEvCliente(v.cliente_nombre||"");setEvVendedor(v.vendedor||"");setEvMetodo(v.metodo_pago||METODOS_PAGO[0]);setEvCobrado(v.cobrado??true);setEvEntregado(v.entregado??true);setEvComision(String(v.comision_plataforma||0));setEvDescuento(String(v.descuento||0));setEvItems((v.items||[]).map(i=>({...i,precio:String(i.precio),cantidad:String(i.cantidad)})));}
  function actualizarItem(idx,campo,valor){setEvItems(prev=>prev.map((it,i)=>i===idx?{...it,[campo]:valor}:it));}
  function eliminarItemEv(idx){setEvItems(prev=>prev.filter((_,i)=>i!==idx));}
  function agregarItemEv(prod){setEvItems(prev=>[...prev,{nombre:prod.nombre,cantidad:"1",precio:String(prod.precio_min),costo:prod.costo||0}]);setEvBusqueda("");}
  async function guardarVenta(){
    if(!editandoV)return;setEvLoading(true);
    const itemsN=evItems.map(i=>({...i,cantidad:parseFloat(i.cantidad)||0,precio:parseFloat(i.precio)||0}));
    const bruto=itemsN.reduce((s,i)=>s+i.precio*i.cantidad,0);
    const desc=parseFloat(evDescuento)||0;
    const total=r100(bruto*(1-desc/100));
    const costos=itemsN.reduce((s,i)=>s+(i.costo||0)*i.cantidad,0);
    const comision=parseFloat(evComision)||0;
    await onEditar(editandoV.id,{cliente_nombre:evCliente,vendedor:evVendedor,metodo_pago:evMetodo,entregado:evEntregado,comision_plataforma:comision,descuento:desc,total,ganancia:total-costos-comision});
    await supabase.from("venta_items").delete().eq("venta_id",editandoV.id);
    if(itemsN.length>0)await supabase.from("venta_items").insert(itemsN.map(i=>({venta_id:editandoV.id,nombre:i.nombre,cantidad:i.cantidad,precio:i.precio,costo:i.costo||0})));

    // ── Ajustar stock: comparar items originales vs nuevos ──
    const itemsOrig = editandoV.items||[];
    // Construir mapa de cantidades originales por nombre de producto
    const cantOrig = {};
    itemsOrig.forEach(i=>{ cantOrig[i.nombre]=(cantOrig[i.nombre]||0)+(i.cantidad||0); });
    // Construir mapa de cantidades nuevas por nombre de producto
    const cantNueva = {};
    itemsN.forEach(i=>{ cantNueva[i.nombre]=(cantNueva[i.nombre]||0)+(i.cantidad||0); });
    // Unión de todos los productos involucrados
    const todosNombres = new Set([...Object.keys(cantOrig),...Object.keys(cantNueva)]);
    for(const nombre of todosNombres){
      const orig = cantOrig[nombre]||0;
      const nueva = cantNueva[nombre]||0;
      const diff = nueva - orig; // positivo = vendés más, negativo = vendés menos (stock vuelve)
      if(diff===0) continue;
      const prod = productos.find(p=>p.nombre===nombre);
      if(!prod) continue;
      const nuevoStock = Math.max(0,(prod.stock||0)-diff);
      await supabase.from("productos").update({stock:nuevoStock}).eq("id",prod.id);
    }

    setEvLoading(false);setEditandoV(null);
  }
  function abrirQuickEdit(v){setQuickEditV(v);setQeCobrado(v.cobrado??true);setQeEntregado(v.entregado??true);setQeComision(String(v.comision_plataforma||0));}
  async function guardarQuickEdit(){if(!quickEditV)return;setQeLoading(true);await onEditar(quickEditV.id,{entregado:qeEntregado,comision_plataforma:parseFloat(qeComision)||0});setQeLoading(false);setQuickEditV(null);}

  const clientesUnicos = useMemo(()=>["Todos",...new Set(ventas.map(v=>v.cliente_nombre||"CONSUMIDOR FINAL").filter(Boolean)).values()].sort(),[ventas]);

  const filtrados=useMemo(()=>ventas.filter(v=>{
    if(fVend!=="Todos"&&v.vendedor!==fVend)return false;
    if(fMet!=="Todos"&&v.metodo_pago!==fMet)return false;
    if(fFecha&&v.fecha!==fFecha)return false;
    if(fEstado==="sinCobrar"&&v.cobrado)return false;
    if(fEstado==="sinEntregar"&&v.entregado)return false;
    if(fCliente!=="Todos"&&(v.cliente_nombre||"CONSUMIDOR FINAL")!==fCliente)return false;
    if(fSinComision&&!(METODOS_CON_COMISION.includes(v.metodo_pago)&&!(v.comision_plataforma>0)))return false;
    if(fProducto){const q=fProducto.toLowerCase();if(!(v.items||[]).some(i=>(i.nombre||"").toLowerCase().includes(q)))return false;}
    if(busqIng.trim()){const q=busqIng.toLowerCase();if(!((v.cliente_nombre||"").toLowerCase().includes(q)||(v.vendedor||"").toLowerCase().includes(q)||(v.nro_factura||"").toLowerCase().includes(q)||(v.modalidad||"").toLowerCase().includes(q)||(v.notas_pedido_web||"").toLowerCase().includes(q)))return false;}
    return true;
  }),[ventas,fVend,fMet,fFecha,fEstado,fCliente,fSinComision,fProducto,busqIng,METODOS_CON_COMISION]);
  // Si hay filtro "sinCobrar", usar saldo real (saldo_cobro si existe, sino total completo)
  const totalF=filtrados.reduce((s,v)=>{
    const comision=v.comision_plataforma||0;
    if(fEstado==="sinCobrar"){
      if((v.saldo_cobro||0)>0) return s+(v.saldo_cobro||0);
      return s+(v.total||0)-comision;
    }
    return s+(v.total||0)-comision;
  },0);
  const ganF=filtrados.reduce((s,v)=>s+(v.ganancia||0),0);

  return(<>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:esAdmin?"repeat(3,1fr)":"repeat(2,1fr)",gap:12}}>
        <MetricCard label={fFecha?"Ventas del dia":"Ventas (filtro)"} value={fmtNum(filtrados.length)} sub={fFecha?fFecha:`de ${fmtNum(totalVentas)} historicas`}/>
        <MetricCard label="Total" value={fmt(totalF)} color={G.verde}/>
        {esAdmin&&<MetricCard label="Ganancia neta" value={fmt(ganF)} color={G.verde} sub={`${totalF>0?Math.round(ganF/totalF*100):0}% margen`}/>}
      </div>
      {/* Tabs ventas / pagos parciales */}
      <div style={{display:"flex",gap:6}}>
        {[{k:"ventas",l:"Ventas"},{k:"pagos",l:"Historial de cobros parciales"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)} style={{padding:"6px 16px",borderRadius:8,border:`1px solid ${tab===t.k?G.verde:G.borde}`,background:tab===t.k?G.verde+"22":"transparent",color:tab===t.k?G.verde:G.textoSec,cursor:"pointer",fontSize:13,fontFamily:"DM Sans,sans-serif",fontWeight:tab===t.k?600:400}}>
            {t.l}
          </button>
        ))}
      </div>
      {tab==="ventas"&&<Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Vendedor</div><Fi value={fVend} onChange={setFV} options={["Todos",...(vendedores||[]).map(v=>v.nombre)]}/></div>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Método de pago</div><Fi value={fMet} onChange={setFM} options={["Todos",...METODOS_PAGO]}/></div>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Fecha</div><Fi value={fFecha} onChange={setFF} type="date"/></div>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Estado</div><Fi value={fEstado} onChange={setFEstado} options={[{value:"",label:"Todos los estados"},{value:"sinCobrar",label:"Sin cobrar"},{value:"sinEntregar",label:"Sin entregar"}]}/></div>
          <div style={{flex:2,minWidth:180}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Cliente</div><Fi value={fCliente} onChange={setFCliente} options={clientesUnicos}/></div>
          <div style={{flex:2,minWidth:180}}>
            <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Buscar</div>
            <div style={{position:"relative"}}>
              <input value={busqIng} onChange={e=>setBusqIng(e.target.value)} placeholder="🔍 Cliente, vendedor, Nº factura..." style={{background:G.sup2,border:`1px solid ${busqIng?G.verde:G.borde}`,borderRadius:8,padding:"8px 30px 8px 11px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
              {busqIng&&<button onClick={()=>setBusqIng("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:G.textoSec,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>✕</button>}
            </div>
          </div>
          <div style={{flex:2,minWidth:180}}>
            <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Producto</div>
            <div style={{position:"relative"}}>
              <input value={fProducto} onChange={e=>setFProducto(e.target.value)} placeholder="Buscar por producto..." style={{background:G.sup2,border:`1px solid ${fProducto?G.verde:G.borde}`,borderRadius:8,padding:"8px 30px 8px 11px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
              {fProducto&&<button onClick={()=>setFProducto("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:G.textoSec,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>✕</button>}
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,justifyContent:"flex-end"}}>
            <button onClick={()=>setFSinComision(f=>!f)} style={{background:fSinComision?"#FFB80022":"transparent",border:`1px solid ${fSinComision?"#FFB800":"#FFB80055"}`,borderRadius:8,padding:"8px 12px",color:fSinComision?G.amarillo:"#FFB80099",cursor:"pointer",fontSize:12,fontWeight:fSinComision?600:400,fontFamily:"DM Sans,sans-serif",whiteSpace:"nowrap",transition:"all .15s"}}>
              ⚠ Comisiones pendientes{fSinComision?" (activo)":""}
            </button>
          </div>
          {(fFecha||fEstado||fCliente!=="Todos"||fVend!=="Todos"||fMet!=="Todos"||fSinComision||fProducto||busqIng)&&<Btn small variant="ghost" onClick={()=>{setFF("");setFEstado("");setFCliente("Todos");setFV("Todos");setFM("Todos");setFSinComision(false);setFProducto("");setBusqIng("");}}>Limpiar todo</Btn>}
        </div>
      </Card>}
      {tab==="ventas"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtrados.map(v=>(
          <Card key={v.id} style={{padding:"12px 18px",cursor:esAdmin?undefined:"pointer"}} onClick={!esAdmin?()=>abrirQuickEdit(v):undefined}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:"1 1 300px",minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14}}>{v.cliente_nombre||"CONSUMIDOR FINAL"}</div>
                <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{v.fecha} · {v.hora} · {v.vendedor} · {v.metodo_pago}</div>
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <Badge color={v.cobrado?"verde":"rojo"}>{v.cobrado?"Cobrado":"Sin cobrar"}</Badge>
                  <Badge color={v.entregado?"verde":"amarillo"}>{v.entregado?"Entregado":"Sin entregar"}</Badge>
                  {v.descuento>0&&<Badge color="azul">-{v.descuento}%</Badge>}
                  {v.metodo_pago!=="Efectivo"&&!(v.comision_plataforma>0)&&<span style={{background:"#FFB80022",color:G.amarillo,border:"1px solid #FFB80055",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:600}}>⚠ Sin comision</span>}
                  {v.metodo_pago!=="Efectivo"&&v.comision_plataforma>0&&<Badge color="gris">Comision {fmt(v.comision_plataforma)}</Badge>}
                </div>
                {(v.items||[]).length>0&&<div style={{marginTop:8,fontSize:11,color:G.textoSec}}>{(v.items||[]).map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}><span>{it.nombre} <strong style={{color:G.texto}}>x{it.cantidad}</strong></span><span style={{fontFamily:"DM Mono,monospace"}}>{fmt((it.precio||0)*(it.cantidad||0))}</span></div>)}</div>}
                {/* Historial de cobros parciales inline */}
                {(()=>{
                  const cobros = pagosDeuda.filter(p=>p.referencia_id===v.id&&p.tipo==="ingreso").sort((a,b)=>a.fecha>b.fecha?1:-1);
                  // Si hay registros explícitos, mostrarlos
                  if(cobros.length>0) return(
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10,display:"flex",flexDirection:"column",gap:4}}>
                      {cobros.map(p=>(
                        <div key={p.id} style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                          <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(p.monto)}</span>
                          <span>{p.fecha}</span>
                          <span>·</span>
                          <span>{p.metodo_pago}</span>
                          {p.concepto&&<><span>·</span><span style={{fontStyle:"italic"}}>{p.concepto}</span></>}
                          {esAdmin&&<button onClick={e=>{e.stopPropagation();onEliminarPago&&onEliminarPago(p.id);}} style={{background:"none",border:"none",color:G.rojo,cursor:"pointer",fontSize:12,padding:"0 2px",lineHeight:1}} title="Eliminar cobro">✕</button>}
                        </div>
                      ))}
                    </div>
                  );
                  // Si no hay registros pero la venta está cobrada, mostrar el pago implícito
                  if(v.cobrado) return(
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                        <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(v.total)}</span>
                        <span>{v.fecha}</span>
                        <span>·</span>
                        <span>{v.metodo_pago}</span>
                        <span style={{color:G.textoSec,fontStyle:"italic"}}>pago único</span>
                      </div>
                    </div>
                  );
                  // Si tiene cobro parcial sin registros explícitos
                  if((v.monto_cobrado||0)>0) return(
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                        <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(v.monto_cobrado)}</span>
                        <span>{v.fecha}</span>
                        <span>·</span>
                        <span>{v.metodo_pago}</span>
                        <span style={{color:G.amarillo,fontStyle:"italic"}}>pago parcial · saldo {fmt(v.saldo_cobro||0)}</span>
                      </div>
                    </div>
                  );
                  return null;
                })()}
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,maxWidth:420,flexShrink:0}}>
                {(v.comision_plataforma||0)>0
                  ? <>
                      <div style={{fontSize:18,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(v.total-(v.comision_plataforma||0))}</div>
                      <div style={{fontSize:11,color:G.textoSec}}>Bruto {fmt(v.total)} · Comisión <span style={{color:G.rojo}}>-{fmt(v.comision_plataforma)}</span></div>
                    </>
                  : <div style={{fontSize:18,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(v.total)}</div>
                }
                {(v.monto_cobrado||0)>0&&!v.cobrado&&(
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
                    <div style={{fontSize:11,color:G.verde}}>Cobrado: {fmt(v.monto_cobrado)}</div>
                    <div style={{fontSize:12,fontWeight:600,color:G.amarillo,fontFamily:"DM Mono,monospace"}}>Saldo: {fmt(v.saldo_cobro||0)}</div>
                  </div>
                )}
                {esAdmin&&<div style={{fontSize:11,color:G.textoSec}}>Ganancia: {fmt(v.ganancia)}</div>}
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {esAdmin&&<Btn small variant="ghost" onClick={e=>{e.stopPropagation();abrirEditarVenta(v);}}>Editar</Btn>}
                  {esAdmin&&<Btn small variant="danger" onClick={e=>{e.stopPropagation();setConfirmarElim(v);}}>Eliminar</Btn>}
                  <Btn small variant="secondary" disabled={genTicket===v.id} onClick={e=>{e.stopPropagation();imprimirTicket(v);}}>🖨 Ticket</Btn>
                  <Btn small variant="secondary" disabled={genRemito===v.id} onClick={e=>{e.stopPropagation();imprimirRemito(v);}}>📦 Remito</Btn>
                  {esAdmin&&(v.items||[]).length>0&&<Btn small variant="ghost" onClick={e=>{e.stopPropagation();abrirDevolver(v);}}>↩ Devolver</Btn>}
                  {(devoluciones||[]).some(d=>String(d.venta_id)===String(v.id))&&<Badge color="amarillo" small>📝 NC</Badge>}
                  {!v.cobrado&&<Btn small variant="outline" onClick={e=>{e.stopPropagation();setModalCobro(v);setCobroMonto(String(v.saldo_cobro||v.total||""));setCobroMetodo("Efectivo");setCobroFecha(hoy());}}>💰 Registrar cobro</Btn>}
                  {esAdmin&&!v.cobrado&&(v.monto_cobrado||0)>0&&<Btn small variant="ghost" onClick={e=>{e.stopPropagation();setModalCorregir(v);setCorregirMonto(String(v.monto_cobrado||0));}}>✏ Corregir cobro</Btn>}
                </div>
              </div>
            </div>
          </Card>
        ))}
        {filtrados.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin registros</div>}
      </div>}
      {quickEditV&&(<Modal title="Actualizar venta" onClose={()=>setQuickEditV(null)} footer={<><Btn variant="secondary" onClick={()=>setQuickEditV(null)}>Cancelar</Btn><Btn disabled={qeLoading} onClick={guardarQuickEdit}>{qeLoading?"Guardando...":"Guardar"}</Btn></>}><div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}><div style={{fontWeight:600,color:G.texto}}>{quickEditV.cliente_nombre}</div><div>{quickEditV.fecha} · {quickEditV.vendedor} · {fmt(quickEditV.total)}</div></div><div style={{display:"flex",alignItems:"center",gap:20}}><Badge color={quickEditV.cobrado?"verde":"amarillo"}>{quickEditV.cobrado?"✓ Cobrada":"Pendiente de cobro — usar \"Registrar cobro\""}</Badge><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><input type="checkbox" checked={qeEntregado} onChange={e=>setQeEntregado(e.target.checked)}/> Entregado</label></div>{quickEditV.metodo_pago!=="Efectivo"&&<Fi label="Comision plataforma ($)" value={qeComision} onChange={setQeComision} type="number" placeholder="0"/>}</div></Modal>)}
      {editandoV&&(()=>{
        const iN=evItems.map(i=>({...i,cantidad:parseFloat(i.cantidad)||0,precio:parseFloat(i.precio)||0}));
        const bruto=iN.reduce((s,i)=>s+i.precio*i.cantidad,0);
        const desc=parseFloat(evDescuento)||0;
        const total=r100(bruto*(1-desc/100));
        const comision=parseFloat(evComision)||0;
        const gan=total-iN.reduce((s,i)=>s+(i.costo||0)*i.cantidad,0)-comision;
        return(<Modal title="Editar venta" onClose={()=>setEditandoV(null)} maxWidth={640} footer={<><Btn variant="secondary" onClick={()=>setEditandoV(null)}>Cancelar</Btn><Btn disabled={evLoading} onClick={guardarVenta}>{evLoading?"Guardando...":"Guardar"}</Btn></>}><div style={{display:"flex",flexDirection:"column",gap:14}}><div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec,display:"flex",justifyContent:"space-between"}}><span>{editandoV.fecha} · {editandoV.nro_factura}</span><span style={{color:G.verde,fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(total)}</span></div><Fi label="Cliente" value={evCliente} onChange={setEvCliente} options={[...new Set(["CONSUMIDOR FINAL",...(clientes||[]).filter(c=>c.activo).map(c=>c.nombre)])]}/><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><Fi label="Vendedor" value={evVendedor} onChange={setEvVendedor} options={(vendedores||[]).map(v=>v.nombre)}/><Fi label="Metodo de pago" value={evMetodo} onChange={v=>{setEvMetodo(v);if(!METODOS_CON_COMISION_ING.includes(v))setEvComision("0");}} options={METODOS_PAGO}/><Fi label="Descuento (%)" value={evDescuento} onChange={setEvDescuento} type="number" min="0" max="100" placeholder="0"/></div>{METODOS_CON_COMISION_ING.includes(evMetodo)&&<div style={{background:"#4D9EFF11",border:"1px solid #4D9EFF33",borderRadius:8,padding:"10px 14px"}}><Fi label="Comision ($)" value={evComision} onChange={setEvComision} type="number" placeholder="0"/>{comision>0&&<div style={{fontSize:11,color:G.textoSec,marginTop:4}}>Ganancia: <strong style={{color:G.verde}}>{fmt(gan)}</strong></div>}</div>}<div style={{display:"flex",alignItems:"center",gap:20}}><Badge color={editandoV.cobrado?"verde":"amarillo"}>{editandoV.cobrado?"✓ Cobrada":"Pendiente de cobro — usar \"Registrar cobro\""}</Badge><label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}><input type="checkbox" checked={evEntregado} onChange={e=>setEvEntregado(e.target.checked)}/> Entregado</label></div><ST>Productos</ST><div style={{display:"flex",flexDirection:"column",gap:8}}>{iN.map((item,idx)=><div key={idx} style={{display:"grid",gridTemplateColumns:"1fr 70px 100px 32px",gap:8,alignItems:"center"}}><div style={{background:G.sup2,border:"1px solid "+G.borde,borderRadius:7,padding:"7px 10px",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.nombre}</div><input type="number" value={evItems[idx].cantidad} onChange={e=>actualizarItem(idx,"cantidad",e.target.value)} style={{background:G.sup2,border:"1px solid "+G.borde,borderRadius:7,padding:"7px 8px",color:G.texto,fontSize:12,outline:"none",textAlign:"center",width:"100%"}}/><input type="number" value={evItems[idx].precio} onChange={e=>actualizarItem(idx,"precio",e.target.value)} style={{background:G.sup2,border:"1px solid "+G.borde,borderRadius:7,padding:"7px 8px",color:G.texto,fontSize:12,outline:"none",textAlign:"right",width:"100%"}}/><button onClick={()=>eliminarItemEv(idx)} style={{background:"#FF4D6A18",border:"1px solid #FF4D6A33",borderRadius:7,color:G.rojo,cursor:"pointer",fontSize:14,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>x</button></div>)}<div style={{position:"relative"}}><input value={evBusqueda} onChange={e=>setEvBusqueda(e.target.value)} placeholder="+ Buscar producto..." style={{background:G.sup2,border:"1px solid "+G.verde+"55",borderRadius:7,padding:"8px 12px",color:G.texto,fontSize:12,outline:"none",width:"100%"}}/>{evBusqueda.length>1&&(()=>{const hits=(productos||[]).filter(p=>p.nombre.toLowerCase().includes(evBusqueda.toLowerCase())&&p.activo!==false).slice(0,8);if(!hits.length)return null;return <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup,border:"1px solid "+G.borde,borderRadius:7,zIndex:50,maxHeight:220,overflowY:"auto"}}>{hits.map(p=><div key={p.id} onClick={()=>agregarItemEv(p)} style={{padding:"9px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",fontSize:12,borderBottom:"1px solid "+G.borde+"22"}} onMouseEnter={e=>e.currentTarget.style.background=G.sup2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><span>{p.nombre}</span><span style={{color:G.verde,fontFamily:"DM Mono,monospace",fontSize:11}}>{fmt(p.precio_min)}</span></div>)}</div>;})()}</div></div><div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",fontSize:13}}><span style={{color:G.textoSec}}>Total{desc>0?" (-"+desc+"%)":""}</span><span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde}}>{fmt(total)}</span></div></div></Modal>);
      })()}
      {modalCobro&&(
        <Modal title="Registrar cobro" onClose={()=>setModalCobro(null)}
          footer={<>
            <Btn variant="secondary" onClick={()=>setModalCobro(null)}>Cancelar</Btn>
            <Btn disabled={!cobroMonto||parseFloat(cobroMonto)<=0} onClick={async()=>{
              const monto=parseFloat(cobroMonto)||0;
              const saldoAnterior=modalCobro.saldo_cobro||modalCobro.total||0;
              const nuevoSaldo=Math.max(0,saldoAnterior-monto);
              const cobrado=nuevoSaldo<=0;
              await onEditar(modalCobro.id,{
                cobrado,
                monto_cobrado:(modalCobro.monto_cobrado||0)+monto,
                saldo_cobro:nuevoSaldo
              },{monto,metodo_pago:cobroMetodo,fecha:cobroFecha});
              setModalCobro(null);
              cargarPagos(); // refrescar para que se vea el nuevo cobro en la card
            }}>Registrar</Btn>
          </>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              <div style={{fontWeight:600,color:G.texto}}>{modalCobro.cliente_nombre||"CONSUMIDOR FINAL"}</div>
              <div>Venta: <strong>{modalCobro.nro_factura}</strong> · Total: <strong style={{color:G.verde}}>{fmt(modalCobro.total)}</strong></div>
              {(modalCobro.monto_cobrado||0)>0&&<div>Ya cobrado: <strong style={{color:G.verde}}>{fmt(modalCobro.monto_cobrado)}</strong> · Saldo: <strong style={{color:G.amarillo}}>{fmt(modalCobro.saldo_cobro||0)}</strong></div>}
            </div>
            <Fi label="Monto cobrado ahora ($)" value={cobroMonto} onChange={setCobroMonto} type="number" placeholder="0"/>
            <Fi label="Método de pago" value={cobroMetodo} onChange={setCobroMetodo} options={METODOS_PAGO}/>
            <Fi label="Fecha del cobro" value={cobroFecha} onChange={setCobroFecha} type="date"/>
          </div>
        </Modal>
      )}
      {modalDevolver&&(()=>{
        const totalDev = devLineas.reduce((s,l)=>s+(Number(l.precio)||0)*(Number(l.cantidad)||0),0);
        const hayItems = devLineas.some(l=>Number(l.cantidad)>0);
        const cli = (clientes||[]).find(c=>c.nombre===modalDevolver.cliente_nombre);
        const metodoOpts = ["Efectivo","Transferencia MP","Transferencia Banco"];
        return (
        <Modal title={`Devolver / Nota de crédito · ${modalDevolver.nro_factura||""}`} onClose={()=>setModalDevolver(null)} maxWidth={660}
          footer={<><Btn variant="secondary" onClick={()=>setModalDevolver(null)}>Cancelar</Btn>
            <Btn disabled={!hayItems||devLoading||(devTipo==="saldo"&&!cli)} onClick={async()=>{
              setDevLoading(true);
              const items = devLineas.filter(l=>Number(l.cantidad)>0).map(l=>({nombre:l.nombre,cantidad:Number(l.cantidad),precio:Number(l.precio),costo:Number(l.costo),reingresaStock:!!l.reingresa,productoId:l.productoId}));
              const ok = await onDevolver({ventaId:modalDevolver.id,ventaNro:modalDevolver.nro_factura,clienteNombre:modalDevolver.cliente_nombre,clienteId:cli?cli.id:null,tipo:devTipo,metodoDevolucion:devMetodo,motivo:devMotivo,vendedor:modalDevolver.vendedor||"",items});
              setDevLoading(false);
              if(ok) setModalDevolver(null);
            }}>{devLoading?"Registrando...":`Confirmar devolución ${totalDev>0?fmt(totalDev):""}`}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec,display:"flex",justifyContent:"space-between"}}>
              <span>{modalDevolver.fecha} · {modalDevolver.cliente_nombre||"CONSUMIDOR FINAL"} · pago: {modalDevolver.metodo_pago}</span>
              <span>Venta original: <strong style={{color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(modalDevolver.total)}</strong></span>
            </div>

            <div>
              <ST>¿Qué se devuelve?</ST>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 96px 90px 100px",gap:8,fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,padding:"0 2px"}}>
                  <span>Producto</span><span style={{textAlign:"center"}}>Devolver</span><span style={{textAlign:"right"}}>Precio</span><span style={{textAlign:"right"}}>Subtotal</span>
                </div>
                {devLineas.map((l,idx)=>(
                  <div key={idx} style={{display:"flex",flexDirection:"column",gap:4,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 10px"}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 96px 90px 100px",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.nombre}</span>
                      <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"center"}}>
                        <input type="number" min="0" max={l.max} value={l.cantidad} onChange={e=>{const n=Math.max(0,Math.min(l.max,parseInt(e.target.value)||0));setDevLinea(idx,"cantidad",n);}} style={{width:48,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"5px 6px",color:G.texto,fontSize:12,textAlign:"center",outline:"none"}}/>
                        <span style={{fontSize:10,color:G.textoSec}}>de {l.max}</span>
                      </div>
                      <span style={{textAlign:"right",fontSize:12,fontFamily:"DM Mono,monospace"}}>{fmt(l.precio)}</span>
                      <span style={{textAlign:"right",fontSize:12,fontFamily:"DM Mono,monospace",fontWeight:600,color:Number(l.cantidad)>0?G.texto:G.textoSec}}>{fmt(l.precio*Number(l.cantidad||0))}</span>
                    </div>
                    {Number(l.cantidad)>0&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:11}}>
                      <label style={{display:"flex",alignItems:"center",gap:6,cursor:l.productoId?"pointer":"not-allowed",color:l.productoId?G.textoSec:G.rojo}}>
                        <input type="checkbox" disabled={!l.productoId} checked={l.productoId?l.reingresa:false} onChange={e=>setDevLinea(idx,"reingresa",e.target.checked)}/>
                        {l.productoId?"Reingresar al stock":"Producto no encontrado — no reingresa stock"}
                      </label>
                    </div>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <ST>Tipo de devolución</ST>
              <div style={{display:"flex",gap:8}}>
                {[{k:"dinero",l:"💵 Devolver dinero"},{k:"saldo",l:"🏦 Saldo a favor"}].map(t=>{
                  const dis = t.k==="saldo"&&!cli;
                  return <button key={t.k} disabled={dis} onClick={()=>setDevTipo(t.k)} style={{flex:1,background:devTipo===t.k?G.verde:G.sup2,color:devTipo===t.k?"#000":dis?G.textoSec+"66":G.textoSec,border:`1px solid ${devTipo===t.k?G.verde:G.borde}`,borderRadius:8,padding:"9px 8px",fontSize:12,fontWeight:600,cursor:dis?"not-allowed":"pointer"}}>{t.l}</button>;
                })}
              </div>
              {devTipo==="saldo"&&!cli&&<div style={{fontSize:10,color:G.textoSec,marginTop:4}}>El saldo a favor requiere un cliente identificado (no Consumidor Final).</div>}
              {devTipo==="saldo"&&cli&&<div style={{fontSize:10,color:G.textoSec,marginTop:4}}>Se le acreditará {fmt(totalDev)} a la cuenta de {cli.nombre} para futuras compras.</div>}
            </div>

            {devTipo==="dinero"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Sale de la billetera" value={devMetodo} onChange={setDevMetodo} options={metodoOpts}/>
              <Fi label="Motivo (opcional)" value={devMotivo} onChange={setDevMotivo} placeholder="Ej: producto fallado"/>
            </div>}
            {devTipo==="saldo"&&<Fi label="Motivo (opcional)" value={devMotivo} onChange={setDevMotivo} placeholder="Ej: cambio de producto"/>}

            <div style={{background:G.sup2,borderRadius:8,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <span style={{fontSize:13,fontWeight:600}}>Total a devolver</span>
              <span style={{fontSize:20,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(totalDev)}</span>
            </div>
            <div style={{fontSize:10,color:G.textoSec}}>Se genera una nota de crédito ligada a esta venta, se reingresa el stock marcado y {devTipo==="dinero"?"la caja registra la salida de dinero":"se acredita el saldo al cliente"}. La venta original queda registrada con su NC para consulta.</div>
          </div>
        </Modal>);
      })()}

      {confirmarElim&&(<Modal title="Eliminar venta" onClose={()=>setConfirmarElim(null)} footer={<><Btn variant="secondary" onClick={()=>setConfirmarElim(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElim.id);setConfirmarElim(null);}}>Si, eliminar</Btn></>}><p style={{color:G.textoSec,fontSize:13}}>Eliminar venta de <strong>{confirmarElim.cliente_nombre}</strong> del {confirmarElim.fecha} por <strong>{fmt(confirmarElim.total)}</strong>?</p></Modal>)}
      {modalCorregir&&(
        <Modal title="Corregir cobro parcial" onClose={()=>setModalCorregir(null)}
          footer={<>
            <Btn variant="secondary" onClick={()=>setModalCorregir(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={async()=>{
              await onEditar(modalCorregir.id,{monto_cobrado:0,saldo_cobro:modalCorregir.total,cobrado:false});
              setModalCorregir(null);
            }}>Borrar cobro</Btn>
            <Btn onClick={async()=>{
              const monto=parseFloat(corregirMonto)||0;
              const saldo=Math.max(0,(modalCorregir.total||0)-monto);
              await onEditar(modalCorregir.id,{monto_cobrado:monto,saldo_cobro:saldo,cobrado:saldo===0});
              setModalCorregir(null);
            }}>Guardar corrección</Btn>
          </>}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              <div style={{fontWeight:600,color:G.texto}}>{modalCorregir.cliente_nombre||"CONSUMIDOR FINAL"}</div>
              <div>Total de la venta: <strong style={{color:G.verde}}>{fmt(modalCorregir.total)}</strong></div>
            </div>
            <Fi label="Monto cobrado real ($)" value={corregirMonto} onChange={setCorregirMonto} type="number" placeholder="0"/>
            {corregirMonto&&<div style={{fontSize:12,color:G.textoSec,background:G.sup2,borderRadius:7,padding:"8px 12px"}}>
              Saldo pendiente resultante: <strong style={{color:(modalCorregir.total-(parseFloat(corregirMonto)||0))>0?G.amarillo:G.verde}}>{fmt(Math.max(0,(modalCorregir.total||0)-(parseFloat(corregirMonto)||0)))}</strong>
            </div>}
            <div style={{fontSize:11,color:G.textoSec}}>Para eliminar el cobro completamente usá el botón "Borrar cobro".</div>
          </div>
        </Modal>
      )}
    </div>

    {/* ── HISTORIAL DE COBROS PARCIALES ── */}
    {tab==="pagos"&&(
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:13,color:G.textoSec}}>Cobros parciales registrados — podés editar o eliminar si hay un error.</div>
          <Btn small variant="secondary" onClick={cargarPagos}>↺ Actualizar</Btn>
        </div>
        {loadingPagos
          ? <div style={{textAlign:"center",padding:40,color:G.textoSec}}>Cargando...</div>
          : pagosDeuda.length===0
            ? <Card><div style={{textAlign:"center",padding:30,color:G.textoSec}}>No hay cobros parciales registrados</div></Card>
            : <Card style={{padding:0,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${G.borde}`}}>
                      {["Fecha","Concepto","Monto","Método",""].map(h=>(
                        <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagosDeuda.map(p=>(
                      <tr key={p.id} style={{borderBottom:`1px solid ${G.borde}22`}}>
                        <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontSize:11,color:G.textoSec}}>{p.fecha}</td>
                        <td style={{padding:"10px 14px",fontSize:12}}>{p.concepto||"—"}</td>
                        <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde}}>{fmt(p.monto)}</td>
                        <td style={{padding:"10px 14px",fontSize:12,color:G.textoSec}}>{p.metodo_pago}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:6}}>
                            <Btn small variant="secondary" onClick={()=>{setEditandoPago(p);setEditPagoMonto(String(p.monto));setEditPagoMet(p.metodo_pago);}}>Editar</Btn>
                            <Btn small variant="danger" onClick={()=>setConfElimPago(p)}>Eliminar</Btn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
        }
      </div>
    )}

    {/* Modal editar pago */}
    {editandoPago&&(
      <Modal title="Editar cobro parcial" onClose={()=>setEditandoPago(null)}
        footer={<><Btn variant="secondary" onClick={()=>setEditandoPago(null)}>Cancelar</Btn><Btn disabled={editPagoLoad} onClick={async()=>{setEditPagoLoad(true);const ok=await onEditarPago(editandoPago.id,parseFloat(editPagoMonto)||0,editPagoMet);if(ok){setEditandoPago(null);cargarPagos();}setEditPagoLoad(false);}}>{editPagoLoad?"Guardando...":"Guardar"}</Btn></>}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:G.sup2,borderRadius:8,padding:"8px 14px",fontSize:12,color:G.textoSec}}>{editandoPago.concepto}</div>
          <Fi label="Monto" value={editPagoMonto} onChange={setEditPagoMonto} type="number"/>
          <Fi label="Método de pago" value={editPagoMet} onChange={setEditPagoMet} options={METODOS_PAGO}/>
        </div>
      </Modal>
    )}
    {confirmarElimPago&&(
      <Modal title="Eliminar cobro parcial" onClose={()=>setConfElimPago(null)}
        footer={<><Btn variant="secondary" onClick={()=>setConfElimPago(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminarPago(confirmarElimPago.id);setConfElimPago(null);cargarPagos();}}>Sí, eliminar</Btn></>}>
        <p style={{color:G.textoSec,fontSize:13}}>¿Eliminar el cobro de <strong style={{color:G.texto}}>{fmt(confirmarElimPago.monto)}</strong> del {confirmarElimPago.fecha}? El saldo de la venta se revertirá automáticamente.</p>
      </Modal>
    )}
  </>);
}

function ModuloEgresos({egresos,pagosEgreso=[],abastecimiento=[],descuentosEgreso=[],onRegistrar,onReembolsar,vendedores,proveedores,onEditar,onEliminar,esAdmin=true,filtroInicial="",onConsumirFiltro,onRegistrarPago,onEliminarPago,onRegistrarDescuento,onEliminarDescuento}){
  const [filtroT,setFT]=useState("Todos");
  const [filtroP,setFP]=useState("Todos");
  const [filtroF,setFF]=useState("");
  const [modal,setModal]=useState(false);
  const [modalEdit,setModalEdit]=useState(false);
  const [editandoEg,setEditandoEg]=useState(null);
  const [confirmarElimEg,setConfirmarElimEg]=useState(null);
  const [modalReemb,setModalReemb]=useState(null); // egreso a reembolsar
  const [reembMonto,setReembMonto]=useState("");
  const [reembMetodo,setReembMetodo]=useState("Efectivo");
  const [reembFecha,setReembFecha]=useState(hoy());
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
    const esInvEdit = efTipo==="Inversión inicial";
    await onEditar(editandoEg.id,{concepto:efConcepto,monto:montoT,tipo:efTipo,metodo_pago:efMetodo,pagador:efPagador,notas:efNotas,monto_reembolsado:esInvEdit?montoT:montoR,saldo_pendiente:esInvEdit?0:saldoPend,reembolso_pendiente:esInvEdit?false:saldoPend>0,reembolsado:esInvEdit?true:saldoPend===0});
    setELoad(false);setModalEdit(false);
  }
  const [fConcepto,setFC]=useState(""); const [fTipo,setFTipo]=useState(TIPOS_EGRESO[0]);
  const [fMonto,setFM]=useState(""); const [fMetodo,setFMet]=useState(METODOS_PAGO[0]);
  const [fPagador,setFPag]=useState("Pensok"); const [fFecha,setFFecha]=useState(hoy());
  const [fProv,setFProv]=useState(""); const [fNotas,setFNotas]=useState("");
  const [fEsCompra,setFEsCompra]=useState(false);
  const [loading,setLoading]=useState(false);

  const reembolso=fPagador!=="Pensok";
  const [filtroReemb,setFiltroReemb]=useState(filtroInicial==="aReembolsar");
  const [busqEg, setBusqEg]=useState("");
  const [modalPagos, setModalPagos]=useState(null); // egreso seleccionado para ver historial de pagos
  const [nuevoPagoFecha, setNuevoPagoFecha]=useState(hoy());
  const [nuevoPagoMonto, setNuevoPagoMonto]=useState("");
  const [nuevoPagoMetodo, setNuevoPagoMetodo]=useState("");
  const [nuevoPagoNotas, setNuevoPagoNotas]=useState("");
  const [nuevoPagoComision, setNuevoPagoComision]=useState("");
  const [guardandoPago, setGuardandoPago]=useState(false);
  const METODOS_CON_COMISION_EG = ["Transferencia MP","Transferencia Banco","Debito MP","Debito Banco","Credito MP","Credito Banco","Credito Cuotas Banco"];
  const [nuevoDescFecha,setNuevoDescFecha]=useState(hoy());
  const [nuevoDescMonto,setNuevoDescMonto]=useState("");
  const [nuevoDescMetodo,setNuevoDescMetodo]=useState(METODOS_PAGO[0]);
  const [nuevoDescNotas,setNuevoDescNotas]=useState("");
  const [guardandoDesc,setGuardandoDesc]=useState(false);
  // Si llega un filtro inicial desde el dashboard, activar el filtro de reembolsos pendientes
  useEffect(()=>{
    if(filtroInicial==="aReembolsar"){
      setFiltroReemb(true);
      onConsumirFiltro&&onConsumirFiltro();
    }
  },[filtroInicial]);
  const filtrados=useMemo(()=>egresos.filter(e=>{
    if(filtroReemb&&!(e.reembolso_pendiente&&!e.reembolsado))return false;
    if(filtroT!=="Todos"&&e.tipo!==filtroT)return false;
    if(filtroP!=="Todos"&&e.pagador!==filtroP)return false;
    if(filtroF&&e.fecha!==filtroF)return false;
    if(busqEg.trim()){
      const q=busqEg.toLowerCase();
      if(!((e.concepto||"").toLowerCase().includes(q)||(e.pagador||"").toLowerCase().includes(q)||(e.proveedor||"").toLowerCase().includes(q)||(e.tipo||"").toLowerCase().includes(q)||(e.notas||"").toLowerCase().includes(q)))return false;
    }
    return true;
  }),[egresos,filtroReemb,filtroT,filtroP,filtroF,busqEg]);
  const totalF=filtrados.reduce((s,e)=>s+(e.monto||0),0);
  const pendReem=egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado);
  // Usar saldo_pendiente si existe, sino monto - monto_reembolsado
  const totalPend=pendReem.reduce((s,e)=>{
    const saldo=(e.saldo_pendiente||0)>0 ? e.saldo_pendiente : (e.monto||0)-(e.monto_reembolsado||0);
    return s+saldo;
  },0);
  const egresosMes=egresos.filter(e=>e.fecha?.startsWith(mesAct()));
  const egresosMesSinInv=egresosMes.filter(e=>e.tipo!=="Inversión inicial");
  const inversionesMes=egresosMes.filter(e=>e.tipo==="Inversión inicial");
  const totalMes=egresosMesSinInv.reduce((s,e)=>s+(e.monto||0),0);
  const descXEgresoMes = id => descuentosEgreso.filter(d=>d.egreso_id===id).reduce((s,d)=>s+(d.monto||0),0);
  const comisionXEgresoMes = id => pagosEgreso.filter(p=>p.egreso_id===id).reduce((s,p)=>s+(p.comision_plataforma||0),0);
  const totalMesPagado=egresosMesSinInv.filter(e=>e.pagador==="Pensok"||(e.reembolsado===true)).reduce((s,e)=>s+(e.monto||0)-descXEgresoMes(e.id)+comisionXEgresoMes(e.id),0);
  const totalInversionesMes=inversionesMes.reduce((s,e)=>s+(e.monto||0),0);
  const nombresVend=(vendedores||[]).map(v=>v.nombre);
  // Derivar pagadores reales con reembolsos pendientes (no solo vendedores)
  const deudasPers=Object.entries(
    egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado&&e.pagador&&e.pagador!=="Pensok")
      .reduce((acc,e)=>{
        const p=e.pagador;
        acc[p]=(acc[p]||0)+(e.monto||0)-(e.monto_reembolsado||0);
        return acc;
      },{})
  ).map(([persona,deuda])=>({persona,deuda})).filter(d=>d.deuda>0);
  // Deuda de Pensok a proveedores
  const deudaPensok=egresos.filter(e=>e.pagador==="Pensok"&&e.reembolso_pendiente&&!e.reembolsado).reduce((s,e)=>s+(e.monto||0)-(e.monto_reembolsado||0),0);
  const colorT={"Gasto fijo":"azul","Gasto variable":"gris","Retiro de capital":"amarillo"};

  async function eliminarCliente(id){
    await supabase.from("clientes").delete().eq("id",id);
    setConfirmarElimCli(null);
    setClienteSelec(null);
    await onGuardar(null); // refresh
  }

  async function guardar(){
    if(!fConcepto||!fMonto)return;
    setLoading(true);
    const montoT=parseFloat(fMonto)||0;
    const esInversion = fTipo==="Inversión inicial";
    // Todo egreso nuevo arranca 100% pendiente de pago (salvo Inversión inicial, que nunca
    // se paga desde la caja del local). El único camino para registrar plata es "Registrar pago",
    // que es el que queda reflejado en el Libro de movimientos con fecha y método reales.
    await onRegistrar({
      fecha:fFecha,concepto:fConcepto,tipo:fTipo,monto:montoT,metodo_pago:"Efectivo", // valor por defecto; el método real se define al Registrar pago
      pagador:fPagador,
      reembolso_pendiente:esInversion?false:true,
      reembolsado:esInversion?true:false,
      monto_reembolsado:esInversion?montoT:0,
      saldo_pendiente:esInversion?0:montoT,
      proveedor:fProv,notas:fNotas,
      es_compra_productos:fEsCompra
    });
    setLoading(false);setModal(false);
    setFC("");setFM("");setFNotas("");setFProv("");setFPag("Pensok");setFEsCompra(false);
  }

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
        {esAdmin&&<MetricCard label="Gastos este mes" value={fmt(totalMesPagado)} color={G.rojo} sub={"Total devengado: "+fmt(totalMes)}/>}
        {esAdmin&&<div onClick={()=>setFiltroReemb(f=>!f)} style={{cursor:"pointer"}}>
          <MetricCard label={"A reembolsar"+(filtroReemb?" — click para ver todos":"")} value={fmt(totalPend)} color={G.amarillo} accent={totalPend>0?"#FFB80044":undefined} sub={filtroReemb?"Mostrando solo pendientes":"Click para filtrar"}/>
        </div>}
        {esAdmin&&totalInversionesMes>0&&<MetricCard label="Invertido este mes" value={fmt(totalInversionesMes)} color={G.azul} sub={`${inversionesMes.length} inversión${inversionesMes.length!==1?"es":""} — no se computa como gasto`} accent={"#4D9EFF33"}/>}
      </div>
      {(()=>{
        // Inversiones agrupadas por pagador
        const inversionesPorPersona = egresos
          .filter(e=>e.tipo==="Inversión inicial")
          .reduce((acc,e)=>{
            const p = e.pagador||"Sin especificar";
            acc[p]=(acc[p]||0)+(e.monto||0);
            return acc;
          },{});
        const listaInv = Object.entries(inversionesPorPersona).sort((a,b)=>b[1]-a[1]);
        const totalInv = listaInv.reduce((s,[,v])=>s+v,0);
        if(listaInv.length===0) return null;
        // Diferencia con respecto al que más invirtió
        const maxInv = listaInv[0][1];
        return(
          <Card style={{border:`1px solid #4D9EFF33`,background:"#4D9EFF06"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <ST style={{margin:0}}>🏗 Inversiones por persona</ST>
              <span style={{fontSize:12,color:G.textoSec}}>Total: <strong style={{color:G.texto}}>{fmt(totalInv)}</strong></span>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {listaInv.map(([persona,monto])=>{
                const diff = monto - (totalInv/listaInv.length);
                const pct = Math.round((monto/totalInv)*100);
                return(
                  <div key={persona} style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:10,padding:"12px 16px",minWidth:160,flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <Avatar nombre={persona} size={28}/>
                      <span style={{fontWeight:600,fontSize:13}}>{persona}</span>
                    </div>
                    <div style={{fontSize:20,fontWeight:700,color:"#7BC8FF",fontFamily:"'DM Mono',monospace"}}>{fmt(monto)}</div>
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                      <span style={{fontSize:11,color:G.textoSec}}>{pct}% del total</span>
                      {listaInv.length>1&&(
                        <span style={{fontSize:11,color:diff>=0?G.verde:G.rojo}}>
                          {diff>=0?"+":""}{fmt(Math.round(diff))} vs promedio
                        </span>
                      )}
                    </div>
                    {/* Barra de progreso */}
                    <div style={{marginTop:8,height:4,background:G.borde,borderRadius:2}}>
                      <div style={{height:4,borderRadius:2,background:"#4D9EFF",width:`${Math.round((monto/maxInv)*100)}%`,transition:"width .3s"}}/>
                    </div>
                  </div>
                );
              })}
            </div>
            {listaInv.length>1&&(
              <div style={{marginTop:10,fontSize:12,color:G.textoSec,borderTop:`1px solid ${G.borde}`,paddingTop:8}}>
                Para equiparar: cada persona debería haber invertido <strong style={{color:G.texto}}>{fmt(Math.round(totalInv/listaInv.length))}</strong>
                {listaInv.map(([persona,monto])=>{
                  const falta = (totalInv/listaInv.length) - monto;
                  if(Math.abs(falta)<100) return null;
                  return <span key={persona} style={{marginLeft:12,color:falta>0?G.rojo:G.verde}}>
                    {persona}: {falta>0?`debe ${fmt(Math.round(falta))}`:`adelantó ${fmt(Math.round(-falta))}`}
                  </span>;
                })}
              </div>
            )}
          </Card>
        );
      })()}

      {deudasPers.length>0&&(
        <Card style={{border:`1px solid #FFB80033`,background:"#FFB80006"}}>
          <ST>💸 Reembolsos pendientes</ST>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {deudasPers.map(d=>(
              <div key={d.persona} onClick={()=>setFP(filtroP===d.persona?"Todos":d.persona)}
                style={{background:G.sup2,border:`1px solid ${filtroP===d.persona?G.amarillo:G.borde}`,borderRadius:10,padding:"10px 16px",cursor:"pointer",transition:"border-color .15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <Avatar nombre={d.persona} size={28}/>
                  <span style={{fontWeight:600,fontSize:13}}>{d.persona}</span>
                  {filtroP===d.persona&&<Badge color="amarillo">Filtrando</Badge>}
                </div>
                <div style={{fontSize:18,fontWeight:700,color:G.amarillo,fontFamily:"'DM Mono',monospace"}}>{fmt(d.deuda)}</div>
                <div style={{fontSize:11,color:G.textoSec}}>Pensok le debe · click para filtrar</div>
              </div>
            ))}
            {deudaPensok>0&&(
              <div onClick={()=>setFP(filtroP==="Pensok"?"Todos":"Pensok")}
                style={{background:G.sup2,border:`1px solid ${filtroP==="Pensok"?"#FF4D6A":"#FF4D6A44"}`,borderRadius:10,padding:"10px 16px",cursor:"pointer",transition:"border-color .15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <Avatar nombre="Pensok" size={28} color={G.rojo}/>
                  <span style={{fontWeight:600,fontSize:13}}>Pensok</span>
                  <Badge color="rojo">Deuda propia</Badge>
                  {filtroP==="Pensok"&&<Badge color="rojo">Filtrando</Badge>}
                </div>
                <div style={{fontSize:18,fontWeight:700,color:G.rojo,fontFamily:"'DM Mono',monospace"}}>{fmt(deudaPensok)}</div>
                <div style={{fontSize:11,color:G.textoSec}}>Pensok debe a proveedores · click para filtrar</div>
              </div>
            )}
          </div>
        </Card>
      )}
      <Card style={{padding:"12px 18px"}}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:2,minWidth:200,position:"relative"}}>
            <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Buscar</div>
            <input value={busqEg} onChange={e=>setBusqEg(e.target.value)} placeholder="🔍 Concepto, pagador, proveedor, tipo..." style={{background:G.sup2,border:`1px solid ${busqEg?G.verde:G.borde}`,borderRadius:8,padding:"8px 30px 8px 11px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
            {busqEg&&<button onClick={()=>setBusqEg("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:G.textoSec,cursor:"pointer",fontSize:14,lineHeight:1,padding:0}}>✕</button>}
          </div>
          <div style={{flex:1,minWidth:150}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Tipo</div><Fi value={filtroT} onChange={setFT} options={["Todos","Gasto fijo","Gasto variable","Retiro de capital"]}/></div>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Pagador</div><Fi value={filtroP} onChange={setFP} options={["Todos","Pensok",...(vendedores||[]).map(v=>v.nombre)]}/></div>
          <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Fecha</div><Fi value={filtroF} onChange={setFF} type="date"/></div>
          <div style={{flex:1,minWidth:190}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Estado</div><Fi value={filtroReemb?"pendientes":"todos"} onChange={v=>setFiltroReemb(v==="pendientes")} options={[{value:"todos",label:"Todos"},{value:"pendientes",label:"Reembolsos pendientes de pago"}]}/></div>
          {(filtroF||busqEg||filtroT!=="Todos"||filtroP!=="Todos")&&<Btn small variant="ghost" onClick={()=>{setFF("");setBusqEg("");setFT("Todos");setFP("Todos");}}>Limpiar</Btn>}
          <Btn onClick={()=>setModal(true)}>+ Nuevo egreso</Btn>
        </div>
      </Card>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {filtrados.map(e=>{
          const pagosDe = pagosEgreso.filter(p=>p.egreso_id===e.id).sort((a,b)=>a.fecha>b.fecha?1:-1);
          const totalPagado = pagosDe.reduce((s,p)=>s+(p.monto||0),0);
          return(
          <Card key={e.id} style={{padding:"12px 18px",border:e.reembolso_pendiente&&!e.reembolsado?`1px solid #FFB80033`:undefined}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <Avatar nombre={e.pagador} size={32}/>
                <div>
                  <div style={{fontWeight:600,fontSize:14}}>{e.concepto}</div>
                  <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{e.fecha} · {e.metodo_pago} · Pago: {e.pagador}{e.proveedor&&` · ${e.proveedor}`}</div>
                  <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                    <Badge color={colorT[e.tipo]||"gris"}>{e.tipo}</Badge>
                    {e.reembolso_pendiente&&!e.reembolsado&&<Badge color="amarillo">⏳ Pago pendiente</Badge>}
                    {e.reembolso_pendiente&&!e.reembolsado&&totalPagado>0&&<span style={{fontSize:11,color:G.amarillo}}>Abonado: {fmt(totalPagado)} · Saldo: {fmt((e.saldo_pendiente)||0)}</span>}
                    {e.reembolsado&&<Badge color="verde">✓ Pagado</Badge>}
                    {e.es_compra_productos&&(()=>{
                      const cargado = abastecimiento.filter(a=>a.egreso_id===e.id).reduce((s,a)=>s+(a.cantidad||0)*(a.costo_unit||0),0);
                      return <span style={{fontSize:11,color:G.textoSec}} title="Aproximado -- puede no coincidir exacto por diferencias de precio">📦 Abastecimiento: cargado aprox. {fmt(cargado)} de {fmt(e.monto)}</span>;
                    })()}
                    {(()=>{
                      const totalDescRecibido = descuentosEgreso.filter(d=>d.egreso_id===e.id).reduce((s,d)=>s+(d.monto||0),0);
                      return totalDescRecibido>0 ? <span style={{fontSize:11,color:G.verde}}>💸 Descuento recibido: {fmt(totalDescRecibido)}</span> : null;
                    })()}
                    {(()=>{
                      const totalComision = pagosDe.reduce((s,p)=>s+(p.comision_plataforma||0),0);
                      if(totalComision>0) return <Badge color="gris">Comisión {fmt(totalComision)}</Badge>;
                      const faltaCargar = pagosDe.some(p=>METODOS_CON_COMISION_EG.includes(p.metodo_pago)&&!(p.comision_plataforma>0));
                      return faltaCargar ? <span style={{background:"#FFB80022",color:G.amarillo,border:"1px solid #FFB80055",borderRadius:6,padding:"2px 9px",fontSize:11,fontWeight:600}}>⚠ Sin comisión</span> : null;
                    })()}
                    {e.notas&&<span style={{fontSize:11,color:G.textoSec,fontStyle:"italic"}}>{e.notas}</span>}
                  </div>
                  {/* Historial de pagos inline */}
                  {pagosDe.length>0?(
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10,display:"flex",flexDirection:"column",gap:4}}>
                      {pagosDe.map(p=>(
                        <div key={p.id} style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                          <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(p.monto)}</span>
                          <span>{p.fecha}</span>
                          <span>·</span>
                          <span>{p.metodo_pago}</span>
                          {p.notas&&<><span>·</span><span style={{fontStyle:"italic"}}>{p.notas}</span></>}
                          {esAdmin&&<button onClick={()=>onEliminarPago&&onEliminarPago(p.id)} style={{background:"none",border:"none",color:G.rojo,cursor:"pointer",fontSize:12,padding:"0 2px",lineHeight:1}} title="Eliminar este pago">✕</button>}
                        </div>
                      ))}
                    </div>
                  ):e.reembolsado?(
                    // Pago único implícito — sin registros en pagos_egreso
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                        <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(e.monto)}</span>
                        <span>{e.fecha}</span>
                        <span>·</span>
                        <span>{e.metodo_pago}</span>
                        <span style={{fontStyle:"italic"}}>pago único</span>
                      </div>
                    </div>
                  ):(e.monto_reembolsado||0)>0?(
                    // Pago parcial implícito
                    <div style={{marginTop:8,borderLeft:`2px solid ${G.borde}`,paddingLeft:10}}>
                      <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,color:G.textoSec}}>
                        <span style={{fontFamily:"DM Mono,monospace",color:G.verde,fontWeight:600}}>{fmt(e.monto_reembolsado)}</span>
                        <span>{e.fecha}</span>
                        <span>·</span>
                        <span>{e.metodo_pago}</span>
                        <span style={{color:G.amarillo,fontStyle:"italic"}}>pago parcial · saldo {fmt(e.saldo_pendiente||0)}</span>
                      </div>
                    </div>
                  ):null}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                <div style={{fontSize:18,fontWeight:700,color:G.rojo,fontFamily:"'DM Mono',monospace"}}>{fmt(e.monto)}</div>
                {esAdmin&&(e.reembolso_pendiente&&!e.reembolsado)&&<Btn small variant="outline" onClick={()=>{
                  setModalPagos(e);
                  setNuevoPagoMonto(String(e.saldo_pendiente||e.monto||""));
                  setNuevoPagoMetodo(e.metodo_pago||METODOS_PAGO[0]);
                  setNuevoPagoFecha(hoy());
                  setNuevoPagoNotas("");
                }}>+ Registrar pago</Btn>}
                <div style={{display:"flex",gap:6}}>
                  {esAdmin&&<Btn small variant="ghost" onClick={()=>abrirEditarEgreso(e)}>Editar</Btn>}
                  {esAdmin&&<Btn small variant="danger" onClick={()=>setConfirmarElimEg(e)}>Eliminar</Btn>}
                </div>
              </div>
            </div>
          </Card>
          );
        })}
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

      {modalPagos&&(
        <Modal title={`Pagos — ${modalPagos.concepto}`} onClose={()=>setModalPagos(null)} maxWidth={520}
          footer={<Btn variant="secondary" onClick={()=>setModalPagos(null)}>Cerrar</Btn>}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Resumen del egreso */}
            <div style={{background:G.sup2,borderRadius:8,padding:"12px 14px",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{modalPagos.concepto}</div>
                <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{modalPagos.pagador} · {modalPagos.fecha}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:G.textoSec}}>Total del egreso</div>
                <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:16,color:G.rojo}}>{fmt(modalPagos.monto)}</div>
                {(()=>{
                  const totalDesc = descuentosEgreso.filter(d=>d.egreso_id===modalPagos.id).reduce((s,d)=>s+(d.monto||0),0);
                  const totalComision = pagosEgreso.filter(p=>p.egreso_id===modalPagos.id).reduce((s,p)=>s+(p.comision_plataforma||0),0);
                  if(!totalDesc&&!totalComision) return null;
                  return(
                    <>
                      {totalDesc>0&&<div style={{fontSize:11,color:G.verde,marginTop:2}}>− Descuentos: {fmt(totalDesc)}</div>}
                      {totalComision>0&&<div style={{fontSize:11,color:G.rojo,marginTop:2}}>+ Comisiones: {fmt(totalComision)}</div>}
                      <div style={{fontSize:11,color:G.textoSec,marginTop:2,fontWeight:600}}>Neto real: {fmt(modalPagos.monto-totalDesc+totalComision)}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Historial de pagos */}
            {pagosEgreso.filter(p=>p.egreso_id===modalPagos.id).length>0&&(
              <div>
                <div style={{fontSize:11,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:8}}>Pagos registrados</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {pagosEgreso.filter(p=>p.egreso_id===modalPagos.id).sort((a,b)=>a.fecha>b.fecha?1:-1).map(p=>(
                    <div key={p.id} style={{background:G.sup2,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(p.monto)}{(p.comision_plataforma||0)>0&&<span style={{color:G.rojo,fontWeight:500}}> +{fmt(p.comision_plataforma)} comisión</span>}</div>
                        <div style={{fontSize:11,color:G.textoSec}}>{p.fecha} · {p.metodo_pago}{p.notas?` · ${p.notas}`:""}</div>
                      </div>
                      {esAdmin&&<button onClick={async()=>{await onEliminarPago(p.id);}} style={{background:"none",border:"none",color:G.rojo,cursor:"pointer",fontSize:14,padding:4}}>✕</button>}
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8,padding:"8px 12px",borderTop:`1px solid ${G.borde}`,display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:G.textoSec}}>Saldo pendiente</span>
                  <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:modalPagos.saldo_pendiente>0?G.amarillo:G.verde}}>{fmt(modalPagos.saldo_pendiente||0)}</span>
                </div>
              </div>
            )}

            {/* Nuevo pago */}
            {(modalPagos.reembolso_pendiente||!modalPagos.reembolsado)&&(
              <div style={{borderTop:`1px solid ${G.borde}`,paddingTop:14}}>
                <div style={{fontSize:11,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Registrar nuevo pago</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Fi label="Monto ($)" value={nuevoPagoMonto} onChange={setNuevoPagoMonto} type="number" placeholder="0"/>
                    <Fi label="Fecha del pago" value={nuevoPagoFecha} onChange={setNuevoPagoFecha} type="date"/>
                  </div>
                  <Fi label="Método de pago" value={nuevoPagoMetodo} onChange={v=>{setNuevoPagoMetodo(v);if(!METODOS_CON_COMISION_EG.includes(v))setNuevoPagoComision("");}} options={METODOS_PAGO}/>
                  {METODOS_CON_COMISION_EG.includes(nuevoPagoMetodo)&&(
                    <div style={{background:"#FF4D6A11",border:"1px solid #FF4D6A33",borderRadius:8,padding:"10px 14px"}}>
                      <Fi label="Comisión de la plataforma ($)" value={nuevoPagoComision} onChange={setNuevoPagoComision} type="number" placeholder="0"/>
                      <div style={{fontSize:11,color:G.textoSec,marginTop:4}}>Plata extra que te cobran a vos por pagar por esta vía — no se descuenta de lo que le corresponde al proveedor, sale aparte de tu billetera.</div>
                    </div>
                  )}
                  <Fi label="Notas (opcional)" value={nuevoPagoNotas} onChange={setNuevoPagoNotas} placeholder="Ej: primera cuota"/>
                  <Btn full disabled={!nuevoPagoMonto||parseFloat(nuevoPagoMonto)<=0||guardandoPago} onClick={async()=>{
                    setGuardandoPago(true);
                    await onRegistrarPago(modalPagos.id,{
                      fecha:nuevoPagoFecha,
                      monto:parseFloat(nuevoPagoMonto),
                      metodo_pago:nuevoPagoMetodo,
                      notas:nuevoPagoNotas,
                      comision_plataforma:parseFloat(nuevoPagoComision)||0,
                    });
                    // Refrescar el egreso local para que el modal muestre el saldo actualizado
                    setModalPagos(prev=>prev?{...prev,
                      monto_reembolsado:(prev.monto_reembolsado||0)+parseFloat(nuevoPagoMonto),
                      saldo_pendiente:Math.max(0,(prev.saldo_pendiente||prev.monto||0)-parseFloat(nuevoPagoMonto)),
                      reembolso_pendiente:Math.max(0,(prev.saldo_pendiente||prev.monto||0)-parseFloat(nuevoPagoMonto))>0,
                      reembolsado:Math.max(0,(prev.saldo_pendiente||prev.monto||0)-parseFloat(nuevoPagoMonto))===0,
                    }:null);
                    setNuevoPagoMonto("");setNuevoPagoNotas("");setNuevoPagoFecha(hoy());setNuevoPagoComision("");
                    setGuardandoPago(false);
                  }}>
                    {guardandoPago?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"✓ Registrar pago"}
                  </Btn>
                </div>
              </div>
            )}

            {/* Descuentos recibidos del proveedor (plata real, después de haber pagado) */}
            {(()=>{
              const descs = descuentosEgreso.filter(d=>d.egreso_id===modalPagos.id).sort((a,b)=>a.fecha>b.fecha?1:-1);
              const totalDesc = descs.reduce((s,d)=>s+(d.monto||0),0);
              return(
                <div style={{borderTop:`1px solid ${G.borde}`,paddingTop:14}}>
                  <div style={{fontSize:11,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:10}}>Descuentos recibidos del proveedor</div>
                  {descs.length>0&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
                      {descs.map(d=>(
                        <div key={d.id} style={{background:"#00C48C11",border:`1px solid #00C48C33`,borderRadius:8,padding:"8px 12px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:G.verde,fontFamily:"DM Mono,monospace"}}>+{fmt(d.monto)}</div>
                            <div style={{fontSize:11,color:G.textoSec}}>{d.fecha} · {d.metodo_pago}{d.notas?` · ${d.notas}`:""}</div>
                          </div>
                          {esAdmin&&<button onClick={async()=>{await onEliminarDescuento(d.id);}} style={{background:"none",border:"none",color:G.rojo,cursor:"pointer",fontSize:14,padding:4}}>✕</button>}
                        </div>
                      ))}
                      <div style={{padding:"6px 12px",display:"flex",justifyContent:"space-between",fontSize:12}}>
                        <span style={{color:G.textoSec}}>Total descontado</span>
                        <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:G.verde}}>{fmt(totalDesc)}</span>
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:11,color:G.textoSec,marginBottom:8}}>Para cuando el proveedor te devuelve plata real días después de haber pagado (no toca el pago ya registrado, queda como movimiento propio).</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <Fi label="Monto ($)" value={nuevoDescMonto} onChange={setNuevoDescMonto} type="number" placeholder="0"/>
                      <Fi label="Fecha recibido" value={nuevoDescFecha} onChange={setNuevoDescFecha} type="date"/>
                    </div>
                    <Fi label="Método (cómo te lo devolvieron)" value={nuevoDescMetodo} onChange={setNuevoDescMetodo} options={METODOS_PAGO}/>
                    <Fi label="Notas (opcional)" value={nuevoDescNotas} onChange={setNuevoDescNotas} placeholder="Ej: descuento por pronto pago"/>
                    <Btn full variant="secondary" disabled={!nuevoDescMonto||parseFloat(nuevoDescMonto)<=0||guardandoDesc} onClick={async()=>{
                      setGuardandoDesc(true);
                      await onRegistrarDescuento(modalPagos.id,{
                        fecha:nuevoDescFecha, monto:parseFloat(nuevoDescMonto),
                        metodoPago:nuevoDescMetodo, notas:nuevoDescNotas,
                      });
                      setNuevoDescMonto("");setNuevoDescNotas("");setNuevoDescFecha(hoy());
                      setGuardandoDesc(false);
                    }}>
                      {guardandoDesc?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"+ Registrar descuento"}
                    </Btn>
                  </div>
                </div>
              );
            })()}
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
            <div style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"9px 12px",fontSize:11,color:G.textoSec,display:"flex",gap:8,alignItems:"flex-start"}}>
              <span>ℹ️</span>
              <span>Acá cargás <strong>el gasto</strong> (queda como pendiente de pago). Cuando se pague de verdad, hacelo desde <strong>"Registrar pago"</strong> en el detalle del egreso — así queda con fecha y método reales en el Libro de movimientos.</span>
            </div>
            <Fi label="Concepto" value={fConcepto} onChange={setFC} placeholder="Ej: Alquiler del local"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Tipo"        value={fTipo}    onChange={setFTipo}  options={TIPOS_EGRESO}/>
              <Fi label="Fecha"       value={fFecha}   onChange={setFFecha} type="date"/>
              <Fi label="Monto ($)"   value={fMonto}   onChange={setFM}     type="number" placeholder="0"/>
              <Fi label="Quien pago?" value={fPagador} onChange={setFPag}  options={["Pensok",...(vendedores||[]).map(v=>v.nombre)]}/>
              <Fi label="Proveedor"   value={fProv}    onChange={setFProv}  options={["",...(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)]}/>
            </div>
            {reembolso&&<div style={{background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:8,padding:"10px 14px",fontSize:12,color:G.amarillo}}>⚡ <strong>{fPagador}</strong> adelantó este gasto. Quedará como reembolso pendiente.</div>}
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13}}>
              <input type="checkbox" checked={fEsCompra} onChange={e=>setFEsCompra(e.target.checked)}/>
              Es compra de productos — recordarme cargarlo en Abastecimiento
            </label>
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
  const [confirmarElimCli,setConfirmarElimCli]=useState(null);
  const [fNombre,setFN]=useState(""); const [fTipo,setFTipo]=useState("minorista");
  const [fTel,setFTel]=useState(""); const [fEmail,setFEmail]=useState("");
  const [fDir,setFDir]=useState(""); const [fLimite,setFLim]=useState("0");
  const [fNotas,setFNotas]=useState(""); const [loading,setLoading]=useState(false);
  const [fechaDesde,setFechaDesde]=useState(""); const [fechaHasta,setFechaHasta]=useState("");
  const [orden,setOrden]=useState("nombre"); // nombre | monto | compras

  function abrirNuevo(){setEditando(null);setFN("");setFTipo("minorista");setFTel("");setFEmail("");setFDir("");setFLim("0");setFNotas("");setModal(true);}
  function abrirEditar(c){setEditando(c);setFN(c.nombre);setFTipo(c.tipo);setFTel(c.telefono||"");setFEmail(c.email||"");setFDir(c.direccion||"");setFLim(String(c.limite_cuenta||0));setFNotas(c.notas||"");setModal(true);}

  async function guardar(){
    if(!fNombre)return;setLoading(true);
    const datos={nombre:fNombre,tipo:fTipo,telefono:fTel,email:fEmail,direccion:fDir,limite_cuenta:parseFloat(fLimite)||0,notas:fNotas};
    await onGuardar(datos,editando?.id||null);
    setLoading(false);setModal(false);
  }

  const filtrados=useMemo(()=>clientes.filter(c=>{if(filtroT!=="Todos"&&c.tipo!==filtroT)return false;if(busqueda){const q=busqueda.toLowerCase();if(!c.nombre.toLowerCase().includes(q)&&!(c.telefono||"").includes(q))return false;}return c.activo;}),[clientes,filtroT,busqueda]);
  // Total real adeudado por todos los clientes — misma lógica que "Nos deben clientes" del Dashboard
  // (saldo_cobro si existe, o el total completo si nunca se cobró nada). El campo cuenta_corriente es
  // un mecanismo aparte (solo ventas pagadas explícitamente con "Cuenta corriente"), no alcanza para esto.
  const saldoAdeudadoTotal=useMemo(()=>ventas.reduce((s,v)=>{
    if((v.saldo_cobro||0)>0) return s+(v.saldo_cobro||0);
    if(!v.cobrado&&!(v.monto_cobrado>0)) return s+(v.total||0);
    return s;
  },0),[ventas]);
  const [soloConDeuda,setSoloConDeuda]=useState(false);
  // Clientes filtrados + su compra dentro del rango de fecha elegido (si hay), listos para ordenar.
  // La deuda de cada cliente se calcula siempre histórica (todas sus ventas), sin importar el rango de
  // fecha elegido para "compras" — lo que debe un cliente hoy no depende del filtro de compras recientes.
  const clientesConDatos=useMemo(()=>{
    const enriquecidos=filtrados.map(c=>{
      const todasDelCliente=ventas.filter(v=>String(v.cliente_id)===String(c.id)||(v.cliente_nombre&&v.cliente_nombre.toLowerCase()===c.nombre?.toLowerCase()));
      const vCli=todasDelCliente.filter(v=>{
        if(fechaDesde&&v.fecha<fechaDesde) return false;
        if(fechaHasta&&v.fecha>fechaHasta) return false;
        return true;
      });
      const tCli=vCli.reduce((s,v)=>s+(v.total||0),0);
      const deuda=todasDelCliente.reduce((s,v)=>{
        if((v.saldo_cobro||0)>0) return s+(v.saldo_cobro||0);
        if(!v.cobrado&&!(v.monto_cobrado>0)) return s+(v.total||0);
        return s;
      },0);
      return {c,vCli,tCli,deuda};
    }).filter(e=>!soloConDeuda||e.deuda>0);
    return enriquecidos.sort((a,b)=>{
      if(orden==="monto") return b.tCli-a.tCli;
      if(orden==="compras") return b.vCli.length-a.vCli.length;
      return a.c.nombre.localeCompare(b.c.nombre);
    });
  },[filtrados,ventas,fechaDesde,fechaHasta,orden,soloConDeuda]);
  const clienteSelec=selecId?clientes.find(c=>c.id===selecId):null;
  const ventasCli=selecId?ventas.filter(v=>
    String(v.cliente_id)===String(selecId) ||
    (clienteSelec&&v.cliente_nombre&&v.cliente_nombre.toLowerCase()===clienteSelec.nombre?.toLowerCase())
  ):[];
  const totalComprado=ventasCli.reduce((s,v)=>s+(v.total||0),0);
  const ventasDeudoras=ventasCli.filter(v=>!v.cobrado||(v.saldo_cobro||0)>0);
  const sinCobrarCli=ventasDeudoras.reduce((s,v)=>s+((v.saldo_cobro||0)>0?v.saldo_cobro:v.total||0),0);
  const [genDeuda,setGenDeuda]=useState(false);

  async function generarDeudaPDF(){
    if(!clienteSelec) return; setGenDeuda(true);
    if(!window.jspdf){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,H=297;
    const azul=[20,53,107],azulClaro=[41,98,180],gris=[100,100,100],negro=[30,30,30],blanco=[255,255,255],rojo=[200,50,50],verde=[0,150,100];
    const LOGO = 'data:image/jpeg;base64,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';
    const fmtP = n => n>0?'$ '+Math.round(n).toLocaleString('es-AR'):'$ 0';
    const hoyStr = new Date().toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});

    // Header
    doc.setFillColor(...azul);
    doc.rect(0,0,W,38,'F');
    try{doc.addImage(LOGO,'JPEG',8,4,28,28);}catch(e){}
    doc.setTextColor(...blanco);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('PENSOK',44,16);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.text(`Tel: ${LI.telefono}  ·  ${LI.instagram}`,44,23);
    // Badge "Estado de cuenta"
    doc.setFillColor(...rojo);
    doc.roundedRect(W-60,8,54,20,3,3,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...blanco);
    doc.text('ESTADO DE CUENTA',W-33,16,{align:'center'});
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.text(hoyStr,W-33,24,{align:'center'});

    // Cliente info
    let y=46;
    doc.setFont('helvetica','bold');
    doc.setFontSize(14);
    doc.setTextColor(...negro);
    doc.text(clienteSelec.nombre||'',14,y);
    y+=7;
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(...gris);
    if(clienteSelec.telefono) doc.text('Tel: '+clienteSelec.telefono,14,y);
    if(clienteSelec.email) doc.text('Email: '+clienteSelec.email,14+60,y);
    y+=4;
    doc.setDrawColor(220,220,220);
    doc.setLineWidth(0.3);
    doc.line(14,y,W-14,y);
    y+=7;

    // Ventas pendientes
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...azul);
    doc.text('COMPROBANTES PENDIENTES DE PAGO',14,y);
    y+=7;

    // Table header
    doc.setFillColor(...azulClaro);
    doc.rect(14,y,W-28,7,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(...blanco);
    doc.text('Fecha',16,y+5);
    doc.text('N° Factura',50,y+5);
    doc.text('Total',110,y+5);
    doc.text('Abonado',140,y+5);
    doc.text('Saldo pendiente',172,y+5,{align:'right'});
    y+=8;

    let totalDeuda=0;
    let filaPar=false;
    for(const v of ventasDeudoras){
      if(y>H-30){
        doc.addPage();
        y=20;
      }
      const saldo=(v.saldo_cobro||0)>0?v.saldo_cobro:(!v.cobrado?v.total||0:0);
      const abonado=(v.total||0)-saldo;
      totalDeuda+=saldo;
      if(filaPar){doc.setFillColor(245,247,250);doc.rect(14,y,W-28,7,'F');}
      filaPar=!filaPar;
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      doc.setTextColor(...negro);
      doc.text(v.fecha||'',16,y+5);
      doc.text(v.nro_factura||'',50,y+5);
      doc.setTextColor(...gris);
      doc.text(fmtP(v.total),110,y+5);
      doc.text(fmtP(abonado),140,y+5);
      doc.setFont('helvetica','bold');
      doc.setTextColor(...rojo);
      doc.text(fmtP(saldo),172,y+5,{align:'right'});
      y+=7;
    }

    if(ventasDeudoras.length===0){
      doc.setFont('helvetica','italic');
      doc.setFontSize(10);
      doc.setTextColor(...verde);
      doc.text('El cliente no registra deudas pendientes.',14,y+6);
      y+=14;
    }

    // Total
    y+=4;
    doc.setDrawColor(...azul);
    doc.setLineWidth(0.5);
    doc.line(14,y,W-14,y);
    y+=7;
    doc.setFillColor(...azul);
    doc.rect(W-80,y-5,66,12,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.setTextColor(...blanco);
    doc.text('TOTAL DEUDA',W-77,y+3);
    doc.setFontSize(13);
    doc.text(fmtP(totalDeuda),W-16,y+3,{align:'right'});

    // Footer
    doc.setFillColor(...azul);
    doc.rect(0,H-12,W,12,'F');
    doc.setFont('helvetica','normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...blanco);
    doc.text('PENSOK — Estado de cuenta generado el '+hoyStr,14,H-5);
    doc.text('Pág. 1',W-14,H-5,{align:'right'});

    const fname='Estado de Cuenta Pensok - '+(clienteSelec.nombre||'cliente')+' - '+hoyStr.replace(/\//g,'-')+'.pdf';
    doc.save(fname);
    setGenDeuda(false);
  }
  const colorT={minorista:"gris",especial:"amarillo",mayorista:"azul",costo:"verde"};

  return(
    <div style={{display:"flex",gap:16,alignItems:"start"}}>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:12}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          <MetricCard label="Total clientes"  value={fmtNum(clientes.filter(c=>c.activo).length)}/>
          <MetricCard label="Con cuenta cte." value={fmtNum(clientes.filter(c=>(c.cuenta_corriente||0)<0).length)} color={G.amarillo}/>
          <div onClick={()=>setSoloConDeuda(v=>!v)} style={{cursor:"pointer"}}>
            <MetricCard label={"Saldo adeudado"+(soloConDeuda?" — click para ver todos":" — click para filtrar")} value={fmt(saldoAdeudadoTotal)} color={G.rojo} accent={soloConDeuda?G.rojo+"55":undefined}/>
          </div>
        </div>
        <Card style={{padding:"12px 18px"}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div style={{flex:1,minWidth:180}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Buscar</div><input value={busqueda} onChange={e=>setBusq(e.target.value)} placeholder="Buscar cliente..." style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/></div>
            <div style={{width:140}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Tipo</div><Fi value={filtroT} onChange={setFT} options={["Todos","minorista","especial","mayorista","costo"]}/></div>
            <div style={{width:150}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Compras desde</div><Fi value={fechaDesde} onChange={setFechaDesde} type="date"/></div>
            <div style={{width:150}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Hasta</div><Fi value={fechaHasta} onChange={setFechaHasta} type="date"/></div>
            <div style={{width:170}}><div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Ordenar por</div><Fi value={orden} onChange={setOrden} options={[{value:"nombre",label:"Nombre (A-Z)"},{value:"monto",label:"Mayor comprador ($)"},{value:"compras",label:"Más compras"}]}/></div>
            <Btn onClick={abrirNuevo}>+ Nuevo cliente</Btn>
          </div>
          {(fechaDesde||fechaHasta)&&<div style={{fontSize:11,color:G.textoSec,marginTop:8}}>Compras y montos calculados {fechaDesde?`desde ${fechaDesde}`:""}{fechaDesde&&fechaHasta?" ":""}{fechaHasta?`hasta ${fechaHasta}`:""} — el resto de los datos del cliente (cuenta corriente, etc.) sigue siendo histórico.</div>}
        </Card>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {clientesConDatos.map(({c,vCli,tCli,deuda})=>{
            const selec=selecId===c.id;
            return(
              <div key={c.id} onClick={()=>setSelecId(selec?null:c.id)} style={{background:selec?G.sup2:G.sup,border:`1px solid ${selec?G.verde+"55":G.borde}`,borderRadius:12,padding:"12px 18px",cursor:"pointer",transition:"all .15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",gap:12,alignItems:"center"}}>
                    <Avatar nombre={c.nombre} size={38} color={c.tipo==="mayorista"?G.azul:c.tipo==="especial"?G.amarillo:c.tipo==="costo"?G.verde:G.textoSec}/>
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{c.nombre}</div>
                      <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{c.telefono&&<span>{c.telefono} · </span>}{vCli.length} compras · {fmt(tCli)}</div>
                      <div style={{display:"flex",gap:6,marginTop:5}}>
                        <Badge color={colorT[c.tipo]}>{c.tipo}</Badge>
                        {deuda>0&&<Badge color="rojo">Debe {fmt(deuda)}</Badge>}
                        {(c.limite_cuenta||0)>0&&<Badge color="gris">Limite {fmt(c.limite_cuenta)}</Badge>}
                      </div>
                    </div>
                  </div>
                  <Btn small variant="ghost" onClick={e=>{e.stopPropagation();abrirEditar(c);}}>Editar</Btn>
                  <Btn small variant="danger" onClick={e=>{e.stopPropagation();setConfirmarElimCli(c);}}>Eliminar</Btn>
                </div>
              </div>
            );
          })}
          {clientesConDatos.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin clientes</div>}
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
            {sinCobrarCli>0&&(
              <div style={{background:"#FF4D6A11",border:`1px solid #FF4D6A33`,borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:11,color:G.rojo,fontWeight:600,marginBottom:2}}>DEUDA TOTAL</div>
                    <div style={{fontSize:18,fontWeight:700,color:G.rojo,fontFamily:"DM Mono,monospace"}}>{fmt(sinCobrarCli)}</div>
                  </div>
                  <Btn small onClick={generarDeudaPDF} disabled={genDeuda}>{genDeuda?"Generando...":"📄 Exportar deuda"}</Btn>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:180,overflowY:"auto"}}>
              {ventasCli.slice(0,10).map(v=>(
                <div key={v.id} style={{fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:`1px solid ${G.borde}22`}}>
                  <span style={{color:G.textoSec}}>{v.fecha}</span>
                  <span style={{fontSize:11,color:G.textoSec}}>{v.nro_factura}</span>
                  <span style={{fontFamily:"'DM Mono',monospace"}}>{fmt(v.total)}</span>
                  {!v.cobrado&&(v.saldo_cobro||0)>0?<Badge color="amarillo" small>Saldo {fmt(v.saldo_cobro)}</Badge>:!v.cobrado?<Badge color="rojo" small>Pendiente</Badge>:null}
                </div>
              ))}
              {ventasCli.length===0&&<div style={{color:G.textoSec,fontSize:12}}>Sin compras</div>}
            </div>
            {clienteSelec.notas&&<><Div/><div style={{fontSize:12,color:G.textoSec,fontStyle:"italic"}}>{clienteSelec.notas}</div></>}
          </Card>
        </div>
      )}

      {confirmarElimCli&&(
        <Modal title="Eliminar cliente" onClose={()=>setConfirmarElimCli(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElimCli(null)}>Cancelar</Btn><Btn variant="danger" onClick={()=>eliminarCliente(confirmarElimCli.id)}>Si, eliminar</Btn></>}>
          <p style={{color:G.textoSec,fontSize:13}}>¿Eliminar a <strong style={{color:G.texto}}>{confirmarElimCli.nombre}</strong>? Esta acción no se puede deshacer.</p>
        </Modal>
      )}
      {modal&&(
        <Modal title={editando?"Editar cliente":"Nuevo cliente"} onClose={()=>setModal(false)}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn><Btn disabled={!fNombre||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar cliente"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Fi label="Nombre / razon social" value={fNombre} onChange={setFN} placeholder="Ej: Club Nautico Pilar"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Tipo de precio"  value={fTipo}  onChange={setFTipo}  options={["minorista","especial","mayorista","costo"]}/>
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
function ModuloProductos({productos,onGuardar,onEliminar,proveedores,ventas=[],esAdmin=true,toast}){
  const [busqueda,  setB]       = useState("");
  const [filtroC,   setFC]      = useState("Todas");
  const [filtroE,   setFE]      = useState("Todos");
  const [filtroProv,setFPr]     = useState("Todos");
  const [filtroMarca,setFMarca] = useState("Todas");
  const [sortCol,   setSortCol] = useState("nombre");
  const [sortDir,   setSortDir] = useState("asc");
  const [modal,setModal]=useState(false); const [editando,setEditando]=useState(null);
  const [confirmarElimProd,setConfirmarElimProd]=useState(null);
  const [fCodigo,setFK]=useState(""); const [fNombre,setFN]=useState(""); const [fCat,setFCat]=useState(CATEGORIAS[0]);
  const [modalLista, setModalLista] = useState(false);
  const [tipoLista,  setTipoLista]  = useState("minorista");
  const [generando,  setGenerando]  = useState(false);
  const [catsFiltro, setCatsFiltro] = useState([]);
  const [pdfProv,    setPdfProv]    = useState("Todos");
  const [pdfMarca,   setPdfMarca]   = useState("Todas");
  const [pdfEstado,  setPdfEstado]  = useState("Todos");
  const [fMoneda,setFMon]=useState("ARS"); const [fCosto,setFCosto]=useState("");
  const [fGanMin,setFGanMin]=useState(""); const [fGanMay,setFGanMay]=useState("");
  const [fStock,setFStock]=useState(""); const [fStockMin,setFStockMin]=useState("");
  const [fProv,setFProv]=useState("");
  const [fIva,setFIva]=useState("21"); const [fDescProv,setFDescProv]=useState("0");
  const [fGranelId,setFGranelId]=useState(""); const [fConsumoGranel,setFConsumoGranel]=useState("");
  const [loading,setLoading]=useState(false);

  // Calcular precios en tiempo real
  const costo   = parseFloat(fCosto)||0;
  const ganMin  = parseFloat(fGanMin)||0;
  const ganMay  = parseFloat(fGanMay)||0;
  const r100    = n => Math.ceil(n/100)*100;
  const r100esp  = n => Math.round(n/100)*100;
  const precioMin = costo>0&&ganMin>0 ? r100(costo*(1+ganMin/100)) : 0;
  const precioEsp = precioMin>0 ? r100esp(precioMin*0.95) : 0;
  const precioMay = costo>0&&ganMay>0 ? r100(costo*(1+ganMay/100)) : 0;

  const [sincronizando, setSincronizando] = useState(false);
  async function sincronizarConCamanio(){
    if(!supabaseCamanio){toast.err("Solo disponible desde Pilar");return;}
    const confirmado = window.confirm(`¿Sincronizar TODOS los productos de Pilar a Caamaño?\n\nEsto actualizará nombre, categoría, precios, costos, % ganancia, activo y demás campos en Caamaño.\nEl stock de Caamaño NO se toca.\n\nPuede tardar unos minutos.`);
    if(!confirmado) return;
    setSincronizando(true);
    const CAMPOS_REPLICAR = ["nombre","categoria","marca","costo","costo_usd","precio_min","precio_esp","precio_may","stock_min","proveedor","activo","moneda","ganancia_min","ganancia_may","iva_pct","mostrar_siempre_en_catalogo"];
    let ok=0, errores=0;
    for(const prod of productos){
      if(!prod.codigo) continue;
      const datos = Object.fromEntries(CAMPOS_REPLICAR.map(k=>[k, prod[k]]).filter(([,v])=>v!==undefined));
      try{
        const {error} = await supabaseCamanio.from("productos").update(datos).eq("codigo",prod.codigo);
        if(error) errores++;
        else ok++;
      }catch(e){ errores++; }
    }
    setSincronizando(false);
    if(errores===0) toast.ok(`✓ ${ok} productos sincronizados con Caamaño`);
    else toast.ok(`Sincronizado: ${ok} OK · ${errores} sin coincidencia en Caamaño`);
  }

  async function generarListaPDF(tipo, productos_filtrados, filtrosInfo={}){
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
      doc.text(`Tel: ${LI.telefono}`,44,29);
      doc.text('@pensok.piletas',90,29);
      // Tipo lista badge
      const label = tipo==='minorista'?'LISTA MINORISTA':tipo==='especial'?'LISTA ESPECIAL':'LISTA MAYORISTA';
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
    const COL_PROD=14, COL_CAT=122, COL_PRECIO=150;
    const ROW_H=7, CAT_H=9;

    // Header columnas
    function dibujarHeaderColumnas(){
      doc.setFillColor(...azulClaro);
      doc.rect(10,y,W-20,7,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.setTextColor(...blanco);
      doc.text('PRODUCTO',COL_PROD+2,y+5);
      doc.text('MARCA',COL_CAT,y+5);
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
        const marcaTxt = (p.marca||'').length>18 ? (p.marca||'').substring(0,16)+'...' : (p.marca||'');
        doc.text(marcaTxt,COL_CAT,y+5);
        // Precio / stock — el precio siempre se muestra; si no hay stock, el cartel va al lado, en la MISMA línea.
        // Todo queda dentro de los límites de la fila (para no invadir la de abajo) y se ajusta si hace falta
        // para nunca salirse del margen derecho de la página, sea cual sea el largo del precio.
        const precioRaw = tipo==='minorista' ? p.precio_min : tipo==='especial' ? p.precio_esp : p.precio_may;
        const precio = tipo==='especial' ? Math.round((precioRaw||0)/100)*100 : precioRaw;
        const precioTxt = fmtP(precio);
        doc.setFont('helvetica','bold');
        doc.setFontSize(p.stock===0?7.5:8.5);
        doc.setTextColor(...azul);
        doc.text(precioTxt,COL_PRECIO,y+5);
        if(p.stock===0){
          const precioW = doc.getTextWidth(precioTxt);
          const badgeTxt = 'CONSULTAR STOCK';
          doc.setFont('helvetica','bold');
          doc.setFontSize(5.5);
          const textW = doc.getTextWidth(badgeTxt);
          const padX = 2;
          const badgeW = textW + padX*2;
          const gap = 2;
          let badgeX = COL_PRECIO + precioW + gap;
          // Si no entra al lado del precio, se pega al margen derecho (nunca se sale de la página)
          if(badgeX + badgeW > W-10) badgeX = (W-10) - badgeW;
          const badgeY = y + (ROW_H-4.2)/2; // centrado verticalmente dentro de la fila, sin invadir la de abajo
          doc.setFillColor(255,240,210);
          doc.roundedRect(badgeX,badgeY,badgeW,4.2,1,1,'F');
          doc.setTextColor(180,100,0);
          doc.text(badgeTxt,badgeX+badgeW/2,badgeY+2.9,{align:'center'});
        }
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

    // Construir nombre de archivo descriptivo
    const ahora = new Date();
    const fecha = ahora.toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
    const hora  = ahora.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}).replace(':','-');
    const partes = ['Lista de Precios Pensok'];
    partes.push(tipo.charAt(0).toUpperCase()+tipo.slice(1));
    if(filtrosInfo.prov&&filtrosInfo.prov!=='Todos') partes.push(filtrosInfo.prov);
    if(filtrosInfo.marca&&filtrosInfo.marca!=='Todas') partes.push(filtrosInfo.marca);
    if(filtrosInfo.cats&&filtrosInfo.cats.length>0) partes.push(filtrosInfo.cats.join(' + '));
    partes.push(fecha+' '+hora+'hs');
    const fname = partes.join(' - ')+'.pdf';
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
    setFGranelId(p.granel_id?String(p.granel_id):"");
    setFConsumoGranel(p.consumo_granel?String(p.consumo_granel):"");
    setModal(true);
  }
  function abrirNuevo(){
    setEditando(null);setFK("");setFN("");setFCat(CATEGORIAS[0]);setFMon("ARS");
    setFCosto("");setFGanMin("");setFGanMay("");setFStock("");setFStockMin("");
    setFProv("");setFIva("21");setFDescProv("0");setFGranelId("");setFConsumoGranel("");setModal(true);
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
      descuento_proveedor:parseFloat(fDescProv)||0,
      granel_id:fGranelId?parseInt(fGranelId):null,
      consumo_granel:parseFloat(fConsumoGranel)||0
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
    // Enriquecer con ganancias calculadas
    let list=productos.map(p=>({
      ...p,
      gan_min: p.costo>0?Math.round(((p.precio_min||0)-(p.costo||0))/p.costo*100):0,
      gan_may: p.costo>0?Math.round(((p.precio_may||0)-(p.costo||0))/p.costo*100):0,
    })).filter(p=>{
      if(!p.activo&&filtroE!=="Inactivos")return false;
      if(filtroC!=="Todas"&&p.categoria!==filtroC)return false;
      if(filtroE==="OK"&&estadoStock(p)!=="ok")return false;
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
    const colsNumericas=["stock","precio_min","precio_esp","precio_may","costo","vendidos","gan_min","gan_may"];
    list=[...list].sort((a,b)=>{
      let va=a[sortCol]??""
      let vb=b[sortCol]??""
      if(colsNumericas.includes(sortCol)){
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
  const colorE={ok:"verde",bajo:"amarillo",agotado:"rojo",negativo:"rojo"};const labelE={ok:"OK",bajo:"Bajo stock",agotado:"Agotado",negativo:"Negativo"};

  // ── REPORTE DE COMPRA INTELIGENTE ──────────────────────────────
  const [modalRecompra,    setModalRecompra]    = useState(false);
  const [rcPresupuesto,    setRcPresupuesto]    = useState("");
  const [rcProveedor,      setRcProveedor]      = useState("Todos");
  const [rcMesesHistorial, setRcMesesHistorial] = useState("3");
  const [rcMesesProyeccion,setRcMesesProyeccion]= useState("1");
  const [rcResultado,      setRcResultado]      = useState(null);
  const [rcGenerando,      setRcGenerando]      = useState(false);
  const [rcPdfLoading,     setRcPdfLoading]     = useState(false);

  function calcularRecompra(){
    setRcGenerando(true);
    const presupuesto  = parseFloat(rcPresupuesto)||0;
    const mesesHist    = parseInt(rcMesesHistorial)||3;
    const mesesProy    = parseInt(rcMesesProyeccion)||1;
    const hoyDate      = new Date();

    // Meses del período actual (últimos N meses)
    const mesesActual = [];
    for(let i=1;i<=mesesHist;i++){
      const d=new Date(hoyDate.getFullYear(),hoyDate.getMonth()-i,1);
      mesesActual.push(d.toISOString().slice(0,7));
    }
    // Mismos meses del año anterior
    const mesesAnterior = mesesActual.map(m=>{
      const [y,mo]=m.split("-");
      return `${parseInt(y)-1}-${mo}`;
    });
    const todosMeses = [...mesesActual,...mesesAnterior];

    // Ventas por producto en esos meses (agrupado por nombre, ya que venta_items no tiene producto_id)
    const ventasPorNombre = {};
    ventas.forEach(v=>{
      const mes = v.fecha?.slice(0,7);
      if(!todosMeses.includes(mes)) return;
      (v.items||[]).forEach(it=>{
        const key = (it.nombre||"").trim().toLowerCase();
        if(!key) return;
        if(!ventasPorNombre[key]) ventasPorNombre[key]={cant:0,gan:0,mesesConVenta:new Set()};
        ventasPorNombre[key].cant+=(it.cantidad||0);
        const ganItem = (it.precio-(it.costo||0))*(it.cantidad||0);
        ventasPorNombre[key].gan+=ganItem;
        ventasPorNombre[key].mesesConVenta.add(mes);
      });
    });

    // Calcular score y cantidad proyectada por producto
    const lineas = [];

    productos.filter(p=>p.activo&&p.costo>0).forEach(p=>{
      const key = (p.nombre||"").trim().toLowerCase();
      const hist = ventasPorNombre[key];
      if(!hist||hist.cant===0) return; // excluir sin historial
      if(rcProveedor!=="Todos"&&(p.proveedor||"")!==rcProveedor) return;

      // Promedio mensual de ventas en el período analizado
      const mesesConVenta = hist.mesesConVenta.size;
      const promMensual   = hist.cant / Math.max(mesesConVenta,1);

      // Cantidad proyectada para N meses
      const cantProyectada = Math.ceil(promMensual * mesesProy);

      // Cantidad a pedir = proyectada - stock actual (si stock cubre, pedir 0)
      const cantAPedir = Math.max(0, cantProyectada - (p.stock||0));
      if(cantAPedir===0) return; // stock actual ya cubre la proyección

      // Score de prioridad: combina ganancia por unidad, unidades vendidas y urgencia por stock
      const ganPorUnidad = (p.precio_min||0)-(p.costo||0);
      const urgencia     = p.stock===0?3:p.stock<=(p.stock_min||0)?2:1;
      const score        = (ganPorUnidad * hist.cant * urgencia);

      lineas.push({
        id:        p.id,
        codigo:    p.codigo,
        nombre:    p.nombre,
        proveedor: p.proveedor||"—",
        costo:     p.costo,
        stock:     p.stock||0,
        stock_min: p.stock_min||0,
        promMensual: Math.round(promMensual*10)/10,
        cantProyectada,
        cantAPedir,
        subtotal:  cantAPedir * p.costo,
        ganPorUnidad,
        pctGan:    p.costo>0?Math.round((ganPorUnidad/p.costo)*100):0,
        urgencia,
        score,
        mesesConVenta,
      });
    });

    // Ordenar por score descendente
    lineas.sort((a,b)=>b.score-a.score);

    // Aplicar presupuesto: ir agregando productos hasta agotar el presupuesto
    let presupuestoRestante = presupuesto;
    let totalCompra = 0;
    const lineasFinal = [];

    lineas.forEach(l=>{
      if(presupuesto>0&&presupuestoRestante<=0) return;
      let cant = l.cantAPedir;
      if(presupuesto>0){
        const cantAffordable = Math.floor(presupuestoRestante/l.costo);
        if(cantAffordable===0) return;
        cant = Math.min(cant, cantAffordable);
      }
      const subtotal = cant * l.costo;
      presupuestoRestante -= subtotal;
      totalCompra += subtotal;
      lineasFinal.push({...l, cantAPedir:cant, subtotal});
    });

    // Agrupar por proveedor para el resumen
    const porProveedor = {};
    lineasFinal.forEach(l=>{
      if(!porProveedor[l.proveedor]) porProveedor[l.proveedor]={items:0,subtotal:0};
      porProveedor[l.proveedor].items++;
      porProveedor[l.proveedor].subtotal+=l.subtotal;
    });

    setRcResultado({
      lineas:       lineasFinal,
      totalCompra,
      presupuesto,
      mesesHistorial:  mesesHist,
      mesesProyeccion: mesesProy,
      mesesAnalizados: mesesActual,
      porProveedor,
      generadoEn: new Date().toLocaleString("es-AR"),
    });
    setRcGenerando(false);
  }

  async function exportarRecompraPDF(){
    setRcPdfLoading(true);
    const r = rcResultado;
    const rows = r.lineas.map(l=>`
      <tr>
        <td>${l.codigo}</td>
        <td>${l.nombre}</td>
        <td>${l.proveedor}</td>
        <td style="text-align:center">${l.stock}</td>
        <td style="text-align:center">${l.promMensual}</td>
        <td style="text-align:center;font-weight:700">${l.cantAPedir}</td>
        <td style="text-align:right">${fmt(l.costo)}</td>
        <td style="text-align:right;font-weight:700">${fmt(l.subtotal)}</td>
        <td style="text-align:center;color:${l.pctGan>=60?"#00C48C":l.pctGan>=30?"#FFB800":"#FF4D6A"}">${l.pctGan}%</td>
      </tr>`).join("");

    const provRows = Object.entries(r.porProveedor).sort((a,b)=>b[1].subtotal-a[1].subtotal).map(([prov,d])=>
      `<tr><td>${prov}</td><td style="text-align:center">${d.items} productos</td><td style="text-align:right;font-weight:700">${fmt(d.subtotal)}</td></tr>`
    ).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:20px;}
      h1{font-size:18px;color:#0F1117;margin-bottom:4px;}
      .sub{color:#666;font-size:11px;margin-bottom:20px;}
      .resumen{display:flex;gap:20px;margin-bottom:20px;flex-wrap:wrap;}
      .card{background:#f5f5f5;border-radius:8px;padding:12px 18px;min-width:140px;}
      .card-label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;}
      .card-value{font-size:18px;font-weight:700;color:#0F1117;margin-top:2px;}
      table{width:100%;border-collapse:collapse;margin-bottom:24px;}
      th{background:#0F1117;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;}
      td{padding:7px 10px;border-bottom:1px solid #eee;}
      tr:nth-child(even)td{background:#fafafa;}
      .total-row td{font-weight:700;background:#e8f5e9;font-size:13px;}
      h2{font-size:14px;margin:16px 0 8px;}
      .footer{margin-top:20px;font-size:10px;color:#aaa;text-align:center;}
    </style></head><body>
    <h1>🛒 Reporte de Compra Inteligente — Pensok</h1>
    <div class="sub">Generado el ${r.generadoEn} · Historial: ${r.mesesHistorial} meses + mismo período año anterior · Proyección: ${r.mesesProyeccion} mes${r.mesesProyeccion>1?"es":""}</div>
    <div class="resumen">
      <div class="card"><div class="card-label">Total a invertir</div><div class="card-value">${fmt(r.totalCompra)}</div></div>
      <div class="card"><div class="card-label">Productos</div><div class="card-value">${r.lineas.length}</div></div>
      <div class="card"><div class="card-label">Presupuesto</div><div class="card-value">${r.presupuesto>0?fmt(r.presupuesto):"Sin límite"}</div></div>
      <div class="card"><div class="card-label">Proveedores</div><div class="card-value">${Object.keys(r.porProveedor).length}</div></div>
    </div>
    <h2>Detalle por producto</h2>
    <table>
      <thead><tr><th>Código</th><th>Producto</th><th>Proveedor</th><th>Stock</th><th>Prom/mes</th><th>Pedir</th><th>Costo unit.</th><th>Subtotal</th><th>% Gan</th></tr></thead>
      <tbody>${rows}
        <tr class="total-row"><td colspan="7" style="text-align:right">TOTAL</td><td>${fmt(r.totalCompra)}</td><td></td></tr>
      </tbody>
    </table>
    <h2>Resumen por proveedor</h2>
    <table><thead><tr><th>Proveedor</th><th>Items</th><th>Subtotal</th></tr></thead>
    <tbody>${provRows}</tbody></table>
    <div class="footer">Pensok · Reporte generado automáticamente basado en historial de ventas</div>
    </body></html>`;

    const blob = new Blob([html],{type:"text/html"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href=url; a.download=`recompra-pensok-${new Date().toISOString().slice(0,10)}.html`;
    a.click(); URL.revokeObjectURL(url);
    setRcPdfLoading(false);
  }

  return(<>
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
            <Fi value={filtroE}     onChange={setFE}     options={["Todos","OK","Bajo stock","Agotados","Inactivos"]}/>
          </div>
          <div style={{paddingBottom:1,display:"flex",gap:8,flexWrap:"wrap"}}>
            {(busqueda||filtroC!=="Todas"||filtroProv!=="Todos"||filtroMarca!=="Todas"||filtroE!=="Todos")&&(
              <Btn variant="ghost" small onClick={()=>{setB("");setFC("Todas");setFPr("Todos");setFMarca("Todas");setFE("Todos");}}>✕ Limpiar filtros</Btn>
            )}
            <Btn variant="secondary" onClick={()=>setModalLista(true)}>📄 Lista de precios</Btn>
            {esAdmin&&localKey==="pilar"&&<Btn variant="secondary" disabled={sincronizando} onClick={sincronizarConCamanio}>{sincronizando?"Sincronizando...":"🔄 Sincronizar con Caamaño"}</Btn>}
            {esAdmin&&<Btn variant="secondary" onClick={()=>{setRcResultado(null);setModalRecompra(true);}}>🛒 Reporte de compra</Btn>}
            {esAdmin&&localKey==="pilar"&&<Btn onClick={abrirNuevo}>+ Nuevo producto</Btn>}
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
                  {label:"Gan. Min",  col:"gan_min",  soloAdmin:true},
                  {label:"Gan. May",  col:"gan_may",  soloAdmin:true},
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
                    {esAdmin&&(()=>{
                      const pctMin=p.costo>0?Math.round(((p.precio_min-(p.costo||0))/p.costo)*100):0;
                      const pctMay=p.costo>0?Math.round(((p.precio_may-(p.costo||0))/p.costo)*100):0;
                      const colMin=pctMin>=60?G.verde:pctMin>=30?G.amarillo:G.rojo;
                      const colMay=pctMay>=30?G.verde:pctMay>=15?G.amarillo:G.rojo;
                      return(<>
                        <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",color:colMin,fontWeight:600}}>
                          {pctMin}%
                        </td>
                        <td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",whiteSpace:"nowrap",color:colMay,fontWeight:600}}>
                          {pctMay}%
                        </td>
                      </>);
                    })()}
                    {esAdmin&&<td style={{padding:"9px 12px",fontFamily:"DM Mono,monospace",color:G.verde,whiteSpace:"nowrap"}}>{fmtNum(p.vendidos)}</td>}
                    <td style={{padding:"9px 12px",whiteSpace:"nowrap"}}><Badge color={colorE[e]}>{labelE[e]}</Badge></td>
                    {esAdmin&&localKey==="pilar"&&<td style={{padding:"9px 12px",display:"flex",gap:6}}><Btn small variant="ghost" onClick={()=>abrirEditar(p)}>Editar</Btn><Btn small variant={p.activo?"secondary":"outline"} onClick={()=>onGuardar({activo:!p.activo},p.id)}>{p.activo?"Desactivar":"Activar"}</Btn><Btn small variant="danger" onClick={()=>setConfirmarElimProd(p)}>Eliminar</Btn></td>}
                    {esAdmin&&localKey!=="pilar"&&<td style={{padding:"9px 12px"}}><span style={{fontSize:11,color:G.textoSec,fontStyle:"italic"}}>Gestionado desde Pilar</span></td>}
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
          footer={<><Btn variant="secondary" onClick={()=>setModalLista(false)}>Cancelar</Btn><Btn disabled={generando} onClick={()=>{
              let base=productos.filter(p=>p.activo);
              if(catsFiltro.length>0) base=base.filter(p=>catsFiltro.includes(p.categoria));
              if(pdfProv!=="Todos") base=base.filter(p=>p.proveedor===pdfProv);
              if(pdfMarca!=="Todas") base=base.filter(p=>p.marca===pdfMarca);
              if(pdfEstado==="OK") base=base.filter(p=>estadoStock(p)==="ok");
              else if(pdfEstado==="Bajo stock") base=base.filter(p=>estadoStock(p)==="bajo");
              else if(pdfEstado==="Agotados") base=base.filter(p=>estadoStock(p)==="agotado");
              generarListaPDF(tipoLista,base,{prov:pdfProv,marca:pdfMarca,cats:catsFiltro});
            }}>{generando?"Generando...":"📥 Descargar PDF"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Tipo de lista */}
            <div>
              <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:8,textTransform:"uppercase",letterSpacing:0.5}}>Tipo de lista</div>
              <div style={{display:"flex",gap:10}}>
                {[{k:"minorista",l:"Minorista"},{k:"especial",l:"Especial"},{k:"mayorista",l:"Mayorista"}].map(t=>(
                  <button key={t.k} onClick={()=>setTipoLista(t.k)}
                    style={{flex:1,padding:"10px",borderRadius:10,border:`2px solid ${tipoLista===t.k?G.verde:G.borde}`,background:tipoLista===t.k?"#00C48C18":G.sup2,color:tipoLista===t.k?G.verde:G.textoSec,fontWeight:600,fontSize:12,cursor:"pointer",transition:"all .15s"}}>
                    {t.l}
                  </button>
                ))}
              </div>
            </div>
            {/* Filtros adicionales en cascada */}
            {(()=>{
              const base = productos.filter(p=>p.activo);
              // Proveedor: todas las opciones
              const optsProveedor = ["Todos",...[...new Set(base.map(p=>p.proveedor||"").filter(Boolean))].sort()];
              // Marca: filtrada por proveedor
              const baseConProv = pdfProv!=="Todos" ? base.filter(p=>p.proveedor===pdfProv) : base;
              const optsMarca = ["Todas",...[...new Set(baseConProv.map(p=>p.marca||"").filter(Boolean))].sort()];
              // Categorias: filtradas por proveedor + marca
              const baseConMarca = pdfMarca!=="Todas" ? baseConProv.filter(p=>p.marca===pdfMarca) : baseConProv;
              const catsFiltradas = [...new Set(baseConMarca.map(p=>p.categoria||"").filter(Boolean))].sort();
              return(
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <div>
                      <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Proveedor</div>
                      <Fi value={pdfProv} onChange={v=>{setPdfProv(v);setPdfMarca("Todas");setCatsFiltro([]);}} options={optsProveedor}/>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Marca</div>
                      <Fi value={pdfMarca} onChange={v=>{setPdfMarca(v);setCatsFiltro([]);}} options={optsMarca}/>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:5,textTransform:"uppercase",letterSpacing:0.5}}>Estado</div>
                      <Fi value={pdfEstado} onChange={setPdfEstado} options={["Todos","OK","Bajo stock","Agotados"]}/>
                    </div>
                  </div>
                  {/* Categorías filtradas en cascada */}
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <div style={{fontSize:11,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Categorías</div>
                      {catsFiltro.length>0&&<button onClick={()=>setCatsFiltro([])} style={{fontSize:11,color:G.textoSec,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Limpiar</button>}
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                      {catsFiltradas.map(cat=>{
                        const sel=catsFiltro.includes(cat);
                        const cant=baseConMarca.filter(p=>p.categoria===cat).length;
                        return(
                          <button key={cat} onClick={()=>setCatsFiltro(prev=>sel?prev.filter(c=>c!==cat):[...prev,cat])}
                            style={{padding:"4px 11px",borderRadius:20,border:`1.5px solid ${sel?G.verde:G.borde}`,background:sel?"#00C48C18":G.sup2,color:sel?G.verde:G.textoSec,fontSize:12,fontWeight:sel?600:400,cursor:"pointer",transition:"all .15s"}}>
                            {cat} <span style={{opacity:.6}}>({cant})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Categorias */}
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div style={{fontSize:11,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Categorías (todas si no seleccionás ninguna)</div>
                {catsFiltro.length>0&&<button onClick={()=>setCatsFiltro([])} style={{fontSize:11,color:G.textoSec,background:"none",border:"none",cursor:"pointer",textDecoration:"underline"}}>Limpiar</button>}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {CATEGORIAS.map(cat=>{
                  const sel=catsFiltro.includes(cat);
                  const cant=productos.filter(p=>p.activo&&p.categoria===cat).length;
                  if(!cant)return null;
                  return(
                    <button key={cat} onClick={()=>setCatsFiltro(prev=>sel?prev.filter(c=>c!==cat):[...prev,cat])}
                      style={{padding:"5px 12px",borderRadius:20,border:`1.5px solid ${sel?G.verde:G.borde}`,background:sel?"#00C48C18":G.sup2,color:sel?G.verde:G.textoSec,fontSize:12,fontWeight:sel?600:400,cursor:"pointer",transition:"all .15s"}}>
                      {cat} <span style={{opacity:.6}}>({cant})</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Resumen */}
            <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",fontSize:12,color:G.textoSec}}>
              Se exportarán <strong style={{color:G.texto}}>
                {(()=>{
                  const base=productos.filter(p=>p.activo);
                  return catsFiltro.length>0?base.filter(p=>catsFiltro.includes(p.categoria)).length:base.length;
                })()}
              </strong> productos · Lista <strong style={{color:G.verde}}>{tipoLista}</strong>
              {catsFiltro.length>0&&<span> · {catsFiltro.length} categoría{catsFiltro.length>1?"s":""}: {catsFiltro.join(", ")}</span>}
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
            {localKey==="camanio"&&(
              <div style={{fontSize:11,color:"#FFB800",background:"#FFB80012",border:"1px solid #FFB80033",borderRadius:7,padding:"7px 12px",marginBottom:4}}>
                ⚠ El costo se gestiona desde Pilar y se replica automáticamente. Para modificarlo, hacelo desde Pilar.
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
              <Fi label={`Costo (${fMoneda})`} value={fCosto} onChange={localKey==="camanio"?()=>{}:setFCosto} type="number" placeholder="0" style={localKey==="camanio"?{opacity:0.5,pointerEvents:"none"}:{}}/>
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
            {editando?(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div>
                  <div style={{fontSize:11,color:G.textoSec,fontWeight:500,textTransform:"uppercase",letterSpacing:0.5,marginBottom:5}}>Stock actual</div>
                  <div style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 11px",fontSize:13,color:G.textoSec}}>{fmtNum(editando.stock||0)}</div>
                  <div style={{fontSize:10,color:G.textoSec,marginTop:4}}>Para sumar/restar stock, hacelo desde Abastecimiento o Control de Stock — así queda registrado el movimiento.</div>
                </div>
                <Fi label="Stock minimo" value={fStockMin} onChange={setFStockMin} type="number" min="0" placeholder="0"/>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Fi label="Stock actual" value={fStock}    onChange={setFStock}    type="number" min="0" placeholder="0"/>
                <Fi label="Stock minimo" value={fStockMin} onChange={setFStockMin} type="number" min="0" placeholder="0"/>
              </div>
            )}
            <Div/>
            {/* Envasado desde un producto a granel */}
            <ST>Envasado desde un producto a granel (opcional)</ST>
            <div style={{fontSize:11,color:G.textoSec,marginTop:-6}}>Para productos que se envasan de a poco desde un vinner/bidón grande (ej. Cloro 5L sale del vinner "Cloro Liquido x Litro"). Al cargar un ingreso de este producto en Abastecimiento, se descuenta automáticamente del producto a granel elegido.</div>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
              <Fi label="Se envasa desde" value={fGranelId} onChange={setFGranelId}
                options={[{value:"",label:"— Ninguno —"},...productos.filter(p=>p.id!==editando?.id).sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(p=>({value:String(p.id),label:p.nombre}))]}/>
              <Fi label="Litros por unidad" value={fConsumoGranel} onChange={setFConsumoGranel} type="number" min="0" placeholder="Ej: 5"/>
            </div>
          </div>
        </Modal>
      )}
      {confirmarElimProd&&(
        <Modal title="Eliminar producto" onClose={()=>setConfirmarElimProd(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElimProd(null)}>Cancelar</Btn><Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElimProd.id);setConfirmarElimProd(null);}}>Si, eliminar</Btn></>}>
          <p style={{color:"var(--texto-sec)",fontSize:13}}>¿Eliminar <strong>{confirmarElimProd.nombre}</strong>? Esta acción no se puede deshacer.</p>
          <p style={{color:"var(--rojo)",fontSize:12,marginTop:8}}>⚠ Si hay ventas registradas con este producto, los datos históricos se van a ver afectados.</p>
        </Modal>
      )}
    </div>
    {/* ── MODAL REPORTE DE COMPRA INTELIGENTE ── */}
    {modalRecompra&&(
      <Modal onClose={()=>setModalRecompra(false)} title="🛒 Reporte de Compra Inteligente" maxWidth={1100}>
        {!rcResultado?(
          <div style={{display:"flex",flexDirection:"column",gap:16,minWidth:340}}>
            <div style={{fontSize:13,color:G.textoSec,lineHeight:1.5}}>
              El sistema analizará las ventas de los últimos N meses + los mismos meses del año anterior para proyectar qué y cuánto comprar.
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Meses de historial" value={rcMesesHistorial} onChange={setRcMesesHistorial} type="number" options={["1","2","3","4","6"]}/>
              <Fi label="Proyección (meses)" value={rcMesesProyeccion} onChange={setRcMesesProyeccion} type="number" options={["1","2","3"]}/>
            </div>
            <Fi label="Proveedor (opcional)" value={rcProveedor} onChange={setRcProveedor} options={["Todos",...provsUnicos.filter(p=>p!=="Todos")]}/>
            <Fi label="Presupuesto disponible (vacío = sin límite)" value={rcPresupuesto} onChange={setRcPresupuesto} type="number" placeholder="Ej: 500000"/>
            {rcPresupuesto&&<div style={{fontSize:11,color:G.textoSec}}>Con presupuesto el sistema priorizará los productos más rentables y urgentes.</div>}
            <Btn full onClick={calcularRecompra} disabled={rcGenerando}>
              {rcGenerando?"Calculando...":"Generar reporte"}
            </Btn>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
              {[
                {l:"Total a invertir",v:fmt(rcResultado.totalCompra),c:G.verde},
                {l:"Productos",v:rcResultado.lineas.length,c:G.texto},
                {l:"Presupuesto",v:rcResultado.presupuesto>0?fmt(rcResultado.presupuesto):"Sin límite",c:G.textoSec},
                {l:"Proveedores",v:Object.keys(rcResultado.porProveedor).length,c:G.texto},
              ].map(x=>(
                <div key={x.l} style={{background:G.sup2,borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>{x.l}</div>
                  <div style={{fontSize:18,fontWeight:700,color:x.c,fontFamily:"DM Mono,monospace",marginTop:2}}>{x.v}</div>
                </div>
              ))}
            </div>
            {Object.keys(rcResultado.porProveedor).length>1&&(
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(rcResultado.porProveedor).sort((a,b)=>b[1].subtotal-a[1].subtotal).map(([prov,d])=>(
                  <div key={prov} style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"8px 14px",fontSize:12}}>
                    <span style={{fontWeight:600}}>{prov}</span>
                    <span style={{color:G.textoSec,marginLeft:8}}>{d.items} prod · </span>
                    <span style={{color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(d.subtotal)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{overflowX:"auto",maxHeight:"65vh",overflowY:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:G.sup2,position:"sticky",top:0}}>
                    {["Código","Producto","Proveedor","Stock","Prom/mes","A pedir","Costo","Subtotal","% Gan","Urgencia"].map(h=>(
                      <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,whiteSpace:"nowrap",borderBottom:`1px solid ${G.borde}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rcResultado.lineas.map((l,i)=>(
                    <tr key={l.id} style={{borderBottom:`1px solid ${G.borde}22`,background:i%2===0?"transparent":G.sup2+"44"}}>
                      <td style={{padding:"7px 10px",fontFamily:"DM Mono,monospace",fontSize:10,color:G.textoSec}}>{l.codigo}</td>
                      <td style={{padding:"7px 10px",fontWeight:500,maxWidth:200}}>{l.nombre}</td>
                      <td style={{padding:"7px 10px",fontSize:11,color:G.textoSec,whiteSpace:"nowrap"}}>{l.proveedor}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:l.stock===0?G.rojo:l.stock<=l.stock_min?G.amarillo:G.texto,fontFamily:"DM Mono,monospace"}}>{l.stock}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:G.textoSec,fontFamily:"DM Mono,monospace"}}>{l.promMensual}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace",fontSize:14}}>{l.cantAPedir}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{fmt(l.costo)}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"DM Mono,monospace",fontWeight:600,whiteSpace:"nowrap"}}>{fmt(l.subtotal)}</td>
                      <td style={{padding:"7px 10px",textAlign:"center",color:l.pctGan>=60?G.verde:l.pctGan>=30?G.amarillo:G.rojo,fontFamily:"DM Mono,monospace"}}>{l.pctGan}%</td>
                      <td style={{padding:"7px 10px",textAlign:"center",fontSize:16}}>{l.urgencia===3?"🔴":l.urgencia===2?"🟡":"🟢"}</td>
                    </tr>
                  ))}
                  <tr style={{borderTop:`2px solid ${G.borde}`,background:G.sup2}}>
                    <td colSpan={7} style={{padding:"8px 10px",textAlign:"right",fontWeight:600,fontSize:12}}>TOTAL</td>
                    <td style={{padding:"8px 10px",textAlign:"right",fontWeight:700,fontFamily:"DM Mono,monospace",color:G.verde,fontSize:14}}>{fmt(rcResultado.totalCompra)}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={()=>setRcResultado(null)}>← Volver a configurar</Btn>
              <Btn onClick={exportarRecompraPDF} disabled={rcPdfLoading}>{rcPdfLoading?"Generando...":"⬇ Exportar HTML/PDF"}</Btn>
            </div>
          </div>
        )}
      </Modal>
    )}
  </>);
}


// ============================================================
// MODULO: TRASPASOS
// ============================================================
function ModuloTraspasos({traspasos,pagosTraspaso,productos,onRegistrar,onPago,totalDeudaCamanio,localKey,toast}){
  const [tab,          setTab]          = useState("historial");
  const [modalNuevo,   setModalNuevo]   = useState(false);
  const [modalPago,    setModalPago]    = useState(null);
  const [detalleTraspaso, setDetalleTraspaso] = useState(null);
  const [busqueda,     setBusqueda]     = useState("");
  const [resultados,   setResultados]   = useState([]);
  const [items,        setItems]        = useState([]);
  const [notas,        setNotas]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [genRemito,    setGenRemito]    = useState(false);
  const [pagoMonto,    setPagoMonto]    = useState("");
  const [pagoMetodo,   setPagoMetodo]   = useState("Transferencia MP");
  const [pagoNotas,    setPagoNotas]    = useState("");
  const [pagoLoading,  setPagoLoading]  = useState(false);

  async function imprimirRemitoTraspaso(t){
    setGenRemito(true);
    if(!window.jspdf){
      await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});
    }
    const {jsPDF} = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210,H=297;
    const oscuro=[80,80,80],gris=[150,150,150],negro=[50,50,50],blanco=[255,255,255];

    // ── HEADER ──
    doc.setFillColor(...oscuro);
    doc.rect(0,0,W,38,'F');
    doc.setTextColor(...blanco);
    doc.setFont('helvetica','bold');
    doc.setFontSize(20);
    doc.text('PENSOK',14,16);
    doc.setFont('helvetica','normal');
    doc.setFontSize(8.5);
    doc.text(LI.razonSocial,14,23);
    doc.text(LI.direccion,14,28);
    doc.text(`CUIT: ${LI.cuit}  ·  Tel: ${LI.telefono}`,14,33);
    doc.setFillColor(130,130,130);
    doc.roundedRect(W-72,8,66,14,2,2,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...blanco);
    doc.text('REMITO DE TRASPASO',W-39,14,{align:'center'});
    doc.setFontSize(7.5);
    doc.text('Pilar → Caamaño',W-39,20,{align:'center'});

    // ── DATOS ──
    let y=52;
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...oscuro);
    doc.text('DATOS DEL TRASPASO',14,y);
    y+=5;
    doc.setDrawColor(...gris);
    doc.setLineWidth(0.3);
    doc.line(14,y,W-14,y);
    y+=6;
    const infoLeft=[['N° Traspaso:',String(t.id)],['Fecha:',t.fecha||''],['Estado:',estadoLabel[t.estado]||t.estado||'']];
    const infoRight=[['Total:',fmt(t.total)],['Pagado:',fmt(t.monto_pagado||0)],['Saldo:',fmt(t.saldo_pendiente||0)]];
    doc.setFontSize(9);
    infoLeft.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],14,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],50,y+i*6);
    });
    infoRight.forEach((row,i)=>{
      doc.setFont('helvetica','normal'); doc.setTextColor(...gris); doc.text(row[0],W/2,y+i*6);
      doc.setFont('helvetica','bold'); doc.setTextColor(...negro); doc.text(row[1],W/2+28,y+i*6);
    });
    y+=26;
    if(t.notas){
      doc.setFont('helvetica','italic'); doc.setFontSize(8.5); doc.setTextColor(...gris);
      doc.text('Notas: '+t.notas,14,y); y+=8;
    }

    // ── TABLA PRODUCTOS ──
    doc.setFillColor(180,180,180);
    doc.rect(14,y,W-28,8,'F');
    doc.setFont('helvetica','bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...blanco);
    doc.text('PRODUCTO',16,y+5.5);
    doc.text('CANT.',W-100,y+5.5,{align:'center'});
    doc.text('COSTO UNIT.',W-65,y+5.5,{align:'center'});
    doc.text('SUBTOTAL',W-16,y+5.5,{align:'right'});
    y+=12;
    let filaPar=false;
    (t.productos||[]).forEach((p,idx)=>{
      if(y>H-70){doc.addPage();y=20;}
      if(filaPar){doc.setFillColor(248,248,248);doc.rect(14,y-6,W-28,8,'F');}
      filaPar=!filaPar;
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...negro);
      const nombre=(p.nombre||'').length>50?(p.nombre||'').substring(0,47)+'...':(p.nombre||'');
      doc.text(nombre,16,y);
      doc.setFont('helvetica','bold');
      doc.setTextColor(100,100,100);
      doc.text(String(p.cantidad||1),W-100,y,{align:'center'});
      doc.text(fmt(p.costo||0),W-65,y,{align:'center'});
      doc.setTextColor(...negro);
      doc.text(fmt(p.subtotal||0),W-16,y,{align:'right'});
      doc.setDrawColor(220,220,220); doc.setLineWidth(0.1);
      doc.line(14,y+2,W-14,y+2);
      y+=8;
    });

    // ── TOTAL ──
    y+=4;
    doc.setFillColor(230,230,230);
    doc.rect(W-80,y-5,66,10,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(...negro);
    doc.text('TOTAL:',W-78,y+1.5);
    doc.text(fmt(t.total),W-16,y+1.5,{align:'right'});
    y+=18;

    // ── FIRMAS ──
    doc.setDrawColor(...gris); doc.setLineWidth(0.3);
    doc.line(14,y,80,y);
    doc.line(W-80,y,W-14,y);
    y+=5;
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...gris);
    doc.text('Entregado por (Pilar)',14,y);
    doc.text('Recibido conforme (Caamaño)',W-80,y);
    y+=5;
    doc.text('Firma y aclaración',14,y);
    doc.text('Firma, aclaración y fecha',W-80,y);

    // ── FOOTER ──
    doc.setFillColor(...oscuro); doc.rect(0,H-14,W,14,'F');
    doc.setFont('helvetica','normal'); doc.setFontSize(7.5); doc.setTextColor(...blanco);
    doc.text(`${LI.razonSocial}  -  CUIT ${LI.cuit}  -  ${LI.direccionCorta}`,14,H-8);
    doc.text(`Traspaso #${t.id}`,W-14,H-8,{align:'right'});

    doc.save(`Remito Traspaso #${t.id} - ${t.fecha||''}.pdf`);
    setGenRemito(false);
  }

  // Buscar productos
  useEffect(()=>{
    if(busqueda.length<2){setResultados([]);return;}
    const q=busqueda.toLowerCase();
    setResultados(productos.filter(p=>p.activo&&p.costo>0&&(p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q))).slice(0,8));
  },[busqueda,productos]);

  function agregarItem(p){
    setItems(prev=>{
      const ex=prev.find(i=>i.id===p.id);
      if(ex) return prev.map(i=>i.id===p.id?{...i,cantidad:i.cantidad+1}:i);
      return [...prev,{id:p.id,codigo:p.codigo,nombre:p.nombre,costo:p.costo,stock:p.stock||0,cantidad:1}];
    });
    setBusqueda(""); setResultados([]);
  }

  function actualizarCantidad(id,val){
    const n=parseInt(val)||0;
    if(n<=0){setItems(prev=>prev.filter(i=>i.id!==id));return;}
    setItems(prev=>prev.map(i=>i.id===id?{...i,cantidad:n}:i));
  }

  const totalTraspaso = items.reduce((s,i)=>s+(i.costo*i.cantidad),0);

  async function guardarTraspaso(){
    if(items.length===0){toast.err("Agregá al menos un producto");return;}
    setLoading(true);
    const ok = await onRegistrar(items,notas);
    if(ok){toast.ok("Traspaso registrado");setModalNuevo(false);setItems([]);setNotas("");}
    else toast.err("Error al registrar traspaso");
    setLoading(false);
  }

  async function guardarPago(){
    const monto=parseFloat(pagoMonto)||0;
    if(!monto||monto<=0){toast.err("Ingresá un monto válido");return;}
    if(monto>modalPago.saldo_pendiente){toast.err("El monto supera el saldo pendiente");return;}
    setPagoLoading(true);
    const ok=await onPago(modalPago.id,monto,pagoMetodo,pagoNotas);
    if(ok){toast.ok("Pago registrado");setModalPago(null);setPagoMonto("");setPagoNotas("");}
    else toast.err("Error al registrar pago");
    setPagoLoading(false);
  }

  const estadoColor={pendiente:G.rojo,pagado_parcial:G.amarillo,pagado:G.verde};
  const estadoLabel={pendiente:"Pendiente",pagado_parcial:"Parcial",pagado:"Pagado"};
  const totalPendiente=traspasos.filter(t=>t.estado!=="pagado").reduce((s,t)=>s+(t.saldo_pendiente||0),0);

  return(<>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Métricas */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <MetricCard label="Saldo pendiente Caamaño" value={fmt(totalPendiente)} color={totalPendiente>0?G.rojo:G.verde} sub={`${traspasos.filter(t=>t.estado!=="pagado").length} traspasos sin saldar`}/>
        <MetricCard label="Total traspasos" value={fmt(traspasos.reduce((s,t)=>s+(t.total||0),0))} color={G.azul} sub={`${traspasos.length} operaciones`}/>
        <MetricCard label="Total cobrado" value={fmt(traspasos.reduce((s,t)=>s+(t.monto_pagado||0),0))} color={G.verde} sub="Pagos recibidos de Caamaño"/>
      </div>

      {/* Tabs + botón nuevo */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:6}}>
          {["historial","pagos"].map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:"6px 16px",borderRadius:8,border:`1px solid ${tab===t?G.verde:G.borde}`,background:tab===t?G.verde+"22":"transparent",color:tab===t?G.verde:G.textoSec,cursor:"pointer",fontSize:13,fontFamily:"DM Sans,sans-serif",fontWeight:tab===t?600:400}}>
              {t==="historial"?"Historial":"Pagos recibidos"}
            </button>
          ))}
        </div>
        {localKey==="pilar"&&<Btn onClick={()=>setModalNuevo(true)}>+ Nuevo traspaso</Btn>}
      </div>

      {/* Historial de traspasos */}
      {tab==="historial"&&(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${G.borde}`}}>
                {["Fecha","Productos","Total","Pagado","Saldo","Estado",""].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {traspasos.length===0&&<tr><td colSpan={7} style={{padding:40,textAlign:"center",color:G.textoSec}}>No hay traspasos registrados</td></tr>}
              {traspasos.map(t=>(
                <tr key={t.id} onClick={()=>setDetalleTraspaso(t)} style={{borderBottom:`1px solid ${G.borde}22`,cursor:"pointer",transition:"background .12s"}} onMouseEnter={e=>e.currentTarget.style.background=G.sup2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontSize:11,color:G.textoSec}}>{t.fecha}</td>
                  <td style={{padding:"10px 14px"}}>
                    <div style={{fontSize:12}}>{(t.productos||[]).length} producto{(t.productos||[]).length!==1?"s":""}</div>
                    <div style={{fontSize:10,color:G.textoSec}}>{(t.productos||[]).slice(0,2).map(p=>p.nombre).join(", ")}{(t.productos||[]).length>2?"...":""}</div>
                  </td>
                  <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(t.total)}</td>
                  <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",color:G.verde}}>{fmt(t.monto_pagado||0)}</td>
                  <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",color:t.saldo_pendiente>0?G.rojo:G.verde,fontWeight:600}}>{fmt(t.saldo_pendiente||0)}</td>
                  <td style={{padding:"10px 14px"}}>
                    <span style={{background:estadoColor[t.estado]+"22",color:estadoColor[t.estado],border:`1px solid ${estadoColor[t.estado]}44`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                      {estadoLabel[t.estado]}
                    </span>
                  </td>
                  <td style={{padding:"10px 14px"}} onClick={e=>e.stopPropagation()}>
                    {localKey==="pilar"&&t.estado!=="pagado"&&(
                      <Btn small onClick={()=>{setModalPago(t);setPagoMonto(String(t.saldo_pendiente));}}>Registrar pago</Btn>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Historial de pagos */}
      {tab==="pagos"&&(
        <Card style={{padding:0,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${G.borde}`}}>
                {["Fecha","Traspaso","Monto","Método","Notas"].map(h=>(
                  <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagosTraspaso.length===0&&<tr><td colSpan={5} style={{padding:40,textAlign:"center",color:G.textoSec}}>No hay pagos registrados</td></tr>}
              {pagosTraspaso.map(p=>{
                const tr=traspasos.find(t=>t.id===p.traspaso_id);
                return(
                  <tr key={p.id} style={{borderBottom:`1px solid ${G.borde}22`}}>
                    <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontSize:11,color:G.textoSec}}>{p.fecha}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:G.textoSec}}>{tr?`Traspaso del ${tr.fecha}`:"—"}</td>
                    <td style={{padding:"10px 14px",fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde}}>{fmt(p.monto)}</td>
                    <td style={{padding:"10px 14px",fontSize:12}}>{p.metodo_pago}</td>
                    <td style={{padding:"10px 14px",fontSize:12,color:G.textoSec}}>{p.notas||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>

    {/* Modal Nuevo Traspaso */}
    {modalNuevo&&(
      <Modal title="Nuevo Traspaso → Caamaño" onClose={()=>{setModalNuevo(false);setItems([]);setNotas("");}} maxWidth={680}
        footer={<><Btn variant="secondary" onClick={()=>{setModalNuevo(false);setItems([]);setNotas("");}}>Cancelar</Btn><Btn disabled={items.length===0||loading} onClick={guardarTraspaso}>{loading?"Registrando...":"Confirmar traspaso"}</Btn></>}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontSize:12,color:G.textoSec,background:G.sup2,borderRadius:8,padding:"8px 14px"}}>
            El stock se descontará de Pilar y se sumará en Caamaño automáticamente. El costo es al precio de costo actual de cada producto.
          </div>
          {/* Buscador */}
          <div style={{position:"relative"}}>
            <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar producto por nombre o código..."
              style={{width:"100%",background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"9px 13px",color:G.texto,fontSize:13,outline:"none",fontFamily:"DM Sans,sans-serif"}}/>
            {resultados.length>0&&(
              <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:8,zIndex:50,maxHeight:200,overflowY:"auto"}}>
                {resultados.map(p=>(
                  <div key={p.id} onClick={()=>agregarItem(p)}
                    style={{padding:"9px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",fontSize:13,borderBottom:`1px solid ${G.borde}22`}}
                    onMouseEnter={e=>e.currentTarget.style.background=G.sup2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span>{p.nombre}</span>
                    <span style={{color:G.textoSec,fontFamily:"DM Mono,monospace",fontSize:11}}>Stock: {p.stock||0} · {fmt(p.costo)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Items */}
          {items.length>0&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {items.map(i=>(
                <div key={i.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 110px 32px",gap:8,alignItems:"center",background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:12}}>
                    <div style={{fontWeight:500}}>{i.nombre}</div>
                    <div style={{color:G.textoSec,fontSize:10}}>Stock disponible: {i.stock} · Costo: {fmt(i.costo)}</div>
                  </div>
                  <input type="number" value={i.cantidad} min={1} max={i.stock}
                    onChange={e=>actualizarCantidad(i.id,e.target.value)}
                    style={{background:G.sup,border:`1px solid ${G.borde}`,borderRadius:7,padding:"6px 8px",color:G.texto,fontSize:13,outline:"none",textAlign:"center",width:"100%",fontFamily:"DM Mono,monospace"}}/>
                  <div style={{fontFamily:"DM Mono,monospace",fontSize:12,textAlign:"right",color:G.verde}}>{fmt(i.costo*i.cantidad)}</div>
                  <button onClick={()=>setItems(prev=>prev.filter(x=>x.id!==i.id))}
                    style={{background:"#FF4D6A18",border:"1px solid #FF4D6A33",borderRadius:7,color:G.rojo,cursor:"pointer",fontSize:14,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 12px",background:G.sup2,borderRadius:8,fontFamily:"DM Mono,monospace"}}>
                <span style={{fontSize:12,color:G.textoSec}}>Total traspaso</span>
                <span style={{fontWeight:700,color:G.verde,fontSize:16}}>{fmt(totalTraspaso)}</span>
              </div>
            </div>
          )}
          <Fi label="Notas (opcional)" value={notas} onChange={setNotas} placeholder="Ej: Pedido urgente de cloro..."/>
        </div>
      </Modal>
    )}

    {/* Modal Registrar Pago */}
    {modalPago&&(
      <Modal title={`Registrar pago — Traspaso del ${modalPago.fecha}`} onClose={()=>{setModalPago(null);setPagoMonto("");setPagoNotas("");}} maxWidth={440}
        footer={<><Btn variant="secondary" onClick={()=>{setModalPago(null);setPagoMonto("");setPagoNotas("");}}>Cancelar</Btn><Btn disabled={pagoLoading||!pagoMonto} onClick={guardarPago}>{pagoLoading?"Registrando...":"Confirmar pago"}</Btn></>}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:G.sup2,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
            <span style={{fontSize:12,color:G.textoSec}}>Saldo pendiente</span>
            <span style={{fontFamily:"DM Mono,monospace",fontWeight:700,color:G.rojo}}>{fmt(modalPago.saldo_pendiente)}</span>
          </div>
          <Fi label="Monto a registrar" value={pagoMonto} onChange={setPagoMonto} type="number" placeholder="0"/>
          <Fi label="Método de pago" value={pagoMetodo} onChange={setPagoMetodo} options={["Efectivo","Transferencia MP","Transferencia Banco","Debito MP","Debito Banco"]}/>
          <Fi label="Notas (opcional)" value={pagoNotas} onChange={setPagoNotas} placeholder="Referencia de transferencia..."/>
        </div>
      </Modal>
    )}
    {detalleTraspaso&&(
      <Modal title={`Traspaso del ${detalleTraspaso.fecha}`} onClose={()=>setDetalleTraspaso(null)} maxWidth={560}
        footer={<div style={{display:"flex",gap:8}}><Btn variant="secondary" disabled={genRemito} onClick={()=>imprimirRemitoTraspaso(detalleTraspaso)}>{genRemito?"Generando...":"🖨 Remito PDF"}</Btn><Btn variant="secondary" onClick={()=>setDetalleTraspaso(null)}>Cerrar</Btn></div>}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <div style={{flex:"1 1 100px",background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Total</div>
              <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:15}}>{fmt(detalleTraspaso.total)}</div>
            </div>
            <div style={{flex:"1 1 100px",background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Pagado</div>
              <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:15,color:G.verde}}>{fmt(detalleTraspaso.monto_pagado||0)}</div>
            </div>
            <div style={{flex:"1 1 100px",background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Saldo</div>
              <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:15,color:detalleTraspaso.saldo_pendiente>0?G.rojo:G.verde}}>{fmt(detalleTraspaso.saldo_pendiente||0)}</div>
            </div>
            <div style={{flex:"1 1 100px",background:G.sup2,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Estado</div>
              <div style={{marginTop:2}}>
                <span style={{background:estadoColor[detalleTraspaso.estado]+"22",color:estadoColor[detalleTraspaso.estado],border:`1px solid ${estadoColor[detalleTraspaso.estado]}44`,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600}}>
                  {estadoLabel[detalleTraspaso.estado]}
                </span>
              </div>
            </div>
          </div>

          {detalleTraspaso.notas&&(
            <div style={{background:`${G.amarillo}11`,border:`1px solid ${G.amarillo}33`,borderRadius:8,padding:"8px 12px"}}>
              <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>Notas</div>
              <div style={{fontSize:13}}>{detalleTraspaso.notas}</div>
            </div>
          )}

          <div>
            <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>
              Productos ({(detalleTraspaso.productos||[]).length})
            </div>
            <div style={{background:G.sup2,borderRadius:8,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${G.borde}`}}>
                    <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Código</th>
                    <th style={{padding:"8px 12px",textAlign:"left",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Producto</th>
                    <th style={{padding:"8px 12px",textAlign:"right",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Cant.</th>
                    <th style={{padding:"8px 12px",textAlign:"right",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Costo unit.</th>
                    <th style={{padding:"8px 12px",textAlign:"right",fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5}}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(detalleTraspaso.productos||[]).map((p,idx)=>(
                    <tr key={idx} style={{borderBottom:idx<(detalleTraspaso.productos.length-1)?`1px solid ${G.borde}55`:"none"}}>
                      <td style={{padding:"8px 12px",fontFamily:"DM Mono,monospace",fontSize:11,color:G.textoSec}}>{p.codigo||"—"}</td>
                      <td style={{padding:"8px 12px"}}>{p.nombre}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"DM Mono,monospace"}}>{p.cantidad}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"DM Mono,monospace",color:G.textoSec}}>{fmt(p.costo)}</td>
                      <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(p.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:`2px solid ${G.borde}`}}>
                    <td colSpan={4} style={{padding:"8px 12px",fontWeight:600,textAlign:"right"}}>Total</td>
                    <td style={{padding:"8px 12px",textAlign:"right",fontFamily:"DM Mono,monospace",fontWeight:700}}>{fmt(detalleTraspaso.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </Modal>
    )}
  </>);
}
function ModuloAbastecimiento({productos,abastecimiento,egresos=[],onRegistrar,onRegistrarLote,vendedores,proveedores,onEditar,onEliminar}){
  const [vista,setV]=useState("historial");
  const [prodBusq,setPB]=useState("");
  const [items,setItems]=useState([]); // {productoId,nombre,cantidad,costoUnit}
  const [proveedor,setProv]=useState(""); const [metodo,setMet]=useState(METODOS_PAGO[0]);
  const [resp,setResp]=useState(""); const [notas,setNotas]=useState("");
  const [loading,setLoading]=useState(false); const [ok,setOk]=useState(false);
  const [editando,setEditando]=useState(null);
  const [eQty,setEQty]=useState(""); const [eCosto,setECosto]=useState("");
  const [eProv,setEProv]=useState(""); const [eMetodo,setEMetodo]=useState(METODOS_PAGO[0]);
  const [eResp,setEResp]=useState(""); const [eNotas,setENotas]=useState("");
  const [eLoading,setELoading]=useState(false);
  const [confirmarElim,setConfirmarElim]=useState(null);
  const [histBusq,setHistBusq]=useState("");

  const historialFiltrado=useMemo(()=>{
    if(!histBusq.trim())return abastecimiento;
    const q=histBusq.toLowerCase();
    return abastecimiento.filter(a=>
      (a.nombre||"").toLowerCase().includes(q)||
      (a.proveedor||"").toLowerCase().includes(q)||
      (a.responsable||"").toLowerCase().includes(q)||
      (a.notas||"").toLowerCase().includes(q)||
      (a.metodo_pago||"").toLowerCase().includes(q)
    );
  },[abastecimiento,histBusq]);

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
  const [fechaAbast, setFechaAbast]=useState(hoy());
  const [egresoLink, setEgresoLink]=useState("");
  const valido=items.length>0;
  const totalLote=items.reduce((s,i)=>s+i.cantidad*i.costoUnit,0);

  function agregarItem(p){
    setItems(prev=>{
      const ex=prev.find(i=>i.productoId===p.id);
      if(ex) return prev.map(i=>i.productoId===p.id?{...i,cantidad:i.cantidad+1}:i);
      return [...prev,{productoId:p.id,nombre:p.nombre,cantidad:1,costoUnit:p.costo||0}];
    });
    if(!proveedor) setProv(p.proveedor||"");
    setPB("");
  }

  // Compras de productos pendientes de cargar, para el desplegable "a qué compra corresponde".
  // Prioriza las del mismo proveedor elegido, pero muestra todas las recientes por si acaso.
  const comprasPendientes = useMemo(()=>{
    const candidatas = egresos.filter(e=>e.es_compra_productos);
    const delProveedor = proveedor ? candidatas.filter(e=>e.proveedor===proveedor) : [];
    const resto = candidatas.filter(e=>!delProveedor.includes(e));
    return [...delProveedor,...resto]
      .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha))
      .slice(0,25);
  },[egresos,proveedor]);

  async function registrar(){
    if(!valido)return;setLoading(true);
    const filas = items.map(i=>({
      fecha:fechaAbast||hoy(), producto_id:i.productoId, nombre:i.nombre,
      cantidad:i.cantidad, costo_unit:i.costoUnit,
      proveedor, metodo_pago:metodo||METODOS_PAGO[0], responsable:resp||"Pensok",
      notas, egreso_id:egresoLink?parseInt(egresoLink):null,
    }));
    await onRegistrarLote(filas);
    setLoading(false);setOk(true);
    setTimeout(()=>{setItems([]);setPB("");setNotas("");setOk(false);setV("historial");setFechaAbast(hoy());setEgresoLink("");},2000);
  }

  if(ok)return(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:300,gap:14}}><div style={{fontSize:44,color:G.verde}}>✓</div><div style={{fontSize:20,fontWeight:600,color:G.verde}}>{items.length>1?`${items.length} productos registrados`:"Ingreso registrado"}</div></div>);

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
            <ST>Productos</ST>
            <div style={{position:"relative"}}>
              <input value={prodBusq} onChange={e=>setPB(e.target.value)} placeholder="Buscar producto para agregar..."
                style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"9px 12px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
              {prodFilt.length>0&&(
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,marginTop:4,zIndex:10,maxHeight:200,overflowY:"auto"}}>
                  {prodFilt.map(p=>(
                    <div key={p.id} onClick={()=>agregarItem(p)} style={{padding:"9px 14px",cursor:"pointer",borderBottom:`1px solid ${G.borde}22`}} onMouseEnter={e=>e.currentTarget.style.background=G.borde} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{fontSize:13,fontWeight:500}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:G.textoSec}}>Stock: {p.stock} · Ultimo costo: {p.moneda==="USD"?fmtUSD(p.costo):fmt(p.costo)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {items.length>0&&(
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
                {items.map(it=>{
                  const prod = productos.find(p=>p.id===it.productoId);
                  return(
                    <div key={it.productoId} style={{display:"flex",alignItems:"center",gap:8,background:G.sup2,borderRadius:8,padding:"8px 10px"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nombre}</div>
                        {prod&&<div style={{fontSize:11,color:G.textoSec}}>Stock actual: {prod.stock} → {prod.stock+it.cantidad}</div>}
                      </div>
                      <input type="number" value={it.cantidad} min="1" onChange={e=>{const n=parseInt(e.target.value)||1;setItems(prev=>prev.map(i=>i.productoId===it.productoId?{...i,cantidad:Math.max(1,n)}:i));}}
                        style={{width:56,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"6px 8px",color:G.texto,fontSize:12,textAlign:"center"}}/>
                      <input type="number" value={it.costoUnit} onChange={e=>setItems(prev=>prev.map(i=>i.productoId===it.productoId?{...i,costoUnit:parseFloat(e.target.value)||0}:i))}
                        style={{width:90,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"6px 8px",color:G.texto,fontSize:12,textAlign:"right"}} title="Costo unitario"/>
                      <Btn small variant="danger" onClick={()=>setItems(prev=>prev.filter(i=>i.productoId!==it.productoId))}>✕</Btn>
                    </div>
                  );
                })}
              </div>
            )}
            <Div/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Proveedor"   value={proveedor} onChange={setProv} options={(proveedores||[]).filter(p=>p.activo).map(p=>p.nombre)}/>
              <Fi label="Responsable" value={resp}      onChange={setResp} options={(vendedores||[]).map(v=>v.nombre)}/>
              <Fi label="Fecha del ingreso" value={fechaAbast} onChange={setFechaAbast} type="date"/>
            </div>
            <div style={{marginTop:12}}>
              <Fi label="¿A qué compra corresponde? (opcional)" value={egresoLink} onChange={setEgresoLink}
                options={[{value:"",label:"— No corresponde a ninguna / no lo sé todavía —"},...comprasPendientes.map(e=>({value:String(e.id),label:`${e.proveedor||"(sin proveedor)"} — ${fmt(e.monto)} — ${e.fecha}`}))]}/>
            </div>
            <div style={{marginTop:12}}><Fi label="Notas" value={notas} onChange={setNotas} placeholder="Ej: descuento por volumen"/></div>
          </Card>
          <Card>
            <ST>Resumen</ST>
            <div style={{display:"flex",flexDirection:"column",gap:9,fontSize:13}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Productos</span><span style={{fontFamily:"'DM Mono',monospace"}}>{items.length}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Unidades</span><span style={{fontFamily:"'DM Mono',monospace"}}>{items.reduce((s,i)=>s+i.cantidad,0)}</span></div>
              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{color:G.textoSec}}>Total</span><span style={{color:G.verde,fontFamily:"'DM Mono',monospace",fontWeight:600}}>{fmt(totalLote)}</span></div>
            </div>
            <Btn full disabled={!valido||loading} onClick={registrar} style={{marginTop:16,padding:"11px 0",fontSize:14}}>
              {loading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:`Registrar ${items.length>1?`${items.length} productos`:"ingreso"} →`}
            </Btn>
          </Card>
        </div>
      )}
      {vista==="historial"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{position:"relative",marginBottom:4}}>
            <input
              value={histBusq}
              onChange={e=>setHistBusq(e.target.value)}
              placeholder="🔍 Buscar por producto, proveedor, responsable o nota..."
              style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:8,padding:"10px 36px 10px 14px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}
            />
            {histBusq&&(
              <button onClick={()=>setHistBusq("")} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:G.textoSec,cursor:"pointer",fontSize:14}}>✕</button>
            )}
          </div>
          {histBusq&&<div style={{fontSize:12,color:G.textoSec,padding:"0 4px"}}>{historialFiltrado.length} resultado{historialFiltrado.length!==1?"s":""}</div>}
          {historialFiltrado.map(a=>{
            const esTraspaso = (a.proveedor||"").startsWith("Traspaso");
            const esSalida = (a.cantidad||0) < 0;
            return (
            <Card key={a.id} style={{padding:"12px 18px",border:esTraspaso?`1px solid ${G.azul}33`:undefined}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}}>
                    {esTraspaso&&<span title={esSalida?"Salida por traspaso":"Ingreso por traspaso"}>{esSalida?"↗️":"↘️"}</span>}
                    {a.nombre}
                  </div>
                  <div style={{fontSize:12,color:esTraspaso?G.azul:G.textoSec,marginTop:2}}>{a.fecha} · {a.proveedor} · {a.metodo_pago} · {a.responsable}</div>
                  {a.notas&&<div style={{fontSize:11,color:G.textoSec,marginTop:2,fontStyle:"italic"}}>{a.notas}</div>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:17,fontWeight:700,color:esSalida?G.rojo:(esTraspaso?G.azul:G.naranja),fontFamily:"'DM Mono',monospace"}}>{esSalida?"-":""}{fmt(Math.abs((a.cantidad||0)*(a.costo_unit||0)))}</div>
                    <div style={{fontSize:11,color:G.textoSec}}>{esSalida?"-":""}{fmtNum(Math.abs(a.cantidad))} u. × {fmt(a.costo_unit)}</div>
                  </div>

                </div>
              </div>
            </Card>
            );
          })}
          {abastecimiento.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin registros</div>}
          {abastecimiento.length>0&&historialFiltrado.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin resultados para "{histBusq}"</div>}
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

const BOLSILLOS = [
  {key:"caja_chica", label:"Caja Chica"},
  {key:"mp",         label:"Mercado Pago"},
  {key:"banco",      label:"Banco"},
  {key:"ahorro",     label:"Ahorro"},
];

function ModuloCaja({ventas,egresos,pagosEgreso=[],descuentosEgreso=[],devoluciones=[],toast}){
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
  const [pagosDia,    setPagosDia]   = useState([]);
  const [config,      setConfig]     = useState(null); // {fecha_inicio, saldo_caja_chica, saldo_mp, saldo_banco, saldo_ahorro}
  const [configLoading, setConfigLoading] = useState(true);

  // Saldos reales ingresados al momento del cierre actual
  const [cajChica,    setCajChica]   = useState("");
  const [saldoMP,     setSaldoMP]    = useState("");
  const [saldoBanco,  setSaldoBanco] = useState("");
  const [saldoAhorro, setSaldoAhorro]= useState("");

  // Campos del formulario de configuración inicial (primera vez)
  const [cfgFecha,    setCfgFecha]    = useState(hoy());
  const [cfgCaja,     setCfgCaja]     = useState("");
  const [cfgMP,       setCfgMP]       = useState("");
  const [cfgBanco,    setCfgBanco]    = useState("");
  const [cfgAhorro,   setCfgAhorro]   = useState("");
  const [cfgLoading,  setCfgLoading]  = useState(false);

  // ── Libro de movimientos ──
  const [lmDesde,   setLmDesde]   = useState("");
  const [lmHasta,   setLmHasta]   = useState("");
  const [lmBilletera, setLmBilletera] = useState("Todas");
  const [lmTipo,    setLmTipo]    = useState("Todos");
  const [lmBusq,    setLmBusq]    = useState("");

  const ahora = new Date();
  const fechaAhora = ahora.toISOString().slice(0,10);
  // Formatea un timestamp ISO (created_at) a "DD/MM/AAAA HH:MM" hora local
  const fmtFechaHora = (iso)=>{
    if(!iso) return "";
    const d = new Date(iso);
    if(isNaN(d.getTime())) return "";
    return d.toLocaleString("es-AR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
  };

  useEffect(()=>{ cargarTodo(); },[]);

  async function cargarTodo(){
    setConfigLoading(true);
    const[{data:c},{data:m},{data:pd},{data:pt},{data:cfg}]=await Promise.all([
      supabase.from("cierres_caja").select("*").order("created_at",{ascending:false}).limit(60),
      supabase.from("movimientos_caja").select("*").order("fecha",{ascending:false}).limit(500),
      supabase.from("pagos_deuda").select("*").order("fecha",{ascending:false}).limit(1000),
      localKey==="pilar" ? supabase.from("pagos_traspaso").select("*").order("fecha",{ascending:false}).limit(500) : {data:[]},
      supabase.from("caja_config").select("*").limit(1).maybeSingle(),
    ]);
    setCierres(c||[]);
    setMovimientos(m||[]);
    setPagosDia([...(pd||[]),...(pt||[]).map(p=>({...p,tipo:"ingreso",metodo_pago:p.metodo_pago||"Transferencia MP"}))]);
    setConfig(cfg||null);
    setConfigLoading(false);
  }

  async function guardarConfigInicial(){
    setCfgLoading(true);
    const payload = {
      fecha_inicio: cfgFecha,
      saldo_caja_chica: parseFloat(cfgCaja)||0,
      saldo_mp: parseFloat(cfgMP)||0,
      saldo_banco: parseFloat(cfgBanco)||0,
      saldo_ahorro: parseFloat(cfgAhorro)||0,
    };
    const {error} = await supabase.from("caja_config").insert(payload);
    if(error){ toast.err("Error al guardar configuración: "+error.message); setCfgLoading(false); return; }
    toast.ok("Configuración guardada — el cierre de caja ya está activo");
    setCfgLoading(false);
    await cargarTodo();
  }

  // ── Si todavía no hay configuración, mostrar pantalla de setup ──
  if(configLoading){
    return <div style={{textAlign:"center",padding:60,color:G.textoSec}}>Cargando...</div>;
  }
  if(!config){
    return (
      <div style={{maxWidth:520,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>
        <Card style={{border:`1px solid ${G.amarillo}44`,background:"#FFB80008"}}>
          <ST>⚡ Activar Cierre de Caja</ST>
          <div style={{fontSize:13,color:G.textoSec,marginBottom:16,lineHeight:1.5}}>
            Esta es la configuración inicial — se hace <strong>una sola vez</strong>. A partir de acá, cada cierre se calcula automáticamente desde esta fecha, sumando ventas cobradas y cobros de deuda, y restando los gastos que efectivamente salieron de cada billetera.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Fi label="Contar movimientos desde" value={cfgFecha} onChange={setCfgFecha} type="date"/>
            <div style={{fontSize:11,color:G.textoSec,marginTop:-6}}>
              Las ventas, cobros y gastos anteriores a esta fecha no se tienen en cuenta — quedan reflejados en el saldo real que cargués a continuación.
            </div>
          </div>
        </Card>
        <Card>
          <ST>Saldo real de arranque — contá lo que hay hoy en cada billetera</ST>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <Fi label="Caja Chica (efectivo en local)" value={cfgCaja} onChange={setCfgCaja} type="number" placeholder="0"/>
            <Fi label="Mercado Pago" value={cfgMP} onChange={setCfgMP} type="number" placeholder="0"/>
            <Fi label="Banco" value={cfgBanco} onChange={setCfgBanco} type="number" placeholder="0"/>
            <Fi label="Ahorro (caja de seguridad)" value={cfgAhorro} onChange={setCfgAhorro} type="number" placeholder="0"/>
          </div>
        </Card>
        <Btn full onClick={guardarConfigInicial} disabled={cfgLoading}>
          {cfgLoading?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:"✓ Activar Cierre de Caja"}
        </Btn>
      </div>
    );
  }

  // ── A partir de acá, config ya existe — cálculo normal ──
  const fechaInicio = config.fecha_inicio;
  const arranqueCaja   = config.saldo_caja_chica||0;
  const arranqueMP     = config.saldo_mp||0;
  const arranqueBanco  = config.saldo_banco||0;
  const arranqueAhorro = config.saldo_ahorro||0;

  const ultimoCierre = cierres[0]||null;

  const diasDesdeInicio = (()=>{
    const d1=new Date(fechaInicio+"T00:00:00");
    const d2=new Date(fechaAhora+"T00:00:00");
    return Math.max(0,Math.round((d2-d1)/(1000*60*60*24)));
  })();

  const MP_METODOS      = ["Transferencia MP","Debito MP","Credito MP"];
  const BANCO_METODOS   = ["Transferencia Banco","Debito Banco","Credito Banco","Credito Cuotas Banco"];
  const TIPOS_EGRESO_EXCLUIDOS = ["Inversión inicial"];

  // ── SIEMPRE desde fecha_inicio — nunca desde el último cierre ──
  const ventasDesde = ventas.filter(v=>v.fecha >= fechaInicio);
  // Pagos de egresos: usamos pagos_egreso (con fecha real de cada pago) en lugar del egreso completo
  // Esto permite que pagos parciales se contabilicen en la fecha exacta en que se hicieron
  // Igual que en egresosDesde y en el Libro de movimientos: los pagos contra un egreso tipo
  // "Inversión inicial" NO deben restarse de ninguna billetera — esa plata nunca salió de la caja
  // del local (la puso un socio de su bolsillo). Antes este filtro solo se aplicaba a egresos pagados
  // de una sola vez; si el pago se registraba en partes vía "Registrar pago", se colaba igual.
  const pagosEgresoDesde = pagosEgreso.filter(p=>{
    if(p.fecha < fechaInicio) return false;
    const eg = egresos.find(e=>e.id===p.egreso_id);
    if(eg?.tipo==="Inversión inicial") return false;
    return true;
  });
  // Para egresos sin pagos_egreso (cargados antes de este sistema), fallback al egreso completo
  const egresosConPagos = new Set(pagosEgreso.map(p=>p.egreso_id));
  const egresosDesde = egresos.filter(e=>
    e.fecha >= fechaInicio &&
    !TIPOS_EGRESO_EXCLUIDOS.includes(e.tipo) &&
    e.pagador==="Pensok" &&
    !egresosConPagos.has(e.id) // solo los que no tienen pagos_egreso registrados
  );
  // IDs de ventas que caen dentro del período (se filtran por fecha DE LA VENTA).
  // El cobro de estas ventas ya se cuenta vía cobradoDeVenta(), así que su pago en pagos_deuda se excluye
  // acá para no duplicar.
  const ventaIdsPeriodo = new Set(ventasDesde.map(v=>v.id));
  // Cobros de deuda que SÍ se suman en el cierre:
  //  a) los "sueltos" (sin referencia_id — no tienen venta asociada en el sistema), y
  //  b) los que referencian una venta que quedó FUERA del período (deuda vieja de una venta anterior
  //     a la fecha de arranque, cobrada ahora). Esa venta no está en ventasDesde, por lo que su cobro
  //     no se contabiliza por ningún otro lado — antes se perdía y aparecía como "sobrante".
  // Se siguen excluyendo los pagos que referencian una venta del período (ya contada), para no duplicar.
  const pagosDesde = pagosDia.filter(p=>
    p.fecha >= fechaInicio &&
    (!p.referencia_id || (p.tipo==="ingreso" && !ventaIdsPeriodo.has(p.referencia_id)))
  );
  const movsDesde = movimientos.filter(m=>m.fecha >= fechaInicio);

  // ── Devoluciones (notas de crédito) del período ──
  // Las de tipo "dinero" son plata que SALIÓ de una billetera → se restan del esperado (igual que un gasto).
  // Las de tipo "saldo" no tocan caja (se acreditan al cliente), pero igual revierten la ganancia.
  const devolucionesDesde = devoluciones.filter(d=>d.fecha >= fechaInicio);
  const devDineroDesde    = devolucionesDesde.filter(d=>d.tipo==="dinero");
  const devEfectivo = devDineroDesde.filter(d=>d.metodo_devolucion==="Efectivo").reduce((s,d)=>s+(d.monto_total||0),0);
  const devMP       = devDineroDesde.filter(d=>MP_METODOS.includes(d.metodo_devolucion)).reduce((s,d)=>s+(d.monto_total||0),0);
  const devBanco    = devDineroDesde.filter(d=>BANCO_METODOS.includes(d.metodo_devolucion)).reduce((s,d)=>s+(d.monto_total||0),0);
  const devTotalDinero    = devEfectivo + devMP + devBanco;
  const gananciaRevertida = devolucionesDesde.reduce((s,d)=>s+(d.ganancia_revertida||0),0);

  // Monto efectivamente cobrado neto de una venta (soporta pagos parciales y descuenta comisión)
  const cobradoDeVenta = (v) => {
    const comision = v.metodo_pago !== "Efectivo" ? (v.comision_plataforma||0) : 0;
    if(v.cobrado) return (v.total||0) - comision;
    if((v.monto_cobrado||0) > 0) return (v.monto_cobrado||0) - comision;
    return 0;
  };

  const billeteraDeMetodo = (m) => m==="Efectivo" ? "caja_chica" : MP_METODOS.includes(m) ? "mp" : BANCO_METODOS.includes(m) ? "banco" : null;

  // ── Ingresos reales de ventas, por billetera EFECTIVA de cobro ──
  // Una venta puede cobrarse en varios pagos y por métodos distintos (ej: parte en efectivo, parte por MP).
  // Si la venta tiene registros en pagos_deuda, usamos el método REAL de cada pago (igual que el Libro de
  // movimientos), en vez de asumir que todo entró por el método nominal de la venta (v.metodo_pago) — eso
  // generaba un descuadre entre billeteras cuando el pago se dividía. La comisión de plataforma se descuenta
  // UNA sola vez por venta, del primer pago no-efectivo (nunca del efectivo).
  const pagosVentasTodos = pagosDia.filter(p=>p.tipo==="ingreso"&&p.referencia_id);
  const comisionAsignadaPago = {}; // venta_id -> id del pago que absorbe la comisión de esa venta
  pagosVentasTodos.forEach(p=>{
    const v = ventas.find(vv=>vv.id===p.referencia_id);
    if(v && (v.comision_plataforma||0)>0 && p.metodo_pago!=="Efectivo" && comisionAsignadaPago[v.id]===undefined){
      comisionAsignadaPago[v.id] = p.id;
    }
  });
  const idsVentaConPagos = new Set(pagosVentasTodos.map(p=>p.referencia_id));
  const ingresosVentaPorBilletera = []; // {ventaId, billetera, monto}
  ventasDesde.forEach(v=>{
    const pagosDeEstaVenta = pagosVentasTodos.filter(p=>p.referencia_id===v.id);
    if(pagosDeEstaVenta.length>0){
      pagosDeEstaVenta.forEach(p=>{
        const comision = comisionAsignadaPago[v.id]===p.id ? (v.comision_plataforma||0) : 0;
        const monto = Math.max(0,(p.monto||0)-comision);
        const billetera = billeteraDeMetodo(p.metodo_pago);
        if(billetera && monto>0) ingresosVentaPorBilletera.push({ventaId:v.id, billetera, monto});
      });
    }else{
      // Sin pagos_deuda registrados (venta cobrada íntegra en un solo método, sin split) — comportamiento anterior
      const monto = cobradoDeVenta(v);
      const billetera = billeteraDeMetodo(v.metodo_pago);
      if(billetera && monto>0) ingresosVentaPorBilletera.push({ventaId:v.id, billetera, monto});
    }
  });
  const ventasPorBilletera = (b) => ingresosVentaPorBilletera.filter(i=>i.billetera===b).reduce((s,i)=>s+i.monto,0);

  const calcBolsillo = (bolsillo) => {
    const cobros = pagosDesde.filter(p=>p.tipo==="ingreso");
    const reembs = pagosDesde.filter(p=>p.tipo==="egreso");
    const movEntra = movsDesde.filter(m=>m.destino===bolsillo).reduce((s,m)=>s+(m.monto||0),0);
    const movSale  = movsDesde.filter(m=>m.origen===bolsillo).reduce((s,m)=>s+(m.monto||0),0);
    const movNeto  = movEntra - movSale;

    if(bolsillo==="caja_chica"){
      const cobEf = cobros.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+p.monto,0);
      const reEf  = reembs.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+p.monto,0);
      const vEf   = ventasPorBilletera("caja_chica")+cobEf;
      const gEfPagos  = pagosEgresoDesde.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+(p.monto||0),0);
      const gEfLegacy = egresosDesde.filter(e=>e.metodo_pago==="Efectivo").reduce((s,e)=>s+(e.monto||0),0);
      return vEf - gEfPagos - gEfLegacy - reEf - devEfectivo + movNeto;
    }
    if(bolsillo==="mp"){
      const cobMP = cobros.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
      const reMP  = reembs.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
      const vMP_  = ventasPorBilletera("mp")+cobMP;
      const gMPPagos  = pagosEgresoDesde.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+(p.monto||0),0);
      const gMPLegacy = egresosDesde.filter(e=>MP_METODOS.includes(e.metodo_pago)).reduce((s,e)=>s+(e.monto||0),0);
      return vMP_ - gMPPagos - gMPLegacy - reMP - devMP + movNeto;
    }
    if(bolsillo==="banco"){
      const cobBa = cobros.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
      const reBa  = reembs.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
      const vBa   = ventasPorBilletera("banco")+cobBa;
      const gBaPagos  = pagosEgresoDesde.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+(p.monto||0),0);
      const gBaLegacy = egresosDesde.filter(e=>BANCO_METODOS.includes(e.metodo_pago)).reduce((s,e)=>s+(e.monto||0),0);
      return vBa - gBaPagos - gBaLegacy - reBa - devBanco + movNeto;
    }
    if(bolsillo==="ahorro"){
      return movNeto;
    }
    return 0;
  };

  // ── Desglose explícito por bolsillo, para mostrar en pantalla sin que quede nada oculto ──
  const cobrosIngreso = pagosDesde.filter(p=>p.tipo==="ingreso");
  const reembsEgreso  = pagosDesde.filter(p=>p.tipo==="egreso");
  const cobDeudaEf    = cobrosIngreso.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+p.monto,0);
  const cobDeudaMP     = cobrosIngreso.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
  const cobDeudaBanco  = cobrosIngreso.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
  const reembDeudaEf   = reembsEgreso.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+p.monto,0);
  const reembDeudaMP   = reembsEgreso.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
  const reembDeudaBanco= reembsEgreso.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+p.monto,0);
  const movNetoCaja    = movsDesde.filter(m=>m.destino==="caja_chica").reduce((s,m)=>s+(m.monto||0),0) - movsDesde.filter(m=>m.origen==="caja_chica").reduce((s,m)=>s+(m.monto||0),0);
  const movNetoMP       = movsDesde.filter(m=>m.destino==="mp").reduce((s,m)=>s+(m.monto||0),0) - movsDesde.filter(m=>m.origen==="mp").reduce((s,m)=>s+(m.monto||0),0);
  const movNetoBanco    = movsDesde.filter(m=>m.destino==="banco").reduce((s,m)=>s+(m.monto||0),0) - movsDesde.filter(m=>m.origen==="banco").reduce((s,m)=>s+(m.monto||0),0);
  const movNetoAhorro   = movsDesde.filter(m=>m.destino==="ahorro").reduce((s,m)=>s+(m.monto||0),0) - movsDesde.filter(m=>m.origen==="ahorro").reduce((s,m)=>s+(m.monto||0),0);

  const esperadoCaja   = arranqueCaja   + calcBolsillo("caja_chica");
  const esperadoMP     = arranqueMP     + calcBolsillo("mp");
  const esperadoBanco  = arranqueBanco  + calcBolsillo("banco");
  const esperadoAhorro = arranqueAhorro + calcBolsillo("ahorro");
  const esperadoTotal  = esperadoCaja + esperadoMP + esperadoBanco + esperadoAhorro;

  // Totales informativos del período completo (para mostrar desglose) — misma atribución real por billetera
  const vEfectivo = ventasPorBilletera("caja_chica");
  const vMP       = ventasPorBilletera("mp");
  const vBanco    = ventasPorBilletera("banco");
  const vCC       = ventasDesde.filter(v=>v.metodo_pago==="Cuenta corriente"&&!idsVentaConPagos.has(v.id)).reduce((s,v)=>s+cobradoDeVenta(v),0);
  const vTotal    = vEfectivo+vMP+vBanco+vCC;
  // Gastos = pagos_egreso (con fecha real) + egresos legacy (sin pagos_egreso registrados)
  const gEfectivo = pagosEgresoDesde.filter(p=>p.metodo_pago==="Efectivo").reduce((s,p)=>s+(p.monto||0),0)
                  + egresosDesde.filter(e=>e.metodo_pago==="Efectivo").reduce((s,e)=>s+(e.monto||0),0);
  const gOtrosTotal = pagosEgresoDesde.filter(p=>p.metodo_pago!=="Efectivo").reduce((s,p)=>s+(p.monto||0),0)
                    + egresosDesde.filter(e=>e.metodo_pago!=="Efectivo").reduce((s,e)=>s+(e.monto||0),0);
  const gTotal    = gEfectivo + gOtrosTotal;
  const gOtros    = gOtrosTotal;
  // Gastos por billetera (para mostrar la resta explícita en el detalle de cada bolsillo)
  const gMPtot    = pagosEgresoDesde.filter(p=>MP_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+(p.monto||0),0)
                  + egresosDesde.filter(e=>MP_METODOS.includes(e.metodo_pago)).reduce((s,e)=>s+(e.monto||0),0);
  const gBancoTot = pagosEgresoDesde.filter(p=>BANCO_METODOS.includes(p.metodo_pago)).reduce((s,p)=>s+(p.monto||0),0)
                  + egresosDesde.filter(e=>BANCO_METODOS.includes(e.metodo_pago)).reduce((s,e)=>s+(e.monto||0),0);
  const ganNeta   = vTotal - gTotal - devTotalDinero;

  // Real ingresado por el usuario en este cierre
  const realCaja   = parseFloat(cajChica)||0;
  const realMP     = parseFloat(saldoMP)||0;
  const realBanco  = parseFloat(saldoBanco)||0;
  const realAhorro = parseFloat(saldoAhorro)||0;
  const realTotal  = realCaja + realMP + realBanco + realAhorro;

  const diffCaja   = realCaja   - esperadoCaja;
  const diffMP     = realMP     - esperadoMP;
  const diffBanco  = realBanco  - esperadoBanco;
  const diffAhorro = realAhorro - esperadoAhorro;
  const diffTotal  = realTotal  - esperadoTotal;

  const fecha = fechaAhora;

  async function guardarCierre(){
    setLoading(true);
    const{error}=await supabase.from("cierres_caja").insert({
      fecha,
      saldo_caja_chica: realCaja, saldo_mp: realMP,
      saldo_banco: realBanco, saldo_ahorro: realAhorro,
      ventas_efectivo: vEfectivo, ventas_transferencia: vBanco,
      ventas_mp: vMP, ventas_debito: 0,
      ventas_credito: 0, ventas_cuenta_corriente: vCC,
      ventas_total: vTotal, gastos_efectivo: gEfectivo,
      gastos_otros: gOtros, gastos_total: gTotal,
      ganancia_neta: ganNeta,
      diff_caja_chica: diffCaja, diff_mp: diffMP, diff_banco: diffBanco,
      notas,
    });
    if(error){toast.err("Error al guardar cierre");setLoading(false);return;}
    toast.ok("Cierre guardado");
    setLoading(false);
    setCajChica(""); setSaldoMP(""); setSaldoBanco(""); setSaldoAhorro(""); setNotas("");
    cargarTodo();
    setTab("historial");
  }

  async function guardarMovimiento(){
    if(!movMonto||movOrigen===movDestino){toast.err("Revisá los datos del movimiento");return;}
    setLoadingMov(true);
    await supabase.from("movimientos_caja").insert({
      fecha:fechaAhora, origen:movOrigen, destino:movDestino,
      monto:parseFloat(movMonto)||0, concepto:movConcepto,
    });
    toast.ok("Movimiento registrado");
    setLoadingMov(false);
    setModalMov(false);
    setMovMonto("");setMovConcepto("");
    cargarTodo();
  }

  const diffColor=(d)=>d===0?G.textoSec:d>0?G.verde:G.rojo;
  const diffLabel=(d)=>d===0?"✓ Cuadra":d>0?`+${fmt(d)} sobrante`:`${fmt(d)} faltante`;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Tabs */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {[{k:"nuevo",l:"Nuevo cierre"},{k:"historial",l:"Historial"},{k:"libro",l:"📒 Libro de movimientos"}].map(t=>(
          <button key={t.k} onClick={()=>setTab(t.k)}
            style={{background:tab===t.k?G.verde:G.sup2,color:tab===t.k?"#000":G.textoSec,border:`1px solid ${tab===t.k?G.verde:G.borde}`,borderRadius:8,padding:"6px 18px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {t.l}
          </button>
        ))}
        <div style={{flex:1}}/>
        {config&&<span style={{fontSize:11,color:G.textoSec}}>Contando desde {fechaInicio}</span>}
        <Btn small variant="secondary" onClick={()=>setModalMov(true)}>↔ Registrar movimiento</Btn>
      </div>

      {tab==="libro"&&(()=>{
        // ── Armar lista de movimientos desde todas las fuentes ──
        const movs = [];

        // 1. Ventas cobradas con registro en pagos_deuda (fecha real de cobro)
        const pagosVentas = pagosDia.filter(p=>p.tipo==="ingreso"&&p.referencia_id);
        // La comisión de plataforma es un costo ÚNICO de la venta (sobre la transacción por el método
        // comisionado). Si la venta se cobró en varios pagos, la comisión se descuenta UNA sola vez,
        // del primer pago hecho por un método NO-efectivo — nunca de los pagos en efectivo.
        const comisionPagoPorVenta = {}; // venta_id -> id del pago que carga la comisión
        pagosVentas.forEach(p=>{
          const v = ventas.find(v=>v.id===p.referencia_id);
          if(v && (v.comision_plataforma||0)>0 && p.metodo_pago!=="Efectivo" && comisionPagoPorVenta[v.id]===undefined){
            comisionPagoPorVenta[v.id] = p.id;
          }
        });
        pagosVentas.forEach(p=>{
          const v = ventas.find(v=>v.id===p.referencia_id);
          const comision = (v && comisionPagoPorVenta[v.id]===p.id) ? (v.comision_plataforma||0) : 0;
          const montoNeto = Math.max(0,(p.monto||0) - comision);
          const billetera = MP_METODOS.includes(p.metodo_pago)?"mp":BANCO_METODOS.includes(p.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`pv-${p.id}`, fecha:p.fecha, tipo:"ingreso",
            concepto:p.concepto||"Cobro venta",
            metodo:p.metodo_pago, monto:montoNeto, billetera,
            origen:"Venta cobrada",
          });
        });

        // 2. Ventas cobradas sin registro en pagos_deuda (implícito, monto neto)
        const idsConPago = new Set(pagosVentas.map(p=>p.referencia_id));
        ventas.filter(v=>v.cobrado&&!idsConPago.has(v.id)).forEach(v=>{
          const billetera = MP_METODOS.includes(v.metodo_pago)?"mp":BANCO_METODOS.includes(v.metodo_pago)?"banco":"caja_chica";
          const comision = v.metodo_pago!=="Efectivo" ? (v.comision_plataforma||0) : 0;
          const monto = Math.max(0,(v.total||0) - comision);
          movs.push({
            id:`vi-${v.id}`, fecha:v.fecha, tipo:"ingreso",
            concepto:`Venta - ${v.cliente_nombre||"Consumidor Final"}`,
            metodo:v.metodo_pago, monto, billetera,
            origen:"Venta cobrada",
          });
        });

        // 3. Cobros de deuda sueltos (sin referencia a venta)
        pagosDia.filter(p=>p.tipo==="ingreso"&&!p.referencia_id).forEach(p=>{
          const billetera = MP_METODOS.includes(p.metodo_pago)?"mp":BANCO_METODOS.includes(p.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`pd-${p.id}`, fecha:p.fecha, tipo:"ingreso",
            concepto:p.concepto||"Cobro de deuda",
            metodo:p.metodo_pago, monto:p.monto, billetera,
            origen:"Cobro de deuda",
          });
        });

        // 4. Pagos de traspaso (solo Pilar — ingresos de Caamaño)
        pagosDia.filter(p=>p.traspaso_id).forEach(p=>{
          const billetera = MP_METODOS.includes(p.metodo_pago)?"mp":BANCO_METODOS.includes(p.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`pt-${p.id}`, fecha:p.fecha, tipo:"ingreso",
            concepto:"Cobro traspaso desde Caamaño",
            metodo:p.metodo_pago, monto:p.monto, billetera,
            origen:"Traspaso",
          });
        });

        // 5. Pagos de egresos (pagos_egreso con fecha real) — excluye Inversión inicial.
        // La comisión de plataforma (si la hay) suma al monto que sale de la billetera --
        // al revés que en ventas, acá hace que salga MÁS plata de la que se le debía al
        // proveedor, no menos.
        pagosEgreso.forEach(p=>{
          const eg = egresos.find(e=>e.id===p.egreso_id);
          if(eg?.tipo==="Inversión inicial") return; // excluir inversiones
          const billetera = MP_METODOS.includes(p.metodo_pago)?"mp":BANCO_METODOS.includes(p.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`pe-${p.id}`, fecha:p.fecha, tipo:"egreso",
            concepto:eg?eg.concepto:"Pago egreso",
            metodo:p.metodo_pago, monto:p.monto+(p.comision_plataforma||0), billetera,
            origen:"Gasto/Egreso",
          });
        });

        // 6. Egresos legacy (sin pagos_egreso) — excluye Inversión inicial
        const egresosConPagos2 = new Set(pagosEgreso.map(p=>p.egreso_id));
        egresos.filter(e=>!egresosConPagos2.has(e.id)&&(e.reembolsado||!(e.reembolso_pendiente))&&e.tipo!=="Inversión inicial").forEach(e=>{
          const billetera = MP_METODOS.includes(e.metodo_pago)?"mp":BANCO_METODOS.includes(e.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`el-${e.id}`, fecha:e.fecha, tipo:"egreso",
            concepto:e.concepto,
            metodo:e.metodo_pago, monto:e.monto_reembolsado||e.monto, billetera,
            origen:`Gasto/Egreso · ${e.pagador||""}`,
          });
        });

        // 7. Movimientos entre billeteras
        movsDesde.forEach(m=>{
          movs.push({
            id:`me-${m.id}`, fecha:m.fecha, tipo:"movimiento",
            concepto:m.concepto||`${BOLSILLOS.find(b=>b.key===m.origen)?.label} → ${BOLSILLOS.find(b=>b.key===m.destino)?.label}`,
            metodo:"Interno", monto:m.monto,
            billetera:`${m.origen}→${m.destino}`,
            origen:"Movimiento interno",
          });
        });

        // 8. Devoluciones de dinero (notas de crédito) — salida de plata por billetera
        devoluciones.filter(d=>d.tipo==="dinero").forEach(d=>{
          const billetera = MP_METODOS.includes(d.metodo_devolucion)?"mp":BANCO_METODOS.includes(d.metodo_devolucion)?"banco":"caja_chica";
          movs.push({
            id:`dv-${d.id}`, fecha:d.fecha, tipo:"egreso",
            concepto:`${d.nro_nota||"Nota crédito"} · Devolución - ${d.cliente_nombre||"Consumidor Final"}`,
            metodo:d.metodo_devolucion, monto:d.monto_total, billetera,
            origen:"Devolución",
          });
        });

        // 9. Descuentos de proveedor recibidos en plata real sobre egresos ya pagados —
        // entra como ingreso, en su fecha y billetera reales (no se toca el egreso ni el
        // pago original, que ya quedaron reflejados arriba con el monto completo).
        descuentosEgreso.forEach(d=>{
          const eg = egresos.find(e=>e.id===d.egreso_id);
          const billetera = MP_METODOS.includes(d.metodo_pago)?"mp":BANCO_METODOS.includes(d.metodo_pago)?"banco":"caja_chica";
          movs.push({
            id:`de-${d.id}`, fecha:d.fecha, tipo:"ingreso",
            concepto:`Descuento de proveedor${eg?` - ${eg.concepto}`:""}`,
            metodo:d.metodo_pago, monto:d.monto, billetera,
            origen:"Descuento de proveedor",
          });
        });

        // Ordenar por fecha descendente
        movs.sort((a,b)=>b.fecha>a.fecha?1:b.fecha<a.fecha?-1:0);

        // ── Filtros ──
        const billeterasOpts = ["Todas","caja_chica","mp","banco","ahorro"];
        const billeteraLabel = {caja_chica:"Caja Chica",mp:"Mercado Pago",banco:"Banco",ahorro:"Ahorro",Todas:"Todas"};

        const filtrados2 = movs.filter(m=>{
          if(lmDesde && m.fecha < lmDesde) return false;
          if(lmHasta && m.fecha > lmHasta) return false;
          if(lmBilletera!=="Todas" && !m.billetera.includes(lmBilletera)) return false;
          if(lmTipo!=="Todos" && m.tipo!==lmTipo) return false;
          if(lmBusq.trim()){
            const q=lmBusq.toLowerCase();
            if(!(m.concepto||"").toLowerCase().includes(q) &&
               !(m.metodo||"").toLowerCase().includes(q) &&
               !(m.origen||"").toLowerCase().includes(q)) return false;
          }
          return true;
        });

        const totalEntradas = filtrados2.filter(m=>m.tipo==="ingreso").reduce((s,m)=>s+m.monto,0);
        const totalSalidas  = filtrados2.filter(m=>m.tipo==="egreso").reduce((s,m)=>s+m.monto,0);
        const neto = totalEntradas - totalSalidas;

        return(
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* Filtros */}
            <Card style={{padding:"12px 18px"}}>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
                <div style={{flex:"1 1 120px"}}>
                  <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Desde</div>
                  <Fi value={lmDesde} onChange={setLmDesde} type="date"/>
                </div>
                <div style={{flex:"1 1 120px"}}>
                  <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Hasta</div>
                  <Fi value={lmHasta} onChange={setLmHasta} type="date"/>
                </div>
                <div style={{flex:"1 1 130px"}}>
                  <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Billetera</div>
                  <Fi value={lmBilletera} onChange={setLmBilletera} options={billeterasOpts.map(b=>({value:b,label:billeteraLabel[b]||b}))}/>
                </div>
                <div style={{flex:"1 1 130px"}}>
                  <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Tipo</div>
                  <Fi value={lmTipo} onChange={setLmTipo} options={[{value:"Todos",label:"Todos"},{value:"ingreso",label:"Ingresos"},{value:"egreso",label:"Egresos"},{value:"movimiento",label:"Movimientos internos"}]}/>
                </div>
                <div style={{flex:"2 1 200px",position:"relative"}}>
                  <div style={{fontSize:10,color:G.textoSec,fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,marginBottom:4}}>Buscar</div>
                  <input value={lmBusq} onChange={e=>setLmBusq(e.target.value)} placeholder="🔍 Concepto, método, origen..." style={{background:G.sup2,border:`1px solid ${lmBusq?G.verde:G.borde}`,borderRadius:8,padding:"8px 30px 8px 11px",color:G.texto,fontSize:13,width:"100%",outline:"none"}}/>
                  {lmBusq&&<button onClick={()=>setLmBusq("")} style={{position:"absolute",right:8,bottom:9,background:"none",border:"none",color:G.textoSec,cursor:"pointer",fontSize:14}}>✕</button>}
                </div>
                {(lmDesde||lmHasta||lmBilletera!=="Todas"||lmTipo!=="Todos"||lmBusq)&&(
                  <Btn small variant="ghost" onClick={()=>{setLmDesde("");setLmHasta("");setLmBilletera("Todas");setLmTipo("Todos");setLmBusq("");}}>Limpiar</Btn>
                )}
              </div>
            </Card>

            {/* Resumen */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              <MetricCard label="Ingresos" value={fmt(totalEntradas)} color={G.verde} sub={`${filtrados2.filter(m=>m.tipo==="ingreso").length} movimientos`}/>
              <MetricCard label="Egresos" value={fmt(totalSalidas)} color={G.rojo} sub={`${filtrados2.filter(m=>m.tipo==="egreso").length} movimientos`}/>
              <MetricCard label="Neto" value={fmt(neto)} color={neto>=0?G.verde:G.rojo} sub={`${filtrados2.length} movimientos totales`}/>
            </div>

            {/* Lista */}
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {filtrados2.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin movimientos para los filtros seleccionados</div>}
              {filtrados2.map(m=>{
                const esIngreso = m.tipo==="ingreso";
                const esMovimiento = m.tipo==="movimiento";
                const bill = m.billetera.includes("→")?m.billetera:billeteraLabel[m.billetera]||m.billetera;
                return(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:G.sup,borderRadius:10,border:`1px solid ${G.borde}`,borderLeft:`3px solid ${esMovimiento?G.azul:esIngreso?G.verde:G.rojo}`}}>
                    <div style={{width:28,height:28,borderRadius:8,background:esMovimiento?`${G.azul}22`:esIngreso?`${G.verde}22`:`${G.rojo}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>
                      {esMovimiento?"↔":esIngreso?"↓":"↑"}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.concepto}</div>
                      <div style={{fontSize:11,color:G.textoSec,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                        <span>{m.fecha}</span>
                        <span>·</span>
                        <span>{m.metodo}</span>
                        <span>·</span>
                        <span style={{background:G.sup2,padding:"0 6px",borderRadius:4}}>{bill}</span>
                        <span>·</span>
                        <span style={{color:G.textoSec}}>{m.origen}</span>
                      </div>
                    </div>
                    <div style={{fontFamily:"DM Mono,monospace",fontWeight:700,fontSize:14,color:esMovimiento?G.azul:esIngreso?G.verde:G.rojo,whiteSpace:"nowrap"}}>
                      {esMovimiento?"":esIngreso?"+":"-"}{fmt(m.monto)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {tab==="nuevo"&&(<>
        <Card style={{background:G.sup2,border:`1px solid ${G.borde}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <div style={{fontSize:13,fontWeight:600}}>Cálculo acumulado — {fechaAhora}</div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>
                Desde {fechaInicio} · {diasDesdeInicio} día{diasDesdeInicio!==1?"s":""} · {ventasDesde.length} ventas · {egresosDesde.length} egresos pagados
                {ultimoCierre&&<> · último cierre guardado: {ultimoCierre.fecha}{ultimoCierre.created_at?` ${fmtFechaHora(ultimoCierre.created_at)}`:""}</>}
              </div>
              <div style={{fontSize:11,color:G.textoSec,marginTop:4,lineHeight:1.5}}>
                Cuenta <strong>todo lo que tenga fecha desde el {fechaInicio}</strong> (día completo, desde las 00:00): ventas cobradas, cobros de deudas y gastos pagados.
                {config.created_at&&<> Arranque activado el <strong>{fmtFechaHora(config.created_at)}</strong>.</>}
              </div>
              <div style={{fontSize:10,color:G.textoSec,marginTop:2,fontStyle:"italic"}}>
                El corte es por día — ventas, cobros y gastos guardan la fecha (no la hora), así que la hora del arranque es sólo informativa.
              </div>
            </div>
            <Btn small variant="secondary" onClick={cargarTodo}>↺ Actualizar</Btn>
          </div>
        </Card>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {/* Columna izquierda: lo que dice el sistema */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card>
              <ST>Ingresos acumulados — sistema</ST>
              {[
                {l:"Efectivo",             v:vEfectivo, c:G.verde},
                {l:"Mercado Pago", v:vMP,       c:G.azul},
                {l:"Banco", v:vBanco, c:G.azul},
                {l:"Cuenta corriente",     v:vCC,       c:G.amarillo},
              ].filter(x=>x.v>0).map(x=>(
                <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${G.borde}22`,fontSize:13}}>
                  <span style={{color:G.textoSec}}>{x.l}</span>
                  <span style={{fontFamily:"DM Mono,monospace",fontWeight:600,color:x.c}}>{fmt(x.v)}</span>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:14,fontWeight:600,marginTop:4}}>
                <span>Total cobrado</span>
                <span style={{fontFamily:"DM Mono,monospace",color:G.verde}}>{fmt(vTotal)}</span>
              </div>
              <div style={{fontSize:10,color:G.textoSec,marginTop:4}}>Incluye ventas pagadas completas y pagos parciales</div>
            </Card>
            <Card>
              <ST>Gastos pagados por el local — sistema</ST>
              {[
                {l:"Efectivo",  v:gEfectivo, c:G.rojo},
                {l:"Otros métodos",     v:gOtros,    c:G.naranja},
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
              <div style={{fontSize:10,color:G.textoSec,marginTop:4}}>Solo gastos efectivamente pagados por el local (excluye pendientes de reembolso e inversiones)</div>
            </Card>
            <Card style={{border:`1px solid ${G.verde}33`}}>
              <ST>Ganancia neta acumulada</ST>
              <div style={{fontSize:28,fontWeight:700,color:G.verde,fontFamily:"DM Mono,monospace"}}>{fmt(ganNeta)}</div>
              {devTotalDinero>0&&<div style={{fontSize:11,color:G.textoSec,marginTop:6}}>Ya descontadas las devoluciones de dinero del período: <span style={{color:G.rojo,fontFamily:"DM Mono,monospace"}}>−{fmt(devTotalDinero)}</span></div>}
            </Card>
          </div>

          {/* Columna derecha: lo que hay realmente */}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Card style={{background:G.sup2,border:`1px solid ${G.borde}`}}>
              <ST>Saldo de arranque — configurado el {fechaInicio}{config.created_at?` · activado ${fmtFechaHora(config.created_at)}`:""}</ST>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12}}>
                {[
                  {l:"Caja Chica", v:arranqueCaja},
                  {l:"MP",         v:arranqueMP},
                  {l:"Banco",      v:arranqueBanco},
                  {l:"Ahorro",     v:arranqueAhorro},
                ].map(x=>(
                  <div key={x.l} style={{display:"flex",justifyContent:"space-between",padding:"4px 0"}}>
                    <span style={{color:G.textoSec}}>{x.l}</span>
                    <span style={{fontFamily:"DM Mono,monospace",fontWeight:600}}>{fmt(x.v)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <ST>Saldos reales hoy — ingresá lo que tenés</ST>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <Fi label="Caja Chica (efectivo en local)" value={cajChica} onChange={setCajChica} type="number" placeholder="0"/>
                <Fi label="Mercado Pago" value={saldoMP} onChange={setSaldoMP} type="number" placeholder="0"/>
                <Fi label="Banco" value={saldoBanco} onChange={setSaldoBanco} type="number" placeholder="0"/>
                <Fi label="Ahorro (caja de seguridad)" value={saldoAhorro} onChange={setSaldoAhorro} type="number" placeholder="0"/>
              </div>
            </Card>

            {(cajChica||saldoMP||saldoBanco||saldoAhorro)&&(
              <Card>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <ST style={{margin:0}}>Diferencias (real vs esperado)</ST>
                  <span style={{fontSize:11,color:G.textoSec,background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"2px 8px"}}>
                    Acumulado desde {fechaInicio}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {[
                    {l:"Caja Chica",  esp:esperadoCaja,   real:realCaja,   diff:diffCaja,
                      det:`Arranque ${fmt(arranqueCaja)} + ventas ef. ${fmt(vEfectivo)}${cobDeudaEf>0?` + cobros deuda ef. ${fmt(cobDeudaEf)}`:""}${gEfectivo>0?` − gastos ef. ${fmt(gEfectivo)}`:""}${reembDeudaEf>0?` − reembolsos ef. ${fmt(reembDeudaEf)}`:""}${devEfectivo>0?` − devoluciones ef. ${fmt(devEfectivo)}`:""}${movNetoCaja!==0?` ${movNetoCaja>0?"+":"−"} movimientos ${fmt(Math.abs(movNetoCaja))}`:""}`},
                    {l:"Mercado Pago",esp:esperadoMP,     real:realMP,     diff:diffMP,
                      det:`Arranque ${fmt(arranqueMP)} + ventas MP ${fmt(vMP)}${cobDeudaMP>0?` + cobros deuda MP ${fmt(cobDeudaMP)}`:""}${gMPtot>0?` − gastos MP ${fmt(gMPtot)}`:""}${reembDeudaMP>0?` − reembolsos MP ${fmt(reembDeudaMP)}`:""}${devMP>0?` − devoluciones MP ${fmt(devMP)}`:""}${movNetoMP!==0?` ${movNetoMP>0?"+":"−"} movimientos ${fmt(Math.abs(movNetoMP))}`:""}`},
                    {l:"Banco",       esp:esperadoBanco,  real:realBanco,  diff:diffBanco,
                      det:`Arranque ${fmt(arranqueBanco)} + ventas banco ${fmt(vBanco)}${cobDeudaBanco>0?` + cobros deuda banco ${fmt(cobDeudaBanco)}`:""}${gBancoTot>0?` − gastos banco ${fmt(gBancoTot)}`:""}${reembDeudaBanco>0?` − reembolsos banco ${fmt(reembDeudaBanco)}`:""}${devBanco>0?` − devoluciones banco ${fmt(devBanco)}`:""}${movNetoBanco!==0?` ${movNetoBanco>0?"+":"−"} movimientos ${fmt(Math.abs(movNetoBanco))}`:""}`},
                    {l:"Ahorro",      esp:esperadoAhorro, real:realAhorro, diff:diffAhorro,
                      det:`Arranque ${fmt(arranqueAhorro)}${movNetoAhorro!==0?` ${movNetoAhorro>0?"+":"−"} movimientos ${fmt(Math.abs(movNetoAhorro))}`:" + traspasos entre bolsillos (sin movimientos)"}`},
                  ].map(x=>(
                    <div key={x.l} style={{background:G.sup2,borderRadius:8,padding:"10px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontSize:12,fontWeight:600}}>{x.l}</span>
                        <span style={{fontSize:13,fontWeight:700,color:diffColor(x.diff)}}>
                          {diffLabel(x.diff)}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:G.textoSec,marginBottom:4}}>{x.det}</div>
                      <div style={{display:"flex",gap:16,fontSize:11,color:G.textoSec}}>
                        <span>Esperado: <strong style={{color:G.texto}}>{fmt(x.esp)}</strong></span>
                        <span>Real: <strong style={{color:G.texto}}>{fmt(x.real)}</strong></span>
                      </div>
                    </div>
                  ))}
                  <div style={{borderTop:`1px solid ${G.borde}`,paddingTop:10,marginTop:2,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600}}>Diferencia total</span>
                      <div style={{fontSize:11,color:G.textoSec}}>Esperado {fmt(esperadoTotal)} · Real {fmt(realTotal)}</div>
                    </div>
                    <span style={{fontSize:18,fontWeight:700,fontFamily:"DM Mono,monospace",color:diffColor(diffTotal)}}>
                      {diffLabel(diffTotal)}
                    </span>
                  </div>
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
          {cierres.map((c,idx)=>{
            const diffTotal = (c.diff_caja_chica||0)+(c.diff_mp||0)+(c.diff_banco||0);
            // Movimientos que le corresponden a ESTE cierre puntual: los que pasaron entre el cierre
            // anterior (guardado justo antes) y este, por fecha/hora real de creación — no por día
            // calendario. Antes matcheaba solo por "mismo día" (m.fecha===c.fecha), así que si había
            // más de un cierre el mismo día, los dos mostraban exactamente los mismos movimientos
            // repetidos. Esto es solo un ajuste de qué se MUESTRA en cada card, no toca ningún
            // cálculo del cierre en sí (cierres.map ya venía ordenado por created_at desc).
            const cierrePrevio = cierres[idx+1];
            const desdeT = cierrePrevio?.created_at ? new Date(cierrePrevio.created_at).getTime() : -Infinity;
            const hastaT = c.created_at ? new Date(c.created_at).getTime() : Infinity;
            const movimientosDeEsteCierre = movimientos.filter(m=>{
              if(!m.created_at) return m.fecha===c.fecha; // fallback por si algún registro viejo no tiene created_at
              const t = new Date(m.created_at).getTime();
              return t>desdeT && t<=hastaT;
            });
            return(
            <Card key={c.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:12}}>
                <div>
                  <div style={{fontWeight:600,fontSize:15,marginBottom:2}}>{c.fecha}</div>
                  {c.created_at&&<div style={{fontSize:11,color:G.textoSec,marginBottom:6}}>Guardado el {fmtFechaHora(c.created_at)}</div>}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <Badge color="verde">Ventas {fmt(c.ventas_total)}</Badge>
                    <Badge color="rojo">Gastos {fmt(c.gastos_total)}</Badge>
                    <Badge color={c.ganancia_neta>=0?"verde":"rojo"}>Gan. {fmt(c.ganancia_neta)}</Badge>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
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
                  <div style={{display:"flex",alignItems:"center",gap:8,background:G.sup2,borderRadius:8,padding:"6px 14px"}}>
                    <span style={{fontSize:11,color:G.textoSec}}>Diferencia total</span>
                    <span style={{fontSize:13,fontWeight:700,fontFamily:"DM Mono,monospace",color:diffTotal===0?G.verde:diffTotal>0?G.verde:G.rojo}}>
                      {diffTotal===0?"✓ Cuadra":diffTotal>0?`+${fmt(diffTotal)} sobrante`:`${fmt(diffTotal)} faltante`}
                    </span>
                  </div>
                </div>
              </div>
              {c.notas&&<div style={{marginTop:10,fontSize:12,color:G.textoSec,fontStyle:"italic"}}>"{c.notas}"</div>}
              {movimientosDeEsteCierre.length>0&&(
                <div style={{marginTop:10,borderTop:`1px solid ${G.borde}22`,paddingTop:8}}>
                  <div style={{fontSize:11,color:G.textoSec,fontWeight:600,marginBottom:6}}>MOVIMIENTOS</div>
                  {movimientosDeEsteCierre.map(m=>(
                    <div key={m.id} style={{display:"flex",justifyContent:"space-between",fontSize:12,padding:"3px 0",color:G.textoSec}}>
                      <span>{BOLSILLOS.find(b=>b.key===m.origen)?.label||m.origen} → {BOLSILLOS.find(b=>b.key===m.destino)?.label||m.destino}{m.concepto?` · ${m.concepto}`:""}</span>
                      <span style={{fontFamily:"DM Mono,monospace",color:G.azul}}>{fmt(m.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

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
// MODULO: TAREAS Y PROYECTOS
// Las tareas viven en una sola tabla compartida (base de Pilar) con un campo "local".
// ============================================================
const LOCALES_TAREA = [{value:"ambos",label:"Ambos locales"},{value:"pilar",label:"Pensok Pilar"},{value:"camanio",label:"Pensok Caamaño"}];
const ESTADOS_TAREA = [{value:"pendiente",label:"Pendiente"},{value:"en_curso",label:"En curso"},{value:"hecha",label:"Hecha"}];
const PRIORIDADES_TAREA = [{value:"alta",label:"Alta"},{value:"media",label:"Media"},{value:"baja",label:"Baja"}];
const MESES_CAL = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const DIAS_CAL  = ["Lun","Mar","Mie","Jue","Vie","Sab","Dom"];
const fechaCal = (y,m,d)=>`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const labelLocalTarea = (v)=>LOCALES_TAREA.find(l=>l.value===v)?.label||v;
const colorPrioridad = (p)=>p==="alta"?G.rojo:p==="media"?G.amarillo:G.textoSec;

function ModuloTareas({tareas=[],responsables=[],vendedores=[],vendedoresOtro=[],onGuardar,onCambiarEstado,onEliminar,esAdmin=true,usuarioEmail=""}){
  // Nombre del vendedor asociado al usuario logueado (cruzando por email en ambos locales),
  // para saber si es el responsable de una tarea puntual.
  const miNombre = useMemo(()=>{
    const email = (usuarioEmail||"").trim().toLowerCase();
    if(!email) return "";
    const todos=[...(vendedores||[]),...(vendedoresOtro||[])];
    const match = todos.find(v=>(v.email||"").trim().toLowerCase()===email);
    return match?.nombre || "";
  },[vendedores,vendedoresOtro,usuarioEmail]);
  // Fallback solo para logins que no se pueden identificar por email — hoy, la PC compartida de
  // Pilar entre Fabri y Maxi (Caamaño ya tiene un email por persona, así que ahí esto no se usa:
  // miNombre resuelve directo al nombre real de quien está logueado).
  const RESPONSABLES_SIN_EMAIL = ["fabri","maxi"];
  const esResponsable = (t)=>{
    if(!t.responsable) return false;
    const resp = t.responsable.trim().toLowerCase();
    if(miNombre) return resp===miNombre.trim().toLowerCase();
    return RESPONSABLES_SIN_EMAIL.includes(resp);
  };
  // Puede editar / completar: admin, el responsable de la tarea, o cualquiera si no tiene responsable asignado
  const puedeGestionar = (t)=> esAdmin || esResponsable(t) || !t.responsable;
  // Las tareas que se auto-completan desde Control de Stock no se pueden tildar a mano desde acá
  const esAutoGestionada = (t)=> t.proyecto==="Control de Stock (ajuste)";
  const [tab,setTab]                   = useState("lista");
  const [modal,setModal]               = useState(false);
  const [editando,setEditando]         = useState(null);
  const [confirmarElim,setConfirmarElim]= useState(null);
  const [modalCompletar,setModalCompletar] = useState(null); // tarea que se está marcando como hecha
  const [comentarioCierre,setComentarioCierre] = useState("");
  const [loading,setLoad]              = useState(false);
  // Filtros
  const [fResp,setFResp]         = useState("Todos");
  const [fLocalF,setFLocalF]     = useState(localKey); // por defecto lo del local actual (+ las de "ambos")
  const [fProyecto,setFProyecto] = useState("Todos");
  const [buscar,setBuscar]       = useState("");
  const [verHechas,setVerHechas] = useState(false);
  // Formulario
  const [fTitulo,setFTitulo] = useState("");
  const [fDesc,setFDesc]     = useState("");
  const [fRespon,setFRespon] = useState("");
  const [fLocalT,setFLocalT] = useState(localKey);
  const [fPrio,setFPrio]     = useState("media");
  const [fFecha,setFFecha]   = useState("");
  const [fProy,setFProy]     = useState("");
  const [fEstado,setFEstado] = useState("pendiente");
  const [fComentarioCierre,setFComentarioCierre] = useState("");
  // Calendario
  const [mesCal,setMesCal] = useState(()=>{const d=new Date();return{y:d.getFullYear(),m:d.getMonth()};});
  const [diaSel,setDiaSel] = useState(null);

  const hoyStr = hoy();

  const proyectos = useMemo(()=>{
    const s=new Set(); (tareas||[]).forEach(t=>{if(t.proyecto) s.add(t.proyecto);});
    return [...s].sort();
  },[tareas]);

  function abrirNueva(){
    setEditando(null);
    setFTitulo("");setFDesc("");setFRespon(responsables[0]||"");
    setFLocalT(localKey);setFPrio("media");setFFecha("");setFProy("");setFEstado("pendiente");
    setFComentarioCierre("");
    setModal(true);
  }
  function abrirEditar(t){
    setEditando(t);
    setFTitulo(t.titulo||"");setFDesc(t.descripcion||"");setFRespon(t.responsable||"");
    setFLocalT(t.local||"ambos");setFPrio(t.prioridad||"media");setFFecha(t.fecha_limite||"");
    setFProy(t.proyecto||"");setFEstado(t.estado||"pendiente");
    setFComentarioCierre(t.comentario_cierre||"");
    setModal(true);
  }
  async function guardar(){
    if(!fTitulo.trim())return;
    setLoad(true);
    const datos={
      titulo:fTitulo.trim(), descripcion:fDesc.trim()||null, responsable:fRespon||null,
      local:fLocalT, prioridad:fPrio, fecha_limite:fFecha||null,
      proyecto:fProy.trim()||null, estado:fEstado,
    };
    if(!editando) datos.creado_por = usuarioEmail||"";
    if(fEstado==="hecha"){
      // Si ya estaba hecha, respetamos el sello original; si recién se marca, lo ponemos ahora
      datos.completada_at = editando?.estado==="hecha" ? editando.completada_at : new Date().toISOString();
      datos.completada_por= editando?.estado==="hecha" ? editando.completada_por : (usuarioEmail||"");
      datos.comentario_cierre = fComentarioCierre.trim()||null;
    }else{
      datos.completada_at=null; datos.completada_por=null; datos.comentario_cierre=null;
    }
    const ok = await onGuardar(datos, editando?.id||null);
    setLoad(false);
    if(ok!==false) setModal(false);
  }

  // ── Filtrado ──
  const visibles = (tareas||[]).filter(t=>{
    if(fLocalF!=="todos" && t.local!==fLocalF && t.local!=="ambos") return false;
    if(fResp!=="Todos" && t.responsable!==fResp) return false;
    if(fProyecto!=="Todos" && t.proyecto!==fProyecto) return false;
    if(buscar){
      const txt=`${t.titulo||""} ${t.descripcion||""} ${t.proyecto||""} ${t.responsable||""}`.toLowerCase();
      if(!txt.includes(buscar.toLowerCase())) return false;
    }
    return true;
  });

  const pendientes = visibles.filter(t=>t.estado!=="hecha");
  const ordenFecha = (a,b)=>(a.fecha_limite||"9999").localeCompare(b.fecha_limite||"9999");
  const vencidas = pendientes.filter(t=>t.fecha_limite&&t.fecha_limite<hoyStr).sort(ordenFecha);
  const deHoy    = pendientes.filter(t=>t.fecha_limite===hoyStr).sort(ordenFecha);
  const proximas = pendientes.filter(t=>t.fecha_limite&&t.fecha_limite>hoyStr).sort(ordenFecha);
  const sinFecha = pendientes.filter(t=>!t.fecha_limite);
  const hechas   = visibles.filter(t=>t.estado==="hecha")
    .sort((a,b)=>(b.completada_at||"").localeCompare(a.completada_at||""));

  // ── Fila de tarea ──
  const Fila = ({t})=>{
    const hecha = t.estado==="hecha";
    const vencida = !hecha && t.fecha_limite && t.fecha_limite<hoyStr;
    const gestiona = puedeGestionar(t);
    const autoGestionada = esAutoGestionada(t);
    const puedeCompletar = gestiona && !autoGestionada;
    const tituloCheckbox = autoGestionada
      ? "Esta tarea se completa sola al aplicar el ajuste desde Control de Stock"
      : (!gestiona?`Solo ${t.responsable} o un admin pueden completar esta tarea`:undefined);
    return(
      <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:G.sup2,border:`1px solid ${vencida?G.rojo+"55":G.borde}`,borderRadius:9,borderLeft:`3px solid ${hecha?G.verde:colorPrioridad(t.prioridad)}`}}>
        <input type="checkbox" checked={hecha} disabled={!puedeCompletar} title={tituloCheckbox}
          style={{marginTop:3,cursor:puedeCompletar?"pointer":"not-allowed",flexShrink:0,opacity:puedeCompletar?1:0.5}}
          onChange={e=>{
            if(!puedeCompletar) return;
            if(e.target.checked){ setComentarioCierre(""); setModalCompletar(t); }
            else onCambiarEstado(t.id,"pendiente",usuarioEmail);
          }}/>
        <div style={{flex:"1 1 auto",minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,textDecoration:hecha?"line-through":"none",color:hecha?G.textoSec:G.texto}}>{t.titulo}</div>
          {t.descripcion&&<div style={{fontSize:11,color:G.textoSec,marginTop:2,whiteSpace:"pre-wrap"}}>{t.descripcion}</div>}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6,alignItems:"center"}}>
            {t.responsable&&<Badge small color="azul">{t.responsable}</Badge>}
            {t.fecha_limite&&<Badge small color={vencida?"rojo":"amarillo"}>{vencida?"⚠ ":"📅 "}{t.fecha_limite}</Badge>}
            {t.proyecto&&<Badge small color="violeta">📁 {t.proyecto}</Badge>}
            <Badge small>{labelLocalTarea(t.local)}</Badge>
            {t.estado==="en_curso"&&<Badge small color="azul">En curso</Badge>}
            {hecha&&t.completada_at&&<span style={{fontSize:10,color:G.textoSec}}>✓ {new Date(t.completada_at).toLocaleDateString("es-AR")}{t.completada_por?` · ${t.completada_por}`:""}</span>}
          </div>
          {hecha&&t.comentario_cierre&&<div style={{fontSize:11,color:G.textoSec,marginTop:5,fontStyle:"italic",background:G.sup,borderRadius:6,padding:"5px 8px"}}>💬 {t.comentario_cierre}</div>}
        </div>
        <div style={{display:"flex",gap:4,flexShrink:0}}>
          {gestiona&&!hecha&&t.estado!=="en_curso"&&<Btn small variant="ghost" onClick={()=>onCambiarEstado(t.id,"en_curso",usuarioEmail)}>▶ En curso</Btn>}
          {gestiona&&<Btn small variant="ghost" onClick={()=>abrirEditar(t)}>Editar</Btn>}
          {esAdmin&&<Btn small variant="ghost" onClick={()=>setConfirmarElim(t)}>✕</Btn>}
        </div>
      </div>
    );
  };

  const Seccion = ({titulo,items,color})=> items.length===0?null:(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      <div style={{fontSize:11,fontWeight:700,color:color||G.textoSec,textTransform:"uppercase",letterSpacing:1}}>{titulo} ({items.length})</div>
      {items.map(t=><Fila key={t.id} t={t}/>)}
    </div>
  );

  // ── Calendario ──
  const primerDiaSemana = (new Date(mesCal.y,mesCal.m,1).getDay()+6)%7; // lunes = 0
  const diasEnMes = new Date(mesCal.y,mesCal.m+1,0).getDate();
  const tareasPorDia = useMemo(()=>{
    const map={};
    visibles.forEach(t=>{ if(t.fecha_limite){ (map[t.fecha_limite]=map[t.fecha_limite]||[]).push(t); } });
    return map;
  },[visibles]);
  const moverMes = (delta)=>{
    setDiaSel(null);
    setMesCal(({y,m})=>{const d=new Date(y,m+delta,1);return{y:d.getFullYear(),m:d.getMonth()};});
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
        <MetricCard label="Pendientes" value={pendientes.length}/>
        <MetricCard label="Vencidas"   value={vencidas.length} color={vencidas.length?G.rojo:undefined} accent={vencidas.length?G.rojo+"55":undefined}/>
        <MetricCard label="Vencen hoy" value={deHoy.length}    color={deHoy.length?G.amarillo:undefined}/>
        <MetricCard label="Hechas"     value={hechas.length}   color={G.verde}/>
      </div>

      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        {[{k:"lista",l:"📋 Lista"},{k:"calendario",l:"🗓 Calendario"}].map(t=>(
          <Btn key={t.k} small variant={tab===t.k?"primary":"secondary"} onClick={()=>setTab(t.k)}>{t.l}</Btn>
        ))}
        <div style={{flex:1}}/>
        <Btn onClick={abrirNueva}>+ Nueva tarea</Btn>
      </div>

      <Card>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr",gap:10}}>
          <Fi label="Buscar" value={buscar} onChange={setBuscar} placeholder="🔍 Titulo, proyecto, responsable..."/>
          <Fi label="Responsable" value={fResp} onChange={setFResp} options={["Todos",...responsables]}/>
          <Fi label="Local" value={fLocalF} onChange={setFLocalF}
            options={[{value:"todos",label:"Todos"},{value:"pilar",label:"Pilar (+ ambos)"},{value:"camanio",label:"Caamaño (+ ambos)"}]}/>
          <Fi label="Proyecto" value={fProyecto} onChange={setFProyecto} options={["Todos",...proyectos]}/>
        </div>
      </Card>

      {tab==="lista"&&(
        <Card>
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Seccion titulo="⚠ Vencidas"   items={vencidas} color={G.rojo}/>
            <Seccion titulo="Vencen hoy"   items={deHoy}    color={G.amarillo}/>
            <Seccion titulo="Proximas"     items={proximas}/>
            <Seccion titulo="Sin fecha"    items={sinFecha}/>
            {pendientes.length===0&&<div style={{textAlign:"center",color:G.textoSec,fontSize:13,padding:"30px 0"}}>No hay tareas pendientes con estos filtros 🎉</div>}
            {hechas.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                <div style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}} onClick={()=>setVerHechas(v=>!v)}>
                  <div style={{fontSize:11,fontWeight:700,color:G.verde,textTransform:"uppercase",letterSpacing:1}}>
                    {verHechas?"▾":"▸"} Hechas ({hechas.length})
                  </div>
                </div>
                {verHechas&&hechas.slice(0,50).map(t=><Fila key={t.id} t={t}/>)}
              </div>
            )}
          </div>
        </Card>
      )}

      {tab==="calendario"&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <Btn small variant="secondary" onClick={()=>moverMes(-1)}>← Anterior</Btn>
            <div style={{fontWeight:600,fontSize:15}}>{MESES_CAL[mesCal.m]} {mesCal.y}</div>
            <Btn small variant="secondary" onClick={()=>moverMes(1)}>Siguiente →</Btn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:5}}>
            {DIAS_CAL.map(d=><div key={d} style={{fontSize:10,color:G.textoSec,textAlign:"center",fontWeight:600,textTransform:"uppercase",letterSpacing:0.5,paddingBottom:4}}>{d}</div>)}
            {Array.from({length:primerDiaSemana}).map((_,i)=><div key={`e${i}`}/>)}
            {Array.from({length:diasEnMes},(_,i)=>i+1).map(d=>{
              const f = fechaCal(mesCal.y,mesCal.m,d);
              const delDia = tareasPorDia[f]||[];
              const esHoy = f===hoyStr;
              const pend = delDia.filter(t=>t.estado!=="hecha");
              const hayVencidas = f<hoyStr && pend.length>0;
              return(
                <div key={d} onClick={()=>setDiaSel(diaSel===f?null:f)}
                  style={{minHeight:64,background:diaSel===f?G.sup:G.sup2,border:`1px solid ${esHoy?G.verde:diaSel===f?G.azul:G.borde}`,borderRadius:8,padding:"5px 6px",cursor:delDia.length?"pointer":"default",display:"flex",flexDirection:"column",gap:3}}>
                  <div style={{fontSize:11,fontWeight:esHoy?700:500,color:esHoy?G.verde:G.textoSec}}>{d}</div>
                  {delDia.slice(0,3).map(t=>(
                    <div key={t.id} style={{fontSize:9,padding:"1px 4px",borderRadius:4,background:t.estado==="hecha"?G.verde+"22":hayVencidas?G.rojo+"22":G.azul+"22",color:t.estado==="hecha"?G.verde:hayVencidas?G.rojo:G.azul,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:t.estado==="hecha"?"line-through":"none"}}>
                      {t.titulo}
                    </div>
                  ))}
                  {delDia.length>3&&<div style={{fontSize:9,color:G.textoSec}}>+{delDia.length-3} mas</div>}
                </div>
              );
            })}
          </div>
          {diaSel&&(
            <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:8}}>
              <ST>Tareas del {diaSel}</ST>
              {(tareasPorDia[diaSel]||[]).map(t=><Fila key={t.id} t={t}/>)}
            </div>
          )}
          <div style={{marginTop:14,fontSize:10,color:G.textoSec}}>
            El calendario muestra las tareas en su fecha limite: hacia atras queda el historial de lo hecho, hacia adelante lo que viene. Las tareas sin fecha solo aparecen en la Lista.
          </div>
        </Card>
      )}

      {modal&&(
        <Modal title={editando?"Editar tarea":"Nueva tarea"} onClose={()=>setModal(false)} maxWidth={560}
          footer={<><Btn variant="secondary" onClick={()=>setModal(false)}>Cancelar</Btn>
            <Btn disabled={!fTitulo.trim()||loading} onClick={guardar}>{loading?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando</span>:"Guardar tarea"}</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Fi label="Tarea" value={fTitulo} onChange={setFTitulo} placeholder="Ej: Pedir presupuesto de cartel"/>
            <Fi label="Detalle (opcional)" value={fDesc} onChange={setFDesc} rows={2} placeholder="Notas, contexto..."/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Fi label="Responsable" value={fRespon} onChange={setFRespon} options={[{value:"",label:"(sin asignar)"},...responsables.map(r=>({value:r,label:r}))]}/>
              <Fi label="Local" value={fLocalT} onChange={setFLocalT} options={LOCALES_TAREA}/>
              <Fi label="Prioridad" value={fPrio} onChange={setFPrio} options={PRIORIDADES_TAREA}/>
              <Fi label="Fecha limite (opcional)" value={fFecha} onChange={setFFecha} type="date"/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div>
                <Fi label="Proyecto (opcional)" value={fProy} onChange={setFProy} placeholder="Ej: Obra Caamaño"/>
                {proyectos.length>0&&(
                  <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                    {proyectos.slice(0,6).map(p=>(
                      <button key={p} onClick={()=>setFProy(p)} style={{background:fProy===p?G.violeta:G.sup2,color:fProy===p?"#fff":G.textoSec,border:`1px solid ${G.borde}`,borderRadius:6,padding:"3px 7px",fontSize:10,cursor:"pointer"}}>{p}</button>
                    ))}
                  </div>
                )}
              </div>
              {editando&&<Fi label="Estado" value={fEstado} onChange={setFEstado} options={ESTADOS_TAREA}/>}
            </div>
            {fEstado==="hecha"&&<Fi label="Comentario de cierre (opcional)" value={fComentarioCierre} onChange={setFComentarioCierre} rows={2} placeholder="Cómo quedó, algo a tener en cuenta..."/>}
          </div>
        </Modal>
      )}

      {modalCompletar&&(
        <Modal title="Marcar como hecha" onClose={()=>setModalCompletar(null)}
          footer={<><Btn variant="secondary" onClick={()=>setModalCompletar(null)}>Cancelar</Btn>
            <Btn onClick={()=>{onCambiarEstado(modalCompletar.id,"hecha",usuarioEmail,comentarioCierre.trim());setModalCompletar(null);}}>Marcar como hecha</Btn></>}>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <p style={{color:G.textoSec,fontSize:13,margin:0}}><strong>{modalCompletar.titulo}</strong></p>
            <Fi label="Comentario (opcional)" value={comentarioCierre} onChange={setComentarioCierre} rows={3} placeholder="Cómo quedó, algo a tener en cuenta para la próxima..."/>
          </div>
        </Modal>
      )}

      {confirmarElim&&(
        <Modal title="Eliminar tarea" onClose={()=>setConfirmarElim(null)}
          footer={<><Btn variant="secondary" onClick={()=>setConfirmarElim(null)}>Cancelar</Btn>
            <Btn variant="danger" onClick={async()=>{await onEliminar(confirmarElim.id);setConfirmarElim(null);}}>Si, eliminar</Btn></>}>
          <p style={{color:G.textoSec,fontSize:13}}>Eliminar la tarea <strong>{confirmarElim.titulo}</strong>? Si ya esta hecha, conviene dejarla para que quede en el historial del calendario.</p>
        </Modal>
      )}
    </div>
  );
}

// ============================================================
// MODULO: CONTROL DE STOCK (conteo físico por categoría + ajuste)
// Cualquier usuario puede registrar un conteo (queda histórico, no toca productos.stock).
// Solo esAdmin puede "aplicar" un conteo puntual, lo que sí pisa productos.stock.
// ============================================================
function ModuloControlStock({productos=[],conteosStock=[],onCrear,onAplicar,onEditarConteo,vendedores=[],vendedoresOtro=[],esAdmin=true,usuarioEmail=""}){
  // Nombre del vendedor asociado al usuario logueado (cruzando por email en ambos locales) — mismo patrón que ModuloTareas.
  const miNombre = useMemo(()=>{
    const email=(usuarioEmail||"").trim().toLowerCase();
    if(!email) return "";
    const todos=[...(vendedores||[]),...(vendedoresOtro||[])];
    const match=todos.find(v=>(v.email||"").trim().toLowerCase()===email);
    return match?.nombre || "";
  },[vendedores,vendedoresOtro,usuarioEmail]);
  const responsableActual = miNombre || usuarioEmail || "—";

  const [vista,setVista]           = useState("historial"); // historial | nuevo
  const [categoriaSel,setCategoriaSel] = useState("");
  const [valores,setValores]       = useState({}); // producto_id -> string cargado
  const [respSel,setRespSel]       = useState(""); // responsable del conteo, elegido de la lista de vendedores
  const [guardando,setGuardando]   = useState(false);
  const [verConteo,setVerConteo]   = useState(null); // conteo abierto en el modal de detalle/aplicar
  const [aplicando,setAplicando]   = useState(false);
  const [editandoConteo,setEditandoConteo] = useState(false); // true = el detalle está en modo corrección
  const [valoresEdicion,setValoresEdicion] = useState({}); // item_id -> string, mientras se corrige un conteo
  const [guardandoEdicion,setGuardandoEdicion] = useState(false);
  const [generandoPlanilla,setGenerandoPlanilla] = useState(false);

  // Precargar el responsable con el nombre del usuario logueado (si matchea), pero queda editable.
  useEffect(()=>{ if(!respSel && miNombre) setRespSel(miNombre); },[miNombre]);

  const productosCategoria = useMemo(()=>
    productos.filter(p=>p.activo&&p.categoria===categoriaSel).sort((a,b)=>a.nombre.localeCompare(b.nombre))
  ,[productos,categoriaSel]);

  // Ranking histórico de diferencias por producto, cruzando todos los conteos (aplicados o no) —
  // para detectar qué productos dan diferencia recurrente y poner foco ahí. Usa diferencia absoluta
  // como orden principal porque un producto que oscila (+3, -3, +2...) es tan problemático como uno
  // que siempre falta, aunque el total con signo dé cerca de cero.
  const rankingDiferencias = useMemo(()=>{
    const porProducto = {};
    for(const c of conteosStock){
      for(const it of (c.conteos_stock_items||[])){
        const dif = it.stock_contado - it.stock_sistema;
        if(!porProducto[it.producto_id]){
          porProducto[it.producto_id] = {
            producto_id: it.producto_id, nombre: it.nombre, categoria: c.categoria,
            vecesContado: 0, vecesConDiferencia: 0, diferenciaTotal: 0, diferenciaAbsTotal: 0,
            ultimaFecha: c.fecha, ultimaDiferencia: dif,
          };
        }
        const reg = porProducto[it.producto_id];
        reg.vecesContado += 1;
        if(dif!==0) reg.vecesConDiferencia += 1;
        reg.diferenciaTotal += dif;
        reg.diferenciaAbsTotal += Math.abs(dif);
        if(new Date(c.fecha) >= new Date(reg.ultimaFecha)){
          reg.ultimaFecha = c.fecha; reg.ultimaDiferencia = dif; reg.nombre = it.nombre; reg.categoria = c.categoria;
        }
      }
    }
    return Object.values(porProducto)
      .filter(r=>r.vecesConDiferencia>0)
      .sort((a,b)=>b.diferenciaAbsTotal-a.diferenciaAbsTotal);
  },[conteosStock]);

  function iniciarCategoria(cat){ setCategoriaSel(cat); setValores({}); }

  const faltantes    = productosCategoria.filter(p=>valores[p.id]===undefined||valores[p.id]==="").length;
  const puedeGuardar = categoriaSel && productosCategoria.length>0 && faltantes===0 && respSel;

  async function guardarConteo(){
    if(!puedeGuardar) return;
    setGuardando(true);
    const items = productosCategoria.map(p=>({id:p.id,codigo:p.codigo,nombre:p.nombre,stock:p.stock,contado:parseInt(valores[p.id])||0}));
    const ok = await onCrear({categoria:categoriaSel,responsable:respSel,items});
    setGuardando(false);
    if(ok){ setCategoriaSel(""); setValores({}); setVista("historial"); }
  }

  async function confirmarAplicar(){
    if(!verConteo) return;
    setAplicando(true);
    await onAplicar(verConteo.id,responsableActual);
    setAplicando(false);
    setVerConteo(null);
  }

  // Abre el detalle de un conteo en modo corrección (solo admin, solo si todavía no se aplicó)
  function abrirEdicionConteo(){
    if(!verConteo) return;
    const iniciales={};
    (verConteo.conteos_stock_items||[]).forEach(it=>{ iniciales[it.id]=String(it.stock_contado); });
    setValoresEdicion(iniciales);
    setEditandoConteo(true);
  }
  async function guardarEdicionConteo(){
    if(!verConteo) return;
    setGuardandoEdicion(true);
    const itemsEditados=(verConteo.conteos_stock_items||[]).map(it=>({id:it.id,contado:parseInt(valoresEdicion[it.id])||0}));
    await onEditarConteo(itemsEditados);
    setGuardandoEdicion(false);
    setEditandoConteo(false);
    setVerConteo(null); // se cierra; el historial ya queda actualizado al reabrir
  }

  // Planilla en PDF para recorrer el local y contar a mano, antes de cargar los números en el sistema.
  async function imprimirPlanillaConteo(categoria,lista){
    setGenerandoPlanilla(true);
    if(!window.jspdf){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload=res; s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
    const W=210, H=297;
    const azul=[20,53,107], azulClaro=[41,98,180], gris=[100,100,100], grisClar=[240,242,245], negro=[30,30,30], blanco=[255,255,255];
    const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAQABAADASIAAhEBAxEB/8QAGwABAQADAQEBAAAAAAAAAAAAAAEEBQYDAgf/xAAYAQEBAQEBAAAAAAAAAAAAAAAAAQIDBP/aAAwDAQACEAMQAAAC1Q78rAAAAABAAAAAAAUEABQQAAAAFABAAUAAEABQAQFAAAAAABAAUEAABQAAAAQAAFBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABCoKAAAAAhaAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQACABYKACBAWoKCWCpQESwAAWVQCUELABFhalBBYSpQAFABAAUAAEAAAAAAAAAJQAAAAAAAQAAAqVUAEqFqUEKgssAQAChRAEAAqVYAEBQQAAAFBAAAUAEBQQUEAAAAAAAKgqCoAKlEABYLAAAqUAAAAJQBLAAAAAAAACoUEBbLAEUVABAAAAAAAAAUUgAQAFABAAAAKgsoiwAKIAAAAAFBABSLAAAAAABYKgoUQWVAAAEsUEAAAAAAAAABalIAEBQAQAAAAAFoEAEAFWKIoiiLAEAAoAAEsAAAAAFgAAWCyiAKIAAAAABZVSiAqCpQEQUEBQQAAAAFBAAAUEBQQAAAAAAAAFBAAKFBBFABAAAKAABKWKIEAAAAWVQSUAJYKCAAsoiwAAoAWBAAWoAAAAAAQAAFBAAAAAAAAAAAAAAUAAABYAAQAAAAABYKAACLFBAAAAAAAAAAAFgAAUAAEpYEAAAABQAAQAAAAAAAAAAAAAFABAUAAAEBQAQAAAFBAAAKgsFWCwQAAAAAAAAAAAAAACpSBagBAAAAAClgAQAFBAAAAACiAKIAAAAFBAUEAAAAAAABQQFABAAAAAAAAAAAAAAAAAAAAAFgAAABQQAACwUEABQQAAAABYKgAAAAAAAMnYy6V1OZm8Zk9ml5P26ZLzv3vxoPnoRzfl1I4/w7hZwM7vDrkHQ67WdesoEAABQQAAAAAAAAAAAAAAFBAAAABSAAAAAAAAAABQAQAAAAAAAAAAAbNdZkdLsca0G2yWNWY+tN05XC1ns8XkFdP5c4s3/wAaMbv60Sug9ObR1mRxdjvLweXL2Lndjm52s2tl5PXd747zw7f6XefIUCAAAAAAoIAAAAKRRFgAAAAAAAAAAAAAAAAAACgAgAKCAAAAAADLXE2W82HPWJlsTGsvy5zVbz0OoxG8rFgAAAAAAAAH3tNQXrthwOVjXa/Go3HPWk0Pd+WpwrdabpiCwAAFABAAAAAFlAAEsAAAAAAAUAAEAAAABQAQAAAAFABAAAAF9uqmtdvbOW7j6jRazs9XHTIIAAAAABleGz9vO0dzsHsStIAAABkY5en2/A5uNdjhXN564rG7vm+mNONwAAAEAAAAFJQAASwAAAAAAABSwBAAAAUAAEAAAAAAAAAAZ/v0+N+fq0/PWby+N89cBrIAAAAApFgKbn7PAuNkjRza6r2PrLweo1rmHdazN5dstdvMCAAXf8+l768h1PLprea7zA1OQenn0wACAAAAFgAAAAAAAAAAAAosACAAAAoAICgAgAAAAAADdOkxsnLY176Q68woEAACl+snDD9M/wBObB9cpznl9/dwVc2iKBrtj87aP38Htve3V7Th0eHuOc0/d+O5w7cafpgEAZGOXs8vher5b++R7rEOMenn1wAACACiAAAAAAAAAAAABQCKACAAAAAAAAKCUQAAADa4/X419S8tjc1Z25ggAAC3Lyx8r0vGUc1spRFssWyxQtEAajwysX3Nn1HC/TXduY3fPeYJWFmk4rG7zmeuNSNZAffwXr8/hOw5b8+S7zU1y46YBAAAAAAAAAAAAAAAAKBLFBAUEAAAAAAAqVUAEAAevl1cuZ7tXx6YmgO3MLAABSe/368pfr5+uUt+bFspRLbPqFyMm3X3becut+8rxieZmAavF9fL3A0WDadFxP1nXeOf3/PdEuj57vdNvHNLOmAHv4F7j24/r+O+d0ne8buYg3kEAAAAAAAAAAAABQCgESlgQAAAApYoiiABAUAEAHsuy6bz9OPTw43M1/TEGsgAD6GS++OaMLZYtli1sl12XufS7wsvE1q7bAwmc+klxKWAHn6a3bEle1AAAMzDL2uTwvV8t54zrS8333O7xox0wA3uisve4nzm8enBTe6LtzCwAAAAAAAAAAAAFWUBAEFBAAAAKhQAAQAAAAFdNo+zxq6jacVm+UOvMAAC5U++OVlwoLZmxi7PZe16fH38ae62OpxrzxaZzaLbLFsRbIeen9PP2BOgAAAKfXzTq9lwfWcumwGNcjr+44vrz8xrIGX2XBdJje44nuNNm80OuAQAAAAAAAAAAAFABKCLFBAAAAAAAAAAFlIsBkL0G2fHDppOf9PPtzCwAB7+eTzlHPKyw+vromsXaF7MTE1Ux7ecuMWyxbKWxFsstPhPvVfPl6qh1AAACjqvna8983pu952tH6+Tpntcni+y47+tPuGbwLMw+/MEevkXu/rSb3j04jH6PnOvMLAAAAAAAAAAAAAAKFQAQAAAAAAAAABYLAdDoO3xr10e84rOseHXmAAr1j0+jhgC5M6Zv59UvVpPPDzzpc4WWW2D6SxbLFvzh1ka34eqoboIAAA6bH6DnsMbeXrprOaHbk3WlL3zCzeHTXcl33G9M4Y3kE9+34Hqsb2PDd5y8akdMggAAAAAAAAAAAALUAAIAAACgAgAAAAAGx63T7jl0wOR3Om3mDWQBRlePvyyHOMjy6i6+/QvaaH612edssxbLCywqivmX788PH7X08juAAAAAffwXufXkeu49AlYGeTgXQ6Htz+G7xD57DgerzrZ6fcfHPXCPr578wRs9Z9L3muz7w6cE+/jvzBAAAAAAAAAAAAUAAAAAEAAAFWLEAAAAGSvX+zE4dOT8DvzBAFn0ZH1Z58LNqufnF7tRk89MLmZ0xpvro8hrnPfeLrUemzLrvn453WcvA+XXIUAAAAAAA6LnfuXu3j7cegKAxsknAZ/1ru/Pv2LlcOnKazo+c7YC5A6racz0/Hpymr6Tm+uQsBAUEAAAAAAABQQFAoEsAAQAAAAAAAABuNP0mdbrTbnmMa1A68wAHt45OZ9jhn26rA2N7Bd4Gb9JBLaxca42bTeWpueYnjvGI9PPVCAAAAAUAEAA3XScJ3HPf2MbAA1XLd3wvTnvOh4rts6wuN73gtQN4Ayu14DvOe8bjO94OoN4AAAAAAAABQAAQFAABAAAAAAAAAAAL1vI9tjeRx3Y8LHmOmAAGZi5fPLMdDz16C9jz1VxuMDSfPXlnYUdOZFlQJfBceWc+wAAAqpYAgAAADqOX2+ddOOXQAc/ZveJeXTDt+I6eNxw3c8VLijpgB2XG9TjW24rtOSl1w6YAAAAAAAAAAAAAoIFAABAAAAFlUCBAAHecL3nPc4LuOHoN4AA9N3hdZy1Kxc7ydPrPPtx9InXiAAAAxMvBm5LMdAAAFgsAAAAABk41XvRw6gjhu55DecAdMN5o9lL1vGdnxeNYg6YAdHzm+zroeY6fnMa0Y68wAAAAAAAAAABQCBQAQAAAAAACwUEAA9O74buee8Xi+y42oN4ACt50XP+nLeRoPl24/Xr8/WsAgAFudiHlZRr8/Az0gzsAAAAAAAAABLDu/Ty9eHUFcv1Gk1nnB15szDyF7fiO34HnqDpgBu9JuprpNBv9Dz1z468wAAAAAAAAAAAABVgAQAAAAAAAAAAD27ng+857xOM7biKDeAArI+vH21gLn2WMgAMry2UjX7DDTEst01+wwZv4GOgAAAAAAAAAA9F7j6OHUAD40u911zyft45HbHXcR1XLYsG8gN3pN7NdDod/zvPWiHXmAAAAABZYAAACrAgCyrFCUQIAAAAAAAAABe94HuMb++E77gz5G8ALLX17eHvrD6+fq59QyAsyzI9DOXj7Q1NTWri5XmuEOfcAEAAAAAAFIomfg72XoBx6gANTttDc8/nYO07Y99LkY8RZYA6Lnepzrbcz03J41rB15gAAAAAAAAAVKARQAAgoIAAAAAAAsolgA7Dj+nzrccV2nK51qx05gLKMjH99Z+rGsewZA+tnjZUgSLBhY2z1uqC4fnm4WesVncWAIAAAA+/jp5czzz3Hpotd1zU4Pssj6AzoA8PBM7lui4/efHY6726Z8QiUQF7Dj+7xv74vs+Dj5HTAFlgAAAAAAAABUoItCAQKACAAAAAALAAA3mjzpew0W9wOXTkB25AAX087ZkI3z9r8fbKz3M6mcgAXXbDGrDhdPL1GAysbHaSpqBAABSPro5fDoHjy6ezj7qde0GzzcwSgCHJ6/08u/KiwIJQCAye25jp+XTF4rpuZ3kNZAoIsAAAAAAAAAWggFgBAAAAAAAAAAAH18l7y67ZcOnB/Oz1nfmCAAZF8vXpzvt4erP1mYeczkDMAAfH2rUqupQfH2ML42HxneEyPOb859l+Wbn5uj2XQ5WNY2VrtFLuua8p0wFgGVuecS9398Lu8b374+8a8eb6pZwTpub68/gWAVKCnT7Xz9OHXmNR6+XbmFgFSiAAAAAAAACgWAAACWUQAAAAAAAAAAG46fhe459NVy/ecNZ8DeAFgvv4ems+n18tYyMvAyGNiM5BQR8feNbiKaiiKrFuThZ3sMznbnp1vtxkzrsMXmhuNb4yyossAAoiiWD36PlU13zmOl5b+ud3vE6nwOnMBQbHXdRnW1wc7mue9MO3IAAFBAAAAAAAAUAAEAAqUiwAAFVKIEAAAAAdVyuwzrr+Z6bF574pZ25ggCwZF8fbpze3jWdhmaj3Z2DH+5PV4+BkYfn9W0SxSxRKJiY+z8J0w59TO4ogABQAABKEqpmYv0my1Nk0CAUHr2+i33Lp88P0PN6zBvIAAAKCAAAoAIAClgCAACgAEAAsoABFiggAAAHZ5nKdXx6crqu24rpmDWQAL6eash8/W+V9PImQ8vRKEUPq/H1KUsUSgBMXMS6ubPwm8J7eTUKBAABfWvFm/bON9vjWXjfmbgzQAL6efQS7r7arj00OKd+aCAAAAAAACqlECAAtgAigBKAAECgiygACWKCAAAAOw4/Mzrs+b6P4574R7+HbmCAVKX18bZ7pd81g9fvwqe74+2QPr687L9lliiKIoihLTw+ckuIyy4n1k1Mf0+/E9vPG+a+/gp5PjO0M6AAWWsjs8DY8ek4vcc/qIbwAoJRFgAAAAsFQAAAAAUAALAAgKCVBQAQKACAAAAdJu+D7Ll08OS73n7NCOmAAFgvt4WzIfH3vmAsHr945Mlj/ae314/R7Xx+pfRPrKKWKD5+a9Hh8GVMKVk+XmAqAeU+c7EzoAABusDsca+sfI5HGsL5O2EsQCgASwAAAAABQQABQSglUEIAAAAAAAAAAAAAAGbhF728103HpyOu7vjumMUayAAA9PO173w9NY+xcgAAALBUFAQVBUFQWTzl+/KM7CWAAFJ6/HWy+2S13Hph89Z25hYKSgAAlgAAAAACggALQgAKCQAAKCAAAAFgAAAAAAA6PnEvfeOv2/HpxON2/JdcYo1kACoKC+nksyHh9az6vn6uQAAAAAAD4+JfXz+E2GaABAAPp1MrZvDj0+OQ+/DriLNZAoBACglBKIsAAAAAACxahAKACAAAAAFJQAASiLAAAAAAC9Ry1l77y1e549OPwe85rpjTjeQAAFgqC2K+vrzJ6/Xgs97jjIY4954j1nml+vkUISgQqAAUnp7dXnXhsGLy398j8+PXAayAlhUAAFAAIVBUpFgAAAAKQAFABAFiggAFSgBCgiwVAAAAAAACt9oUd9eS6jl01vNd5j2cQ2Wt64BAAAAAAKgqCoFgoACCwAC+64+42ez56+Pto86zeV851wFyAsAAAAFAIWAABUoBFgAAspAoJQJRLKIKCALKsCAAAAAAAAAAAAAPfwL1uy4Db89dPrM72xricfvdP0zzLJxt5BAAAAAAAAKABKIv0fH1ud7nWk3/ANOe74aznrM7WnXAAIAAAAKRQAlEAAAsoAAQAAACqCAARYoIAAAAACggAAAAAAAAAAH3vefS9598Luue9/rs30zeU13e+e88I6nW6moe3jqAgAAApFUPqPlsNjNc9l9Tk4ul2/2zqtXorOg53DbyGsgAAAAAAUAAACUQAoBAAAAAAqiAAoIligAAAAAgAKCAAAoIAAAAAAAB9bTUl63Y8D6413Tl9jm7fw+cnN1mLvZXOePUrOS+evHIXr5XKe3TI5/J2yMXKfEvpNfrq6HH5TE1noNPjt5CwFBAAAABSLFBFlAAAAEsAKCAABSiKJQEKEAEUAAUgFlAIAUlBKSKIAAAAAFBAAAAAAAHr5DYZOmS9B7cyl6r65Mdb88oOo8ucG9xtWsyceKBAAAAUAEAAAAoIsVRABAAAAUAABQQAAQsFoQFAlBKIUgAFgAWBYKEAAgAAAAAAAAAAAAAAAAUEAAAAAAABQAQAAAFoRABaESlikgAAKAAAQqCoLAAoAUAEAEUAAAAEBQAAQAAAAAAAAoiiKIogAAAAAAAAAAAAAAAAAAClBEolAACAAAAWUIAAAAAAKAFABEFABAWgQAQAFBAAAPXOnW43ybq2byrqhxuJ3uNZxTNwumfbN+uqxrk3Vs3lHVjlHVjhPRm9MfPx17G+Cm21PTAJ75n31GN8lr+14mxXT2aHP6ac9895dNTjMTvtbqcks3g9unmudzennPXO+HUjhvPu9FrOgWbz9bHB7rOuT13ecQeA1ln5vRY3ynx1fJGEN4AAAgAAAAAAAAAAAAKAABLFAAAAABAAAAAAANj13I9dy6fOk3PC10H1zs1ntcnhu4xr44ju+Ts++q5bqJfjT7TibOhnPNTopzw9NhrNnZ1Q49fnkOx8bnh3v4dsbbqOX6jlvw4jt+J1ncdLp9xnXzpMvk7Nx76Budlq9DYnp576zbZT449PrWaHD6Z6LN5CWfoDmem570nN99xm8+Pc8N3MOI7fiTH3TpKfN5PGmuO3MEAWAAAAAAAAAAAAABYKAAAFgAAAAQApYoiiKIsAQDY9dyXW8unxwneaCzRN99ami7nFy8acr0/E2bHqOX6iXz0PRJeddEs53A7Hn7NDtNXtN56r4+/Dj0+vXj+usxeQ7vWVquo5jpzw4ntuI1N30fB9HG5wM9jXPYHYNTg/nuOa3nWdlxvcy+uj3nNZumHXmA7XiusxrZaHfabGuf7nhu51Gh3zOgl5XV7HXduQWAAAAKEUQABQAAAlEAAABQoIAAgoAIKsUSgCAAAIAAGy63kut5dI+eal6dzCzp/LlcKzYa06Z23Ucv1PLflznQcTZtpqpvO2xMRTaavaR1Xh7+HHpw+31Lvz75z/QcemLlEePD9vxHTB9/e5NjqadJs+I9MXuZXPfE9Xz2d0zvtJu/jGuEZmH25gjtdJ0nPbQb/AI2Xw7nhu6shzudbbM4LsLMnje2xTi338dcAgApKAACURYVBQAAAJSwAAFCAAAQKCALC0IAAAAQAUEBsut5LreXT44PvOD1A3gADa9Vy3U8unnp94l0c3pNG3g4nL8/TpnqvH28eW+HHfm6nlvqO8uDncenhw/ccP0zvOg0O+zdZhdGjmtjswk5pdf8AHw7c+1yOI6blvYa3Zs3SZ2baj50R7c1Z15+vdcN3ONOH7jhzwyMd0z3Ptx/Xcd63lO/5/U0BemYollQACWUAAiiUCUAAAixRSKJRAAEpYAEBQFlAQACLAAAAU9MzXlz9fQCRRFHrl68uwa6xsGvGwa8el8lbD5wUBZKHrma4ufr7B9/A2WTpLG8x9XD08ylhKgys7T2XdeGrHr5FLKl2GuLsdfIAjNwquwmvsWFgAAAAAAAAAAAAECqAIABLBUoCxQABKAIAACxRFJAoIABUoAAlEWCygEABQARQlEWBRAAAAAALKAAJRFEUSgAAAAAAAAAAAAAAAAAABKAAAAKCAAAAoICggKABFEogAAAAAAAAAAAAACUSygAEURQAAAAAAAAAAAAAIUAAAAAAAAAKCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASgAAAAAAAAAAAAAAAABFgBQAAAAAAAAAAAAAAAAAAAAAAAAEoAAAAAAAILKAAAAAAAEFQUCWKBUqAAAAAAAAAAAAAAJRALKAAAAAAAAAAAAAAAAAAAAAAAARQSgAAAAhUFgAVKAAAAAAJYAUAEWCygAAABBUoAAAAAAAAAlEUAAAAAAAAAAAAAAAAAAAAAAAAAIAoAAAlEAAAAsoAABFAEAAsoABKAAACUQCwUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAoAAAAJRAAAAUAAACWApFEoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAARQAAAAAAlEAAAsFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABFEAUSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACggKCAAAAAAAAAAACCwtSoCgAAgKCAAAoAIQUAAAAKACAoAIAACkJQAAAAAoAICgAgAH/9oADAMBAAIAAwAAACH54576oP8A/wD/AP8ArCDTy37z/wD8ks8wgggw9vvysgksllv/AP7/AP8A/uoksv8A+tKMMMP/AP8A4/6wwwwwwwwwwwwwwwwwwwwwwwwwwwxzwwwwwzggwwwwwwwwwwwwwwwwwwwwww9/w/wwwwwwwwwwwwwggjvrggv/AI4K4oNf/wDqCKGe/uKGvLDCCDDCCCDDDDDDDDDDLDD/AAwwwx//AP8AKe/OKGOW/wD/AMIb/wD/ACvv/v8A/wD/APv/AP8A++/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APywwwwyw1//AP8A/wD/AP8A/O/+W/ie/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPCGrDDDW//wD/AP8A/wD/AP8A/wDivv8A77//AP8A/wD/AOCe/wD+ssstv/8A8MMNf/8A/wD/AO//APvT/wA//wD/AP8A/wCpL44oN7/7/wD/AP8A/wC//wD/AL/7/wD/AP8A/wD/AP8A/wC//wDwgxvv/wD/APDDDSy//wD/AP8AqDjDvD//AE9//wAML/8A+O++u++//wD/AL//AP8A/wD/AP8A/wD/AP8A/wD/AC+yy+u+/wD/AP8A/wD/AO8MMPb/AP8A/wD/AP8A/wD/AP8A/wC//wDjDDS//wD/AP8A+++//wD/AP8A/wD/AP8A/wD/AP8A/wDvv/ggggwvv/8A/wD+/wD/AP8APeuf/wD/AP8A/wD/AP8A/wD/AP8A/wD/AMv47/8A/wD/AP8Ay+//APv/AP8A/wD/APP/AD//AP8A+LPIe88N/wD/AP8ALPb7/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wB7/wD6/wD/AP8A/wD7z/8A/wD/AP8AsMMef7204F6UoMMPL/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+/8A/wD/AP8A/wD/AP8A/wCG/wD/AP8A/wD/AP8A/wD+9+OLEPQrjrPm/wDvf+sINf8A/wD/AP7/AP8A/wD/ALz3/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AL7/AP8Av/8A/wD/AP8A9r9+3Gf/AP8A43//AP8AzEYfWzf/AP6lv/8A/wD/AP6ww1//AP8A/wD/AP777/8A/wD/AP77/wD/AP8A8pb/AP8A4w8GLbL3/wD/APjXdrT/APw8/jOx7lvvv/8A/wD/AO4ww1//AP8A/wD/AP8A+2//AP8A/r77/wD/AP8A/wD/AP8A/sN7u7//AP8A/wD9vd/VMuSaA8MMMKhL7/8A/wD/APf/AP8A/wD/AP8A/wD/AP8A/wCL7/8A/wD/AL7/AO+//wD/AP8A/wDz1IK0v/8A/wBrq3TSXBJK/wDbLTwxtumvvv8A/t//AP8A/wD/AP8A/wD/AP8A/wAMb7//AP8A/wD/AP8A/wCNP/8A/wA9xCA3y96gFoFf61FfV4evL8bwwuqDv/8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AA1v/v8A/wD/AP8A/wD/ACnv/wD8398d/wD/AJyT6VOlbqE/X/76sPD5w0t0tv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A68D/AP8A/tlTzM9cJUBB31P8sNLLzu8MPc//AP8A/wD/AP8A/wD/AP8A/wD/AOqDDe//AP8A/wDO++//AP8A/wD+Eyf/AM956lM91TtxCBqkx/8A8+1nSz2Nfh77/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r3+zX//AP70a7yrSAwR+lSX/wD/AP8A5aLGewE9sH//AP8A/wD/AP8A/wD/AP8A/wD/AP8ACe//AP8A/wD/AP8A/wD/AP7384n/AP8Aj9xYZ5R6Ed/rxe//AP8AvuAQtT9j5Ox37/8A/wD/AP8A/wD/AP8A/wD/API77/8A/wD/AI7/AP8A/wD/AP8A9Yv/APv+s12ekO/HKj3/AP8A/wD/AOyInrTQvKDA3S//AP8A/wD/AP8A/wD/AP8A/wCO++++/wD/AP8A63//AP8A/wCPe/8A71bNJTSzDBzf/wD/AP8A/wD/APD1Ag9918LTb0+/+/8A/wD/AP8A/wD/AO/++CW+/wD/AP8A/wD/AP8Ar/qtz/8A/fyrLvP/AKu3/wD/AP8A/wC+/wD/APEgDR9LQMMtj/8A/wD/AP8A/wD/AP777/777/8A/wD/AP8A/wD/AP8A/wDzrw3/AP0DzdpI46zf/wD/AOlv/wD/AP8A+rBHJjxww5zT/wD/AP8A/wD/AP8A/wD/AP8A/wAP777/AP8A/wD+oL//AP3Ur/8A+OkpfutvvF//AP8Avf8A/wD/AP8A+tPec7UQwxgf/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97//ALjKvz9WOe+iCArK/wD/AP8A/wD/AP8A/wD/AP8A189HoHDD49//AP8A/wD/AP8A/wD/AP8A/wD/AOvv/wD/AP8A/wD/AP8A/wD88ub/AP8Aaht7x0/axf8A/wD/AP8A/wD/AP8A/wDqcAQHGj/Dslv/AP8A/wD/AP1//wD/AK//AKskv/8A/wD/AP8A/wD/AP8A+xz/APp8+/7EiGvVue//AP8A/wD/AP8AvOGAABO0Pf8A8S//AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX/xIj/ryWKDc+uxCFy2//wD/AP8A/f8A5QDL+xA0/wBAPf8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO//ALHqD/8A1zrjvutjXrq0v/8A/vvjjjyziwEMsP8AiV3/AA9//wD/AP8A/wD/AP8Agvrv/wD/AP8A/wD/AP8A/wD/APGHA/8A/wBnbjIILjKYqMZF+eUX/wDNQ8uL/wDyw2w1/wAt/wD/AP8A/wD/AP8A757779P/AP8A/wD/AP8A/wD/APfAC/8A78Tixwg0G88Z+NMRz3/8873MLP8A+Na7/wD/APv/AP8A/wD/AP8A/wDvvv8A/wDL3/8A+kv/AP8A/wD/AOoLb/8A/trYMEpP+6vMTz//AOwww00f1P8A8O7v/wD/AP8A7/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wD7D1//AP1E33v47/PLDAiseQwwxDzQP/8A8MsB/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD/AOP5z7/8tLb7YN897/331mWwmS6op/8A/pdKf/jT3/8A/wD+8/8A/wD/AP8ADDC+/wDvzww/vv8A/wDv/Gr/AP8A+/8A3++P74kT+6IMoyC6BH//AP794l/ww1//AP8A/wD/AL//APjTKDP/AP8A/wD/AP8A/wD/AP8A/wD/APwANf8A/wD/AKItvvvvrvgjjjjmgw//APuH/wD/AO4ww1//AP8A/wD/AL//AODDCD//APv/AP8A/wD9/wD/AP8A/wD88ftv/wD/ADw85vvvttvvuv0Iww//AOPuLf8ADH/DjT3/AP8A/wD/AP8AY/8ADD//AP8A/wD7jDDT3/8A/wD/APvRDf8A/wD/APvPBzhiiBCBDTHP/wC8u+gw1z//AMMMc8vf/wD/AP8Av/8ADD/2/wD/AMsM7+8//wD/AP8A/wD+HiWg/wD/AP8A/wD/AM88+8MM9/8Ayv4U/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A/wA8auOaJ/8A/wD/AP8A/wD/AMMNPf2haj7/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/AP8A/wD/AP8A/wD+9xh4div/AP8A/wC8QzBzCXv/AP8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A/v8A/wD/AP8A/wD/AIwCAW5jvhIvz1oz+/v/AP8A/wD+9v6wwww1/wAP/wD+yyiGDDG++6+qC+6iTz//AP8A/wD+/wD/AP8ALX/zDPudN+di/vP/AOtv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AP8A/wDPP/7yDDDDf/8A/wCZ7/8A/wD/AIN/4NLP/wD/AAwwxzz3/wAMIIMMb7777/777/8A/wD/AP8A/wD/APPPPP8A/wD/AP8A/wDz3/8A+8//AP8A/wD/APyDTjDD/wD/AP8ArP8A/wD/AP8A/wAMIIN77/4J7/8A+/8A/wDvL46uCh776Pxz9Q6fbkTfRZ6vNlnfzgMMMP8A/wD/AP8A/wD/AP8A/wD/AP8ADDDW+++++/8A/wD/AP8A/wCurib02aFI4fy+ZZP2dS2/0QUiz3vTbz/+/wD/AP8A/wD/AP8A/wD/AP8A/wDvDDDC++++/wD8ssstv64jQpYdmDW86d7lps93l+Oawy7/APgiP/8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AKwuMr+Eg17a/wCDx18IjeUbwgO3tGj5n7//ALjDDT3PDDDDS+++DDDD+/8A7gwwwwz/AMO8JD/8+IBNO6kY2tLHO/DJq+jz+sO4fPrKsMOsMPOMsMMPbrKMMNL7/wC+qDDD3/8A/wDvDAPPPAvMNLMOMBS7kX68+v16uBT+jsMMMMMMMMMMMMMP6IMMO8sLIIKIMMMLLP7/AP8Ayww096w//wAMPNPfP/8A/wD/AP8ArDDTzzjDDDDDDDDDDDDDDDDDDDjDDDCDDDDCDCDCCCyjDDDDDDDDDDDDDDTrDDzzDDDDDDDDDDDDDHDDDDDDDDDCDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDjDDDDDDDDDDDDDDDDD3/DDDDDDDDDDDDDDDDDDDDDDDDDLDDDDDDDHrDDDDDDDPPDW+LDDDDDDDDDDDDDDT/rDDDDDDDDDDDDDDDDDDDDDDDDzLDDDDHPf/LDDDDDDX/DD3rDDDDPLDDDDDDDDDTzDDDDDDDDDDDDDDDDDDDDDDDDDf7DDDT/AP8A/wDrDDDzD/8A6ww4www0/wC8MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMP+MMMMNP/AP8A/wAMMMNfvOMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMPMMMMMMNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwzwwwwwwwwwwwwwwwwwwwwwwwww8/84wwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww0/wB/8MMMMMIMIMMMMMMMMMMMMe4sIIIMIMMMIIM8MMMMIIMIIMMMI8MMMMMIIMIIMP8A/9oADAMBAAIAAwAAABDxjCABT3HFHHFXzHUxnV3HGyT33zzT31jCHQzCAyijHHDHHHARzwzHFWR2Ff8AT/vd9X3/AOww0/8AuMMMMEMMMMPMMMMMMPMMc8MPPMM4AMNOMPPPPfPMMMMNesMMMOPduP8AjrDDDDDDDDDDDAACM8sAC/8ADALCg1//AOoIoZ7+4gS8sMIIMMIIAMMMMMMMMMMtPNPMMMMf/wB/Ic/MIFMU/wD/AMAb/wD/ACPv/v8A/wD/APv/AP8A+c/+/wCx/wD/AP8A/wD/APPPP/Lf/vf/APyw0wwyw1//AP8A/wD/AP8A/M/+U/gc/wD/AP8A/wD/AP8A/wDuvv8A/wC+/wD/AP8A/PT3/wA//wD/AP8A/v8A/vf/AP8A/wD/APvPAGrDDDW//wD/AP8A/wD/AP8A/wDifv7Pv/8A/wD/AP8A4Bz/AP6www2//wDwww1//wD/AP8A7/8A+9P/AD//AP8A/wD/AKEvjig3v+P/AP8A/wD/AD//AP8Av/v/AP8A/wD/AP8A/wD/AL//APADG+//AP8A8MMNLL//AP8A/wCoOMO8P/8AT3//AAwv/wD477xFTz//AP8AP/8A/wD/AP8A/wD/AP8A/wD/AP3sLDsrvv8A/wD/AP8A/wDvDDD2/wD/AP8A/wD/AP8A/wD/AP8Av/8A4ww0v/8A/wD/APvPv/8A/wD/AP8A/wD/AP8A/wD/AP6gv6vvvv8A5L//AP8A0v8A/wD/AD3rn/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDL8O//AP8A/wD/AMPv/wB7/wD/AP8A/wDz/wA//wD/APePu7f7/j3j7OPay3//AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP7/AP8A/wBz/wD2/wD/AP8A/wD7z/8A/wD/AP77xuzTXHPQ2H/v/wD97f8A/wD/AP8A/wD/AP8A/wD/AP8A/wDv/wD/AP8A+3//AP8A/wD/AP8A/wD6un//AP8A/wD/AP8A/wD52/z3neULfpDS8eXjRXv6/wD/AL72/wD/AP8A/wC89/8A/wD/AP8A/wD/AH//AP8A/wD/AP8A/wD7lv8A/L//AP8A+8/7Amt36/8A/N+N/wD7PppCiGv73Wu//wD/AP8A/rDDX/8A/wD/AP8A/vvv/wD/AP8A6lv/AP8A/v2+/wD63/2DYbU53/8AN+9adP8AP/fkfivSque//wD/AP8A7jDDX/8A/wD/AP8A/wD7b/8A/wD7lvv/AP8A/wDz3/8A+e9j7P8A/wD/AP8AvrHlqUBwibz/AO1pCJNv/wD/AP8A9/8A/wD/AP8A/wD/AP8A/wD/AIvv/wD/APuW/wDvv/8A/wD/AP696Ttrt/8A/wBuoRbS+e0uWvqczLgJJky2/wD+3/8A/wD/AP8A/wD/AP8A/wDrDG+//wD/AP8A/wD/AP8AjT//AOz3/tf4926T9GdoV9avn9tPLcW28k6On/8A/wD/AP8A/wD/AP8A/wD/AP8A/wDvDW/+/wD/AP8A/wD/AP8AKe//AK94qu5/+SKDcdrYE8DVv/6weaFky1E9mv8A/wD/AP8A/wD/AP8A/wD/AP8A77INL/8A/wD/APLLL7/77/8A4ag//wD/AEtXsy4NPRLuQ7P/AH/c/Mqb/auy/wD/AP8A/wD/AP8A/wD/AP8A/wDqgw3v/wD/AP8Azvvv/wD/AP8A6p/X/wD9/vxK1viKaZaUR8f+/d3lyxJ+vsn7/wD/AP8A/wD/AP8A/wD/AP8A778Pb/8A/wD/AP8A/wD/AP8A/r38yW/vPGhja2LXOilsFYf/AP8A/uvPT3769jlH/wD/AP8A/wD/AP8A/wD/AP8A/wD/AAnv/wD/AP8A/wD/AP8A/wD+9+fN/wD/AImyQ3ZUbpWuSSHv/wD/AH0cp3V9tivCf+//AP8A/wD/AP8A/wD/AP8A/wDuM+//AP8A+rL/AP8A/wD/AP8A1kf/APs1Y/nDSDuker3/AP8A/wD+iDQl8+Wrb/8Aiu3/AP8A/wD/AP8A/wD/AP8A+7r7/wC+/wD/AP8A63//AO9/OHP/AOmcEkYfE2zm/wD/AP8A/wD/AP67D/DBzPxN72xGv9v/AP8A/wD/AP8A/wDv6vglvv8A/wD/AP8A/wD/AH16vD8/7dpUJ+J/F3H/AP8A/wD/AL7/APfV08YrTW/LMWj/AH//AP8A/wD/AP777+777/8A/wD/AP8A/wD/AP8A/wB1Pf5/4S3O88zS3/8A/wD/AOlv/wD/AP8A+mOITR0f/wBs3P8A/wD/AP8A/wD/AP8A/wD/AP8AD+++/wD/AP8A/qC//wDzg1//ANb2Mbvds/tf/wD/AL3/AP8A/wD/AODxWf8A7T//AK1v/wD/AP8A/wD/AP8A/wD/AP7D++//AP8A/wD/AP8A97/+ekBM+Fi1Sl/MKhL/AP8A/wD/AP8A/wD/AP8Az90Ju69P/wADnv8A/wD/AP8A/wD/AP8A/wD/AP8A6+//AP8A/wD/AP8A/wD/AP8AMgz8+1AVRjroOBHvf/8A/wD/AP8A/wD/AOgjyytBsv8AUx7/AP8A/wD/AP1//wD/AK/vqyS//wD/AP8A/wD/AP8A/wD0ae/6f7sJO99rlEtv/wD/AP8A/wD/ADzzc8878C3v7Bj/AP8A/wD/AP8A/wD/APyw8ww3v/8A/wD/AP8A/wDrX78Iffr/AB89rv7mAqOtv/8A/wD/ANXvOvNHnX30/wAJw/8AX/8A/wD/AP8A/wD/APLGDD++/wD/AP8A/wD/AO/++3j/AP8A1z84H5yjnvWEv/8A/sUOTqRzwdGMsP8Aq5f/AA9//wD/AP8A/wD/AP8AgPrv/wD/AP8A/wD/AP8A/wD+uoZVf/8AM/POzSg0oRj9QNmCXvfvQ8EN/wDyx/nr/wAt/wD/AP8A/wD/AP8A75z779P/AP8A/wD/AP8A/wD++eRT/wDvbjl7Kf8AbzzEYRcNj3/887yutP8A+NLg9/8A+/8A/wD/AP8A/wD/AO++3/8Ay9//APpL/wD/AP8A/wDmEW//AL8J6MPtacNJb08//wDsMMNNG1X/APHXJ/8A/wD87/8A/wDvv/8A7b//AP7DD/8A6ww9v/8A/wDHDS//AP0rF7xwwscYVUn9ORzy9eXqv/8A9R6J/wD/AP8A/wD/AP8ApL//AOe/jDjDD+/rDDW//wD+31lmP/y137sj5Jqcc8lquLKUzFMX/wD+15B/+NPf/wD/AP7z/wD/AP8A/wAMML7/AO/PDD++/wD733wif/8A+/ojP5zhXys30Vqj6Lyof/8A/r7AX/DDX/8A/wD/AP8Av/8A+NMoM/8A/wD/AP8A/wD/AP8A/wD/AP8Arrzt/wD/AP8ArwW/xd98sAMNNMbJD/8A+74lv+4ww1//AP8A/wD/AL//AODDCD//AKv/AP8A/wD9/wD/AP8A/wC/u3Lz/wD/AD80lCdKWefePcAMww//AOl4Pf8ADH/DjT3/AP8A/wD/AP8AY/sMP/8A/wD/APuMMNPf/wD/AP8A/s9of/vf+8+HCLAzqNANMc//ALvCZjDXP/8Awwxzy9//AP8A/wC//wAMP/b/AP8Aywzv7z//AP8A/wD/AOpmBNdfP/8A/wD/AM88+8MM9/8Ay+xs/wD7/wD/AP8Awx3/AP8ALD3/AP6/vw063v8A+r//AP8A/wD/AP8A/wD/AP8A7+6AMhHI/wDPf/8A/wD/AMMNPOa9rVb/AP8A/wD/ALzDT/8A/wCsMM//AP8A+gww9v8A/wD/AP8A/wC//wD/APP/AP8A/wD8+9me7fvh/wD/AP8AvEcL5kze9/8A/wD/AP8A/DDDDT/7D/8A/wD/AP8Aowwg1vvvvvv/AP7/AP8A7v8A/wD/AP8A+8t80sklT07SF/hT7Gdb/wD/AP8A/vb+sMMMNf8AD/8A/ssohgwxv/8Ar+gL7qJPP/8A/wD/AP7/AP8A796+z7xPfdTW7M2c3/uv/wD/AP8Aw9owx/8A/wD7DDCDDDHeDCCiS6++u+uuDDD/AP8A/wD/AP8A/wD/AD37/wD98cz/AP8A/wCf/wD7am//AP8A/wCDf+DSz/8A/wAMMMc89/8ADCCDDG++++/+++//AP8Atf8A/wC/8888/wD/APv/AD7+5/8A9Pd//wD/AP8A/INOMMP/AP8A/wCs/wD/AP8A/wD/AAwgg3vv/gHP/wD7/wD/AL8D33l2vvtiiF8/j7dmgdzlrf5waG4j4www/wD/AP8A/wD/AP8A/wD/AP8A7www1vvvvvv/AP8A/wD/AP8AXKIH6bFHfXh8bYd5VGeKmzy8BfXoRAP/AP7/AP8A/wD/AP8A/wD/AP8A/wD/AO8MMML/AP8Avv8A/LLLLb9eqXZ790YYoi9vt0xIR1A7xcMP/XWAVf8A/wD/AOPP/wDzDDDT/wD/AP8ACDDDe+/6yiDDDDf/AFyutQF0RhTGLNXfyck6+ULSix4G0ebnP/8AuMMNPc8MMMNL774MMMP7/wDuDDDDDP8Aw+y5f7f4cUw+r2p6RMAz4gHTKvZQQBB0esqww6ww84ywww9usIww0vv/AL6oMMPf/wD/AO4Uw884egsoAg44RnuxfLz2v/K49f6mn4wwwwwwwwwwww/ohww7ywsgAogwwwsM/v8A/wDLDDT3rD//AAw8098/f/8A/wD/AKww0884wwwwwwwwwwQwwwwwx7w4wwwwgwwwwgwgwAAMowwwwwwwwwwwwww06ww88wwwwwwwwwwwwwxwwwwwwwww3v8A8MMMMMMMMMMMMEMMMMMMMMMMMMMMMMMMMOMMMMMMMMMMMMMMMMMPf8MMMMMMcvNOMMMMMMMMMMMMMMMsMMMMMMMesMMMMMMM88Nb4sMMMMMMMMMMMMMNP+sMMMMNfcMMMMMMMMMNMMMMMMPMsMMMMc9/8sMMMMMNf8MPesMMMM8sMMMMMMMMNPMMMMMMMMMMMMMMMMMMMMMMMMMN/sMMNP8A/wD/AOsMMPMP/wDrDDjDDDT/ALwwwwwwwwwwwwwwwwwwxwwwwwwwwwwwwwwwww/4wwww0/8A/wD/AAwww1+84wwwwwwwwwwwwwwwwwwwwwwwwwwz/wD8MOMMMMMMMMMMMMMPMMMM8sNP/wD/ALwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwww3/APP/APDDDDDDDDDDX/PDDDDDDzDDDz/zjDDDDDDDDDDDDDDPDDPLDDDDDDDDDDDDD/v3nP8A/wD8MMIMIMNP/wDDDDDDDDHuLCOKDCDDDCCDPDDDDCC/+CTzDCPDDDDD6CXqe/8A1//EADcRAAEDAgMGBQMEAQMFAAAAAAEAAgMEERIhMRATIDJBURQiMFBhBTNAQlJxgZEjkNFTcKGx4f/aAAgBAgEBPwDgt6Nlb0behb0LcdttvSt/swOmYzUp1awaC6NcegRrJCvFS914qXuhVyIVzuoTa1vUJtRG7Q+6Pe1gu4qStH6AnzvfqUyF7+UJtE86myFE3qUKSMdF4aLsvDRdkaSLsjRM6FOoj+kp1PI3UJsjmcpTK0jnCjmZJyn29zg0XKlrOjF5pD3Kjo3HN5smQRs0Hpvja/mCkohqwp8boz5goqtzcnZhRyNkF2n2yaobF/KkldIbuUVIXZvyCYxrBZo9B31aSKZzTm25VPVR1LcUZ4iARYqWjBzYvNG7sVBVB/lfkfaqiqw+VmqYx0rrBQ07Y89T6JNhcp7sRJUUz4Xh7DYqirG1bMQ1GoUz3xjE3RMrWHmFk17X8p4JImyCzlNA6I56KCqLfK/RA3zHs9TU28jFFC6U2CjjbGLN4pauKHJxzUv1b/pt/wAqT6jUO/Vb+E+eV2rj/lOJOqOyiqTTTB/Tr/CIDhboU9uBxagSDcKOscMn5pkjZBdp2kAixVRTGPzN0VPUGPyu0QN8x7LU1GAYG6qGIyusExgYMLeGeqjh1zPZT1skuV7D4RRRRRR2BUbsUDCewU1KJDiBsVJTvj1Gxri03aoKoP8AK7I7ddVU0+7OJuipZ8BwO09knlETb9U1rpXWGpUUYjbhHASBmVU1x5Yv8o5oooohCF7tAjTlvOQE7djQ3/pOI6IKkZggY09ANstKx+YyKkidGbO2U9TbyP2kAixU8Jid8KkmxDAdR7ESALlTSmR11TQ7ttzqeAkAXKqakynCNEUUUGF2ibTj9SdLHHk3VSVL3aZJ1zrt+n03iJg3oMz/ABwuaHCxU9MY/M3TZS1H6Hf1tljEjcJXmjd8hRSCRocPYayWwwBUsWN2I6DhqqjeHC3TYVYnRNi7p8jYwpJnP/hFFFFBpcbDVfTqPwsdjzHX/jjqafB5m6bKabeNsdRtrIrjGFSS4HYTofYCQ0XKe4yOv3UUe7YG8FZPhG7b/e0NugLKSa2TUbnMooooprC8hrRmvp300U/+pJzf+v8A7xVNTi8jNFTVV/I9EA5FVEO6dloo3ljg4Jrg4YhsIBFipWGNxaoJN4wH8+sfhbh7qkjxPxduCWQRsLinOLiSdgF1opJL5DYUUUVBSyVDsLB/wqOgjphcZu7/APHFVVF/I3ZEzG8N2SRiRuEpzS02KopNWHbWx3AeFRPs4tPX8+qfikPwqVmGO/fgrpbuwDpsAvse6+QVlZFFBpcbNFyqb6ST5psvhRxtjbhYLDiOanhMTrdNjXFhDgopWyNxBNnY52EHNVkX6wo34HBy12PaHtLUxxY4Hsgb5/muOEXQBe63dAWFhtc4NBJTnFzi4oBBOd0CwEoRd1ugt01RfT95m4WChp44R5B6MsYkbhRBBsdrSWm4WUrP5TgWmxVO7FGNtQ3DIVTOxRj82pdhjKpW4pBwVr8MVu+wDYABsbTSv0aUPp8x6KH6fu83ZlOFjb06yPC7EOvBRPu0t7KsZhffuqF3lI21rcw5ULsiPza0+UBUI8xPB9QdmGoDZDTSTcoUX0xjc5DdRwsj5Bba52EX9SqZijPxtjidIbNUEG6uSc1WNuwHsqE+YjbWC7LqiPnI+Pza46BUIyJ4KzOVMY55wtFyqf6c1vmlzPZAWyHDOcreo4XBG2iPmI2Ti8ZVFzn+NtULxlUh/wBUfm1uoVFyngfA+eYtaoKdkAs3Xvwh1zbZP09V2uylcGyC+yQXaVQjMnbU/aKpfuj82u1CouU8EIAblwvd0CZrsnGQPqE2Wu2B7g8AFP5SqJtmE99tT9oql+6Pza4ZAqhPMOCHl4CbC61Qy2Pbibb1J3YYyeCmF5QpjaNx+FEzAwN21ZtGqMXk/NrBdl1RGzyOCA5kcDzc22sNxslZhPoTSiJt1vXg3BTauRuuanqTKALW2iNxFwMlRMOIuKeMQtwVrvKAqEZk/mztxRkKB2GQHgjNnA7SbDgYbHY5ocLFPYWnPilmbELlPe6Z1yvBPte6fBIzUcEbQ1oAV+Gsdd9uyo22Zfv+c9uBxHZMdjaHcDHYm32P04Arq6NjkU6Dq1GNw6K3dOnjbqVJWE5MCZBJKbn/AMqKBsWmu2SBkmoUlG5ubc1oop3RaaKKZsouOGR2NxKibgYG/nVjLOxd1RPu0t7cELrGx2OFxwDZdXTw5ubU4Odo8j+06lxcziU2jjGqZExnKOOWBsuuqlhdEbFUcd3Y+3BUvwRn5VOzHIB+fUR42H4UEm7eDwxvxDY5t8wrFBpKLbDhdH1Ct6W6xtOLRMYGDC3gq5MT8I6Kjjs0uPX2Coj3b7dFSy42WOo4GOwm6BDhccLm2zV1dXV0QDqiw9ERbia0u0TYQM3KWTFkNOCaTdsxJjDI63dNaGiw9gqIt4zLUKGQxOxIEEXHBHJg/hAgi44XN7LRXV1dXV1krBWCDb6BCLugLZBSyX8o4amXeOsNAqOLCMZ6+xVUOA4hoVSTWO7dwskLU1wcLjhIvqjGeiII1V1dAE9EI3FCLuUGNGw5ZqSW+Q4aqbCMDdVTxbx1unsbmhwwlSxGJ1iqafeDC7Xha4tNwmSg68N/QdIGp8hfrwzzCJvygHSusNSooxG3CPZJYhI2xTmujdY6qnqBILHXibI5qEzTqgQdFbjdK0J0rjpxTTCIXOqc50rrnMlU8AiGevs00IlFjqnsdG6xVPVB/lfrxg2QkcOqEzlv/hb/AOEZz2RlcUSTrxzVAiyGqJdK7uSqenEQudfaJI2yCzlLA6I56KGqLMnZhMe14u0/gkhouVNV3yj/AMpkbpDYKGBsQ+faiARYqaktmxNc6M5ZFRVgOT0CHC49XRSVbG5NzUkzpD5lDSOfm7IJjGsFm+2yQtk5gpKRzc25prnRnLJMrXDmF0yqjd1sgQdOM5ap1RG3Up9b+0J8r5OYqOme/PQKKnZHnqfcXxtfzBPogeUp1NI3pdeZp7JtRI3QoVcgXjX9gvGv7BGskRqZD1RLnHPNNp5HaBMov3FMhYzlHu2uqMEZ1ajSR9l4OP5Xg4/lCkjCFPGOiADdB/2uqKh8brNXjJPheMk+Eyt/cE1wcLhT1D434QvGyfC8bJ8LxknwnuLWFw7IVsnUBMeJG4hsnqHxvwhU0rpQS5SzNiFynVjzpkhVy91HWEmzhslnbFrqnVjzpkhVyBRVbXZOy2VM7oiA1U07pSQ7ZNVYThYoJpZT8ex1n3P6VLEyQHEvCxdlUQbo5aFUTziLVV/cVLCyQEuC8JF2XhYuymyjP8bIJjE74QIIuFWfcVDylVLi6Q3VLAx7cTs0aaI9Eylax+IFTSbtpciS43Oqioxa706kjOmSliMZsVSSkjAVW6hUPMVU1NvIxQwmU26JjAwYW+x1n3P6VLK2MHEV4qLuqmcSkW0ComkuLlWfcUcz4xZq8XL3VPUPfIGuKm+25NFyAp4TE74VNPgOF2iq/uKh5SqqnJONqa5zTcGybWSDXNRVTZDY5FVp8oCpQDIL7aweQFUxtKFW8wTJCwHD12QhuAYNPZKz7ijhdJyrwkiZRH9RTGBgwtVZ9xUkbXtOIXW4j/amxMabgKf7bv4TeYKRge3C5SRmN2EouJ1VDylYheyfGx/ME+iYR5ctk4L4Q5RP3bw5NcHC42VcoccA6KkZikv2VbqFFEZHWCqKfd5t0VPPujY6IG+Y9jrPuf0qHR3BWfcTJXsyaV4mXuvEy9083gueybqNk0IlbbqnNLTYqh5SqnHjLiE2pkb1TqmRwsSooXSmw0WEWt0U9MWG7cwmvczlKdPI7IlRxOkNmqKIRNsFW6hUPMUQCLFTwmJ3wqWe3kd7G5jXZuCaxreUW4HRtcbkLcx/tC3Mf7Qt1H+0Kwtbotyz9o2uja43ITWNbyi2wwRn9KFPGOiGWQ2uiY7UIU8Y/SgLZDY5jXcwumsa3lFtjmh2RC3Mf7R/tJf/xAAzEQACAQIEBAUEAgEEAwAAAAABAgADEQQSITEQICJBEzJAUFEUMEJhUnEFI2BwkYCBkP/aAAgBAwEBPwD/AJZP+xbS3/j4tNm2EGHY7wYYdzBh0ngJ8TwE+J9OkOGXsYcMexhpOO3uiqWNhFw/8jFpquwjVFXcw4lRsIcS3YQ13njP8zxn+Z47/MGIbvBiR3EWqjd4yK24jYcfiY1Nk39vAJNhEw/dp0oPiNiAPLGqs25+2rsuxi4j+QisrjSPQB1XSMhU2PtlOkX/AKiIqDSPXA0WMxY3P2L84JGoiYjs06XHyJUoFdV9qpUb6tGYINZUrF/6+0ONNVY2MbDsNoyld+RHKG4lOqH2lWjm1Xf2ijRv1NKlQINYzlzc8xYCFviXPMDY3EVswBhAOhj4cHVYyFTY8QbG4lKtn0O8q0s+o3m3stGlm6jtKlQILxmLG55WcCFiftU6xQWtEqq23AqGFjKlErqNuSlVz6HeVqWbqG/slOnnNoSEF47lzc8rVL6DkvwWi7bCHDlfMQJlUd4bduA4pXZd9REcONOFWjfqXiDY3EpVM4/cr08pzD2IC+kpoEFpWqZzYbchNo75uSnTap5REwYGrmGpSpaKI2Idv1N/sAlTcSlWD6HfhXpfkOKOUNxNHH6MdchsfYcOlzmMrvlFh35aj5tBxRGc2WUsGF1fWPVSkLSpXap/XMOejWzdJ34VqeQ3G3Gg9jlMrpmF/j2AC5sIqhFtHfO1+Sq/YcaGHaqf1KdNaYssrYq3SkJJNzzAW5qNG3U0rUbdS8KVTOP3HUMLGEEGx4A21iNnW8qJka3r8Ot2v8Su1lt88jNlF5e/DDYY1OptoAFFhtK+JzdKbcwBMAtzUaX5Hg7ZVJ4I5Q3EBDC4mIT8uOHbXLMQtxm9fQWySu2Z/wCuSq1zbhhqHim52EAAFhMTiM3Qu3C/EQL884lOoHHBgGFjHQqbQ02AuRMO/wCJjrmUjijZSDGGYWm3rQLm0PSP6l768SbC8JvKVM1GCiIgRQqzFV7f6a7xMNUbtFwJ/IwYJBvBhaY7RxRXQC5mn2ab5GvAe/Ei+hmqN/UBuLysLOeNFroJWFnPraIu4lc2Q8lU2XhhKORcx3PBaarsITaPi6KbsI3+ToDYk/8AqVP8mjaC9ojBgGH28O9xl5MQtmvMO11t8TEjUHjhjoRMSNQfW4YdRMxJ0A5K51AmGwxch224V8XSoec6/Erf5V20pi0qVqlTzsTxpJ4jhYNOW/NRazji7hBcyrV8SYdrNaYnYccOeq0xI6QfW4bvMSdRyUsMHbO20Z1QXbQTFf5FjpS0Hz3hN9Ty4JbuT9wGxvxxI6QeFI2cTE+UcaHnEr+T1uG2MxPmHJ460aQZpXrtWN2jm55A1zbhgfy+6NuFYEppwXzCYk6AcaPnEreQ+tw2xmJ3HJiCc+svyObaRD1cMEeoj0FVQVN4u4mIN2txo+cSv5D63DHeYkbHkxI67w7cWNhCYDY3m8oPkqA/cpC7gclY2QymLuI7ZmJ40B1yuej1uHPVaYgdN+TFDQGHbi5ueNM3HDC1vESx3H2KaFzaZFta0OHQ7SnRyG/EuAbEzEOLWimxvyYYakzEnQD1tM2cGVRdCOSsuZCIIRY2hNoeKGx4I5RsyyjWWqLjfmSmXOkVRTE+oW8WorbHkc3Yk82HFlvMQbtb1ynMoMYZSRyVVyNaVR3jHTnUspuu8p47tUEXEUm2aBgdjFps2wiYf+UaqiaCPVL78VqMuxiYgHRtOD0lfePTKHXlRcqgR2zMT67DtdbTELY5uTEJmXMO03Edbacii5twtLSgyVemoNYKNIfgP+otUJ5VAhxDmM7NuedKrJtEqBxpMQ1hl5KK5nlVsqn19FsrSomZbctWn4bfqMuYR6ZBhUiBSZTULy0cVbpqf9wG+o+0a2RrLvGYsbnkoJZb/MxDXOX49gpPnW8rpla/zyVEDixhBU2MZc28II34q19OFpaWlOq9PaJi1Pm0isG2PKzqu5jYlRtrHru8oUsgud+SmmdrRmCLeE3Nz7BRqZG12lRM62hFtDyVqXiC43hBBsZaGn8Qgjfgr9jziq42M8ep8w16h7wu53PGhRt1Ny0aeQXO8xD3OUexUKmYZTK9O/UOWrSFT+4yFDY8TTB2hpmAMu0D/MFjtLS0tyi5NhKNDL1Nvy0KeY5jKtTIP37GpKm4iOHF5WpZdRtyugcWMqYdl1Gol+W0tzU6LVNtpTpLT235aVMuf1CQi/qO5c3PsiOUNxAwcSrSyajbmeir7xsMw21hBXfn32i4d2/UTDqup15qdMudIAEW3aVauc6bezU6hQxWDi4lWhl1XbnIB3hoIe0OFXsZ9KPmfS/uDCr3MGHQdoFC7Dnp0i+vaAKg/Uq1c+g29oRyhuIlQPtKlANqN4ylTY+hAvoJTw/dozqg1lSoXP69qBI1Ep4js0KhxrHw5GqwgjQ/d3iUGO+kSmqbSpXC6LrGYsbn21KjJtExCnfSEBhrGww/ExqLjtCLb/YWk7douG/kYqKuwj1lX9x6rP6y0tLS3olcrsYuJP5CLWQ95o0NJD2hw6T6dZ9Os+nSCig7SwXaGqg7xsT/ABEaozbn3bbaCo47wV3+Z9Q0+oeeO8NVz3hJO/Nb/iilSV1uZ9Ok+nSNhv4mEFTYylSV1uZ9Ok+nSfTpFUFrT6ZYylTY8KVFXW5lZAhAEp0y50gw6jeGgkfD2FweFOkX2gw694cOkfDldRrwo0g4N5WphALcKdC4u0qU0Qfv2PD+SV3ZLWnjv8ylUzjWYldAZQ8kr1GQgCeO/wAzx3+ZT844VafiD9wi2hmH8kxO4lEAIJXqMpsIKzjvGrllyymmdrQAKI+IP4xa7jeI4cXExCW6hMNsZithKNG/U0qVAgjMWNz7Hh/JK6M1rTwX+JRp5N5iW0AmH8kemr6meAnxKtJVW4lPziHa8pVA4/crUs3UN5h/JMTuJRqgDKYVDbw4dDtHoldRMMNSZWNkPHDnqtKw6DMNsYyBrX4VM2bq9kw/kj1Am8+oSNiR+IjMWNzMP5JiHZSLGeK/zC7EWJlPziHYxGKm4iOHFxAANpidxLG14rsuxi4hh5uFIhahEdcykQgqbHhh6ZHUZXay2mG2MdwguZSq59DvKtPONN/ZMP5JidxyYfyRqatuJ4KfE8FPiAWqWHzDtwp1ChvAQwuJidxKOXLYQ0UPaLRRdQJUqBBrLm95TrBtDvGUNuIKSLsI7qmpjuXNzMNsZidhASDcSnUziV6V+oeot9sMw2MLE7nkDMNjPEb5niN8zO3zLm95nb54hmGxhJO54Cq47w1XPfkDsNjDVc9+IYjYwsTueAYjaeI3z/8AJL//xABNEAACAQEDBQoIDQQBAwQDAAABAgMEAAUREBIhMVEGEyAiMDJBUmFxFCMzQnKSscEVNDVAUFNgYnOBkaHRFkOColQkk+FEY2SwJZCy/9oACAEBAAE/Av8A6jpEZ+YrN3CyXfWPzaeT89FluWtOtFXvay3BU9MkQ/Ww3PydM6erb+nv/k/6f+bf09/8n/T/AM2O55+ioX1bHc/P0TR/vZriqxq3o/5We6q1f7BPcQbPS1Cc+CUf4/bGChqZ/JQuRtOgWhuCZvLSonYNNobipU5+fJ3nC0VDSxcyCMflYaNXKSRRyeURW7xaW6KOT+1mn7pwtNueX+xOR2OMbT3PWRf2xIPuGzqyNg6lTsIw+1NNR1FT5GJiNvRam3P9NTL/AIp/NqegpqfyUS47TpPBknij8pKi95s97USf3wfRGNnv2lHNErflZt0EfmwOe82O6E9FP/tb+oJPqE9a39QS/UR/rYboX6adfWsN0O2m/wBrLugh86GQfpZL7o21s6962jvCkk5tRH+uFgwbmkHu4EsSSrhKiuO0WqbjppNMWdEezSLVNzVUOlVEq/c/ixBU4MCDsP2ko7nqZ9Ljek2tr/S1JdFLT6Su+vtfgVFbTU/lZlB2dNp7/iHkYmbtbRaa+6t+aUjHYLS1U8vlJpG/y5VWKHFCV7jaG86uLmzsfS02hv8AkHloVbtU4Wp75pJdbGM/fsrK4xQhhtGWopoagYTRq1qy4POpJP8AB/5tUQS075s0bIe37QUNz1FTgz+Kj2tr/S1Fd1PSeTTF+u2vLUVENOuM0ip32qr/AEGimjLfefRapvGqqOfKc3qroHzWKV4mxidkP3Thamvyoj0TBZV/Q2pb3pZ9Bbe22PlkjSVM2RQy7DauuJTi1I2aeo2q08MkEmZMhVu37OUNBPWHxS8Tpc6rUF1QUmDeUl6ze7LWXhT0nlH4/VXSbVl91EuIh8Sn72ZizZzEltp+dUtbUUvkZCB1TpFqO/Yn4tSu9N1hqsjK6hkIKnpGSeCOoTMmQMvba8LkePF6TGROr0ixGBwOv7MKCxAUYk9Atd1yapKz/t/zZVCqFUAAdAyVdZBSLjM+B6F6Tauvqefiw+Jj7OcfmENLvsOcGwbG0kbxnBxhy1LVzUrYwuV7Og2ob7ilwWp8U+3zbA4jRkr7uhrBiRmy9cWraKajfNlGjoYaj9lqOllq5cyFcdp6Ba7ruiolxHGl6XOR2VFLOQFGsm14X5rSi/7h91nZnYs5LMdZPzGjGFMliARgRiLVFF50Pq8vQXjNRnBTnR9Q2oLwgrBxDhJ0odeSWNJUKSKGU9BtedzvDjJTYvH1ekfZS67tkrWzjxIeltvdangjp4hHCuaoyV9fDRJ4w4v0INZtX181a/jDgnQg1D5nGMI1HZlqqYTDEaH9tmBViGGByQpvkipnKuPS2q0111kWuEsPuabEFTgwwPbySkqwZSQRqItdl96o638pP5sDiMRpGS9boWfGWnwWXpHQ1nUoxVwQw1g/ZG6LpNThLUAiHoHW/wDFlUKoCjADoGS9L4WHGKmwaXpboWzu0jlnJZjrJ+ZqMWA7eDV0+/LiPKDV25dz9d4RBvMh8bH+4tNDHMMJUVx2i1RcdNJ5ItEf1Fqq5qqHSqiVfufxYgg4EYHYeRu285aI5vPh6uzutTVEdTEJIWxX2ZL0u1K1cRxZhqb+bTxPBKY5VzXH2PuW6t9wnqR4vzUPnZCcBidAte18b5jDSHBOl9vdy6xO3NU2Wkc6yBZaNelibCniHm499hGg8xf0sANg4d4Q4Nvi6jryUVQaWqjmHmnT3WUhlDLpB05amkgqVwmjDdvTasuJ041K2eOq2u0iNGxWRSrDoPIUdVLSS58R7x0G1310VbHimhxzl2ZLyoI62LA8WQc1rVEMlPK0cq4MPsbcl179hUVA8X5q9bI7BFLMcFGsm173o1WTHFisH/8AXKpG780WSl67fpZI0XmqOVkTfEKnpsdB05Nzs++0GYdcRzfy4NTTQ1KZsyBvdavuSSLF6bGVOr5w/m3Tp4cMrwSCSJs1x02uu8UrUw5sw1rkvKhStiwOiQc1tlp4XglaOUYMPsXct3eFPvsw8Qv+2RmCqWY4Aaza+LzNWd7i0QD/AG5SOFn7BtNo4EXtPb8xrFzaqT9clxViUlQ+/HCNx+9opY5lzonVx2HhXhdsNYMSM2Xri1bRzUb5sq6OhhqPDikaKRXjbNYaja6rwWtjwPFmXnL78l7XetbDowEy80+6zqyOVcYMNBH2Juuhatnw1RLz2tGixoFQYKNAGS+ry8KfeoT4gf7cmiFzxbRwquvSfmd5fGf8RlR2jbOjYq20G1Lfk8WiYCVf0NqO8aer0I+D9VtfBljSWMpIoZT0G16XS9NjJBi8P7rw4ZXhlWSNs111G12VqVsGcNDjnLsyX5d3hK79CPHLrHWH2IpoXqJlijHGa1HTJSwLFHqHTtyX/eOulgP4h93Jxw46X/SwGGrlwrHUrfpbeZPq2/TgXif+p7gOFQ3xPT4LL42Pt1/rajrYKtfEvp6VOscG97ozsZqRdPnRjp7uHRVL0k4lj/MbRakqEqoFliOg/tk3QUG9t4TEOI3PGw7fsPclB4JBnyDxz6+wbMl93h4LFvcR8c/+o5IDE4C0cWbpOk8mBicBpNo6Kd/Mw9K0d2Hz5B+Qt4DTxjFyf8jZpaKPmIGPYLNXH+3GiWapmbXIfysdOvTwKls+dz28NGKMGQlWGoi13X5hglbp/wDcHvsjB1DIQVOojgXzdW/Yz048b5y9b/zw7qrjRVGJ0xNzx77KwZQynEHSDZ1WRCrjFToIteVG1FUlPMOlDtH2F3P0O/S+ESDxaHR2nJW1K0lO0r9GobTaeV55mkkOLNyKgscBaNAo5EWgoJ5NYzB960V2xLz8XNkjSMcRQvdaathi6c5ti2lvGV+Zggszs5xcknt4c8m9RM36cld94S0TcXjR9KG1FWRVkedEdPSp1jgX3dm+g1FOPGecvW4e52vzT4JKdB8mfdkvOjFZTFPPGlD22YFWKsMCNBH2DpIGqahIk1t+1oIlghWOMYKowyXxW+GVPF8imhe3t5FVzjgLIoUaOQRGkbNRSx7LU91k6Z2w+6LQwRwjxaAZKi8Y49EfHb9rT1Us3PbRsHJXhLnSZg1L7eTgmeCUSRNmsLXXeKVqYHizDWv8cC/ruzCamAcQ88bO3hDQcRoNrprPDKUE+VXQ+TdHRYMKqMaDof8An7B7naPeoPCHHHk1di5N0FZvMG8IePJr7ByIGJwFkXNHDVSxwUEnYLUt1k8aoOA6otFEkS5sahRkqq6KDRzn2C1RVS1HOOC9UcnUzbzHj5x1crG7RuHQlWGoi103ktYuZJxZx/tlIxGB1Wvih8DqOJ5F+b2dnCu2rNHVLJ5mph2WUhgCNINpY1liaNxirDA2q4Gpqh4X1r+/2Bu2l8Lq0i83W3dYDAYDVaeVYYXkfmqMTaqnapneV9bH9ORjTNHbw6KhkqONzI9tqamip1wjXTt6cksqQpnSNgLVd4PLisXET9zyjuI0LNqFp5TNJnH8hs5ZGKMGQkMNRFrpvAVkWDaJl5w29uWsp0qqdopNR6dlp4ngmaKQYMp4W5usz4jTOeMmle7JujpN8gFQg40fO7vsDudpd5pN9YceXT+WTdLVc2lQ/ef3cjAnnH8uEoLMAoxJ6LUN2BMHqNLdXoGWtrkp+KONJs2WmmeZ86Q4nlGYIpZjgBaqnMzbFGocmqlmCqMSdQtdN1rTR50wDTMNPZ2Wve6d5xmphjH0r1ctPM8EqyRHBha76tKyDPTQfOXYcu6Gi32HwhBx49faOFSzNTVCSprU2ikWWJZE0qwxFmAZSrDEHRaupzS1UkJ806O76foKfwqrji6CdPdYDAYDVaeVYIXlfmqMbTyNNM8j85jieQjXOPZwqeF6iTMiGJ9lqKijpV0caTpbLX3lrjpj3v8AxyskixrnObVE7TNp0L0DkwMTgNJtc12eCrvsw8ef9ct93ZvedUU44nnrs7ct3VjUdQJBpXUw2i0TrLGrocVYYg5b2pPA6xkHk24yd3C3M1WKPTMebxl7sm6amzokqF1pxW7vp/cxT4JJUHp4q5N01TgiU69PGbkUXNXg0VK9VJguhRrbZamp46ePMjH/AJyEhRiTgBa8K/fsY4tEe3rcrPULD2tstLI0rYueUuS7N4AnnHjjqHV/88CrcR0srPzQp4G52u3uTwaQ8RuZ2HLftL4TRFlHjI+MPfwqKc01VHKPNOnuspDKCNRtPEJ4XjfUwwtIhjkZH5ynA/TqgswA1nRalhFPTxxDzRhY6BptXT+E1ckvQTo7uQhXTjs4NDSPVy4DQg5zWhiSGMJGMFGRmCKWY4AWvCtNS2auiIfvymoabT1nRD63K3DduqqnH4a+/g7ppylMkQ/uHT3DgDQdFrprPDKUMfKLofLe1N4LXSIOYeMvdwtz1Rv1DvZ50Wj8ujJukp97rRKObKP3+nbih368UPmx8c5L8n3i73w5z8QciozRhwKKlaqlzF1dJ2WghSCIJGMFGQkAEk4AWvGt8IbNTyQ/flJp0i16W2C00zy87Vs5WEqsqtIuegOldtqeVJ4VkiOKHg3zR+GUvE8qmlf4tqOB18C6KvwSsUnybcVsu6Wnz6ZZhrj193C3PT71eAU82UZuS/oN+u5yOdHxx9O7moc2leU63P7DJulnz6pIRqjGJ7zyEIxbHZwIYmmlWOMYsbUdOtLCET8zty3pXb8d6iPihrPW5N5FjGLnC0tUzaE4o/f5hdFeaKfB/IPzhs7bDSMRq4N/XaXPhNOuLeeo6e2yRu7ZqKxbYBakuF3XOqZN7+6NJtet3GhKkNnxt05LgqvCKPMY8eLR+XRkmjEsTxtqYYWkQxyMjc5TgeCjFHV11qcRaJxLEjrqYY2YBlKnUdFpozDM8Z1oc36co4t4pYo+quSrl3+qll6zY8hGMEHAuuj8Gizm8q2vs7Mt8VuuniPpn3cBQW5oJ7rJR1LaoW/PRZbsqDrzB+dhdL9Mq/pYXSOmb/W3wUn1rfpaWgghQvLOVUdJtV1cQ4tLnn77fxYkscScT8y3OVucvgsh0jSnds5C8afwqjki6fN77d+u1yVPg1emPMfiHLuhh3q8S3RIM7hbnZt8oMw64zm5N0cW93jndEi4/Td2xb9XwJ0Z2JyXrLvN3zt05uA/PkEGLAcC5KTPff3HFXm9+W9KzwePNTyrftZVZ2wUFm7LQ3ZUya1EY+9aK6Ix5WRm7tFo6Knj5sS/npsBhq4N4X1FBilP42Tb5otU1MtS+fO5Y+z5pFI0UiyIcGU4i1HOtTTpKnnftyF/U+8XgxHNk449+S7KjwmiikPOwwbvybqIsYIZeq2b+vC3MS5tXJH11x/TJuoixp4Zeq2H6/Te5mPOrXfqJ7cm6eTNpYo+s2P6chANZy0sBqJ1jXp/a0aLHGqJoUaBlF3I8hkqWMjn8haONIxhGoUdnDqaiOmiz5mwHtteV6S1ZKrjHD1R09/zfc3VZk7U7HivpXv5DdHBvlDvg1xHH8sm5ifCSWA9IzxkviPfbtnGwZ36cK7JN6vCB/vYZL4j327ZxsXO/T6b3LphTzPtbDJumkzq1E6ichEMEGW5qXeYN8Ycd/2HDYhRixAHbaSvpk/uA+jps97xebG5s17v5sSjvNmvWoOrMH5WqmNTJnzMWPstvKWmVVOC/No3MUiunOU4i0EgmhSRdTDHhzRiWJ421MMLMCrFTrGi13TeD10MnQG092SRc+NlPSMLauDjhptE++RI/WGNnXOQqdRGFiM0lT0aPpq4UzLsi+9i2S+H3y86g7DhyA0DJddN4RUjHmLpbguyoMXIA7bT3pCnk8ZD2arTXnUPzSIx2Wdmc4uxY9vCY5oJsTicfm+5ubfKExnXG2H5cOaVIYy8rBVHSbVUglqZZAMAzE5KCXf6KGTpK6clYuZVzrsdvbwrmfPuynP3cP0yXmm93hUL98/TV3rmUNOv3BkqGz6iVtrE8NBi4yUFC9UcebF1rQQRwJmxLgMs00cC4ysFtUXsx0QLm/ea0kjytjIxY9vI1J0AfONzUuZXNH0SL7OFeN9OJWjpMABozzaaaSds6Z2c9uXc1JnULJ1HyXoMLyqfT4W5tsbuw6rkZN0C5t6SfeAP01GM2NV2C0hzY2OwchD5S12Xfv8AhJNoi6B1rKAoAUYAZGYIpZiAB0m1ZfGnMpBj982ZixxYlm2nk6g4yns+cXbJvV4U7ffA4VSm91MqHzWI4G5d8J502qDkvj5UqfS93C3LHxE67GB/bJumH/XRnbH7/plNLqO3JXHCinP3D7OQuGmSprDvnNRccNuWtrYqReNpfoUWrKyWqbGQ8XoUahaMYDlG0sfnAOawbZpsNIx4N+JmXpN24N+3A3Ptm3on3gRkvY43nU+nwtyp41SPROTdSPHwH7p+mabTUwj749uS9NF3VP4Z5DcsPH1B+6Ml5XoIcY6fBpOk9C2Zi7FmJLHWTZRieQAxOA12YZrEHo+eHVanOdBGdqjg7plwvBTtjHAug5t503pZLxOdX1J/9w8Lct8YnH3R7cm6r/03+Xu+maP45B+IvtyXv8mVPoHkNyuuq/x99rzvTOxipjo6X/jLGNHIUsO9jObnH9rVHl378p1H5ydVqT4pD6A9nB3R0jyhJ4wWzBgwGzgXfor6b8RbarO2e7NtOPC3L/G5vQ9+TdTqpv8AL3fTNJ8bg9NfbkvX5NqfQPIU0rpHLGpwV8M7t4A1cOjhx8Y35ZKwYTntHzw6rRDNiRdgHCeKN+fGjd4tfd2wx0xngXMK6wNRyUPx2n/EX22vCTeqGd9iHh7lvjM/oD25N1P/AKb/AC930zCcJozsYZLwGNDUfhn2chDrOVecOHTxb4/YNeWvHMb8uBKMJG+cQJvk8adZgOQv84XXJ2kD98l3DG8Kb8QW3SS5lBmdMjYcPcqOPUnsX35N1J8ZTjsP0zqsNIFqgZ0Ei7VNujhxc7KnO4QGJwFoY97TD9ctWudAezTwKoaQfnFyR75ecOxeNyG6VsLvA6zjJcq516U/fj+1t08udUxRdRcf14e5ZfE1DbWAybpz/wBZENie/wCmqJs+jgbagyOM12XYcOGnOGVOdwqKP+4fy4GvRZhmsV2ZZlzoz843LxceabZxByG6l9FOne2Tc4udeWPVQm14TeEVs0nQW0d3D3NLhd2PWc5N0LY3m/3VA+mrkbOuuDsGGS803u8Khfvk8knO4Ma57hR02UZoAGocGtTCQNt4E6Zr9h+YwxtNIscYxZtAtS0EENMsTIj7SRrNpbpo5P7Wb6JwtNufX+xMR2OLT3RWRf288bUONipVs1gQ2w2uyn8Foo4/O1t38huikz7wzeooGS7X8Hoq2fzsBGveeQuVMy7IBtGOS9Xz7yqD9/D6a3MvjQunVfJujjzLyLddQeQTmjINfBok0Fz06uFOm+REdPRwJEz1wtqOn5hcN3+Dx7/KPGuNA6o4Loj4Z6q2G0cKqqoaVQZ3C46u20V6UchwEwB+9otLVQRR57ypm99quXf6mSXrNjkeT/pY4htLtw9ei0Kb3EiDzRhYnAYnos7Z7s3WOP01uXkwnnj2qGybqY+JBLsJXkIj0ZRpGUDEgCyjNUAdHDqVzJTsOngTR52ka+XuW69K1FSvaiH2nlL+m328nA1RjM5S7Y99r4E+9kvSTervnb7uH03ckm9XnDsbi5L9i327Zdq8fkEODZY8tGuM2OzkK1eIG2cGWLO0rrsdGvk0RpGCoCzHUBa6rnEOEtVg0nQvQuSqqYqWLfJmwHttXXlNVS52cY1HNVTqtDe1ZF/dzxsfTaDdB9fD+aG1NeVLUaElAbY2jhPjmnN53RapjlimYTqRJrOPKbmos6teToRfbk3Ty5tJHH129n02rFGDDWDjaJxJEjjUwxs6h0ZTqIwtIhjkZG1qcOQU4jIpwOWhHFY8hMM6Jx2cKSMPr17bPEy9o5GhuiepwLjeo9ra/wBLUVFDRrhEunpY6zkvG94abFIsJZdg1DvtU1EtTJnzNnN7ODTV1TTeSlOHVOkWpL+VtFUmb95dVoZo50zoXV17OBU00VTHmTJnD2WvG6JaXF4/GRbekcnuchzKDP6ZGxybpZc+uWP6tfb9Obn5t8u5V6Yzm5N0MO9XizDVIM7kIj0ZUOIyUXkj38gdXINErdFmpuq362MLjosUbqmyo7HBUYnsForrrJNUBX0tFoLgc+XmA7E02pbupqXTHHxus2k21a7Vd700GhW319ifzatvWoqsVx3uPqryMUrwvnROUbaLUN+nQtYP81/i0UiSoHiYMp6RwLzudJ8ZKbBJdnQ1pUaJykilWGsHkFBZgq6zoFoIxDCka6lGFtWu1VLv9TLL12x+nNzU+ZVtEdUg/cZN0sG+UayjXEf2PICw0jIpwOShPOH58hKc2Nj2cOVWiOKHi2iqAD41Cw+6cLRVF3Hn+Er+htH8En+8f8iRaM3YvNen/NreG0SDRPCO42e9qJf74PojG0t/wDyccj/tae/qhvJIkf72nqp6jy0rP2E6OVpqmWmfPgcqf2NruveKpwSXCOX9jwN08qGWKMAb4oxJ93IXBBv14Kx5sfG/jJfU+8XdIRzm4g/P6dp5TBOkq61ONkYOisuojEWmjEsTxtzWGFpUMUrRtzlOB5CI9GWM9FoXzJAeQq38z9eQnizNI5vze7L4enwjqMXi29K2ikSVA8bBlOoi1VMtPTvK+pRaaRppXkfnMcTyG52n3qi3w86U4/lk3Sz59SkI1RjE95+ntztRvtFvZ50Wj8ujJulpt7qVnHNk0Hv5FTiMqNjr12pp83ivq28KaUR+lYnE4nkZoM3jJq2fN7urpKKTFdMZ5ybbX3eIq97jhx3scY47eQpYTUVEcS+cbIoRQq6gMBaVxFGzvzVGJtPIZpnlbW5x+nrkqfB69MeZJxDkvKm8Lo3i87WvfbVr18gjYHgK2PfaKZo9WrZZapDzgRbf4utY1MY6Se60lUx5gzba7DkpqcNpXQbMpU4MMD80Ck2wCjt5Hc1S8+pb0V9+TdLU5lOsC65NJ7vsBdVV4XRI5544rd+TdDSbxV76o4kun8+Rjbo4Cvjr18MckyhxgwxtJSkczT2WIwOB+YR0ztpPFG02wjj5gz26xsx6TYnE8hTxNPMkSc5jhaCJYYUjTmqMLHQNNryqfC6x5PN1L3fYC4KvweszGPi5dH59GS8KYVdK8R161Ow2YFWKsMGGgjkVbHgK+Gvhg8myhhxhjZ6UHmHDvs0Ei+bj3W1a+RAJ1DGy00jdGHfZKMee2PdbOii8moxs7s+vI7Y93I7mqTBWqnGvip/OTdBVbzS7yp48vs+wVz1fhdIC3lF4rZN0dHmSeFIOK2h+/kQcLKceADhqsr7eEDypAOsA2NPEfNw7reCJta3gY65/S3gf3/2t4H9/9rCkXpY2FLH2n87CGMakFtVnmVdWk2eRn16tmV2x0DkaGmarqViX8zsFkUIgVBgoGAs7BELMcFAxJtX1Jq6p5TqOobB9grqq/A6sOfJnQ/dbXqtNGs0TRyDFWGBtW0zUlS0T9Go7RyIOFlOPBDEWDg9nBB+ZsQvOOFmn6o/WzOzazwHboHJXLQ+CU+Ljxz6W7OzJujrMAKVDpOl/4+wm56uz08FkPGXmdoyXzQ+GU+KeWTSvb2ckDhZWx4QJGqwk22DA9PADcsWVdZFmnXzRjZpnPZ3cJ2x1auS3P0O+yeEyjiIeL2nJXVK0lM0rfkNptI7SSM7nFmOJ+wkbtFIrocGU4g2u+rWsphIuvUw2HJugu/NJqoRoPlB7+TV8dfIAkajYSGwlHSLb4ts4bbBrZwyYZdG0WLoPOFjMljUDoWxnbowFi7HWx4ZOGuzNjyV20bVtQEGhBpZtgtGixxqiDBV0AWOgYm1713hlRxfJJoX+fsNdVaaKoztcbaHFkYOoZTip0g2IBBB0g2vigNHNinkG5vZ2cmr4a7a+VxO22J2m2J2nlWfCxOOvkqeF55VjiGLNagpUo6cRpr847Tk3Q1+ANLCdJ8ofd9iLhvHeX8HmPim5p6pyTxJPE0coxVrXhRPRT5j6VPNbbyYOGqyvt+ckgWZ8eTRWdwqDFjoAtdN3iii42BmbnH3ZL4vDwOLNTy7auztsTicTpP2JuG8t8ApqhuOOYx6ezJV08dVCY5RoP7WrqSSjn3uT/FtvKBiLBx81LAWMmzlFBZgFGJOoWue7RSJvkumc/wCuS8axKKDPbSx5q7bTyvPK0khxZvsUNGq1y3n4SN5nPjxqPWyVlLHVwmOUdx2WrqOSjlzJNXmt0HlQcNVhJtsGB5fHCxkHRYuTyqqXYKoJY6gLXRdgpBvkuBnP+uStqo6SEyS/kNtqypkq5zJLr6Bs+xgJUgg4Eaja5r0FUBFPonH+2SpgjqIjHKuKm15XdJRPp40R1P8Azy+OFt8Nt87LZ4tnDbbHgYjbbPG22+C2+dlix28vBE88gjiUsx6LXXdqUS5zYNMdbbO7JWVUdJDvkp7h0m1dVyVk2+Sfkuz7HA4EEaCLXPewnwhqThL0N1v/ADkdVdCrgFTrBtet0NBjJTYtF1elfomhopayTNiHFGtjqFqGiio482IaeljrOS8K2Oiizn0seau21ZVSVc2+THT0DoH2Rum+MMIaxtHRJ/NterJedzpPjJT4JLs6GtNE8MhSVSrDoP0NdtzPPhJU4xx7Ok2ijSGMJEoVR0DJed5R0QzRx5uhdnfaomeolMkrZzH7J3ZeklHgj4vBs2d1qeeOojEkLBlyVdJDVx5sy47D0i143TNSYuvjYesNY7/oOlpZqp82FMdp6Ba7roipcHk8ZNt6BlvS+guMVGcW6ZP4sSWJJOJPT9laSplpZM+FsD0joNruvWGrwRvFzdU9Pdlr7nhqcWi8VL2ajaro56RsJkwHQw1H5+iNIwVFLMegWoLiJwasOA6i2ijSJAkShVHQMlVUxUsefM+aPba871lq8UTxcOzpPf8AZm7r5lgwSoxlj2+cLU1TFUpnQuGHsyMAwwYAg9BtW3HFJi1Od6bZ5tquiqKXy0ZA6w0j53HG8rZsas7bALUdwu2DVTZg6q67U1NDTJmwIF9+TUMTa8L7SPFKTCR+t5o/m000k8heVizbT9m4pXhfPico20WoL91LWD/Nf4tFIkqZ0bBl2jJr12q7npZ8Sq70+1P4tU3LVReTAlX7uv8ASzKUbNcFW2H5tTXfU1Hk4jm9ZtAtS3DGumpcuequgWhhjhTNiRUXsy1t7U9NiAd9k6q2rrxnrDx2wj6i6vs/BPLTvnQuyHstR39qWrT/ADT+LQTxVC50Lq47MssMcy4SorjtFqi4qaTTEXiPZpFp7iqU8mySD9DaalqIfKwyL+XLxxvIcI0Z/RGNoLnrJdcYjH3zaDc+g0zzFuxRhanoaan8lCoO06TlOgYm1ZfNPBoj8c/3dX62rLzqarEM+anVX7Ro7RtnIxVtoNqW/KmLRLhMvboNqa+aSbQzGJvv2UhhipBHZwJaWCbykMbd4tLctG+pWT0Ws+55PMqGHeuNm3PzeZPGe8EWa46wat6P+Vjc1aP7QPcwt8E131B9YW+Ca76g+sLC6K76n/YWFyVh81B/lZbgqDzpIh+psm57r1H6LaO4qVee0j/nhaK7qSLmwJ+YxsAAMAMBwKitp6fysqg7Om1Vf/RSxf5P/FqmsnqT46QsNnR9qIZpIDjDIydxtBftSnlQko/Q2gv2nfyqvGf1Foq2mm8nPGfz5eSWOIYyOq95tNfFHHqkMh+4LT7oGPkIQO1zaovCqn58zYbF0D7XxzyxeTlde5rR3vWp/ezvSAsl/wBQOfHE37WXdCPOpz+TWW/6fzopR+lhflJ/7g/xt8NUXXb1Db4aovrG9Q2N+Ue2Q/42N/UvQsp/KzboI/Ngc95s+6CTzIEHe1pL8rG5pjTuW0tfVS8+ok/I4W1nE6//ANbdNA9TMIosM47bfAlZ1Y/Wt8CVnVT1rfAlZ1U9a3wJWdVPWt8CVnVT1rS3bVxc6B8OzTwKSnkqpd7hALYY6Tb4FreqnrW+Ba3qp61vgWs6qetb4FrOqnrW+Bazqp61vgWs6qetb4FrOqnrWkQo7I2tTgbU1O9TLvcQBbDG3wNW9RfWtNdVXDE0joM1deBx4NJTSVUu9wgFsMdJt8C1nVT1rS3RVxRs7KmaoxPG4FPQVNRpihbDadAslwVB58sa/vb+n3/5C+rZ7hqBzZIm/a0931UHlIWw2jTwqegqqjTHC2G06BZLgqDzpIl/ex3PydE6eraS46tebvb9xtNBJA2bMjIe3gIpd1UaycLfAtZ1U9a3wLWdVPWtIpR2RtanA8CC6quaMOqAKdWccLfAtZ1U9a0t01USF5N7VBrJf7C7n/lSP0W4dZQwVY8anG6w12vK75KGTjcaM818m5r5RP4Z93IVvxyf8Rvbbc78pj0Dlvy7vBn36EeJbWOqeBua+UT+GfdkvD4hUfht7MgBYgKMSdQtdd0JAokqAHm2dC8K9qWkNPJNMmBUc5dBy0tPJVTCOFcT7LUF0wUoDMN8l6x93BkRZFzXUMuw2vK5MMZKP/t/xY6DpyUfxyD8Rfblrfjk/wCI3ty3JdefhUVK8XzEPT25JZEhjaSQ5qLrNrzvB62XqxDmr9hdz/ypH6JyMc1Sdlv6gT/jt61v6gX/AI7etZd0EePGgcDsNqOtgqx4l8T0qdeSphSohaKQcVrTRmKV435ynA23NfKJ/DPuyTyb1C8mGOaMbf1BH/x39a39Qp/x29a39Qp/x29a39Qp/wAdvWt/UK/8dvWtM++TSPqzmJtud+Ux6ByyIsiFHGKnQRa9KFqKfDXGea2Xc18on8M+7JX/ABGo/Db2ZNzVOJKh5m/t6B35JHWKNnkOao1m1Rf4DYU8OI2vb4fqceZF+htDug+ug9Q2pbypanQkmDdVtBtumqcWSmU6uM3uyQxtNKscYxZjgLXfRpRwZic7zm25HZUUs5CqOk2nvuljOCZ0vo6rf1CmOmnfD0rUt7UtQc0PmPsfRlv+7xIhqYR4xeeNoyUfxyD8RfblrvjtR+I3tyXLde+4VFSPF+ap87JI6xoXchVGsm173i1a+amiBdQ29v2G3PfKieick3kn7jboy00zU86SprU2U5ygjUcm6BM283+8AbbmvlE/hn3ZLw+I1H4Z9nD3OfKQ9A8Crp0qoGik1H9rVlM9JO0UmsajtGTc18on8M+7JX/Eaj8NvZk3M4eBSbd892TdCjvdx3vTgwLd3BYljixJPbk3MU3lKlvQX35JpVhiaSQ4Kuk2vGukrZcW0Rjmps4FyXo0ci09Q2MZ0Kx83LetN4LWyIOZzl7rUfxyD019uWu+O1H4je21y3Xv2E9QPFeavWyOyohZyAo1k2va8mrHzU0QDUNvb9h9z/yononJN5J+48CGJppVjTnMcLKM1QuzRk3QtnXk33VAtua+UT+GfdkqY99p5IwcCykW/p+T69P0t/T8n16fpb+npPr09W39Py/Xp6tryoGoTHnurZ+OrJuc+Uv8Dknfe4XfqqTalnSphWWM8U5LzolrYM3VIOa1pY2ikZJBmsugi25r5RP4Z92Sv+I1H4bezJuaqAk0kDefpXvy1N1Us+nMzG2potNufceRmU9jDC011VkWuEsPuabEEHAjA7Mt0R73dsA2rnfrk3TzYRRQjzjnHhXZMaighkbnEae/Jupj0QSdOlbUfxyD8Rfblpbs8Ir555x4nfDgOtpyEgDEnAWvq8vC33qI+IX/AG+xG5/5UT0WyOM5SNot/Tx/5I9S39PH/kj1LLufGPGqD+S2orvgo9MYxfrHXkmkWGJpJDgqjE2qJTPO8ja2ONtzXyifwz7uHup59N3Nk3OfKY9A5K74lP6B9lrrr2optsTc5ffaN1kQOhxU6Qcl9Xd4XHvkY8ev+3Zbc2P/AMi34ZyV/wARqPw29mRWKsCpwI1G13X0kgCVfEfr9BsCCMQcRwKqlhqlwmjDdvTa9Lqek48eLw7ele+x1WpPisPoD2ZN0/x2L8P38Lc78mL6RybqPicXp+61H8cg9NfbwSARgdItfN3+BzZyeQfm9nZ9iNz/AMqJ6J4dRURUyZ0zhRa9rzatOYgKwjo25NzXyifwz7slU5ippXXWqki3w7VbIvVt8O1WyL1bfDtXsi9W3w7V7IvVtXV0taU37N4urNGTc58pj0DkrviVR+G3syXHePgz7zMfEt09U5RRql4eEpozlIYe/JXfEqj8NvZwIZ5YD4mR07jaC/KpPKBJO8YWhv8Ahbysbp3abU9VDUjGCRXyMoZSrDEHWLVsHg1XLF0KdHda6X3y7ac/dwybp4c6GKYeYcD+fCuyDwehijPOA09+TdTJ5CPva1J8bg9NfbwILwgnq3gjbFl6eg92SohSohaOUYq1q6lejqDE/wCR2j7D7n/lRPROSQ5sbEdAt8PVXVh9W3w9V9WH1bfD1V1Yv0tJe1bJ/ezfRGFnZnbOclm2nLua+UT+GfdkvD4hUfhnh7nflMegcld8Sn/Db2ZbgvLVSzn8Nj7OBX/Eqj8NvZkhjaaVY0GLMcBapppaZ8ydCp/Y8CnkeKZHiODg6LDJug+VJMNgtuYqeLJTN6a+/JLGssbRyDFWGBteV3yUUmnjRHmvwLjuxnkWoqFwQaVU9OW9anwqukccwcVe61J8bg9Nfblvy8yzNTU5wUaHbb2WRmRwyHBhpBtdVctbBjqlXnDJeNGlbBmNoYc1tlpo3hlaOQYOuv7DbnvlRPROSbyT9xt0cPc18on8M+7JPHvsLxk4Zwwt/T8f17/pb+no/r3/AEt/T0f/ACH9UW/p6P69/wBBb+n4/r3/AEteFOKWreENnBem2535THoHJW/E5/Qb2cC47x8JTeZj45f9hlrviU/4bezJuZpcZHqW1LxVtIiyLmyKGXYbVFx0smmPOiPZpFm3PyeZOh7xZbgnx0yxAfnagueKmkEjsZXGrYMjEKCW0AWrp/CauWXoY6O60ErQTLJGcGU42oatKyASJr85dmRgGBDAEHoNp7kpJDioaM/dNhufix0zyYdwtS3XS0xzljzm2vpy39eIijNPCfGtzj1RkpPjcHpr7ctd8eqPxG9uSiqXpKhZY+jWNotS1CVMCyxHQf2yX3d/hcW+RDx6f7DZ9htz/wAqJ6JyTeRf0TYauHua+UT+GfdyF/fKs35ey25z5THoHJW/E5/Qb2cCN2jdXQ4MukG111y1sGOqVecuSu+JVH4bezJdN7QwwpBMuYF84e+0UqSrnROrDsPBlkSJC8jBVHSbXvevhQMUGIh6T1stLUyUsufC2B9tqC9oKnBXO9y7D08GR1jUs7BV2m1433oMdF/3D7rE4nE68lH8bg9NfblrvjtR+I3ty3TXmin0+RbnD32VgyhlOIOo5N0F3a6qEfiD3/YWnnkp5RJCc1x02+GK767/AFFmvesZSDLoP3RyFNUSU0mfC2a2GGq3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i3wxXfXf6i1RM9RKZJTi51m1NUSU0m+Qtmthhqt8MVv1o9UWe9ax0ZWl4rDA8UcGmnkppd8hbNa3wxW/Wj1RaS9qyRGRpBmsMDxRljkeNs6NmU7QbQ3zWR63D+kLLugm86GM9xsd0EmGiBPWtLfdW/NzE7haaaSZs6V2c9p4VPXVNP5KZgNh0iyX9UjnJE37WO6CXDRAn62kvurfmlE7ltNPJOcZpGc9p4CMUcMvOBxFvhit+tHqi3wxW/Wj1RaRjI7O3OY4ngU95VVPEI4pMEHRhjb4ZrvrR6ot8L1p1yj1RY6T/wDVRf/EAC0QAAECAwUIAwEBAQEAAAAAAAEAESExURAgQWFxMIGRobHB0fBg4fFQQLCQ/9oACAEBAAE/If8Akc6ouxTPK6ancuUt9kR1ouywa0IoQxjyUaVsZtTHdCTuoBdCP0U390TXNRNGBYwND8wbyUYXMKGA5Ak+yYiZtFyU2ypeeaAAwADLaAGD5ZT3PYm+iMc0LqQTsQBxc5TWqtU+UlRmLDiKletqTWypuYbocwKiFONSJydG9UNyxCwmNfqjh8d4X7lY26F4QMTd9URyYkudD9kWAeHA9xCnC5nuZGheTqX1hin+qUyHIjmBiPkYiWEymUQ2q08kyNTOG4SQDBhAC10FCS/AE4g3Ub5RMvDPPEovuwk3BYvjtHoarSkYU8qhuspwKYwd4Aw4yQyacRxbq9pERvmpnoMPJUViyB0OPyBgD+BFp5IADvI+lrK5midydS3QcJ9ERLcvWH+XM0CB4VCPXCPg0+VzkgQQCIg2GB+mFwtVYOQ4IiA+AdK/HJDAoQ8p4AxhS0YWuQe9RTeioYqCJ78EbFqZHJ/1HR6EWTTvQH3CkgUI4NhrQYJaUTuMQfKr1RCAICBBw+MFKFMAOShtqQB6uyFiZgBgLG0iSI6QTw7mOZhuRLkkxJmdu9xgABECn0aDgdtG3Jz6gRwIcS8IACQIMiLD2CoBjvqpzf3HT4tE2YsnMocA+ICOgoLAkUchgFKUJEPR3KitQIcn/DqgOiIImBU/el2RgSDA7YeqmTuomW3CheRZAdOQOFVazN5x8UCnAnwkHhosczU2OByHsIDNORsPtIn/AB5fCLSRur3IqQMwbAPlNhiM1H64L9oxMBgDHZFAM5DEFOOmMgj1vQBFBIgjGxps3J8BRbqsAxB+Imps5J8UBkGYAYAWGTQoTPIUYebkOT/jzuAXRSUEXQjCc0UQjoECZ190lvP5J8OXTyCnOqcyGZwZgYjYiJOWZnioQ8Bp1KhsgWG1csiLKmQeunw8pt83ODl1UpIBiAESTgjPuSOeWgZ7edoVkvKegeVQXfIpcgFIG5C9Cru7HkWgK4gioMmGoteSsJA0Kftx7cMipvSAsdgNt6smhTo8Yz8hZCTg+WRyWKW4rmMvhryF4n5jl1sBbFeQARCwTvznLLaz1apgEGb2SSUGszcCCCF4EnCyAkEwgbCAK/eA9yutpmBx0FPZqSBBBACCIEG+exIgnmYHWzGVkH+F/TJ7r4juMvhePQgK6aIAAAAMBghYhnIYAKM8/edTlltImAgiJGdcC0bJoCRPNY5CJDs7AYd1nll68S0UCO+qmlPuPa+fsW4FBwBqZMrHE1NXNkirT3EwfhM54jsDMoA0VhgESAHJYIpGhYkY66bNiBvwCju9yQQtCFoQ2PNtB3IZFNVcj1U3bt32uwVzkCqqJE9SozvmREOBQUQ9Z4sdYcgez/CHXROAqUDmpiLEmx3TQ9Pfhsz4AcSEAAACgQQuC4EELAVPBoSguQjNlxwxRXcU7A0jh08k4gEaDdXQg1T8wzZI3i2xEMCkU7AnDEqGx3jyB6AevwfCRvyXlZhUp8zWiOxMIDlC/AoIIIXgjMBoAOpE3UmWBmTyDqgqyFzVxzKlxmjlcvMCIk5Esy9yk8A3QvxaoEMQiyJIA6O4QaKOQ4NwDbEwOcenRBBIIIIwN5/Bgg9GYQvQbDEIY0VxiEYbn0JiPguRpT7wsjUycCCfHJye2xZBFQFPE2iwIWBASQACScAmU5v4KNnnoBNIdkZPw445o0QOSiVnAonQvVlAbVso1umMgdKFS43mNyXTiLBUZ9b7DiImBx8bIXxpHwKLgPJGB+BzM6dGJUOYhGAcwCOwczqtiMgZXFYLgQQqUcATc26p4pvZzid6JABJgKp4HnCTesDdMLAgghdajVNmJqkiOhyUOQ+tnkuVfQeLsvGQEIC4IwKCZiRZ132YUiMVw7OHwN4gmf0j4sbIKl9Y+diYUxDaG83ghcxyA5Kb8xcd5Wl2MbHF/L9SjmmSPuwWBBC0WCOFAc6olySS5O0ILN5gKGIGIwCo8WgMAEgxBxR3gMw+a8joJa76TRSwE4IxCe1IDJT3CBowPwEmuWgz8IQgMAYAYIibHIxK41GA2AU6mneCZS1YnoFBSKZxLfYYCddR8V/RkEEEELoQRo2UWQ8KDbFuq8wCoXQ/AWhWgwxFgQoapjnnekWMXGndZTks31+AuDTgMPmyHSO078NuA+Q5gEymYicOsqhAMLHPQ/UsrUoNLAgghYLoIU0SsV/qDsyIDmBMlQt8OiBo7orrmjicwy6WuNe48HJBcJhaWFql9YXsU5NUYhGVZiZIKAJwOITjDRNSkf75q/joE0AQGAMAMEYliiRU3O8Gwn8k0Lo7WhwCpWMwIo5CgskmNA9HNRJJJJJmShYELAhdhMDmdE8oDc/ezIAJIWAEyhAGIICmmtuveHlZWucl9Zigh2wYiwgEEEOCmc+gG7xemZcSmOPWxp0beJcD1/vsnjwwnz6WOGjwwkOPTYwjHG4Fm7FL7IDZjEmZVNhyNEEnBHeTi4vpYLQhYEELRTHLHuophwGA2kjMj4bhiZ2L4wQkLcYy5Hg7+tscDeowcOl7JTFcQ4IobicGoU67mhfMVrD+6ENzMGalEj1HFECEmAiSjm+ihLYPOyk1u9IYPte7+RsFCCck4KLM6AxznwhYLoQQsJBCQAEyVP4zsiSSSS5Mydo8YXMnX2ukPaJ7KtcIgJEEFwRggFglWdd9rGGJvXguL0cXJ7OW6xi8wdMDyb+6+AcHAlzsiM3NJ8n2ADmE00hhcB4IxplzlwOZsE2Ack4I72QeGetgQuCwIIKCF6UUdibCMtqzpAvMyiHaBg2GV0rAczrvIgkAQBYg4XHZ9FrutZ/HbV+2vOemOsx7nY1BycCfJ/7rdpMelXseJ6Q3ddhHErh7AeGai1GeOVbXuIIGLxcCFotaxoGJT/3N/gfASTUUIgAgJRBF0qLwJHIzqgs11BU2hIPEMkfzBgwxBobGR1Gvjidt1kznnvUDcvWF2GwJrBSwuO9BRcThkp454D/b0mhhwzAOuKJYOZLPiDTDlsM+GJtAJLCJOCC0w9xaZmUgoELD7HcjqSn0xXXCuEmhFYw3IPqSnsGZCJHcqOHkjgomJ/xYJl044ty8wBdg9bAtEYcqBJEEEgGCBFE4jbmsjxtYYQe/I9L0fIvcmLHQZDfED0H9uFrkOgI9rGNLcSg7qWz8xrDCcat1se4cMtU4BMAcpsNYFHgFHSNBYsbVQdzQAYABldKgAcC7mY7lS5Qw0DD/ACRnSGaktBEVYjYN/Ye8+3Wx7D8CQNjUCJC0DyLzrmDLUvBsYgRMegeR/bceUDUvo2NrN9oHkjYRtxbjbImjEoaDFiwuxaaLc1yJGSyHcLXzYQcqlQBFjqCOp2/z9KBhnxHTYMwusIHtY8qG+RA9rK6Mua9Hpg0tDDvZBeLDWLt/bdMSxOg+7GEkDiT+bDWUbZAhv0BfzYETJ1BNogDnLBFc4CugBcD6iLAMgso8UAuPjH/Me5gNYKTDx335hDPep6uS1CjkwA1IHrYORjcQTGAzELoIgExEIQSQeMIE6It6PNBkt39p5YlxDZTRnuAGwBgUFjOH3gLpSK8SZO4DdHEnUZUx4lZqUN7wCsgjEKZ/zuoit5Ed783KxERUHQcATY+ZcPekbMhFzXnMmOabtZQZzjHv/ZksnOnZ6zxvtHOybwDGrIITExqnW1sUwGJ0Cegw1DwWePifYt1sT/ocQxPGLo94cxckJyTkFn0k3a1+zEw3GPmxo5zefvZA97HV+O3b+yYgrLpHJZph5IFwDW/KyCKxneH0QSgTACQsjQ2JGATxPkm4bgic8TM5Oz4Af6KAgjQw73jTtzS5HGU7i3ez2Ml5/wC0n0sbpDkX9kc2Ec7MiuuQkL4BeeIkigAAwgBZHF8VR8BQuwSIoZnaG5qf9BwEzHAiYDEPdhOXOBcbP479rHho5C9qkdSxmrDzHn+yGYD5LCderI33qEPM2GypGb5CjQkchyU002BhhcoAI89ExtMj/pnaLNdcrvoUc3HVp4giwITHq3i1xrAT6P7L2lFpjO/AYwACDOMSixy8rWH12EJO0QtbuWKw/wBExe3oundhBDnE6xtJ16OiQBJkEYvM/EXvcrsc7/ZDYlOksBwKN/DJgoeGkbgMApfcAEBL3seVA3CGJH+iZosuFyvBW0BKHMMGGCWlhZ6ihRmaA1aCZrwRcixKP9kzoHMWMPYLkrYtS+Ro1iQAAAAYCyPqXDWzf/R+hKdh78mWNb1dMIGA3BHtf3EOdjR5+Y/sguBpFG6GIdZPLkhJpf6Nsu8YAHJgAhDGcyqbcw3Jmth/obzRCe4eW2GRi6mxpULgJMAYEPUvq+19BB92O514l4/smRWbP5IhwyOcmfgN+DWtl3p2h53CABKRgimJk1rExmP9DpQgA6h7bDeM3IWNuHpQ7qLLlbiA5C+7VroO1jG/Cfv/AGn7iQ9xIs9GBj3viBe2RdLMCBgsDC61MhY63JHUH+F2zmE29Q4s1CsKnUyGOaI45hOJh/wJrLhgxToiTfJ7B5dDfhjYyxYt9GwqdzZeyhbuCHb+1Xg/AgHzZQDsvbYE9gbCbrc4g0Xt6bVcEfFgUQSAGI/wEgqMPRzdKkUJxEY3sGKEzoC0WFPWjgZUBL6VUGmeAHAYWAB/rUhyHO+AYEzAIEkB4QhHkA5Rz8ycZf8AtPDhG4t3sdCExOsR0OwnWiYNpp4JYIchA19tiguNm4ee3OWMBAPTTaPccQOp5mwQ2UHnBEnQR7WVPeGph3/tugliE948tZAWCG6fJ9g08LSgRS1iwC+wfDmTHQ3R4brQEiAYjZwi4AOSig4MZ+pU2GVAATKgCFwK4yNRImU1MdA/SlD3WBRYE7P87zJxBYWEwdHPYmofHPaPQJPf9AbGNMXzpF1b+3KPwahSU2O9RQzi0KmLc9xbYNJsaaW6zLbbQDwUFGyMwbEkUp0WiTa9VvrKKC5x3ZHZ8gUCgGF04GvsAU3PevwTCzJQb3GssA46CokRxYOKO+zejERuCA72NoYBB1i6N/cewuYekxyNjOGGHWR6c9hENVusiznuwmPRCVrWFgHJYWRssNRBEwDklS6FAT4KyQMUo/AqmFOAi6DuJRgAH2FESAJJgMSn9gZg3yINEm91MzsRSsiyEiopdfBS+PFe5WUjL4ii2DaYGwGo5xqFSznwokASTATRzmIGmHL+456bHpR7GUTp4B7bAmIImiYIxsjeFkHYbJIkya4ycEBclxcB9CmFp9xyRtcLtCDPuIeqDUPoFD+bE4nxYVBRlTH4RiFegJbWtwh1BijoZcgTwz2uEr6hgGXdsGEQX6y5uljxGDvfo/8AdkCNTxOMTIoHLlHvU2V7rYRX7rcVuVKZHRCIcSvwAGt8QCCCHBRTmny/zvTlxP5ggGjciBWLnmqcAj9vsMPI24AgO532P79Abuv96J8TjehusYTB3PyOmwBYuExG1o32KZstF4K0CUgiEiE7AhwQQ4KO4D46P87/AF5EMMwoVC4FBMTTu2E3pp6DE8EA5hgZBFuYg2QU3Wnl/eja3MZHj1sBAnBygSRBIgCAgQcNhOpG0FihixSBk9ZTQ+KBsPAqVaEoCwqYlEkiSXJxKN4HZOLdPAp7jM/yBnZhUouU0Mdg0A5/e7WOejbn5PwB4XQXmdngVsfGfHYuB08LQpS+E+ybgBRA2VTRGgg0P+AGyNNXLAwGgU07ozx2ASZJlmgJsyIgQkwESUyfjZed/wAAkGiXwxu1jfAPQEkXQSSMDsAWTXO5IRBAghxec12bWGGaixckQVOKxIgkwMc9iZYxZB1SvOyDifJApEiseUcjhTBFOYSbGaFOUx7LJcoRyx+PgT/H47XfY2USYYDv2JCcIIuLhCQBhAb2CdqN4wHXfYyOGLgjgWRAMVYt7kDMaydbYdAAIMAoFuUlPDULcobF94Ax4wUPYCAMAh7iRGATkYI1IkPgRzTBurcgQAJODEEKDIQUfabhx2JicIIuLsplRTyJC43OSDGSZNayZMmTJrGTJkyZMpMIMQezScxywuO0NjoqHnIYWMNYbph3fBMKW5HgbulkJB9oQggkEEETBw2JCcIA50vTUyp94UiC0QVRAgyN5kyZNayl2QUzVBSEsQlzG4YTUlsjLhJ4ug62RxSIcICfTITP4JphsBULayTIUjA+47IFi4mhQQHYTQCDmAVigIFxbUIFkPFFqCgTJCMo2GTIkJg3qacZB4k6BYiOpR/YKdzffELoc6CmydA9CMShoxmGARAhAAIklGjcJr9vgzvPBGldQg/hWGIQmQAxBxTaiSxV1dtmaCIIEA42uY4r95fsbUEAiUQnLZONcwHc5KKNNzazJVDAeo/CGpuSPwNDY21zEI0ciqfzsyE5IBoP+melEgEBsyrTWEyU9WNBwyZWCdQQw01Ixikhck4n4TRMMJqzsdeSjiVQjILgxBIa7SUyojpwP+WclGNCfZlCFMCJJQUAB8FB5sLMFPRPwny+cn4URIEiCIgjBBGAAaHzY9WEwTOoTfXOTJ85bUkxkTBwWLcduQmICAqWNMMtqemrTBKHW23DQZ52EYyHM6BEGigCQ0HwwxYpwFiCiFAKBkBqM8rAPuWzGaezjoQ5UHbgpCQgGbFAcUGeEC4Eyo4p7HFQsoikcAFEsARfht5NowUCjeBYNoKQZtAiErCQpDT4cYxJDggsQU0ZJlCyGtVgHBRMabM3kH8mBx6ZxyUbg/c9LHY4JmfjNEjmQEmg+Iz5SGwy8kCABJwZEWV0oyeIqZlb+MVgES+MKWFYFhawUTeKhFlYqmQy+JntQsfbBH4imGRpY0PQw0CokQYHAd/4b6TcjUKgRFFw4I72GAimGpWAO7VHLFOSLkn4q7/+wBQw1CGp2thSJiHECfSLUb7/AHyi0BclamlR3nwpbHgNYxFgDHIBioqqM8V2+MwVGHoiq36aeoYWFsIxA4K5mTLwiuUYjv8A9YyeKoo3mfPvGQTaPiRPUbCQQgAESSmcSD+Qhg79MvjYqNcVBMHNKG/wQUfpFcWEACAcHAqIhaHYjZNRw8RHgImFj/mbyCSBs9aAzQlTAWth7uLLU4IkFKgb1fj9ccunqMV7ga+C1ywlqLcqePJyzAcgp0NJP1vKOlkqXjiEDtnEqhUZjUDHIRTRorOKj1A3MNpAhAAJkpyMxgUGvgoyXljfifkYiNpMimgPsLhNJIwgHGSDTFIk4ucegLqbfmd0YYVQXghjAPQminI+YspL2nuvae6Kp18ynWqXlT+BG7fnKmhZscljXq95ppKgA1x7b+EvwBBj6GhPbdyG75Q/RaXJQmqCOkmYaG6SanmjQeG3bD8sJ1yA5zknIaqOQTu3PG6Xy4xmjT63BUYzS5Ujp7N8kX0Iu6PnvlBcNHrPZAy0hoTokd0Py5CK5pFdQC6pycg4MuSJLg9Rj/5tjxIRIcwheyta1vRODHxoggkEEETBti4FKQFl/wAqvzq/Or8yvzq/Pphh41UIXOJMJaS/LpgCHZk2l0mcBKQs24OAwGQuCwQP9woADkQdC1B3X5QYnKHKD33K+V4ICh+8UxboJRnFnMkJfhc81pQiz3JQeDUr86vzqZYeNVFyK/GJNovzqA+FcAw+C+4pfJQKiEO9CgJ/AE8jQ2e9rsHrKl73K3ExwPZjc9pWx7SqwxQpgTJUzU3R0KnO9HTZNDgM7XYnEnAKlCBU2A0YXS06TC4TAE1JHq7ICQAQRAg4Wekot95Va/r3mDKwZMByLGRf3nP4L7mlkN3YSvyS/MI7VgJRGWigDdY66A2mamcPdL3NbADzB21YL8gvxS/HL8MqHC+FC2SaOV73K0DsdxiFMWLrChzFvta2PcVWBGcCNVjw62DihuTBHGYpn3BTUOn2LB3vZKOgY/qYqWRxeDvZBkIIGE5RxDsmsQIwCjhqg3EUOLAA6FyDSFFvlbBOjg42os9JRb6iqx9CUeeHLrYF2byACCXDHNM6vg3paWeuohJpafEh5qMQgyEOLHKB4duy9bXYmvU5XBw0jiVQgU4gJVhZ7Stj3FVkqxH4LGcEBIUei6fmvEnNjjCX2ugsa0ZxFhSZkaqm0o1KPWJYB6WGIjJNbYuK9IXpqLfcVJ5D0Tcxy62DWq8gAozjfNfB/e0s9VRCQtAs7KhjpALAAh6R7r1tbBh4CScHC/Vr9+v1y/bIOMog0hmbzZJ95WHHgEtJxYJ2kHeDQ2O40bSNNESKU4wXrK2PYVWGAblkxw6Wnyb7G6JI4SNzTiE4moC/aMzgzIMRaIXNxrFYc0gTcy68rxwHYnkgelgGYmIeY7r2lFskMU/s3VAAAABgjMIESTgiOIG466U+Ee0pZFdnA69R5XqfKHiw0e6eiyBjH+lke4wps3MUyXra33sMrPQ5W/PIvLXRmgux2GIsBJTDJ6gjB8EEBIOERZ7iqwiQpwTBR6hL7uhQmESRBcG5kzUgaFOJnfodVMTIEuysEuYGDivOiZPGzePMvRUXTIIJAg4ojaSSKurt8I9rS/TjzzOgxQAQ7gpnU+LPU1sMnR6k4C/XeV++8r9t5X7LyjAAl4gJ/lnocrPcVISWPjgXsxU5WGgwVVjBuSz3FVx+ZLC4STIAeo4jwmoH6wfKNWJMAxGosFgCYmIXsJHHJDA4Ceoh2sKFzNOTmOd4mNzrRNgIZjEHId17qi43EDjidyxuKmOWYUeUTw63wf2tLCzEQjgoPceV+g8olEnMH5TwHhQSFBMmVzb72tj2tL/tcrPSVISsYMLl1Htc9RVZBtMKlwj0DjcJ2CQY5JzBwxpYQOo9WQCQiDucHffZC8YZImaSpHI0NwtSHSJ1aloiN+AF7qi04yA0CWIZI601hgU4bQGfUZGw5aiqzwigzGD4N62lnrqISX/U1sCPAHeMHX59fh7RHvz6I6YRBncAr2uVnsqkJC3BzwJ42tbfeVWMT6nieyLzdMLhFCXOeQUOSwZ4RW5gEouA3BiVawpQCck4BegsYclCnIRoWkxDpZB6MQOCiIraXAoeKUACBWXIzh2tcWgYXA1NnuqLfaVWEAjBgYwT2DDxKhswEEPRuRgWMD8F9rSz2lFI0v8Aqa7B6eVehys99UhIWmZnMMCpWQFI1GRs9xVZLLwDcHQgch4vXZqPisESokQPiLRTCZGAUKAgK3DQboK0mVghmYGBB0d0QxCSLkmZs9VRb6iq2Z5g0smaFgCcEiLGJfMPvf8ABWkIIDAZrKe2SBHIGP5bCv8AIww3rKe2Synvksp75LKe2Syntksp75L0+NQLtgNIMp3ScwwXvXZDbEgGAd10MICGebhe9dkQmIFhG3STaKgAfX5hkJzQClmOZHsgzFnvnmsxsvNeZgC43IK4zDHuUiJ1oc2Zxua31mmuHWYIlCF712XvXZFJcgmZuYSEELOK9K7IjEFA4fWicLAOXYBh/wAqL//EACsQAQABAgQFBAMBAQEBAAAAAAERACEQMUFRIDBhcYFAkaGxUMHw0eHxYP/aAAgBAQABPxCj0LxPIeLX1B+OeJqeW8E08E1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1LU1NTU1NTU1NTU1NTU1NTUtTU1NTU4zU1NTU1NTU1NTU1ODU1NTU1NTU1NTU1OE1NTU1NTU1NTU1NTU1NTS1NTU1NS1NTU1NThNTU1NTwHNeQ8man0k1NTyzF5E1NTU4PMmpwmpqfTvJmpxnFw1pywcJqampqeRNTU+hnkT6CampqeVNTU+impqanmTU82cZpxafwLy55jzZ5U/i54VwfXTxHA8Ji4TwPGYzU1NTxzi8qanin001NTxzU1PJnhmp4Z5U+hMHgmp9PNPHPPnhngcJqampqeI4DlvPn0M/iT0U8l508nX0xTzJ/FmMeoj0+vrJp4X00YPqIqKio9GeiOM/LHLjgio5B6x9Mch9POD6UxeKOeeqOCMI9EfnzinknqXg14HhjlvBPA/mD0E+rcJ5LynmP4qeGanhmp9Q86fRHE82Pxc1PDPrH15yH8fPC8ueVPKP/AKF9K0cqfwpjP5NwnmnImpqan8rPNPSnE+gMYqPQTU1NHpI/Fv4J4lDNHeiq9p9CU4Qx1M/MqPgv5ZqLHpp+qpzbv5rlf8kaJoeaBtj/AJLqOe1/qGpufdyfcU2wZr9ZKiVJM2D7hFGc4Og+1NPKP/hJ9eoZoUHkJfRkfE0c/cwPzZ90MF8/qY/dRqcyJ70mhgFoIKeQYeWuijPuSglDad8T9Km99AHwPw1sNB2+UfBpAR5q9h/+LfUTxTRNyo/aPaa97EPhD6KIQz/3QniOFsBzTntNWhM0+iIpyOqifkV/Mz7TSC6d/wCqaNd6X9X+qC+xKlv3sb90j5vpP2VCjz0B5lTt+VLe0K6zwEfHAkbNOfmpqTcHd948JUEBvNadVf2mmsjCHcDcppwngPTx+JcD0rjNBAFSALq7FD39oGDoX+FTFXUID7L2XrQAACACAwKhC/8A6Ya2Q0D2SfpQjbQDD3fqkj0IPYg+KbqBLNc6V3qamp4ppuQwnWjgDkh+4lQQH2x8J+aMDW4+YPkpS35mztn5FZTWBt5MCnZuII/aNnhqG9ay/AfQ81LEn9JLeDUVHAck9BHoj0r6rUzk+H3vMDvQdBLwP2cuwDGULkhH2Mz4K0Bie4hu80CdfCxtFz5WhiYtOca1NTxPJmpwLZ/yZd4s+aLWswsew+SrChgQr0zvcaVEBIjImGQMNW8NQpXGcrpn9jJ1K2ZiaTdZDqSVGJwuJzT8lPLmpqeCxVkSOjHNdCesVBPfQYfs913rWuBo5El57n2RSIpYhN1dvA80gjZX75b8BwzU4nG8BWkNyoiay3jyy8RT7yWud9+2TrQMcksHRMEprqFus11KfzVL95kelu6k1qgIo0RyeCanB9AekK19BNHLfQH0w4Q6AZtRFlYs7xfTy6VAhIgGwGWBEoSHxC/lg60jPFpkDqfh7qZgolGVd114Y4nGKaIqQRAalyrrZ1Ow5YxyJwGnIhS3um3mz1pE6sTle+fnbrQZGlEibjU0a60M7A5HvfZKI3akl7bo9V++dJTxHOPwutHMeS4zgIgkNrvNLtm6FBSiPOB+Iu6rhAtUYG6tKoGbMvd/jTWmE3J1dVxcI454CmKkKe9astqTkagJKZql89ezQQCDCJCOMVHHNThch0rXz5vtbo1MlMKDcTTqHmMBKxdx/wB61Goo5I9P/Y6512xPTvrZ9BHIeCxRZS8Mwc3dyOrarz7IzLVM03cL07Kx6j9j5yqAKeUm0v2PgKmp5ThFRUYOTX9XQUUN6hDZbKdH+qeIsCuNNKGauQLIQMC2nImgUV0h9j9KzQHMDw3pp45ofZmm5CXGjjdiAD0Jl2W3DOiuiJSByR1MC7vQwn66uTrvSYGRQtEwPQThNTU1P4A9M4tAsaXX7fUzdLXog9jAGQBkYTrgfdah9eRrOVXgsDHq8uOGMJNymgn7hCsrGVFGdFRbOxDf+nSgpAgYRzHarpHKmClz5yJ1OZ4daWwREHHstzxUpiyL17ns1HwLzWnVX9ppVWwh3A3KioxcSmAU1zcjm6ZPTOrXNBlqA0emCW3iKx0iz6sz4p3uRttA6rRMB/DaYPLaPUOVIPGCL7D+J9MwAAALAaUVsVCAGauhRyGl6C11PcOkF3SCxgckwWKjVJqIe7UUlbSv4qCmtoD91vx1X91k38GizxhKBGR7UUUYw8BoBppfP2daSp6Fh69vaudQo7IY8kJH2xZRZEPhtyoaivIH0+wikKtCpeGnimpixgvNgfTmaUzgMl39z4E+GirDgYZL+R6nkvSNnRmA0TVaP7kwOUHqnF/AuISOkLmNLbofTMAIMqXNBiBZq1DgImUXs7PJ2G/BPIjF39haOCF2z3ah+qB8jQzQUF6FChgKKMIo77nsdHwxQhQyGyMOE6Vbs5H0qcKFbF8jrBcqPMSsEHSLDtD0adISBCOyaNRwlObyfmCajqNJRPM9h8/yNd2msILdK2d1qeS9M7jkuJomqzHmT65z9LGDxuBUYmxW0P06uuW9G2FACANikc2iQs1dClaTC9gZBoNPJvAcc4GEFLegeDWo2F6FjsZUORRRgKMAUUUUUZ1GBREoGTsH7mgqXWaWJBIXiG6jyLpid4y808JLDIO7A6e99ko3CdJT2tD1X+6SmnAwmyWm4/sckbNLRKINh8q+G2ylEJTL5DXqvhvvLDtjwLMf/gHicRingGho3/gX2kD3wYAyCkQgJVYAph8OqI3N0uRrntTwRUcBV/EM1buNQUZaizsf7iFDiFDiFFFFGeJQhoRI75mA0SUZO94qOP2tEdhD5PNPSUX+O08F4Sx1dg/49cymCGnIP+GzXetLUlOM19sYACajkmpQg4OfPUN1o+MzCNRtdcNO3TctthH/AMNb/YLlrdILtWnjLEL90/BBpRR30TN/J9v9U8qJkzwZu+1B3eQQVmwFFDgGijEFqyztQOTPakwdcpX6pPqMQfNIijZLYkZmh8v74RgIwjImY706A7ZR+TtLuU+Ok+6mzqSdacUnOgmXSINSOm7I6XshFERGESEpwcdRRthGf6nRhqLgYXI5lon/AGiijKOWz5Q0TPbu/OHKhWAV2NatHBCl87u69VtDCAONgZ5D3rnk6UlVVVZVZXgjhWEuQVBw7mnZ/vCBRRRRgDLGSk+Co9R9B8c/ilom6q+T/lQLHP6NFKoK6KgM6Ir9CCkWOOpH4iuokGXzgUEtQuymnSx9U8M0mm5O/olJCbN3nbz/APQ1qDYogNxM+AApiFB9D+L0zIEQhEzE3pp4ACrLxBoH/oSbUSXqMiEiU564MiEI1eLZu5kvgfDr+AOJ5kYx6AbgjGsN57WveNnDL+IbCmT330BdK6a38aA2AgDY5EUZlL2O9QK9+X/lFGAcQwWGzASvYpANdaGOmb3ihzVgXxl/dqKzl4fc1lLOweuQ960QpfttvYrqO4L5pUUUZ1GBS2UN3Y/3xWl2Xenj1qP3yW6yvmM9RpNl3IM7NupZ4CsuweVpbdtHXMZyp4WvmqHW7Dd6pNsEYTLNIyfYffShNlDCTCPZ9YepedZfhsZBuvQJfY1qP8Q6u67qyru0hkAJVYAp0uUBktXvp0jdp4yg431XIN6gNnms1owFFGJlAKmPnY6tRU5svgch4nvUkFF4z3lekRAJUwB1paArSQ328e9Joy5fX6+Zo4QM6MbgzzHVf4fbTg4RxPB/qjUMlajULZhLY/N0ZnzwZ/RB52k3a7N8ljhH2J6EGRHcatRCG2SxNhfvJpgcYIEyy+bN1pHqzkvNnnuFryIRcG3uv2MFvd8lfJfOQ6UeKcDIlZVmXW+40UUUUYEPjCHYFAJ5wCfwHY96Harhv1LmvfCII2sXewffSlJedCe/+qMAUMQozxPEMz9dzoZ+xrTMSJVzXVxeKMIqfiKoSjLTUbAz6++jti1tQEgcxNSgSTuclqvTM3Ozg4lTUsa1W7G+R2TWg7gekQkTxRoml1R91J4w1M259yPM+vn8C1B5uifwNh3obZQEALAVJHlawaHVyO9IbviTIHoEHICoAq2A1opYOc26UUUUNGC73uY/N3y71AACPen9C2BwtYXNbBmvaropZDBdUydD3oYgvgCijLDNWaopcldXYDVatWtRJoH+u+LwvBGAcGtQLJGmUWIbAyg2dTR8Y6FKRI/dD+zWpzCGZbB0SE78Bg0hSNXRv5H2TbC4QNou7n5M9l/BvqYqOC7swSXHL5v5GBl0Ni6avm7tu4YqMIqACvo/dFGJUIeiymwURq3c/sOmXegAAAQBkGFgblmt1PTtnSteUMh2GhRQoYhgKKKKMgk6L/XpR6BJnf4frCeSVuxMqyA3pO5wAfLyWV1a5ZZkjWZb5A9OfZk4P4kjRNQ1RZKhmTOZYMuo5jqYgcuKRfPfObtNDiYTjJL8aS9xSutJFET70tgY1kIR8VNamL13tWeo/mjFwMo2C6p+1u6UV8oCAFgK68g2wWDqsHmujuNC5DoEB25Fl3H+KAABAaVNTRgshbpbeGh8ulTAkFeHofB74KBVALq6UqCm4dNz+Om9CkAlEq7rrgMQxCiiik8DsBddhq0MuO026nfq9uWWkw8o2ANVrcCORNHXq+DVamhsJMXmcx+RpmWyqaynRLrfTM9taG8DIEwJsCESRNmmTAptk371J26uEq9ZOa5pa7KcA2pDGr3Ps+dGD699QcOZE396X5gYEvywm9Dd5PhTxgqASuRUVr3XXCamlUaJRGkNuq0K1kXfb41frTAhVK8ANVpIK2yv8OjXXai+AoxDgBRWYVJVfutD5pppALDsGnLLoAq2A1ow5kHmQzeoz2Lb04hMg3IJ285eaKE5gGKZtTmZn25j/WOb14y8Hyie4ouSXHhl2Q0Na3vHyFCPKNkhI+1FVPTCSz3GHxUOxR1If9wfWTi+rKRcWLVMB7tDeSxNi7yy0IQSjIDNp8GWB6I+wPdaeOfPQ6sDThfG0VLHY3Wh5aLIOAM11Tqurg5ny8A3aeZsGyGX6dGt8qGAooo4AUIRpRAG60jk9Evq/b7U7ZUolXdcJ5DglqUE57B9PO3Dd3ODWBjyvZg4GEYhChkR3mrDYhtaWjsL+5pj4ByrrB/AHDNRFy+W67r2nAsQywLEPuSe/wCBeW+gKv8AQbE2H3D4wXL6hYd7wKMaZcRTACUwFDo5d3dacZKIiyTf6roa1HFHk1TVd8HREXgBmrV35GhDX02POeWIUUYDgEjadkud2n3UJhWbEd93q83RMmlN5f21T52sRsUaJkmnC5Au6GXM6MuoU0lQEKGETRHEpoHiHQbbzX7LQiSIjqYXt5qF1QfaTy8ViBNy0bvuJgOHWgLxYfd7Knap9U46c6OeVa0l/g+V7MLwUQ83wCjxFThbHd4LcBA0Gq2Au0N0FwRq1+jQwUBVALq1u7IZH6uW7fahooxAooUFBREA9TsGtXkraRsdXTx70ufXnxygM7SC3NdzqFDqUQkRyR4YshzYDIjMZAzIcxlq6QMl7UOkRIwdyx6E96f4jGTvEWuXHWHap3p3WM6li+gcA85IegiaNuA3UR+p4XxVAaIJ9UsU9hQP7ozSatUQns0H9/dZAfJD5wPxpzCWwlWDd0qZo8eyvdaBEAEq6FOk26MnA9hTxFQBP2FNRRMVAAJV2KiSQL8wP3u9qMNfIkcuh+/belgLErB1qU3aP9ajYh1iPkVBfPI9imhN7feJQs72j7aLmvanRr8o6ZXelESAwiCdqfPsrOLAkr6BwVpL1rh/0HTtwzQyAWYLvmtafQZc6p+9uy0nRijNFkfNbpqWwI9qHhcSBgtG3/M+eEYqLmeaf908UUAOLPLf9o81HrNfRvHPBLUAHn/EPNN6eRlJ4tAgBkW45OyWXsU4NSE6MFiz7ch17YFRZ1G/RX10Ot9KmfSZDO7F6lyv8wvvFQmxE967UQtP/cSqDNaAD44Ms6mnQC56jP09xUPBzrFsdvtutFT6Bwgpdtxv0cnotW/Jsso2XsycRhogsZCYHsnwoHRR3NKh1X+GZxPnDNeR7g+H34Gpq1tHP6ZnthnAF9x9Pv689O4GJkZULYAfGBKDJk7ihNTxTv0IfvGSkZtt+g+UoAoewD94OyjGwsC1C1JXogF0CxeiILoR8cRVvewz8wLS8HYtfcM+y3fOnK0RgekSzygtgWHY9+QKYSy1tj9vFRDS2rwLsCdxXiigg589R+rTnbFwa2FPz8EEhZ0UKuplhr6wx1p9OVnybwE/26ipvNyOqX4MU8BXUTVijRmgl83uOb42xjgVDGYB7tNhnQX7lvmpkY0WP2tTH9y5BUtZ9V+2lsZwPQgWD71pk/fomoCWyjY9M8RMdSf+Ug09NQTHjKnhKLQZk2CfuhbQbdER+SpFkj/mtLxgDUvzoh+68zfcs/XCzMOd4uVlDu8D+6LeQDcCP3QIIVO6R+vwE+pK0UVeWPgMGkJD2vvB4DEJyzqN9AqKuRxbCT8r8DQAQEG3BmNcODy0oO9ftM/A0+gbRN8j4CnrFeS/nGaWmskll60jspLTyY5twEyan7ZHinhKL9MwHg3ehesxsvyCT1pJEGF12q/gVdJ9g0Z1ZmA06cIZ07aZXyVTUTEAp0t+uR6tYLsTW+EzulfujOmRZZzu3j6gCgqY7KcvvHV65HxRN/dF13Wa479IGeyXady5gC9TIeZralNk7GR4qZxnhcdu/Af9pp5TzHWAIJzaHywuMUCCaBzDNYJtLM1ADsl+AyPAU1FPMQA2MPy4P6xMP74mcZjDYf8AVhaKALCHqTgfQHKMIzSKhbL2sFGywe3ppHMxL5p4hPVH4o+Vs5P+PXrpvQ8MDwBoGB0mhAOq0AEt1g6vn3bdGrl+5od9umVPIjCMTYB/f3g8p5l749yHTLg1O9a6BnWHD7RwTHYK6svg4ACNrxKy2ieDBFJERd/+n1R6/wD9YoGDn5vKBAbBTxDtLJycQ6GrvEUSEBABAGEau07zP2PiagSTNr1o1er8V/5FmDjOJiZ0quavzT6dVYCd0P6ocqEPN+BoiCED3HyPBcuBTrlYOjy9gfrig0vyhw/8C1vVD0xg8ZuZe9Vatdsj3VZqcCpxslqvdv1UUM4zmxt+nI12q/dEAbrUOcl3kJNbAzWoxl0WUmNjbC/FTJNPp/lvqpmz9zLg4gSZh7h/5Rj1RP8AU3oypApBnhn6o4Cof+Bl/uF3V/0fmRJ12r3pRF/BWZwlNMTEjVgCue+14d6aHudN6jbCYea+KePTdWH2O7r7VFd5+4ON0Wf6qMnb1HxGiguZLwkN8AgmBC6DM95pQQoJosNGCk5nzE/dMVAKuwUhEq3eT9uExA/sbYJ9a+qmzJVTm13+fiszxNJgehYiwnuSa0s4dq6EI4Soob5VzV/Q0w2A+Bj9UYRIm9qmDMU9QZhzlVlo+NBTwpBDmTvuVkbH2AkagplbOmhMedQSEkl1I+SUQBtaopxKl2Pul/mDN5L+PQH8PGH/AIK7Vq1NpM2fKswenFFKA7vnBoQNIcDiDmIui27tG2BAGQYWZkifZ+6Mds7XZv6hjf8AKT905tPFAf8ApN+sHB1T2l+qs4Qfe5+nvTxIxbE3yYTf9hj+sNec8ZhHGep66z2M0aqQB5KshNr7sr4r64TBR3IxE9GX44HBHCwGq1BM/wBBtpjMwlA+M/heBxyxn3P+eokKXRWaPlyFx7wfY/RhqRP+TRjaEmkQ+Png4xgmg/JOGPN1gGvqo4n09wbiVeCVF6xmgRZJDQjQjNpD9YTiYOT2e+PxGjhFQ5ST8/p74TgRMko6NZ5rfhrTCEySeYovUehUGFJ2moqKjB26TY1f1nv5BwW6B0APtrSl1MDtP+ioRgh/w2Hzxo0RBu4f6sL/AMnZ7vThy305mUM5PRp+sDBliAIdLeIxKcA0ZoZJNb4OOvJw5mpE7Gr7UXEAHSpqanBAHxh/pHtWmMkiPGbmEc9KQ4dV1dgzXQGlYkx1twsbGgFSqt/8SMfFTa+gn4H4aZiaBSO6PhV7FRNV2hvUHRfDW/7LHjkOTKI7SP7KavMXdcxHYh8UAAGRYxcTOpYEU/N+xgQbMA9CfmJwJp03oj5wIMZq6kv6cRRU+1CHxh0CSnPgh99EzfL9cJUSFp4mXvl54GLAbto04RUI6NRi8trITQd3vDtYXYg34TBickTIi5M8RIFpCws4Lvep99kAPZEfNBxZIh6QKroUq6GdhGx7AYWwFs3wb2Zwzg4qAy8HVsVlLO8B+qVaGNsBNZgZvJ+3E+m14Wn1BMMo9WXwcPgACByAsNpcow64FRUUcUm7jWT9B4xcRoREfJ5nvPBNW1cNP+4PNek0giuYD7nk6HHFRwdsFLJ+0PFTQMgHYxePIk/8v4wQswXfD+aQFjItwGL6p9T7fhNo+GCz0++f7OMVIVssvOM7c1PhowmQu/PI+/jFxKKip/OPJ88BU4JqmR/lpSioRISnCKjgioqKSzcmR0Cm4ABZWjo+E6t8DNHa+98n61ikqyfBIO5kadUQM0ZfNvlQwvOsw/rrWRALOemR8LRkOnCil2ilGwuhMVF2aWdKhyCrcwOCeEp72MPWgoFW2ChOZS+XCOB9S+pdWFPqCfJTJz2kA/uiRgnuEP3R9wD9W/Tj0rd+Ie+E2c1nETXCXsT+8JwnAorURUncufVZk71GJViUCDMP9KleheTyaUYRhGAVGXWxTdBdsX3vLB3pZZce9Gg6EGBDRyrg6OvRfeKQoC5bxEPvWcHBuQgmzRIP1Z/o8RST72Ze8v4JoggaWHR1Ho8DK4s1m3zBrMNysrpZnR5CiEkuU8mxfOd/8pecAno42aXw4phNPoyteAxj1BRWcm930h4orJEcZaf3Dxio25XHfGGF0n/aSkQaknsYuJRUHTSn2o29qiowRTWILq6UOo23GlmV9VQZekEPuU5fvE1kY86BqFhA+AodIbxw8LPxWvG7fgA9mijPW9pbeAUZQUqQB1ak8tpgH2HiXpRGFusiNvjCDpUBYANjjKCtdWno7nRpXRbPnUs+/srJQooenR6cENHzmh2PeLOprUN5hQn+dcnhMV6Co1QD5aj8j0awhfLLRlBKnQM6me8OnA8A4in8oVaais9Y917KKubSDtewz8PIRxYyUeQhOEJ2E6UQgjI0AvOQfT+sXh7Kju2PuiIGCKioqCQgjmU6dVwuPZNqhG5hH3B+KgWslQeTPxT6Wf4sKFKdV/k1HAdHPYqRKdk/gqXEDIEe6vxQr1mvngezTJWMyAdjHwxeKMJqan5DbuOz2+2yVabNcXrZPVfZeBORDnXrbOGlt+Exu0P+Oe6cFukrl8hfElABBlUVHBP5aeSEBqDc8knmuoi5Ak+6jzCegij1jukonzn54iioElm/dgVGz21fqpanS9Wf+0gEFEiZJg1FRiU/dTpGh+6SoqKioqKNkCEbiU4mR5ez/tBQprhlUtThPFHIzzypgpxKgffSbmk5Vca8IH9pTq3l6+UHVYPNTl5bQXQ6BAdDFwMUtClc/wBzgL7sbNq3tD8KMHkRz89NuW7eX3gJB8kCwP8Ah7qOIaYEhGShF8mzis1ZrsoARp3vi9PqpEERG4mvCVlqXl1en3TaKpV1aikqGoavV6hoSIEIkjU4WfmPbuYOM8UciMIwkumo7+hnXWaPSXKQCyOmekvThMSDY7Hd8AWjtnBoEB7FBFfDQJay+YOpseCDxyWj1ZyDgjmxDVC2FfFA7LCEVwHVe7J6LT1UcwQwj2eMasK0np1qcEBFE1q0gGm/aoY3ezxtRBuiCPxf4oCY+4fqibxsv2xQiVNb/ifNMWVKkrWeLnzUVFRhFRUYDFJpTd/jDSAg0Hyb4RUehMTLlYHtvWshYWkpVleMpMibKaTZ8h4NFWQbYclGPYOw/hTgeU8tq8yKOiZnWo6k4DzPhHlhkUmUFjy/D/hyYh7M25Q1NJERRMkooOGh0eCKiizahPUpKio4Y6UFbdYnM7OlTWu8gdtGmg3mENRTzQlAFXIM2oYPdWw7Z0JiC6q9nyzTK0s1c2nHgNqeIqbwexbcugSvaosCnuGr1WXzQ5DKGADNpnzJhdLHuvgPo45D6E9A4EVuZFi+yXyNsI2gkd07aPRazSSQEwj2TiMEQjCa0V3LmfujFgS6DqUaUR1KOAUZGGiN7bKjrUVFRUVFRUY7Omhc7OZUwt/oc/up1WerD2z+KmA2hDgYRw9PLN9KjpKah8M6vAi6MPdv9VFT62ZHdXfFSqcZGw8UgFWxVhsyOvXkpEhIjKdrukOg74ZaAxNzz+fs7U+meIp4orXlHG8lwOijuMJUKsMdUFvFfvO2FntARbL7Is9Q34jEi8JWoTU2oxmyj91DwdbJxMCRkzolyXfeoqKioqKioqKiooKLVFjdi+1MKhO5RD4OV+qWsQ6h/dR0/nzUq54/7oTYugP9p+f5DSKjWTvI+aUAHsAFSnlkDz/lSx4RPO+DV0nW7/8AKanjmEOPp/JodUrL+OUBAVkXlIAlauqA3/URd6rwmMVHLn07wHG8h4Fs29PJt3q/aTWjKCEJEcko3rTdR266jvU0clhAuT9OyPJFrf7rV5qbcNsU7mVWJ9zL3q65cqMIpLbqMZU4kVHGBFHAE6FQs9GW/tU8t9o9qdtngPHBfr1u/wDzB4igVAKtgCVelWgAbj9RMvVdsCzSAss3mzdA3weA4X1jU1NTU8JxPDHGUVGyJLXHPv0f4wG0wrlDVesW2Q60iIEBCjMTfjnA28P3UyLDPZxMXejStGX+Mq12bNmoqKkpGGoLGepROZUVFRUFRwhFBRKs8TaZfYoVF97H+1Og7Qj5zpEUq5rnTigKoDNaWcxq68qFmxDWL+v+MA6C3sL/APo7A03lp9Vn40OmDyX0Z6OeF5z2xBaH60TaoDdZynmdtR2cM8kkXQAbOXVDvTbkFOSIMkqMj3dHCeL2YJtXyBkNfQZmtc9xSkzfCjZh73rPlXWomWdl6ls+1T2asztXy8Ar6Yy+qyHv390f3Yj6msjH0k/NTMHtYexRbhKlpB8tbScsU8dvtxbmR7B5dKDMnIAyKGA6hABmrSmQZ+RRvo2I3eBwOJ9GemnntNG47LgugnUe4pRU4oyMSJSpSDyBIRNShT5auot9tTqNPInCEk3dSpwibmBxRwCmSnZoDIeyr/2dK5p50q5q92oNjlz8PxlP5Di8afNkAapoC60PJpWGC66aBoUUJAkSeoF3c+i2tThPAcT6M4Dgn1zgeda2yOd0b2ejahsTuz6I6I3HRq98kC36Rqeck5dvB+6s/daUM0YvJnGampqampqcBNbYzqf7GZtPKMZ8OVZBS6MWcDnLs1dW+wVJ9Oa5kJdNDV6DSXRPyoyq6q8B+EeGeXHoEEhJHSroBSFyMzaZOp1L1nn4Pbton/G1XZgAjbtk1NHpC8mcGL+5lVt87KhEkZN+OanmZBTsXasRjvrSllVeJ4T3eJksgNWoI+FLja2+/gWzqAmYWEH4Ga6d0KX1oiDYDQCwU8bicMegOCeF4TlRg86MFKMIQouI6JV46osFqdOprmaxUil0LSto/CWaf3NQwLbYa6OpDUVHFNTjNLyvZRLG9bKygjtZRc4I5RU94atQX7FSh2FnMiinIKlWQFD9DJLsz3d3gWzpesZjl7B9uQXaMu3S6XpddW+DxuJxxzT1kVHPMliJFcR0a2GOEvY3+RsUPJcmytE0G9ZBDe0f+Q6bCU8g4Jq/dsa+6JTM47NLze4VknmtQ+T0g6nvSmqe9Jf6Unn7tB3dhaDmfitNO7NZqg2spZZc+A4XhUi0B01VyA1W1GLTIbBzmyN3N+KKhu7k0Ib9cjNofACpO3bu7q+Anh1wmp9Qcp5Ry45w9aR4MkTJrVX7jo3Q6MnTbBUTCgHRKEL5NI9evXzNZzqRJGTpjPFNTU1PBOMG2Fqmp43F43w0EZi6uuwX7F6susiEnV0NhY+aasfRH2n0NVl1bVmbKx7F0N3N15pxTjPBHIPSHFNTU1PoGtfm1PKLN/dn6ffvRlBCiRNxwTneVkjqHuFnU1pD32UPc0TqWp501PHPInjiq2Mm/wCrt3QM6ORcRwder1buF4rw2SyQydM3Tcz+hqwNA0GhjOE859Acs5EUVOE1PpyjalXflp06rbRVtm85nsZro4WQGcw99Ltk6lQluDZPR06LbxRckub1GE1PPnE4XjkP0C+TkHbPYpnLYvrra9V9owQigAlXSs0CRZ3w6vYaTSEsOks1XNqfRTxnDFRwHJeSYPqXgFoECXHbW+zRqRCyMw/J3X74NJGlFv7p69SHvU4IR7KaXow9KSnGfQHC8KUmh3xCml88ufbsdrupQfAiGHXq9c8Fd9TOfZXVIBfZtHoadFt5wPRPpjhcX8HGP6ZKEtQDZHu5ejfrQc1yqG2S674C7CEA2Rs1dzryFHbPxt0pPdMfDHLsw0XwjgnmnHlcyd5oyOrRYs2E/T6SalxBbT1lu+XA8DKEAbrUdqlZ58l2g6tWifqZGwZDoQYnMOOOM5xyH8LGOV4OIxs6J0ZKiVyi/fMd5HQrIn+Pwa4GUFCEidSpxriIG9czxFG91xoDqk+y02GIVLw34TlRUUcDBnal9JRtby3fA1qai6XRzPEUGMaWXVc16uJeSCIi9vsu9KvJq6f2n3t0Kn0BzTGamp5R+AaPQFSArNa+J5FWOjpfP+jxQ3WtnejMHuY9JVuPacqSYeR94vslQZTIJPFlBQlrflD5oFgRTSeTGEVFNiWx1ouk2/QCkEPp18nuCmW3UXalL9UiGn/oBPGIwGlEAdWp+5RGm9j5Vpiadc2X2MdKiCAA2PXmD+eccy0bH5KRGNptDtQ+TzSGkF3Ohn3RQoykROycBDOuaXuiaVVl0ntIpK6S+UDRtsac+KOhjux9FZH3i+0q5gEy7EOstFjx/wDoaGHoiT6VYJH87/oqIQGYKeAPzSAvP/YToUKZCB4Mc6PBhrP3mhji5Fo7iS+U7UylyQvjG3vLU29Ic0/+AeIYRs3g98j5Khv/AGwFnxQyIzWJ5u+KjC3L5yhoRJLm5g8Zg4rh/X7lo4ENSfdHyojZuZ+I+WlDaBsjaIL5WtV1brvU1NTgeiPQRwRUVFRxPPOW+meRNAyB7lGlJsHtMVAlpp86A/NQoCZoZ+UpQBnVF+EUSSPQNF/un0tGX7z9ZSJm1JDwC+4ou99PsUCZjSL+Joy+7/AgVKwHde7aZ1QfEolOENmsvdvUrxHPOE5M8B6s4Z4TijCPSOJxnBPBPFNThFR+DOc8mOfNT+EOCanlHG4nKOZFRwnNaebH5J5hxzhFR+Fn0jzpqcJ/FnC8B6h5BwT6d4o9HFRUVFRwxUVFRUVFRUVHNioqKio44qKioqOCKj1R6h4zgec0VhiswlvRq+x/ykdfx/yj/jf8o/4P/KYLJ0B/lBZgBg+S/FM2KAQj1NKcFJpEAyA3e5R/yP8Alf136o1P5ulfw36r+O/VP8t9UK/xe1B6ChSCIw63KPEQGYhN3vV+re7tJGphoZvThFFWAGCDd7lH/L/5RkzwCBLbWxjYJWsmgUTdSCfE07Cc5I+ArNVsYKPwTKSfcSnDIumD3ZR5it+lngsErBWUzoBOzCfE0Wp/MSPYCjz2yE95aVQJp8MT7ra54o7HJ8NJTS0DYiawKQX7tf236pp4fQUKQRGHW5U4aS5UV2bAuhlcHSnR/u6VA7gUH+uQa0ZcifwTyl9FC8KEcID4oz7MlSCCIAWcezpk5mocgUZlOkLsDIIiCNoalo8UFk0+rZttjNLgecHU0TKmADdafbAFx7DIN3jdingGm3bZNsJULjnWl88M5EhbXLofeRNFpxLPXq27mXrg4g7eBW8NTFAGWPm+3h0pBjoEKLImjTVwUDm0ZnehB4BpUgMYIz5g/A1zbRNaTuMh+3QNWk+d7n/u/jI1WeN/BT6l4IyRghTWCasiXCf6KS/q+KCm5B+zFCUHII+6tOpJgfh1bvQbIwnah2iFslUSdHPzi6Qc3lhCMT4pA/h9qS/v+K/p/wBVs/z9KZ/l0DAYkbLIYnzRxO97YMiZlJXPqvI3ubl+JUQ0o6wBS0bPgKFODu/ACowSwN7xeDuz0ps385eiyWWs34P3WQZopnpNvBayXgMdVk8T5GDtTuodXYCVdij9RXkbnoGQaHnAQ8SeDqtPyLmH4CfBVoFvH2QHzS2NiSLYkp6TOMIOAeVnHY9zsU4AHNozKMUA0y2MHZtD+J9M4tamljagGrQNZZLYO+xp3ywmpqampqfVH4J4G7f4rqfsvqnADqnD3DoklNPI+0kn3gZsDMbslDhU4b+ZU5U0YzV3B6TmMjk8usf8rTjhXGXSfhEqOA9QMiiLLzMWf3hALNcrNLGsKvE6VMk6YFJJe9CCAFiQQSt8gMAZ6pm0sPye5gFddOgaBquQbtO0JG2NH5LpkVLU1cQ3NqdTZME2RZvInJjTKgIAUQjk0Mq+DQvgdn2MJDm0Z0KYzdwLzml8T6ZgAAAGQUqZrUCzVpGk/Wyj+Q075TPoDiio5ZyXnRwxUVHA8FYn+a6vgFRUU8MgQynN7BK9qclRi6gR+sHGGVjRhhiFDqWqRISnmlP6/mlf4/mv5n906X8vWkaPcCCf5FTT/t1wg9QNBIYnrFaDqHug0RwerNvPM6sk7OZTfy5ov2ajqPBOYGXih7gjLmMdxg+WDel93bdHdzPatCEFfIHxRQT0o9j9KtqtS7gblNNC5AerI/vCLcJapEHaU+FPAE6p1KgObvFU8svNNZejcxB9HuwQObRmVIADtEhXel/hmSICACANqFdanADNWnMoMlodfRo8ukUcqKio4oqPUvqHg0geSwpiRJqIAtbupqeJVEdJmvdVIScBsbGg7YCoQ6Q0Orkd6IeOqA28CDxSwKcDH+xvUxntU0+9R2eQuOwbPkttRXtpyJk4QTFrLR3l13eNaFiACFRomjjQm1FP8zAriO9FroCEdT/xdTKhXfIwNxMSrNSRH4Lcpt03MzMiGZ0eY1Hsv1XgbjACjKHcSfqmnEom/hfs/wC5wh7LS4phzanAoXtocgcxNSiySOZrLfK1O1FHJPRvoHkRUVHKeB5PbyOrH4wuuxUxZtW2UNiNNGbeImr66isqPJmQSTa1EdBcecHqGSZhbCZldlRwHgMjtQWvJZZNfu2b70IBQjcTXAkXmsOoOtw72d6M6ukoNDtS4T7kzJF3zPJUOXzZP4aJrrOI/aPhRQATBd8ueTBHTyJEIR8UzKqhOqJfcUgkvuh4H4s6NIpPQAo8BdsK6Bm0HsQLZYPCx4w+kDi2AFOb3wyzrOXIyUyrX7XjLAHkQarRNEbjQMoW5Eqw66Jo+KOA5bieqfSPA8ERLDN2UiShw5xg6aEHPQ/epiL/APTRPzWapFW8t6XgFOP4b6mnkTUBZ2MF3PB8n28bYmCDTxUA5GMCu7oGa7FJ5JvEhvlD53iigwlISc6WJ7jlHWkmmAXY7VrWtQP+u0UIMcC5qAOzHkwNis/VfvrR9BgbE0/8VzNiopsStqYWZGh5NZHMnNjTOmAVQN2plQH0bM+WXzgIc3BefskFbYDJdcssyXfXhLJKB2MPpo+I2uaYXHGiyx/KyT9hSrVt0dx1EuOo8Ry49W+kcXhL/lbq+KfXJ9K8flKAkg96ajcG4DUqtulsjNmWhDviuJOo+EYEiIolxGEqxq9skPo/1vFRV1IaHamtSMpmy12I8msv1at4aRA7x9gR4Stquy/mFoIa4WfaD7pt5SntyTLsrbBvoHoAJV8UkOiEOYA+EVDMZdHRHcSR70dIIQ5G66bOpgZcIQDZGzV/4kZ3tIeIqW7mB7w1niHKTcGx6hiQaTHPLy2vYZ2qILWKNMObRmVelQVLCvFhGb330QaiUK6yGZaJRQwWTEtqK669VtaCgIKIkImYm+EVGBxTxxy3gj1c1NTiYxRw2ofb7FfBfXPJWF0qiU2w+YqPhFRUUETubh/ZalCLcBeD4ja5piAMjtUbtS6UyuYKsqSdqysjEPxlwlSyRQ96uxuMstI+HN1jLFLgEq+2NT60phjIYje29mHhFm8il5amEZIZB1terwOdNbUuqN1VzaijNcObRngYKmpg3gd9gWzXc7FA6+zKCRHbCbclhydh/Nd6OCOKPUHG8k5DyYrICgFBCQiYDkkbKGRIcqAABkW4opsZE3ckUgJocc44AFAiHSUBHGAGUAsAZBQkF07lEkImhTXaPKhOQhJJFmoqMUBsiAJmI2TLPbDNAZSBIIkhazUYEwvVfFnQ4D6GvkVmEb/bzTEbzI9oU7Ov/WN+q2du7wGR4CpqanDSG51oTJYgXS6HiKGCPzln2RSkblVPaKekHdDy0+KgoOSw7DI8FN8bE+kGRIw9TFtGOwAgEpKwZXcSpuwW9W6CFDpTRYwBQphNml80liJdDQ6YPqnnRyT1s0c6cHE5k1OJwuJg4TU/jYxio9LPIeOeRNTg+iOJwj8U4nqIqPQRUcDicqORHGfj9uGMI9dGJ66Kjhio/JH4iP8A4WfRn/xGv4R9If8A1jwHNMHgmpqfx8+ingcJqfwZz38o+kOCMT8eeoin1k+jeN5s+oPwZU+hnkzyJ5ryzln/AMU4noTjcDjOKOS4n/y0ck5TwnoY/wDjTlvIOZH/ANbHIOQ4H5qOF4D85H/wD+JjB4XkH/wscMemMI581PHHDFR+Ej8Q8EehOB9PFR+BKfwRwmMcEVHoz0s/jHhfz7z3jPSTU+lnimp9BNTyCiv//gADAP/Z";

    function dibujarEncabezado(){
      doc.setFillColor(...azul);
      doc.rect(0,0,W,38,'F');
      try{ doc.addImage(LOGO_B64,'JPEG',8,4,28,28); }catch(e){}
      doc.setTextColor(...blanco);
      doc.setFont('helvetica','bold');
      doc.setFontSize(22);
      doc.text('PENSOK',44,16);
      doc.setFont('helvetica','normal');
      doc.setFontSize(9);
      doc.text('Piletas · Jardín · Limpieza · Fumigación',44,22);
      doc.setFontSize(8.5);
      doc.text(`Local: ${localActivo.nombre}`,44,29);
      doc.setFillColor(...azulClaro);
      doc.roundedRect(W-64,7,54,24,3,3,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...blanco);
      doc.text('CONTROL DE STOCK',W-37,15,{align:'center'});
      doc.setFont('helvetica','normal');
      doc.setFontSize(8);
      const catTxt = categoria.length>22?categoria.slice(0,20)+'…':categoria;
      doc.text(catTxt.toUpperCase(),W-37,21.5,{align:'center'});
      doc.setFontSize(7);
      doc.text(new Date().toLocaleDateString('es-AR'),W-37,27,{align:'center'});
      doc.setDrawColor(...azulClaro);
      doc.setLineWidth(0.3);
      doc.line(0,38,W,38);
    }

    function dibujarPie(pNum,total){
      doc.setFillColor(...azul);
      doc.rect(0,H-12,W,12,'F');
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...blanco);
      doc.text('PENSOK — Planilla de control de stock — '+categoria,14,H-5);
      doc.text('Página '+pNum+' / '+total,W-14,H-5,{align:'right'});
    }

    dibujarEncabezado();
    let y=44;

    // Datos a completar a mano antes de recorrer el local
    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...negro);
    doc.text('Contado por:',14,y);
    doc.setDrawColor(...gris);
    doc.setLineWidth(0.2);
    doc.line(38,y+0.7,112,y+0.7);
    doc.text('Fecha:',122,y);
    doc.line(135,y+0.7,182,y+0.7);
    y+=9;
    doc.text('Firma:',14,y);
    doc.line(30,y+0.7,112,y+0.7);
    y+=8;

    const COL_COD=14, COL_PROD=38, COL_SIST=132, COL_CONT=155, COL_OBS=178;
    function dibujarHeaderColumnas(){
      doc.setFillColor(...azulClaro);
      doc.rect(10,y,W-20,7,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...blanco);
      doc.text('CÓDIGO',COL_COD+1,y+5);
      doc.text('PRODUCTO',COL_PROD,y+5);
      doc.text('SISTEMA',COL_SIST,y+5);
      doc.text('CONTADO',COL_CONT,y+5);
      doc.text('OBS.',COL_OBS,y+5);
      y+=8;
    }
    dibujarHeaderColumnas();

    const ROW_H=8;
    let filaPar=false;
    for(const p of lista){
      if(y>H-20){
        dibujarPie(doc.internal.getNumberOfPages(),'??');
        doc.addPage();
        dibujarEncabezado();
        y=44;
        dibujarHeaderColumnas();
        filaPar=false;
      }
      if(filaPar){ doc.setFillColor(...grisClar); doc.rect(10,y,W-20,ROW_H,'F'); }
      filaPar=!filaPar;
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...negro);
      doc.text(p.codigo||'',COL_COD+1,y+5.5);
      const nombre=(p.nombre||'').length>42?p.nombre.slice(0,40)+'…':(p.nombre||'');
      doc.text(nombre,COL_PROD,y+5.5);
      doc.setTextColor(...gris);
      doc.text(String(p.stock??0),COL_SIST,y+5.5);
      doc.setDrawColor(...gris);
      doc.setLineWidth(0.2);
      doc.line(COL_CONT-1,y+ROW_H-1.5,COL_CONT+15,y+ROW_H-1.5);
      doc.line(COL_OBS-1,y+ROW_H-1.5,W-12,y+ROW_H-1.5);
      y+=ROW_H;
    }

    const totalPaginas = doc.internal.getNumberOfPages();
    for(let i=1;i<=totalPaginas;i++){
      doc.setPage(i);
      dibujarPie(i,totalPaginas);
    }

    doc.save(`planilla-stock-${categoria}-${new Date().toISOString().split('T')[0]}.pdf`);
    setGenerandoPlanilla(false);
  }

  const historial = [...conteosStock].sort((a,b)=>new Date(b.creado_en||b.fecha)-new Date(a.creado_en||a.fecha));

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8}}>
        <Btn variant={vista==="historial"?"primary":"secondary"} onClick={()=>setVista("historial")}>Historial</Btn>
        <Btn variant={vista==="nuevo"?"primary":"secondary"}     onClick={()=>setVista("nuevo")}>+ Nuevo conteo</Btn>
        <Btn variant={vista==="diferencias"?"primary":"secondary"} onClick={()=>setVista("diferencias")}>📊 Diferencias por producto</Btn>
      </div>

      {vista==="nuevo"&&(
        <Card>
          <ST>Categoría a contar</ST>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:categoriaSel?16:0}}>
            {CATEGORIAS.map(c=>(
              <Btn key={c} small variant={categoriaSel===c?"primary":"secondary"} onClick={()=>iniciarCategoria(c)}>{c}</Btn>
            ))}
          </div>

          {categoriaSel&&(
            <>
              <Div/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:14,flexWrap:"wrap",gap:12}}>
                <div style={{fontSize:13,color:G.textoSec}}>Contando <strong style={{color:G.texto}}>{categoriaSel}</strong> — {productosCategoria.length} productos activos</div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  {faltantes>0&&<Badge color="amarillo">{faltantes} sin contar</Badge>}
                  <Btn small variant="secondary" disabled={generandoPlanilla||productosCategoria.length===0} onClick={()=>imprimirPlanillaConteo(categoriaSel,productosCategoria)}>{generandoPlanilla?"Generando...":"🖨 Imprimir planilla"}</Btn>
                  <Fi label="Responsable del control" value={respSel} onChange={setRespSel} options={[{value:"",label:"Elegir..."},...(vendedores||[]).map(v=>({value:v.nombre,label:v.nombre}))]} style={{width:190}}/>
                </div>
              </div>
              {productosCategoria.length===0?(
                <div style={{textAlign:"center",padding:"32px 0",color:G.textoSec}}>No hay productos activos en esta categoría</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:460,overflowY:"auto"}}>
                  {productosCategoria.map(p=>(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",background:G.sup2,borderRadius:8}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.nombre}</div>
                        <div style={{fontSize:11,color:G.textoSec}}>Código {p.codigo} · Stock sistema: {fmtNum(p.stock)}</div>
                      </div>
                      <input type="number" value={valores[p.id]??""} onChange={e=>setValores(v=>({...v,[p.id]:e.target.value}))}
                        placeholder="0" style={{width:90,background:G.sup,border:`1px solid ${G.borde}`,borderRadius:8,padding:"7px 10px",color:G.texto,fontSize:13,outline:"none",textAlign:"right"}}/>
                    </div>
                  ))}
                </div>
              )}
              <Btn full disabled={!puedeGuardar||guardando} onClick={guardarConteo} style={{marginTop:16,padding:"11px 0",fontSize:14}}>
                {guardando?<span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><Spinner/>Guardando...</span>:`Guardar conteo de ${categoriaSel||"..."}`}
              </Btn>
            </>
          )}
        </Card>
      )}

      {vista==="historial"&&(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {historial.map(c=>{
            const items = c.conteos_stock_items||[];
            const diferencias = items.filter(it=>it.stock_contado!==it.stock_sistema).length;
            return(
              <Card key={c.id} style={{padding:"12px 18px",cursor:"pointer"}} onClick={()=>{setVerConteo(c);setEditandoConteo(false);}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:14}}>{c.categoria}</div>
                    <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{c.fecha} · {c.responsable} · {items.length} productos{diferencias>0?` · ${diferencias} con diferencia`:""}</div>
                  </div>
                  {c.aplicado
                    ?<Badge color="verde">Aplicado{c.aplicado_por?" · "+c.aplicado_por:""}</Badge>
                    :<Badge color="amarillo">Pendiente de aplicar</Badge>}
                </div>
              </Card>
            );
          })}
          {historial.length===0&&<div style={{textAlign:"center",padding:"48px 0",color:G.textoSec}}>Sin conteos registrados todavía</div>}
        </div>
      )}

      {vista==="diferencias"&&(
        <Card>
          <ST>Productos con más diferencia entre lo contado y el sistema</ST>
          <div style={{fontSize:12,color:G.textoSec,marginBottom:14}}>Suma histórica de todos los conteos (se hayan aplicado o no). Ordenado por diferencia acumulada en valor absoluto — un producto que oscila (a veces de más, a veces de menos) también merece foco, aunque el total con signo dé cerca de cero.</div>
          {rankingDiferencias.length===0?(
            <div style={{textAlign:"center",padding:"32px 0",color:G.textoSec}}>Todavía no hay conteos con diferencias registradas</div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:1,maxHeight:520,overflowY:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 110px 100px 100px 100px",gap:8,padding:"6px 8px",fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>
                <span>Producto</span><span style={{textAlign:"right"}}>Con diferencia</span><span style={{textAlign:"right"}}>Dif. total</span><span style={{textAlign:"right"}}>Dif. abs.</span><span style={{textAlign:"right"}}>Última vez</span>
              </div>
              {rankingDiferencias.map(r=>(
                <div key={r.producto_id} style={{display:"grid",gridTemplateColumns:"1fr 110px 100px 100px 100px",gap:8,padding:"8px",background:G.sup2,borderRadius:8,fontSize:13,alignItems:"center"}}>
                  <div style={{minWidth:0}}>
                    <div style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nombre}</div>
                    <div style={{fontSize:11,color:G.textoSec}}>{r.categoria}</div>
                  </div>
                  <span style={{textAlign:"right",color:G.textoSec}}>{r.vecesConDiferencia}/{r.vecesContado}</span>
                  <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:r.diferenciaTotal<0?G.rojo:r.diferenciaTotal>0?G.azul:G.textoSec}}>{r.diferenciaTotal>0?"+":""}{fmtNum(r.diferenciaTotal)}</span>
                  <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:G.amarillo,fontWeight:600}}>{fmtNum(r.diferenciaAbsTotal)}</span>
                  <span style={{textAlign:"right",color:G.textoSec,fontSize:12}}>{r.ultimaFecha}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal detalle / aplicar ajuste */}
      {verConteo&&(()=>{
        const items = verConteo.conteos_stock_items||[];
        const hayCambios = !verConteo.aplicado&&items.some(it=>{
          const prodAhora=productos.find(p=>p.id===it.producto_id);
          return prodAhora&&prodAhora.stock!==it.stock_sistema;
        });
        return(
          <Modal title={`Conteo de ${verConteo.categoria} — ${verConteo.fecha}`} onClose={()=>{setVerConteo(null);setEditandoConteo(false);}} maxWidth={660}
            footer={editandoConteo?(<>
              <Btn variant="secondary" onClick={()=>setEditandoConteo(false)}>Cancelar edición</Btn>
              <Btn variant="primary" disabled={guardandoEdicion} onClick={guardarEdicionConteo}>
                {guardandoEdicion?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Guardando...</span>:"Guardar corrección"}
              </Btn>
            </>):(<>
              <Btn variant="secondary" onClick={()=>{setVerConteo(null);setEditandoConteo(false);}}>Cerrar</Btn>
              {esAdmin&&!verConteo.aplicado&&(
                <Btn variant="secondary" onClick={abrirEdicionConteo}>✏️ Editar conteo</Btn>
              )}
              {esAdmin&&!verConteo.aplicado&&(
                <Btn variant="primary" disabled={aplicando} onClick={confirmarAplicar}>
                  {aplicando?<span style={{display:"flex",alignItems:"center",gap:6}}><Spinner/>Aplicando...</span>:"Aplicar ajuste al sistema"}
                </Btn>
              )}
            </>)}>
            <div style={{fontSize:12,color:G.textoSec,marginBottom:10}}>Registrado por <strong style={{color:G.texto}}>{verConteo.responsable}</strong>{verConteo.aplicado?<> · Aplicado por <strong style={{color:G.texto}}>{verConteo.aplicado_por}</strong></>:""}</div>
            {editandoConteo&&(
              <div style={{marginBottom:10,padding:"8px 12px",background:"#FFB80011",border:"1px solid #FFB80033",borderRadius:8,fontSize:12,color:G.amarillo}}>
                Corrigiendo los números contados (por ejemplo, si un vendedor se confundió de producto). Esto no toca el stock del sistema — para eso sigue haciendo falta "Aplicar ajuste".
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",gap:1,maxHeight:400,overflowY:"auto"}}>
              <div style={{display:"grid",gridTemplateColumns:editandoConteo?"1fr 90px 90px":"1fr 90px 90px 90px",gap:8,padding:"6px 8px",fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>
                <span>Producto</span><span style={{textAlign:"right"}}>Contado</span><span style={{textAlign:"right"}}>Sistema (al contar)</span>{!editandoConteo&&<span style={{textAlign:"right"}}>Sistema (ahora)</span>}
              </div>
              {items.map(it=>{
                const prodAhora = productos.find(p=>p.id===it.producto_id);
                const stockAhora = prodAhora?prodAhora.stock:it.stock_sistema;
                const cambioDesdeConteo = stockAhora!==it.stock_sistema;
                return(
                  <div key={it.id} style={{display:"grid",gridTemplateColumns:editandoConteo?"1fr 90px 90px":"1fr 90px 90px 90px",gap:8,padding:"7px 8px",fontSize:12,background:G.sup2,borderRadius:6,alignItems:"center"}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.nombre}</span>
                    {editandoConteo?(
                      <input type="number" value={valoresEdicion[it.id]??""} onChange={e=>setValoresEdicion(v=>({...v,[it.id]:e.target.value}))}
                        style={{width:"100%",background:G.sup,border:`1px solid ${G.borde}`,borderRadius:6,padding:"5px 8px",color:G.texto,fontSize:12,outline:"none",textAlign:"right"}}/>
                    ):(
                      <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:it.stock_contado!==it.stock_sistema?G.amarillo:G.texto}}>{fmtNum(it.stock_contado)}</span>
                    )}
                    <span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:G.textoSec}}>{fmtNum(it.stock_sistema)}</span>
                    {!editandoConteo&&<span style={{textAlign:"right",fontFamily:"'DM Mono',monospace",color:cambioDesdeConteo?G.rojo:G.textoSec}}>{fmtNum(stockAhora)}{cambioDesdeConteo?" ⚠":""}</span>}
                  </div>
                );
              })}
            </div>
            {!editandoConteo&&hayCambios&&(
              <div style={{marginTop:12,padding:"10px 12px",background:"#FF4D6A15",border:"1px solid #FF4D6A33",borderRadius:8,fontSize:12,color:G.rojo}}>
                ⚠ El stock de sistema de algún producto cambió desde que se hizo este conteo (probablemente por ventas nuevas). Si aplicás el ajuste, igual se pisa con el número contado — revisá la columna "Sistema (ahora)" antes de confirmar.
              </div>
            )}
          </Modal>
        );
      })()}
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
      {subTab==="precios"&&localKey==="pilar"&&<ModuloActualizarPrecios proveedores={proveedores} productos={productos} tipoCambio={tipoCambio} onActualizarTC={onActualizarTC} onActualizarPct={onActualizarPct} onActualizarCSV={onActualizarCSV}/>}
      {subTab==="precios"&&localKey!=="pilar"&&<Card style={{padding:24,textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,marginBottom:8}}>Actualización de precios</div><div style={{fontSize:13,color:G.textoSec}}>Los costos y precios solo se pueden modificar desde el sistema de <strong>Pilar</strong>. Los cambios se replican automáticamente a Caamaño.</div></Card>}


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
  async function generarListaPDF(tipo, productos_filtrados, filtrosInfo={}){
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
      doc.text(`Tel: ${LI.telefono}`,44,29);
      doc.text('@pensok.piletas',90,29);
      // Tipo lista badge
      const label = tipo==='minorista'?'LISTA MINORISTA':tipo==='especial'?'LISTA ESPECIAL':'LISTA MAYORISTA';
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
    const COL_PROD=14, COL_CAT=122, COL_PRECIO=150;
    const ROW_H=7, CAT_H=9;

    // Header columnas
    function dibujarHeaderColumnas(){
      doc.setFillColor(...azulClaro);
      doc.rect(10,y,W-20,7,'F');
      doc.setFont('helvetica','bold');
      doc.setFontSize(8);
      doc.setTextColor(...blanco);
      doc.text('PRODUCTO',COL_PROD+2,y+5);
      doc.text('MARCA',COL_CAT,y+5);
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
        const marcaTxt = (p.marca||'').length>18 ? (p.marca||'').substring(0,16)+'...' : (p.marca||'');
        doc.text(marcaTxt,COL_CAT,y+5);
        // Precio / stock — el precio siempre se muestra; si no hay stock, el cartel va al lado, en la MISMA línea.
        // Todo queda dentro de los límites de la fila (para no invadir la de abajo) y se ajusta si hace falta
        // para nunca salirse del margen derecho de la página, sea cual sea el largo del precio.
        const precioRaw = tipo==='minorista' ? p.precio_min : tipo==='especial' ? p.precio_esp : p.precio_may;
        const precio = tipo==='especial' ? Math.round((precioRaw||0)/100)*100 : precioRaw;
        const precioTxt = fmtP(precio);
        doc.setFont('helvetica','bold');
        doc.setFontSize(p.stock===0?7.5:8.5);
        doc.setTextColor(...azul);
        doc.text(precioTxt,COL_PRECIO,y+5);
        if(p.stock===0){
          const precioW = doc.getTextWidth(precioTxt);
          const badgeTxt = 'CONSULTAR STOCK';
          doc.setFont('helvetica','bold');
          doc.setFontSize(5.5);
          const textW = doc.getTextWidth(badgeTxt);
          const padX = 2;
          const badgeW = textW + padX*2;
          const gap = 2;
          let badgeX = COL_PRECIO + precioW + gap;
          // Si no entra al lado del precio, se pega al margen derecho (nunca se sale de la página)
          if(badgeX + badgeW > W-10) badgeX = (W-10) - badgeW;
          const badgeY = y + (ROW_H-4.2)/2; // centrado verticalmente dentro de la fila, sin invadir la de abajo
          doc.setFillColor(255,240,210);
          doc.roundedRect(badgeX,badgeY,badgeW,4.2,1,1,'F');
          doc.setTextColor(180,100,0);
          doc.text(badgeTxt,badgeX+badgeW/2,badgeY+2.9,{align:'center'});
        }
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

// ============================================================
// APP PRINCIPAL
// ============================================================

// ============================================================
// APP PRINCIPAL
// ============================================================
export default function App(){
  // Asegurar meta viewport correcto para mobile
  useEffect(()=>{
    let meta = document.querySelector('meta[name="viewport"]');
    if(!meta){ meta=document.createElement('meta'); meta.name='viewport'; document.head.appendChild(meta); }
    meta.content='width=device-width, initial-scale=1, maximum-scale=1';
  },[]);

  const [session,  setSession]  = useState(null);
  const [checking, setChecking] = useState(true);
  const [rolChecking, setRolChecking] = useState(true); // esperar hasta tener el rol real
  const [rol,      setRol]      = useState("local"); // default local hasta confirmar
  const [modulo,   setModulo]   = useState("analisis");
  const [filtroIngresos, setFiltroIngresos] = useState("");
  const [filtroEgresos, setFiltroEgresos] = useState("");
  // Filtros persistentes por módulo (sobreviven recargas de datos)
  const [ingFiltros, setIngFiltros] = useState({vend:"Todos",met:"Todos",fecha:"",estado:"",cliente:"Todos"});
  const [egrFiltros, setEgrFiltros] = useState({tipo:"Todos",pagador:"Todos",fecha:""});
  // Contador previo de pedidos web (para detectar nuevos y reproducir sonido)
  const [ultimoCountPedidos,setUltimoCountPedidos] = useState(null);
  const toast = useToast();

  const esAdmin = rol === "admin";

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      setSession(session);
      setChecking(false);
      if(session?.user?.email){
        supabase.from("user_roles").select("rol").ilike("email",session.user.email).single()
          .then(({data})=>{
            const r = data?.rol||"local";
            setRol(r);
            if(r==="local") setModulo("venta");
            setRolChecking(false);
          });
      } else {
        setRolChecking(false);
      }
    });
    supabase.auth.onAuthStateChange((_,session)=>{
      setSession(session);
      if(!session){ setRol("local"); setRolChecking(false); }
    });
  },[]);

  const data = useData(toast);

  // Al cargar (y en cada auto-refresh), un admin dispara la creación de la tarea
  // mensual de Control de Stock si todavía no existe para este mes — ver useData.
  useEffect(()=>{
    if(data.loading||!esAdmin) return;
    data.asegurarTareasControlStockMensual();
    data.asegurarValorStockDiario();
  },[data.loading,esAdmin]);

  // Detectar pedidos web nuevos y reproducir sonido
  const pedidosWebPendCount = data.pedidosWeb?.length||0;
  useEffect(()=>{
    if(ultimoCountPedidos === null){
      // Primera carga: registrar el conteo inicial sin sonar
      setUltimoCountPedidos(pedidosWebPendCount);
      return;
    }
    if(pedidosWebPendCount > ultimoCountPedidos){
      // Llegó un pedido nuevo: reproducir beep suave
      try{
        const AC = window.AudioContext || window.webkitAudioContext;
        if(AC){
          const ctx = new AC();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.type = "sine";
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime+0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.4);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime+0.4);
          setTimeout(()=>{
            try{
              const ctx2 = new AC();
              const osc2 = ctx2.createOscillator();
              const gain2 = ctx2.createGain();
              osc2.connect(gain2); gain2.connect(ctx2.destination);
              osc2.frequency.value = 1175;
              osc2.type = "sine";
              gain2.gain.setValueAtTime(0.0001, ctx2.currentTime);
              gain2.gain.exponentialRampToValueAtTime(0.15, ctx2.currentTime+0.02);
              gain2.gain.exponentialRampToValueAtTime(0.0001, ctx2.currentTime+0.5);
              osc2.start(ctx2.currentTime);
              osc2.stop(ctx2.currentTime+0.5);
            }catch(e){}
          },180);
        }
      }catch(e){ /* navegador bloqueado */ }
      const dif = pedidosWebPendCount - ultimoCountPedidos;
      toast.ok(`🛎 Nuevo pedido web recibido${dif>1?` (${dif} nuevos)`:""}`);
    }
    setUltimoCountPedidos(pedidosWebPendCount);
  },[pedidosWebPendCount]);

  async function handleLogout(){
    await supabase.auth.signOut();
    setSession(null);
  }

  if(checking || (session && rolChecking)) return(
    <div style={{minHeight:"100vh",background:G.fondo,display:"flex",alignItems:"center",justifyContent:"center",gap:12}}>
      <Spinner/><span style={{color:G.textoSec}}>Verificando sesion...</span>
    </div>
  );

  if(!session) return <PantallaLogin onLogin={()=>supabase.auth.getSession().then(({data:{session}})=>setSession(session))}/>;

  const alertasStock    = data.productos.filter(p=>p.activo&&estadoStock(p)!=="ok").length;
  const pendientesCobro = data.ventasConItems.filter(v=>!v.cobrado).length;
  const reembolsosPend  = data.egresos.filter(e=>e.reembolso_pendiente&&!e.reembolsado).length;
  const presupuestosPend = (data.presupuestos||[]).filter(p=>p.estado==="pendiente").length;
  const pedidosWebPend  = data.pedidosWeb?.length||0;
  // Badge de Tareas: pendientes vencidas o que vencen hoy, ya filtradas por el local activo
  const tareasAlerta = (data.tareas||[]).filter(t=>
    t.estado!=="hecha" &&
    t.fecha_limite && t.fecha_limite<=hoy() &&
    (t.local===localKey||t.local==="ambos")
  ).length;

  const tabsTodos=[
    {id:"venta",          label:"Nueva venta",    alerta:0},
    {id:"presupuestos",   label:"Presupuestos",   alerta:presupuestosPend, grupo:"ventas"},
    {id:"ingresos",       label:"Ingresos",       alerta:pendientesCobro,  grupo:"ventas"},
    {id:"pedidos_web",    label:"Pedidos web",    alerta:pedidosWebPend,   grupo:"ventas", soloPilar:true},
    {id:"clientes",       label:"Clientes",       alerta:0,                grupo:"ventas"},
    {id:"productos",      label:"Productos",      alerta:alertasStock,     grupo:"inventario"},
    {id:"abastecimiento", label:"Abastecimiento", alerta:0,                grupo:"inventario"},
    {id:"stock_fisico",   label:"Control de Stock", alerta:0,              grupo:"inventario"},
    {id:"egresos",        label:"Egresos",        alerta:reembolsosPend,   grupo:"finanzas"},
    {id:"traspasos",      label:"Traspasos",      alerta:0,                grupo:"finanzas", soloAdmin:true, soloPilar:true},
    {id:"caja",           label:"Cierre de Caja", alerta:0,                grupo:"finanzas", soloAdmin:true},
    {id:"tareas",         label:"Tareas",         alerta:tareasAlerta,     grupo:"otros"},
    {id:"configuracion",  label:"Configuracion",  alerta:0,                grupo:"otros", soloAdmin:true},
    {id:"analisis",       label:"Dashboard",      alerta:0,                grupo:"otros", soloAdmin:true},
  ];
  const tabs = tabsTodos.filter(t=>(esAdmin||!t.soloAdmin)&&(!t.soloPilar||localKey==="pilar"));
  const GRUPOS_NAV = [
    {id:"ventas",     label:"Ventas"},
    {id:"inventario", label:"Inventario"},
    {id:"finanzas",   label:"Finanzas"},
    {id:"otros",      label:"Otros"},
  ];

  return(
    <>
      <style>{css}</style>
      <div style={{minHeight:"100vh",background:G.fondo}}>
        <div style={{background:G.sup,borderBottom:`2px solid ${localKey==="camanio"?"#2B7FD4":G.verde}`,padding:"0 20px",display:"flex",alignItems:"center",justifyContent:"space-between",height:50,position:"sticky",top:0,zIndex:50}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:24,height:24,background:localKey==="camanio"?"#2B7FD4":G.verde,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <span style={{fontSize:11,fontWeight:700,color:"#fff"}}>P</span>
            </div>
            <span style={{fontWeight:600,fontSize:14,letterSpacing:-0.3}}>Pensok</span>
            <span style={{color:localKey==="camanio"?"#2B7FD4":G.verde,fontSize:12,fontWeight:700,letterSpacing:0.5}}>{localActivo.nombre.replace("Pensok ","")}</span>
          </div>
          <nav className="psk-nav" style={{display:"flex",gap:4,alignItems:"center"}}>
            {tabs.filter(t=>t.id==="venta").map(t=>(
              <button key={t.id} onClick={()=>setModulo(t.id)}
                style={{background:modulo===t.id?G.verde:"transparent",color:modulo===t.id?"#000":G.textoSec,border:"none",borderRadius:7,padding:"5px 11px",fontSize:12,fontWeight:modulo===t.id?600:400,cursor:"pointer",transition:"all .15s"}}>
                {t.label}
              </button>
            ))}
            {GRUPOS_NAV.map(g=>(
              <NavGroupDropdown key={g.id} label={g.label} items={tabs.filter(t=>t.grupo===g.id)} modulo={modulo} onSelect={setModulo}/>
            ))}
          </nav>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {data.loading&&<Spinner/>}
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <div className="psk-topbar-email" style={{fontSize:11,color:G.textoSec}}>{session.user.email}</div>
              {!esAdmin&&<span style={{background:"#4D9EFF22",color:G.azul,border:"1px solid #4D9EFF44",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:600}}>LOCAL</span>}
            </div>
            <Btn small variant="ghost" onClick={handleLogout}>Salir</Btn>
          </div>
        </div>

        <div className="psk-main" style={{padding:"20px 22px",maxWidth:1200,margin:"0 auto"}}>
          {data.loading&&modulo!=="venta"
            ?<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:300,gap:12}}><Spinner/><span style={{color:G.textoSec}}>Cargando datos...</span></div>
            :(<>
              {modulo==="analisis"       && <ModuloAnalisis       ventas={data.ventasConItems} egresos={data.egresos} productos={data.productos} vendedores={data.vendedores} totalNosDeben={data.totalNosDeben} totalDeudaCamanio={data.totalDeudaCamanio} anioStats={data.anioStats} devoluciones={data.devoluciones} descuentosEgreso={data.descuentosEgreso} pagosEgreso={data.pagosEgreso} onNavegar={setModulo} onFiltroIngresos={setFiltroIngresos} onFiltroEgresos={setFiltroEgresos}/>}
              {modulo==="valor_stock"    && <ModuloValorStock     historial={data.historialValorStock}/>}
              {modulo==="venta"          && <ModuloVenta          clientes={data.clientes} productos={data.productos} onRegistrar={data.registrarVenta} onCrearPresupuesto={data.crearPresupuesto} vendedores={data.vendedores} esAdmin={esAdmin} toast={toast}/>}
              {modulo==="presupuestos"   && <ModuloPresupuestos   presupuestos={data.presupuestos} productos={data.productos} onAprobar={data.aprobarPresupuesto} onCancelar={data.cancelarPresupuesto} onEditarItems={data.editarPresupuestoItems} vendedores={data.vendedores} vendedoresOtro={data.vendedoresOtro} esAdmin={esAdmin} usuarioEmail={session?.user?.email||""}/>}
              {modulo==="ingresos"       && <ModuloIngresos       ventas={data.ventasConItems} vendedores={data.vendedores} productos={data.productos} clientes={data.clientes} onEditar={data.editarVenta} onEliminar={data.eliminarVenta} onEditarPago={data.editarPagoDeuda} onEliminarPago={data.eliminarPagoDeuda} totalVentas={data.totalVentas} filtroInicial={filtroIngresos} filtrosPersistentes={ingFiltros} onFiltrosChange={setIngFiltros} devoluciones={data.devoluciones} onDevolver={data.registrarDevolucion} esAdmin={esAdmin}/>}
              {modulo==="pedidos_web"    && <ModuloPedidosWeb     pedidosWeb={data.pedidosWeb||[]} onAceptar={data.aceptarPedidoWeb} onRechazar={data.rechazarPedidoWeb} productos={data.productos}/>}
              {modulo==="egresos"        && <ModuloEgresos  esAdmin={esAdmin}        egresos={data.egresos} pagosEgreso={data.pagosEgreso} abastecimiento={data.abastecimiento} descuentosEgreso={data.descuentosEgreso} onRegistrar={data.registrarEgreso} onReembolsar={data.marcarReembolsado} onRegistrarPago={data.registrarPagoEgreso} onEliminarPago={data.eliminarPagoEgreso} onRegistrarDescuento={data.registrarDescuentoEgreso} onEliminarDescuento={data.eliminarDescuentoEgreso} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarEgreso} onEliminar={data.eliminarEgreso} filtroInicial={filtroEgresos} onConsumirFiltro={()=>setFiltroEgresos("")}/>}
              {modulo==="clientes"       && <ModuloClientes       clientes={data.clientes} onGuardar={data.guardarCliente} ventas={data.ventasConItems}/>}
              {modulo==="productos"      && <ModuloProductos      productos={data.productos} onGuardar={data.guardarProducto} onEliminar={data.eliminarProducto} proveedores={data.proveedores} ventas={data.ventasConItems} esAdmin={esAdmin} toast={toast}/>}
              {modulo==="abastecimiento" && <ModuloAbastecimiento productos={data.productos} abastecimiento={data.abastecimiento} egresos={data.egresos} onRegistrar={data.registrarAbastecimiento} onRegistrarLote={data.registrarAbastecimientoLote} vendedores={data.vendedores} proveedores={data.proveedores} onEditar={data.editarAbastecimiento} onEliminar={data.eliminarAbastecimiento}/>}
              {modulo==="stock_fisico"   && <ModuloControlStock    productos={data.productos} conteosStock={data.conteosStock} onCrear={data.crearConteoStock} onAplicar={data.aplicarConteoStock} onEditarConteo={data.editarConteoStockItems} vendedores={data.vendedores} vendedoresOtro={data.vendedoresOtro} esAdmin={esAdmin} usuarioEmail={session?.user?.email||""}/>}
              {modulo==="traspasos"      && <ModuloTraspasos      traspasos={data.traspasos} pagosTraspaso={data.pagosTraspaso} productos={data.productos} onRegistrar={data.registrarTraspaso} onPago={data.registrarPagoTraspaso} totalDeudaCamanio={data.totalDeudaCamanio} localKey={localKey} toast={toast}/>}
              {modulo==="caja"           && <ModuloCaja          ventas={data.ventasConItems} egresos={data.egresos} pagosEgreso={data.pagosEgreso} descuentosEgreso={data.descuentosEgreso} devoluciones={data.devoluciones} toast={toast}/>}
              {modulo==="tareas"         && <ModuloTareas         tareas={data.tareas} responsables={data.responsables} vendedores={data.vendedores} vendedoresOtro={data.vendedoresOtro} onGuardar={data.guardarTarea} onCambiarEstado={data.cambiarEstadoTarea} onEliminar={data.eliminarTarea} esAdmin={esAdmin} usuarioEmail={session?.user?.email||""}/>}
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
// MODULO: PEDIDOS WEB (gestión de pedidos del portal público)
// ============================================================
function ModuloPedidosWeb({pedidosWeb,onAceptar,onRechazar,productos}){
  const [procesando,setProcesando] = useState(null); // id del pedido en proceso
  const [confirmandoRechazo,setConfirmandoRechazo] = useState(null);

  async function aceptar(p){
    setProcesando(p.id);
    await onAceptar(p);
    setProcesando(null);
  }
  async function rechazar(p){
    setProcesando(p.id);
    await onRechazar(p.id);
    setProcesando(null);
    setConfirmandoRechazo(null);
  }

  function tiempoTranscurrido(createdAt){
    const ms = Date.now() - new Date(createdAt).getTime();
    const min = Math.floor(ms/60000);
    if(min<1) return "Hace instantes";
    if(min<60) return `Hace ${min} min`;
    const h = Math.floor(min/60);
    if(h<24) return `Hace ${h}h`;
    const d = Math.floor(h/24);
    return `Hace ${d} ${d===1?"día":"días"}`;
  }

  function abrirWhatsApp(telefono,nombre,nroPedido){
    const tel = (telefono||"").replace(/\D/g,"");
    if(!tel) return;
    // Si el número no empieza con 54 (Argentina), lo agregamos
    const telFinal = tel.startsWith("54") ? tel : (tel.startsWith("9") ? "54"+tel : "549"+tel);
    const msg = encodeURIComponent(`Hola ${nombre}! Te confirmo que recibimos tu pedido #${nroPedido}.`);
    window.open(`https://wa.me/${telFinal}?text=${msg}`,"_blank");
  }

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:18,fontWeight:600}}>Pedidos web pendientes</div>
          <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>
            Pedidos recibidos por el portal público. Verificá que el cliente haya enviado el código por WhatsApp antes de aceptar.
          </div>
        </div>
        <Badge color={pedidosWeb.length>0?"naranja":"gris"}>{pedidosWeb.length} pendiente{pedidosWeb.length!==1?"s":""}</Badge>
      </div>

      {pedidosWeb.length===0 && (
        <Card style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:42,marginBottom:10}}>✓</div>
          <div style={{fontSize:15,fontWeight:600}}>No hay pedidos pendientes</div>
          <div style={{fontSize:12,color:G.textoSec,marginTop:6}}>Cuando un cliente envíe un pedido por el portal, aparecerá acá</div>
        </Card>
      )}

      {pedidosWeb.map(p=>{
        const items = p.items||[];
        const esEnvio = p.tipo_entrega==="envio";
        return (
          <Card key={p.id} style={{padding:0,overflow:"hidden",border:`1px solid ${G.naranja}55`}}>
            {/* Encabezado */}
            <div style={{background:`${G.naranja}11`,padding:"12px 18px",borderBottom:`1px solid ${G.borde}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{fontSize:11,fontWeight:600,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Pedido</div>
                <div style={{fontSize:18,fontWeight:700,fontFamily:"DM Mono,monospace",color:G.naranja}}>#{p.id}</div>
                <div style={{fontSize:11,color:G.textoSec}}>{tiempoTranscurrido(p.created_at)}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5}}>Código</div>
                <div style={{background:G.sup2,border:`1px solid ${G.borde}`,borderRadius:6,padding:"4px 10px",fontFamily:"DM Mono,monospace",fontSize:14,fontWeight:700,letterSpacing:2}}>{p.codigo_verificacion}</div>
              </div>
            </div>

            {/* Cuerpo */}
            <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:12}}>
              {/* Cliente */}
              <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 200px"}}>
                  <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>Cliente</div>
                  <div style={{fontSize:14,fontWeight:600}}>{p.cliente_nombre}</div>
                  <div style={{fontSize:12,color:G.textoSec,display:"flex",alignItems:"center",gap:6,marginTop:2}}>
                    {p.cliente_telefono}
                    <button onClick={()=>abrirWhatsApp(p.cliente_telefono,p.cliente_nombre,p.id)} style={{background:"#25D36622",border:"1px solid #25D36655",color:"#25D366",borderRadius:5,padding:"1px 7px",fontSize:10,fontWeight:600,cursor:"pointer"}}>WhatsApp</button>
                  </div>
                </div>
                <div style={{flex:"1 1 200px"}}>
                  <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>Entrega</div>
                  {esEnvio ? (
                    <>
                      <div style={{fontSize:13,fontWeight:600,color:G.azul}}>🚚 Envío a domicilio</div>
                      <div style={{fontSize:12,color:G.textoSec,marginTop:2}}>{p.direccion_envio}</div>
                      {p.telefono_contacto && p.telefono_contacto!==p.cliente_telefono && (
                        <div style={{fontSize:11,color:G.textoSec,marginTop:2}}>Tel: {p.telefono_contacto}</div>
                      )}
                    </>
                  ) : (
                    <div style={{fontSize:13,fontWeight:600}}>🏪 Retiro en local</div>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:6}}>Productos ({items.length})</div>
                <div style={{background:G.sup2,borderRadius:8,padding:"4px 0"}}>
                  {items.map((it,idx)=>{
                    const prod = productos.find(p2=>p2.id===it.producto_id);
                    const stockOK = prod ? (prod.stock>=it.cantidad || prod.mostrar_siempre_en_catalogo) : false;
                    return (
                      <div key={idx} style={{padding:"7px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,borderTop:idx>0?`1px solid ${G.borde}`:"none"}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:500}}>
                            <span style={{color:G.verde,fontFamily:"DM Mono,monospace",marginRight:8}}>{it.cantidad}×</span>
                            {it.nombre}
                          </div>
                          {prod && !stockOK && (
                            <div style={{fontSize:10,color:G.rojo,marginTop:2}}>⚠ Stock actual: {prod.stock} (insuficiente)</div>
                          )}
                          {it.mostrar_siempre && (
                            <div style={{fontSize:10,color:G.amarillo,marginTop:2}}>📦 Producto a granel — verificar disponibilidad</div>
                          )}
                        </div>
                        <div style={{fontSize:12,fontFamily:"DM Mono,monospace",color:G.textoSec,whiteSpace:"nowrap"}}>{fmt(it.precio)} × {it.cantidad}</div>
                        <div style={{fontSize:13,fontFamily:"DM Mono,monospace",fontWeight:600,color:G.verde,whiteSpace:"nowrap",minWidth:90,textAlign:"right"}}>{fmt(it.precio*it.cantidad)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notas */}
              {p.notas && (
                <div style={{background:`${G.amarillo}11`,border:`1px solid ${G.amarillo}33`,borderRadius:8,padding:"8px 12px"}}>
                  <div style={{fontSize:10,color:G.textoSec,textTransform:"uppercase",letterSpacing:0.5,marginBottom:3}}>📝 Notas del cliente</div>
                  <div style={{fontSize:13}}>{p.notas}</div>
                </div>
              )}

              {/* Total */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:8,borderTop:`1px solid ${G.borde}`}}>
                <div style={{fontSize:13,color:G.textoSec}}>Total del pedido</div>
                <div style={{fontSize:22,fontWeight:700,fontFamily:"DM Mono,monospace",color:G.verde}}>{fmt(p.total)}</div>
              </div>

              {/* Acciones */}
              {confirmandoRechazo===p.id ? (
                <div style={{background:`${G.rojo}11`,border:`1px solid ${G.rojo}44`,borderRadius:8,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{fontSize:13,color:G.texto}}>¿Seguro que querés rechazar este pedido?</div>
                  <div style={{display:"flex",gap:8}}>
                    <Btn small variant="ghost" onClick={()=>setConfirmandoRechazo(null)}>Cancelar</Btn>
                    <Btn small variant="danger" onClick={()=>rechazar(p)} disabled={procesando===p.id}>{procesando===p.id?"...":"Sí, rechazar"}</Btn>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <Btn variant="danger" small onClick={()=>setConfirmandoRechazo(p.id)} disabled={procesando===p.id}>✕ Rechazar</Btn>
                  <div style={{flex:1}}/>
                  <Btn onClick={()=>aceptar(p)} disabled={procesando===p.id} style={{padding:"9px 22px"}}>
                    {procesando===p.id ? "Aceptando..." : "✓ Aceptar pedido"}
                  </Btn>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}


// ============================================================
// MODULO: CIERRE DE CAJA
// ============================================================