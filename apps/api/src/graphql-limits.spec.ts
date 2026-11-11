// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
import { buildSchema, parse, validate } from "graphql";
import depthLimit from "graphql-depth-limit";
import { MAX_DEPTH } from "./app.module";

// Skema nyata tidak punya relasi siklik sedalam 9, jadi batas diuji pada skema rekursif kecil.
const schema = buildSchema(`type N { n: N, id: ID } type Query { n: N }`);
const nest = (d: number) => `{ ${"n { ".repeat(d)}id${" }".repeat(d)} }`;
const errs = (q: string) => validate(schema, parse(q), [depthLimit(MAX_DEPTH)]);

describe("batas depth GraphQL", () => {
  it("kedalaman di batas lolos, satu lebih ditolak", () => {
    expect(errs(nest(MAX_DEPTH - 1))).toHaveLength(0);
    expect(errs(nest(MAX_DEPTH + 1))[0].message).toMatch(/exceeds maximum operation depth/);
  });
});
