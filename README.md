# eesti-rollerirent

Eesti mikromobiilsuse (rollerirendi) platvormi andmebaas koos seemneskriptiga,
mis täidab skeemi **6,5 miljoni realistliku reaga**, millest suurimas
mitte-lookup tabelis `soit` on **2 600 000 rida**.

Seemneskript on kirjutatud **Bun**-iga (TypeScript), sisestus toimub partiidena
`COPY ... FROM STDIN` mass-sisestusega mitme paralleelse ühenduse kaudu.
Kogu andmestik on deterministlik: sama seeme annab bait-baidilt sama andmebaasi.

---

## 1. Sisukord

| Fail | Sisu |
|---|---|
| `dump.sql` | Skeem: tabelid, CHECK-id, lookup-tabelite sisu; lõpus `\ir sql/indeksid.sql` |
| `sql/indeksid.sql` | Sekundaarsed indeksid + võõrvõtmed (üks tõeallikas, kasutatakse ka taastamisel) |
| `sql/eemalda-indeksid.sql` | Mass-sisestuse ettevalmistus: indeksid ja FK-d maha, tabelid tühjaks |
| `sql/kontroll.sql` | Kontrollpäringud: mahud, orvukirjed, ajaline ja rahaline loogika, usutavus |
| `seed.ts` | **Seemneskript** — partiipõhine paralleelne COPY, indeksite taastamine, aruanne |
| `laadi-skeem.ts` | Abiskript skeemi laadimiseks (`bun run skeem`) |
| `kontroll.ts` | Abiskript kontrollpäringute käivitamiseks (`bun run kontroll`) |
| `src/generaatorid.ts` | Ridade generaatorid (puhtad funktsioonid `f(seeme, tabel, id)`) |
| `src/andmestik.ts` | Eestikeelsed nimed, tänavad, linnad, tekstišabloonid, jaotuste kaalud |
| `src/juhuslikkus.ts` | Deterministlik pseudojuhuslikkus (splitmix32) ja jaotuste abifunktsioonid |
| `.env.example` | Keskkonnamuutujate näidis |

---

## 2. Eeldused

| Tööriist | Versioon | Kontroll |
|---|---|---|
| PostgreSQL | **14+** (arendatud ja testitud 16.15) | `psql --version` |
| `psql` klient | sama põlvkond | `psql --version` |
| Bun | **1.1+** (testitud 1.4.2) | `bun --version` |
| Git | ükskõik | `git --version` |

Bun-i paigaldus (Linux/macOS): `curl -fsSL https://bun.sh/install | bash`
(Windows: `powershell -c "irm bun.sh/install.ps1 | iex"` või WSL2.)

Ketas: täismahus andmebaas võtab **~1,3 GB** (andmed ~730 MB + indeksid ~530 MB).

---

## 3. Nullist käivitamine

### 3.1 Klooni repo ja paigalda sõltuvused

```bash
git clone <selle-repo-URL> eesti-rollerirent
cd eesti-rollerirent
bun install
```

### 3.2 Loo andmebaasi kasutaja ja andmebaas

```bash
# Linux (postgres-superkasutajana):
sudo -u postgres psql -c "CREATE ROLE rollerirent LOGIN PASSWORD 'rollerirent';"
sudo -u postgres psql -c "CREATE DATABASE rollerirent OWNER rollerirent;"

# macOS (Homebrew) / Windows, kui oled ise superkasutaja:
psql -U postgres -c "CREATE ROLE rollerirent LOGIN PASSWORD 'rollerirent';"
psql -U postgres -c "CREATE DATABASE rollerirent OWNER rollerirent;"
```

### 3.3 Seadista `.env`

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

### 3.4 Laadi skeem

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

### 3.5 Käivita seemneskript

```bash
bun run seed.ts
# või: bun run seed
```

Skript teeb kõik ise:

1. eemaldab sekundaarsed indeksid + võõrvõtmed ja tühjendab mitte-lookup tabelid
   (`TRUNCATE`), nii et käivitamine on **kordusohutu** — teistkordne käivitamine ei
   tekita duplikaate;
2. täidab tabelid FK-järjekorras partiidena `COPY ... FROM STDIN (FORMAT csv)` kaudu,
   sõltumatud tabelid paralleelselt;
3. taastab indeksid ja võõrvõtmed;
4. teeb `ANALYZE` ja väljastab kontrollaruande.

### 3.6 Kontrolli tulemust

```bash
bun run kontroll
# või otse: psql "postgres://rollerirent:rollerirent@localhost:5432/rollerirent" -f sql/kontroll.sql
```

Kõik punktide 2–4 arvud peavad olema **0** (orvukirjeid ega loogikavigu pole).

### 3.7 Kiire proovikäivitus (~2 sekundit)

Enne täismahtu tasub proovida väiksema mastaabiga:

```bash
MASTAAP=0.01 bun run seed.ts
```

---

## 4. Oodatav tulemus

Mõõdetud keskkonnas **1 vCPU / 3 GB RAM / PostgreSQL 16.15**, `PARALLEELSUS=4`,
`SEEME=20260920`. Tugevamal masinal (4+ tuuma) on kestus mitu korda lühem.

