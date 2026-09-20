#!/usr/bin/env bun
/**
 * eesti-rollerirent — seemneskript.
 *
 * Täidab skeemi realistlike suurandmetega:
 *   1. eemaldab sekundaarsed indeksid ja võõrvõtmed ning tühjendab tabelid,
 *   2. täidab tabelid FK-järjekorras, partiidena, COPY ... FROM STDIN kaudu,
 *      mitu ühendust paralleelselt (sõltumatud tabelid ka üheaegselt),
 *   3. taastab indeksid ja võõrvõtmed (ADD CONSTRAINT kontrollib tervikluse),
 *   4. käivitab ANALYZE ja väljastab kontrollaruande.
 *
 * Käivitamine:  bun run seed.ts
 * Vt README.md.
 */

import postgres from 'postgres';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';

import {
  KONF,
  KASUTAJA_VEERUD, ridaKasutaja,
  ROLLER_VEERUD, ridaRoller,
  SOIT_VEERUD, ridaSoit,
  MAKSE_VEERUD, ridaMakse,
  HINNANG_VEERUD, ridaHinnang,
  HOOLDUS_VEERUD, ridaHooldus,
  TUGIPILET_VEERUD, ridaTugipilet,
} from './src/generaatorid.ts';

// ---------------------------------------------------------------------------
//  Ühendus
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('VIGA: keskkonnamuutuja DATABASE_URL puudub. Kopeeri .env.example -> .env');
  process.exit(1);
}

const P = Math.max(1, KONF.paralleelsus);

const sql = postgres(DATABASE_URL, {
  max: P + 4,
  idle_timeout: 0,
  max_lifetime: 0,
  onnotice: () => {},
});

// ---------------------------------------------------------------------------
//  Abifunktsioonid
// ---------------------------------------------------------------------------

const t0 = Date.now();
const kell = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const log = (s: string) => console.log(`[${kell()}] ${s}`);
const nr = (n: number) => n.toLocaleString('et-EE').replace(/\u00a0/g, ' ');

/** Käivitab .sql faili. psql-i meta-käsud (\set, \ir) filtreeritakse välja. */
async function jooksutaFail(tee: string): Promise<void> {
  const sisu = readFileSync(tee, 'utf8')
    .split('\n')
    .filter((rida) => !rida.trimStart().startsWith('\\'))
    .join('\n');
  await sql.unsafe(sisu).simple();
}

interface Plaan {
  tabel: string;
  veerud: string;
  arv: number;
  rida: (id: number) => string | null;
}

const edenemine = new Map<string, number>();

/**
 * Täidab ühe tabeli: id-vahemik tükeldatakse partiideks, tööliste kogum
 * tarbib partiisid järjekorrast ja saadab need COPY-voona andmebaasi.
 * Iga COPY on omaette transaktsioon (server-side), partii = 1 transaktsioon.
 */
async function taidaTabel(plaan: Plaan, toolisi: number): Promise<number> {
  const partiisid: [number, number][] = [];
  for (let algus = 1; algus <= plaan.arv; algus += KONF.partii) {
    partiisid.push([algus, Math.min(plaan.arv, algus + KONF.partii - 1)]);
  }

  let jargmine = 0;
  let kirjutatud = 0;
  edenemine.set(plaan.tabel, 0);

  const toolineTood = Array.from({ length: Math.max(1, toolisi) }, async () => {
    const c = await sql.reserve();
    try {
      // Mass-sisestuse seadistus ühenduse tasemel.
      await c.unsafe(`SET synchronous_commit = off;
                      SET maintenance_work_mem = '256MB';
                      SET client_min_messages = warning;`).simple();

      for (;;) {
        const i = jargmine++;
        if (i >= partiisid.length) break;
        const [algus, lopp] = partiisid[i]!;

        const puhver: string[] = [];
        let n = 0;
        for (let id = algus; id <= lopp; id++) {
          const rida = plaan.rida(id);
          if (rida !== null) {
            puhver.push(rida);
            n++;
          }
        }
        if (n === 0) continue;

        const paring = c.unsafe(
          `COPY ${plaan.tabel} (${plaan.veerud}) FROM STDIN WITH (FORMAT csv, NULL '')`,
        );
        const voog = await (paring as unknown as { writable: () => Promise<NodeJS.WritableStream> }).writable();
        await pipeline(Readable.from([Buffer.from(puhver.join(''), 'utf8')]), voog as never);

        kirjutatud += n;
        edenemine.set(plaan.tabel, kirjutatud);
      }
    } finally {
      c.release();
    }
  });

  await Promise.all(toolineTood);
  return kirjutatud;
}

