import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";

export default defineConfig([
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parser: await import("typescript-eslint").then(m => m.parser),
      parserOptions: { project: true, tsconfigRootDir: process.cwd() }
    },
    plugins: { js },
    rules: {
      ...js.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
]);
