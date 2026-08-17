# Recourse

Recourse is a production-grade case-management agent for challenging consequential platform decisions. The product architecture and requirements are defined in `docs/`; this README only covers the Phase 1 developer foundation.

## Prerequisites

- Node.js 20.9 or newer
- pnpm 9
- Docker Desktop or a compatible Docker runtime for local Redis
- MongoDB Atlas access when persistence is implemented in Phase 2

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d redis
pnpm env:check
pnpm dev
```

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

Phase 1 does not connect to MongoDB, Groq, Tavily, object storage, email, or any external platform. Those integrations are added in later phases behind the interfaces specified in `docs/02_TECHNICAL_SPECIFICATION.md`.
