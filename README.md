# eesti-rollerirent

Eesti mikromobiilsuse (rollerirendi) platvormi andmebaas koos seemneskriptiga,
mis täidab skeemi **6,5 miljoni realistliku reaga**, millest suurimas
mitte-lookup tabelis `soit` on **2 600 000 rida**.

Seemneskript on kirjutatud **Bun**-iga (TypeScript), sisestus toimub partiidena
`COPY ... FROM STDIN` mass-sisestusega mitme paralleelse ühenduse kaudu.
Kogu andmestik on deterministlik: sama seeme annab bait-baidilt sama andmebaasi.

> **Muudatuste logi (õpetaja tagasiside, teine esitus):**
> 1. **Paranda andmete ajalised seosed.** Ajalise loogika viga parandatud
>    juurpõhjuseni — sõidud ja hooldused ei genereeri enam sõltumatult, vaid
>    iga rolleri kohta arvutatakse deterministlik, **struktuurselt
>    mittekattuv** sündmuste ajakava (vt p 6.3). Roller ei saa enam korraga
>    olla kahes sõidus ega sõidus+hoolduses. Kasutaja `viimati_aktiivne_at`
>    parandatakse seemneskripti lõpus üles-suunas tema tegeliku viimase
>    sõidu/pileti ajani. Mõlemad õpetaja leitud vastuolud (2831+746 rolleri
>    kattuvust, 965 486 sõitu pärast viimast aktiivsust) on nüüd
>    `sql/kontroll.sql`-is (p 3, p 3b) pidevalt kontrollitavad ja annavad
>    väärtuseks 0.
> 2. **Paranda tugipiletite osakaalu põhjendus.** Selgitus parandatud nii, et
>    see kajastab tegelikult genereeritud andmeid: 95 000 tugipiletit on
>    **3,65% sõitude arvust**, kuid puudutab **19,66% (78 651) kasutajate
>    arvust** — need on kaks erinevat, eraldi mõõdetavat suhtarvu (vt p 6.4,
>    `sql/kontroll.sql` p 4b).
> 3. **Lisa nullist toimiv Dockeri juhend.** README sisaldab nüüd täielikku
>    Dockeri juhendit (p 3), mis ei eelda PostgreSQL ega Bun paigaldust
>    hostmasinasse — kõik töötab `docker compose`-iga kahes konteineris.

---

## 1. Sisukord

| Fail | Sisu |
|---|---|
| `dump.sql` | Skeem: tabelid, CHECK-id, lookup-tabelite sisu; lõpus `\ir sql/indeksid.sql` |
| `sql/indeksid.sql` | Sekundaarsed indeksid + võõrvõtmed (üks tõeallikas, kasutatakse ka taastamisel) |
| `sql/eemalda-indeksid.sql` | Mass-sisestuse ettevalmistus: indeksid ja FK-d maha, tabelid tühjaks |
| `sql/paranda-viimati-aktiivne.sql` | `kasutaja.viimati_aktiivne_at` tervikluse parandus pärast `soit`/`tugipilet` täitmist (vt p 6.3) |
| `sql/kontroll.sql` | Kontrollpäringud: mahud, orvukirjed, ajaline ja rahaline loogika, rolleri kattuvused, usutavus |
| `seed.ts` | **Seemneskript** — partiipõhine paralleelne COPY, indeksite taastamine, aruanne |
| `laadi-skeem.ts` | Abiskript skeemi laadimiseks (`bun run skeem`) |
| `kontroll.ts` | Abiskript kontrollpäringute käivitamiseks (`bun run kontroll`) |
| `src/generaatorid.ts` | Ridade generaatorid (puhtad funktsioonid `f(seeme, tabel, id)`) |
| `src/andmestik.ts` | Eestikeelsed nimed, tänavad, linnad, tekstišabloonid, jaotuste kaalud |
| `src/juhuslikkus.ts` | Deterministlik pseudojuhuslikkus (splitmix32) ja jaotuste abifunktsioonid |
| `docker-compose.yml` | PostgreSQL + Bun teenused Dockeris (vt p 3) |
| `Dockerfile` | Bun + psql konteineripilt seemneskripti jaoks |
| `.env.example` | Keskkonnamuutujate näidis |

---

## 2. Eeldused

**Variant A — Docker (soovitatud, vt p 3):**

| Tööriist | Versioon | Kontroll |
|---|---|---|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose plugin | v2 | `docker compose version` |

