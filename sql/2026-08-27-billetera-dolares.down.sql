-- DOWN de 2026-08-27-billetera-dolares.sql
--
-- ADVERTENCIA: si ya se registraron movimientos hacia/desde la billetera Dólares, o cierres
-- con saldo_dolares distinto de 0, correr esto pierde esa información para siempre (vuelve
-- todo a 0 / null, no hay forma de reconstruirla). Antes de correr, revisar:
--   select * from movimientos_caja where monto_destino is not null or tipo_cambio is not null;
--   select fecha, saldo_dolares from cierres_caja where saldo_dolares <> 0;
--   select saldo_dolares from caja_config where saldo_dolares <> 0;

alter table movimientos_caja drop column if exists monto_destino;
alter table movimientos_caja drop column if exists tipo_cambio;
alter table cierres_caja     drop column if exists saldo_dolares;
alter table caja_config      drop column if exists saldo_dolares;
