-- =============================================================================
--  Kontrollpäringud: mahud, terviklus, andmete usutavus.
--  Käivita:  psql "$DATABASE_URL" -f sql/kontroll.sql
-- =============================================================================

\echo '== 1. Ridade arv tabelite kaupa =='
SELECT 'soit'      AS tabel, count(*) AS ridu FROM soit
UNION ALL SELECT 'makse',     count(*) FROM makse
UNION ALL SELECT 'hinnang',   count(*) FROM hinnang
UNION ALL SELECT 'kasutaja',  count(*) FROM kasutaja
UNION ALL SELECT 'hooldus',   count(*) FROM hooldus
UNION ALL SELECT 'tugipilet', count(*) FROM tugipilet
UNION ALL SELECT 'roller',    count(*) FROM roller
ORDER BY ridu DESC;

\echo '== 2. Orvukirjed (kõik peavad olema 0) =='
SELECT
  (SELECT count(*) FROM soit s      LEFT JOIN kasutaja k ON k.id = s.kasutaja_id WHERE k.id IS NULL) AS soit_ilma_kasutajata,
  (SELECT count(*) FROM soit s      LEFT JOIN roller r   ON r.id = s.roller_id   WHERE r.id IS NULL) AS soit_ilma_rollerita,
  (SELECT count(*) FROM makse m     LEFT JOIN soit s     ON s.id = m.soit_id     WHERE s.id IS NULL) AS makse_ilma_soiduta,
  (SELECT count(*) FROM hinnang h   LEFT JOIN soit s     ON s.id = h.soit_id     WHERE s.id IS NULL) AS hinnang_ilma_soiduta,
  (SELECT count(*) FROM hooldus h   LEFT JOIN roller r   ON r.id = h.roller_id   WHERE r.id IS NULL) AS hooldus_ilma_rollerita,
  (SELECT count(*) FROM tugipilet p LEFT JOIN kasutaja k ON k.id = p.kasutaja_id WHERE k.id IS NULL) AS pilet_ilma_kasutajata,
  (SELECT count(*) FROM tugipilet p LEFT JOIN soit s     ON s.id = p.soit_id     WHERE p.soit_id IS NOT NULL AND s.id IS NULL) AS pilet_vigase_soiduga;

\echo '== 3. Ajaline loogika (kõik peavad olema 0) =='
SELECT
  (SELECT count(*) FROM soit s JOIN kasutaja k ON k.id = s.kasutaja_id WHERE s.algus_at < k.registreeritud_at) AS soit_enne_registreerimist,
  (SELECT count(*) FROM soit s JOIN kasutaja k ON k.id = s.kasutaja_id WHERE s.algus_at > k.viimati_aktiivne_at) AS soit_parast_viimast_aktiivsust,
  (SELECT count(*) FROM soit s JOIN roller r ON r.id = s.roller_id WHERE s.algus_at::date < r.kasutuselevott)  AS soit_enne_rolleri_soetamist,
  (SELECT count(*) FROM soit WHERE lopp_at < algus_at)                                                          AS negatiivne_kestus,
  (SELECT count(*) FROM hooldus WHERE lopp_at < algus_at)                                                       AS hoolduse_negatiivne_kestus,
  (SELECT count(*) FROM makse m JOIN soit s ON s.id = m.soit_id WHERE m.makstud_at < s.lopp_at)                 AS makse_enne_soidu_lopu,
  (SELECT count(*) FROM soit s JOIN roller r ON r.id = s.roller_id WHERE s.linn_id <> r.linn_id)                AS roller_valest_linnast;

\echo '== 3b. Rolleri sündmuste (sõit + hooldus) omavaheline kattuvus (peab olema 0) =='
-- Ühel rolleril ei tohi kunagi kaks sündmust (sõit või hooldus) ajaliselt kattuda:
-- iga sündmuse algus peab olema >= sama rolleri eelmise sündmuse lõpp.
WITH kombineeritud AS (
    SELECT roller_id, algus_at, lopp_at, 'soit'::text AS liik, id AS soit_id, NULL::bigint AS hooldus_id FROM soit
    UNION ALL
    SELECT roller_id, algus_at, lopp_at, 'hooldus'::text AS liik, NULL::bigint, id FROM hooldus
),
jarjestatud AS (
    SELECT *,
           lag(lopp_at)  OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_lopp,
           lag(liik)     OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_liik,
           lag(soit_id)  OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_soit_id,
           lag(hooldus_id) OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_hooldus_id
    FROM kombineeritud
)
SELECT count(*) AS kattuvaid_sundmuste_paare FROM jarjestatud WHERE algus_at < eelmine_lopp;

