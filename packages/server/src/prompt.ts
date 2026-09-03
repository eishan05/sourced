import { type FillRequest, fieldsOf, policyOf } from "@ai-native-forms/core";

function attribute(value: string): string {
  return JSON.stringify(value);
}

export function buildPrompt(
  req: FillRequest,
  opts: { strictReminder?: boolean } = {},
): { system: string; prompt: string } {
  const modeInstruction =
    req.mode === "check"
      ? "In check mode, emit only flag and question items about inconsistencies or suspicious current values."
      : "Return one item per listed field, in the listed order. Skip nothing: use no_evidence when there is nothing to go on.";
  const strictReminder = opts.strictReminder
    ? "\nReturn only the JSON array. Do not add prose, markdown, or code fences."
    : "";

  const system = `You fill forms from supplied source text. Never mention a field that is not listed.

"extracted" means the value appears verbatim in a source. Its quote must be the shortest source span containing the value, copied exactly with original punctuation and casing. "inferred" means anything derived or guessed; still include the best supporting verbatim quote when one exists. Never trust a claim without source text.

${modeInstruction}
Ask a question only when two or more candidates exist or a required field is missing, with at most 5 questions per fill. Put inconsistency flags last; severity is "error" only for contradictions.

Formats: dates YYYY-MM-DD (use the first of the month when only a month is known); booleans "true" or "false"; numbers as digits; select values must be option values; multiselect uses values containing option values. Today is ${req.today}.

Examples:
Source: "Email: ada@example.com" -> {"kind":"proposal","fieldId":"email","basis":"extracted","value":"ada@example.com","sourceId":"resume","quote":"ada@example.com"}
Source: "Engineer, Jan 2020 - Present" -> {"kind":"proposal","fieldId":"currentlyEmployed","basis":"inferred","value":"true","sourceId":"resume","quote":"Present","rationale":"The current role ends in Present"}${strictReminder}`;

  const fields = fieldsOf(req.form)
    .filter((field) => policyOf(field) !== "human")
    .map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      description: field.description,
      policy: policyOf(field),
      required: field.required,
      options: field.options,
      constraints: field.constraints,
    }));
  const form = {
    id: req.form.id,
    title: req.form.title,
    context: req.form.context,
    fields,
  };
  const sources = req.sources
    .map(
      (source) =>
        `<source id=${attribute(source.id)} name=${attribute(source.name)}>\n${source.text}\n</source>`,
    )
    .join("\n");
  const currentValues =
    req.mode === "check"
      ? `\n<current_values>\n${JSON.stringify(req.currentValues ?? {})}\n</current_values>`
      : "";

  return {
    system,
    prompt: `<form>\n${JSON.stringify(form)}\n</form>\n<sources>\n${sources}\n</sources>${currentValues}`,
  };
}
