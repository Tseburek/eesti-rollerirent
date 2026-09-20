-- =============================================================================
--  Sekundaarsed indeksid ja võõrvõtmed.
--  Seda faili käivitatakse kahel korral:
--    1) dump.sql lõpus (tühja skeemi peal),
--    2) seemneskripti lõpus, pärast mass-sisestust (indeksite taastamine).
--  Seetõttu on kõik laused IF NOT EXISTS / tingimuslikud.
-- =============================================================================

\set ON_ERROR_STOP on

-- ------------------------- kasutaja ----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS kasutaja_email_uniq      ON kasutaja (email);
CREATE INDEX        IF NOT EXISTS kasutaja_linn_idx        ON kasutaja (linn_id);
CREATE INDEX        IF NOT EXISTS kasutaja_reg_idx         ON kasutaja (registreeritud_at);
CREATE INDEX        IF NOT EXISTS kasutaja_pakett_idx      ON kasutaja (tariifipakett_id);

-- ------------------------- roller ------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS roller_seerianr_uniq     ON roller (seerianumber);
CREATE INDEX        IF NOT EXISTS roller_linn_idx          ON roller (linn_id);
CREATE INDEX        IF NOT EXISTS roller_mudel_idx         ON roller (rollerimudel_id);
CREATE INDEX        IF NOT EXISTS roller_staatus_idx       ON roller (staatus);

-- ------------------------- soit (suurim tabel) ------------------------------
CREATE INDEX IF NOT EXISTS soit_kasutaja_algus_idx  ON soit (kasutaja_id, algus_at DESC);
CREATE INDEX IF NOT EXISTS soit_roller_idx          ON soit (roller_id);
CREATE INDEX IF NOT EXISTS soit_staatus_idx         ON soit (soidustaatus_id);
CREATE INDEX IF NOT EXISTS soit_linn_idx            ON soit (linn_id);
-- BRIN sobib ajaveerule, mis kasvab monotoonselt: ~1000x väiksem kui B-tree.
CREATE INDEX IF NOT EXISTS soit_algus_brin          ON soit USING brin (algus_at) WITH (pages_per_range = 64);

-- ------------------------- makse -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS makse_soit_uniq        ON makse (soit_id);
CREATE UNIQUE INDEX IF NOT EXISTS makse_viide_uniq       ON makse (tehingu_viide);
CREATE INDEX        IF NOT EXISTS makse_kasutaja_idx     ON makse (kasutaja_id);
CREATE INDEX        IF NOT EXISTS makse_makstud_brin     ON makse USING brin (makstud_at) WITH (pages_per_range = 64);

-- ------------------------- hinnang -----------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS hinnang_soit_uniq      ON hinnang (soit_id);
CREATE INDEX        IF NOT EXISTS hinnang_kasutaja_idx   ON hinnang (kasutaja_id);
CREATE INDEX        IF NOT EXISTS hinnang_tahed_idx      ON hinnang (tahed);

-- ------------------------- hooldus -----------------------------------------
CREATE INDEX IF NOT EXISTS hooldus_roller_idx    ON hooldus (roller_id);
CREATE INDEX IF NOT EXISTS hooldus_tuup_idx      ON hooldus (hooldustuup_id);
CREATE INDEX IF NOT EXISTS hooldus_algus_idx     ON hooldus (algus_at);

-- ------------------------- tugipilet ---------------------------------------
CREATE INDEX IF NOT EXISTS tugipilet_kasutaja_idx ON tugipilet (kasutaja_id);
CREATE INDEX IF NOT EXISTS tugipilet_soit_idx     ON tugipilet (soit_id);
CREATE INDEX IF NOT EXISTS tugipilet_staatus_idx  ON tugipilet (staatus);
CREATE INDEX IF NOT EXISTS tugipilet_teema_idx    ON tugipilet (tugiteema_id);

