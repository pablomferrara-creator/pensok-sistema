-- Totales mensuales historicos, para meses/años anteriores a que el negocio empezara a
-- usar el sistema (marzo 2026) y que por lo tanto no tienen ventas/egresos cargados.
-- Se usan como fallback en el Dashboard SOLO para los meses que no tengan ninguna venta/
-- egreso real cargado -- si un mes ya tiene datos reales, esos siempre ganan.

create table if not exists historico_mensual (
  id serial primary key,
  mes text not null unique,          -- formato "YYYY-MM"
  facturacion numeric default 0,
  ganancia_neta numeric default 0,
  gastos_fijos numeric default 0,
  gastos_variables numeric default 0,
  notas text default '',
  created_at timestamptz default now()
);

alter table historico_mensual enable row level security;
create policy "autenticados_todo_historico_mensual" on historico_mensual
  for all to authenticated using (true) with check (true);
