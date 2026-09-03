import { describe, expect, it, vi } from "vitest";

import { createFormStore } from "./store";
import { testForm } from "./test-form";

describe("createFormStore", () => {
  it("notifies once per state change and never for reducer no-ops", () => {
    const store = createFormStore(testForm);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.dispatch({ type: "ACCEPT", fieldId: "missing" });
    store.dispatch({ type: "REVIEW_END" });
    expect(listener).not.toHaveBeenCalled();

    store.dispatch({
      type: "OVERRIDE",
      fieldId: "fullName",
      value: "Priya Raman",
    });
    expect(listener).toHaveBeenCalledTimes(1);

    const sameState = store.getState();
    store.replace(sameState);
    expect(listener).toHaveBeenCalledTimes(1);

    store.replace({ ...sameState });
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    store.dispatch({ type: "RESET" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
