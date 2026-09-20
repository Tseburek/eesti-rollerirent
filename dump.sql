-- =============================================================================
--  eesti-rollerirent — mikromobiilsuse (rollerirendi) platvormi andmebaas
--  Skeemifail: tabelid, kontrollid, lookup-andmed, indeksid ja võõrvõtmed.
--
--  Kasutamine:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f dump.sql
--  Nõue:        PostgreSQL 14+ (testitud 16.x)
--
--  Fail on jagatud kaheks osaks:
--    1) see fail            — tabelid, PK-d, CHECK-id, lookup-tabelite sisu
--    2) sql/indeksid.sql    — sekundaarsed indeksid + võõrvõtmed (kaasatakse \ir-ga)
--  Nii on indeksite DDL ainult ühes kohas: seemneskript kasutab täpselt sama
--  faili indeksite taastamiseks pärast mass-sisestust.
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

DROP TABLE IF EXISTS tugipilet, hinnang, makse, hooldus, soit, roller, kasutaja CASCADE;
DROP TABLE IF EXISTS tugiteema, hooldustuup, maksemeetod, soidustaatus, tariifipakett, rollerimudel, linn CASCADE;

-- =============================================================================
--  LOOKUP-TABELID (väikesed, staatilised klassifikaatorid — sisu on siin failis)
-- =============================================================================

CREATE TABLE linn (
    id              smallint     PRIMARY KEY,
    nimi            text         NOT NULL UNIQUE,
    maakond         text         NOT NULL,
    kesk_lat        numeric(9,6) NOT NULL,
    kesk_lon        numeric(9,6) NOT NULL
);
COMMENT ON TABLE linn IS 'Lookup: teeninduslinnad koos keskpunkti koordinaatidega.';

CREATE TABLE rollerimudel (
    id              smallint  PRIMARY KEY,
    tootja          text      NOT NULL,
    mudel           text      NOT NULL,
    max_kiirus_kmh  smallint  NOT NULL CHECK (max_kiirus_kmh BETWEEN 10 AND 45),
    aku_maht_wh     smallint  NOT NULL CHECK (aku_maht_wh > 0),
    UNIQUE (tootja, mudel)
);
COMMENT ON TABLE rollerimudel IS 'Lookup: rollerite mudelid.';

CREATE TABLE tariifipakett (
    id                  smallint PRIMARY KEY,
    kood                text     NOT NULL UNIQUE,
    nimetus             text     NOT NULL,
    avamistasu_senti    integer  NOT NULL CHECK (avamistasu_senti >= 0),
    minutihind_senti    integer  NOT NULL CHECK (minutihind_senti > 0)
);
COMMENT ON TABLE tariifipakett IS 'Lookup: hinnapaketid (avamistasu + minutihind).';

CREATE TABLE soidustaatus (
    id       smallint PRIMARY KEY,
    kood     text     NOT NULL UNIQUE,
    nimetus  text     NOT NULL
);
COMMENT ON TABLE soidustaatus IS 'Lookup: sõidu lõppstaatus.';

CREATE TABLE maksemeetod (
    id       smallint PRIMARY KEY,
    kood     text     NOT NULL UNIQUE,
    nimetus  text     NOT NULL
);
COMMENT ON TABLE maksemeetod IS 'Lookup: makseviisid.';

CREATE TABLE hooldustuup (
    id       smallint PRIMARY KEY,
    kood     text     NOT NULL UNIQUE,
    nimetus  text     NOT NULL
);
COMMENT ON TABLE hooldustuup IS 'Lookup: hooldustööde liigid.';

CREATE TABLE tugiteema (
    id       smallint PRIMARY KEY,
    kood     text     NOT NULL UNIQUE,
    nimetus  text     NOT NULL
);
COMMENT ON TABLE tugiteema IS 'Lookup: klienditoe pöördumise teemad.';

-- =============================================================================
--  MITTE-LOOKUP TABELID (täidetakse seemneskriptiga)
-- =============================================================================

CREATE TABLE kasutaja (
    id                  bigint      PRIMARY KEY,
    eesnimi             text        NOT NULL,
    perenimi            text        NOT NULL,
    email               text        NOT NULL,
    telefon             text        NOT NULL,
    synniaeg            date        NOT NULL,
    linn_id             smallint    NOT NULL,
    aadress             text        NOT NULL,
    tariifipakett_id    smallint    NOT NULL,
    registreeritud_at   timestamptz NOT NULL,
    viimati_aktiivne_at timestamptz NOT NULL,
    on_aktiivne         boolean     NOT NULL,
    CHECK (viimati_aktiivne_at >= registreeritud_at)
);
COMMENT ON TABLE kasutaja IS 'Platvormi registreeritud kasutajad.';

