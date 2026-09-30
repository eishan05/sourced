# sourced

`sourced` turns pasted text and documents into reviewable form answers. Define a typed form once, mount one streaming route, and render either the styled React kit or your own UI over the headless state APIs.

It is built around evidence and human control rather than a chat box. Extracted values point back to source spans, inferred values are visibly distinct, field policies constrain what the model may touch, and submission waits for review, answers, validation, and server-side checks.

## Next.js quick start

Install the three runtime packages:

```sh
pnpm add @sourced/core @sourced/react @sourced/server
```

Define a form in `app/contact-form.ts`:

```ts
import { defineForm } from "@sourced/core";

export const contactForm = defineForm({
  id: "contact",
  title: "Contact form",
  version: 1,
  sections: [
    {
      id: "contact",
      title: "Contact",
      fields: [
        { id: "name", type: "text", label: "Name", required: true },
        { id: "email", type: "email", label: "Email", required: true },
        {
          id: "summary",
          type: "textarea",
          label: "Short bio",
          policy: "infer",
        },
        {
          id: "consent",
          type: "boolean",
          label: "I consent",
          policy: "human",
          required: true,
        },
      ],
    },
  ],
});
```

Mount the fill endpoint at `app/api/ai-forms/fill/route.ts`:

```ts
import { createOpenRouterAdapter } from "@sourced/server";
import { createNextFillRoute } from "@sourced/server/next";

export const runtime = "nodejs";
export const maxDuration = 60;

export const { POST } = createNextFillRoute({
  adapter: createOpenRouterAdapter(),
});
```

Add a validation-only endpoint at `app/api/contact/route.ts`:

```ts
import { validateSubmission } from "@sourced/server";
import { contactForm } from "../../contact-form";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = validateSubmission(contactForm, input);
  return Response.json(result, { status: result.success ? 200 : 422 });
}
```

This endpoint validates without saving. For a real submission, follow the [authorization and persistence integration example](docs/submissions.md).

Import the kit stylesheet once in `app/layout.tsx`, then render `app/page.tsx`:

```tsx
// app/layout.tsx
import "@sourced/react/kit.css";
```

```tsx
// app/page.tsx
"use client";

import { createFetchTransport } from "@sourced/core";
import { AIFormProvider, useAIForm } from "@sourced/react";
import { AIFormShell, KitForm } from "@sourced/react/kit";
import { contactForm } from "./contact-form";

const transport = createFetchTransport("/api/ai-forms/fill");

export default function Page() {
  const form = useAIForm({
    form: contactForm,
    transport,
    onSubmit: async (values) => {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error("Server validation failed. Check your answers and retry.");
    },
  });

  return (
    <AIFormProvider api={form}>
      <AIFormShell>
        <KitForm>
          {form.submit.status === "submitted" && <p>Validated on server. This example does not save submissions.</p>}
        </KitForm>
      </AIFormShell>
    </AIFormProvider>
  );
}
```

Set `OPENROUTER_API_KEY`, run `pnpm dev`, paste some text into Sources, and add it. Filling starts automatically.

## Trust model

Every populated value carries provenance:

- `extracted`: matched against a located source span, including supported formatting normalization. The UI can take the user back to the exact evidence.
- `inferred`: derived, summarized, guessed, or not verifiable by deterministic matching. It is marked separately and must be reviewed.
- `answered`: chosen by the user in response to an AI-generated ambiguity question.
- `user`: typed by the user or deliberately copied from a source selection.
- `prefill`: supplied by application code as an initial value.

Field `policy` is the server-enforced ceiling on AI behavior:

- `extract` (default): direct evidence may become a proposal; an inference is converted into a question instead of silently filling the field.
- `infer`: extracted and inferred proposals are allowed, but remain review-gated.
- `human`: proposals, questions, and flags targeting the field are dropped. Only the person can provide it.

The server does not trust model output. It validates the request and every streamed item, rejects unknown and `human` fields, coerces values to the declared type, checks constraints and option membership, locates quotes in supplied sources, downgrades ungrounded “extracted” claims, deduplicates proposals, caps questions, and enforces input limits. In `check` mode it drops every proposal with reason `check-mode`; only flags, questions, and `no_evidence` can pass through.

Numbers require a complete numeric quote; dates require one date expression normalized using `today`; booleans require explicit yes/no or true/false expressions. Choices must match declared option labels or values, and each multiselect value must be supported by the quoted list. Month-only dates retain the first-of-month convention and show normalization. Unsupported interpretations lose the extracted label. These checks establish correspondence to quoted text, not the truth or full meaning of the source.

Submit is blocked while any visible field has an unreviewed AI value, unanswered question, missing required value, validation error, or unacknowledged error flag. Warnings do not block. Hidden fields do not create review blockers. By default the client runs a fresh server `check` immediately before `onSubmit` and blocks if it fails or if values or sources change during the check. The server submission validator excludes hidden fields from its returned values. Authorize and persist only server-validated values in your own server action or API.

