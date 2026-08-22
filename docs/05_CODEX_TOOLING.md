# Recourse — Codex Tooling

## Required

No MCP is required for the product runtime.

## Strongly recommended during development

### Playwright

Required for functional and visual E2E validation.

Use Playwright browser screenshots/inspection after implementation, not only unit tests.

### Official documentation access

Codex must read current official documentation for:

- Gemini
- Tavily
- Cloudinary
- MongoDB
- Next.js
- NestJS

## Cloudinary agent skill

Cloudinary currently provides Agent Skills for coding assistants. If Codex can install/use the official Cloudinary skill safely, it may help ensure current upload patterns are correct.

This is optional.

The implementation itself must use the official Cloudinary SDK/API, not depend on the skill.

## Do not install unnecessarily

Avoid:

- LangChain/LlamaIndex unless clearly required;
- generic agent framework;
- vector database tooling;
- Redis/queue tooling;
- Web3 MCPs;
- browser automation for third-party appeal submission.

The product is agentic because the AI researches, interprets, reasons and continues a case — not because an agent framework is installed.