**Variant B — kohalik PostgreSQL + Bun (vt p 4):**

| Tööriist | Versioon | Kontroll |
|---|---|---|
| PostgreSQL | **14+** (arendatud ja testitud 16.15) | `psql --version` |
| `psql` klient | sama põlvkond | `psql --version` |
| Bun | **1.1+** (testitud 1.4.2) | `bun --version` |

Mõlemal juhul: **Git**.

Bun-i paigaldus (Linux/macOS): `curl -fsSL https://bun.sh/install | bash`
(Windows: `powershell -c "irm bun.sh/install.ps1 | iex"` või WSL2.)

Ketas: täismahus andmebaas võtab **~1,3 GB** (andmed ~730 MB + indeksid ~530 MB).

---

## 3. Nullist käivitamine — Docker (soovitatud)

See variant ei eelda PostgreSQL ega Bun paigaldust hostmasinasse — kõik
töötab kahes Docker-konteineris (`db` = PostgreSQL, `seed` = Bun).

### 3.1 Klooni repo

```bash
git clone <selle-repo-URL> eesti-rollerirent
cd eesti-rollerirent
```

### 3.2 Käivita andmebaasi konteiner

```bash
docker compose up -d db
```

Oota, kuni tervisekontroll on roheline:

```bash
docker compose ps          # STATUS peab näitama "healthy"
```

### 3.3 Laadi skeem

```bash
docker compose run --rm seed bun run skeem
```

(Esimesel korral ehitab Docker `seed`-teenuse pildi — see paigaldab Bun-i
sõltuvused ja `psql` konteinerisse, vt `Dockerfile`.)

### 3.4 Käivita seemneskript

```bash
docker compose run --rm seed bun run seed
```

`seed`-teenuse `DATABASE_URL` (vt `docker-compose.yml`) osutab juba
konteineritevahelisele võrgule (`db:5432`), seega täiendavat seadistust
vaja pole.

### 3.5 Kontrolli tulemust

```bash
docker compose run --rm seed bun run kontroll
```

### 3.6 Kiire proovikäivitus (~5 sekundit)

```bash
docker compose run --rm -e MASTAAP=0.05 seed bun run seed
```

### 3.7 Koristamine

```bash
docker compose down            # peatab konteinerid, säilitab andmed (volume)
docker compose down -v         # peatab JA kustutab kõik andmed
```

### 3.8 Vajalikud mäluseaded (Docker)

* **Docker Desktop (Mac/Windows):** eralda vähemalt **4 GB RAM ja 2 vCPU**
  (Settings → Resources) täismahus (2,6 mln rea) käivituseks mõistliku
  kiirusega. Väiksema eraldisega tasub kasutada `MASTAAP=0.05`..`0.2`.
* **`/dev/shm` (jagatud mälu).** Docker piirab vaikimisi konteineri
  `/dev/shm` 64 MB peale — sellest jääb väheks, kui PostgreSQL kasutab
  indeksite loomisel või `VACUUM`-il paralleeltöölisi (annab vea
  `could not resize shared memory segment ... No space left on device`).
  `docker-compose.yml`-is on `db`-teenusele seetõttu seatud `shm_size: "1gb"`
  — see on juba vaikimisi sees, midagi lisaks tegema ei pea.
* **PostgreSQL-i konteineri enda mäluseaded** on juba paika pandud
  `docker-compose.yml`-is (`shared_buffers=256MB`, `maintenance_work_mem=512MB`,
  `max_wal_size=2GB`, `work_mem=32MB`) — need on mõõdukad väärtused, mis
  sobivad ka piiratud ressurssidega arenduskeskkonda, kuid kiirendavad
  COPY-t ja indeksite taastamist oluliselt vaikeväärtuste (mis eeldavad
  ~128MB shared_buffers) suhtes.
* Kui hostil on rohkem vaba mälu (nt 8+ GB), võib neid väärtusi
  `docker-compose.yml`-is `db.command` all tõsta (nt `shared_buffers=1GB`)
  kiiruse edasiseks parandamiseks.

