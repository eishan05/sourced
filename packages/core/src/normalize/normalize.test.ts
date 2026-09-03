import { afterEach, describe, expect, it, vi } from "vitest";

import type { SerializedFieldDefinition } from "../definition";
import { normalizeBoolean } from "./boolean";
import { normalizeDate } from "./date";
import { normalizeNumber } from "./number";
import { normalizePhone } from "./phone";
import { suspiciousIssues } from "./suspicious";
import { normalizeValue } from "./value";

const TODAY = "2026-09-03";

function field(
  type: SerializedFieldDefinition["type"],
  overrides: Partial<SerializedFieldDefinition> = {},
): SerializedFieldDefinition {
  return { id: type, type, label: type, ...overrides };
}

describe("normalizeDate", () => {
  it("passes through an ISO date without an explanation", () => {
    expect(normalizeDate("2024-02-29", { today: TODAY })).toEqual({
      value: "2024-02-29",
    });
  });

  it.each([
    ["March 2021", "2021-03-01"],
    ["Mar 2021", "2021-03-01"],
    ["2021-03", "2021-03-01"],
    ["last March", "2026-03-01"],
    ["Present", TODAY],
  ])("reads %j as %s with an explanation", (raw, value) => {
    expect(normalizeDate(raw, { today: TODAY })).toEqual({
      value,
      explanation: `Read '${raw}' as ${value}`,
    });
  });

  it("returns null for invalid and unparseable inputs", () => {
    expect(normalizeDate("2024-02-30", { today: TODAY })).toBeNull();
    expect(normalizeDate("not a date", { today: TODAY })).toBeNull();
  });
});

describe("normalizeNumber", () => {
  it.each([
    ["8 years", 8],
    ["$1,234.50", 1234.5],
    ["-42", -42],
  ])("reads %j as %s", (raw, value) => {
    expect(normalizeNumber(raw)?.value).toBe(value);
  });

  it("returns null without a number", () => {
    expect(normalizeNumber("many years")).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("formats a US 10-digit number", () => {
    expect(normalizePhone("555-010-1234", { defaultCountry: "US" })).toBe(
      "+1 (555) 010-1234",
    );
    expect(normalizePhone("+15550101234", { defaultCountry: "US" })).toBe(
      "+1 (555) 010-1234",
    );
  });

  it("returns other lengths as digits while preserving an initial plus", () => {
    expect(normalizePhone("+49 30 555-0127")).toBe("+49305550127");
    expect(normalizePhone("020 7946 0958")).toBe("02079460958");
  });

  it("rejects fewer than seven digits", () => {
    expect(normalizePhone("555-12")).toBeNull();
  });
});

describe("normalizeBoolean", () => {
  it.each([
    ["YES", true],
    ["n", false],
    [" false ", false],
  ])("reads %j as %s", (raw, value) => {
    expect(normalizeBoolean(raw)).toBe(value);
  });

  it("rejects unknown words", () => {
    expect(normalizeBoolean("maybe")).toBeNull();
  });
});

describe("normalizeValue", () => {
  const options = [
    { value: "node-js", label: "Node.js" },
    { value: "typescript", label: "TypeScript" },
  ];

  it("dispatches scalar types and trims text-like fields", () => {
    expect(
      normalizeValue(field("text"), "  hello  ", { today: TODAY }),
    ).toEqual({ value: "hello" });
    expect(
      normalizeValue(field("number"), "8 years", { today: TODAY })?.value,
    ).toBe(8);
    expect(normalizeValue(field("boolean"), "yes", { today: TODAY })).toEqual({
      value: true,
    });
  });

  it("matches select values before labels, case-insensitively", () => {
    const select = field("select", { options });
    expect(normalizeValue(select, "NODE-JS", { today: TODAY })).toEqual({
      value: "node-js",
    });
    expect(normalizeValue(select, "typescript", { today: TODAY })).toEqual({
      value: "typescript",
    });
    expect(normalizeValue(select, "unknown", { today: TODAY })).toBeNull();
  });

  it("splits and matches multiselect values", () => {
    const multiselect = field("multiselect", { options });
    expect(
      normalizeValue(multiselect, "Node.js; TYPESCRIPT\nnode-js", {
        today: TODAY,
      }),
    ).toEqual({ value: ["node-js", "typescript", "node-js"] });
    expect(
      normalizeValue(multiselect, "Node.js, Rust", { today: TODAY }),
    ).toBeNull();
  });
});

describe("suspiciousIssues", () => {
  afterEach(() => vi.useRealTimers());

  it("warns when a digit value is one character off a fixed pattern", () => {
    const definition = field("text", {
      constraints: { pattern: "^\\d{9}$" },
    });
    expect(suspiciousIssues(definition, "12345678")).toEqual([
      {
        code: "suspicious_length",
        message: "Looks one digit short",
        severity: "warning",
      },
    ]);
    expect(suspiciousIssues(definition, "1234567890")[0]?.message).toBe(
      "Looks one digit long",
    );
    expect(suspiciousIssues(definition, "123456789")).toEqual([]);
  });

  it("warns about an email domain without a dot", () => {
    expect(suspiciousIssues(field("email"), "person@example")).toHaveLength(1);
    expect(suspiciousIssues(field("email"), "person@example.com")).toEqual([]);
  });

  it("warns only for dates outside the age window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 3, 12));
    expect(suspiciousIssues(field("date"), "1920-01-01")).toHaveLength(1);
    expect(suspiciousIssues(field("date"), "2040-01-01")).toHaveLength(1);
    expect(suspiciousIssues(field("date"), "2020-01-01")).toEqual([]);
  });
});
