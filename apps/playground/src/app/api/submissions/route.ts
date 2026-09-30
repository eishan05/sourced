import { jobApplicationForm, medicalIntakeForm } from "@sourced/examples/forms";
import { validateSubmission } from "@sourced/server";

const forms = [jobApplicationForm, medicalIntakeForm];

export async function POST(request: Request): Promise<Response> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json(
      { error: "Send a valid JSON submission." },
      { status: 400 },
    );
  }
  if (
    !input ||
    typeof input !== "object" ||
    !("formId" in input) ||
    !("formVersion" in input) ||
    !("values" in input)
  ) {
    return Response.json(
      { error: "A form ID, version, and values are required." },
      { status: 400 },
    );
  }
  const form = forms.find((candidate) => candidate.id === input.formId);
  if (!form) return Response.json({ error: "Unknown form." }, { status: 404 });
  if (input.formVersion !== form.version) {
    return Response.json(
      { error: "This form has changed. Reload before submitting." },
      { status: 409 },
    );
  }
  const result = validateSubmission(form, input.values);
  return Response.json(result, { status: result.success ? 200 : 422 });
}
