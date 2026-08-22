# Recourse — Environment and Provider Notes

## 1. Existing `.env`

The repository already contains an `.env` from a previous build.

Codex must treat it carefully.

### Required process

1. read variable **names**;
2. do not echo secret values;
3. inspect code requirements;
4. reuse existing correct credentials;
5. remove stale variables after implementation;
6. add only required variables;
7. produce `.env.example` with blank values;
8. report removed variable names only.

## 2. Expected final env surface

The exact list may differ slightly, but the final MVP should be close to:

```dotenv
NODE_ENV=development
PORT=4000
WEB_URL=http://localhost:3000
API_URL=http://localhost:4000

MONGODB_URI=
MONGODB_DB_NAME=recourse

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

GEMINI_API_KEY=
# Optional ordered fallbacks: GEMINI_API_KEY_2, GEMINI_API_KEY_3, ...
GEMINI_API_KEY_2=
GEMINI_MODEL=gemini-3.7-flash

TAVILY_API_KEY=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

MAX_UPLOAD_MB=15
```

Do not add Redis, Groq, R2, Voyage or vector envs.

## 3. Gemini

### Current model direction

As of August 22, 2026, Google documents `gemini-3.7-flash` as a current Flash model with free-tier input/output availability.

Codex must re-check the current official model list before implementation.

Official docs:

- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs

### Required capabilities

The chosen model must support:

- text;
- image/document understanding;
- structured output;
- reasoning suitable for case analysis.

### Free-tier privacy

Google's current pricing documentation states free-tier submitted content is used to improve products.

This matters for Recourse.

Implement/document:

- concise consent before AI processing of real evidence;
- synthetic demo fixtures;
- no misleading privacy claims.

If the product later moves to sensitive production use, reassess paid/privacy/compliance configuration.

## 4. Tavily

Official docs currently state:

- 1,000 free API credits/month;
- no credit card required for the free allocation;
- Basic Search = 1 credit;
- Advanced Search = 2 credits;
- Basic Extract = 1 credit per 5 successful URLs;
- Advanced Extract = 2 credits per 5 successful URLs.

Source:
https://docs.tavily.com/documentation/api-credits

### MVP usage policy

Per initial case research, target:

- 1 basic search;
- max ~5 results;
- extract best 1–3 URLs;
- only retry/search again when necessary.

Cache successful research.

Do not use Tavily Research endpoint.

## 5. Cloudinary

Use Cloudinary Node SDK.

Docs:

- https://cloudinary.com/documentation/node_integration
- https://cloudinary.com/documentation/node_image_and_video_upload
- https://cloudinary.com/documentation/image_upload_api_reference

Cloudinary supports uploads of images, videos and other file types. For documents/PDFs, use the correct raw/image resource configuration based on the current docs and desired delivery behavior.

### Security

- API secret server only;
- signed/backend upload;
- validate file before upload;
- sanitize filename metadata;
- use asset/public IDs generated/controlled by backend;
- delete assets when case is permanently deleted.

## 6. MongoDB Atlas

Use existing/free Atlas setup.

No vector indexes.

Keep original files in Cloudinary, not MongoDB.

## 7. Local commands

Codex should implement a root experience approximately like:

```bash
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

Do not require several terminals/services beyond web + API.

## 8. Free-tier resilience

Provider failures should never lose saved case state.

Handle:

- Gemini quota/rate limit;
- Tavily quota/rate limit;
- Tavily no sources;
- Cloudinary failure;
- malformed Gemini structured output.

Use bounded retries.

No retry storms.
