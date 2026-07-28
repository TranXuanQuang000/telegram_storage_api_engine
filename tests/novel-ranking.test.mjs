import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/novel-ranking.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`;
const { calculateNovelHotScore, compareHotNovels } = await import(moduleUrl);

test("novel hot ranking favors deep, complete catalog records", () => {
  const deep = {
    title: "Deep serial",
    coverUrl: "https://example.test/deep.jpg",
    description: "Complete metadata",
    author: "Author",
    genres: ["Fantasy", "Adventure"],
    chapterCount: 420,
    updatedAt: "2026-07-20T00:00:00Z",
  };
  const shallow = {
    title: "Shallow serial",
    chapterCount: 2,
    updatedAt: "2026-07-28T00:00:00Z",
  };
  assert.ok(calculateNovelHotScore(deep) > calculateNovelHotScore(shallow));
  assert.deepEqual([shallow, deep].sort(compareHotNovels), [deep, shallow]);
});

test("novel hot ranking has deterministic title fallback", () => {
  const novels = [{ title: "B" }, { title: "A" }];
  novels.sort(compareHotNovels);
  assert.deepEqual(novels.map((novel) => novel.title), ["A", "B"]);
});
