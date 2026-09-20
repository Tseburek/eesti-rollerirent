/**
 * Ridade generaatorid.
 *
 * Iga rida on PUHAS funktsioon kujul f(SEEME, tabel, id). Sellest järeldub:
 *   - reprodutseeritavus: sama .env -> identne andmebaas,
 *   - paralleelsus: id-vahemikud saab jagada tööliste vahel ilma lukustamata,
 *   - tuletatavus: makse ja hinnang oskavad sõidu id järgi sõidu uuesti
 *     genereerida, nii et summad ja ajatemplid klapivad ilma andmebaasist
 *     midagi tagasi lugemata.
 *
 * Ajaline terviklus on tagatud monotoonsete id-de kaudu:
 *   kasutaja.id kasvab liitumise ajas, rolleri id kasvab pargi laienemise ajas,
 *   soit.id kasvab sõidu toimumise ajas. Sõidu genereerimisel valitakse
 *   kasutaja ja roller ainult nende hulgast, kes olid sel hetkel juba olemas.
 */

import {
  EESNIMED_M, EESNIMED_N, PERENIMED, TANAVAD, LINNAD, EMAILI_DOMEENID, PAKETID,
  ROLLERI_STAATUSED, ROLLERI_STAATUSE_KAALUD, SOIDUSTAATUSE_KAALUD, MAKSEMEETODI_KAALUD,
  HOOLDUSTUUBI_KAALUD, TUGITEEMA_KAALUD, TUNNI_KAALUD, KUU_KAALUD,
  HINNANGU_KOMMENTAARID, HOOLDUSE_MARKUSED, TUGIPILETI_SISU,
  TUGIPILETI_STAATUSED, TUGIPILETI_STAATUSE_KAALUD, translit,
} from './andmestik.ts';
import {
  rngFor, SOOL, int, chance, pick, weightedIndex, gauss, lognorm, type Rng,
} from './juhuslikkus.ts';

// ---------------------------------------------------------------------------
//  Konfiguratsioon (.env / keskkonnamuutujad)
// ---------------------------------------------------------------------------

const num = (v: string | undefined, vaikimisi: number) => {
  const n = v === undefined || v === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : vaikimisi;
};

const MASTAAP = num(process.env.MASTAAP, 1);
const skaleeri = (n: number) => Math.max(1, Math.round(n * MASTAAP));

export const KONF = {
  seeme: Math.trunc(num(process.env.SEEME, 20260920)),
  kasutajaid: skaleeri(num(process.env.KASUTAJAID, 400_000)),
  rollereid: skaleeri(num(process.env.ROLLEREID, 60_000)),
  soite: skaleeri(num(process.env.SOITE, 2_600_000)),
  hooldusi: skaleeri(num(process.env.HOOLDUSI, 240_000)),
  tugipileteid: skaleeri(num(process.env.TUGIPILETEID, 95_000)),
  partii: Math.trunc(num(process.env.PARTII, 25_000)),
  paralleelsus: Math.trunc(num(process.env.PARALLEELSUS, 4)),
  mastaap: MASTAAP,
};

const SEEME = KONF.seeme;

// Ajaaken
const PAEV = 86_400_000;
const REG_ALGUS = Date.UTC(2023, 5, 1);    // platvorm avati juunis 2023
const AKEN_ALGUS = Date.UTC(2024, 0, 1);   // sõitude ajalugu algab 2024
const AKEN_LOPP = Date.UTC(2026, 8, 1);    // 1. september 2026
const REG_KESTUS = AKEN_LOPP - REG_ALGUS;
const PARGI_LOPP = Date.UTC(2026, 5, 1);   // viimane rollerite partii

const REG_ASTE = 0.78;   // kasutajate juurdekasvu kõverus
const PARK_ASTE = 0.85;  // pargi laienemise kõverus

// ---------------------------------------------------------------------------
//  CSV väljundi abifunktsioonid (PostgreSQL COPY ... FORMAT csv, NULL '')
// ---------------------------------------------------------------------------

