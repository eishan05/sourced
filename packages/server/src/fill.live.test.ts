import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  createSource,
  type FillEvent,
  type FillRequest,
  serializeForm,
} from "@sourced/core";
import { jobApplicationForm, loadGold, loadResume } from "@sourced/examples";
import { expect, it } from "vitest";

import { fill } from "./fill";
import { createOpenRouterAdapter } from "./model/openrouter";

const envPath = fileURLToPath(
  new URL("../../../apps/playground/.env.local", import.meta.url),
);
if (existsSync(envPath)) process.loadEnvFile(envPath);

const model = process.env.SOURCED_MODEL ?? "openai/gpt-5.6-luna";
const thresholds: Record<string, { coverage: number; extractedRate: number }> =
  {
    "openai/gpt-5.6-luna": { coverage: 0.9, extractedRate: 0.9 },
    "z-ai/glm-5.3-flash": { coverage: 0.9, extractedRate: 0.9 },
  };

it.skipIf(!process.env.OPENROUTER_API_KEY)(
  "fills the Priya fixture through OpenRouter",
  async () => {
    const source = createSource({
      id: "priya",
      name: "Priya Raman resume",
      kind: "paste",
      text: loadResume("priya-raman.txt"),
    });
    const request: FillRequest = {
      form: serializeForm(jobApplicationForm),
      sources: [source],
      mode: "fill",
      today: new Date().toISOString().slice(0, 10),
    };
    const started = performance.now();
    const events: FillEvent[] = [];
    for await (const event of fill(request, {
      adapter: createOpenRouterAdapter({ model }),
    })) {
      events.push(event);
    }

    const targets = Object.entries(loadGold()["priya-raman.txt"].fields).filter(
      ([, field]) => field.value !== null,
    );
    const proposals = new Map(
      events
        .filter((event) => event.type === "proposal")
        .map((event) => [event.proposal.fieldId, event.proposal]),
    );
    const questions = new Set(
      events
        .filter((event) => event.type === "question")
        .map((event) => event.question.fieldId),
    );
    const extractedTargets = targets.filter(
      ([, field]) => field.kind === "extracted",
    );
    const coverage =
      targets.filter(
        ([fieldId]) => proposals.has(fieldId) || questions.has(fieldId),
      ).length / targets.length;
    const extractedRate =
      extractedTargets.filter(([fieldId]) => {
        const proposal = proposals.get(fieldId);
        return proposal?.kind === "extracted" && proposal.span !== null;
      }).length / extractedTargets.length;
    const wrongValues = targets.filter(([fieldId, gold]) => {
      if (fieldId === "coverNote") return false;
      const proposal = proposals.get(fieldId);
      if (!proposal) return false;
      const expectedValue = gold.value;
      if (Array.isArray(proposal.value) && Array.isArray(expectedValue)) {
        return (
          proposal.value.length !== expectedValue.length ||
          proposal.value.some((value) => !expectedValue.includes(value))
        );
      }
      return proposal.value !== expectedValue;
    }).length;
    const done = [...events].reverse().find((event) => event.type === "done");
    console.log({
      model,
      coverage,
      extractedRate,
      wrongValues,
      latencyMs: Math.round(performance.now() - started),
      inputTokens: done?.usage?.inputTokens ?? 0,
      outputTokens: done?.usage?.outputTokens ?? 0,
    });

    for (const proposal of proposals.values()) {
      if (proposal.span) {
        expect(source.text.slice(proposal.span.start, proposal.span.end)).toBe(
          proposal.span.quote,
        );
      }
    }
    const expected = thresholds[model] ?? { coverage: 0.7, extractedRate: 0.7 };
    expect(coverage).toBeGreaterThanOrEqual(expected.coverage);
    expect(wrongValues).toBe(0);
    expect(extractedRate).toBeGreaterThanOrEqual(expected.extractedRate);
  },
  120_000,
);

it.skipIf(!process.env.OPENROUTER_API_KEY)(
  "asks about ambiguity in Marcus or extracts Acme Corp as employer",
  async () => {
    const source = createSource({
      id: "marcus",
      name: "Marcus Oyelaran resume",
      kind: "paste",
      text: loadResume("marcus-oyelaran.txt"),
    });
    const request: FillRequest = {
      form: serializeForm(jobApplicationForm),
      sources: [source],
      mode: "fill",
      today: new Date().toISOString().slice(0, 10),
    };
    const events: FillEvent[] = [];
    for await (const event of fill(request, {
      adapter: createOpenRouterAdapter({ model }),
    })) {
      events.push(event);
    }

    const questions = events.filter((event) => event.type === "question");
    const employer = events.find(
      (event) =>
        event.type === "proposal" && event.proposal.fieldId === "employer",
    );
    console.log({
      model,
      marcusOutcome:
        questions.length > 0
          ? `${questions.length} question(s)`
          : `employer: ${employer?.type === "proposal" ? employer.proposal.value : "missing"}`,
    });

    expect(
      questions.length > 0 ||
        (employer?.type === "proposal" &&
          employer.proposal.value === "Acme Corp"),
    ).toBe(true);
  },
  120_000,
);

it.skipIf(!process.env.OPENROUTER_API_KEY)(
  "checks Lena's current values for a start-date/graduation conflict",
  async () => {
    const source = createSource({
      id: "lena",
      name: "Lena Fischer resume",
      kind: "paste",
      text: loadResume("lena-fischer.txt"),
    });
    const request: FillRequest = {
      form: serializeForm(jobApplicationForm),
      sources: [source],
      mode: "check",
      currentValues: {
        startDate: "2016-01-01",
        gradYear: 2019,
      },
      today: new Date().toISOString().slice(0, 10),
    };
    const events: FillEvent[] = [];
    for await (const event of fill(request, {
      adapter: createOpenRouterAdapter({ model }),
    })) {
      events.push(event);
    }

    const conflict = events.find(
      (event) =>
        event.type === "flag" &&
        event.flag.fieldIds.includes("startDate") &&
        event.flag.fieldIds.includes("gradYear"),
    );
    // This live case is observational because model behavior is nondeterministic;
    // the fake-adapter test above owns the strict cross-field assertion.
    console.log({ model, lenaCheckFlag: conflict ?? "not emitted" });
    expect(events.at(-1)?.type).toBe("done");
  },
  120_000,
);
