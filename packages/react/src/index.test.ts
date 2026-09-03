import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";

import { CORE_VERSION, REACT_VERSION } from "./index";

describe("react", () => {
  it("renders its version and links core", () => {
    render(createElement("p", null, `React package ${REACT_VERSION}`));

    expect(screen.getByText("React package 0.0.0")).toBeInTheDocument();
    expect(CORE_VERSION).toBe("0.0.0");
  });
});
