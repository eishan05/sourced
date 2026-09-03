import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/forms.ts"],
  format: ["esm"],
  fixedExtension: false,
  dts: true,
  clean: true,
});
