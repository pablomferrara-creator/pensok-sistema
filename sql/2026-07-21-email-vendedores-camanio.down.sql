-- DOWN de 2026-07-21-email-vendedores-camanio.sql
-- Correr SOLO en el proyecto Supabase de Caamaño (kggpwndbdbqfmupiqrqp).
--
-- ADVERTENCIA: esto borra los valores de email/telefono cargados en vendedores de
-- Caamaño desde que se corrió el up. Si esos emails ya se usan para identificar el
-- login de un vendedor, dejan de poder identificarse hasta que se vuelva a correr
-- el up y se recarguen esos datos (ver el UPDATE de ejemplo al final del up).

alter table vendedores drop column if exists telefono;
alter table vendedores drop column if exists email;
