# Recourse

Recourse is a production-grade case-management agent for challenging consequential platform decisions. The product architecture and requirements are defined in `docs/`; this README only covers local developer commands and the current engineering foundation.

## Prerequisites

- Node.js 20.9 or newer
- pnpm 9
- Docker Desktop or a compatible Docker runtime for local Redis
- MongoDB Atlas access for API persistence and index management

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

The two generated values should be assigned to `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. `pnpm db:indexes` creates and verifies the named MongoDB indexes after `MONGODB_URI` is configured. Email verification and password-reset token storage are present, but delivery is intentionally deferred until the email-provider phase.

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

The current foundation does not connect to Groq, Tavily, object storage, email, or any external platform. Those integrations are added in later phases behind the interfaces specified in `docs/02_TECHNICAL_SPECIFICATION.md`.
