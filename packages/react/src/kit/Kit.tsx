import {
  type FocusEvent,
  type FormEvent,
  type ReactNode,
  useId,
  useState,
} from "react";
import {
  AskBack,
  DropZone,
  type DropZoneProps,
  Field,
  type FieldApi,
  Flags,
  Ghost,
  HiddenSection,
  HumanOnlyNote,
  Issues,
  Normalization,
  ProvenanceChip,
  ReviewBar,
  type ReviewBarProps,
  SourcePane,
  SubmitSummary,
  type SubmitSummaryProps,
  useAIFormApi,
  useReviewKeyboard,
} from "..";

function classes(base: string, className?: string): string {
  return className ? `${base} ${className}` : base;
}

function scalarValue(field: FieldApi): string {
  return field.value === null || Array.isArray(field.value)
    ? ""
    : String(field.value);
}

function suggestionLabel(field: FieldApi, value: FieldApi["value"]): string {
  if (field.def.type === "boolean" && typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (field.def.type === "select" && typeof value === "string") {
    return (
      field.def.options?.find((option) => option.value === value)?.label ??
      value
    );
  }
  if (field.def.type === "multiselect" && Array.isArray(value)) {
    return value
      .map(
        (item) =>
          field.def.options?.find((option) => option.value === item)?.label ??
          item,
      )
      .join(", ");
  }
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function leftGroup(event: FocusEvent<HTMLElement>): boolean {
  return !(
    event.relatedTarget instanceof Node &&
    event.currentTarget.contains(event.relatedTarget)
  );
}

function FieldControl({
  field,
  labelId,
}: {
  field: FieldApi;
  labelId: string;
}) {
  const invalid =
    !field.draft && field.issues.some((issue) => issue.severity === "error");

  switch (field.def.type) {
    case "textarea":
      return (
        <textarea
          {...field.inputProps}
          aria-invalid={invalid || undefined}
          className="anf-control anf-textarea"
          rows={5}
        />
      );
    case "boolean":
      return (
        <fieldset
          aria-describedby={field.inputProps["aria-describedby"]}
          aria-labelledby={labelId}
          className="anf-segmented"
          onBlur={(event) => {
            if (leftGroup(event)) field.inputProps.onBlur();
          }}
          onFocus={field.inputProps.onFocus}
        >
          {[true, false].map((value, index) => (
            <button
              aria-pressed={field.value === value}
              className="anf-segment"
              data-provenance={field.state.provenance?.kind}
              data-status={field.status}
              key={String(value)}
              onClick={() => field.setValue(value)}
              ref={index === 0 ? field.inputProps.ref : undefined}
              type="button"
            >
              {value ? "Yes" : "No"}
            </button>
          ))}
        </fieldset>
      );
    case "select":
      return (
        <select
          {...field.inputProps}
          aria-invalid={invalid || undefined}
          className="anf-control anf-select"
        >
          <option value="">Select…</option>
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
        <fieldset
          aria-describedby={field.inputProps["aria-describedby"]}
          className="anf-checkbox-grid"
          onBlur={(event) => {
            if (leftGroup(event)) field.inputProps.onBlur();
          }}
          onFocus={field.inputProps.onFocus}
        >
          <legend className="anf-sr-only">{field.def.label}</legend>
          {field.def.options?.map((option, index) => {
            const checked = selected.includes(option.value);
            return (
              <label className="anf-checkbox-option" key={option.value}>
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
                  ref={index === 0 ? field.inputProps.ref : undefined}
                  type="checkbox"
                  value={option.value}
                />
                <span>{option.label}</span>
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
          aria-invalid={invalid || undefined}
          className="anf-control anf-input"
          inputMode={field.def.type === "number" ? "decimal" : undefined}
          type={
            field.def.type === "phone"
              ? "tel"
              : field.def.type === "email"
                ? "email"
                : "text"
          }
          value={scalarValue(field)}
        />
      );
  }
}

export interface KitFieldProps {
  id?: string;
  fieldId?: string;
  className?: string;
}

export function KitField({ id, fieldId, className }: KitFieldProps) {
  const resolvedId = id ?? fieldId;
  if (!resolvedId) throw new Error("KitField requires an id or fieldId");

  return (
    <Field className={classes("anf-field", className)} id={resolvedId}>
      {(field) => {
        const grouped = ["boolean", "multiselect"].includes(field.def.type);
        const labelId = `${field.def.id}-label`;
        return (
          <>
            <div className="anf-field-heading">
              {grouped ? (
                <span className="anf-label" id={labelId}>
                  {field.def.label}
                  {field.def.required ? (
                    <span aria-hidden="true" className="anf-required">
                      *
                    </span>
                  ) : null}
                </span>
              ) : (
                <label
                  className="anf-label"
                  htmlFor={field.def.id}
                  id={labelId}
                >
                  {field.def.label}
                  {field.def.required ? (
                    <span aria-hidden="true" className="anf-required">
                      *
                    </span>
                  ) : null}
                </label>
              )}
              <div className="anf-field-actions">
                <ProvenanceChip className="anf-chip" fieldId={field.def.id} />
                {field.status === "ai-pending" ? (
                  <button
                    className="anf-accept"
                    onClick={field.accept}
                    type="button"
                  >
                    Accept
                  </button>
                ) : null}
              </div>
            </div>
            {field.def.description ? (
              <p className="anf-description" id={`${field.def.id}-description`}>
                {field.def.description}
              </p>
            ) : null}
            <FieldControl field={field} labelId={labelId} />
            <Ghost
              className="anf-ghost"
              fieldId={field.def.id}
              renderValue={(value) => suggestionLabel(field, value)}
            />
            <AskBack className="anf-askback" fieldId={field.def.id} />
            <Normalization
              className="anf-normalization"
              fieldId={field.def.id}
            />
            <Issues className="anf-issues" fieldId={field.def.id} />
            <Flags
              className="anf-flags anf-field-flags"
              fieldId={field.def.id}
            />
            <HumanOnlyNote className="anf-human-note" fieldId={field.def.id} />
          </>
        );
      }}
    </Field>
  );
}

function gateAnswer(
  api: ReturnType<typeof useAIFormApi>,
  sectionId: string,
): string | null {
  const reason = api.sections.find(
    (section) => section.def.id === sectionId,
  )?.hiddenReason;
  if (!reason) return null;
  if (typeof reason.gateValue === "boolean") {
    return reason.gateValue ? "Yes" : "No";
  }
  const gate = api.field(reason.gateFieldId);
  if (gate.def.type === "select" && typeof reason.gateValue === "string") {
    return (
      gate.def.options?.find((option) => option.value === reason.gateValue)
        ?.label ?? reason.gateValue
    );
  }
  return Array.isArray(reason.gateValue)
    ? reason.gateValue.join(", ")
    : String(reason.gateValue);
}

export interface KitSectionProps {
  sectionId: string;
  className?: string;
  children?: ReactNode;
}

export function KitSection({
  sectionId,
  className,
  children,
}: KitSectionProps) {
  const api = useAIFormApi();
  const section = api.sections.find((item) => item.def.id === sectionId);
  if (!section) throw new Error(`Unknown section id "${sectionId}"`);
  const answer = gateAnswer(api, sectionId);

  return (
    <HiddenSection
      className={classes("anf-section", className)}
      sectionId={sectionId}
    >
      {section.reopened && section.hiddenReason ? (
        <p className="anf-reopened-note">
          Hidden from submission because you answered {answer} to{" "}
          {section.hiddenReason.gateLabel}
        </p>
      ) : null}
      <div
        className="anf-section-body"
        data-reopened={section.reopened || undefined}
      >
        {children ?? (
          <>
            <header className="anf-section-heading">
              <h2>{section.def.title}</h2>
              {section.def.description ? (
                <p>{section.def.description}</p>
              ) : null}
            </header>
            {section.fields.map((field) => (
              <KitField id={field.def.id} key={field.def.id} />
            ))}
          </>
        )}
      </div>
    </HiddenSection>
  );
}

export interface KitDropZoneProps
  extends Omit<DropZoneProps, "className" | "onText"> {
  className?: string;
  onText?: DropZoneProps["onText"];
}

export function KitDropZone({
  className,
  onText,
  onFile,
  onUnsupported,
  pending,
  children,
}: KitDropZoneProps) {
  const api = useAIFormApi();
  const [unsupportedError, setUnsupportedError] = useState<string | null>(null);

  return (
    <DropZone
      className={classes("anf-drop-zone", className)}
      onFile={onFile ?? api.sources.addFile}
      onText={
        onText ??
        ((text, name) => {
          setUnsupportedError(null);
          api.sources.addText(text, name);
        })
      }
      onUnsupported={
        onUnsupported ??
        ((file) =>
          setUnsupportedError(
            `${file.name} is not supported. Add a .txt, .md, or .pdf file.`,
          ))
      }
      pending={pending ?? api.sources.pending}
    >
      {children ?? <p>Paste source text, or add a .txt, .md, or .pdf file.</p>}
      {unsupportedError ? (
        <p aria-live="polite" className="anf-inline-error">
          {unsupportedError}
        </p>
      ) : null}
    </DropZone>
  );
}

export interface KitSourcePaneProps {
  sourceId?: string;
  className?: string;
  children?: ReactNode;
  emptyMessage?: string;
}

export function KitSourcePane({
  sourceId,
  className,
  children,
  emptyMessage = "Source text and highlighted evidence will appear here.",
}: KitSourcePaneProps) {
  const api = useAIFormApi();
  const visibleFields = Object.values(api.fields).filter(
    (field) => field.visible,
  );
  const completed = visibleFields.filter(
    (field) => field.value !== null,
  ).length;
  const pendingReview = visibleFields.filter(
    (field) => field.status === "ai-pending" || field.status === "ghost",
  ).length;

  return (
    <section className={classes("anf-sources", className)}>
      <header className="anf-sources-heading">
        <h2>Sources</h2>
        <span>{api.sources.list.length} added</span>
      </header>
      {children === undefined ? <KitDropZone /> : children}
      <div aria-live="polite" className="anf-fill-status" role="status">
        <span>Fill: {api.fill.status}</span>
        <span>
          Check: {api.check.status}
          {api.check.error ? " · Check could not run" : null}
        </span>
        <span>
          {completed}/{visibleFields.length} filled
        </span>
        <span>{pendingReview} to review</span>
        {api.fill.status === "streaming" ? (
          <button onClick={api.fill.cancel} type="button">
            Cancel
          </button>
        ) : null}
        {api.fill.error &&
        api.fill.error !== "Cancelled" &&
        api.fill.retryable ? (
          <button onClick={() => void api.fill.retry()} type="button">
            Retry
          </button>
        ) : null}
      </div>
      {api.fill.error ? (
        <p className="anf-inline-error">
          {api.fill.error === "Cancelled"
            ? "Fill cancelled; proposals received so far were kept."
            : api.fill.error}{" "}
          {api.fill.error === "Cancelled" && api.sources.list.length > 0 ? (
            <button onClick={() => void api.fill.run()} type="button">
              Fill again
            </button>
          ) : null}
        </p>
      ) : null}
      {api.sources.error ? (
        <p className="anf-inline-error">{api.sources.error}</p>
      ) : null}
      {api.sources.list.length === 0 ? (
        <p className="anf-source-empty">{emptyMessage}</p>
      ) : (
        <SourcePane className="anf-source-list" sourceId={sourceId} />
      )}
    </section>
  );
}

export interface KitReviewBarProps extends Omit<ReviewBarProps, "className"> {
  className?: string;
}

export function KitReviewBar({ className }: KitReviewBarProps) {
  return <ReviewBar className={classes("anf-review-bar", className)} />;
}

export interface KitSubmitSummaryProps
  extends Omit<SubmitSummaryProps, "className"> {
  className?: string;
}

export function KitSubmitSummary({
  className,
  ...props
}: KitSubmitSummaryProps) {
  return (
    <SubmitSummary
      {...props}
      className={classes("anf-submit-summary", className)}
    />
  );
}

export interface KitFormProps {
  className?: string;
  children?: ReactNode;
  confirmClear?: SubmitSummaryProps["confirmClear"];
  keyboardReview?: boolean;
  onSubmit?: SubmitSummaryProps["onSubmit"];
}

export function KitForm({
  className,
  children,
  confirmClear,
  keyboardReview = true,
  onSubmit,
}: KitFormProps) {
  const api = useAIFormApi();
  useReviewKeyboard(api, { enabled: keyboardReview });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void (onSubmit ? onSubmit() : api.submit.request());
  };

  return (
    <div className={classes("anf-form", className)}>
      <KitReviewBar />
      <Flags className="anf-flags anf-form-flags" />
      {api.state.definition.description ? (
        <p className="anf-form-description">
          {api.state.definition.description}
        </p>
      ) : null}
      <form onSubmit={submit}>
        {api.sections.map((section) => (
          <KitSection key={section.def.id} sectionId={section.def.id} />
        ))}
        <KitSubmitSummary confirmClear={confirmClear} onSubmit={onSubmit} />
        {children}
      </form>
    </div>
  );
}

export interface AIFormShellProps {
  children: ReactNode;
  sourcePane?: ReactNode;
  className?: string;
}

export function AIFormShell({
  children,
  sourcePane,
  className,
}: AIFormShellProps) {
  const api = useAIFormApi();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const sourcePaneId = useId();

  return (
    <div className={classes("anf-shell", className)}>
      <aside className="anf-shell-source" data-open={sourcesOpen || undefined}>
        <div className="anf-source-sheet-bar">
          <span aria-hidden="true" className="anf-source-sheet-handle" />
          <button
            aria-controls={sourcePaneId}
            aria-expanded={sourcesOpen}
            onClick={() => setSourcesOpen((open) => !open)}
            type="button"
          >
            Sources ({api.sources.list.length})
          </button>
        </div>
        <div className="anf-source-sheet-content" id={sourcePaneId}>
          {sourcePane ?? <KitSourcePane />}
        </div>
      </aside>
      <main className="anf-shell-main">{children}</main>
    </div>
  );
}
