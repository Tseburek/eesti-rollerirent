/**
 * Determinstlik pseudojuhuslikkus.
 *
 * Kogu andmestik on puhas funktsioon kujul  f(seeme, tabel, id) -> rida.
 * See tähendab, et
 *   - sama SEEME annab alati baidilt sama andmebaasi (reprodutseeritavus),
 *   - ridu võib genereerida suvalises järjekorras ja paralleelselt, sest ükski
 *     rida ei sõltu eelmisest (globaalset loendurit ega jagatud olekut pole).
 *
 * Algoritm: splitmix32 — kiire, hea hajuvusega 32-bitine segisti.
 */

export type Rng = () => number;

/** splitmix32 generaator antud algolekust. */
export function splitmix32(alge: number): Rng {
  let a = alge | 0;
  return function () {
    a = (a + 0x9e3779b9) | 0;
    let t = a ^ (a >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t = t ^ (t >>> 15);
    t = Math.imul(t, 0x735a2d97);
    t = t ^ (t >>> 15);
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Generaator konkreetse tabeli (sool) konkreetse rea (id) jaoks.
 * Sool eristab tabeleid, et kasutaja #5 ja roller #5 ei saaks samu väärtusi.
 */
export function rngFor(seeme: number, sool: number, id: number): Rng {
  let h = (seeme ^ Math.imul(sool, 0x9e3779b1) ^ Math.imul(id, 0x85ebca6b)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  const r = splitmix32(h);
  r(); // soojendus, et naaberid-d ei annaks korreleeruvaid esimesi väärtusi
  return r;
}

/** Soolad tabelite kaupa. */
export const SOOL = {
  kasutaja: 101,
  roller: 211,
  soit: 331,
  makse: 449,
  hinnang: 577,
  hooldus: 691,
  tugipilet: 811,
} as const;

/** Täisarv vahemikus [min, max] (kaasa arvatud). */
export function int(r: Rng, min: number, max: number): number {
  return min + Math.floor(r() * (max - min + 1));
}

/** Tõenäosusega p tõene. */
export function chance(r: Rng, p: number): boolean {
  return r() < p;
}

/** Juhuslik element massiivist. */
export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length)]!;
}

/** Kaalutud valik: tagastab indeksi. Kaalud ei pea summeeruma üheni. */
export function weightedIndex(r: Rng, kaalud: readonly number[]): number {
  let summa = 0;
  for (const k of kaalud) summa += k;
  let x = r() * summa;
  for (let i = 0; i < kaalud.length; i++) {
    x -= kaalud[i]!;
    if (x <= 0) return i;
  }
  return kaalud.length - 1;
}

/** Normaaljaotus (Box-Muller), lõigatud vahemikku [min, max]. */
export function gauss(r: Rng, keskmine: number, hajuvus: number, min: number, max: number): number {
  const u1 = Math.max(r(), 1e-12);
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, keskmine + z * hajuvus));
}

/** Lognormaaljaotus — sobib kestuste ja summade jaoks (pikk parem saba). */
export function lognorm(r: Rng, mu: number, sigma: number, min: number, max: number): number {
  const u1 = Math.max(r(), 1e-12);
  const u2 = r();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.min(max, Math.max(min, Math.exp(mu + sigma * z)));
}

/**
 * Nihkega valik vahemikus [1, n]: väiksemad id-d on tõenäolisemad.
 * Kasutame "vanad kasutajad sõidavad rohkem" efekti modelleerimiseks
 * (Pareto-laadne pikk saba, nagu päris platvormil).
 */
export function skewedId(r: Rng, n: number, aste = 2.2): number {
  return 1 + Math.floor(Math.pow(r(), aste) * n);
}
