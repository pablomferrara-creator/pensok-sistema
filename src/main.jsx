import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import PortalPedidos from './portal/PortalPedidos.jsx'

// ============================================================
// BIFURCACIÓN: si la URL es /pedido o /pedido/* → Portal público
//              sino → App de administración (sistema original)
// ============================================================
const esPortal = window.location.pathname.toLowerCase().startsWith('/pedido');

ReactDOM.createRoot(document.getElementById('root')).render(
  esPortal ? <PortalPedidos /> : <App />
)
