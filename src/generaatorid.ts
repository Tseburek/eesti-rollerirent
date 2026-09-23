/**
 * Ridade generaatorid.
 *
 * Iga rida on lõppkokkuvõttes PUHAS funktsioon kujul f(SEEME, tabel, id).
 * See tagab reprodutseeritavuse (sama seeme -> bait-baidilt sama andmebaas)
 * ja paralleelsuse (id-vahemikud saab jagada tööliste vahel ilma jagatud
 * olekuta).
 *
 * TÄHTIS ARHITEKTUURNE VALIK — rollerikeskne ajakava:
 *   `soit` ja `hooldus` EI VALI enam rolleri sündmuse aega täiesti sõltumatult
 *   (nagu varasemas versioonis), sest see lubab kahel sõidul või sõidul ja
 *   hooldusel sama rolleri peal ajaliselt kattuda — reaalses maailmas on üks
 *   roller korraga kas parkinud, sõidus või hoolduses, mitte kunagi kahes
 *   kohas korraga.
 *
 *   Selle asemel arvutatakse iga rolleri jaoks DETERMINISTLIK, MITTEKATTUV
 *   sündmuste ajajoon (vt `rolleriAjakava`): sõidud ja hooldused samal
 *   rolleril järgnevad üksteisele rangelt, iga järgmine sündmus algab alles
 *   pärast eelmise lõppu (+ juhuslik "parkimis"-paus). Nii on kattuvus
 *   struktuurselt võimatu, mitte ainult statistiliselt harv.
 *
 *   soit.id / hooldus.id -> (rollerId, N-s sündmus sellel rollleril) teisendus
 *   käib eelarvutatud kumulatiivsete summade peal (binaarotsing), sarnaselt
 *   sellele, kuidas rollerid on juba praegu linnade vahel id-vahemikega
 *   jaotatud.
 *
 * KASUTAJA "VIIMATI AKTIIVNE" TERVIKLUS:
 *   kasutaja.viimati_aktiivne_at genereeritakse siin sõltumatult (nagu varem),
 *   kuid seemneskript (seed.ts) PARANDAB selle pärast `soit` ja `tugipilet`
 *   täitmist üles-suunas ühe SQL UPDATE-lausega:
 *     viimati_aktiivne_at = GREATEST(algne väärtus, tegelik viimane sõit/pilet)
 *   See on lihtsam ja töökindlam kui üritada genereerimisel ette näha, kas
 *   juhuslikult valitud sõiduaeg jääb juhuslikult valitud "viimati aktiivne"
 *   akna sisse — tulemus on siiski 100% deterministlik ja korratav, sest
 *   UPDATE-lause ise on deterministlik funktsioon juba genereeritud andmetest.
 */

