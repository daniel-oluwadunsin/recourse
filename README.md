# Recourse

Recourse is a general-purpose case-intelligence product for consequential institutional decisions. It helps a person understand what happened, verify the current process, organize evidence, prepare grounded communications, and continue the same case after a response.

Recourse does **not** send email, submit portals, call institutions, monitor external systems, or claim an external action happened. The user chooses and performs every external action.

## Repository

```text
apps/
  api/       NestJS REST API, MongoDB persistence, auth, providers, PDF rendering
  web/       Next.js App Router product and landing experience
packages/
  shared/    Shared Zod contracts, statuses, and plain-language labels
tests/e2e/   Playwright lifecycle, responsive, accessibility, and visual checks
scripts/     Deterministic E2E server
docs/        Product, technical, acceptance, tooling, and design authorities
```

The runtime is intentionally small: Next.js, NestJS, MongoDB, Gemini, Tavily, and Cloudinary. There are no queues, workers, vectors, embeddings, Redis, agent frameworks, domain adapters, or external-action automations.

## Requirements

- Node.js 24
- pnpm 11.12.0
- MongoDB Atlas or a compatible MongoDB instance
- Gemini Developer API key
- Tavily API key
- Cloudinary account

```bash
corepack enable
corepack prepare pnpm@11.12.0 --activate
pnpm install
cp .env.example .env
```

The existing local `.env` is already ignored. Do not commit it.

## Environment

| Variable                | Purpose                                                       |
| ----------------------- | ------------------------------------------------------------- |
| `NODE_ENV`              | `development`, `test`, or `production`                        |
| `PORT`                  | Nest API port; normally `4000`                                |
| `WEB_URL`               | Exact browser origin allowed by CORS                          |
| `NEXT_PUBLIC_API_URL`   | Browser-visible `/api/v1` base URL                            |
| `MONGODB_URI`           | MongoDB connection string                                     |
| `MONGODB_DB_NAME`       | Durable database name                                         |
| `JWT_ACCESS_SECRET`     | Random secret of at least 32 characters                       |
| `JWT_REFRESH_SECRET`    | A different random secret of at least 32 characters           |
| `JWT_ACCESS_TTL`        | Access JWT lifetime; normally `15m`                           |
| `JWT_REFRESH_TTL`       | Refresh JWT lifetime; normally `30d`                          |
| `GEMINI_API_KEY`        | Gemini Developer API key                                      |
| `GEMINI_MODEL`          | Structured multimodal model; currently `gemini-3.7-flash`     |
| `TAVILY_API_KEY`        | Tavily Search and Extract key                                 |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                                         |
| `CLOUDINARY_API_KEY`    | Server-side Cloudinary API key                                |
| `CLOUDINARY_API_SECRET` | Server-only Cloudinary secret; never expose it to the browser |
| `MAX_UPLOAD_MB`         | Evidence upload cap; normally `15`                            |
| `LIVE_PROVIDER_TESTS`   | Opt-in real provider smoke checks; default `false`            |

Environment parsing fails startup with invalid **variable names**, never their values.

## Provider setup

### Gemini

1. Create or select a Google AI Studio project.
2. Create an API key and set `GEMINI_API_KEY`.
3. Leave `GEMINI_MODEL=gemini-3.7-flash` unless the account no longer exposes it.
4. Verify availability with the [Gemini models documentation](https://ai.google.dev/gemini-api/docs/models) and [official JavaScript SDK guide](https://ai.google.dev/gemini-api/docs/libraries).

Recourse uses structured JSON output and validates it with Zod. Images and scanned PDFs are sent inline only after versioned user consent. Google states that unpaid Gemini usage may be used to improve products and may be human-reviewed; the product discloses this before the first AI operation. See [Gemini pricing and data-use notes](https://ai.google.dev/gemini-api/docs/pricing) and the [Gemini API terms](https://ai.google.dev/gemini-api/terms).

### Tavily

1. Create an API key in the Tavily dashboard.
2. Set `TAVILY_API_KEY`.
3. The runtime uses only basic Search and basic Extract—never Research or Crawl.

The first search is limited to five results and only the strongest one to three pages are extracted. A second search is permitted only when the first has no viable source. Successful procedure results are cached for seven days. Tavily documents a 1,000-credit monthly development allocation; see [API credits](https://docs.tavily.com/documentation/api-credits) and the [JavaScript SDK quick start](https://docs.tavily.com/sdk/javascript/quick-start).

### MongoDB Atlas

1. Create an Atlas project and free cluster.
2. Create a database user with access to the Recourse database.
3. Add the local/deployment IP to the network access list.
4. Put the driver connection string in `MONGODB_URI` and choose `MONGODB_DB_NAME`.

Recourse uses normal indexes and a maximum pool of 10 connections. Atlas Free currently has important limits and no built-in backups; review [Atlas free-cluster limitations](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

### Cloudinary

1. Create a Cloudinary account and open the API Keys page.
2. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`.
3. Keep the API secret server-only.

Uploads are server-side with opaque public IDs and authenticated delivery. Images use the image resource type; PDF, DOCX, and text use raw. Ownership is checked before a short-lived download is created. Permanent case/evidence deletion removes Cloudinary assets before database records. See the [Node SDK guide](https://cloudinary.com/documentation/node_integration), [upload guidance](https://cloudinary.com/documentation/upload_images), and [authenticated delivery controls](https://cloudinary.com/documentation/control_access_to_media).

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000/api/v1` by default.

Production builds:

```bash
pnpm build
pnpm start
```

## Product flow

1. Sign up and paste or describe the original decision.
2. Optionally add PDF, DOCX, TXT, PNG, JPEG, or WebP evidence.
3. Accept the concise AI processing disclosure before the first AI review.
4. Recourse understands the decision. If an essential fact is unknown, it saves progress and asks one focused question.
5. Recourse performs focused live process research, retains source provenance, extracts evidence, identifies gaps and contradictions, and shows readiness.
6. The user chooses **Draft email**, **Formal letter**, or **Ask Recourse** for case-aware portal wording.
7. The user performs the external action, then chooses **I've submitted** and records method, date, optional reference, and the exact version actually submitted.
8. The case waits without pretending to monitor the institution.
9. The user chooses **I received a response**, pastes or uploads it, and Recourse compares it with the immutable submitted version before suggesting a legitimate next user-controlled step.

Cases can also begin after a prior submission. Unknown facts are never filled in merely to complete a portal field. If no formal process can be verified, the UI says so plainly while keeping drafting and case-aware Q&A available.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
LIVE_PROVIDER_TESTS=true pnpm test:providers
```

The deterministic E2E server uses MongoDB in memory plus contract fakes for paid/external providers. It exercises the real REST API, persistence model, web UI, state machine, private upload path, PDF download, auth refresh, response continuation, mobile layouts, and accessibility checks. `test:providers` is a separate explicit live smoke test using only synthetic content.

## Security and privacy notes

- Passwords use Argon2id.
- Access JWTs live only in browser memory and expire after 15 minutes by default.
- Refresh JWTs rotate in an HttpOnly cookie; only token hashes are stored.
- Every case, document, chat, download, and deletion operation is owner-scoped.
- Evidence text and model reasoning are not intentionally logged.
- Provider failures are mapped to plain, retryable saved states.
- Uploaded evidence may be sensitive; unpaid Gemini is not an enterprise zero-retention service.
- Recourse is organizational and drafting support, not a replacement for qualified professional representation.
