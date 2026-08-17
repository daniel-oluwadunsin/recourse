# Recourse — MCP, Skills, and Codex Tooling Recommendations

**Version:** 1.0  
**Date:** 2026-08-16

The goal is not to install every available tool. Codex's own current best-practice guidance recommends adding tools only when they unlock a real workflow and starting with one or two high-value integrations.

For Recourse, the high-value needs are:

1. reliable browser/E2E inspection;
2. current documentation/research while implementing provider integrations;
3. security review before release.

---

# 1. Required: repository-root `AGENTS.md`

This is not an MCP server, but it is more important than any MCP.

OpenAI Codex currently reads `AGENTS.md` before work and supports layered repository instructions. The bundle contains `03_AGENTS.md`; copy it to:

```text
<repo-root>/AGENTS.md
```

Do not leave it under `docs/` only.

Why it matters:

- prevents Codex from turning Recourse into a generic chatbot;
- preserves no-mock/runtime constraints;
- enforces evidence/procedure provenance;
- keeps architecture consistent across follow-up phases;
- makes every new Codex session inherit the product's engineering rules.

Official reference:

https://developers.openai.com/codex/agent-configuration/agents-md

---

# 2. Strongly recommended MCP: Playwright MCP

## Why

Recourse has a complex interactive frontend:

- case intake;
- file uploads;
- real async processing;
- SSE activity;
- source/provenance panels;
- React Flow graph;
- approval gates;
- error/uncertainty states.

Codex should be able to open the running product, navigate it, inspect accessibility snapshots, interact with forms, and catch real integration/UI defects.

Playwright's official MCP server provides browser automation through structured accessibility snapshots and works with MCP clients such as Codex.

Official docs:

https://playwright.dev/docs/getting-started-mcp

## Installation with Codex CLI

Codex supports STDIO MCP servers via:

```bash
codex mcp add <server-name> -- <server-command>
```

Recommended:

```bash
codex mcp add playwright -- npx -y @playwright/mcp@latest
```

Then verify:

```bash
codex mcp list
```

Inside Codex TUI:

```text
/mcp
```

## Usage expectations

Use Playwright MCP primarily in frontend and final E2E phases:

- inspect actual pages;
- navigate complete flow;
- verify loading/error states;
- check accessibility;
- inspect console/network failures;
- confirm responsive behavior.

**Do not use its network mocking capability to make the live application appear integrated.** Runtime/product verification must hit the real Recourse API and real configured providers.

Test-only mocks inside isolated Playwright tests are acceptable when explicitly testing UI edge states, but there must also be real integration/E2E coverage.

---

# 3. Strongly recommended skills: Tavily Agent Skills

Tavily publishes official Agent Skills for coding agents including Codex.

Official docs:

https://docs.tavily.com/documentation/agent-skills

Available relevant skills currently include:

- `tavily-search`
- `tavily-extract`
- `tavily-crawl`
- `tavily-map`
- `tavily-best-practices`

These are useful while Codex is implementing the live Procedural Intelligence Engine because it can inspect current Tavily behavior/docs and use the same conceptual workflow the product needs.

## Install Tavily CLI

Follow the current Tavily docs. At time of writing they document:

```bash
curl -fsSL https://cli.tavily.com/install.sh | bash
```

## Install skills

The Tavily docs currently use the agent-skills installer:

```bash
npx skills add tavily-ai/skills --skill tavily-search
npx skills add tavily-ai/skills --skill tavily-extract
npx skills add tavily-ai/skills --skill tavily-map
npx skills add tavily-ai/skills --skill tavily-crawl
npx skills add tavily-ai/skills --skill tavily-best-practices
```

Restart Codex if the skills are not detected.

A full `--all` install exists in Tavily docs, but Recourse does not need every Tavily skill simply because it is available. `tavily-research` is optional.

Set your local Tavily key according to the CLI docs; never commit it.

---

# 4. Recommended optional MCP: Context7

Codex's official MCP documentation currently uses Context7 as its example developer-documentation MCP server.

This is optional because Tavily/web access may already be sufficient, but Context7 is helpful when Codex needs current library/framework documentation without depending on model memory.

