#!/usr/bin/env bash
# Dump de datos (sin esquema) de una base Supabase, incluye auth.users con hashes
# de password -- por eso este archivo de salida NUNCA debe ir a git, solo a la
# carpeta local/OneDrive privada (ver db-backup.cjs). Espera las credenciales ya
# exportadas como env vars (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).
#
# Copiado del pipeline que genera `supabase db dump --data-only --dry-run` (CLI
# 2.111.0), corriendo pg_dump directo en vez de por Docker.
set -euo pipefail

echo "SET session_replication_role = replica;
"

pg_dump \
    --data-only \
    --quote-all-identifiers \
    --role "postgres" \
    --exclude-schema "information_schema|pg_*|graphql|graphql_public|pgsodium|pgsodium_masks|pgtle|repack|tiger|tiger_data|timescaledb_*|_timescaledb_*|topology|vault|etl|extensions|pgbouncer|realtime|supabase_migrations|_analytics|_realtime|_supavisor" \
    --exclude-table "auth.schema_migrations" \
    --exclude-table "storage.migrations" \
    --exclude-table "supabase_functions.migrations" \
    --schema "*" \
    --column-inserts --rows-per-insert 100000 \
| sed -E 's/^\\(un)?restrict .*$/-- &/'

echo "RESET ALL;"
