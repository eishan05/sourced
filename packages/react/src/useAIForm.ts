import {
  createFormStore,
  createSource,
  type FieldValue,
  type FillRequest,
  type FillTransport,
  type FormDefinition,
  type FormEvent,
  type FormState,
  fieldsOf,
  type HiddenReason,
  hiddenReason,
  highlightsForSource,
  isVisible,
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
} from "@ai-native-forms/core";
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
}

export interface FieldApi {
  def: SerializedFieldDefinition;
  state: FormState["fields"][string];
  visible: boolean;
  status: FieldStatus;
  value: FieldValue;
  setValue(value: FieldValue): void;
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

export interface AIFormApi {
  today: string;
  state: FormState;
  dispatch: (event: FormEvent) => void;
  registerInput(fieldId: string, element: HTMLElement | null): void;
  field(id: string): FieldApi;
  fields: Record<string, FieldApi>;
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
    focusSpan(span: Span): void;
    clearActiveSpan(): void;
  };
  fill: {
    run(): Promise<void>;
    cancel(): void;
    status: "idle" | "streaming" | "done" | "error";
    error: string | null;
    dropped: Array<{ fieldId?: string; reason: string; detail?: string }>;
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
    if (definition.type === "number") return Number(target.value);
    if (definition.type === "boolean") return Boolean(target.checked);
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
  const todayRef = useRef(options.today ?? localDate());
  transportRef.current = options.transport;
  onSubmitRef.current = options.onSubmit;
  pdfExtractorRef.current = options.pdfExtractor;

  const [activeSpan, setActiveSpan] = useState<Span | null>(null);
  const [pendingSources, setPendingSources] = useState<string[]>([]);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [highlightedOption, setHighlightedOption] = useState(0);
  const [dropped, setDropped] = useState<
    Array<{ fieldId?: string; reason: string; detail?: string }>
  >([]);
  const [reopenedSections, setReopenedSections] = useState<
    Record<string, ReopenedSection>
  >({});
  const activeFillRef = useRef<ActiveFill | null>(null);
  const latestFillIdRef = useRef<string | null>(null);
  const localFillCounterRef = useRef(0);
  const autoFillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRegistryRef = useRef(new Map<string, HTMLElement>());

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

  const runFill = useCallback(async (): Promise<void> => {
    if (activeFillRef.current) return;

    const currentState = store.getState();
    const sourceList = Object.values(currentState.sources);
    const sourceIds = sourceList.map((source) => source.id);
    const controller = new AbortController();
    const activeFill: ActiveFill = {
      controller,
      fillId: null,
      cancelled: false,
      sourceIds,
    };
    activeFillRef.current = activeFill;

    const request: FillRequest = {
      form: serializeForm(options.form as FormDefinition),
      sources: sourceList,
      mode: "fill",
      currentValues: values(currentState),
      today: todayRef.current,
    };

    const failBeforeStart = (message: string): void => {
      const fillId = nextLocalFillId();
      activeFill.fillId = fillId;
      latestFillIdRef.current = fillId;
      store.dispatch({ type: "FILL_STARTED", fillId, sourceIds });
      store.dispatch({ type: "FILL_FAILED", fillId, error: message });
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
            latestFillIdRef.current = event.fillId;
            store.dispatch({
              type: "FILL_STARTED",
              fillId: event.fillId,
              sourceIds,
            });
            break;
          case "proposal":
            store.dispatch({
              type: "PROPOSAL_RECEIVED",
              proposal: event.proposal,
            });
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
            store.dispatch({
              type: "NO_EVIDENCE",
              fillId: event.fillId,
              fieldId: event.fieldId,
            });
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
            break;
          case "error":
            if (!activeFill.fillId) {
              failBeforeStart(event.message);
            } else {
              store.dispatch({
                type: "FILL_FAILED",
                fillId: event.fillId || activeFill.fillId,
                error: event.message,
              });
            }
            return;
          default: {
            const exhaustive: never = event;
            return exhaustive;
          }
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && !activeFill.cancelled) {
        const message = errorMessage(error).slice(0, 500);
        if (!activeFill.fillId) {
          failBeforeStart(message);
        } else {
          store.dispatch({
            type: "FILL_FAILED",
            fillId: activeFill.fillId,
            error: message,
          });
        }
      }
    } finally {
      if (activeFillRef.current === activeFill) {
        activeFillRef.current = null;
      }
    }
  }, [nextLocalFillId, options.form, store]);

  const cancelFill = useCallback(() => {
    const activeFill = activeFillRef.current;
    if (!activeFill) return;
    activeFill.cancelled = true;
    activeFill.controller.abort();

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
      activeFillRef.current?.controller.abort();
    },
    [],
  );

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
            const { createPdfExtractor } = await import(
              "@ai-native-forms/react/pdf"
            );
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
    },
    [store],
  );

  const focusSpan = useCallback((span: Span) => setActiveSpan(span), []);
  const clearActiveSpan = useCallback(() => setActiveSpan(null), []);

  const requestSubmit = useCallback(async (): Promise<void> => {
    if (store.getState().submit.status === "submitting") return;
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
  }, [store]);

  return useMemo(() => {
    const definitions = fieldsOf(state.definition);
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
        ]
          .filter(Boolean)
          .join(" ");
        const provenance = field.provenance;
        const span = provenance?.span;
        const fieldApi: FieldApi = {
          def: definition,
          state: field,
          visible: isVisible(state, definition.id),
          status,
          value: field.value,
          setValue(value) {
            store.dispatch({ type: "OVERRIDE", fieldId: definition.id, value });
          },
          accept() {
            store.dispatch({ type: "ACCEPT", fieldId: definition.id });
          },
          revert() {
            store.dispatch({ type: "REVERT", fieldId: definition.id });
          },
          dismiss() {
            store.dispatch({
              type: "DISMISS_SUGGESTION",
              fieldId: definition.id,
            });
          },
          answer(value, optionIndex) {
            store.dispatch({
              type: "ANSWER",
              fieldId: definition.id,
              value,
              ...(optionIndex === undefined ? {} : { optionIndex }),
            });
          },
          useSelection(value, selectedSpan) {
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
              store.dispatch({
                type: "OVERRIDE",
                fieldId: definition.id,
                value: eventValue(definition, eventOrValue),
              });
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
        focusSpan,
        clearActiveSpan,
      },
      fill: {
        run: runFill,
        cancel: cancelFill,
        status: latestFill?.status ?? "idle",
        error: latestFill?.error ?? null,
        dropped,
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
    clearActiveSpan,
    dropped,
    focusSpan,
    highlightedOption,
    pendingSources,
    registerInput,
    removeSource,
    reopenedSections,
    requestSubmit,
    runFill,
    sourceError,
    state,
    store,
  ]);
}
