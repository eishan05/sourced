import type { Condition, FillRequest } from "@ai-native-forms/core";
import { z } from "zod";

export const FillItemSchema = z.object({
  kind: z.enum(["proposal", "question", "flag", "no_evidence"]),
  fieldId: z.string().optional(),
  basis: z.enum(["extracted", "inferred"]).optional(),
  value: z.string().optional(),
  values: z.array(z.string()).optional(),
  sourceId: z.string().optional(),
  quote: z.string().optional(),
  rationale: z.string().optional(),
  question: z.string().optional(),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        quote: z.string().optional(),
        sourceId: z.string().optional(),
      }),
    )
    .optional(),
  allowFreeText: z.boolean().optional(),
  fieldIds: z.array(z.string()).optional(),
  message: z.string().optional(),
  severity: z.enum(["warning", "error"]).optional(),
});

const FieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ field: z.string(), equals: FieldValueSchema }),
    z.object({ field: z.string(), in: z.array(FieldValueSchema) }),
    z.object({ field: z.string(), truthy: z.boolean() }),
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
  ]),
);

const FieldSchema = z.object({
  id: z.string(),
  type: z.enum([
    "text",
    "textarea",
    "email",
    "phone",
    "date",
    "number",
    "boolean",
    "select",
    "multiselect",
  ]),
  label: z.string(),
  description: z.string().optional(),
  policy: z.enum(["extract", "infer", "human"]).optional(),
  required: z.boolean().optional(),
  options: z
    .array(z.object({ value: z.string(), label: z.string() }))
    .optional(),
  constraints: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern: z.string().optional(),
      patternMessage: z.string().optional(),
    })
    .optional(),
  showWhen: ConditionSchema.optional(),
});

const FormSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  version: z.number(),
  context: z.string().optional(),
  sections: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      showWhen: ConditionSchema.optional(),
      fields: z.array(FieldSchema),
    }),
  ),
});

const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["paste", "pdf"]),
  text: z.string(),
  pageOffsets: z.array(z.number()).optional(),
  addedAt: z.number(),
});

export const FillRequestSchema: z.ZodType<FillRequest> = z.object({
  form: FormSchema,
  sources: z.array(SourceSchema),
  mode: z.enum(["fill", "check"]),
  currentValues: z.record(z.string(), FieldValueSchema).optional(),
  today: z.iso.date(),
});

export type FillItem = z.infer<typeof FillItemSchema>;
