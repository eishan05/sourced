export type FieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "boolean"
  | "select"
  | "multiselect";

export type Policy = "extract" | "infer" | "human";

export type FieldValue = string | number | boolean | string[] | null;

export type Condition =
  | { field: string; equals: FieldValue }
  | { field: string; in: FieldValue[] }
  | { field: string; truthy: boolean }
  | { all: Condition[] }
  | { any: Condition[] };

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldConstraints {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  patternMessage?: string;
}

/** The synchronous safeParse contract, independent of Zod's internal version types. */
export interface FieldValidator {
  safeParse(
    input: unknown,
  ):
    | { success: true }
    | { success: false; error: { issues: ReadonlyArray<{ message: string }> } };
}

export interface FieldDefinition {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  policy?: Policy;
  required?: boolean;
  options?: FieldOption[];
  constraints?: FieldConstraints;
  showWhen?: Condition;
  validate?: FieldValidator;
}

export interface SectionDefinition {
  id: string;
  title: string;
  description?: string;
  showWhen?: Condition;
  fields: FieldDefinition[];
}

export interface FormDefinition {
  id: string;
  title: string;
  description?: string;
  version: number;
  context?: string;
  sections: SectionDefinition[];
}

export type SerializedFieldDefinition = Omit<FieldDefinition, "validate">;

export interface SerializedFormDefinition
  extends Omit<FormDefinition, "sections"> {
  sections: Array<
    Omit<SectionDefinition, "fields"> & {
      fields: SerializedFieldDefinition[];
    }
  >;
}

export interface ValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export type ValueForType<T extends FieldType> = T extends "number"
  ? number
  : T extends "boolean"
    ? boolean
    : T extends "multiselect"
      ? string[]
      : string;

export type FieldIds<F extends FormDefinition> =
  F["sections"][number]["fields"][number]["id"];
