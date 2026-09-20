/**
 * Staatilised sõnastikud, millest sünteesitakse realistlikud eestikeelsed
 * nimed, aadressid ja tekstid. Kombinatsioonide arv:
 *   eesnimed (120) x perenimed (120) = 14 400 unikaalset nimepaari,
 *   tänavad (48) x majanumbrid x korterid x 12 linna = sadu tuhandeid aadresse.
 */

export const EESNIMED_M = [
  'Andres','Jaan','Martin','Kristjan','Marko','Tarmo','Rasmus','Siim','Priit','Toomas',
  'Mihkel','Karl','Oliver','Robin','Henri','Erik','Margus','Sander','Kaspar','Madis',
  'Hendrik','Rein','Taavi','Joonas','Silver','Urmas','Indrek','Ott','Raul','Kalev',
  'Aivar','Lauri','Mati','Peeter','Tanel','Kaarel','Mairo','Egert','Artur','Villem',
  'Jürgen','Sten','Ragnar','Märt','Ivo','Kaido','Remo','Aleksander','Mihkel','Roland',
  'Gert','Jaanus','Kristo','Meelis','Rando','Tauno','Veiko','Alar','Janar','Heiki',
] as const;

export const EESNIMED_N = [
  'Mari','Kadri','Laura','Liis','Anna','Kertu','Triin','Eva','Maria','Karin',
  'Piret','Kristiina','Helena','Sandra','Kaisa','Tiina','Katrin','Annika','Eliise','Johanna',
  'Merle','Liina','Riin','Grete','Elina','Hanna','Marta','Ingrid','Kaie','Reelika',
  'Sirje','Anneli','Maarja','Birgit','Külli','Egle','Janne','Kati','Pilleriin','Signe',
  'Hele','Diana','Jaana','Kaari','Berit','Dagmar','Ines','Kelly','Kaia','Mirjam',
  'Heleri','Rita','Ülle','Viktoria','Aire','Kristel','Siiri','Marianne','Helin','Kärt',
] as const;

export const PERENIMED = [
  'Tamm','Saar','Sepp','Mägi','Kask','Kuusk','Ilves','Pärn','Koppel','Rebane',
  'Lepik','Kaasik','Kukk','Oja','Raudsepp','Vaher','Karu','Toom','Luik','Laine',
  'Teder','Karro','Jõgi','Kivi','Nurm','Männik','Arula','Heinsoo','Kalda','Põld',
  'Raid','Sild','Tomingas','Uibo','Valge','Õun','Vares','Sarapuu','Linnas','Mets',
  'Paju','Kadakas','Sarapik','Aas','Ader','Kangur','Lind','Roos','Sinisalu','Tali',
  'Vint','Ratas','Peterson','Ojaste','Kütt','Lill','Mardi','Nurga','Pihlak','Sooäär',
] as const;

export const TANAVAD = [
  'Narva mnt','Pärnu mnt','Tartu mnt','Liivalaia','Sõpruse pst','Endla','Tehnika','Mustamäe tee',
  'Vabaduse pst','Akadeemia tee','Kadaka tee','Paldiski mnt','Sütiste tee','Õismäe tee','Ehitajate tee',
  'Lootsi','Jõe','Roosikrantsi','Tatari','Koidu','Kentmanni','Gonsiori','Laulupeo','Riia',
  'Kastani','Kroonuaia','Vabriku','Telliskivi','Kalevi','Turu','Võru','Jaama','Kesk',
  'Ringtee','Uus','Aia','Posti','Lai','Pikk','Kauba','Rüütli','Supeluse','Ranna',
  'Metsa','Kalda','Tulika','Veeriku','Nooruse',
] as const;

/**
 * Linnad — id-d vastavad täpselt dump.sql lookup-tabelile `linn`.
 * `kaal` = osakaal kasutaja- ja rollerimahust (rahvaarvu põhjal).
 * `raadius` = linna ligikaudne ulatus kraadides (sõidu koordinaatide levik).
 */
