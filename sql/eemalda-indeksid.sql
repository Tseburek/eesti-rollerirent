-- =============================================================================
--  Mass-sisestuse ettevalmistus: eemaldame sekundaarsed indeksid ja võõrvõtmed.
--  Primaarvõtmed jäävad alles (need on vajalikud identiteedi tagamiseks ja
--  COPY ajal odavad, sest id-d genereeritakse kasvavas järjekorras).
--
--  Põhjus: iga täiendav B-tree indeks aeglustab COPY-t ~20-40% ning iga
--  võõrvõti tähendab rea kohta täiendavat otsingut viidatavast tabelist.
--  Pärast täitmist ehitatakse kõik uuesti üles failist sql/indeksid.sql,
--  kus ALTER TABLE ... ADD FOREIGN KEY kontrollib ühtlasi kogu andmestiku
--  referentsiaalset terviklust korraga (orvukirjete tõestus).
-- =============================================================================

\set ON_ERROR_STOP on

ALTER TABLE kasutaja  DROP CONSTRAINT IF EXISTS kasutaja_linn_fk;
ALTER TABLE kasutaja  DROP CONSTRAINT IF EXISTS kasutaja_pakett_fk;
ALTER TABLE roller    DROP CONSTRAINT IF EXISTS roller_mudel_fk;
ALTER TABLE roller    DROP CONSTRAINT IF EXISTS roller_linn_fk;
ALTER TABLE soit      DROP CONSTRAINT IF EXISTS soit_kasutaja_fk;
ALTER TABLE soit      DROP CONSTRAINT IF EXISTS soit_roller_fk;
ALTER TABLE soit      DROP CONSTRAINT IF EXISTS soit_staatus_fk;
ALTER TABLE soit      DROP CONSTRAINT IF EXISTS soit_pakett_fk;
ALTER TABLE soit      DROP CONSTRAINT IF EXISTS soit_linn_fk;
ALTER TABLE makse     DROP CONSTRAINT IF EXISTS makse_soit_fk;
ALTER TABLE makse     DROP CONSTRAINT IF EXISTS makse_kasutaja_fk;
ALTER TABLE makse     DROP CONSTRAINT IF EXISTS makse_meetod_fk;
ALTER TABLE hinnang   DROP CONSTRAINT IF EXISTS hinnang_soit_fk;
ALTER TABLE hinnang   DROP CONSTRAINT IF EXISTS hinnang_kasutaja_fk;
ALTER TABLE hooldus   DROP CONSTRAINT IF EXISTS hooldus_roller_fk;
ALTER TABLE hooldus   DROP CONSTRAINT IF EXISTS hooldus_tuup_fk;
ALTER TABLE tugipilet DROP CONSTRAINT IF EXISTS tugipilet_kasutaja_fk;
ALTER TABLE tugipilet DROP CONSTRAINT IF EXISTS tugipilet_soit_fk;
ALTER TABLE tugipilet DROP CONSTRAINT IF EXISTS tugipilet_teema_fk;

DROP INDEX IF EXISTS kasutaja_email_uniq;
DROP INDEX IF EXISTS kasutaja_linn_idx;
DROP INDEX IF EXISTS kasutaja_reg_idx;
DROP INDEX IF EXISTS kasutaja_pakett_idx;
DROP INDEX IF EXISTS roller_seerianr_uniq;
DROP INDEX IF EXISTS roller_linn_idx;
DROP INDEX IF EXISTS roller_mudel_idx;
DROP INDEX IF EXISTS roller_staatus_idx;
DROP INDEX IF EXISTS soit_kasutaja_algus_idx;
DROP INDEX IF EXISTS soit_roller_idx;
DROP INDEX IF EXISTS soit_staatus_idx;
DROP INDEX IF EXISTS soit_linn_idx;
DROP INDEX IF EXISTS soit_algus_brin;
DROP INDEX IF EXISTS makse_soit_uniq;
DROP INDEX IF EXISTS makse_viide_uniq;
DROP INDEX IF EXISTS makse_kasutaja_idx;
DROP INDEX IF EXISTS makse_makstud_brin;
DROP INDEX IF EXISTS hinnang_soit_uniq;
DROP INDEX IF EXISTS hinnang_kasutaja_idx;
DROP INDEX IF EXISTS hinnang_tahed_idx;
DROP INDEX IF EXISTS hooldus_roller_idx;
DROP INDEX IF EXISTS hooldus_tuup_idx;
DROP INDEX IF EXISTS hooldus_algus_idx;
DROP INDEX IF EXISTS tugipilet_kasutaja_idx;
DROP INDEX IF EXISTS tugipilet_soit_idx;
DROP INDEX IF EXISTS tugipilet_staatus_idx;
DROP INDEX IF EXISTS tugipilet_teema_idx;

TRUNCATE TABLE tugipilet, hinnang, makse, hooldus, soit, roller, kasutaja;
