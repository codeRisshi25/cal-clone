#!/bin/sh

echo "==> Entrypoint starting..."
echo "==> DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "==> Waiting 15s for PostgreSQL to initialize..."
sleep 15

echo "==> Running Prisma db push..."
cd /app/packages/db
npx prisma db push --skip-generate --accept-data-loss 2>&1 || {
  echo "==> Prisma db push failed, retrying in 10s..."
  sleep 10
  npx prisma db push --skip-generate --accept-data-loss 2>&1 || {
    echo "==> Prisma db push failed again. Starting server anyway..."
  }
}
echo "==> Schema push done."

echo "==> Checking if DB needs seeding..."
cd /app
USER_COUNT=$(node -e "
const { PrismaClient } = require('@cal-clone/db');
const p = new PrismaClient();
p.user.count().then(c => { console.log(c); return p.\$disconnect(); }).catch(() => { console.log(0); return p.\$disconnect(); });
" 2>/dev/null || echo "0")

echo "==> User count: $USER_COUNT"

if [ "$USER_COUNT" = "0" ]; then
  echo "==> DB is empty, running seed..."
  cd /app/apps/api
  node dist-seed/seed.js 2>&1 || echo "==> Seed failed (non-fatal)"
  echo "==> Seed step done."
else
  echo "==> DB already has data, skipping seed."
fi

echo "==> Starting API server..."
cd /app
exec node apps/api/dist/index.js
