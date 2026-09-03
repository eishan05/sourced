import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  createSource,
  type FieldValue,
  type FillEvent,
  type FillRequest,
  serializeForm,
} from "@ai-native-forms/core";
import {
  type GoldField,
  jobApplicationForm,
  listResumes,
  loadGold,
  loadResume,
  type ResumeName,
} from "@ai-native-forms/examples";

import { fill } from "../src/fill";
import type { ModelAdapter } from "../src/model/adapter";
import { createOpenRouterAdapter } from "../src/model/openrouter";

interface CliOptions {
  models: string[];
  resume?: string;
  record: boolean;
}

interface EvaluationRow {
  resume: string;
  targets: number;
  coverage: string;
  "extracted rate": string;
  "wrong values": number;
  questions: number;
  flags: number;
  dropped: string;
  "latency ms": number;
  "tokens in": number;
  "tokens out": number;
}

function parseArgs(args: string[]): CliOptions {
  const models: string[] = [];
  let resume: string | undefined;
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
    } else if (arg === "--resume") {
      resume = args[index + 1];
      index += 1;
    }
  }
  return {
    models: models.length
      ? models
      : [process.env.AI_FORMS_MODEL ?? "openai/gpt-5.6-luna"],
    resume,
    record,
  };
}

function chooseResumes(requested?: string): ResumeName[] {
  if (!requested) return listResumes();
  const normalized = requested.toLowerCase().replace(/\.txt$/, "");
  const matches = listResumes().filter((name) =>
    name
      .toLowerCase()
      .replace(/\.txt$/, "")
      .startsWith(normalized),
  );
  const resume = matches.length === 1 ? matches[0] : undefined;
  if (!resume) throw new Error(`Unknown resume: ${requested}`);
  return [resume];
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

function writeReplay(
  model: string,
  resume: ResumeName,
  items: unknown[],
): void {
  const path = resolve(
    "fixtures",
    "replays",
    slug(model),
    `${resume.replace(/\.txt$/, "")}.jsonl`,
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${items.map((item) => JSON.stringify(item)).join("\n")}\n`,
  );
  console.log(`Recorded ${items.length} raw items in ${path}`);
}

async function evaluate(
  model: string,
  resume: ResumeName,
  record: boolean,
): Promise<EvaluationRow> {
  const rawItems: unknown[] = [];
  const adapter = recordingAdapter(
    createOpenRouterAdapter({ model }),
    rawItems,
  );
  const source = createSource({
    id: resume,
    name: resume,
    kind: "paste",
    text: loadResume(resume),
  });
  const request: FillRequest = {
    form: serializeForm(jobApplicationForm),
    sources: [source],
    mode: "fill",
    today: new Date().toISOString().slice(0, 10),
  };
  const started = performance.now();
  const events: FillEvent[] = [];
  for await (const event of fill(request, { adapter })) events.push(event);
  const latency = Math.round(performance.now() - started);
  if (record) writeReplay(model, resume, rawItems);

  const goldFields = loadGold()[resume].fields;
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
    if (fieldId === "coverNote") return false;
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
    resume,
    targets: targets.length,
    coverage: ratio(covered, targets.length),
    "extracted rate": ratio(extracted, extractedTargets.length),
    "wrong values": wrongValues,
    questions: events.filter((event) => event.type === "question").length,
    flags: events.filter((event) => event.type === "flag").length,
    dropped: JSON.stringify(drops),
    "latency ms": latency,
    "tokens in": done?.usage?.inputTokens ?? 0,
    "tokens out": done?.usage?.outputTokens ?? 0,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const resumes = chooseResumes(options.resume);
  for (const model of options.models) {
    const rows: EvaluationRow[] = [];
    for (const resume of resumes) {
      try {
        rows.push(await evaluate(model, resume, options.record));
      } catch (error) {
        console.error(`${model} / ${resume}:`, error);
      }
    }
    console.log(`\nModel: ${model}`);
    console.table(rows);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 0;
});