Install using the command shown in Codex's official docs:

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
```

Useful for checking current:

- Next.js APIs;
- NestJS packages;
- Mongoose;
- BullMQ;
- Zod;
- other package behavior.

Do not make Context7 a production dependency of Recourse. It is a development tool for Codex.

Official Codex MCP reference:

https://developers.openai.com/codex/mcp

---

# 5. Strongly recommended later: Codex Security plugin/CLI

Recourse processes private documents and executes consequential actions. A serious security pass is worthwhile before launch.

Codex Security is currently available as a Codex plugin/CLI for scanning owned repositories and producing vulnerability findings/remediation guidance.

Official docs:

- https://developers.openai.com/codex/security
- https://developers.openai.com/codex/security/plugin
- https://developers.openai.com/codex/security/cli

## When to install/use

Do **not** let a security scan replace normal secure engineering.

Use after the core architecture exists, especially around Prompt 12/13.

Codex CLI flow currently supports:

```text
/plugins
→ search Codex Security
→ install
```

Then a repository can be scanned from Codex.

Review findings manually. Do not blindly accept patches.

Focus the threat model on:

- auth/IDOR;
- SSRF;
- signed URL leakage;
- prompt injection;
- file parsers;
- webhook forgery;
- action replay;
- PII/logging;
- queue/idempotency races;
- secrets.

---

# 6. Optional: GitHub Codex review integration

Not required to build locally.

If the repository is on GitHub and you want a second review pass, Codex currently supports GitHub pull-request review and a Codex GitHub Action.

Official docs:

- https://developers.openai.com/codex/third-party/github
- https://developers.openai.com/codex/github-action

This can be useful after the repo is stable, but it does not replace CI/tests/security scanning.

---

# 7. Custom Recourse skill — not required initially

OpenAI Codex supports repository skills under:

```text
<repo-root>/.agents/skills/<skill-name>/SKILL.md
```

Skills are best for repeatable workflows. Do not prematurely convert the whole PRD into a giant skill; `AGENTS.md` already carries project-wide rules.

After the project matures, consider narrow skills such as:

## `recourse-live-provider-check`

Triggers when verifying Groq/Tavily/storage/provider connectivity and forces safe non-destructive checks.

## `recourse-security-review`

Runs the project's specific trust-boundary checklist before a sensitive change.

## `recourse-ai-eval`

Runs golden cases, grounding metrics, and prompt/schema regression checks after AI prompt/model changes.

These should be created only after the commands/workflow exist and are stable.

OpenAI's current skill guidance explicitly recommends keeping each skill scoped to one job and turning repeatable work into a skill after the workflow works reliably.

Official reference:

https://developers.openai.com/codex/build-skills

---

# 8. MCP servers that are NOT necessary initially

Do not add tools merely because they sound powerful.

## Database MCP

Not needed. Codex can operate through repository scripts and the MongoDB driver/tooling. Giving a coding agent broad production database MCP access increases risk.

If ever added, connect only to local/staging and use least privilege.

## Cloud-provider MCP

Not required for initial development. Deployment can use CLI/config once a provider is selected.

## Figma MCP

Optional only if there is an actual Figma design source. It does not improve backend architecture.

## Generic filesystem MCP

Codex already works in the repository.

## Browser-scraping MCP for Recourse runtime

Do not confuse development MCP with product integrations. Recourse runtime should use explicit provider interfaces and documented external capabilities.

---

# 9. Suggested Codex configuration order

Minimal high-value setup:

```text
1. AGENTS.md
2. Tavily skills
3. Playwright MCP
```

Optional after that:

```text
4. Context7 MCP
5. Codex Security plugin
6. GitHub Codex review
```

This follows Codex's current best-practice principle: add tools only when they remove a real manual loop.

---

# 10. Example Codex project-scoped MCP configuration

Codex currently supports project-scoped `.codex/config.toml` for trusted projects. If you prefer project-local config rather than global CLI registration, confirm the current config schema in the official Codex docs before committing anything.

Conceptually:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

Do not commit secrets inside this file. Use allowed environment forwarding where a server needs credentials.

Codex official MCP documentation:

https://developers.openai.com/codex/mcp

---

# 11. Development tools vs production dependencies

Keep the boundary explicit:

| Tool | Used by Codex while building? | Used by Recourse runtime? |
|---|---:|---:|
| AGENTS.md | Yes | No |
| Tavily skills | Yes | No |
| Tavily API | Maybe for testing | **Yes** |
| Playwright MCP | Yes | No |
| Playwright Test | Yes | Test/CI only |
| Context7 MCP | Optional | No |
| Codex Security | Recommended | No |
| Groq API | Live tests | **Yes** |
| MongoDB Atlas | Dev/staging | **Yes** |
| Redis/BullMQ | Dev/staging | **Yes** |
| cloudinary | Dev/staging | **Yes** |

---

# 12. Final recommendation

You do **not** need a huge MCP stack to build Recourse properly.

Use:

- `AGENTS.md` for project behavior;
- Tavily's official skills for provider/research workflows;
- Playwright MCP for real browser inspection;
- optionally Context7 for current package docs;
- Codex Security after the codebase contains enough surface area to scan.

The quality of Recourse will come from the architecture, test discipline, provenance model, and real provider integrations—not the number of MCP servers installed.
