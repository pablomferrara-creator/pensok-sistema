#!/usr/bin/env node
// Dump diario de Pilar y Caamano a OneDrive: esquema + datos, via pg_dump local
// (instalado con winget, solo command-line tools, sin server) corriendo los
// pipelines de scripts/pg-dump-schema.sh y pg-dump-data.sh a traves de Git Bash.
// Pensado para correr desatendido por la Tarea Programada de Windows "PensokDbBackup".
//
// Credenciales: NO viven en este repo. Se leen de un .env local en
// C:\Users\pablo\OneDrive\pensok-db-backups\.env (fuera de git). Ver
// scripts/db-backup.env.example para el formato esperado (session pooler URL,
// no la conexion directa -- esa es IPv6-only y suele fallar).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKUP_ROOT = 'C:\\Users\\pablo\\OneDrive\\pensok-db-backups';
const ENV_FILE = path.join(BACKUP_ROOT, '.env');
const RETENTION_DAYS = 21;
const BASH = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';
const PG_BIN = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const SCRIPTS_DIR = __dirname;

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pgEnvFromUrl(dbUrl) {
  const u = new URL(dbUrl);
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, '') || 'postgres',
  };
}

function runPipeline(scriptName, pgEnv) {
  return execFileSync(BASH, [path.join(SCRIPTS_DIR, scriptName)], {
    env: { ...process.env, ...pgEnv, PATH: `${PG_BIN};${process.env.PATH}` },
    maxBuffer: 1024 * 1024 * 512,
  });
}

function dump(name, dbUrl) {
  const pgEnv = pgEnvFromUrl(dbUrl);
  const schema = runPipeline('pg-dump-schema.sh', pgEnv);
  const data = runPipeline('pg-dump-data.sh', pgEnv);

  const dir = path.join(BACKUP_ROOT, name);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${name}_${todayStamp()}.sql`);
  const header = `-- Dump de ${name} generado ${new Date().toISOString()}\n-- Contiene auth.users con hashes de password -- privado, no compartir.\n\n`;
  fs.writeFileSync(dest, header + schema.toString('utf8') + '\n' + data.toString('utf8'));
  return dest;
}

function cleanup(name) {
  const dir = path.join(BACKUP_ROOT, name);
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const stat = fs.statSync(fp);
    if (stat.isFile() && stat.mtimeMs < cutoff) fs.unlinkSync(fp);
  }
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(path.join(BACKUP_ROOT, 'backup.log'), line);
  process.stdout.write(line);
}

const env = loadEnv(ENV_FILE);
const targets = [
  ['pilar', env.PILAR_DB_URL],
  ['caamanio', env.CAAMANIO_DB_URL],
];

fs.mkdirSync(BACKUP_ROOT, { recursive: true });

for (const [name, url] of targets) {
  if (!url) {
    log(`SALTEADO ${name}: falta ${name.toUpperCase()}_DB_URL en ${ENV_FILE}`);
    continue;
  }
  try {
    const dest = dump(name, url);
    const size = fs.statSync(dest).size;
    cleanup(name);
    log(`OK ${name}: ${dest} (${(size / 1024).toFixed(0)} KB)`);
  } catch (e) {
    const detail = e.stderr ? e.stderr.toString('utf8').slice(0, 2000) : e.message;
    log(`ERROR ${name}: ${detail}`);
  }
}