> **Läbipaistvus testimise kohta:** `docker-compose.yml` ja `Dockerfile`
> on valideeritud `docker compose config`-iga (YAML struktuur, teenuste
> ja mahtude nimed, `depends_on: condition: service_healthy`, keskkonna-
> muutujad — kõik parsib ja lahendub korrektselt ilma vigadeta). Seda,
> mis konteineris tegelikult käivitub (`bun run skeem` / `seed` / `kontroll`),
> on täismahus otse testitud (vt p 5 ja p 6.3–6.4 tulemused) — see on
> täpselt sama kood ja samad SQL-failid, mida `seed`-konteiner käivitab.
> **Ausalt:** seda arenduskeskkonda, kus see juhend koostati, ümbritseb
> võrgupoliitika, mis blokeerib ligipääsu Docker Hub'i registrile
> (`registry-1.docker.io`), mistõttu `docker compose up`/`run` täielikku
> läbimist (piltide allalaadimine + konteinerite käivitamine) polnud
> võimalik siin lõpuni läbi viia. Tavalises arendaja masinas, kus Docker
> Hub on ligipääsetav, peaks juhend p 3.1–3.7 toimima sellisena nagu
> kirjeldatud — käsud ise (`docker compose up -d db`, `run --rm seed ...`)
> on standardsed ega sõltu millestki repos-spetsiifilisest. Kui midagi
> siiski ei tööta, vt p 9 "Sagedasemad probleemid".

---

## 4. Nullist käivitamine — kohalik PostgreSQL + Bun

### 4.1 Klooni repo ja paigalda sõltuvused

```bash
git clone <selle-repo-URL> eesti-rollerirent
cd eesti-rollerirent
bun install
```

### 4.2 Loo andmebaasi kasutaja ja andmebaas

```bash
# Linux (postgres-superkasutajana):
sudo -u postgres psql -c "CREATE ROLE rollerirent LOGIN PASSWORD 'rollerirent';"
sudo -u postgres psql -c "CREATE DATABASE rollerirent OWNER rollerirent;"

# macOS (Homebrew) / Windows, kui oled ise superkasutaja:
psql -U postgres -c "CREATE ROLE rollerirent LOGIN PASSWORD 'rollerirent';"
psql -U postgres -c "CREATE DATABASE rollerirent OWNER rollerirent;"
```

### 4.3 Seadista `.env`

```bash
cp .env.example .env
```

Olulised väärtused (vaikimisi väärtused sobivad ülaltoodud andmebaasiga):

```ini
DATABASE_URL=postgres://rollerirent:rollerirent@localhost:5432/rollerirent
SEEME=20260920          # juhuarvude seeme — reprodutseeritavuse alus
MASTAAP=1               # 1 = täismaht; 0.01 = kiire proovikäivitus
PARALLEELSUS=4          # paralleelsed COPY-ühendused (soovitus = CPU tuumade arv)
PARTII=25000            # ridu ühes COPY-partiis
```

### 4.4 Laadi skeem

```bash
bun run skeem
```

See loeb `DATABASE_URL`-i `.env`-ist ja laeb `dump.sql`-i. Sama asja saab teha
otse psql-iga (käivita **repo juurkaustast**, sest `dump.sql` kaasab lõpus
`sql/indeksid.sql` ja psql-i `\ir` on failisuhteline):

```bash
psql "postgres://rollerirent:rollerirent@localhost:5432/rollerirent" \
     -v ON_ERROR_STOP=1 -f dump.sql
```

> Kui psql-i pole paigaldatud, laeb `bun run skeem` skeemi otseühenduse kaudu
> (lahendab `\ir` kaasamise ise).

### 4.5 Käivita seemneskript

```bash
bun run seed.ts
# või: bun run seed
```

Skript teeb kõik ise:

1. eemaldab sekundaarsed indeksid + võõrvõtmed ja tühjendab mitte-lookup tabelid
   (`TRUNCATE`), nii et käivitamine on **kordusohutu** — teistkordne käivitamine ei
   tekita duplikaate;
2. täidab tabelid FK-järjekorras partiidena `COPY ... FROM STDIN (FORMAT csv)` kaudu,
   sõltumatud tabelid paralleelselt (sh `soit`+`makse`+`hinnang` ühe läbimisega,
   vt p 8.2);
3. taastab indeksid ja võõrvõtmed;
4. parandab `kasutaja.viimati_aktiivne_at` tervikluse (`sql/paranda-viimati-aktiivne.sql`,
   vt p 6.3);
5. teeb `VACUUM (ANALYZE)` ja väljastab kontrollaruande.

### 4.6 Kontrolli tulemust

```bash
bun run kontroll
# või otse: psql "postgres://rollerirent:rollerirent@localhost:5432/rollerirent" -f sql/kontroll.sql
```

