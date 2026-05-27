// ============================================================
// 🛒 CONFIGURACIÓN DEL PORTAL DE PEDIDOS
// ============================================================
// Edita estos valores para ajustar el portal sin tocar código.
// ============================================================

export const LOCALES_PORTAL = {
  pilar: {
    nombre: "Pensok Pilar",
    direccion: "Gelves 1126, Pilar",
    whatsapp: "5491170645115",
    url:  "https://dupatnbwrgdtxalpqgqi.supabase.co",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1cGF0bmJ3cmdkdHhhbHBxZ3FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwNDI3MTYsImV4cCI6MjA5MjYxODcxNn0.boipXsRYdS98KjU8A2edDbAMEprFGT_1iL6rwkbHres",
  },
  camanio: {
    nombre: "Pensok Caamaño",
    direccion: "Caamaño, Pilar",
    whatsapp: "5491170645115", // mismo wsp por ahora
    url:  "https://kggpwndbdbqfmupiqrqp.supabase.co",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ3B3bmRiZGJxZm11cGlxcnFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNzgyMTcsImV4cCI6MjA5MzY1NDIxN30.N0UihJY_WSfFARChle_HMtZ-jvKDPbIo0fOZDCdJvV0",
  },
};

export const PORTAL_CONFIG = {
  // Montos mínimos
  MIN_PEDIDO: 8000,
  MIN_ENVIO: 35000,

  // Zonas de envío (radio ~30km desde Pilar centro)
  // El cliente ingresa su localidad y se valida contra esta lista (insensible a mayúsculas/acentos)
  LOCALIDADES_ENVIO: [
    // Partido de Pilar
    "Pilar", "Del Viso", "Manuel Alberti", "Villa Rosa",
    "Presidente Derqui", "Derqui", "La Lonja", "Pilar Este", "Fátima",
    // Partido de Escobar
    "Maquinista Savio", "Garín", "Belén de Escobar", "Escobar",
    "Ingeniero Maschwitz", "Maschwitz", "Matheu", "Loma Verde",
    // Partido de Malvinas Argentinas
    "Tortuguitas", "Grand Bourg", "Tierras Altas", "Los Polvorines",
    // Partido de Tigre / San Fernando
    "Benavidez", "Talar", "General Pacheco", "Pacheco",
    // Partido de Exaltación de la Cruz
    "Capilla del Señor",
  ],
};

// Normaliza texto: minúsculas + sin acentos
export const normalizar = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

// Verifica si una localidad escrita por el cliente coincide con la lista permitida
export const esLocalidadValida = (localidad) => {
  const n = normalizar(localidad);
  if (!n) return false;
  return PORTAL_CONFIG.LOCALIDADES_ENVIO.some(l => normalizar(l) === n)
      || PORTAL_CONFIG.LOCALIDADES_ENVIO.some(l => n.includes(normalizar(l)));
};

// Genera código de 4 dígitos
export const generarCodigo = () =>
  String(Math.floor(1000 + Math.random() * 9000));

// Formatear moneda
export const fmtMoneda = (n) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n || 0);

// Detecta qué local debe usar el portal según la URL
// /pedido/pilar → pilar, /pedido/camanio → camanio
export const detectarLocalDeURL = () => {
  const path = window.location.pathname.toLowerCase();
  if (path.includes("/pedido/camanio") || path.includes("/pedido/caamano")) return "camanio";
  return "pilar"; // default
};
