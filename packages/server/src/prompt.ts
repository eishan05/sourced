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
      : req.currentValues !== undefined
        ? "When current_values is present in fill mode, propose only for fields whose current value is empty. Propose a different value for a non-empty field only when strong verbatim evidence in a source supports the different value; otherwise emit no_evidence for that field. Return one item per listed field, in order; use no_evidence for optional empty fields with no evidence, and ask for required empty fields with no evidence."
        : "Return one item per listed field, in order. Use no_evidence for optional fields with no evidence; ask for required fields with no evidence.";
  const strictReminder = opts.strictReminder
    ? "\nReturn only the JSON array. Do not add prose, markdown, or code fences."
    : "";

  const system = `You fill forms from supplied source text. Never mention a field that is not listed.

"extracted" means the value appears verbatim in a source. Its quote must be the shortest source span containing the value, copied exactly with original punctuation and casing. "inferred" means anything derived or guessed; still include the best supporting verbatim quote when one exists. Never trust a claim without source text.

${modeInstruction}
Ask only when sources contain two or more candidates for a field, or a required field has no evidence. Emit at most 5 questions. Every option must include the candidate's verbatim quote and sourceId. Put inconsistency flags last; severity is "error" only for contradictions.

Formats: dates YYYY-MM-DD (use the first of the month when only a month is known); booleans "true" or "false"; numbers as digits; select values must be option values; multiselect uses values containing option values. Today is ${req.today}.

Examples:
Source: "Email: ada@example.com" -> {"kind":"proposal","fieldId":"email","basis":"extracted","value":"ada@example.com","sourceId":"resume","quote":"ada@example.com"}
Source: "Engineer, Jan 2020 - Present" -> {"kind":"proposal","fieldId":"currentlyEmployed","basis":"inferred","value":"true","sourceId":"resume","quote":"Present","rationale":"The current role ends in Present"}
Source: "Acme Corp ... Acme Labs" -> {"kind":"question","fieldId":"employer","question":"Which is the employer?","options":[{"label":"Acme Corp","value":"Acme Corp","sourceId":"resume","quote":"Acme Corp"},{"label":"Acme Labs","value":"Acme Labs","sourceId":"resume","quote":"Acme Labs"}],"allowFreeText":true}
Current values: {"startDate":"2016-01-01","gradYear":2019} -> {"kind":"flag","fieldIds":["startDate","gradYear"],"message":"The employment start date is before the graduation year. Is that right?","severity":"error"}${strictReminder}`;

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
    req.mode === "check" || req.currentValues !== undefined
      ? `\n<current_values>\n${JSON.stringify(req.currentValues ?? {})}\n</current_values>`
      : "";

  return {
    system,
    prompt: `<form>\n${JSON.stringify(form)}\n</form>\n<sources>\n${sources}\n</sources>${currentValues}`,
  };
}
