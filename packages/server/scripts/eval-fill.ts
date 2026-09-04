import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createSource,
  type FieldValue,
  type FillRequest,
  type FormDefinition,
  serializeForm,
} from "@sourced/core";
import {
  type GoldField,
  type IntakeName,
  jobApplicationForm,
  listIntakeNotes,
  listResumes,
  loadGold,
  loadIntakeNote,
  loadMedicalIntakeGold,
  loadResume,
  medicalIntakeForm,
  type ResumeName,
} from "@sourced/examples";

import { fill } from "../src/fill";
import type { ModelAdapter } from "../src/model/adapter";
import {
  createOpenRouterAdapter,
  type OpenRouterReasoningEffort,
} from "../src/model/openrouter";
import { collectTimedFillEvents } from "./eval-fill-metrics";

const OPEN_ENDED_PROSE_FIELDS = new Set(["coverNote", "reasonForVisit"]);

interface CliOptions {
  form: "job-application" | "medical-intake";
  models: string[];
  efforts: Array<OpenRouterReasoningEffort | null | undefined>;
  fixture?: string;
  record: boolean;
}

interface EvaluationDataset {
  form: FormDefinition;
  fixtures: string[];
  loadFixture(name: string): string;
  gold: Record<string, { fields: Record<string, GoldField> }>;
}

interface EvaluationRow {
  fixture: string;
  targets: number;
  coverage: string;
  "extracted rate": string;
  "wrong values": number;
  questions: number;
  flags: number;
  dropped: string;
  firstItemMs: number | null;
  "latency ms": number;
  "tokens in": number;
  "tokens out": number;
}

function parseArgs(args: string[]): CliOptions {
  let form: CliOptions["form"] = "job-application";
  const models: string[] = [];
  const efforts: Array<OpenRouterReasoningEffort | null | undefined> = [];
  let fixture: string | undefined;
  let record = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--record") {
      record = true;
    } else if (arg === "--model") {
      const model = args[index + 1];
      if (model) models.push(model);
      index += 1;
    } else if (arg === "--form") {
      const value = args[index + 1];
      if (value !== "job-application" && value !== "medical-intake") {
        throw new Error(`Unknown form: ${value ?? "missing"}`);
      }
      form = value;
      index += 1;
    } else if (arg === "--resume" || arg === "--fixture") {
      fixture = args[index + 1];
      index += 1;
    } else if (arg === "--effort") {
      const effort = args[index + 1];
      if (effort === "unset") {
        efforts.push(null);
      } else if (
        effort === "none" ||
        effort === "minimal" ||
        effort === "low" ||
        effort === "medium" ||
        effort === "high"
      ) {
        efforts.push(effort);
      } else {
        throw new Error(`Unknown reasoning effort: ${effort ?? "missing"}`);
      }
      index += 1;
    }
  }
  return {
    form,
    models: models.length
      ? models
      : [process.env.SOURCED_MODEL ?? "z-ai/glm-5.3-flash"],
    efforts: efforts.length ? efforts : [undefined],
    fixture,
    record,
  };
}

function datasetFor(form: CliOptions["form"]): EvaluationDataset {
  if (form === "medical-intake") {
    return {
      form: medicalIntakeForm,
      fixtures: listIntakeNotes(),
      loadFixture: (name) => loadIntakeNote(name as IntakeName),
      gold: loadMedicalIntakeGold(),
    };
  }
  return {
    form: jobApplicationForm,
    fixtures: listResumes(),
    loadFixture: (name) => loadResume(name as ResumeName),
    gold: loadGold(),
  };
}

function chooseFixtures(dataset: EvaluationDataset, requested?: string) {
  if (!requested) return dataset.fixtures;
  const normalized = requested.toLowerCase().replace(/\.txt$/, "");
  const matches = dataset.fixtures.filter((name) =>
    name
      .toLowerCase()
      .replace(/\.txt$/, "")
      .startsWith(normalized),
  );
  const fixture = matches.length === 1 ? matches[0] : undefined;
  if (!fixture) throw new Error(`Unknown fixture: ${requested}`);
  return [fixture];
}

function sameValue(actual: FieldValue, expected: FieldValue): boolean {
  if (Array.isArray(actual) || Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      Array.isArray(expected) &&
      actual.length === expected.length &&
      new Set(actual).size === new Set(expected).size &&
      actual.every((value) => expected.includes(value))
    );
  }
  return actual === expected;
}