Kõik punktide 2–3b arvud peavad olema **0** (orvukirjeid, ajaloogika vigu ega
rolleri sündmuste kattuvusi pole).

### 4.7 Kiire proovikäivitus (~2 sekundit)

Enne täismahtu tasub proovida väiksema mastaabiga:

```bash
MASTAAP=0.01 bun run seed.ts
```

---

## 5. Oodatav tulemus

Mõõdetud keskkonnas **1 vCPU / 3 GB RAM / PostgreSQL 16.15**, `PARALLEELSUS=4`,
`SEEME=20260920`. Tugevamal masinal (4+ tuuma) on kestus mitu korda lühem.

### 5.1 Ridade arv

| Tabel | Tüüp | Ridu | Osakaal / proportsiooni põhjendus |
|---|---|---:|---|
| **`soit`** | fakt | **2 600 000** | **Nõude täitja (≥ 2 mln).** Iga rolleri koguelu peale genereeritud sõitude arv on proportsionaalne rolleri koormusega (vanus × populaarsus, vt p 6.3); kogusumma normeeritud täpselt 2,6 miljonile |
| `makse` | fakt | 2 548 288 | 1:1 tasuliste sõitudega. Tasuta jäävad tühistatud (~1,6%) ja tehnilise veaga (~0,5%) sõidud → 98,0% sõitudest |
| `hinnang` | fakt | 595 981 | ~24% lõpetatud sõitudest saab tagasiside — tüüpiline vastamismäär mobiilirakendustes |
| `kasutaja` | mõõde | 400 000 | Eesti linnaelanikkonna usutav kasutajabaas; annab sõidutabelile realistliku kordumismäära |
| `hooldus` | fakt | 240 000 | Jaotatud rolleritele proportsionaalselt samamoodi kui sõidud (vanus × populaarsus) — koormatumad rollerid vajavad ka rohkem hooldust |
| `tugipilet` | fakt | 95 000 | **3,65% kõikidest sõitudest**, kuid puudutab **19,66% (78 651) kõigist kasutajatest** — vt täpne selgitus p 5.4 |
| `roller` | mõõde | 60 000 | Pargi suurus 12 linnas; ~43 sõitu rolleri kohta perioodi jooksul |
| **Kokku** | | **6 539 269** | |
| *lookup-tabelid* | | 43 | `linn` 12, `rollerimudel` 8, `tariifipakett` 4, `soidustaatus` 4, `maksemeetod` 5, `hooldustuup` 6, `tugiteema` 6 |

### 5.2 Kestus (1 vCPU)

| Etapp | Kestus |
|---|---:|
| 1. Indeksite ja võõrvõtmete eemaldamine | 0,0 s |
| 2. `kasutaja` + `roller` (paralleelselt) | 4,5 s |
| 3. `soit` + `makse` + `hinnang` (ühe läbimisega, vt p 8.2) | 63–66 s |
| 4. `hooldus` + `tugipilet` (paralleelselt) | 4,4 s |
| 5. Indeksite ja võõrvõtmete taastamine | 18–23 s |
| 6. `viimati_aktiivne_at` parandus (vt p 6.3) | 6–7 s |
| 7. `VACUUM (ANALYZE)` | 1–2 s |
| **Kokku** | **~105–111 s** |

> Kestus kasvas eelmise versiooniga võrreldes (~72 s → ~110 s), sest sõidu- ja
> hooldusajad arvutatakse nüüd rolleri kaupa järjestikku, mitte igaüks
> sõltumatult (vt p 6.3) — see on hinna, mida makstakse struktuurselt
> mittekattuvate sündmuste eest.

### 5.3 Maht kettal

| Tabel | Andmed | Indeksid | Kokku |
|---|---:|---:|---:|
| `soit` | 333 MB | 189 MB | 523 MB |
| `makse` | 246 MB | 217 MB | 463 MB |
| `kasutaja` | 89 MB | 78 MB | 167 MB |
| `hinnang` | 47 MB | 40 MB | 87 MB |
| `hooldus` | 26 MB | 16 MB | 42 MB |
| `tugipilet` | 13 MB | 7 MB | 20 MB |
| `roller` | 5 MB | 4 MB | 9 MB |
| **Kokku** | | | **~1,3 GB** |

---

## 6. Skeem

### 6.1 Lookup vs mitte-lookup

**Lookup-tabelid** (staatilised klassifikaatorid, sisu on `dump.sql`-is):
`linn`, `rollerimudel`, `tariifipakett`, `soidustaatus`, `maksemeetod`,
`hooldustuup`, `tugiteema`.

