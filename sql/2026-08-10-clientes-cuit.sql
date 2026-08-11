-- Agrega el campo CUIT a clientes, para poder registrarlo desde el modal de edición.
-- Pablo lo necesita para empezar a guardar el CUIT de los clientes (facturación/identificación).
-- Aditivo y de bajo riesgo: columna nueva, nullable, no toca filas existentes.

alter table clientes add column if not exists cuit text;
