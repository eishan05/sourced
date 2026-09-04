# `@sourced/examples`

Shared form definitions and deterministic fixtures for the playground, tests, and fill evaluator. Import `@sourced/examples/forms` in browser code; the root entry also exposes Node.js fixture loaders and uses `node:fs`.

## Forms

```ts
import {
  jobApplicationForm,
  medicalIntakeForm,
} from "@sourced/examples/forms";
```

- `jobApplicationForm` covers extraction, inference, conditional employment, fixed skills, and human-only eligibility.
- `medicalIntakeForm` covers patient prose, date and multiselect normalization, inferred visit/insurance fields, a conditional insurance-details section, pattern validation, and human-only consent.

## Fixtures

- `fixtures/resumes/*.txt`: three varied fictional resumes for the job application.
- `fixtures/intake/*.txt`: two informal notes written in a patient's voice; one insured and one uninsured.
- `fixtures/gold/job-application.json`: expected job values, provenance kinds, and supporting quotes.
- `fixtures/gold/medical-intake.json`: matching expectations for both intake notes.

The root entry exports `listResumes`, `loadResume`, and `loadGold` for the job fixtures, plus `listIntakeNotes`, `loadIntakeNote`, and `loadMedicalIntakeGold` for medical intake. It also exports the `ResumeName`, `IntakeName`, `GoldField`, `GoldFixture`, and `MedicalIntakeGoldFixture` types.

## Gold format

Each JSON file maps a fixture filename to a `fields` object:

```json
{
  "sample.txt": {
    "fields": {
      "fullName": {
        "value": "Maya Chen",
        "quote": "Maya Chen",
        "kind": "extracted"
      },
      "hasInsurance": {
        "value": true,
        "quote": "I have BlueCross insurance",
        "kind": "inferred"
      },
      "provider": {
        "value": null,
        "kind": "inferred"
      }
    }
  }
}
```

`value` is the normalized expected `FieldValue`; `null` means no target proposal. `kind` is `extracted` or `inferred`. When present, `quote` must be an exact substring of the fixture and identifies the expected evidence. Human-policy fields are omitted because the server never targets them.
