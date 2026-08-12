-- Habilita editar/eliminar traspasos (pedido de Pablo: a veces se equivocan en las cantidades
-- al cargar un traspaso y no había forma de corregirlo).
--
-- 1. traspasos.pilar_id: en la copia de Caamaño, guarda el id de la fila real en Pilar. Antes
--    no había NINGÚN id compartido entre la fila de Pilar y su espejo en Caamaño -- todo el
--    código que necesitaba encontrar el espejo (pagos, y ahora editar/eliminar) matcheaba por
--    fecha nada más, lo cual falla en silencio cuando dos traspasos caen el mismo día (ver
--    CLAUDE.md, "registrarPagoTraspaso" -- bug real ya documentado, encontrado el 2026-08-10).
--    Se agrega en AMBOS proyectos por simetría de esquema, aunque en Pilar queda sin uso (Pilar
--    es la fuente, no necesita apuntar a sí mismo).
-- 2. abastecimiento.traspaso_id: liga cada fila de abastecimiento generada automáticamente al
--    registrar un traspaso (tanto la salida en Pilar como la entrada en Caamaño) con el
--    traspaso que la generó. Nullable -- las filas de abastecimiento que no vienen de un
--    traspaso quedan sin tocar.

alter table traspasos add column if not exists pilar_id bigint;
alter table abastecimiento add column if not exists traspaso_id bigint references traspasos(id) on delete set null;