### 4.1 Ridade arv

| Tabel | Tüüp | Ridu | Osakaal / proportsiooni põhjendus |
|---|---|---:|---|
| **`soit`** | fakt | **2 600 000** | **Nõude täitja (≥ 2 mln).** 2,7 aastat sõiduajalugu; ~6,5 sõitu kasutaja kohta, ~43 sõitu rolleri kohta — vastab tegeliku rendiplatvormi kasutussagedusele |
| `makse` | fakt | 2 548 036 | 1:1 tasuliste sõitudega. Tasuta jäävad tühistatud (~1,6%) ja tehnilise veaga (~0,5%) sõidud → 98,0% sõitudest |
| `hinnang` | fakt | 595 928 | ~24% lõpetatud sõitudest saab tagasiside — tüüpiline vastamismäär mobiilirakendustes |
| `kasutaja` | mõõde | 400 000 | Eesti linnaelanikkonna usutav kasutajabaas; annab sõidutabelile realistliku kordumismäära |
| `hooldus` | fakt | 240 000 | 4 hooldussündmust rolleri kohta 2,7 aasta jooksul (~1,5 korda aastas) |
| `tugipilet` | fakt | 95 000 | 3,7% sõitvatest kasutajatest pöördub tugiteenusesse — realistlik pöördumismäär |
| `roller` | mõõde | 60 000 | Pargi suurus 12 linnas; ~43 sõitu rolleri kohta perioodi jooksul |
| **Kokku** | | **6 538 964** | |
| *lookup-tabelid* | | 43 | `linn` 12, `rollerimudel` 8, `tariifipakett` 4, `soidustaatus` 4, `maksemeetod` 5, `hooldustuup` 6, `tugiteema` 6 |

### 4.2 Kestus (1 vCPU)

| Etapp | Kestus |
|---|---:|
| 1. Indeksite ja võõrvõtmete eemaldamine | 0,0 s |
| 2. `kasutaja` + `roller` (paralleelselt) | 4,0 s |
| 3. `soit` (2,6 mln rida) | 19,2 s (~135 000 rida/s) |
| 4. `makse` + `hinnang` + `hooldus` + `tugipilet` (paralleelselt) | 20,0 s |
| 5. Indeksite ja võõrvõtmete taastamine | 23,9 s |
| 6. `ANALYZE` | 0,8 s |
| **Kokku** | **~72 s** |

### 4.3 Maht kettal

| Tabel | Andmed | Indeksid | Kokku |
|---|---:|---:|---:|
| `soit` | 333 MB | 204 MB | 538 MB |
| `makse` | 246 MB | 217 MB | 463 MB |
| `kasutaja` | 57 MB | 42 MB | 99 MB |
| `hinnang` | 47 MB | 39 MB | 85 MB |
| `hooldus` | 27 MB | 15 MB | 42 MB |
| `tugipilet` | 13 MB | 7 MB | 20 MB |
| `roller` | 5 MB | 4 MB | 9 MB |
| **Kokku** | | | **~1,26 GB** |

---

## 5. Skeem

### 5.1 Lookup vs mitte-lookup

**Lookup-tabelid** (staatilised klassifikaatorid, sisu on `dump.sql`-is):
`linn`, `rollerimudel`, `tariifipakett`, `soidustaatus`, `maksemeetod`,
`hooldustuup`, `tugiteema`.

**Mitte-lookup tabelid** (täidab seemneskript):
`kasutaja`, `roller`, `soit`, `makse`, `hinnang`, `hooldus`, `tugipilet`.

### 5.2 Sisestusjärjekord (FK-järjekord)

```
lookup-tabelid (dump.sql)
        │
        ├── kasutaja ──┐          etapp 2: paralleelselt
        └── roller ────┤
                       ▼
                     soit                       etapp 3
                       │
        ┌──────────────┼───────────────┬────────────────┐
        ▼              ▼               ▼                ▼
      makse         hinnang        tugipilet         hooldus      etapp 4:
   (soit,           (soit,        (kasutaja,        (roller)      paralleelselt
    kasutaja)        kasutaja)     soit NULL-lubav)
```

Viidatavad tabelid täidetakse alati enne viitavaid → orvukirjeid ei saa tekkida.

---

## 6. Kuidas andmed on „ehtsad"