CREATE TABLE roller (
    id                bigint        PRIMARY KEY,
    seerianumber      text          NOT NULL,
    rollerimudel_id   smallint      NOT NULL,
    linn_id           smallint      NOT NULL,
    kasutuselevott    date          NOT NULL,
    laadimistsuklid   integer       NOT NULL CHECK (laadimistsuklid >= 0),
    aku_tase_pct      smallint      NOT NULL CHECK (aku_tase_pct BETWEEN 0 AND 100),
    labisoit_km       numeric(10,2) NOT NULL CHECK (labisoit_km >= 0),
    staatus           text          NOT NULL CHECK (staatus IN ('saadaval','kasutuses','hoolduses','laos','maha_kantud'))
);
COMMENT ON TABLE roller IS 'Rendipargi sõidukid.';

CREATE TABLE soit (
    id                bigint       PRIMARY KEY,
    kasutaja_id       bigint       NOT NULL,
    roller_id         bigint       NOT NULL,
    soidustaatus_id   smallint     NOT NULL,
    tariifipakett_id  smallint     NOT NULL,
    linn_id           smallint     NOT NULL,
    algus_at          timestamptz  NOT NULL,
    lopp_at           timestamptz  NOT NULL,
    kestus_sek        integer      NOT NULL CHECK (kestus_sek >= 0),
    distants_m        integer      NOT NULL CHECK (distants_m >= 0),
    algus_lat         numeric(9,6) NOT NULL,
    algus_lon         numeric(9,6) NOT NULL,
    lopp_lat          numeric(9,6) NOT NULL,
    lopp_lon          numeric(9,6) NOT NULL,
    avamistasu_senti  integer      NOT NULL CHECK (avamistasu_senti >= 0),
    minutihind_senti  integer      NOT NULL CHECK (minutihind_senti >= 0),
    hind_senti        integer      NOT NULL CHECK (hind_senti >= 0),
    CHECK (lopp_at >= algus_at)
);
COMMENT ON TABLE soit IS 'Üksiksõidud — andmebaasi suurim faktitabel (>= 2 000 000 rida).';

CREATE TABLE makse (
    id                bigint      PRIMARY KEY,
    soit_id           bigint      NOT NULL,
    kasutaja_id       bigint      NOT NULL,
    maksemeetod_id    smallint    NOT NULL,
    summa_senti       integer     NOT NULL CHECK (summa_senti >= 0),
    kaibemaks_senti   integer     NOT NULL CHECK (kaibemaks_senti >= 0),
    valuuta           char(3)     NOT NULL DEFAULT 'EUR',
    staatus           text        NOT NULL CHECK (staatus IN ('onnestus','ebaonnestus','tagasimakse')),
    tehingu_viide     text        NOT NULL,
    makstud_at        timestamptz NOT NULL
);
COMMENT ON TABLE makse IS 'Sõidu eest tasumine (1:1 tasuliste sõitudega).';

CREATE TABLE hinnang (
    id           bigint      PRIMARY KEY,
    soit_id      bigint      NOT NULL,
    kasutaja_id  bigint      NOT NULL,
    tahed        smallint    NOT NULL CHECK (tahed BETWEEN 1 AND 5),
    kommentaar   text,
    loodud_at    timestamptz NOT NULL
);
COMMENT ON TABLE hinnang IS 'Kasutaja tagasiside sõidule.';

CREATE TABLE hooldus (
    id              bigint      PRIMARY KEY,
    roller_id       bigint      NOT NULL,
    hooldustuup_id  smallint    NOT NULL,
    tehnik          text        NOT NULL,
    algus_at        timestamptz NOT NULL,
    lopp_at         timestamptz NOT NULL,
    maksumus_senti  integer     NOT NULL CHECK (maksumus_senti >= 0),
    markused        text,
    CHECK (lopp_at >= algus_at)
);
COMMENT ON TABLE hooldus IS 'Rollerite hooldus- ja remonditööd.';

