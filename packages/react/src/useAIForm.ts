import {
  createFormStore,
  createSource,
  type FieldValue,
  type FillRequest,
  type FillTransport,
  type Flag,
  type FormDefinition,
  type FormEvent,
  type FormState,
  fieldsOf,
  type HiddenReason,
  hiddenReason,
  highlightsForSource,
  isVisible,
  type Normalization,
  normalizeValue,
  type ProvenanceKind,
  policyOf,
  reviewCursorFieldId,
  type SerializedFieldDefinition,
  type SerializedFormDefinition,
  type Source,
  type SourceHighlight,
  type Span,
  type SubmitBlocker,
  type SubmitSummary,
  serializeForm,
  submitBlockers,
  submitSummary,
  type ValidationIssue,
  values,
} from "@sourced/core";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

export interface UseAIFormOptions {
  form: FormDefinition | SerializedFormDefinition;
  transport: FillTransport;
  initialValues?: Record<string, FieldValue>;
  today?: string;
  autoFillOnSource?: boolean;
  checkBeforeSubmit?: boolean;
  pdfExtractor?: (
    data: ArrayBuffer,
  ) => Promise<{ text: string; pageTexts: string[] }>;
  onSubmit?: (
    values: Record<string, FieldValue>,
    summary: SubmitSummary,
  ) => void | Promise<void>;
}

export type FieldStatus =
  | "empty"
  | "ai-pending"
  | "ai-accepted"
  | "ghost"
  | "question"
  | "overridden"
  | "prefill"
  | "human-only";

export interface FieldInputProps {
  id: string;
  name: string;
  "aria-describedby": string | undefined;
  "data-status": FieldStatus;
  "data-provenance": ProvenanceKind | undefined;
  value: string;
  ref(element: HTMLElement | null): void;
  onChange(eventOrValue: unknown): void;
  onFocus(): void;
  onBlur(): void;
}

export interface FieldApi {
  def: SerializedFieldDefinition;
  state: FormState["fields"][string];
  visible: boolean;
  status: FieldStatus;
  value: FieldValue;
  draft: boolean;
  justFilled: boolean;
  normalization: Normalization | null;
  setValue(value: FieldValue): void;
  normalize(): void;
  revertNormalization(): void;
  accept(): void;
  revert(): void;
  dismiss(): void;
  answer(value: FieldValue, optionIndex?: number): void;
  useSelection(value: FieldValue, span: Span): void;
  clearAI(): void;
  focus(): void;
  chip: {
    label: string | null;
    kind: ProvenanceKind | null;
    span?: Span;
    focus(): void;
  };
  issues: ValidationIssue[];
  inputProps: FieldInputProps;
}

export interface SectionApi {
  def: SerializedFormDefinition["sections"][number];
  visible: boolean;
  hiddenReason: HiddenReason | null;
  reopened: boolean;
  fields: FieldApi[];
  reopen(): void;
  collapse(): void;
}

export interface SourceSelection {
  sourceId: string;
  start: number;
  end: number;
  quote: string;
}

type RunStatus = "idle" | "streaming" | "done" | "error";

