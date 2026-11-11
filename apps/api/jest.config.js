// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
const base = { preset: "ts-jest", testEnvironment: "node", rootDir: ".", transform: { "^.+\\.ts$": ["ts-jest", { diagnostics: false }] } };
module.exports = {
  projects: [
    { ...base, displayName: "unit", testMatch: ["<rootDir>/src/**/*.spec.ts"] },
    { ...base, displayName: "int", testMatch: ["<rootDir>/test/**/*.int.ts"], testTimeout: 60000 },
  ],
};