/** Iga 3 sekundi tagant üks edenemisrida, et pikk täitmine oleks jälgitav. */
function alustaEdenemiseLogi(): ReturnType<typeof setInterval> {
  return setInterval(() => {
    const osad = [...edenemine.entries()]
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}=${nr(v)}`);
    if (osad.length) log('   ... ' + osad.join('  '));
  }, 3000);
}

// ---------------------------------------------------------------------------
//  Peavoog
// ---------------------------------------------------------------------------

const etapiAjad: { nimi: string; sek: number; ridu: number }[] = [];

async function etapp<T>(nimi: string, ridu: number, f: () => Promise<T>): Promise<T> {
  const algus = Date.now();
  const res = await f();
  if (Array.isArray(res)) ridu = (res as unknown[]).reduce<number>((a, b) => a + (typeof b === 'number' ? b : 0), 0);
  else if (typeof res === 'number') ridu = res;
  const sek = (Date.now() - algus) / 1000;
  etapiAjad.push({ nimi, sek, ridu });
  log(`${nimi} valmis: ${nr(ridu)} rida, ${sek.toFixed(1)} s (${nr(Math.round(ridu / Math.max(sek, 0.001)))} rida/s)`);
  return res;
}

async function main() {
  log('eesti-rollerirent — seemneskript käivitub');
  log(`Seeme=${KONF.seeme}  mastaap=${KONF.mastaap}  partii=${nr(KONF.partii)}  paralleelsus=${P}`);
  log(
    `Sihtmahud: kasutaja=${nr(KONF.kasutajaid)}  roller=${nr(KONF.rollereid)}  ` +
      `soit=${nr(KONF.soite)}  hooldus=${nr(KONF.hooldusi)}  tugipilet=${nr(KONF.tugipileteid)}`,
  );

  const [{ server_version: ver }] = await sql`SHOW server_version` as unknown as { server_version: string }[];
  log(`PostgreSQL ${ver}`);

  // -- 1. Ettevalmistus: indeksid ja võõrvõtmed maha, tabelid tühjaks ----------
  await etapp('1. Indeksite ja võõrvõtmete eemaldamine', 0, async () => {
    await jooksutaFail(new URL('./sql/eemalda-indeksid.sql', import.meta.url).pathname);
    return null;
  });

  const jalgija = alustaEdenemiseLogi();

  // -- 2. Sõltumatud baastabelid paralleelselt --------------------------------
  const poolP = Math.max(1, Math.floor(P / 2));
  const [kasutajaid, rollereid] = await etapp(
    '2. kasutaja + roller (paralleelselt)',
    KONF.kasutajaid + KONF.rollereid,
    () =>
      Promise.all([
        taidaTabel({ tabel: 'kasutaja', veerud: KASUTAJA_VEERUD, arv: KONF.kasutajaid, rida: ridaKasutaja }, poolP),
        taidaTabel({ tabel: 'roller', veerud: ROLLER_VEERUD, arv: KONF.rollereid, rida: ridaRoller }, poolP),
      ]),
  );

  // -- 3. soit: suurim tabel, kõik töölised korraga ---------------------------
  const soite = await etapp('3. soit', KONF.soite, () =>
    taidaTabel({ tabel: 'soit', veerud: SOIT_VEERUD, arv: KONF.soite, rida: ridaSoit }, P),
  );

  // -- 4. Sõidust/rollerist sõltuvad tabelid paralleelselt --------------------
  const veerandP = Math.max(1, Math.floor(P / 4));
  const [makseid, hinnanguid, hooldusi, pileteid] = await etapp(
    '4. makse + hinnang + hooldus + tugipilet (paralleelselt)',
    0,
    () =>
      Promise.all([
        taidaTabel({ tabel: 'makse', veerud: MAKSE_VEERUD, arv: KONF.soite, rida: ridaMakse }, Math.max(1, Math.floor(P / 2))),
        taidaTabel({ tabel: 'hinnang', veerud: HINNANG_VEERUD, arv: KONF.soite, rida: ridaHinnang }, veerandP),
        taidaTabel({ tabel: 'hooldus', veerud: HOOLDUS_VEERUD, arv: KONF.hooldusi, rida: ridaHooldus }, veerandP),
        taidaTabel({ tabel: 'tugipilet', veerud: TUGIPILET_VEERUD, arv: KONF.tugipileteid, rida: ridaTugipilet }, veerandP),
      ]),
  );

  clearInterval(jalgija);

  // -- 5. Indeksite ja võõrvõtmete taastamine ---------------------------------
  await etapp('5. Indeksite ja võõrvõtmete taastamine', 0, async () => {
    await jooksutaFail(new URL('./sql/indeksid.sql', import.meta.url).pathname);
    return null;
  });

  // -- 6. Statistika ----------------------------------------------------------
  await etapp('6. ANALYZE', 0, async () => {
    await sql.unsafe('ANALYZE;').simple();
    return null;
  });

  // -- 7. Kontrollaruanne -----------------------------------------------------
  log('7. Kontrollaruanne');
  const loendid = await sql.unsafe(`
    SELECT 'kasutaja'  AS tabel, count(*) AS ridu FROM kasutaja
    UNION ALL SELECT 'roller',    count(*) FROM roller
    UNION ALL SELECT 'soit',      count(*) FROM soit
    UNION ALL SELECT 'makse',     count(*) FROM makse
    UNION ALL SELECT 'hinnang',   count(*) FROM hinnang
    UNION ALL SELECT 'hooldus',   count(*) FROM hooldus
    UNION ALL SELECT 'tugipilet', count(*) FROM tugipilet
    ORDER BY 2 DESC;
  `);
  console.table(loendid.map((r: any) => ({ tabel: r.tabel, ridu: nr(Number(r.ridu)) })));

  const [orvud] = await sql.unsafe(`
    SELECT
      (SELECT count(*) FROM soit s      LEFT JOIN kasutaja k ON k.id = s.kasutaja_id WHERE k.id IS NULL) AS soit_ilma_kasutajata,
      (SELECT count(*) FROM soit s      LEFT JOIN roller r   ON r.id = s.roller_id   WHERE r.id IS NULL) AS soit_ilma_rollerita,
      (SELECT count(*) FROM makse m     LEFT JOIN soit s     ON s.id = m.soit_id     WHERE s.id IS NULL) AS makse_ilma_soiduta,
      (SELECT count(*) FROM hinnang h   LEFT JOIN soit s     ON s.id = h.soit_id     WHERE s.id IS NULL) AS hinnang_ilma_soiduta,
      (SELECT count(*) FROM hooldus h   LEFT JOIN roller r   ON r.id = h.roller_id   WHERE r.id IS NULL) AS hooldus_ilma_rollerita,
      (SELECT count(*) FROM tugipilet p LEFT JOIN kasutaja k ON k.id = p.kasutaja_id WHERE k.id IS NULL) AS pilet_ilma_kasutajata
  `);
  console.table([orvud]);

  const [maht] = await sql.unsafe(`
    SELECT pg_size_pretty(sum(pg_total_relation_size(c.oid))) AS andmebaasi_maht
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `);

  const koguRidu = kasutajaid + rollereid + soite + makseid + hinnanguid + hooldusi + pileteid;
  const koguSek = (Date.now() - t0) / 1000;

  log('---------------------------------------------------------------');
  log(`Ridu kokku (mitte-lookup): ${nr(koguRidu)}`);
  log(`Suurim tabel: soit = ${nr(soite)} rida${soite >= 2_000_000 ? '  ✓ >= 2 000 000' : ''}`);
  log(`Tabelite maht kettal: ${(maht as any).andmebaasi_maht}`);
  log(`Kogukestus: ${koguSek.toFixed(1)} s`);
  log('---------------------------------------------------------------');
  console.table(etapiAjad.map((e) => ({ etapp: e.nimi, sekundid: e.sek.toFixed(1) })));

  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  await sql.end({ timeout: 5 }).catch(() => {});
  process.exit(1);
});
