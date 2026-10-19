import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude's local test files and headless Chrome profile (gitignored)
    ".scratch/**",
    // Vendor files scripts/copy-assets.ts copies from node_modules (gitignored)
    "public/pdfjs-wasm/**",
    "public/tesseract/**",
  ]),
]);

export default eslintConfig;
