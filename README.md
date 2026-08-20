# Recourse

Recourse is an evidence-grounded case-management application for challenging consequential platform decisions. The product requirements are in `docs/`; operational setup is in `SETUP.md`, and the implementation/gap audit is in `IMPLEMENTATION_REPORT.md`.

## Prerequisites

- Node.js 20.9 or newer
- pnpm 9
- Docker Desktop or a compatible Docker runtime for local Redis
- MongoDB 7+ replica set for local development, or MongoDB Atlas for staging/production and Atlas Search

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d redis
pnpm env:check
pnpm dev
```

The Phase 2 API requires a reachable MongoDB Atlas URI and generated JWT secrets in `.env`:

```bash
openssl rand -base64 48 # JWT_ACCESS_SECRET
openssl rand -base64 48 # JWT_REFRESH_SECRET
pnpm db:indexes
```

The two generated values should be assigned to `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. `pnpm db:indexes` creates and verifies the named MongoDB indexes after `MONGODB_URI` is configured. Password reset delivery uses the configured Gmail provider; email verification delivery/enforcement remains a documented gap.

The web app runs on `http://localhost:3000`, the API on `http://localhost:4000`, and the API documentation on `http://localhost:4000/api/docs`.

Run services separately when needed:

```bash
pnpm web:dev
pnpm api:dev
pnpm worker:dev
```

## Quality gates

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Provider verification commands and production dashboard steps are documented in `SETUP.md`. Do not enable outward email actions until the destination and procedure have been verified and the user has approved the persisted action.
