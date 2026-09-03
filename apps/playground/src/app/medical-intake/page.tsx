"use client";

import { createFetchTransport, type FieldValue } from "@ai-native-forms/core";
import { medicalIntakeForm } from "@ai-native-forms/examples/forms";
import { AIFormProvider, useAIForm } from "@ai-native-forms/react";
import {
  AIFormShell,
  KitDropZone,
  KitForm,
  KitSourcePane,
} from "@ai-native-forms/react/kit";
import { useState } from "react";

const transport = createFetchTransport("/api/ai-forms/fill");

const SAMPLES = [
  { label: "Maya", name: "maya-chen.txt" },
  { label: "Jordan", name: "jordan-ellis.txt" },
] as const;

export default function MedicalIntakePage() {
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState<string | null>(null);
  const [submittedValues, setSubmittedValues] = useState<Record<
    string,
    FieldValue
  > | null>(null);
  const api = useAIForm({
    form: medicalIntakeForm,
    transport,
    autoFillOnSource: true,
    onSubmit: (values) => setSubmittedValues(values),
  });

  const loadSample = async (name: string): Promise<void> => {
    setLocalError(null);
    setLoadingSample(name);
    try {
      const response = await fetch(`/api/samples/${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error(await response.text());
      api.sources.addText(await response.text(), name);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingSample(null);
    }
  };

  const sources = (
    <KitSourcePane emptyMessage="Your pasted note and its evidence will appear here.">
      <KitDropZone
        onFile={(file) => {
          setLocalError(null);
          return api.sources.addFile(file);
        }}
        onText={(text, name) => {
          setLocalError(null);
          api.sources.addText(text, name ?? "patient-note.txt");
        }}
        onUnsupported={() => setLocalError("Add a .txt, .md, or .pdf file")}
      >
        <p>
          Describe the visit in your own words. Paste a note below or load a
          sample.
        </p>
      </KitDropZone>
      <div className="anf-source-actions">
        {SAMPLES.map((sample) => (
          <button
            disabled={loadingSample !== null}
            key={sample.name}
            onClick={() => void loadSample(sample.name)}
            type="button"
          >
            {loadingSample === sample.name
              ? `Loading ${sample.label}…`
              : `Load ${sample.label}`}
          </button>
        ))}
      </div>
      {localError ? <p className="anf-inline-error">{localError}</p> : null}
    </KitSourcePane>
  );

  return (
    <AIFormProvider api={api}>
      <main className="min-h-screen bg-stone-100 text-zinc-950">
        <header className="border-b border-zinc-300 bg-white px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[1600px] items-baseline justify-between gap-4">
            <div>
              <p className="font-mono text-xs tracking-[0.18em] text-teal-700 uppercase">
                ai-native-forms
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Medical intake
              </h1>
            </div>
            <a className="text-sm text-zinc-600 underline" href="/">
              Playground home
            </a>
          </div>
        </header>
        <AIFormShell sourcePane={sources}>
          <KitForm>
            {api.submit.status === "submitted" && submittedValues ? (
              <section className="anf-submitted">
                <h2>Submitted</h2>
                <pre>{JSON.stringify(submittedValues, null, 2)}</pre>
              </section>
            ) : null}
          </KitForm>
        </AIFormShell>
      </main>
    </AIFormProvider>
  );
}