/** Tekstiväli: alati jutumärkides, sisemised jutumärgid dubleeritud. */
export function t(s: string): string {
  return s.indexOf('"') === -1 ? '"' + s + '"' : '"' + s.replace(/"/g, '""') + '"';
}
/** NULL-lubav tekstiväli: tsiteerimata tühi väli = NULL. */
export function tn(s: string | null): string {
  return s === null ? '' : t(s);
}
/** Ajatempel ISO-8601 kujul (UTC). */
export function ts(ms: number): string {
  return new Date(ms).toISOString();
}
/** Kuupäev YYYY-MM-DD. */
export function d(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
//  Linnade jaotus
// ---------------------------------------------------------------------------

const LINNA_KAALUD = LINNAD.map((l) => l.kaal);

/** Rollerid jaotatakse linnade vahel kindlate id-vahemikega. */
function ehitaVahemikud(n: number): { algus: number; lopp: number; suurus: number }[] {
  const summa = LINNA_KAALUD.reduce((a, b) => a + b, 0);
  const res: { algus: number; lopp: number; suurus: number }[] = [];
  let kasutatud = 0;
  for (let i = 0; i < LINNAD.length; i++) {
    const algus = kasutatud + 1;
    const osa = i === LINNAD.length - 1
      ? Math.max(1, n - kasutatud)
      : Math.max(1, Math.round((LINNA_KAALUD[i]! / summa) * n));
    kasutatud = Math.min(n, kasutatud + osa);
    const lopp = Math.max(algus, kasutatud);
    res.push({ algus, lopp, suurus: lopp - algus + 1 });
  }
  return res;
}

const ROLLERI_VAHEMIKUD = ehitaVahemikud(KONF.rollereid);

function rolleriLinnaIndeks(id: number): number {
  for (let i = 0; i < ROLLERI_VAHEMIKUD.length; i++) {
    if (id <= ROLLERI_VAHEMIKUD[i]!.lopp) return i;
  }
  return ROLLERI_VAHEMIKUD.length - 1;
}

/** Rolleri kasutuselevõtu aeg: park laieneb linna sees id-järjekorras. */
export function rolleriKasutuselevottMs(id: number): number {
  const v = ROLLERI_VAHEMIKUD[rolleriLinnaIndeks(id)]!;
  const osa = (id - v.algus + 0.5) / v.suurus;
  return Math.round(REG_ALGUS + Math.pow(osa, PARK_ASTE) * (PARGI_LOPP - REG_ALGUS));
}

/** Mitu rollerit oli linnas hetkeks t juba kasutuses (vähemalt 1). */
function rollereidHetkel(linnIdx: number, t: number): number {
  const v = ROLLERI_VAHEMIKUD[linnIdx]!;
  const osa = Math.min(1, Math.max(0, (t - REG_ALGUS) / (PARGI_LOPP - REG_ALGUS)));
  return Math.max(1, Math.floor(Math.pow(osa, 1 / PARK_ASTE) * v.suurus));
}

/** Mitu kasutajat oli hetkeks t juba registreerunud (vähemalt 1). */
function kasutajaidHetkel(t: number): number {
  const osa = Math.min(1, Math.max(0, (t - REG_ALGUS - 12 * PAEV) / REG_KESTUS));
  return Math.max(1, Math.floor(Math.pow(osa, 1 / REG_ASTE) * KONF.kasutajaid));
}

// ---------------------------------------------------------------------------
//  kasutaja
// ---------------------------------------------------------------------------

export interface Kasutaja {
  id: number;
  linnIdx: number;
  pakettId: number;
  registreeritudMs: number;
  rida?: string;
}

/**
 * `lite = true` jätab stringide kokkupanemise vahele, kuid kasutab TÄPSELT
 * sama juhuarvude järjekorda — arvulised väljad on seega identsed.
 * Seda kasutab sõidugeneraator, mis vajab ainult kasutaja linna ja paketti.
 */
export function kasutaja(id: number, lite = false): Kasutaja {
  const r = rngFor(SEEME, SOOL.kasutaja, id);

  const naine = chance(r, 0.49);
  const eesnimi = naine ? pick(r, EESNIMED_N) : pick(r, EESNIMED_M);
  const perenimi = pick(r, PERENIMED);
  const linnIdx = weightedIndex(r, LINNA_KAALUD);
  const pakettIdx = weightedIndex(r, PAKETID.map((p) => p.kaal));

  // id järjestus = liitumisjärjekord; kasv on ajas kiirenev.
  const kasv = Math.pow((id - 0.5) / KONF.kasutajaid, REG_ASTE);
  const regMs = Math.min(
    AKEN_LOPP - PAEV,
    Math.round(REG_ALGUS + kasv * REG_KESTUS + r() * 12 * PAEV),
  );

  const vanus = Math.round(gauss(r, 31, 10.5, 16, 74));
  const synniMs = Date.UTC(2026 - vanus, int(r, 0, 11), int(r, 1, 28));

  const telefonNr = int(r, 1000000, 9999999);
  const majaNr = int(r, 1, 96);
  const tanavaIdx = Math.floor(r() * TANAVAD.length);
  const onKorter = chance(r, 0.72);
  const korter = int(r, 1, 84);
  const domeen = pick(r, EMAILI_DOMEENID);
  const onAktiivne = r() > 0.18;
  const viimatiMs = Math.round(regMs + Math.pow(r(), onAktiivne ? 0.35 : 1.8) * (AKEN_LOPP - regMs));

  const p = PAKETID[pakettIdx]!;
  const linn = LINNAD[linnIdx]!;

  if (lite) return { id, linnIdx, pakettId: p.id, registreeritudMs: regMs };

  const email = `${translit(eesnimi)}.${translit(perenimi)}${id}@${domeen}`;
  const aadress = `${TANAVAD[tanavaIdx]} ${majaNr}${onKorter ? '-' + korter : ''}, ${linn.nimi}`;

  const rida =
    `${id},${t(eesnimi)},${t(perenimi)},${t(email)},${t('+3725' + telefonNr)},${d(synniMs)},` +
    `${linn.id},${t(aadress)},${p.id},${ts(regMs)},${ts(viimatiMs)},${onAktiivne ? 'true' : 'false'}\n`;

  return { id, linnIdx, pakettId: p.id, registreeritudMs: regMs, rida };
}

export const KASUTAJA_VEERUD =
  'id, eesnimi, perenimi, email, telefon, synniaeg, linn_id, aadress, tariifipakett_id, registreeritud_at, viimati_aktiivne_at, on_aktiivne';

export function ridaKasutaja(id: number): string {
  return kasutaja(id).rida!;
}

// ---------------------------------------------------------------------------
//  roller
// ---------------------------------------------------------------------------

export const ROLLER_VEERUD =
  'id, seerianumber, rollerimudel_id, linn_id, kasutuselevott, laadimistsuklid, aku_tase_pct, labisoit_km, staatus';

export function ridaRoller(id: number): string {
  const r = rngFor(SEEME, SOOL.roller, id);
  const linnIdx = rolleriLinnaIndeks(id);
  const linn = LINNAD[linnIdx]!;
  const mudelId = 1 + weightedIndex(r, [0.2, 0.14, 0.16, 0.1, 0.12, 0.08, 0.12, 0.08]);

  const kasutuselevottMs = rolleriKasutuselevottMs(id);
  const vanusPaevi = Math.max(1, (AKEN_LOPP - kasutuselevottMs) / PAEV);

  // Kulumine on proportsionaalne vanusega: tsüklid -> läbisõit.
  const tsyklid = Math.round(vanusPaevi * (0.35 + r() * 0.9));
  const labisoit = +(tsyklid * (7 + r() * 9)).toFixed(2);
  const akuTase = int(r, 4, 100);
  const staatus = ROLLERI_STAATUSED[weightedIndex(r, ROLLERI_STAATUSE_KAALUD)]!;
  const seeria = `EE-${translit(linn.nimi).slice(0, 3).toUpperCase()}-${String(id).padStart(7, '0')}`;

  return `${id},${t(seeria)},${mudelId},${linn.id},${d(kasutuselevottMs)},${tsyklid},${akuTase},${labisoit},${t(staatus)}\n`;
}

// ---------------------------------------------------------------------------
//  soit  (suurim tabel)
// ---------------------------------------------------------------------------

/**
 * Sõitude ajaline jaotus: iga kalendrikuu saab kaalu
 *   hooajalisus (rollerihooaeg kevad-sügis) x platvormi kasv ajas.
 * id-d jagatakse kuude vahel kumulatiivse jaotuse järgi, nii et soit.id
 * kasvab koos ajaga (nagu pärisandmebaasis) ja BRIN-indeks töötab hästi.
 */
const KUU_JAOTUS = (() => {
  const kuud: { algus: number; lopp: number; kum: number }[] = [];
  let kum = 0;
  let aasta = new Date(AKEN_ALGUS).getUTCFullYear();
  let kuu = new Date(AKEN_ALGUS).getUTCMonth();
  const kaalud: number[] = [];
  const piirid: [number, number][] = [];
  while (Date.UTC(aasta, kuu, 1) < AKEN_LOPP) {
    const algus = Date.UTC(aasta, kuu, 1);
    const lopp = Math.min(AKEN_LOPP, Date.UTC(aasta, kuu + 1, 1));
    piirid.push([algus, lopp]);
    kaalud.push(KUU_KAALUD[kuu]!);
    kuu++;
    if (kuu > 11) { kuu = 0; aasta++; }
  }
  const n = kaalud.length;
  let summa = 0;
  for (let i = 0; i < n; i++) {
    kaalud[i] = kaalud[i]! * (0.55 + (1.15 * i) / Math.max(1, n - 1)); // kasv ajas
    summa += kaalud[i]!;
  }
  for (let i = 0; i < n; i++) {
    kum += kaalud[i]! / summa;
    kuud.push({ algus: piirid[i]![0], lopp: piirid[i]![1], kum });
  }
  return kuud;
})();

/** u in [0,1) -> ajatempel, mis järgib hooajalisust ja ööpäevast rütmi. */
function aegJaotusest(u: number, r: Rng): number {
  let lo = 0;
  let hi = KUU_JAOTUS.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (u <= KUU_JAOTUS[mid]!.kum) hi = mid; else lo = mid + 1;
  }
  const kuu = KUU_JAOTUS[lo]!;
  const eelmine = lo === 0 ? 0 : KUU_JAOTUS[lo - 1]!.kum;
  const osa = Math.min(0.999999, Math.max(0, (u - eelmine) / Math.max(1e-9, kuu.kum - eelmine)));
  const ms = kuu.algus + osa * (kuu.lopp - kuu.algus);
  const paev = Math.floor(ms / PAEV) * PAEV;
  const tund = weightedIndex(r, TUNNI_KAALUD);
  return Math.min(AKEN_LOPP - 1000, paev + tund * 3_600_000 + int(r, 0, 59) * 60_000 + int(r, 0, 59) * 1000);
}

export interface Soit {
  id: number;
  kasutajaId: number;
  rollerId: number;
  staatusId: number;
  pakettId: number;
  linnId: number;
  algusMs: number;
  loppMs: number;
  kestusSek: number;
  distantsM: number;
  hindSenti: number;
  r: Rng;
}

const KRAAD_M = 111_320;

export function soit(id: number): Soit {
  const r = rngFor(SEEME, SOOL.soit, id);

  // 1) Millal sõit toimus (monotoonne id suhtes + hooajalisus).
  const algusMs = aegJaotusest((id - 1 + r()) / KONF.soite, r);

  // 2) Kes sõitis: ainult selleks hetkeks registreerunud kasutajad.
  //    Nihkega valik -> varasemad, lojaalsemad kasutajad sõidavad sagedamini.
  const saadavalKasutajaid = kasutajaidHetkel(algusMs);
  const kasutajaId = 1 + Math.floor(Math.pow(r(), 1.4) * saadavalKasutajaid);
  const k = kasutaja(kasutajaId, true);

  // 3) Millega sõitis: roller kasutaja koduliinast, juba kasutusele võetud.
  const v = ROLLERI_VAHEMIKUD[k.linnIdx]!;
  const saadaval = rollereidHetkel(k.linnIdx, algusMs);
  const rollerId = v.algus + int(r, 0, Math.min(v.suurus, saadaval) - 1);

  const staatusId = 1 + weightedIndex(r, SOIDUSTAATUSE_KAALUD);

  let kestusSek: number;
  if (staatusId === 3) kestusSek = int(r, 5, 55);                                   // tühistatud
  else if (staatusId === 4) kestusSek = int(r, 20, 240);                            // tehniline viga
  else if (staatusId === 2) kestusSek = Math.round(lognorm(r, 5.2, 0.6, 60, 1800)); // katkestatud
  else kestusSek = Math.round(lognorm(r, 6.32, 0.58, 90, 7200));                    // lõpetatud

  const kiirusMs = staatusId === 3 ? 0 : 2.6 + r() * 3.2;                           // ~9-21 km/h
  const distantsM = Math.round(kestusSek * kiirusMs * (0.82 + r() * 0.2));

  const pakett = PAKETID[k.pakettId - 1]!;
  const hindSenti =
    staatusId === 3 || staatusId === 4
      ? 0
      : pakett.avamistasu + Math.ceil(kestusSek / 60) * pakett.minutihind;

  return {
    id, kasutajaId, rollerId, staatusId, pakettId: k.pakettId,
    linnId: LINNAD[k.linnIdx]!.id,
    algusMs, loppMs: algusMs + kestusSek * 1000,
    kestusSek, distantsM, hindSenti, r,
  };
}

export const SOIT_VEERUD =
  'id, kasutaja_id, roller_id, soidustaatus_id, tariifipakett_id, linn_id, algus_at, lopp_at, ' +
  'kestus_sek, distants_m, algus_lat, algus_lon, lopp_lat, lopp_lon, avamistasu_senti, minutihind_senti, hind_senti';

export function ridaSoit(id: number): string {
  const s = soit(id);
  const r = s.r;
  const linn = LINNAD[s.linnId - 1]!;
  const pakett = PAKETID[s.pakettId - 1]!;

  const latR = linn.raadius;
  const lonR = linn.raadius * 1.9; // pikkuskraad on Eesti laiuskraadil ~2x lühem
  const algusLat = gauss(r, linn.lat, latR / 2.6, linn.lat - latR, linn.lat + latR);
  const algusLon = gauss(r, linn.lon, lonR / 2.6, linn.lon - lonR, linn.lon + lonR);

  // Lõpp-punkt: linnulennuline nihe ~70% läbitud teepikkusest, juhuslik suund.
  const suund = r() * 2 * Math.PI;
  const nihe = s.distantsM * 0.7;
  const dLat = (nihe * Math.cos(suund)) / KRAAD_M;
  const dLon = (nihe * Math.sin(suund)) / (KRAAD_M * Math.cos((linn.lat * Math.PI) / 180));
  const loppLat = Math.min(linn.lat + latR, Math.max(linn.lat - latR, algusLat + dLat));
  const loppLon = Math.min(linn.lon + lonR, Math.max(linn.lon - lonR, algusLon + dLon));

  return (
    `${s.id},${s.kasutajaId},${s.rollerId},${s.staatusId},${s.pakettId},${s.linnId},` +
    `${ts(s.algusMs)},${ts(s.loppMs)},${s.kestusSek},${s.distantsM},` +
    `${algusLat.toFixed(6)},${algusLon.toFixed(6)},${loppLat.toFixed(6)},${loppLon.toFixed(6)},` +
    `${s.hindSenti === 0 ? 0 : pakett.avamistasu},${pakett.minutihind},${s.hindSenti}\n`
  );
}

// ---------------------------------------------------------------------------
//  makse  (tuletatud sõidust; 1:1 seos, makse.id = soit_id)
// ---------------------------------------------------------------------------

export const MAKSE_VEERUD =
  'id, soit_id, kasutaja_id, maksemeetod_id, summa_senti, kaibemaks_senti, valuuta, staatus, tehingu_viide, makstud_at';

const KM_MAAR = 1.24; // Eesti käibemaks 24%

export function ridaMakse(soitId: number): string | null {
  const s = soit(soitId);
  if (s.hindSenti <= 0) return null; // tühistatud ja vigased sõidud ei genereeri makset

  const r = rngFor(SEEME, SOOL.makse, soitId);
  const meetodId = 1 + weightedIndex(r, MAKSEMEETODI_KAALUD);
  const staatus = r() < 0.975 ? 'onnestus' : r() < 0.7 ? 'tagasimakse' : 'ebaonnestus';
  const kaibemaks = Math.round(s.hindSenti - s.hindSenti / KM_MAAR);
  const makstudMs = s.loppMs + int(r, 1, 120) * 1000;
  const viide = `TX${new Date(s.algusMs).getUTCFullYear()}-${soitId.toString(36).toUpperCase().padStart(6, '0')}`;

  return (
    `${soitId},${soitId},${s.kasutajaId},${meetodId},${s.hindSenti},${kaibemaks},` +
    `"EUR",${t(staatus)},${t(viide)},${ts(makstudMs)}\n`
  );
}

// ---------------------------------------------------------------------------
//  hinnang  (osa lõpetatud sõitudest; hinnang.id = soit_id)
// ---------------------------------------------------------------------------

export const HINNANG_VEERUD = 'id, soit_id, kasutaja_id, tahed, kommentaar, loodud_at';

export function ridaHinnang(soitId: number): string | null {
  const s = soit(soitId);
  if (s.staatusId !== 1) return null;

  const r = rngFor(SEEME, SOOL.hinnang, soitId);
  if (r() >= 0.24) return null; // ~24% lõpetatud sõitudest saab hinnangu

  // Hinded on kaldu positiivse poole, nagu päris platvormidel.
  const tahed = 1 + weightedIndex(r, [0.04, 0.05, 0.11, 0.26, 0.54]);
  const kommentaar = r() < 0.38 ? pick(r, HINNANGU_KOMMENTAARID) : null;
  const loodudMs = s.loppMs + int(r, 30, 172_800) * 1000;

  return `${soitId},${soitId},${s.kasutajaId},${tahed},${tn(kommentaar)},${ts(loodudMs)}\n`;
}

// ---------------------------------------------------------------------------
//  hooldus
// ---------------------------------------------------------------------------

export const HOOLDUS_VEERUD = 'id, roller_id, hooldustuup_id, tehnik, algus_at, lopp_at, maksumus_senti, markused';

export function ridaHooldus(id: number): string {
  const r = rngFor(SEEME, SOOL.hooldus, id);
  const rollerId = int(r, 1, KONF.rollereid);
  const tuupId = 1 + weightedIndex(r, HOOLDUSTUUBI_KAALUD);
  const tehnik = `${pick(r, chance(r, 0.25) ? EESNIMED_N : EESNIMED_M)} ${pick(r, PERENIMED)}`;

  // Hooldus saab toimuda alles pärast rolleri kasutuselevõttu.
  const alatesMs = Math.max(AKEN_ALGUS, rolleriKasutuselevottMs(rollerId) + 14 * PAEV);
  const algusMs = alatesMs + Math.floor(r() * Math.max(PAEV, AKEN_LOPP - alatesMs));
  const kestusMin = Math.round(lognorm(r, 3.6, 0.7, 10, 1440));
  const maksumus = tuupId === 1 ? int(r, 4000, 18000) : tuupId === 4 ? int(r, 0, 900) : int(r, 300, 7000);
  const markused = r() < 0.72 ? pick(r, HOOLDUSE_MARKUSED) : null;

  return (
    `${id},${rollerId},${tuupId},${t(tehnik)},${ts(algusMs)},${ts(algusMs + kestusMin * 60_000)},` +
    `${maksumus},${tn(markused)}\n`
  );
}

// ---------------------------------------------------------------------------
//  tugipilet
// ---------------------------------------------------------------------------

export const TUGIPILET_VEERUD =
  'id, kasutaja_id, soit_id, tugiteema_id, staatus, prioriteet, sisu, avatud_at, suletud_at';

export function ridaTugipilet(id: number): string {
  const r = rngFor(SEEME, SOOL.tugipilet, id);
  const seotud = chance(r, 0.62);

  let kasutajaId: number;
  let soitId: number | null = null;
  let baasMs: number;

  if (seotud) {
    // Pöördumine konkreetse sõidu kohta: kasutaja on selle sõidu tegija.
    soitId = 1 + Math.floor(Math.pow(r(), 0.9) * KONF.soite);
    const s = soit(soitId);
    kasutajaId = s.kasutajaId;
    baasMs = s.loppMs + int(r, 60, 259_200) * 1000;
  } else {
    kasutajaId = 1 + Math.floor(Math.pow(r(), 1.6) * KONF.kasutajaid);
    const k = kasutaja(kasutajaId, true);
    baasMs = k.registreeritudMs + Math.floor(r() * Math.max(PAEV, AKEN_LOPP - k.registreeritudMs));
  }

  const teemaId = 1 + weightedIndex(r, TUGITEEMA_KAALUD);
  const staatus = TUGIPILETI_STAATUSED[weightedIndex(r, TUGIPILETI_STAATUSE_KAALUD)]!;
  const prioriteet = 1 + weightedIndex(r, [0.34, 0.38, 0.21, 0.07]);
  const sisu = pick(r, TUGIPILETI_SISU);
  const avatudMs = Math.min(baasMs, AKEN_LOPP);
  const suletudMs =
    staatus === 'lahendatud' || staatus === 'suletud' ? avatudMs + int(r, 900, 1_209_600) * 1000 : null;

  return (
    `${id},${kasutajaId},${soitId === null ? '' : soitId},${teemaId},${t(staatus)},${prioriteet},` +
    `${t(sisu)},${ts(avatudMs)},${suletudMs === null ? '' : ts(suletudMs)}\n`
  );
}