-- Kui ülemine arv pole 0, näitab see päring konkreetsed kattuvad paarid (esimesed 20):
WITH kombineeritud AS (
    SELECT roller_id, algus_at, lopp_at, 'soit'::text AS liik, id FROM soit
    UNION ALL
    SELECT roller_id, algus_at, lopp_at, 'hooldus'::text AS liik, id FROM hooldus
),
jarjestatud AS (
    SELECT *, lag(lopp_at) OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_lopp,
           lag(liik) OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_liik,
           lag(id) OVER (PARTITION BY roller_id ORDER BY algus_at) AS eelmine_id
    FROM kombineeritud
)
SELECT roller_id, eelmine_liik, eelmine_id, eelmine_lopp, liik, id, algus_at
FROM jarjestatud WHERE algus_at < eelmine_lopp
LIMIT 20;

\echo '== 4. Rahaline kooskõla (kõik peavad olema 0) =='
SELECT
  (SELECT count(*) FROM makse m JOIN soit s ON s.id = m.soit_id WHERE m.summa_senti <> s.hind_senti) AS makse_summa_ei_klapi,
  (SELECT count(*) FROM soit s JOIN tariifipakett p ON p.id = s.tariifipakett_id
     WHERE s.hind_senti > 0 AND s.hind_senti <> p.avamistasu_senti + ceil(s.kestus_sek / 60.0) * p.minutihind_senti) AS hind_ei_vasta_tariifile;

\echo '== 4b. Tugipiletite osakaal (kaks erinevat, mõlemad põhjendatud vaatenurka) =='
SELECT
  (SELECT count(*) FROM tugipilet)                          AS tugipileteid_kokku,
  (SELECT count(*) FROM soit)                                AS soite_kokku,
  round(100.0 * (SELECT count(*) FROM tugipilet) / (SELECT count(*) FROM soit), 2)          AS pileteid_100_soidu_kohta_pct,
  (SELECT count(DISTINCT kasutaja_id) FROM tugipilet)         AS eri_kasutajaid_piletites,
  (SELECT count(*) FROM kasutaja)                             AS kasutajaid_kokku,
  round(100.0 * (SELECT count(DISTINCT kasutaja_id) FROM tugipilet) / (SELECT count(*) FROM kasutaja), 2) AS kasutajate_osakaal_piletites_pct;

\echo '== 5. Andmete usutavus: sõidud kuude lõikes =='
SELECT to_char(algus_at, 'YYYY-MM') AS kuu, count(*) AS soite, round(avg(kestus_sek) / 60.0, 1) AS keskm_min
FROM soit GROUP BY 1 ORDER BY 1;

\echo '== 6. Andmete usutavus: TOP linnad =='
SELECT l.nimi, count(*) AS soite, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS osakaal_pct
FROM soit s JOIN linn l ON l.id = s.linn_id GROUP BY l.nimi ORDER BY soite DESC;

\echo '== 7. Andmete usutavus: sõidu kestus ja hind =='
SELECT
  round(avg(kestus_sek) / 60.0, 1)                                       AS keskm_kestus_min,
  round(avg(distants_m))                                                 AS keskm_distants_m,
  round(avg(hind_senti) / 100.0, 2)                                      AS keskm_hind_eur,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY kestus_sek) / 60           AS mediaan_min,
  percentile_disc(0.95) WITHIN GROUP (ORDER BY kestus_sek) / 60          AS p95_min
FROM soit WHERE soidustaatus_id = 1;

\echo '== 8. Andmete usutavus: näidisread =='
SELECT k.eesnimi, k.perenimi, k.email, k.aadress, l.nimi AS linn, k.registreeritud_at::date
FROM kasutaja k JOIN linn l ON l.id = k.linn_id ORDER BY k.id LIMIT 5;

SELECT s.id, s.algus_at, s.kestus_sek, s.distants_m, s.hind_senti, m.tehingu_viide, h.tahed, h.kommentaar
FROM soit s LEFT JOIN makse m ON m.soit_id = s.id LEFT JOIN hinnang h ON h.soit_id = s.id
WHERE h.id IS NOT NULL ORDER BY s.id LIMIT 5;

\echo '== 9. Indeksid ja tabelite maht =='
SELECT c.relname AS tabel,
       pg_size_pretty(pg_relation_size(c.oid))        AS andmed,
       pg_size_pretty(pg_indexes_size(c.oid))         AS indeksid,
       pg_size_pretty(pg_total_relation_size(c.oid))  AS kokku
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;
