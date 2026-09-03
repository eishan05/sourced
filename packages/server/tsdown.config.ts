import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/next.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
});