export interface AIFormApi {
  today: string;
  state: FormState;
  dispatch: (event: FormEvent) => void;
  registerInput(fieldId: string, element: HTMLElement | null): void;
  field(id: string): FieldApi;
  fields: Record<string, FieldApi>;
  flagsByFirstField: Record<string, Flag[]>;
  sections: SectionApi[];
  sources: {
    list: Source[];
    pending: string[];
    error: string | null;
    addText(text: string, name?: string): Source;
    addFile(file: File): Promise<Source>;
    remove(id: string): void;
    highlights(sourceId: string): SourceHighlight[];
    activeSpan: Span | null;
    selection: SourceSelection | null;
    setSelection(selection: SourceSelection | null): void;
    focusSpan(span: Span): void;
    clearActiveSpan(): void;
  };
  fill: {
    run(): Promise<void>;
    cancel(): void;
    retry(): Promise<void>;
    status: RunStatus;
    error: string | null;
    retryable: boolean;
    dropped: Array<{ fieldId?: string; reason: string; detail?: string }>;
  };
  check: {
    run(): Promise<void>;
    status: RunStatus;
    error: string | null;
  };
  flags: {
    all: Flag[];
    byFirstField: Record<string, Flag[]>;
    openErrorCount: number;
    acknowledge(flagId: string): void;
  };
  review: {
    active: boolean;
    cursorFieldId: string | null;
    highlightedOption: number;
    setHighlightedOption: Dispatch<SetStateAction<number>>;
    order: string[];
    remaining: string[];
    progress: { index: number; total: number };
    start(): void;
    next(): void;
    skip(): void;
    prev(): void;
    goTo(id: string): void;
    end(): void;
  };
  submit: {
    request(): Promise<void>;
    status: FormState["submit"]["status"];
    blockers: SubmitBlocker[];
    summary: SubmitSummary;
    clearAllAI(): void;
  };
}

interface ActiveFill {
  controller: AbortController;
  fillId: string | null;
  cancelled: boolean;
  sourceIds: string[];
  mode: FillRequest["mode"];
}

interface RunResult {
  status: "done" | "error" | "cancelled" | "busy";
  proposals: number;
}

interface ReopenedSection {
  gateFieldId: string;
  gateValue: FieldValue;
}

function fieldValuesEqual(left: FieldValue, right: FieldValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => item === right[index])
    );
  }
  return left === right;
}

