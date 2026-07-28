import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/hot-ranking.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { calculateHotScore, compareHotStories } = await import(moduleUrl);

const now = Date.parse("2026-07-28T00:00:00Z");

test("hot ranking favors strong popularity over a tiny perfect score", () => {
  const popular = {
    title: "Popular",
    score: 4.4,
    ratingVotes: 80_000,
    positiveRatio: 0.9,
    updatedAt: "2026-07-27T00:00:00Z",
  };
  const obscure = {
    title: "Obscure",
    score: 5,
    ratingVotes: 8,
    positiveRatio: 1,
    updatedAt: "2026-07-27T00:00:00Z",
  };

  assert.ok(calculateHotScore(popular, now) > calculateHotScore(obscure, now));
  assert.deepEqual([obscure, popular].sort((a, b) => compareHotStories(a, b, now)), [popular, obscure]);
});

test("hot ranking uses freshness as a tie breaker without inventing ratings", () => {
  const fresh = { title: "Fresh", score: null, ratingVotes: null, updatedAt: "2026-07-27T00:00:00Z" };
  const stale = { title: "Stale", score: null, ratingVotes: null, updatedAt: "2024-01-01T00:00:00Z" };

  assert.ok(calculateHotScore(fresh, now) > calculateHotScore(stale, now));
});

test("hot ranking remains deterministic when all signals are missing", () => {
  const stories = [{ title: "B" }, { title: "A" }];
  stories.sort((a, b) => compareHotStories(a, b, now));
  assert.deepEqual(stories.map((story) => story.title), ["A", "B"]);
});