export const LINNAD = [
  { id: 1,  nimi: 'Tallinn',      lat: 59.436962, lon: 24.753574, kaal: 0.42, raadius: 0.050 },
  { id: 2,  nimi: 'Tartu',        lat: 58.377925, lon: 26.729006, kaal: 0.17, raadius: 0.032 },
  { id: 3,  nimi: 'Narva',        lat: 59.379700, lon: 28.179100, kaal: 0.07, raadius: 0.022 },
  { id: 4,  nimi: 'Pärnu',        lat: 58.385931, lon: 24.497116, kaal: 0.09, raadius: 0.026 },
  { id: 5,  nimi: 'Kohtla-Järve', lat: 59.398600, lon: 27.273500, kaal: 0.04, raadius: 0.020 },
  { id: 6,  nimi: 'Viljandi',     lat: 58.363900, lon: 25.590000, kaal: 0.04, raadius: 0.018 },
  { id: 7,  nimi: 'Rakvere',      lat: 59.346500, lon: 26.355800, kaal: 0.035, raadius: 0.016 },
  { id: 8,  nimi: 'Maardu',       lat: 59.476100, lon: 25.025000, kaal: 0.03, raadius: 0.014 },
  { id: 9,  nimi: 'Kuressaare',   lat: 58.252800, lon: 22.488900, kaal: 0.025, raadius: 0.014 },
  { id: 10, nimi: 'Sillamäe',     lat: 59.399700, lon: 27.774200, kaal: 0.02, raadius: 0.012 },
  { id: 11, nimi: 'Valga',        lat: 57.776900, lon: 26.047000, kaal: 0.02, raadius: 0.012 },
  { id: 12, nimi: 'Võru',         lat: 57.833900, lon: 27.019400, kaal: 0.02, raadius: 0.012 },
] as const;

export const EMAILI_DOMEENID = ['gmail.com','hot.ee','mail.ee','outlook.com','neti.ee','icloud.com','gmail.com','hot.ee'] as const;

/** Tariifipaketid — id-d vastavad lookup-tabelile `tariifipakett`. */
export const PAKETID = [
  { id: 1, kood: 'BAAS',   avamistasu: 100, minutihind: 15, kaal: 0.55 },
  { id: 2, kood: 'PLUSS',  avamistasu: 0,   minutihind: 12, kaal: 0.22 },
  { id: 3, kood: 'TUDENG', avamistasu: 50,  minutihind: 10, kaal: 0.17 },
  { id: 4, kood: 'ARI',    avamistasu: 0,   minutihind: 18, kaal: 0.06 },
] as const;

export const ROLLERI_STAATUSED = ['saadaval','kasutuses','hoolduses','laos','maha_kantud'] as const;
export const ROLLERI_STAATUSE_KAALUD = [0.66, 0.14, 0.11, 0.06, 0.03];

/** Sõidu staatused: id 1..4 (LOPETATUD, KATKESTATUD, TUHISTATUD, VIGA). */
export const SOIDUSTAATUSE_KAALUD = [0.9555, 0.0245, 0.0155, 0.0045];

/** Makseviisid id 1..5. */
export const MAKSEMEETODI_KAALUD = [0.46, 0.18, 0.13, 0.15, 0.08];

/** Hooldustüübid id 1..6. */
export const HOOLDUSTUUBI_KAALUD = [0.18, 0.14, 0.16, 0.26, 0.10, 0.16];

/** Tugiteemad id 1..6. */
export const TUGITEEMA_KAALUD = [0.22, 0.28, 0.16, 0.12, 0.14, 0.08];

/** Tunnijaotus (0..23) — kaks tipptundi: hommik 8-9 ja õhtu 16-18. */
export const TUNNI_KAALUD = [
  0.6, 0.35, 0.2, 0.15, 0.2, 0.6, 1.6, 4.2, 7.8, 6.4, 4.4, 4.6,
  5.4, 5.0, 4.8, 5.6, 8.2, 9.4, 7.6, 5.8, 4.4, 3.4, 2.2, 1.2,
];

