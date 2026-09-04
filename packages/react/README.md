# `@sourced/react`

React bindings for the core state machine: a headless hook and components, a drop-in styled kit, and optional PDF extraction.

## Example

```tsx
"use client";

import { createFetchTransport } from "@sourced/core";
import { AIFormProvider, useAIForm } from "@sourced/react";
import { AIFormShell, KitForm } from "@sourced/react/kit";
import "@sourced/react/kit.css";
import { profileForm } from "./profile-form";

const transport = createFetchTransport("/api/ai-forms/fill");

export function Profile() {
  const api = useAIForm({ form: profileForm, transport });
  return (
    <AIFormProvider api={api}>
      <AIFormShell>
        <KitForm />
      </AIFormShell>
    </AIFormProvider>
  );
}
```

## Root exports

| Export | Description |
| --- | --- |
| `useAIForm`, `UseAIFormOptions`, `AIFormApi` | Owns sources, streaming runs, fields, review, checks, and submission. |
| `FieldApi`, `FieldInputProps`, `FieldStatus` | Headless field state, actions, and bindable input props. |
| `SectionApi`, `SourceSelection` | Headless conditional-section and source-selection APIs. |
| `AIFormProvider`, `AIFormProviderProps` | Provides one `AIFormApi` to descendants. |
| `useAIFormApi` | Reads the current form API from context. |
| `useField` | Reads one field API by ID. |
| `useReviewKeyboard`, `UseReviewKeyboardOptions`, `ReviewKeyboardState` | Adds Enter/Escape/arrow-key review controls. |
| `Field`, `FieldProps` | Render-prop boundary for one visible headless field. |
| `DropZone`, `DropZoneProps` | Accepts pasted text and text, Markdown, or PDF files. |
| `Ghost`, `GhostProps` | Renders an inferred suggestion without committing it. |
| `AskBack`, `AskBackProps` | Renders ambiguity options and free-text answers. |
| `Flags`, `FlagsProps` | Renders global or field-scoped flags and acknowledgements. |
| `HiddenSection`, `HiddenSectionProps` | Renders a conditional section or its hidden-state explanation. |
| `HumanOnlyNote`, `HumanOnlyNoteProps` | Marks a field as requiring human input. |
| `Issues`, `IssuesProps` | Renders validation errors and warnings. |
| `Normalization`, `NormalizationProps` | Shows and reverts value normalization. |
| `ProvenanceChip`, `ProvenanceChipProps` | Labels provenance and focuses source evidence. |
| `ReviewBar`, `ReviewBarProps` | Starts and tracks review progress. |
| `SourcePane`, `SourcePaneProps` | Displays sources with interactive evidence highlights. |
| `UseForMenu`, `UseForMenuProps` | Applies selected source text to a field. |
| `SubmitSummary`, `SubmitSummaryProps` | Shows provenance counts, blockers, clear-AI, and submit controls. |
| `REACT_VERSION`, `CORE_VERSION` | React and linked core version constants. |

## `@sourced/react/kit`

Import `@sourced/react/kit.css` once to use the default styles.

| Export | Description |
| --- | --- |
| `AIFormShell`, `AIFormShellProps` | Responsive source-pane and form workspace shell. |
| `KitForm`, `KitFormProps` | Renders every section, review bar, flags, and submit summary. |
| `KitSection`, `KitSectionProps` | Renders one conditional section. |
| `KitField`, `KitFieldProps` | Renders the correct input and trust UI for one field. |
| `KitDropZone`, `KitDropZoneProps` | Connects the styled source input to the active form API. |
| `KitSourcePane`, `KitSourcePaneProps` | Styled source controls, run status, and evidence pane. |
| `KitReviewBar`, `KitReviewBarProps` | Styled review controls. |
| `KitSubmitSummary`, `KitSubmitSummaryProps` | Styled provenance summary and guarded submit action. |

## `@sourced/react/pdf`

```ts
import { createPdfExtractor } from "@sourced/react/pdf";

const extractor = createPdfExtractor({ worker: true });
```

| Export | Description |
| --- | --- |
| `extractPdfText` | Extracts full and page-level text from PDF bytes. |
| `createPdfExtractor` | Creates a timed extractor, optionally using the emitted module worker. |
| `PdfExtractor`, `PdfText` | Extractor function and result types. |
| `PdfWorkerRequest`, `PdfWorkerResponse` | Message types used by the optional PDF worker. |
