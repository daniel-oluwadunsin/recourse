# Orion Agents submission packet — Recourse

This file is the copy-paste submission brief for the Orion Builder Hackathon. It is intentionally explicit about what Recourse does and does not do so the entry can score on usefulness, execution, and originality without making claims the product cannot support.

## Official hackathon context

The [official Orion Builder Hackathon page](https://orionagents.org/hackathon) says that every kind of AI agent is welcome, entries receive AI vetting and community upvotes, and partner judges assess usefulness, execution, and originality. The page also says submissions need a website, X profile, GitHub, and either Discord or Telegram; a demo link is strongly recommended; and each submitted agent completes the standard non-refundable ignition step of about $10 in ETH for AI vetting and onchain verification.

The [official submission page](https://orionagents.org/submit) shows the required fields for agent details, economics, social links, submitter information, logo, banner, and demo link.

## Copy-paste form values

### Agent details

**Agent Name**

```text
Recourse
```

**Description — maximum-detail form version**

```text
Recourse is an autonomous, evidence-first, domain-agnostic AI case-intelligence agent for people and small businesses facing consequential decisions from institutions. It exists for the moment an organization says “no,” “not approved,” “suspended,” “denied,” “revoked,” “held,” “terminated,” or “unsuccessful,” and the person affected is expected to respond even though the institution has the policy language, decision context, process knowledge, internal terminology, deadlines, and escalation routes. The user often has only a notice, a few scattered documents, limited time, and no reliable way to understand what matters. This is a procedural asymmetry and an information problem, not merely a writing problem. A generic appeal generator can produce a polished paragraph while still missing the actual reason, relying on an unverified procedure, omitting the decisive evidence, contradicting the user’s documents, or claiming an outcome that never happened. Recourse is designed to solve the complete case problem.

The user brings the original decision in the simplest form available: pasted text, a plain-language description, a screenshot, PDF, DOCX, TXT, PNG, JPEG, or WebP evidence. The user does not choose “insurance,” “education,” “marketplace,” “employment,” “finance,” or another hardcoded domain. Recourse extracts the generic structure shared by consequential cases: who made the decision, what changed, what reason was stated, when it happened, which reference or amount is involved, what jurisdiction may matter, what the user wants, and what critical facts are still unknown. Gemini converts this unstructured input into a structured case understanding and a clear human summary. If the institution or another essential fact cannot be identified reliably, the agent does not guess: it saves the case, asks one focused question, and pauses the workflow until the user answers.

Once the case has enough context, Recourse researches the current real-world procedure instead of relying on memory. It forms one focused query from the actual institution, decision, relationship or context, stated reason, and relevant jurisdiction. Tavily Search finds a small set of candidate pages; Recourse ranks official institutional guidance, regulators, government sources, ombudsman or dispute-resolution bodies, and strong secondary sources; it extracts only the strongest one to three pages; and it preserves source provenance. Gemini turns those sources into a plain-language procedure brief: whether a formal review, appeal, complaint, reconsideration, or response route could be verified; where it starts; what deadline is actually supported; which evidence is required or useful; and which parts remain uncertain. If a formal route cannot be responsibly verified, Recourse says so plainly instead of inventing an appeal process. Research is cached for seven days to reduce repeated work and protect the free-tier budget.

Recourse then analyzes the evidence as a connected case rather than treating files as a pile of attachments. It identifies facts that directly address the stated reason, relevant dates, entities, amounts and references, useful documents, missing evidence, contradictions, and a bounded chronology. It can use local extraction for ordinary text and documents and Gemini multimodal understanding for images and scanned pages. If two documents show different dates, it surfaces the discrepancy and asks whether the difference has an explanation; it does not silently choose whichever date makes the response stronger. If an invoice proves a supplier relationship but does not prove authorization, it distinguishes those claims. If the institution requests a document the user cannot obtain, Recourse keeps the gap visible and helps the user consider truthful alternatives. The result is a readiness state that is legible to a stressed person: Needs information, Building your case, Needs evidence, or Ready—not a misleading confidence percentage.

When the case is ready, Recourse gives the user control over the next form of help. The user can generate a grounded email with a subject, factual body, suggested attachments, references, and unresolved facts; generate a professional formal letter that can be previewed, copied, and downloaded as a PDF; or open Ask Recourse for case-aware intelligence. Ask Recourse is especially useful for portal questions such as “Why should this decision be reconsidered?”, “What document should I attach?”, or “How should I describe what changed?” The answer is composed from the current decision, research, evidence facts, clarifications, contradictions, timeline, prior submission, and previous responses. If the case does not contain the fact needed to answer, the agent says that explicitly and asks the user for it. It never turns a guess into a first-person statement on the user’s behalf.

The most important trust feature is the boundary around external action. Recourse prepares and assists, but the user performs the irreversible step. Recourse never sends email, submits a portal or form, clicks a third-party workflow, calls an institution, monitors an external system, or claims that an outside action succeeded. After acting externally, the user selects “I’ve submitted” and records the method, date, optional reference number, and whether they used the Recourse draft unchanged, changed it, or submitted something different. If the draft was changed, the user can paste or upload what was actually submitted. Recourse then preserves that actual submission as the source of truth for future reasoning rather than pretending the first generated draft was sent.

The case continues when the institution responds. The user returns and selects “I received a response,” then pastes or uploads the new message. Recourse compares the response with the original decision, the exact submitted version, relevant evidence, current procedural research, and prior case history. It extracts the outcome, newly stated reason, issues addressed, issues left unanswered, new evidence requests, changed institutional reasoning, and the next legitimate user-controlled route. The user can then draft again, generate another letter, ask a follow-up question, or close the case. This makes Recourse a durable multi-step agent for a real case, not a one-shot content generator that forgets what happened after its first answer.

The agent’s strategy is a bounded loop: observe → understand → ask → research → verify → analyze → prepare → checkpoint → continue. The next operation is selected from the current case state and the remaining unknowns. The MVP uses a small number of inspectable operations—understand case, extract evidence, extract procedure, analyze case, answer case question, draft email, draft formal letter, and analyze response—rather than hiding simple logic inside an opaque swarm. Gemini handles multimodal interpretation and structured reasoning. Tavily provides current external procedure material. MongoDB persists the case, evidence metadata, research, drafts, submission history, and response history. Cloudinary preserves original evidence through backend-controlled uploads. Structured AI responses are validated with Zod before they can influence the case state or appear as a trusted result.

Recourse is intentionally strict about evidence and uncertainty. It keeps three kinds of truth separate: case truth, meaning what the user’s evidence establishes; procedural truth, meaning what current retrieved sources establish; and user choice, meaning what the person decides to do. Documents and web pages are treated as untrusted data rather than instructions. Generated communication is a derived artifact, never evidence. Unsupported facts remain unknown. Conflicting procedure sources are ranked by authority, specificity, jurisdiction, and recency; when the conflict is too severe, the procedure remains unverified. The system can be helpful without manufacturing certainty, and it can be persuasive without becoming deceptive.

The competitive advantage is the combination of breadth, grounding, and continuity. Breadth comes from modeling the universal decision–evidence–procedure problem instead of building brittle adapters for a few platforms. Grounding comes from multimodal evidence analysis, source-ranked live research, provenance, explicit gaps, contradiction detection, and schema-validated outputs. Continuity comes from the actual-submission checkpoint and response comparison, which lets the agent reason from what the institution really received and how the institution’s explanation changed. Together, these features address the full procedural journey: understand first, find the current route, build the record, prepare a truthful response, preserve the external reality, and continue.

The product is useful across consumer advocacy, education, employment, public services, government benefits, finance, insurance, housing, immigration, telecom, marketplaces, creator platforms, and unfamiliar institutional decisions without requiring a domain to be preconfigured. A student can bring a scholarship termination, a seller can bring a marketplace suspension, an applicant can bring a refusal, a tenant can bring a housing decision, a worker can bring a disciplinary notice, and a small business can bring an account restriction. These are examples of the abstraction, not hardcoded workflows. The same agent asks: what happened, what can be established, what process applies, what is missing, what can be said truthfully, what was actually submitted, and what changed next?

This is agentic in the meaningful product sense: it interprets, plans bounded tool calls, retrieves current information, reasons over multimodal evidence, detects gaps, asks for human input when necessary, generates useful artifacts, persists state, and resumes after the world changes. It is not “autonomous” in the dangerous sense of taking an irreversible external action without approval. The user remains the decision-maker while Recourse supplies the procedural clarity and case memory that individuals normally lack.

The implementation is a deliberately small Next.js and NestJS monorepo using MongoDB, Gemini, Tavily Search and Extract, Cloudinary, Tailwind CSS, Zod, and Playwright. It has no vector database, embeddings, queues, workers, Redis, blockchain components, third-party browser automation, or hardcoded institutional adapters. This keeps the system understandable, testable, and resilient while putting complexity where it creates user value: multimodal case understanding, live procedure research, evidence reasoning, grounded drafting, and response continuity. The product is organizational and drafting support rather than professional legal, financial, immigration, medical, or other representation, and it clearly recommends qualified help when a case appears high-stakes.

Recourse’s core promise is simple: when a consequential decision makes the next step unclear, the agent helps a person build a truer case, find the best-supported path, prepare something they can stand behind, and keep going when the institution replies. It does not promise to win every case. It makes the user less dependent on opaque process, less likely to miss relevant evidence, less likely to repeat an unsupported claim, and more capable of making the next decision with context.
```

This description is deliberately long because the Orion form does not impose a text limit and the evaluator should see the full problem, solution, agent strategy, implementation, safety model, competitive advantage, and expected usefulness in one place. If the live form unexpectedly truncates input, prioritize the first six paragraphs through the sentence ending “one-shot letter generation” and then use the Long-form judge narrative below as supporting material.

### Agent strategy — judge-facing explanation

```text
Observe → understand → ask → research → verify → analyze → prepare → checkpoint → continue.

Recourse begins with the user’s actual decision instead of a fixed domain selection. It extracts a generic case model, pauses for essential missing facts, runs a focused live search for the current official process, analyzes bounded evidence, and chooses the next state from what is known and unknown. Gemini handles multimodal interpretation and structured reasoning; Tavily provides current source material; MongoDB persists the case; Cloudinary preserves original evidence. Each operation uses structured output validated by Zod. Documents and retrieved pages are treated as untrusted data, never as instructions. Procedural claims retain source provenance. If the system cannot verify a process or a fact, it says so and keeps the uncertainty visible. When the user prepares a response, Recourse can draft but cannot send or submit. The user records the method, date, and exact material actually submitted. When a response arrives, the agent compares it against that immutable submission, prior evidence, current procedure, and case history before proposing the next user-controlled step. The agent is autonomous in research, interpretation, gap detection, drafting, and continuity—not in irreversible external action.
```

## Classification and economics

### Important accuracy note

Recourse is **not** a yield-farming bot, trading agent, wallet manager, smart-contract executor, or DeFi product. The repository’s product rules explicitly exclude blockchain components. Do not describe it as one or imply that it moves funds.

The Orion form may require a blockchain, strategy, and category selection even though the hackathon page says every kind of agent is welcome. Use the closest truthful non-financial option available in the live form:

| Field | Recommended value |
| --- | --- |
| Target Blockchain | `Base` only as the portal’s required ecosystem metadata; Recourse itself is offchain and does not execute on Base |
| Strategy | `Research`, `Productivity`, `Consumer advocacy`, `Decision support`, or `Other`—choose the closest option actually offered |
| Category | `AI`, `Research`, `Productivity`, `Social`, or `Other`—choose the closest option actually offered |
| Revenue Sharing % | `20` if the intended economics are still 20% |
| Funding Target (USD) | `100000` if the intended target is still $100,000 |
| Token Symbol | Leave blank; Recourse has no token |

Do **not** leave the form on `Yield Farming` or `Yield` just because those values appear as defaults in a screenshot. A false financial classification can damage trust and makes the submission inconsistent with the working product. If the live form offers no truthful non-financial strategy/category, stop and contact Orion rather than submitting a false claim.

## Links

These are ready to paste:

| Field | Value |
| --- | --- |
| Website URL | `https://recourse.oluwadunsin.dev` |
| Demo Link | `https://youtu.be/cMCsYwh8BHU` |
| GitHub URL | `https://github.com/daniel-oluwadunsin/recourse` |
| Twitter / X URL | **ADD THE REAL PROJECT OR BUILDER X URL** |
| Discord URL | **ADD A REAL DISCORD INVITE** |
| Telegram URL | **OR ADD A REAL TELEGRAM URL; ONLY ONE OF DISCORD/TELEGRAM IS REQUIRED** |
| Email Address | **ADD THE SUBMITTER EMAIL USED FOR ORION REGISTRATION** |
| Wallet Address | `0x5772fCe11CC82E187c8c080eBFCd69ba5Bd8687b` |

Do not submit with the placeholder links from the form (`x.com/youragent`, `discord.gg/invite`, `t.me/youragent`, or `github.com/youragent`). GitHub, website, and demo are supplied; real X and Discord/Telegram details are still required before submission.

## Long-form judge narrative

### The problem

When a consequential decision lands in a person’s inbox, the institution has the advantage: it knows its own policy language, internal process, escalation routes, acceptable evidence, deadlines, and decision logic. The person often has one notice, scattered files, little time, and no reliable way to tell which sentence matters. Existing AI tools usually solve only the final presentation layer by drafting a generic appeal. That is too late and too shallow. A polished letter based on a misread decision, an unverified deadline, or an invented fact can make a difficult situation worse.

### The product

Recourse is a general-purpose case-intelligence agent for this gap. A user brings any consequential institutional decision—account restriction, denied claim, refused application, terminated scholarship, withheld payment, revoked access, employment decision, housing decision, government-benefit issue, marketplace dispute, or a case the builder never anticipated. The user does not pick a hardcoded domain. Recourse extracts a generic case model and researches the actual institution and current process.

The product builds a durable case in stages:

1. It understands the notice and summarizes what happened in plain language.
2. It asks a focused question if an essential fact is missing instead of guessing.
3. It researches the current official review, appeal, complaint, or response path using live Search and Extract.
4. It preserves source provenance and states plainly when a process could not be verified.
5. It reads multimodal evidence and identifies useful documents, missing evidence, contradictions, dates, entities, and a bounded chronology.
6. It shows readiness with human labels such as Needs information, Needs evidence, or Ready.
7. It gives the user three controlled options: draft an email, generate a formal letter, or ask a case-aware question such as a portal response.
8. It records the exact material the user actually submitted, including changes made outside Recourse.
9. It continues when the user returns with a response, comparing the new reasoning against the original decision, evidence, procedure, and actual submission.

### Why the loop is agentic

The agent is not merely completing a text prompt. It decides which bounded operation is appropriate for the current case state, persists intermediate conclusions, pauses when it needs a user fact, invokes live research when the procedure is current and external, analyzes document evidence, generates derived artifacts, and re-plans after a new institutional response. The workflow is autonomous in the parts where AI is useful—interpretation, retrieval, comparison, gap detection, and drafting—while deliberately stopping at irreversible user actions.

### Why the design is trustworthy

Recourse separates three kinds of truth:

- **Case truth:** what user evidence establishes;
- **Procedural truth:** what current retrieved sources establish;
- **User choice:** what the person decides to do.

It never treats a generated letter as evidence. It does not convert an inference into a fact. It does not silently resolve a material contradiction. It does not invent an official appeal route when research fails. It does not claim “submitted” because a button was clicked. The user must confirm the external action and can preserve the exact version sent. That version becomes the basis for later response analysis.

### Why it is broadly useful

The common need is not tied to one vertical. The common need is a person facing an institutional decision and needing clarity, evidence organization, current procedure, and a next move. This makes Recourse useful across consumer advocacy, education, employment, public services, finance, insurance, platforms, marketplaces, housing, and unfamiliar cases without building a brittle collection of adapters.

### Technical execution

The MVP is a deliberately small Next.js and NestJS monorepo. Gemini handles multimodal structured case operations and is validated with Zod. Tavily Search and Extract provide current procedure sources, with small result limits and seven-day caching to respect the 1,000-credit monthly development allocation. MongoDB stores the bounded case state and history. Cloudinary stores original evidence through backend-controlled uploads with ownership checks and correct raw/image resource handling. Playwright exercises the complete lifecycle and responsive states. There are no vectors, embeddings, queues, workers, Redis, browser automation, or agent framework hiding the logic.

### Why this matters now

As institutions automate more decisions, the individual’s need is not only “write better.” It is “help me understand the decision, find the real process, preserve what I can prove, and continue when the explanation changes.” Recourse is a procedural intelligence layer for that moment. It gives a person a structured, source-aware, evidence-grounded path through a situation that otherwise feels opaque—while keeping the final decision and external action human-controlled.

## Demo walkthrough

Use the [live product](https://recourse.oluwadunsin.dev) and [demo video](https://youtu.be/cMCsYwh8BHU) as the primary proof points. The judge should see:

1. A user starts from what happened, without choosing a domain.
2. The product extracts a case summary and exposes the next required input.
3. Evidence and current process research become visible in one workspace.
4. The product identifies what is useful, missing, or contradictory.
5. The user asks a portal-style question and receives a grounded answer.
6. Recourse drafts an email or formal letter without sending it.
7. The user confirms what they actually submitted.
8. A later response continues the same case instead of starting over.

When using the public demo, use only synthetic/non-sensitive information. The app’s Gemini disclosure is intentional because unpaid Gemini usage is not an enterprise zero-retention mode.

## 30-second verbal pitch

```text
Recourse is the case-intelligence layer for the moment an institution says no. Bring the notice and your evidence; Recourse understands the decision, asks for what is missing, verifies the current process, finds contradictions, and prepares a response you can stand behind. It can draft the email, formal letter, or portal answer—but you stay in control of what leaves the product. When the institution replies, Recourse continues the same case from the exact version you submitted. It is useful across domains because it models the decision-and-evidence problem, not a list of platforms.
```

## Suggested launch post

```text
We built Recourse: an evidence-first AI case-intelligence agent for when an institution says no.

It understands the decision, verifies the live process, finds gaps and contradictions, drafts grounded responses, and continues the same case after a reply.

It never sends or submits for you. You stay in control.

Demo: https://youtu.be/cMCsYwh8BHU
Live: https://recourse.oluwadunsin.dev
Source: https://github.com/daniel-oluwadunsin/recourse
```

## Asset files

| Asset | Path | Use |
| --- | --- | --- |
| Square logo | [`apps/web/public/brand/recourse-logo.png`](../apps/web/public/brand/recourse-logo.png) | Orion agent logo; PNG with alpha, 1254×1254 |
| Wide banner | [`apps/web/public/brand/recourse-banner.png`](../apps/web/public/brand/recourse-banner.png) | Orion agent page/banner; PNG, 1672×941 |

The art direction is aligned with the product: paper, ink, evidence fragments, a red route through uncertainty, and a blue forward path. It avoids crypto symbols and avoids implying automatic external action.

## Final preflight checklist

- [ ] Register the wallet before submitting; Orion says registration is a wallet signature and email/name step.
- [ ] Confirm the connected wallet is `0x5772fCe11CC82E187c8c080eBFCd69ba5Bd8687b`.
- [ ] Add the real submitter email.
- [ ] Replace the X placeholder with a real project or builder profile.
- [ ] Add a real Discord or Telegram link.
- [ ] Paste the supplied GitHub, website, and YouTube URLs exactly.
- [ ] Upload `recourse-logo.png` as the square logo.
- [ ] Upload `recourse-banner.png` as the wide banner.
- [ ] Choose a truthful research/productivity/AI category if offered; do not submit Recourse as Yield Farming.
- [ ] Leave Token Symbol blank unless a real token exists and is part of the product.
- [ ] Verify the live deadline and countdown on the [official hackathon page](https://orionagents.org/hackathon); the page currently lists September 2 at 23:59 UTC as the submission deadline.
- [ ] Budget for the non-refundable ignition step shown by Orion at roughly 0.004 ETH / about $10.
- [ ] Do one final anonymous/incognito pass through the live site and demo URL.
- [ ] Submit only synthetic/non-sensitive demo content.