-- =============================================================================
--  VÕÕRVÕTMED
--  ADD CONSTRAINT kontrollib kogu tabeli üle -> orvukirje korral käivitus katkeb.
--  See on ühtlasi tervikluse tõestus pärast mass-sisestust.
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kasutaja_linn_fk') THEN
        ALTER TABLE kasutaja ADD CONSTRAINT kasutaja_linn_fk
            FOREIGN KEY (linn_id) REFERENCES linn (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kasutaja_pakett_fk') THEN
        ALTER TABLE kasutaja ADD CONSTRAINT kasutaja_pakett_fk
            FOREIGN KEY (tariifipakett_id) REFERENCES tariifipakett (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roller_mudel_fk') THEN
        ALTER TABLE roller ADD CONSTRAINT roller_mudel_fk
            FOREIGN KEY (rollerimudel_id) REFERENCES rollerimudel (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roller_linn_fk') THEN
        ALTER TABLE roller ADD CONSTRAINT roller_linn_fk
            FOREIGN KEY (linn_id) REFERENCES linn (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soit_kasutaja_fk') THEN
        ALTER TABLE soit ADD CONSTRAINT soit_kasutaja_fk
            FOREIGN KEY (kasutaja_id) REFERENCES kasutaja (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soit_roller_fk') THEN
        ALTER TABLE soit ADD CONSTRAINT soit_roller_fk
            FOREIGN KEY (roller_id) REFERENCES roller (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soit_staatus_fk') THEN
        ALTER TABLE soit ADD CONSTRAINT soit_staatus_fk
            FOREIGN KEY (soidustaatus_id) REFERENCES soidustaatus (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soit_pakett_fk') THEN
        ALTER TABLE soit ADD CONSTRAINT soit_pakett_fk
            FOREIGN KEY (tariifipakett_id) REFERENCES tariifipakett (id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'soit_linn_fk') THEN
        ALTER TABLE soit ADD CONSTRAINT soit_linn_fk
            FOREIGN KEY (linn_id) REFERENCES linn (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'makse_soit_fk') THEN
        ALTER TABLE makse ADD CONSTRAINT makse_soit_fk
            FOREIGN KEY (soit_id) REFERENCES soit (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'makse_kasutaja_fk') THEN
        ALTER TABLE makse ADD CONSTRAINT makse_kasutaja_fk
            FOREIGN KEY (kasutaja_id) REFERENCES kasutaja (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'makse_meetod_fk') THEN
        ALTER TABLE makse ADD CONSTRAINT makse_meetod_fk
            FOREIGN KEY (maksemeetod_id) REFERENCES maksemeetod (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hinnang_soit_fk') THEN
        ALTER TABLE hinnang ADD CONSTRAINT hinnang_soit_fk
            FOREIGN KEY (soit_id) REFERENCES soit (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hinnang_kasutaja_fk') THEN
        ALTER TABLE hinnang ADD CONSTRAINT hinnang_kasutaja_fk
            FOREIGN KEY (kasutaja_id) REFERENCES kasutaja (id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hooldus_roller_fk') THEN
        ALTER TABLE hooldus ADD CONSTRAINT hooldus_roller_fk
            FOREIGN KEY (roller_id) REFERENCES roller (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hooldus_tuup_fk') THEN
        ALTER TABLE hooldus ADD CONSTRAINT hooldus_tuup_fk
            FOREIGN KEY (hooldustuup_id) REFERENCES hooldustuup (id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tugipilet_kasutaja_fk') THEN
        ALTER TABLE tugipilet ADD CONSTRAINT tugipilet_kasutaja_fk
            FOREIGN KEY (kasutaja_id) REFERENCES kasutaja (id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tugipilet_soit_fk') THEN
        ALTER TABLE tugipilet ADD CONSTRAINT tugipilet_soit_fk
            FOREIGN KEY (soit_id) REFERENCES soit (id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tugipilet_teema_fk') THEN
        ALTER TABLE tugipilet ADD CONSTRAINT tugipilet_teema_fk
            FOREIGN KEY (tugiteema_id) REFERENCES tugiteema (id);
    END IF;
END $$;
