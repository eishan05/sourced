import { CORE_VERSION } from "@ai-native-forms/core";
import { jobApplicationForm } from "@ai-native-forms/examples";
import { REACT_VERSION } from "@ai-native-forms/react";
import { SERVER_VERSION } from "@ai-native-forms/server";

const packages = [
  ["core", CORE_VERSION],
  ["server", SERVER_VERSION],
  ["react", REACT_VERSION],
] as const;

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-zinc-950 px-6 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl py-24">
        <p className="mb-4 font-mono text-sm tracking-widest text-emerald-400 uppercase">
          Workspace ready
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          ai-native-forms playground
        </h1>
        <p className="mt-4 text-lg text-zinc-300">{jobApplicationForm.title}</p>
        <dl className="mt-12 divide-y divide-zinc-800 border-y border-zinc-800 font-mono text-sm">
          {packages.map(([name, version]) => (
            <div className="flex justify-between py-4" key={name}>
              <dt className="text-zinc-400">@ai-native-forms/{name}</dt>
              <dd>{version}</dd>
            </div>
          ))}
        </dl>
      </div>
    </main>
  );
}