function localDate(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fieldStatus(
  definition: SerializedFieldDefinition,
  field: FormState["fields"][string],
): FieldStatus {
  if (policyOf(definition) === "human") return "human-only";
  if (field.question) return "question";
  if (field.suggestion && field.value === null) return "ghost";
  if (field.reviewStatus === "pending") return "ai-pending";
  if (field.reviewStatus === "accepted") return "ai-accepted";
  if (field.reviewStatus === "overridden") return "overridden";
  if (field.provenance?.kind === "prefill") return "prefill";
  return "empty";
}

function chipLabel(
  state: FormState,
  provenance: FormState["fields"][string]["provenance"],
): string | null {
  if (!provenance) return null;
  if (
    provenance.span &&
    ["extracted", "answered", "user"].includes(provenance.kind)
  ) {
    const source = state.sources[provenance.span.sourceId];
    return source ? `from ${source.name}` : null;
  }
  if (provenance.kind === "inferred") return "inferred";
  if (provenance.kind === "user") return "you typed";
  if (provenance.kind === "prefill") return "prefilled";
  return null;
}

function eventValue(
  definition: SerializedFieldDefinition,
  eventOrValue: unknown,
): FieldValue {
  if (
    eventOrValue !== null &&
    typeof eventOrValue === "object" &&
    "target" in eventOrValue
  ) {
    const target = (
      eventOrValue as {
        target: { value: string; checked?: boolean };
      }
    ).target;
    if (definition.type === "boolean") return Boolean(target.checked);
    if (definition.type === "number") {
      const raw = target.value;
      const trimmed = raw.trim();
      if (trimmed !== "" && String(Number(trimmed)) === trimmed) {
        return Number(trimmed);
      }
    }
    return target.value;
  }
  return eventOrValue as FieldValue;
}

export function useAIForm(options: UseAIFormOptions): AIFormApi {
  const storeRef = useRef<ReturnType<typeof createFormStore> | null>(null);
  if (!storeRef.current) {
    storeRef.current = createFormStore(options.form, options.initialValues);
  }
  const store = storeRef.current;
  const state = useSyncExternalStore(
    store.subscribe,
    store.getState,
    store.getState,
  );
  const transportRef = useRef(options.transport);
  const onSubmitRef = useRef(options.onSubmit);
  const pdfExtractorRef = useRef(options.pdfExtractor);
  const checkBeforeSubmitRef = useRef(options.checkBeforeSubmit !== false);
  const todayRef = useRef(options.today ?? localDate());
  transportRef.current = options.transport;
  onSubmitRef.current = options.onSubmit;
  pdfExtractorRef.current = options.pdfExtractor;
  checkBeforeSubmitRef.current = options.checkBeforeSubmit !== false;

  const [activeSpan, setActiveSpan] = useState<Span | null>(null);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [pendingSources, setPendingSources] = useState<string[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [highlightedOption, setHighlightedOption] = useState(0);
  const [dropped, setDropped] = useState<
    Array<{ fieldId?: string; reason: string; detail?: string }>
  >([]);
  const [reopenedSections, setReopenedSections] = useState<
    Record<string, ReopenedSection>
  >({});
  const [userNormalizations, setUserNormalizations] = useState<
    Record<string, Normalization>
  >({});
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);
  const [justFilledFields, setJustFilledFields] = useState<
    Record<string, true>
  >({});
  const [fillRetryable, setFillRetryable] = useState(false);
  const [checkState, setCheckState] = useState<{
    status: RunStatus;
    error: string | null;
  }>({ status: "idle", error: null });
  const activeFillRef = useRef<ActiveFill | null>(null);
  const latestFillIdRef = useRef<string | null>(null);
  const checkedValuesHashRef = useRef<string | null>(null);
  const localFillCounterRef = useRef(0);
  const autoFillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimersRef = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const provenanceRef = useRef(
    Object.fromEntries(
      Object.entries(store.getState().fields).map(([fieldId, field]) => [
        fieldId,
        field.provenance
          ? `${field.provenance.kind}:${field.provenance.proposalId ?? field.provenance.questionId ?? ""}`
          : null,
      ]),
    ) as Record<string, string | null>,
  );
  const inputRegistryRef = useRef(new Map<string, HTMLElement>());

  const clearUserNormalization = useCallback((fieldId: string): void => {
    setUserNormalizations((current) => {
      if (!Object.hasOwn(current, fieldId)) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }, []);

  const registerInput = useCallback(
    (fieldId: string, element: HTMLElement | null): void => {
      if (element) {
        inputRegistryRef.current.set(fieldId, element);
      } else {
        inputRegistryRef.current.delete(fieldId);
      }
    },
    [],
  );

  const nextLocalFillId = useCallback(() => {
    localFillCounterRef.current += 1;
    return `local-${localFillCounterRef.current}`;
  }, []);

  const executeRun = useCallback(
    async (mode: FillRequest["mode"]): Promise<RunResult> => {
      if (activeFillRef.current) {
        return { status: "busy", proposals: 0 };
      }

      const currentState = store.getState();
      const sourceList = Object.values(currentState.sources);
      const sourceIds = sourceList.map((source) => source.id);
      const controller = new AbortController();
      const activeFill: ActiveFill = {
        controller,
        fillId: null,
        cancelled: false,
        sourceIds,
        mode,
      };
      activeFillRef.current = activeFill;
      if (mode === "fill") {
        setFillRetryable(false);
      } else {
        setCheckState({ status: "streaming", error: null });
      }

      const request: FillRequest = {
        form: serializeForm(options.form as FormDefinition),
        sources: sourceList,
        mode,
        currentValues: values(currentState),
        today: todayRef.current,
      };
      let receivedProposals = 0;

      const startLocalFill = (): string => {
        const fillId = nextLocalFillId();
        activeFill.fillId = fillId;
        if (mode === "fill") latestFillIdRef.current = fillId;
        store.dispatch({ type: "FILL_STARTED", fillId, sourceIds });
        return fillId;
      };
      const fail = (message: string, retryable: boolean): void => {
        const fillId = activeFill.fillId ?? startLocalFill();
        store.dispatch({ type: "FILL_FAILED", fillId, error: message });
        if (mode === "fill") {
          setFillRetryable(retryable);
        } else {
          setCheckState({ status: "error", error: message });
        }
      };

      try {
        for await (const event of transportRef.current(
          request,
          controller.signal,
        )) {
          if (controller.signal.aborted || activeFill.cancelled) break;

          switch (event.type) {
            case "start":
              activeFill.fillId = event.fillId;
              if (mode === "fill") latestFillIdRef.current = event.fillId;
              store.dispatch({
                type: "FILL_STARTED",
                fillId: event.fillId,
                sourceIds,
              });
              break;
            case "proposal":
              if (mode === "fill") {
                receivedProposals += 1;
                store.dispatch({
                  type: "PROPOSAL_RECEIVED",
                  proposal: event.proposal,
                });
              }
              break;
            case "question":
              store.dispatch({
                type: "QUESTION_RECEIVED",
                question: event.question,
              });
              break;
            case "flag":
              store.dispatch({ type: "FLAG_RECEIVED", flag: event.flag });
              break;
            case "no_evidence":
              if (mode === "fill") {
                store.dispatch({
                  type: "NO_EVIDENCE",
                  fillId: event.fillId,
                  fieldId: event.fieldId,
                });
              }
              break;
            case "dropped": {
              const entry = {
                ...(event.fieldId ? { fieldId: event.fieldId } : {}),
                reason: event.reason,
                ...(event.detail ? { detail: event.detail } : {}),
              };
              setDropped((current) => [...current, entry]);
              break;
            }
            case "ping":
              break;
            case "done":
              store.dispatch({ type: "FILL_FINISHED", fillId: event.fillId });
              if (mode === "check") {
                checkedValuesHashRef.current = JSON.stringify(
                  values(store.getState()),
                );
                setCheckState({ status: "done", error: null });
              }
              return { status: "done", proposals: receivedProposals };
            case "error":
              fail(event.message, event.retryable);
              return { status: "error", proposals: receivedProposals };
            default: {
              const exhaustive: never = event;
              return exhaustive;
            }
          }
        }

        if (activeFill.cancelled) {
          return { status: "cancelled", proposals: receivedProposals };
        }
        if (mode === "check") {
          setCheckState({
            status: "error",
            error: "Check ended before completion",
          });
        }
        return { status: "error", proposals: receivedProposals };
      } catch (error) {
        if (!controller.signal.aborted && !activeFill.cancelled) {
          fail(errorMessage(error).slice(0, 500), true);
        }
        return {
          status: activeFill.cancelled ? "cancelled" : "error",
          proposals: receivedProposals,
        };
      } finally {
        if (activeFillRef.current === activeFill) {
          activeFillRef.current = null;
        }
      }
    },
    [nextLocalFillId, options.form, store],
  );

  const runCheck = useCallback(async (): Promise<void> => {
    await executeRun("check");
  }, [executeRun]);

  const runFill = useCallback(async (): Promise<void> => {
    const result = await executeRun("fill");
    if (result.status !== "done" || result.proposals === 0) return;

    const currentHash = JSON.stringify(values(store.getState()));
    if (checkedValuesHashRef.current !== currentHash) {
      await executeRun("check");
    }
  }, [executeRun, store]);

  const cancelFill = useCallback(() => {
    const activeFill = activeFillRef.current;
    if (activeFill?.mode !== "fill") return;
    activeFill.cancelled = true;
    activeFill.controller.abort();
    setFillRetryable(false);

    let fillId = activeFill.fillId;
    if (!fillId) {
      fillId = nextLocalFillId();
      activeFill.fillId = fillId;
      latestFillIdRef.current = fillId;
      store.dispatch({
        type: "FILL_STARTED",
        fillId,
        sourceIds: activeFill.sourceIds,
      });
    }
    store.dispatch({ type: "FILL_FAILED", fillId, error: "Cancelled" });
  }, [nextLocalFillId, store]);

  useEffect(
    () => () => {
      if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
      for (const timer of settleTimersRef.current.values()) {
        clearTimeout(timer);
      }
      settleTimersRef.current.clear();
      activeFillRef.current?.controller.abort();
    },
    [],
  );

  useEffect(() => {
    const aiKinds = new Set<ProvenanceKind>([
      "extracted",
      "inferred",
      "answered",
    ]);
    const landed: string[] = [];
    const next: Record<string, string | null> = {};

    for (const [fieldId, field] of Object.entries(state.fields)) {
      const provenance = field.provenance;
      const signature = provenance
        ? `${provenance.kind}:${provenance.proposalId ?? provenance.questionId ?? ""}`
        : field.suggestion
          ? `suggestion:${field.suggestion.id}`
          : null;
      next[fieldId] = signature;
      if (
        ((provenance && aiKinds.has(provenance.kind)) || field.suggestion) &&
        provenanceRef.current[fieldId] !== signature
      ) {
        landed.push(fieldId);
      }
    }

    provenanceRef.current = next;
    if (landed.length === 0) return;

    setJustFilledFields((current) => {
      const updated = { ...current };
      for (const fieldId of landed) updated[fieldId] = true;
      return updated;
    });

    for (const fieldId of landed) {
      const currentTimer = settleTimersRef.current.get(fieldId);
      if (currentTimer) clearTimeout(currentTimer);
      settleTimersRef.current.set(
        fieldId,
        setTimeout(() => {
          settleTimersRef.current.delete(fieldId);
          setJustFilledFields((current) => {
            if (!Object.hasOwn(current, fieldId)) return current;
            const updated = { ...current };
            delete updated[fieldId];
            return updated;
          });
        }, 600),
      );
    }
  }, [state.fields]);

  useEffect(() => {
    setReopenedSections((current) => {
      let changed = false;
      const next = { ...current };

      for (const [sectionId, reopened] of Object.entries(current)) {
        const reason = hiddenReason(state, sectionId);
        const gateValue = state.fields[reopened.gateFieldId]?.value ?? null;
        if (
          !reason ||
          reason.gateFieldId !== reopened.gateFieldId ||
          !fieldValuesEqual(gateValue, reopened.gateValue)
        ) {
          delete next[sectionId];
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [state]);

  const scheduleAutoFill = useCallback(() => {
    if (options.autoFillOnSource === false || activeFillRef.current) return;
    if (autoFillTimerRef.current) clearTimeout(autoFillTimerRef.current);
    autoFillTimerRef.current = setTimeout(() => {
      autoFillTimerRef.current = null;
      if (!activeFillRef.current) void runFill();
    }, 300);
  }, [options.autoFillOnSource, runFill]);

  const addText = useCallback(
    (text: string, name = "pasted-text.txt"): Source => {
      const source = createSource({ name, kind: "paste", text });
      store.dispatch({ type: "SOURCE_ADDED", source });
      setSourceError(null);
      scheduleAutoFill();
      return source;
    },
    [scheduleAutoFill, store],
  );

  const addFile = useCallback(
    async (file: File): Promise<Source> => {
      const lowerName = file.name.toLowerCase();
      const isPdf =
        lowerName.endsWith(".pdf") ||
        file.type.toLowerCase() === "application/pdf";
      if (!isPdf) {
        if (!lowerName.endsWith(".txt") && !lowerName.endsWith(".md")) {
          throw new Error(
            "Unsupported file type. Add a .txt, .md, or .pdf file.",
          );
        }
        return addText(await file.text(), file.name);
      }

      setPendingSources((current) => [...current, file.name]);
      try {
        const extractor =
          pdfExtractorRef.current ??
          (async (data: ArrayBuffer) => {
            const { createPdfExtractor } = await import("@sourced/react/pdf");
            return createPdfExtractor()(data);
          });
        const extracted = await extractor(await file.arrayBuffer());
        const source = createSource({
          name: file.name,
          kind: "pdf",
          text: extracted.text,
          pageTexts: extracted.pageTexts,
        });
        store.dispatch({ type: "SOURCE_ADDED", source });
        setSourceError(null);
        scheduleAutoFill();
        return source;
      } catch (error) {
        const message = `Could not extract ${file.name}: ${errorMessage(error)}`;
        setSourceError(message);
        throw new Error(message, { cause: error });
      } finally {
        setPendingSources((current) => {
          const index = current.indexOf(file.name);
          return index < 0
            ? current
            : [...current.slice(0, index), ...current.slice(index + 1)];
        });
      }
    },
    [addText, scheduleAutoFill, store],
  );

  const removeSource = useCallback(
    (id: string) => {
      store.dispatch({ type: "SOURCE_REMOVED", sourceId: id });
      setActiveSpan((span) => (span?.sourceId === id ? null : span));
      setSelection((current) => (current?.sourceId === id ? null : current));
    },
    [store],
  );

  const focusSpan = useCallback((span: Span) => setActiveSpan(span), []);
  const clearActiveSpan = useCallback(() => setActiveSpan(null), []);

  const requestSubmit = useCallback(async (): Promise<void> => {
    if (store.getState().submit.status === "submitting") return;
    if (submitBlockers(store.getState()).length > 0) return;

    if (checkBeforeSubmitRef.current) {
      const result = await executeRun("check");
      if (result.status === "cancelled" || result.status === "busy") return;
      if (
        result.status === "done" &&
        submitBlockers(store.getState()).some(
          (blocker) => blocker.reason === "flag",
        )
      ) {
        return;
      }
    }

    store.dispatch({ type: "SUBMIT_REQUESTED" });
    const submittingState = store.getState();
    if (submittingState.submit.status !== "submitting") return;

    try {
      await onSubmitRef.current?.(
        values(submittingState),
        submitSummary(submittingState),
      );
      store.dispatch({ type: "SUBMIT_SUCCEEDED" });
    } catch (error) {
      store.dispatch({
        type: "SUBMIT_FAILED",
        error: errorMessage(error).slice(0, 500),
      });
    }
  }, [executeRun, store]);

  return useMemo(() => {
    const definitions = fieldsOf(state.definition);
    const flagsByFirstField: Record<string, Flag[]> = {};
    for (const flag of state.flags) {
      const firstFieldId = flag.fieldIds[0];
      if (firstFieldId) {
        const fieldFlags = flagsByFirstField[firstFieldId] ?? [];
        fieldFlags.push(flag);
        flagsByFirstField[firstFieldId] = fieldFlags;
      }
    }
    const fields = Object.fromEntries(
      definitions.map((definition) => {
        const field = state.fields[definition.id];
        if (!field) {
          throw new Error(`Missing field state for ${definition.id}`);
        }
        const status = fieldStatus(definition, field);
        const describedBy = [
          definition.description ? `${definition.id}-description` : null,
          field.issues.length > 0 ? `${definition.id}-issues` : null,
          policyOf(definition) === "human"
            ? `${definition.id}-human-note`
            : null,
          field.question ? `${definition.id}-question` : null,
          flagsByFirstField[definition.id]?.length
            ? `${definition.id}-flags`
            : null,
        ]
          .filter(Boolean)
          .join(" ");
        const provenance = field.provenance;
        const span = provenance?.span;
        const userNormalization = userNormalizations[definition.id];
        const normalization =
          userNormalization ?? provenance?.normalization ?? null;
        const focused = focusedFieldId === definition.id;
        const draft =
          focused &&
          (field.issues.some((issue) => issue.severity === "warning") ||
            ((definition.type === "date" ||
              definition.type === "number" ||
              definition.type === "phone") &&
              typeof field.value === "string" &&
              normalization === null));
        const normalize = (): void => {
          if (
            definition.type !== "date" &&
            definition.type !== "number" &&
            definition.type !== "phone"
          ) {
            return;
          }
          const raw = store.getState().fields[definition.id]?.value;
          if (typeof raw !== "string") return;
          const normalized = normalizeValue(definition, raw, {
            today: todayRef.current,
          });
          if (!normalized || fieldValuesEqual(normalized.value, raw)) return;

          store.dispatch({
            type: "OVERRIDE",
            fieldId: definition.id,
            value: normalized.value,
          });
          if (
            normalized.explanation ||
            String(normalized.value) !== raw.trim()
          ) {
            setUserNormalizations((current) => ({
              ...current,
              [definition.id]: {
                raw,
                explanation:
                  normalized.explanation ??
                  `Read '${raw}' as ${String(normalized.value)}`,
              },
            }));
          }
        };
        const fieldApi: FieldApi = {
          def: definition,
          state: field,
          visible: isVisible(state, definition.id),
          status,
          value: field.value,
          draft,
          justFilled: Object.hasOwn(justFilledFields, definition.id),
          normalization,
          setValue(value) {
            clearUserNormalization(definition.id);
            store.dispatch({ type: "OVERRIDE", fieldId: definition.id, value });
          },
          normalize,
          revertNormalization() {
            if (!userNormalization) return;
            store.dispatch({
              type: "OVERRIDE",
              fieldId: definition.id,
              value: userNormalization.raw,
            });
            clearUserNormalization(definition.id);
          },
          accept() {
            clearUserNormalization(definition.id);
            store.dispatch({ type: "ACCEPT", fieldId: definition.id });
          },
          revert() {
            clearUserNormalization(definition.id);
            store.dispatch({ type: "REVERT", fieldId: definition.id });
          },
          dismiss() {
            store.dispatch({
              type: "DISMISS_SUGGESTION",
              fieldId: definition.id,
            });
          },
          answer(value, optionIndex) {
            clearUserNormalization(definition.id);
            store.dispatch({
              type: "ANSWER",
              fieldId: definition.id,
              value,
              ...(optionIndex === undefined ? {} : { optionIndex }),
            });
          },
          useSelection(value, selectedSpan) {
            clearUserNormalization(definition.id);
            store.dispatch({
              type: "USE_SELECTION",
              fieldId: definition.id,
              value,
              span: selectedSpan,
            });
          },
          clearAI() {
            store.dispatch({ type: "CLEAR_AI", fieldId: definition.id });
          },
          focus() {
            const element = inputRegistryRef.current.get(definition.id);
            element?.focus();
            element?.scrollIntoView?.({ block: "center" });
          },
          chip: {
            label: chipLabel(state, provenance),
            kind: provenance?.kind ?? null,
            ...(span ? { span } : {}),
            focus() {
              if (span) focusSpan(span);
            },
          },
          issues: field.issues,
          inputProps: {
            id: definition.id,
            name: definition.id,
            "aria-describedby": describedBy || undefined,
            "data-status": status,
            "data-provenance": provenance?.kind,
            value:
              typeof field.value === "string" || typeof field.value === "number"
                ? String(field.value)
                : "",
            ref(element) {
              registerInput(definition.id, element);
            },
            onChange(eventOrValue) {
              clearUserNormalization(definition.id);
              store.dispatch({
                type: "OVERRIDE",
                fieldId: definition.id,
                value: eventValue(definition, eventOrValue),
              });
            },
            onFocus() {
              setFocusedFieldId(definition.id);
            },
            onBlur() {
              normalize();
              setFocusedFieldId((current) =>
                current === definition.id ? null : current,
              );
            },
          },
        };
        return [definition.id, fieldApi];
      }),
    ) as Record<string, FieldApi>;

    const field = (id: string): FieldApi => {
      const result = fields[id];
      if (!result) throw new Error(`Unknown field id "${id}"`);
      return result;
    };
    const latestFill = latestFillIdRef.current
      ? state.fills[latestFillIdRef.current]
      : undefined;

    return {
      today: todayRef.current,
      state,
      dispatch: store.dispatch,
      registerInput,
      field,
      fields,
      flagsByFirstField,
      sections: state.definition.sections.map((definition) => {
        const reason = hiddenReason(state, definition.id);
        // An unanswered gate has not made a decision yet. Keeping the section
        // open lets an inferred gate proposal remain a ghost until acceptance.
        const visible = reason === null || reason.gateValue === null;
        const reopenedState = reopenedSections[definition.id];
        const reopened = Boolean(
          !visible &&
            reason &&
            reopenedState &&
            reopenedState.gateFieldId === reason.gateFieldId &&
            fieldValuesEqual(reopenedState.gateValue, reason.gateValue),
        );
        return {
          def: definition,
          visible,
          hiddenReason: reason,
          reopened,
          fields: definition.fields.map((item) => field(item.id)),
          reopen() {
            if (visible || !reason) return;
            setReopenedSections((current) => ({
              ...current,
              [definition.id]: {
                gateFieldId: reason.gateFieldId,
                gateValue: reason.gateValue,
              },
            }));
          },
          collapse() {
            setReopenedSections((current) => {
              if (!Object.hasOwn(current, definition.id)) return current;
              const next = { ...current };
              delete next[definition.id];
              return next;
            });
          },
        };
      }),
      sources: {
        list: Object.values(state.sources),
        pending: pendingSources,
        error: sourceError,
        addText,
        addFile,
        remove: removeSource,
        highlights(sourceId: string) {
          return highlightsForSource(state, sourceId);
        },
        activeSpan,
        selection,
        setSelection,
        focusSpan,
        clearActiveSpan,
      },
      fill: {
        run: runFill,
        cancel: cancelFill,
        retry: runFill,
        status: latestFill?.status ?? "idle",
        error: latestFill?.error ?? null,
        retryable: fillRetryable,
        dropped,
      },
      check: {
        run: runCheck,
        status: checkState.status,
        error: checkState.error,
      },
      flags: {
        all: state.flags,
        byFirstField: flagsByFirstField,
        openErrorCount: state.flags.filter(
          (flag) => flag.severity === "error" && !flag.acknowledged,
        ).length,
        acknowledge(flagId: string) {
          store.dispatch({ type: "ACKNOWLEDGE_FLAG", flagId });
        },
      },
      review: {
        active: state.review.active,
        cursorFieldId: reviewCursorFieldId(state),
        highlightedOption,
        setHighlightedOption,
        order: state.review.order,
        remaining: state.review.order.slice(state.review.cursor),
        progress: {
          index:
            state.review.order.length === 0
              ? 0
              : Math.min(state.review.cursor + 1, state.review.order.length),
          total: state.review.order.length,
        },
        start() {
          store.dispatch({ type: "REVIEW_START" });
        },
        next() {
          store.dispatch({ type: "REVIEW_NEXT" });
        },
        skip() {
          store.dispatch({ type: "REVIEW_SKIP" });
        },
        prev() {
          store.dispatch({ type: "REVIEW_PREV" });
        },
        goTo(id: string) {
          store.dispatch({ type: "REVIEW_GOTO", fieldId: id });
        },
        end() {
          store.dispatch({ type: "REVIEW_END" });
        },
      },
      submit: {
        request: requestSubmit,
        status: state.submit.status,
        blockers: submitBlockers(state),
        summary: submitSummary(state),
        clearAllAI() {
          store.dispatch({ type: "CLEAR_AI" });
        },
      },
    } satisfies AIFormApi;
  }, [
    activeSpan,
    addFile,
    addText,
    cancelFill,
    checkState,
    clearUserNormalization,
    clearActiveSpan,
    dropped,
    fillRetryable,
    focusedFieldId,
    focusSpan,
    highlightedOption,
    justFilledFields,
    pendingSources,
    registerInput,
    removeSource,
    reopenedSections,
    requestSubmit,
    runCheck,
    runFill,
    selection,
    sourceError,
    state,
    store,
    userNormalizations,
  ]);
}
