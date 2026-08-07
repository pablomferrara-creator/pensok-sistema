-- Comisión de plataforma al pagar un egreso (mismo concepto que ventas.comision_plataforma
-- pero invertido: en egresos hace que salga MÁS plata de la billetera de la que se le debía
-- al proveedor, no menos). Se guarda por pago individual, no por egreso completo, porque un
-- egreso puede pagarse en varias partes con métodos distintos (a diferencia de una venta).
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño).

alter table pagos_egreso add column if not exists comision_plataforma numeric(12,2) not null default 0;