function ratio(numerator: number, denominator: number): string {
  return denominator === 0 ? "n/a" : (numerator / denominator).toFixed(2);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function recordingAdapter(
  adapter: ModelAdapter,
  rawItems: unknown[],
): ModelAdapter {
  return {
    async *streamItems(input) {
      for await (const event of adapter.streamItems(input)) {
        if (event.type === "item") rawItems.push(event.item);
        yield event;
      }
    },
  };
}

function writeReplay(model: string, fixture: string, items: unknown[]): void {
  const path = resolve(
    "fixtures",
    "replays",
    slug(model),
    `${fixture.replace(/\.txt$/, "")}.jsonl`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${items.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  console.log(`Recorded ${items.length} raw items in ${path}`);
}

async function evaluate(
  dataset: EvaluationDataset,
  model: string,
  effort: OpenRouterReasoningEffort | null | undefined,
  fixture: string,
  record: boolean,
): Promise<EvaluationRow> {
  const rawItems: unknown[] = [];
  const adapter = recordingAdapter(
    createOpenRouterAdapter({ model, effort }),
    rawItems,
  );
  const source = createSource({
    id: fixture,
    name: fixture,
    kind: "paste",
    text: dataset.loadFixture(fixture),
  });
  const request: FillRequest = {
    form: serializeForm(dataset.form),
    sources: [source],
    mode: "fill",
    today: new Date().toISOString().slice(0, 10),
  };
  const { events, firstItemMs, latencyMs } = await collectTimedFillEvents(
    fill(request, { adapter }),
  );
  if (record) writeReplay(model, fixture, rawItems);

  const goldFields = dataset.gold[fixture]?.fields;
  if (!goldFields) throw new Error(`Missing gold labels for ${fixture}`);
  const targets = Object.entries(goldFields).filter(
    ([, field]) => field.value !== null,
  );
  const proposals = new Map(
    events
      .filter((event) => event.type === "proposal")
      .map((event) => [event.proposal.fieldId, event.proposal]),
  );
  const questionFields = new Set(
    events
      .filter((event) => event.type === "question")
      .map((event) => event.question.fieldId),
  );
  const covered = targets.filter(
    ([fieldId]) => proposals.has(fieldId) || questionFields.has(fieldId),
  ).length;
  const extractedTargets = targets.filter(
    ([, field]) => (field as GoldField).kind === "extracted",
  );
  const extracted = extractedTargets.filter(([fieldId]) => {
    const proposal = proposals.get(fieldId);
    return proposal?.kind === "extracted" && proposal.span !== null;
  }).length;
  const wrongValues = targets.filter(([fieldId, gold]) => {
    if (OPEN_ENDED_PROSE_FIELDS.has(fieldId)) return false;
    const proposal = proposals.get(fieldId);
    return proposal ? !sameValue(proposal.value, gold.value) : false;
  }).length;
  const drops: Record<string, number> = {};
  for (const event of events) {
    if (event.type === "dropped") {
      drops[event.reason] = (drops[event.reason] ?? 0) + 1;
    }
  }
  const done = [...events].reverse().find((event) => event.type === "done");

  return {
    fixture,
    targets: targets.length,
    coverage: ratio(covered, targets.length),
    "extracted rate": ratio(extracted, extractedTargets.length),
    "wrong values": wrongValues,
    questions: events.filter((event) => event.type === "question").length,
    flags: events.filter((event) => event.type === "flag").length,
    dropped: JSON.stringify(drops),
    firstItemMs,
    "latency ms": latencyMs,
    "tokens in": done?.usage?.inputTokens ?? 0,
    "tokens out": done?.usage?.outputTokens ?? 0,
  };
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn(
      "Skipping eval-fill: OPENROUTER_API_KEY is not set (no requests made).",
    );
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const dataset = datasetFor(options.form);
  const fixtures = chooseFixtures(dataset, options.fixture);
  for (const model of options.models) {
    for (const effort of options.efforts) {
      const rows: EvaluationRow[] = [];
      for (const fixture of fixtures) {
        try {
          rows.push(
            await evaluate(dataset, model, effort, fixture, options.record),
          );
        } catch (error) {
          console.error(`${model} / ${fixture}:`, error);
        }
      }
      const effortLabel =
        effort === null ? "unset" : (effort ?? "adapter default");
      console.log(
        `\nForm: ${options.form} · Model: ${model} (reasoning effort: ${effortLabel})`,
      );
      console.table(rows);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 0;
});
