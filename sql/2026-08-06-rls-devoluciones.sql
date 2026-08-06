-- Arregla dos problemas encontrados a partir de un aviso de seguridad de Supabase
-- (rls_disabled_in_public) en Caamaño:
--
-- 1. SEGURIDAD (Caamaño): devoluciones y devolucion_items tenían Row-Level Security
--    deshabilitado por completo -- cualquiera con la project URL y la anon key podía
--    leer/editar/borrar esas tablas directo por la API REST, sin pasar por la app.
-- 2. BUG FUNCIONAL (Pilar): esas mismas tablas SÍ tenían RLS habilitado, pero sin
--    ninguna policy -- lo que bloquea TODO acceso (ni siquiera la app puede escribir).
--    Por eso devoluciones en Pilar tiene 0 filas: la funcionalidad de "Nota de crédito"
--    está rota ahí desde que se armó, sin ningún aviso salvo el toast genérico de error.
--
-- Correr en AMBOS proyectos Supabase (Pilar y Caamaño). Mismo patrón (RLS + policy
-- allow_all) que ya usa el resto de las tablas de este proyecto.

alter table devoluciones enable row level security;
alter table devolucion_items enable row level security;

create policy allow_all on devoluciones for all using (true) with check (true);
create policy allow_all on devolucion_items for all using (true) with check (true);
