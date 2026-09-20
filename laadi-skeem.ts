#!/usr/bin/env bun
/**
 * Laeb skeemi (dump.sql) andmebaasi.
 *
 * Kasutab psql-i, kui see on olemas (siis toimivad ka psql-i meta-käsud),
 * muidu laeb faili otse Bun-i ühenduse kaudu, lahendades `\ir` kaasamised ise.
 *
 * Käivitamine:  bun run laadi-skeem.ts     (või: bun run skeem)
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('VIGA: keskkonnamuutuja DATABASE_URL puudub. Kopeeri .env.example -> .env');
  process.exit(1);
}

const juur = new URL('.', import.meta.url).pathname;
const dump = resolve(juur, 'dump.sql');

// --- 1. eelistatud tee: psql -------------------------------------------------
const psqlOlemas = await (async () => {
  try {
    const p = Bun.spawn(['psql', '--version'], { stdout: 'ignore', stderr: 'ignore' });
    return (await p.exited) === 0;
  } catch {
    return false;
  }
})();

if (psqlOlemas) {
  const p = Bun.spawn(['psql', DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-f', dump], {
    cwd: juur,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const kood = await p.exited;
  if (kood !== 0) {
    console.error(`VIGA: psql lõpetas veakoodiga ${kood}`);
    process.exit(kood);
  }
  console.log('Skeem laetud (psql).');
  process.exit(0);
}

// --- 2. varutee: laeme faili ise --------------------------------------------
console.log('psql-i ei leitud, laen skeemi otseühenduse kaudu.');

/** Loeb .sql faili, lahendab `\ir` kaasamised ja eemaldab muud meta-käsud. */
function loeSql(tee: string): string {
  if (!existsSync(tee)) throw new Error(`Faili ei leitud: ${tee}`);
  const read: string[] = [];
  for (const rida of readFileSync(tee, 'utf8').split('\n')) {
    const trim = rida.trim();
    if (trim.startsWith('\\ir ') || trim.startsWith('\\i ')) {
      read.push(loeSql(resolve(dirname(tee), trim.replace(/^\\i(r)?\s+/, '').trim())));
    } else if (!trim.startsWith('\\')) {
      read.push(rida);
    }
  }
  return read.join('\n');
}

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
try {
  await sql.unsafe(loeSql(dump)).simple();
  console.log('Skeem laetud.');
} finally {
  await sql.end();
}
