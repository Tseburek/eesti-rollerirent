-- =============================================================================
--  Parandab kasutaja.viimati_aktiivne_at tervikluse.
--
--  Genereerimisel pannakse igale kasutajale sõltumatu, juhuslik
--  "viimati aktiivne" ajahetk. Sõltumatult sellest genereeritakse rollerile
--  (mitte kasutajale) seotud mittekattuv sõidu-ajakava (vt src/generaatorid.ts
--  `rolleriAjakava`), mistõttu üksik sõit võib juhuslikult jääda kasutaja
--  algselt genereeritud "viimati aktiivne" hetkest hiljemaks.
--
--  See fail teeb "viimati aktiivne" kokkuleppeliselt õigeks: iga kasutaja
--  jaoks tõstetakse väärtus (vajadusel) tema tegeliku viimase sõidu või
--  tugipileti ajani. Tegemist on deterministliku, puhtalt genereeritud
--  andmetest tuletatud UPDATE-lausega — kaks järjestikust täismahus
--  käivitust annavad endiselt bait-baidilt identse lõpptulemuse.
--
--  Käivitatakse seed.ts-ist pärast `soit` ja `tugipilet` täitmist.
-- =============================================================================

\set ON_ERROR_STOP on

WITH viimane_tegevus AS (
    SELECT kasutaja_id, max(hetk) AS hetk FROM (
        SELECT kasutaja_id, algus_at AS hetk FROM soit
        UNION ALL
        SELECT kasutaja_id, avatud_at AS hetk FROM tugipilet
    ) tegevused
    GROUP BY kasutaja_id
)
UPDATE kasutaja k
SET viimati_aktiivne_at = v.hetk
FROM viimane_tegevus v
WHERE v.kasutaja_id = k.id
  AND v.hetk > k.viimati_aktiivne_at;
