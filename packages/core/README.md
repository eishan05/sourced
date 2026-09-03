# `@ai-native-forms/core`

Framework-agnostic form definitions, validation, evidence location, state, selectors, and streaming transport. This package is safe to use in browser or server code.

## Example

```ts
import {
  createFetchTransport,
  defineForm,
  serializeForm,
} from "@ai-native-forms/core";

const form = defineForm({
  id: "profile",
  title: "Profile",
  version: 1,
  sections: [
    {
      id: "basics",
      title: "Basics",
      fields: [{ id: "name", type: "text", label: "Name", required: true }],
    },
  ],
});

const transport = createFetchTransport("/api/ai-forms/fill");
const request = {
  form: serializeForm(form),
  sources: [],
  mode: "fill" as const,
  today: "2026-09-03",
};

for await (const event of transport(request)) console.log(event);
```

## Exports

### Definitions and validation

| Export | Description |
| --- | --- |
| `defineForm` | Validates IDs, options, constraints, and conditions, then deeply freezes a definition. |
| `serializeForm` | Removes custom Zod validators so a definition can cross the wire. |
| `fieldsOf` | Returns all fields in section order. |
| `fieldById` | Finds a field definition by ID. |
| `policyOf` | Returns a field policy, defaulting to `extract`. |
| `evaluateCondition` | Evaluates a nested `showWhen` condition against current values. |
| `isFieldVisible` | Tests section and field conditions for one field. |
| `validateField` | Runs required, type, built-in constraint, option, and custom Zod validation. |
| `FieldType`, `FieldValue`, `ValueForType` | Supported field types, runtime values, and their type-level mapping. |
| `Policy` | The `extract`, `infer`, or `human` AI permission. |
| `Condition` | A field comparison or nested `all`/`any` visibility rule. |
| `FieldOption`, `FieldConstraints`, `FieldDefinition` | Field option, constraint, and definition shapes. |
| `SectionDefinition`, `FormDefinition` | Section and complete form definition shapes. |
| `SerializedFieldDefinition`, `SerializedFormDefinition` | Wire-safe definitions without custom validators. |
| `FieldIds` | Extracts a literal union of field IDs from a typed form. |
| `ValidationIssue` | A validation code, message, and error/warning severity. |

### Sources, evidence, and normalization

| Export | Description |
| --- | --- |
| `createSource`, `CreateSourceInput` | Normalizes pasted/PDF text and creates a source with stable page offsets. |
| `locateQuote`, `QuoteLocationOptions`, `LocatedSpan` | Locates exact, normalized, or conservative fuzzy evidence in source text. |
| `normalizeTextForQuoteLocation`, `NormalizedLocationText` | Produces normalized text plus offsets back to the original. |
| `normalizeBoolean` | Parses common yes/no boolean strings. |
| `normalizeDate`, `NormalizedDate` | Converts ISO, named, and relative dates using an explicit `today`. |
| `normalizeNumber`, `NormalizedNumber` | Parses localized separators and currency-decorated numbers. |
| `normalizePhone` | Normalizes phone text, including US display formatting. |
| `normalizeValue`, `NormalizeValueOptions`, `NormalizedValue` | Dispatches normalization based on a field definition. |
| `suspiciousIssues` | Returns non-blocking warnings for suspicious lengths, emails, and dates. |
| `Source`, `Span`, `Normalization` | Source text, located evidence, and normalization metadata. |

### State and selectors

| Export | Description |
| --- | --- |
| `createInitialState` | Creates field, source, fill, review, flag, and submit state. |
| `reduce` | Applies a typed `FormEvent` to immutable form state. |
| `createFormStore`, `FormStore` | Wraps the reducer in a small subscribe/dispatch store. |
| `values` | Reads the current field-value record. |
| `isVisible`, `visibleFieldIds` | Selects conditionally visible fields. |
| `hiddenReason`, `HiddenReason` | Explains the gate hiding a field or section. |
| `unreviewedAiFieldIds` | Lists visible AI-filled fields still awaiting review. |
| `submitBlockers`, `SubmitBlocker` | Finds review, question, required, validation, and flag blockers. |
| `submitSummary`, `SubmitSummary` | Counts submitted values by provenance and source. |
| `highlightsForSource`, `SourceHighlight` | Maps current provenance and questions back to source spans. |
| `reviewCursorFieldId` | Returns the active review field. |
| `fieldsUsingSource` | Lists fields linked to a source. |
| `FormEvent` | Union of all source, fill, review, edit, flag, submit, and reset actions. |
| `FormState`, `FieldState`, `FillRun` | Complete state and its field/fill records. |
| `Proposal`, `Question`, `QuestionOption`, `Flag` | Verified AI output stored by the reducer. |
| `Provenance`, `ProvenanceKind`, `ReviewStatus` | Provenance metadata and review lifecycle. |

### Protocol and transport

| Export | Description |
| --- | --- |
| `FillRequest` | JSON request containing a serialized form, sources, mode, values, and date. |
| `FillEvent` | NDJSON event union from `start` through `done` or `error`. |
| `DropReason` | Server reasons for rejecting model output, including `check-mode`. |
| `isFillEvent` | Runtime type guard for protocol events. |
| `encodeFillEvent` | Encodes one event as a newline-terminated JSON record. |
| `parseFillEvents` | Incrementally parses and validates an NDJSON byte stream. |
| `createFetchTransport`, `FillTransport` | Creates an abortable POST transport over `fetch`. |
| `CORE_VERSION` | Package version constant. |