import {
  EESNIMED_M, EESNIMED_N, PERENIMED, TANAVAD, LINNAD, EMAILI_DOMEENID, PAKETID,
  ROLLERI_STAATUSED, ROLLERI_STAATUSE_KAALUD, SOIDUSTAATUSE_KAALUD, MAKSEMEETODI_KAALUD,
  HOOLDUSTUUBI_KAALUD, TUGITEEMA_KAALUD, TUNNI_KAALUD,
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

export function t(s: string): string {
  return s.indexOf('"') === -1 ? '"' + s + '"' : '"' + s.replace(/"/g, '""') + '"';
}
export function tn(s: string | null): string {
  return s === null ? '' : t(s);
}
export function ts(ms: number): string {
  return new Date(ms).toISOString();
}
export function d(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
//  Prefikssummad + binaarotsing (kasutusel nii linnade-rollerite kui ka
//  rollerite-sündmuste id-vahemike jaoks)
// ---------------------------------------------------------------------------

/** out[i] = sum(arr[0..i-1]); out.length = arr.length + 1. */
function prefiksSummad(arr: ArrayLike<number>): Float64Array {
  const out = new Float64Array(arr.length + 1);
  for (let i = 0; i < arr.length; i++) out[i + 1] = out[i]! + arr[i]!;
  return out;
}

/** Leiab 0-indekseeritud kandja indeksi ja kandjasisese 0-indekseeritud järjenumbri 1-indekseeritud globaalse id jaoks. */
function otsiKandja(offset: Float64Array, id: number): { indeks: number; kohalik: number } {
  let lo = 0;
  let hi = offset.length - 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offset[mid + 1]! < id) lo = mid + 1; else hi = mid;
  }
  return { indeks: lo, kohalik: id - offset[lo]! - 1 };
}

/** Largest-remainder jaotus: tagastab täisarvude massiivi, mille summa on täpselt `kogusumma`. */
function jaotaKogus(kaalud: ArrayLike<number>, kogusumma: number): Int32Array {
  const n = kaalud.length;
  const summa = Array.from(kaalud).reduce((a, b) => a + b, 0) || 1;
  const toore = new Array<number>(n);
  const pohi = new Int32Array(n);
  let jaotatud = 0;
  for (let i = 0; i < n; i++) {
    const v = (kaalud[i]! / summa) * kogusumma;
    toore[i] = v;
    pohi[i] = Math.floor(v);
    jaotatud += pohi[i]!;
  }
  let puudu = kogusumma - jaotatud;
  const jarjekord = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (toore[b]! - pohi[b]!) - (toore[a]! - pohi[a]!),
  );
  for (let i = 0; i < puudu; i++) pohi[jarjekord[i % n]!]!++;
  return pohi;
}

// ---------------------------------------------------------------------------
//  Linnad <-> rollerid
// ---------------------------------------------------------------------------

const LINNA_KAALUD = LINNAD.map((l) => l.kaal);
const ROLLERI_LINNA_ARV = jaotaKogus(LINNA_KAALUD, KONF.rollereid);
const ROLLERI_LINNA_OFFSET = prefiksSummad(ROLLERI_LINNA_ARV);

function rolleriLinnaIndeks(rollerId: number): number {
  return otsiKandja(ROLLERI_LINNA_OFFSET, rollerId).indeks;
}

/** Rolleri kasutuselevõtu aeg: park laieneb linna sees id-järjekorras. */
export function rolleriKasutuselevottMs(rollerId: number): number {
  const linnIdx = rolleriLinnaIndeks(rollerId);
  const suurus = ROLLERI_LINNA_ARV[linnIdx]!;
  const kohalik = rollerId - ROLLERI_LINNA_OFFSET[linnIdx]! - 1;
  const osa = (kohalik + 0.5) / suurus;
  return Math.round(REG_ALGUS + Math.pow(osa, PARK_ASTE) * (PARGI_LOPP - REG_ALGUS));
}

// ---------------------------------------------------------------------------
//  Kasutajad linnade kaupa, registreerimisaja järgi sorteeritult
//  (võimaldab O(log n) päringut: "mitu <linna X> kasutajat on hetkeks t
//   registreerunud", mida kasutab sõidu kasutaja valik).
// ---------------------------------------------------------------------------

interface KasutajaViide { id: number; regMs: number }

const KASUTAJAD_LINNAS: KasutajaViide[][] = (() => {
  const ämbrid: KasutajaViide[][] = LINNAD.map(() => []);
  for (let id = 1; id <= KONF.kasutajaid; id++) {
    const k = kasutajaKergelt(id);
    ämbrid[k.linnIdx]!.push({ id, regMs: k.registreeritudMs });
  }
  for (const a of ämbrid) a.sort((x, y) => x.regMs - y.regMs);
  return ämbrid;
})();

