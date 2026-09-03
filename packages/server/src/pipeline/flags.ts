import type { FillEvent, Flag } from "@ai-native-forms/core";

import type { PipelineContext, ValidatedFlag } from "./types";

export function finalizeFlag(
  item: ValidatedFlag,
  context: PipelineContext,
): FillEvent {
  const flag: Flag = {
    id: context.idGen(),
    fillId: context.fillId,
    fieldIds: item.fieldIds,
    message: item.message,
    severity: item.severity,
  };
  return { type: "flag", flag };
}
