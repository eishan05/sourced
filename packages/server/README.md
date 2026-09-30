# `@sourced/server`

Server-side prompting, model adapters, verification, and streaming HTTP handlers for `sourced`.

## Example

```ts
import { createOpenRouterAdapter } from "@sourced/server";
import { createNextFillRoute } from "@sourced/server/next";

export const runtime = "nodejs";
export const { POST } = createNextFillRoute({
  adapter: createOpenRouterAdapter(),
});
```

## Modes

`fill` verifies and streams proposals, questions, flags, and `no_evidence`. `check` examines `currentValues` for inconsistencies and has no fill targets: the server drops every model proposal as `dropped` with reason `check-mode`, even if an adapter emits one, and forwards only verified `flag`, `question`, and `no_evidence` items before `done`.

## Exports

### Final submission validation

`validateSubmission(form, input)` takes a trusted server-owned form and an unknown values payload. It returns `SubmissionValidation`: `{ success: true, values }` or `{ success: false, issues: SubmissionIssue[] }`. Each issue includes a code, message, severity, and optional `fieldId`. It rejects unknown keys and malformed payloads, validates visible fields without coercion (including custom validators), omits hidden fields, and supplies `null` for missing optional values.

This helper does not authenticate, persist, or certify AI review. See the [integration example](../../docs/submissions.md). The fill handler enforces policies from its supplied definition; protect the route and resolve trusted definitions in your host application where policy integrity is required.

### Evidence and check failures

Extraction uses deterministic matching against located source text for every field type. Numeric and date quotes must be complete expressions; booleans must be explicit; options must match declared labels or values. Unsupported values become inferences or questions according to field policy. Supported date normalization is exposed in provenance. Quote matching does not prove semantic correctness.

A normally completed empty check returns `done`. A first-result timeout returns a retryable `error`, never a successful empty check. Run live model tests separately with `pnpm --filter @sourced/server test:live`; ordinary tests do not contact providers.

### Fill and HTTP

| Export | Description |
| --- | --- |
| `fill`, `FillOptions` | Runs the model and server verification pipeline as an async event stream. |
| `FillRequestError` | Error thrown when a direct `fill` request fails schema validation. |
| `createFillHandler`, `FillHandlerOptions` | Creates a framework-neutral POST handler with body limits and pings. |
| `toNdjsonResponse` | Turns fill events into an abortable NDJSON `Response`. |
| `buildPrompt` | Builds the system and user prompts for fill or check mode. |
| `FillItemSchema`, `FillItem` | Zod schema and type for one raw model item. |
| `FillRequestSchema` | Zod schema for client fill requests. |
| `SERVER_VERSION`, `CORE_VERSION` | Server and linked core version constants. |

### Model adapters

| Export | Description |
| --- | --- |
| `ModelAdapter` | Provider-neutral interface that streams item, usage, and error events. |
| `ModelStreamEvent` | Adapter event union. |
| `createOpenRouterAdapter` | Creates the default OpenRouter-backed AI SDK adapter. |
| `OpenRouterAdapterOptions` | API key, model, effort, and parameter-routing options. |
| `OpenRouterReasoningEffort` | `none`, `minimal`, `low`, `medium`, or `high`. |
| `createAISDKAdapter` | Wraps any AI SDK `LanguageModel` as a `ModelAdapter`. |
| `createFakeAdapter` | Replays scripted items, delays, errors, and optional usage for tests. |

### Verification pipeline

| Export | Description |
| --- | --- |
| `runPipeline`, `PipelineState`, `PipelineContext` | Runs shape, coercion, quote, policy, and dedupe stages with streaming state. |
| `validateShape` | Rejects malformed, unknown, and human-policy targets. |
| `coerceItem` | Normalizes values and enforces declared validation constraints. |
| `locateItem`, `locateModelQuote` | Resolves model quotes to trusted source spans. |
| `enforcePolicy` | Downgrades ungrounded extraction and turns forbidden inference into questions. |
| `dedupe`, `DedupeResult` | Keeps one proposal per field and emits the preferred result. |
| `finalizeQuestion` | Validates evidence options, IDs the question, and enforces the cap. |
| `finalizeFlag` | Filters field IDs and IDs a flag. |
| `PipelineResult` | Success-or-dropped result shared by pipeline stages. |
| `ValidatedItem`, `ValidatedProposal`, `ValidatedQuestion`, `ValidatedFlag`, `ValidatedNoEvidence` | Shapes after raw structural and policy checks. |
| `CoercedItem`, `CoercedProposal`, `CoercedQuestion` | Shapes after field-aware value normalization. |
| `LocatedItem`, `LocatedProposal` | Shapes after quote location. |
| `EnforcedItem`, `ProposalDraft`, `QuestionDraft` | Policy-safe shapes ready to become protocol events. |

## `@sourced/server/next`

| Export | Description |
| --- | --- |
| `createNextFillRoute` | Returns a Next.js App Router-compatible `{ POST }` without taking a Next dependency. |
