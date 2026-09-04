import type { FieldValue } from "@sourced/core";
import type { ReactNode } from "react";

import { useAIFormApi } from "../context";

export interface HiddenSectionProps {
  sectionId: string;
  className?: string;
  children: ReactNode;
}

function displayGateValue(
  value: FieldValue,
  options: Array<{ value: string; label: string }> | undefined,
): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && options) {
    return options.find((option) => option.value === value)?.label ?? value;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

export function HiddenSection({
  sectionId,
  className,
  children,
}: HiddenSectionProps) {
  const api = useAIFormApi();
  const section = api.sections.find(
    (candidate) => candidate.def.id === sectionId,
  );
  if (!section) {
    throw new Error(`Unknown section id "${sectionId}"`);
  }

  if (section.visible || section.reopened) {
    return (
      <section className={className} data-hidden="false" data-section>
        {children}
      </section>
    );
  }

  const reason = section.hiddenReason;
  if (!reason) return null;
  const gate = api.field(reason.gateFieldId);
  const sentence = `Hidden because you answered ${displayGateValue(
    reason.gateValue,
    gate.def.type === "select" ? gate.def.options : undefined,
  )} to ${reason.gateLabel}`;

  return (
    <section className={className} data-hidden="true" data-section>
      <p>{sentence}</p>
      <button onClick={section.reopen} type="button">
        Show anyway
      </button>
    </section>
  );
}
