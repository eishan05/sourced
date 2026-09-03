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
          Add a resume, watch the application fill as proposals stream in, and
          review every answer against its source.
        </p>
        <a
          className="mt-10 inline-block bg-amber-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
          href="/job-application"
        >
          Open job application
        </a>
      </div>
    </main>
  );
}
