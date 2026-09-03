export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-zinc-950 px-6 text-zinc-100">
      <div className="mx-auto w-full max-w-4xl py-24">
        <p className="font-mono text-sm tracking-[0.2em] text-amber-400 uppercase">
          ai-native-forms
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight sm:text-7xl">
          Forms that start with the evidence.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-400">
          These demos show how headless AI-native form primitives and the
          drop-in styled kit turn source evidence into reviewable answers while
          keeping people in control of every submitted value.
        </p>
        <ul className="mt-10 border-t border-zinc-700">
          <li className="border-b border-zinc-700">
            <a
              className="flex items-center justify-between gap-6 py-5 text-lg font-semibold transition hover:text-amber-300"
              href="/job-application"
            >
              <span>Job application</span>
              <span aria-hidden="true">Open →</span>
            </a>
          </li>
        </ul>
      </div>
    </main>
  );
}
