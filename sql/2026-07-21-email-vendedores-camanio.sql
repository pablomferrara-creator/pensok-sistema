-- Igualar la estructura de vendedores en Caamaño con la de Pilar.
-- Pilar tiene: id, nombre, email, telefono, activo, created_at
-- Caamaño le faltaban "email" (ya corrida) y "telefono" (por eso seguía fallando el guardado
-- con error 400 "column vendedores.telefono does not exist" al editar un vendedor).
-- Correr SOLO en el proyecto Supabase de Caamaño (kggpwndbdbqfmupiqrqp). Es seguro volver a
-- correr esto aunque "email" ya exista — el "if not exists" no rompe nada.

alter table vendedores add column if not exists email text default '';
alter table vendedores add column if not exists telefono text default '';

-- Una vez corrido esto, para que el sistema pueda identificar a cada vendedor por su login,
-- hay que cargar el email real de cada uno tanto acá como en Pilar, por ejemplo:
-- update vendedores set email = 'fabri@ejemplo.com' where nombre = 'Fabri';
-- update vendedores set email = 'maxi@ejemplo.com'  where nombre = 'Maxi';
-- (repetir para el resto de los vendedores activos, en ambas bases)