| Väli | Sünteesi loogika |
|---|---|
| Nimed | 120 eesti eesnime × 60 perekonnanime, sooline jaotus 49/51 |
| E-post | `eesnimi.perenimi<id>@domeen`, täpitähed transliteeritud (`õ→o`, `ä→a`), domeenid `gmail.com`, `hot.ee`, `mail.ee`, `neti.ee`, … — unikaalsus tagatud id-ga |
| Telefon | Eesti mobiiliformaat `+3725XXXXXXX` |
| Aadress | Päris tänavanimed + majanumber + korter (72%) + kasutaja linn |
| Vanus | Normaaljaotus, keskmine 31 a, lõigatud 16–74 |
| Linnad | 12 päris linna, osakaalud rahvaarvu järgi (Tallinn 43%, Tartu 17%, Pärnu 9%, …) |
| Koordinaadid | Normaaljaotus linna keskpunkti ümber; pikkuskraadi ulatus korrigeeritud laiuskraadiga (Eestis ~1,9×) |
| Sõidu aeg | Kahekordne jaotus: **hooajalisus** (juuli tipp, veebruar madalseis) × **ööpäevane rütm** (tipptunnid 8–9 ja 16–18) × platvormi **kasv ajas** |
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
* **Ajaline:** sõit ei saa toimuda enne kasutaja registreerimist ega enne rolleri
  kasutuselevõttu; makse ei eelne sõidu lõpule; hooldus ei eelne rolleri
  soetamisele; `lopp_at >= algus_at` on tagatud ka CHECK-iga.
* **Geograafiline:** sõidu roller on alati kasutaja koduliinast (`soit.linn_id = roller.linn_id`).
* **Rahaline:** `makse.summa_senti = soit.hind_senti` ja sõidu hind vastab täpselt
  tariifipaketi valemile.

---

## 7. Tehnilised valikud

### 7.1 Mass-sisestus partiidena

Sisestus toimub **`COPY ... FROM STDIN WITH (FORMAT csv)`** voogudena, mitte
rida-realt `INSERT`-idega. Iga partii = 25 000 rida = üks COPY-käsk = üks
transaktsioon serveri poolel. Read genereeritakse mällu CSV-puhvrisse ja
saadetakse ühe voona (`stream.pipeline`).

Ühenduse tasemel on mass-sisestuse ajaks seatud:

```sql
SET synchronous_commit = off;      -- ei oota iga commiti WAL-i kettale
SET maintenance_work_mem = '256MB';
```

### 7.2 Indeksite strateegia

| Faas | Tegevus |
|---|---|
| Enne täitmist | `sql/eemalda-indeksid.sql` — **kõik** sekundaarsed indeksid ja võõrvõtmed maha. Alles jäävad ainult primaarvõtmed (need on COPY ajal odavad, sest id-d saabuvad kasvavas järjekorras) |
| Täitmise ajal | Minimaalne indeksikoormus → COPY kiirus ~135 000 rida/s ühel tuumal |
| Pärast täitmist | `sql/indeksid.sql` — indeksid ja võõrvõtmed tagasi, seejärel `ANALYZE` |

Ajaveergudel (`soit.algus_at`, `makse.makstud_at`) on **BRIN**-indeksid: kuna
`soit.id` kasvab koos sõidu ajaga, on tabel füüsiliselt ajaliselt järjestatud ja
BRIN annab B-tree-ga võrreldes sama kasu ~1000× väiksema mahuga.

### 7.3 Paralleelsus

Ühendustepuul (`postgres.js`) hoiab `PARALLEELSUS` reserveeritud ühendust.
Töölised tarbivad ühist partiijärjekorda, seega aeglane partii ei blokeeri teisi.
Lisaks täidetakse **sõltumatuid tabeleid üheaegselt**: etapp 2 (`kasutaja` +
`roller`) ja etapp 4 (`makse` + `hinnang` + `hooldus` + `tugipilet`).

### 7.4 Reprodutseeritavus

Iga rida on **puhas funktsioon** `f(SEEME, tabel, id)` (splitmix32-põhine
deterministlik generaator, igal tabelil oma sool). Sellest järeldub:

* sama `SEEME` → **bait-baidilt identne andmebaas**, sõltumata tööliste arvust,
  partii suurusest või sellest, millises järjekorras partiid valmis saavad;
* `makse` ja `hinnang` oskavad sõidu id järgi sõidu uuesti genereerida, nii et
  summad ja ajatemplid klapivad ilma andmebaasist midagi tagasi lugemata;
* paralleelsus ei vaja jagatud loendurit ega lukustamist.

**Kontrollitud:** kaks järjestikust täismahus käivitust andsid identse
kontrollsumma:

```bash
psql "$DATABASE_URL" -At -c \
  "select md5(string_agg(t::text,'|' order by id)) from (select * from soit order by id limit 200000) t"
# 8d409efb4aff473f38a565d2535ca1cb   (mõlemal käivitusel)
```

---

## 8. Sagedasemad probleemid

| Probleem | Lahendus |
|---|---|
| `VIGA: keskkonnamuutuja DATABASE_URL puudub` | `cp .env.example .env` |
| `psql: dump.sql: \ir: No such file` | Käivita psql repo juurkaustast (või kasuta `bun run skeem`) |
| `connection refused` | Kas PostgreSQL töötab? `sudo systemctl start postgresql` |
| `permission denied for schema public` (PG 15+) | `sudo -u postgres psql -d rollerirent -c "GRANT ALL ON SCHEMA public TO rollerirent;"` |
| Täitmine liiga aeglane | Tõsta `PARALLEELSUS` CPU tuumade arvuni; kontrolli, et ketas pole täis |
| Soovid kiiret proovi | `MASTAAP=0.01 bun run seed.ts` |

---

## 9. Repo GitHubi laadimine

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
