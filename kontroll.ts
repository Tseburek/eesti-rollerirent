#!/usr/bin/env bun
/**
 * Käivitab kontrollpäringud (sql/kontroll.sql) ja kuvab tulemused.
 * Käivitamine:  bun run kontroll.ts     (või: bun run kontroll)
 */

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('VIGA: keskkonnamuutuja DATABASE_URL puudub. Kopeeri .env.example -> .env');
  process.exit(1);
}

const juur = new URL('.', import.meta.url).pathname;
const p = Bun.spawn(['psql', DATABASE_URL, '-f', 'sql/kontroll.sql'], {
  cwd: juur,
  env: process.env,
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await p.exited);