**Mitte-lookup tabelid** (täidab seemneskript):
`kasutaja`, `roller`, `soit`, `makse`, `hinnang`, `hooldus`, `tugipilet`.

### 6.2 Sisestusjärjekord (FK-järjekord)

```
lookup-tabelid (dump.sql)
        │
        ├── kasutaja ──┐          etapp 2: paralleelselt
        └── roller ────┤
                       ▼
              soit + makse + hinnang            etapp 3: üks läbimine
                       │                         (vt p 8.2)
        ┌──────────────┴───────────────┐
        ▼                               ▼
     hooldus                       tugipilet                etapp 4: paralleelselt
   (roller)                    (kasutaja, soit NULL-lubav)
```

Viidatavad tabelid täidetakse alati enne viitavaid → orvukirjeid ei saa tekkida.

### 6.3 Ajalise loogika parandus: rolleripõhine mittekattuv ajakava

**Probleem, mis varasemas versioonis esines:** sõidu ja hoolduse algusaeg
valiti **sõltumatult**, iga id kohta eraldi juhuarvuga. See lubas harval,
kuid siiski esineval juhul, et kaks sõitu (või sõit ja hooldus) sattusid
**samal rolleril** ajaliselt kattuma, ning et üksik sõit sattus juhuslikult
kasutaja enda genereeritud "viimati aktiivne" hetkest hiljemaks — mõlemad on
reaalses maailmas võimatud (üks roller on korraga vaid ühes seisundis üks
kasutaja ei saa "sõita" pärast enda viimast aktiivsushetke).

**Lahendus:**

1. **Rolleripõhine ajakava.** Iga rolleri jaoks arvutatakse funktsiooniga
   `rolleriAjakava()` (`src/generaatorid.ts`) deterministlik, **rangelt
   järjestikune** sündmuste ajajoon, kus sõidud ja hooldused on läbisegi,
   kuid iga järgmine sündmus algab alles pärast eelmise lõppu (+ juhuslik
   1 min – 3 h "parkimis"-paus):

   ```
   roller #42:  [sõit 1][paus][hooldus][paus][sõit 2][paus][sõit 3] ...
                kattuvus struktuurselt võimatu — järgmine algab alles eelmise lõpust
   ```

   Iga rolleri koguelu peale genereeritavate sõitude/hoolduste arv on
   proportsionaalne rolleri "koormusega" (vanus päevades × individuaalne
   populaarsuse kordaja), mis annab realistliku ebaühtlase jaotuse.
   `soit.id` → (rollerId, N-s sõit sellel rolleril) teisendus käib
   eelarvutatud kumulatiivsete summade peal binaarotsinguga — sama
   põhimõte, mida juba kasutati rollerite linnade vahel jaotamiseks. See
   jääb endiselt **puhtaks funktsiooniks** id-st (deterministlik,
   reprodutseeritav, paralleelselt genereeritav).

2. **`viimati_aktiivne_at` järelparandus.** Kuna sõidud on seotud rolleri,
   mitte kasutaja ajakavaga, tõstetakse seemneskripti lõpus
   (`sql/paranda-viimati-aktiivne.sql`) iga kasutaja `viimati_aktiivne_at`
   väärtust vajadusel üles tema tegeliku viimase sõidu/tugipileti ajani:

   ```sql
   UPDATE kasutaja k SET viimati_aktiivne_at = v.hetk
   FROM (SELECT kasutaja_id, max(hetk) AS hetk FROM (
           SELECT kasutaja_id, algus_at AS hetk FROM soit
           UNION ALL SELECT kasutaja_id, avatud_at AS hetk FROM tugipilet
         ) t GROUP BY kasutaja_id) v
   WHERE v.kasutaja_id = k.id AND v.hetk > k.viimati_aktiivne_at;
   ```

   See on ise deterministlik funktsioon juba genereeritud andmetest, mistõttu
   reprodutseeritavus säilib täielikult (vt p 8.5).

**Kontrollitud (`sql/kontroll.sql`, kõik = 0):**

```
== 3. Ajaline loogika ==
 soit_enne_registreerimist | soit_parast_viimast_aktiivsust | soit_enne_rolleri_soetamist | ...
----------------------------+----------------------------------+------------------------------+
                          0 |                                0 |                            0 |

== 3b. Rolleri sündmuste (sõit + hooldus) omavaheline kattuvus (peab olema 0) ==
 kattuvaid_sundmuste_paare
----------------------------
                          0
```

