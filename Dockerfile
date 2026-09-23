# eesti-rollerirent — Bun-i seemneskripti konteiner.
# Postgresi klient (psql) on kaasatud, et `bun run skeem`/`kontroll` saaksid
# eelistada psql-i (dump.sql `\ir` kaasamise jaoks); ilma selleta kasutavad
# laadi-skeem.ts ja kontroll.ts automaatset varuteed (vt nende failide algus).
FROM oven/bun:1.4-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install

COPY . .

CMD ["bun", "run", "seed.ts"]
