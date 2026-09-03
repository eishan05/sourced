# ai-native-forms

AI-native web forms: forms designed from the ground up to be filled with AI assistance.

- `packages/core`: framework-agnostic TypeScript primitives
- `packages/server`: server-side package built on core
- `packages/react`: React package built on core
- `apps/playground`: Next.js playground for the packages

Run `pnpm install`, then `pnpm dev`; use `pnpm check` to run every validation task.

## PDF extraction

PDF support is available from `@ai-native-forms/react/pdf` and is loaded lazily
by `useAIForm` only when a PDF is added. Extraction runs on the main thread by
default. Call `createPdfExtractor({ worker: true })` to opt into a module worker
emitted beside the PDF entry; worker behavior can depend on how the application
bundles PDF.js.