### 6.4 Tugipiletite osakaalu selgitus

**Probleem (õpetaja tagasiside):** algne selgitus ("3,7% sõitvatest
kasutajatest pöördub tugiteenusesse") oli sisuliselt eksitav — 95 000
tugipiletit on tegelikult ligikaudu 3,7% **sõitude arvust** (2 600 000),
mitte kasutajate arvust. Tegelik erinevate kasutajate osakaal, kes on
vähemalt korra tugipileti esitanud, on hoopis 19,76%.

**Parandus:** need on kaks erinevat, erineva nimetajaga suhtarvu, ja mõlemad
on nüüd eraldi arvutatud ja dokumenteeritud:

| Suhtarv | Nimetaja | Väärtus |
|---|---|---:|
| Piletite osakaal sõitude arvust | `soit` (2 600 000) | **3,65%** |
| Kasutajate osakaal, kes esitanud vähemalt ühe pileti | `kasutaja` (400 000) | **19,66%** |

Erinevus tuleneb sellest, et **enamik piletiga kasutajaid esitab vaid ühe
pileti** kogu oma kasutusaja jooksul (mitte iga sõidu kohta) — tugipiletite
generaator (`ridaTugipilet` `src/generaatorid.ts`-is) valib kasutaja
sõltumatult iga pileti kohta, mistõttu 95 000 piletit jaotuvad paljude
erinevate kasutajate vahel, mitte koonduvad vähestele korduvpöördujatele.
See on realistlik: enamik kasutajaid ei pöördu tuge kunagi, kuid ligi
viiendik kogu kasutajabaasist on vähemalt korra pöördunud.

**Kontrollitud (`sql/kontroll.sql` p 4b):**

```
== 4b. Tugipiletite osakaal (kaks erinevat, mõlemad põhjendatud vaatenurka) ==
 tugipileteid_kokku | soite_kokku | pileteid_100_soidu_kohta_pct | eri_kasutajaid_piletites | kasutajaid_kokku | kasutajate_osakaal_piletites_pct
----------------------+--------------+---------------------------------+----------------------------+--------------------+------------------------------------
                95000 |     2600000 |                            3.65 |                      78651 |            400000 |                             19.66
```

---

## 7. Kuidas andmed on „ehtsad"

| Väli | Sünteesi loogika |
|---|---|
| Nimed | 120 eesti eesnime × 60 perekonnanime, sooline jaotus 49/51 |
| E-post | `eesnimi.perenimi<id>@domeen`, täpitähed transliteeritud (`õ→o`, `ä→a`), domeenid `gmail.com`, `hot.ee`, `mail.ee`, `neti.ee`, … — unikaalsus tagatud id-ga |
| Telefon | Eesti mobiiliformaat `+3725XXXXXXX` |
| Aadress | Päris tänavanimed + majanumber + korter (72%) + kasutaja linn |
| Vanus | Normaaljaotus, keskmine 31 a, lõigatud 16–74 |
| Linnad | 12 päris linna, osakaalud rahvaarvu järgi (Tallinn 43%, Tartu 17%, Pärnu 9%, …) |
| Koordinaadid | Normaaljaotus linna keskpunkti ümber; pikkuskraadi ulatus korrigeeritud laiuskraadiga (Eestis ~1,9×) |
| Sõidu aeg | Rolleripõhine ajakava (vt p 6.3): rolleri koguelu peale ühtlaselt jaotatud + **ööpäevane rütm** (tipptunnid 8–9 ja 16–18); struktuurselt mittekattuv sama rolleri sõitude/hoolduste vahel |
| Sõidu kestus | Lognormaaljaotus: mediaan 9 min, keskmine 10,9 min, p95 24 min |
| Distants | Kestus × kiirus 9–21 km/h × käänulisustegur; keskmine 2,5 km |
| Hind | `avamistasu + ceil(kestus/60) × minutihind` **kasutaja tariifipaketi järgi** — hind on tariifiga arvutuslikult kooskõlas (kontrollitav `sql/kontroll.sql` punktis 4) |
| Käibemaks | 24% (Eesti määr), arvutatud summast tagurpidi |
| Sõidu staatus | 95,6% lõpetatud, 2,5% katkestatud, 1,6% tühistatud, 0,5% tehniline viga |
| Hinded | Kaldu positiivse poole (54% viietele), keskmine 4,22; kommentaar 38% juhtudest |
| Kasutajate aktiivsus | Pareto-laadne jaotus: lojaalsed varajased kasutajad sõidavad oluliselt sagedamini kui juhukasutajad |
| Rolleri kulumine | Laadimistsüklid ja läbisõit proportsionaalsed kasutuselevõtust möödunud ajaga |

### Tervikluse garantiid (kontrollitud `sql/kontroll.sql`-ga, kõik = 0)

* **Referentsiaalne:** orvukirjeid ei ole üheski tabelis. Võõrvõtmed lisatakse
  **pärast** täitmist — `ALTER TABLE ... ADD CONSTRAINT` valideerib kogu tabeli,
  seega juba skripti edukas lõpetamine tõestab, et vigaseid viiteid pole.
* **Ajaline:** sõit ei saa toimuda enne kasutaja registreerimist ega **pärast**
  kasutaja viimast aktiivsust; ei enne rolleri kasutuselevõttu; makse ei eelne
  sõidu lõpule; hooldus ei eelne rolleri soetamisele; `lopp_at >= algus_at`
  on tagatud ka CHECK-iga.
* **Rolleri eksklusiivsus:** ükski roller ei saa kahte sõitu ega sõitu+hooldust
  ajaliselt kattuvalt — tagatud struktuurselt rolleripõhise ajakavaga (vt p 6.3),
  kontrollitav `sql/kontroll.sql` punktis 3b.
* **Geograafiline:** sõidu roller on alati kasutaja koduliinast (`soit.linn_id = roller.linn_id`).
* **Rahaline:** `makse.summa_senti = soit.hind_senti` ja sõidu hind vastab täpselt
  tariifipaketi valemile.

---

## 8. Tehnilised valikud

### 8.1 Mass-sisestus partiidena

Sisestus toimub **`COPY ... FROM STDIN WITH (FORMAT csv)`** voogudena, mitte
rida-realt `INSERT`-idega. Iga partii = 25 000 rida = üks COPY-käsk = üks
transaktsioon serveri poolel. Read genereeritakse mällu CSV-puhvrisse ja
saadetakse ühe voona (`stream.pipeline`).

Ühenduse tasemel on mass-sisestuse ajaks seatud:

```sql
SET synchronous_commit = off;      -- ei oota iga commiti WAL-i kettale
SET maintenance_work_mem = '256MB';
```

### 8.2 `soit` + `makse` + `hinnang` — üks läbimine

Kuna `makse` ja `hinnang` sõltuvad sõidu andmetest (hind, lõpuaeg, kasutaja),
aga rolleri ajakava (vt p 6.3) arvutamine iga sõidu kohta pole tasuta, arvutab
seemneskript `komplektSoit(id)` rolleri ajakava **täpselt üks kord** iga sõidu
id kohta ja tuletab sellest kohe kõik kolm rida, mis saadetakse kolme
paralleelsesse `COPY`-vootu (vt `taidaSoitKomplekt` funktsioon `seed.ts`-is).
See väldib sama ajakava kolmekordset taasarvutust, mis oleks juhtunud kolme
eraldi tabelitäitmise korral.

### 8.3 Indeksite strateegia

| Faas | Tegevus |
|---|---|
| Enne täitmist | `sql/eemalda-indeksid.sql` — **kõik** sekundaarsed indeksid ja võõrvõtmed maha. Alles jäävad ainult primaarvõtmed (need on COPY ajal odavad, sest id-d saabuvad kasvavas järjekorras) |
| Täitmise ajal | Minimaalne indeksikoormus → COPY kiirus ~135 000 rida/s ühel tuumal |
| Pärast täitmist | `sql/indeksid.sql` — indeksid ja võõrvõtmed tagasi, seejärel `ANALYZE` |

Ajaveergudel (`soit.algus_at`, `makse.makstud_at`) on **BRIN**-indeksid: kuna
`soit.id` kasvab koos sõidu ajaga, on tabel füüsiliselt ajaliselt järjestatud ja
BRIN annab B-tree-ga võrreldes sama kasu ~1000× väiksema mahuga.

### 8.4 Paralleelsus

Ühendustepuul (`postgres.js`) hoiab `PARALLEELSUS` reserveeritud ühendust.
Töölised tarbivad ühist partiijärjekorda, seega aeglane partii ei blokeeri
teisi. Lisaks täidetakse **sõltumatuid tabeleid üheaegselt**: etapp 2
(`kasutaja` + `roller`) ja etapp 4 (`hooldus` + `tugipilet`); etapis 3
kirjutavad kõik töölised paralleelselt kolme COPY-voogu (`soit`, `makse`,
`hinnang`) korraga (vt p 8.2).

### 8.5 Reprodutseeritavus

Iga rida (sh rolleri mittekattuv ajakava, vt p 6.3) on **puhas funktsioon**
`f(SEEME, ...)` — splitmix32-põhine deterministlik generaator, igal tabelil/
sündmusetüübil oma sool. Sellest järeldub:

* sama `SEEME` → **bait-baidilt identne andmebaas**, sõltumata tööliste
  arvust, partii suurusest või sellest, millises järjekorras partiid
  valmis saavad;
* `komplektSoit()` arvutab rolleri ajakava üks kord ja tuletab sellest
  korraga `soit`, `makse` ja `hinnang` rea (vt p 8.2), nii et summad ja
  ajatemplid klapivad ilma andmebaasist midagi tagasi lugemata;
* `viimati_aktiivne_at` järelparandus (p 6.3) on ise deterministlik SQL
  UPDATE juba genereeritud andmetest — see ei riku reprodutseeritavust;
* paralleelsus ei vaja jagatud loendurit ega lukustamist.

**Kontrollitud:** kaks järjestikust täismahus käivitust, sh kaks eraldi
nullist loodud andmebaasi, andsid `soit` tabeli esimese 200 000 rea kohta
identse kontrollsumma:

```bash
psql "$DATABASE_URL" -At -c \
  "select md5(string_agg(t::text,'|' order by id)) from (select * from soit order by id limit 200000) t"
# 99de648a60edfb0a91691b6a643ca3cb   (mõlemal, sõltumatul käivitusel)
```

---

## 9. Sagedasemad probleemid

| Probleem | Lahendus |
|---|---|
| `VIGA: keskkonnamuutuja DATABASE_URL puudub` | `cp .env.example .env` (kohalik variant; Dockeris on `DATABASE_URL` juba `docker-compose.yml`-is) |
| `psql: dump.sql: \ir: No such file` | Käivita psql repo juurkaustast (või kasuta `bun run skeem`) |
| `connection refused` | Kohalik: kas PostgreSQL töötab? `sudo systemctl start postgresql`. Docker: kas `docker compose up -d db` käivitatud ja `docker compose ps` näitab `healthy`? |
| `permission denied for schema public` (PG 15+) | `sudo -u postgres psql -d rollerirent -c "GRANT ALL ON SCHEMA public TO rollerirent;"` |
| Docker: pilt ei lae alla (`403`/`unknown: failed to resolve reference`) | Kontrolli internetiühendust Docker Hub'i (`registry-1.docker.io`); ettevõtte VPN/proxy või piiratud võrgupoliitika (nt CI-sandbox) võib registrile ligipääsu blokeerida |
| Docker: `docker: unknown command: docker compose` | Puudub Compose v2 plugin — paigalda `docker-compose-v2` (Ubuntu/Debian: `apt-get install docker-compose-v2`) või uuenda Docker Desktop |
| Docker: `could not resize shared memory segment ... No space left on device` | `/dev/shm` on liiga väike (Dockeri vaikimisi 64 MB). `docker-compose.yml`-is on `db`-teenusele juba `shm_size: "1gb"` — kui viga püsib, kontrolli, et repo on värskeim (`git pull`), ja tee `docker compose down` + `docker compose up -d db`, et konteiner uue seadega taasluua |
| Täitmine liiga aeglane | Tõsta `PARALLEELSUS` CPU tuumade arvuni; Dockeris tõsta hostile eraldatud RAM/vCPU (p 3.8) |
| Soovid kiiret proovi | `MASTAAP=0.01 bun run seed.ts` (kohalik) või `-e MASTAAP=0.05` Dockeris (p 3.6) |

---

## 10. Repo GitHubi laadimine

```bash
git init
git add .
git commit -m "Rollerirendi andmebaas: skeem + 6,5 mln rea seemneskript"
git branch -M main
git remote add origin git@github.com:<kasutajanimi>/eesti-rollerirent.git
git push -u origin main
```

`.gitignore` hoiab repost väljas `node_modules/`, `.env` ja logifailid —
`.env.example` on olemas, nii et seadistus on ikkagi taastatav.
