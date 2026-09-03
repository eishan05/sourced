import { describe, expect, it } from "vitest";

import { CORE_VERSION, SERVER_VERSION } from "./index";

describe("server", () => {
  it("exports its version and links core", () => {
    expect(SERVER_VERSION).toBe("0.0.0");
    expect(CORE_VERSION).toBe("0.0.0");
  });
});
