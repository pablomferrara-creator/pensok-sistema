-- Agregar la columna "email" a vendedores en Caamaño, para igualar la estructura con Pilar
-- (que ya tiene esta columna, aunque hoy esté vacía en todos sus registros).
-- Correr SOLO en el proyecto Supabase de Caamaño (kggpwndbdbqfmupiqrqp).

alter table vendedores add column if not exists email text default '';

-- Una vez corrido esto, para que el sistema pueda identificar a cada vendedor por su login,
-- hay que cargar el email real de cada uno tanto acá como en Pilar, por ejemplo:
-- update vendedores set email = 'fabri@ejemplo.com' where nombre = 'Fabri';
-- update vendedores set email = 'maxi@ejemplo.com'  where nombre = 'Maxi';
-- (repetir para el resto de los vendedores activos, en ambas bases)
