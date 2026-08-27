-- Billetera "Dólares" en Cierre de Caja + soporte de movimientos que cruzan moneda
-- (pesos <-> dólares) en movimientos_caja.

alter table caja_config    add column if not exists saldo_dolares numeric default 0;
alter table cierres_caja   add column if not exists saldo_dolares numeric default 0;

-- monto_destino: lo que ENTRA al bolsillo destino, en SU propia moneda. Si es null, se
-- interpreta como igual a "monto" (movimiento normal pesos->pesos, no cruza moneda).
-- tipo_cambio: solo se carga cuando el movimiento cruza pesos<->dólares (queda null en el
-- resto), es el TC que se tipeó a mano para esa operación puntual.
alter table movimientos_caja add column if not exists monto_destino numeric;
alter table movimientos_caja add column if not exists tipo_cambio   numeric;
