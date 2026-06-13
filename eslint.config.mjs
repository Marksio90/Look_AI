import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parser: tseslint.parser,
      parserOptions: { project: true, tsconfigRootDir: process.cwd() }
    },
    plugins: { js, "@typescript-eslint": tseslint.plugin },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  }
]);
