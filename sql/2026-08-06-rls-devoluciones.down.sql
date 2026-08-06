-- DOWN de 2026-08-06-rls-devoluciones.sql
-- Correr en el/los mismo(s) proyecto(s) donde se corrió el up.
--
-- Solo borra las policies -- a propósito NO deshabilita RLS de nuevo, porque eso
-- reabriría el agujero de seguridad en Caamaño que este cambio vino a cerrar. Si se
-- corre esto, devoluciones/devolucion_items vuelven a quedar sin policy = sin acceso
-- para la app (el mismo bug que tenía Pilar antes de este cambio), no "públicas".

drop policy if exists allow_all on devoluciones;
drop policy if exists allow_all on devolucion_items;