/** Mitu <linnIdx> kasutajat on registreerunud hetkeks t (binaarotsing, sorditud massiivil). */
function kasutajaidLinnasHetkel(linnIdx: number, t: number): number {
  const arr = KASUTAJAD_LINNAS[linnIdx]!;
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.regMs <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
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

/** Kerge versioon: ainult need väljad, mida sõidu/hoolduse loogika vajab. */
function kasutajaKergelt(id: number): Kasutaja {
  const r = rngFor(SEEME, SOOL.kasutaja, id);
  void chance(r, 0.49);           // naine (mõjutab ainult nime, mida siin ei arvutata)
  void pick(r, EESNIMED_N);       // (sama juhuarvude järjekord mis täisversioonis)
  void pick(r, EESNIMED_M);
  const linnIdx = weightedIndex(r, LINNA_KAALUD);
  const pakettIdx = weightedIndex(r, PAKETID.map((p) => p.kaal));

  const kasv = Math.pow((id - 0.5) / KONF.kasutajaid, REG_ASTE);
  const regMs = Math.min(
    AKEN_LOPP - PAEV,
    Math.round(REG_ALGUS + kasv * REG_KESTUS + r() * 12 * PAEV),
  );

  return { id, linnIdx, pakettId: PAKETID[pakettIdx]!.id, registreeritudMs: regMs };
}

export function kasutaja(id: number, lite = false): Kasutaja {
  if (lite) return kasutajaKergelt(id);

  const r = rngFor(SEEME, SOOL.kasutaja, id);
  const naine = chance(r, 0.49);
  const eesnimi = naine ? pick(r, EESNIMED_N) : pick(r, EESNIMED_M);
  const perenimi = pick(r, PERENIMED);
  const linnIdx = weightedIndex(r, LINNA_KAALUD);
  const pakettIdx = weightedIndex(r, PAKETID.map((p) => p.kaal));

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

/** Rolleri "populaarsus" — individuaalne kasutussageduse kordaja (0,2 .. ~4). */
function rolleriPopulaarsus(rollerId: number): number {
  const r = rngFor(SEEME, SOOL.rolleriPopulaarsus, rollerId);
  return lognorm(r, 0, 0.45, 0.2, 4);
}

/** Rolleri kasutuskoormuse kaal = vanus (päevades) x populaarsus. Kasutatakse sõitude/hoolduste jaotamiseks. */
const ROLLERI_KAALUD = (() => {
  const arr = new Float64Array(KONF.rollereid);
  for (let id = 1; id <= KONF.rollereid; id++) {
    const vanusPaevi = Math.max(1, (AKEN_LOPP - rolleriKasutuselevottMs(id)) / PAEV);
    arr[id - 1] = vanusPaevi * rolleriPopulaarsus(id);
  }
  return arr;
})();

export const ROLLER_VEERUD =
  'id, seerianumber, rollerimudel_id, linn_id, kasutuselevott, laadimistsuklid, aku_tase_pct, labisoit_km, staatus';

export function ridaRoller(id: number): string {
  const r = rngFor(SEEME, SOOL.roller, id);
  const linnIdx = rolleriLinnaIndeks(id);
  const linn = LINNAD[linnIdx]!;
  const mudelId = 1 + weightedIndex(r, [0.2, 0.14, 0.16, 0.1, 0.12, 0.08, 0.12, 0.08]);

  const kasutuselevottMs = rolleriKasutuselevottMs(id);
  const vanusPaevi = Math.max(1, (AKEN_LOPP - kasutuselevottMs) / PAEV);

  const tsyklid = Math.round(vanusPaevi * (0.35 + r() * 0.9));
  const labisoit = +(tsyklid * (7 + r() * 9)).toFixed(2);
  const akuTase = int(r, 4, 100);
  const staatus = ROLLERI_STAATUSED[weightedIndex(r, ROLLERI_STAATUSE_KAALUD)]!;
  const seeria = `EE-${translit(linn.nimi).slice(0, 3).toUpperCase()}-${String(id).padStart(7, '0')}`;

  return `${id},${t(seeria)},${mudelId},${linn.id},${d(kasutuselevottMs)},${tsyklid},${akuTase},${labisoit},${t(staatus)}\n`;
}

// ---------------------------------------------------------------------------
//  Rolleri MITTEKATTUV sündmuste ajakava (sõidud + hooldused läbisegi,
//  rangelt järjestikku). See on kogu ajalise tervikluse fikseerimise tuum.
// ---------------------------------------------------------------------------

const SOIDU_ARV_ROLLERIL = jaotaKogus(ROLLERI_KAALUD, KONF.soite);
const HOOLDUSE_ARV_ROLLERIL = jaotaKogus(ROLLERI_KAALUD, KONF.hooldusi);
const SOIDU_OFFSET = prefiksSummad(SOIDU_ARV_ROLLERIL);
const HOOLDUSE_OFFSET = prefiksSummad(HOOLDUSE_ARV_ROLLERIL);

interface AjakavaSamm {
  algusMs: number;
  loppMs: number;
  staatusId?: number;   // ainult 'soit'
  kestusSek?: number;   // ainult 'soit'
}

/**
 * Arvutab rolleri `rollerId` sündmuste (sõit + hooldus, läbisegi) ajakava
 * sammu, mille tüüp on `sihtTyyp` ja mis on selle tüübi järjekorras
 * `sihtIndeks`-es (0-indekseeritud). Simuleerib ajakava algusest peale —
 * iga samm algab alles eelmise lõpust + juhuslik paus, mistõttu kattuvus
 * on struktuurselt võimatu.
 *
 * Kulukus: O(sihtIndeks) — rolleril on keskmiselt ~43 sõitu + ~4 hooldust,
 * seega tegelik kulu on väike isegi kõige koormatumate rollerite puhul.
 */
function rolleriAjakava(rollerId: number, sihtTyyp: 'soit' | 'hooldus', sihtIndeks: number): AjakavaSamm {
  const soiduArv = SOIDU_ARV_ROLLERIL[rollerId - 1]!;
  const hoolduseArv = HOOLDUSE_ARV_ROLLERIL[rollerId - 1]!;
  const n = soiduArv + hoolduseArv;

  const windowStart = rolleriKasutuselevottMs(rollerId);
  const windowEnd = AKEN_LOPP;

  let prevEnd = windowStart;
  let soiteNahtud = 0;
  let hooldusiNahtud = 0;

  for (let j = 0; j < n; j++) {
    // Bresenham-laadne ühtlane läbipõimimine: täpselt `hoolduseArv` hooldust
    // n sammu seas, ühtlaselt jaotatuna (mitte klompides).
    const onHooldus = Math.floor(((j + 1) * hoolduseArv) / n) > Math.floor((j * hoolduseArv) / n);
    const tyyp: 'soit' | 'hooldus' = onHooldus ? 'hooldus' : 'soit';
    const kohalikIdx = onHooldus ? hooldusiNahtud : soiteNahtud;

    const r = rngFor(SEEME, tyyp === 'hooldus' ? SOOL.hooldus : SOOL.soit, rollerId * 1_000_003 + j);

    // Ideaalne (soovituslik) aeg: ühtlaselt jaotatud rolleri kasutusea peale,
    // päevasisese tipptunni-kaaluga.
    const frac = (j + 0.5) / n;
    const idealPaev = Math.floor((windowStart + frac * (windowEnd - windowStart)) / PAEV) * PAEV;
    const tund = weightedIndex(r, TUNNI_KAALUD);
    const idealMs = idealPaev + tund * 3_600_000 + int(r, 0, 59) * 60_000 + int(r, 0, 59) * 1000;

    // Minimaalne "parkimis"-paus eelmise sündmuse lõpust (1 min .. 3 h).
    const pausMs = int(r, 60_000, 10_800_000);
    const algusMs = Math.max(idealMs, prevEnd + pausMs);

    let staatusId: number | undefined;
    let kestusSek: number | undefined;
    let kestusMs: number;

    if (tyyp === 'soit') {
      staatusId = 1 + weightedIndex(r, SOIDUSTAATUSE_KAALUD);
      if (staatusId === 3) kestusSek = int(r, 5, 55);
      else if (staatusId === 4) kestusSek = int(r, 20, 240);
      else if (staatusId === 2) kestusSek = Math.round(lognorm(r, 5.2, 0.6, 60, 1800));
      else kestusSek = Math.round(lognorm(r, 6.32, 0.58, 90, 7200));
      kestusMs = kestusSek * 1000;
    } else {
      const kestusMin = Math.round(lognorm(r, 3.6, 0.7, 10, 1440));
      kestusMs = kestusMin * 60_000;
    }

    const loppMs = algusMs + kestusMs;
    prevEnd = loppMs;

    if (tyyp === sihtTyyp && kohalikIdx === sihtIndeks) {
      return { algusMs, loppMs, staatusId, kestusSek };
    }
    if (onHooldus) hooldusiNahtud++; else soiteNahtud++;
  }

  throw new Error(`rolleriAjakava: sihtIndeks ${sihtIndeks} (${sihtTyyp}) rollerile ${rollerId} ei leitud (n=${n})`);
}

// ---------------------------------------------------------------------------
//  soit  (suurim tabel)
// ---------------------------------------------------------------------------

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
}

const KRAAD_M = 111_320;

export function soit(id: number): Soit {
  const { indeks: rollerIdx, kohalik: k } = otsiKandja(SOIDU_OFFSET, id);
  const rollerId = rollerIdx + 1;
  const linnIdx = rolleriLinnaIndeks(rollerId);

  const samm = rolleriAjakava(rollerId, 'soit', k);
  const staatusId = samm.staatusId!;
  const kestusSek = samm.kestusSek!;

  // Kasutaja: sama linna, juba registreerunud, lojaalsuse-kaldega valik.
  // Lahutatud ajakava-loogikast oma RNG-ga, ei mõjuta sündmuste ajastust.
  const rLisa = rngFor(SEEME, SOOL.soiduLisaandmed, id);
  const saadaval = Math.max(1, kasutajaidLinnasHetkel(linnIdx, samm.algusMs));
  const kohalikuIdx = Math.min(saadaval - 1, Math.floor(Math.pow(rLisa(), 1.4) * saadaval));
  const kasutajaId = KASUTAJAD_LINNAS[linnIdx]![kohalikuIdx]!.id;
  const kUser = kasutajaKergelt(kasutajaId);

  const kiirusMs = staatusId === 3 ? 0 : 2.6 + rLisa() * 3.2; // ~9-21 km/h
  const distantsM = Math.round(kestusSek * kiirusMs * (0.82 + rLisa() * 0.2));

  const pakett = PAKETID[kUser.pakettId - 1]!;
  const hindSenti =
    staatusId === 3 || staatusId === 4
      ? 0
      : pakett.avamistasu + Math.ceil(kestusSek / 60) * pakett.minutihind;

  return {
    id, kasutajaId, rollerId, staatusId, pakettId: kUser.pakettId,
    linnId: LINNAD[linnIdx]!.id,
    algusMs: samm.algusMs, loppMs: samm.loppMs,
    kestusSek, distantsM, hindSenti,
  };
}

export const SOIT_VEERUD =
  'id, kasutaja_id, roller_id, soidustaatus_id, tariifipakett_id, linn_id, algus_at, lopp_at, ' +
  'kestus_sek, distants_m, algus_lat, algus_lon, lopp_lat, lopp_lon, avamistasu_senti, minutihind_senti, hind_senti';

/** Ehitab `soit`-rea juba arvutatud Soit-objektist (ei arvuta ajakava uuesti). */
function soiduRidaAndmetest(s: Soit): string {
  const id = s.id;
  const r = rngFor(SEEME, SOOL.soiduLisaandmed, id * 7 + 3); // koordinaadid: eraldi, taasesitatav voog
  const linn = LINNAD[s.linnId - 1]!;
  const pakett = PAKETID[s.pakettId - 1]!;

  const latR = linn.raadius;
  const lonR = linn.raadius * 1.9;
  const algusLat = gauss(r, linn.lat, latR / 2.6, linn.lat - latR, linn.lat + latR);
  const algusLon = gauss(r, linn.lon, lonR / 2.6, linn.lon - lonR, linn.lon + lonR);

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

export function ridaSoit(id: number): string {
  return soiduRidaAndmetest(soit(id));
}

// ---------------------------------------------------------------------------
//  makse  (tuletatud sõidust; 1:1 seos, makse.id = soit_id)
// ---------------------------------------------------------------------------

export const MAKSE_VEERUD =
  'id, soit_id, kasutaja_id, maksemeetod_id, summa_senti, kaibemaks_senti, valuuta, staatus, tehingu_viide, makstud_at';

const KM_MAAR = 1.24; // Eesti käibemaks 24%

function makseRidaAndmetest(s: Soit): string | null {
  const soitId = s.id;
  if (s.hindSenti <= 0) return null;

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

export function ridaMakse(soitId: number): string | null {
  return makseRidaAndmetest(soit(soitId));
}

// ---------------------------------------------------------------------------
//  hinnang  (osa lõpetatud sõitudest; hinnang.id = soit_id)
// ---------------------------------------------------------------------------

export const HINNANG_VEERUD = 'id, soit_id, kasutaja_id, tahed, kommentaar, loodud_at';

function hinnangRidaAndmetest(s: Soit): string | null {
  const soitId = s.id;
  if (s.staatusId !== 1) return null;

  const r = rngFor(SEEME, SOOL.hinnang, soitId);
  if (r() >= 0.24) return null;

  const tahed = 1 + weightedIndex(r, [0.04, 0.05, 0.11, 0.26, 0.54]);
  const kommentaar = r() < 0.38 ? pick(r, HINNANGU_KOMMENTAARID) : null;
  const loodudMs = s.loppMs + int(r, 30, 172_800) * 1000;

  return `${soitId},${soitId},${s.kasutajaId},${tahed},${tn(kommentaar)},${ts(loodudMs)}\n`;
}

export function ridaHinnang(soitId: number): string | null {
  return hinnangRidaAndmetest(soit(soitId));
}

/**
 * Ühe läbimisega variant: arvutab `soit(id)` KORD ja tuletab sellest kõik
 * kolm rida (soit + valikuline makse + valikuline hinnang) ilma rolleri
 * ajakava uuesti arvutamata. Kasutab seed.ts kombineeritud täitmisetapp,
 * et vältida sama rolleri ajakava kolmekordset taasarvutust.
 */
export function komplektSoit(id: number): { soit: string; makse: string | null; hinnang: string | null } {
  const s = soit(id);
  return {
    soit: soiduRidaAndmetest(s),
    makse: makseRidaAndmetest(s),
    hinnang: hinnangRidaAndmetest(s),
  };
}

// ---------------------------------------------------------------------------
//  hooldus
// ---------------------------------------------------------------------------

export const HOOLDUS_VEERUD = 'id, roller_id, hooldustuup_id, tehnik, algus_at, lopp_at, maksumus_senti, markused';

export function ridaHooldus(id: number): string {
  const { indeks: rollerIdx, kohalik: m } = otsiKandja(HOOLDUSE_OFFSET, id);
  const rollerId = rollerIdx + 1;
  const samm = rolleriAjakava(rollerId, 'hooldus', m);

  const r = rngFor(SEEME, SOOL.hoolduseLisaandmed, id);
  const tuupId = 1 + weightedIndex(r, HOOLDUSTUUBI_KAALUD);
  const tehnik = `${pick(r, chance(r, 0.25) ? EESNIMED_N : EESNIMED_M)} ${pick(r, PERENIMED)}`;
  const maksumus = tuupId === 1 ? int(r, 4000, 18000) : tuupId === 4 ? int(r, 0, 900) : int(r, 300, 7000);
  const markused = r() < 0.72 ? pick(r, HOOLDUSE_MARKUSED) : null;

  return (
    `${id},${rollerId},${tuupId},${t(tehnik)},${ts(samm.algusMs)},${ts(samm.loppMs)},` +
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