/** Kuujaotus (jaanuar..detsember) — rollerihooaeg on kevad-sügis. */
export const KUU_KAALUD = [0.22, 0.20, 0.42, 0.85, 1.35, 1.55, 1.70, 1.60, 1.25, 0.80, 0.38, 0.24];

export const HINNANGU_KOMMENTAARID = [
  'Roller oli korras, sõit sujus hästi.',
  'Aku sai kiiresti tühjaks, muidu okei.',
  'Väga mugav, jõudsin tööle õigeks ajaks.',
  'Pidurid kriuksusid natuke.',
  'Parkimiskoht oli raskesti leitav.',
  'Puhas roller, hea kiirus.',
  'Rakendus ei tahtnud sõitu lõpetada.',
  'Mõnus hommikune sõit läbi vanalinna.',
  'Hind tundus selle distantsi kohta kõrge.',
  'Kõik toimis nii nagu peab.',
  'Rattatee oli remondis, pidin ringi sõitma.',
  'Roller võttis kehvasti hoogu üles.',
  'Suurepärane alternatiiv bussile.',
  'Istmeta roller pikal sõidul ei ole väga mugav.',
  'Leidsin rolleri kohe maja ees, super.',
  'Vihmaga natuke libe, aga sain hakkama.',
  'Tuli teavitus madalast akust kohe alguses.',
  'Kiire ja soodne, kasutan kindlasti uuesti.',
];

export const HOOLDUSE_MARKUSED = [
  'Aku maht langenud alla 70%, vahetatud uue vastu.',
  'Tagapiduri klots kulunud, asendatud.',
  'Esirehv sai augu, paigaldatud uus kumm.',
  'Plaanipärane puhastus ja määrimine.',
  'Püsivara uuendatud versioonile 4.2.1.',
  'Korraline ülevaatus, puudusi ei tuvastatud.',
  'Juhtraua kinnitus pingutatud.',
  'Laadimispesa oksüdeerunud, puhastatud.',
  'Kasutaja teatas müradest, laager vahetatud.',
  'Esituli ei süttinud, juhe taastatud.',
  'Pidurikäigu reguleerimine.',
  'Raami kriimustused, kosmeetiline remont.',
];

export const TUGIPILETI_SISU = [
  'Minult võeti sõidu eest topelt raha, palun kontrollige tehingut.',
  'Roller lülitus keset sõitu välja ja ei käivitunud uuesti.',
  'Rakendus ei lõpetanud sõitu ja taimer jooksis edasi.',
  'Ei leidnud lubatud parkimisala, kuhu roller jätta?',
  'Sõidu hind ei vasta minutihinnale, palun selgitage arvutust.',
  'Soovin oma konto sulgeda ja andmed kustutada.',
  'QR-kood ei lugenud rollerit sisse, proovisin mitu korda.',
  'Sain parkimise eest trahvi, kuigi seisin märgistatud alal.',
  'Kaart on kehtiv, aga makse ei lähe läbi.',
  'Roller oli kahjustatud juba enne sõidu algust, lisan foto.',
  'Palun kandke kasutamata sõidukrediit järgmisse kuusse.',
  'Kuutellimus uuendati, kuigi olin selle tühistanud.',
];

export const TUGIPILETI_STAATUSED = ['avatud','tools','lahendatud','suletud'] as const;
export const TUGIPILETI_STAATUSE_KAALUD = [0.06, 0.08, 0.22, 0.64];

/** Täpitähtede teisendus e-posti aadressi ja seerianumbri jaoks. */
export function translit(s: string): string {
  return s
    .replace(/ä/g, 'a').replace(/Ä/g, 'A')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/õ/g, 'o').replace(/Õ/g, 'O')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/š/g, 's').replace(/Š/g, 'S')
    .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
    .toLowerCase();
}