CREATE TABLE tugipilet (
    id           bigint      PRIMARY KEY,
    kasutaja_id  bigint      NOT NULL,
    soit_id      bigint,
    tugiteema_id smallint    NOT NULL,
    staatus      text        NOT NULL CHECK (staatus IN ('avatud','tools','lahendatud','suletud')),
    prioriteet   smallint    NOT NULL CHECK (prioriteet BETWEEN 1 AND 4),
    sisu         text        NOT NULL,
    avatud_at    timestamptz NOT NULL,
    suletud_at   timestamptz,
    CHECK (suletud_at IS NULL OR suletud_at >= avatud_at)
);
COMMENT ON TABLE tugipilet IS 'Klienditoe pöördumised (soit_id võib olla NULL).';

-- =============================================================================
--  LOOKUP-TABELITE SISU
-- =============================================================================

INSERT INTO linn (id, nimi, maakond, kesk_lat, kesk_lon) VALUES
 (1,'Tallinn','Harjumaa',59.436962,24.753574),
 (2,'Tartu','Tartumaa',58.377925,26.729006),
 (3,'Narva','Ida-Virumaa',59.379700,28.179100),
 (4,'Pärnu','Pärnumaa',58.385931,24.497116),
 (5,'Kohtla-Järve','Ida-Virumaa',59.398600,27.273500),
 (6,'Viljandi','Viljandimaa',58.363900,25.590000),
 (7,'Rakvere','Lääne-Virumaa',59.346500,26.355800),
 (8,'Maardu','Harjumaa',59.476100,25.025000),
 (9,'Kuressaare','Saaremaa',58.252800,22.488900),
 (10,'Sillamäe','Ida-Virumaa',59.399700,27.774200),
 (11,'Valga','Valgamaa',57.776900,26.047000),
 (12,'Võru','Võrumaa',57.833900,27.019400);

INSERT INTO rollerimudel (id, tootja, mudel, max_kiirus_kmh, aku_maht_wh) VALUES
 (1,'Segway-Ninebot','Max G30',25,551),
 (2,'Segway-Ninebot','F40E',25,367),
 (3,'Okai','ES400B',25,486),
 (4,'Okai','Neuron N3',20,432),
 (5,'Xiaomi','Pro 2',25,474),
 (6,'Augment','City Pro',25,500),
 (7,'Bolt','Bolt 4',25,540),
 (8,'Tier','Four',20,460);

INSERT INTO tariifipakett (id, kood, nimetus, avamistasu_senti, minutihind_senti) VALUES
 (1,'BAAS','Baaspakett',100,15),
 (2,'PLUSS','Pluss kuutellimus',0,12),
 (3,'TUDENG','Tudengipakett',50,10),
 (4,'ARI','Äriklient',0,18);

INSERT INTO soidustaatus (id, kood, nimetus) VALUES
 (1,'LOPETATUD','Lõpetatud'),
 (2,'KATKESTATUD','Katkestatud'),
 (3,'TUHISTATUD','Tühistatud'),
 (4,'VIGA','Tehniline viga');

INSERT INTO maksemeetod (id, kood, nimetus) VALUES
 (1,'KAART','Pangakaart'),
 (2,'APPLEPAY','Apple Pay'),
 (3,'GOOGLEPAY','Google Pay'),
 (4,'PANGALINK','Pangalink'),
 (5,'KREDIIT','Konto krediit');

INSERT INTO hooldustuup (id, kood, nimetus) VALUES
 (1,'AKUVAHETUS','Aku vahetus'),
 (2,'PIDURID','Pidurite remont'),
 (3,'REHV','Rehvivahetus'),
 (4,'PUHASTUS','Puhastus ja hooldus'),
 (5,'TARKVARA','Tarkvarauuendus'),
 (6,'KORRALINE','Korraline ülevaatus');

INSERT INTO tugiteema (id, kood, nimetus) VALUES
 (1,'MAKSEPROBLEEM','Makseprobleem'),
 (2,'ROLLER_KATKI','Roller katki'),
 (3,'APP_VIGA','Rakenduse viga'),
 (4,'PARKIMINE','Parkimine ja trahvid'),
 (5,'HINNAVAIDLUS','Hinnavaidlus'),
 (6,'MUU','Muu küsimus');

COMMIT;

-- =============================================================================
--  SEKUNDAARSED INDEKSID + VÕÕRVÕTMED
--  (sama fail, mida seemneskript käivitab uuesti pärast mass-sisestust)
-- =============================================================================

\ir sql/indeksid.sql
