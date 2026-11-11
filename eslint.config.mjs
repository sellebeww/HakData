// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
// Cakupan: apps/api dan packages/*. apps/web memakai `next lint` (konfigurasi sendiri).
import js from "@eslint/js";
import globals from "globals";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/.next/**", "**/node_modules/**", "apps/web/**", "apps/api/prisma/migrations/**", "**/storage/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // shortcut: kode MVP memakai `any` di batas Apollo/amqplib; ketatkan saat Fase GraphQL.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  { files: ["**/*.js", "**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  prettier,
);
