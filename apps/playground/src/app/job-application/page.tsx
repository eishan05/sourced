"use client";

import type { FieldValue } from "@ai-native-forms/core";
import { createFetchTransport } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples/forms";
import {
  AIFormProvider,
  DropZone,
  Field,
  type FieldApi,
  Ghost,
  HumanOnlyNote,
  Issues,
  ProvenanceChip,
  SourcePane,
  useAIForm,
} from "@ai-native-forms/react";
import { useState } from "react";

const transport = createFetchTransport("/api/ai-forms/fill");

const SAMPLES = [
  { label: "Priya", name: "priya-raman.txt" },
  { label: "Marcus", name: "marcus-oyelaran.txt" },
  { label: "Lena", name: "lena-fischer.txt" },
] as const;

const controlClass =
  "mt-2 w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-200 disabled:bg-zinc-100";

function scalarValue(value: FieldValue): string {
  return value === null || Array.isArray(value) ? "" : String(value);
}

function FieldControl({ field }: { field: FieldApi }) {
  switch (field.def.type) {
    case "textarea":
      return (
        <textarea {...field.inputProps} className={controlClass} rows={5} />
      );
    case "boolean":
      return (
        <select
          {...field.inputProps}
          className={controlClass}
          onChange={(event) =>
            field.setValue(
              event.target.value === "" ? null : event.target.value === "true",
            )
          }
          value={typeof field.value === "boolean" ? String(field.value) : ""}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      );
    case "select":
      return (
        <select {...field.inputProps} className={controlClass}>
          <option value="">—</option>
          {field.def.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case "multiselect": {
      const selected = Array.isArray(field.value) ? field.value : [];
      return (
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">{field.def.label}</legend>
          {field.def.options?.map((option) => {
            const checked = selected.includes(option.value);
            return (
              <label
                className="flex items-center gap-2 text-sm text-zinc-700"
                key={option.value}
              >
                <input
                  checked={checked}
                  data-provenance={field.state.provenance?.kind}
                  data-status={field.status}
                  name={field.def.id}
                  onChange={() =>
                    field.setValue(
                      checked
                        ? selected.filter((value) => value !== option.value)
                        : [...selected, option.value],
                    )
                  }
                  type="checkbox"
                  value={option.value}
                />
                {option.label}
              </label>
            );
          })}
        </fieldset>
      );
    }
    default:
      return (
        <input
          {...field.inputProps}
          className={controlClass}
          type={field.def.type === "phone" ? "tel" : field.def.type}
          value={scalarValue(field.value)}
        />
      );
  }
}

function FormField({ fieldId }: { fieldId: string }) {
  return (
    <Field
      className="border-b border-zinc-200 py-5 transition-colors data-[status=ai-pending]:bg-amber-50 data-[status=ai-pending]:px-3"
      id={fieldId}
    >
      {(field) => (
        <>
          <div className="flex items-start justify-between gap-4">
            <label className="font-medium text-zinc-950" htmlFor={field.def.id}>
              {field.def.label}
              {field.def.required ? (
                <span aria-hidden="true" className="ml-1 text-amber-700">
                  *
                </span>
              ) : null}
            </label>
            <div className="flex shrink-0 items-center gap-2">
              <ProvenanceChip
                className="text-xs font-medium text-amber-800 underline decoration-amber-300 underline-offset-4 hover:text-amber-950"
                fieldId={field.def.id}
              />
              {field.status === "ai-pending" ? (
                <button
                  className="border border-amber-700 px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  onClick={field.accept}
                  type="button"
                >
                  Accept
                </button>
              ) : null}
            </div>
          </div>
          {field.def.description ? (
            <p
              className="mt-1 text-sm text-zinc-500"
              id={`${field.def.id}-description`}
            >
              {field.def.description}
            </p>
          ) : null}
          <FieldControl field={field} />
          <Ghost
            className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-500 [&_button]:border [&_button]:border-zinc-300 [&_button]:px-2 [&_button]:py-1 [&_button]:text-xs [&_button]:font-medium [&_button]:text-zinc-800 [&_button:hover]:border-zinc-500"
            fieldId={field.def.id}
          />
          <HumanOnlyNote
            className="mt-2 text-sm font-medium text-zinc-600"
            fieldId={field.def.id}
          />
          <Issues
            className="mt-2 list-disc pl-5 text-sm text-red-700"
            fieldId={field.def.id}
          />
          {field.state.question ? (
            <div
              className="mt-3 border-l-2 border-zinc-900 pl-3 text-sm"
              id={`${field.def.id}-question`}
            >
              <p className="font-medium">{field.state.question.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {field.state.question.options.map((option, index) => (
                  <button
                    className="border border-zinc-300 px-2 py-1 hover:border-zinc-900"
                    key={`${option.label}-${JSON.stringify(option.value)}`}
                    onClick={() => field.answer(option.value, index)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Field>
  );
}

function JobApplicationWorkspace() {
  const [localError, setLocalError] = useState<string | null>(null);
  const api = useAIForm({
    form: jobApplicationForm,
    transport,
    onSubmit: (values) => console.log("Job application submitted", values),
  });
  const visibleFields = Object.values(api.fields).filter(
    (field) => field.visible,
  );
  const completed = visibleFields.filter(
    (field) => field.value !== null,
  ).length;
  const pending = visibleFields.filter(
    (field) => field.status === "ai-pending" || field.status === "ghost",
  ).length;

  const loadSample = async (name: string): Promise<void> => {
    setLocalError(null);
    try {
      const response = await fetch(`/api/samples/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(await response.text());
      api.sources.addText(await response.text(), name);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <AIFormProvider api={api}>
      <main className="min-h-screen bg-stone-100 text-zinc-950">
        <header className="border-b border-zinc-300 bg-white px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[1600px] items-baseline justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-amber-700 uppercase">
                ai-native-forms
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Job application
              </h1>
            </div>
            <a className="text-sm text-zinc-600 underline" href="/">
              Playground home
            </a>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1600px] md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <aside className="border-b border-zinc-300 bg-stone-50 p-5 md:min-h-[calc(100vh-81px)] md:border-r md:border-b-0 md:p-8">
            <div className="md:sticky md:top-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-lg font-semibold">Sources</h2>
                <span className="font-mono text-xs text-zinc-500">
                  {api.sources.list.length} added
                </span>
              </div>
              <DropZone
                className="mt-4 grid gap-2 border-y border-zinc-300 py-4 [&_button]:w-fit [&_button]:bg-zinc-950 [&_button]:px-3 [&_button]:py-2 [&_button]:text-sm [&_button]:font-medium [&_button]:text-white [&_button:disabled]:opacity-40 [&_input]:text-xs [&_textarea]:min-h-28 [&_textarea]:resize-y [&_textarea]:border [&_textarea]:border-zinc-300 [&_textarea]:bg-white [&_textarea]:p-3 [&_textarea]:text-sm [&_textarea]:outline-none [&_textarea:focus]:border-zinc-950"
                onText={(text, name) => api.sources.addText(text, name)}
                onUnsupported={() =>
                  setLocalError("PDF support arrives in a later task")
                }
              >
                <p className="text-sm text-zinc-600">
                  Paste a resume or add a .txt/.md file.
                </p>
              </DropZone>

              <div className="mt-4 flex flex-wrap gap-2">
                {SAMPLES.map((sample) => (
                  <button
                    className="border border-zinc-300 bg-white px-3 py-2 text-sm hover:border-zinc-900"
                    key={sample.name}
                    onClick={() => void loadSample(sample.name)}
                    type="button"
                  >
                    Load sample: {sample.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-zinc-600">
                <span>Fill: {api.fill.status}</span>
                <span>
                  {completed}/{visibleFields.length} filled
                </span>
                <span>{pending} to review</span>
                {api.fill.status === "streaming" ? (
                  <button
                    className="font-sans font-medium text-zinc-950 underline"
                    onClick={api.fill.cancel}
                    type="button"
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
              {api.fill.error ? (
                <p className="mt-2 text-sm text-red-700">
                  {api.fill.error}{" "}
                  <button
                    className="font-medium underline"
                    onClick={() => void api.fill.run()}
                    type="button"
                  >
                    Retry
                  </button>
                </p>
              ) : null}
              {localError ? (
                <p className="mt-2 text-sm text-red-700">{localError}</p>
              ) : null}

              {api.sources.list.length === 0 ? (
                <p className="mt-10 text-sm text-zinc-500">
                  Source text and highlighted evidence will appear here.
                </p>
              ) : (
                <SourcePane className="mt-6 max-h-[55vh] space-y-6 overflow-auto pr-2 [&_header]:mb-2 [&_header]:flex [&_header]:items-center [&_header]:justify-between [&_header]:gap-4 [&_header]:text-sm [&_header]:font-semibold [&_header_button]:font-normal [&_header_button]:text-zinc-500 [&_header_button]:underline [&_mark]:bg-amber-200 [&_mark]:text-inherit [&_mark[data-active=true]]:animate-pulse [&_mark[data-active=true]]:bg-orange-400 [&_pre]:whitespace-pre-wrap [&_pre]:font-sans [&_pre]:text-sm [&_pre]:leading-7 [&_pre]:text-zinc-700" />
              )}
            </div>
          </aside>

          <section className="bg-white p-5 sm:p-8 lg:p-12">
            <div className="mx-auto max-w-2xl">
              <p className="text-sm leading-6 text-zinc-600">
                Fields update as evidence arrives. Review anything highlighted
                in amber before submitting.
              </p>
              <form
                className="mt-8"
                onSubmit={(event) => {
                  event.preventDefault();
                  void api.submit.request();
                }}
              >
                {api.sections
                  .filter((section) => section.visible)
                  .map((section) => (
                    <section className="mb-10" key={section.def.id}>
                      <h2 className="border-b-2 border-zinc-950 pb-3 text-lg font-semibold">
                        {section.def.title}
                      </h2>
                      {section.def.description ? (
                        <p className="mt-2 text-sm text-zinc-500">
                          {section.def.description}
                        </p>
                      ) : null}
                      {section.fields
                        .filter((field) => field.visible)
                        .map((field) => (
                          <FormField
                            fieldId={field.def.id}
                            key={field.def.id}
                          />
                        ))}
                    </section>
                  ))}

                <button
                  className="bg-zinc-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
                  disabled={api.submit.blockers.length > 0}
                  type="submit"
                >
                  Submit application
                </button>
                {api.submit.blockers.length > 0 ? (
                  <div className="mt-4 text-sm text-zinc-600">
                    <p className="font-medium text-zinc-800">
                      Complete these items before submitting:
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {api.submit.blockers.map((blocker) => (
                        <li
                          key={`${blocker.reason}-${blocker.fieldId ?? blocker.flagId}`}
                        >
                          {blocker.fieldId
                            ? `${api.field(blocker.fieldId).def.label}: ${blocker.reason}`
                            : `Form flag: ${blocker.reason}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {api.submit.status === "submitted" ? (
                  <p className="mt-4 text-sm font-medium text-green-700">
                    Submitted. Check the browser console for the values.
                  </p>
                ) : null}
              </form>
            </div>
          </section>
        </div>
      </main>
    </AIFormProvider>
  );
}

export default function JobApplicationPage() {
  return <JobApplicationWorkspace />;
}
