import type {
  SerializedFieldDefinition,
  SerializedFormDefinition,
  Source,
} from "@ai-native-forms/core";

import type { PipelineContext } from "./types";

export const testFields: SerializedFieldDefinition[] = [
  { id: "name", type: "text", label: "Name" },
  { id: "bio", type: "textarea", label: "Bio", policy: "infer" },
  { id: "start", type: "date", label: "Start date", policy: "infer" },
  {
    id: "role",
    type: "select",
    label: "Role",
    policy: "infer",
    options: [
      { value: "engineer", label: "Engineer" },
      { value: "designer", label: "Designer" },
    ],
  },
  {
    id: "skills",
    type: "multiselect",
    label: "Skills",
    policy: "infer",
    options: [
      { value: "typescript", label: "TypeScript" },
      { value: "node-js", label: "Node.js" },
    ],
  },
  { id: "human", type: "text", label: "Human", policy: "human" },
];

export const testForm: SerializedFormDefinition = {
  id: "test",
  title: "Test form",
  version: 1,
  sections: [{ id: "main", title: "Main", fields: testFields }],
};

export const testSources: Source[] = [
  {
    id: "resume",
    name: "Resume",
    kind: "paste",
    text: "Ada Lovelace was an Engineer. Started Mar 2021. TypeScript, Node.js.",
    addedAt: 0,
  },
];

export function makeContext(
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  let nextId = 0;
  const idGen = (): string => {
    nextId += 1;
    return `id-${nextId}`;
  };
  return {
    form: testForm,
    fieldsById: new Map(testFields.map((field) => [field.id, field])),
    sources: testSources,
    today: "2026-09-03",
    fillId: "fill-1",
    idGen,
    ...overrides,
  };
}