**Migration:** check failures previously allowed submission. The new default is `checkFailurePolicy: "block"`. Set `checkFailurePolicy: "allow"` to explicitly retain submission during AI outages; the kit displays a notice that checking did not complete. Existing blockers still apply. `checkBeforeSubmit: false` disables checking entirely. Neither setting replaces final server validation.

## Configuration

`createOpenRouterAdapter()` reads:

- `OPENROUTER_API_KEY` (required): your OpenRouter API key; keep it server-only.
- `SOURCED_MODEL` (optional): model ID; default `openai/gpt-5.6-luna`.

Reasoning effort can be `none`, `minimal`, `low`, `medium`, or `high`:

```ts
const adapter = createOpenRouterAdapter({
  model: process.env.SOURCED_MODEL,
  effort: "low",
});
```

Luna defaults to `none` (no reasoning). For a cheaper, faster option use `z-ai/glm-5.3-flash`, which defaults to `minimal` because it rejects `none`. Pass `effort: null` to leave effort unset. `requireParameters` defaults to `true` so OpenRouter chooses providers that support the requested structured parameters.

`z-ai/glm-5.3-flash` is served by many OpenRouter providers with very different speeds, so the adapter asks for `Friendli`, then `Together`, then `Fireworks` first (about 1 s to the first field, 3 s overall on the bundled resumes) and lets OpenRouter fall back to the rest. Pass `routing: { order: [...] }` to choose your own providers, or `routing: null` to use OpenRouter's default routing.

To bring any AI SDK `LanguageModel`, adapt it directly:

```ts
import { createAISDKAdapter } from "@sourced/server";
import { createOpenAI } from "@ai-sdk/openai";

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
const adapter = createAISDKAdapter(openai("gpt-5.1"), {
  temperature: 0,
});
```

## Wire protocol

The client sends JSON with `Content-Type: application/json`; the route streams newline-delimited JSON with `Content-Type: application/x-ndjson`.

| Message | Direction | Required shape | Meaning |
| --- | --- | --- | --- |
| fill request | client → server | `{ form, sources, mode, currentValues?, today }` | Serialized definition, normalized sources, `fill` or `check`, current values, and ISO date context. |
| `start` | server → client | `{ type, fillId, targetFieldIds }` | Opens a run; check runs have no target fields. |
| `proposal` | server → client | `{ type, proposal }` | Verified extracted or inferred value with provenance. Never emitted in check mode. |
| `question` | server → client | `{ type, question }` | Requests a human choice or free-text answer. |
| `flag` | server → client | `{ type, flag }` | Reports a warning or blocking contradiction. |
| `no_evidence` | server → client | `{ type, fillId, fieldId }` | Records that a field has no usable evidence. |
| `dropped` | server → client | `{ type, fillId, fieldId?, reason, detail? }` | Explains rejected model output (`policy_human`, `quote_not_found`, `invalid_value`, `unknown_field`, `malformed`, or `check-mode`). |
| `ping` | server → client | `{ type: "ping" }` | Keeps a quiet stream alive. |
| `done` | server → client | `{ type, fillId, counts, usage? }` | Completes the stream with accepted item counts and optional tokens. |
| `error` | server → client | `{ type, fillId, message, retryable }` | Terminates the run with a bounded error message. |

See the [core README](packages/core/README.md) for protocol types and parsing helpers.

## Evaluation

With `OPENROUTER_API_KEY` set, evaluate the default job-application fixtures:

```sh
pnpm --filter @sourced/server eval:fill
```

Normal `pnpm test` runs deterministic tests without contacting a model. Run credential-dependent model tests explicitly with `pnpm --filter @sourced/server test:live` after building the workspace packages.

Choose the medical intake form, model, effort, or one fixture:

```sh
pnpm --filter @sourced/server eval:fill -- --form medical-intake
pnpm --filter @sourced/server eval:fill -- --model z-ai/glm-5.3-flash --effort minimal
pnpm --filter @sourced/server eval:fill -- --form medical-intake --fixture maya
```

Add `--record` to save raw replay JSONL under `packages/server/fixtures/replays/<model>/`.

## Packages and apps

- [`packages/core`](packages/core/README.md): form definitions, validation, provenance state, selectors, protocol, and fetch transport.
- [`packages/server`](packages/server/README.md): prompts, verification pipeline, model adapters, NDJSON handler, and Next.js route helper.
- [`packages/react`](packages/react/README.md): headless hooks/components, styled kit, review flow, and PDF extraction.
- [`packages/examples`](packages/examples/README.md): job application and medical intake definitions, prose fixtures, and gold labels.
- `apps/playground`: Next.js app with `/job-application` and `/medical-intake` demos.

## Development

Requires Node.js 22+ and pnpm 10.26.0.

```sh
pnpm install       # install the workspace
pnpm dev           # build dependencies, then run watchers and the playground
pnpm lint          # Biome checks
pnpm typecheck     # TypeScript checks
pnpm test          # Vitest suites
pnpm build         # package and Next.js production builds
pnpm check         # lint + typecheck + test + build
pnpm --filter playground e2e  # Playwright smoke test in system Chrome
```

API details live in the package READMEs linked above.
