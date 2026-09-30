# Connecting a real submission

The playground validates both forms on the server and displays the returned values. It does not create accounts, save documents, or persist submissions. Its success message means validation completed.

For a real application, use this order:

1. Authenticate the request and authorize submission to the requested resource.
2. Resolve the form and version from server-owned definitions.
3. Call `validateSubmission(form, values)`.
4. Await persistence of the returned values under the authorized owner.
5. Return success only when persistence succeeds.

The following integration template uses **host-provided** `requireSubmissionAccess` and `saveSubmission` functions. Sourced does not supply these functions, a session provider, or a database. Adapt the imports to your application; never replace authorization with a hardcoded successful result.

```ts
import { validateSubmission } from "@sourced/server";
import { contactForm } from "../../contact-form";
import { requireSubmissionAccess, saveSubmission } from "@/server/submissions";

export async function POST(request: Request) {
  // Host function returns an authorized owner, or throws/returns a 401/403 response.
  const access = await requireSubmissionAccess(request, contactForm.id);
  if (access instanceof Response) return access;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!input || typeof input !== "object" ||
      !("formVersion" in input) || !("values" in input)) {
    return Response.json({ error: "Version and values are required" }, { status: 400 });
  }
  if (input.formVersion !== contactForm.version) {
    return Response.json({ error: "Form changed; reload before submitting" }, { status: 409 });
  }

  const result = validateSubmission(contactForm, input.values);
  if (!result.success) return Response.json(result, { status: 422 });

  // This host function must actually persist, and must reject on failure.
  const receipt = await saveSubmission({
    ownerId: access.ownerId,
    formId: contactForm.id,
    formVersion: contactForm.version,
    values: result.values,
  });
  return Response.json({ id: receipt.id }, { status: 201 });
}
```

Connect `useAIForm({ onSubmit })` to this route with a POST containing `{ formVersion, values }`. Throw on non-success responses so the hook retains answers and displays the submission error; show a saved receipt only after success. Resolve multi-form applications through a server-owned allowlist, as the playground does. Protect the AI fill route using your application's authorization policy too.

`validateSubmission` rejects malformed values and unknown field IDs, validates visible fields without coercion, runs server-owned custom validators, and returns only visible values. Missing optional values become `null`. Retaining an original `FormDefinition` on the server preserves custom validators omitted by serialization. A required boolean requires an answer; it does not require `true`. If your application requires affirmative consent, enforce that business rule in the server-owned definition with a custom validator.

The client hook's review state, provenance, summary, and AI check are user-interface assistance, not proof of authorization or integrity. Requests can bypass the browser entirely. The submission validator checks structure and declared constraints; it does not certify that a document is truthful or that a human performed the review. Never persist client-provided form definitions or trust client-provided review metadata as an authorization decision.
