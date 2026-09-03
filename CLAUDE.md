# ai-native-forms

AI-native web forms: forms designed from the ground up to be filled with AI assistance. The goal is a kick-ass user experience, not AI bolted onto a traditional form. Nothing built yet.

## Working model: orchestrator + implementer

This repo uses a two-model division of labor:

- **Claude Fable 5 (Claude Code) — orchestrator.** Owns planning and architecture, breaks work into well-specified tasks, delegates implementation, reviews and checks the returned work (correctness, tests, integration), and decides what happens next. Fable does not write the bulk of the implementation code itself.
- **Codex — implementer.** All implementation tasks are delegated to Codex CLI running `gpt-5.6-sol` with `xhigh` reasoning effort. Invoke non-interactively, e.g.:

  ```sh
  codex exec -m gpt-5.6-sol -c model_reasoning_effort=xhigh "<task spec>"
  ```

### Delegation loop

1. Fable writes a precise task spec: goal, files in scope, constraints, acceptance criteria.
2. Codex implements it.
3. Fable checks the work — reads the diff, runs tests/build, verifies acceptance criteria.
4. Rework goes back to Codex with concrete feedback; Fable only hand-edits trivial fixes (typos, small config) where a delegation round-trip is wasteful.
