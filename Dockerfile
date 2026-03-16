FROM node:18-slim AS base
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.18.0 --activate
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/types/package.json ./packages/types/package.json
RUN pnpm install --frozen-lockfile

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=deps /app/packages/types/node_modules ./packages/types/node_modules
COPY . .

# Generate Prisma client (npx bypasses pnpm's blocked postinstall scripts)
RUN cd packages/db && npx prisma generate

# Build shared packages so they emit CommonJS that Node can require at runtime
RUN cd packages/db && npx tsc
RUN cd packages/types && npx tsc

# Patch package.json "main" to point at compiled JS (so Node doesn't try to load .ts)
RUN node -e "const f='packages/db/package.json';const p=require('./'+f);p.main='./dist/index.js';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"
RUN node -e "const f='packages/types/package.json';const p=require('./'+f);p.main='./dist/index.js';require('fs').writeFileSync(f,JSON.stringify(p,null,2))"

# Build the API (tsc -> dist/)
RUN pnpm --filter @cal-clone/api build

# Compile seed script to JS separately (so it runs with plain node in production)
RUN cd apps/api && node -e "\
const ts = require('typescript');\
const fs = require('fs');\
const src = fs.readFileSync('src/seed.ts','utf8');\
const out = ts.transpileModule(src, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}});\
fs.mkdirSync('dist-seed',{recursive:true});\
fs.writeFileSync('dist-seed/seed.js',out.outputText);\
"

# ── Production image ──────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app

# Copy monorepo structure needed at runtime
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-workspace.yaml ./pnpm-workspace.yaml

# Copy API dist + package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules

# Copy packages/db (Prisma schema + generated client)
COPY --from=build /app/packages/db ./packages/db

# Copy packages/types
COPY --from=build /app/packages/types ./packages/types

# Copy seed script (compiled JS) + tsconfigs for prisma
COPY --from=build /app/apps/api/dist-seed/seed.js ./apps/api/dist-seed/seed.js
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json

# Entrypoint: db push + conditional seed + start server
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
