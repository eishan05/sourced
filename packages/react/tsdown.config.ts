import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    kit: "src/kit/index.ts",
    pdf: "src/pdf/index.ts",
    worker: "src/pdf/worker.ts",
  },
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
});
