/**
 * Asserts that nothing in this package reaches for a platform the other platform lacks.
 *
 * The type system cannot do this job alone. The shared API client needs the standard
 * `fetch`/`Response` types, which only arrive with TypeScript's DOM lib — and that same lib
 * unavoidably brings `window`, `document` and `localStorage` into scope. So the compiler
 * enforces "no Node globals" (by declaring no `types`) and this test enforces the rest.
 *
 * It matters because both failure directions are silent until runtime: a `document` reference
 * compiles cleanly and then crashes the Android app, and a `process.env` reference compiles
 * cleanly and then crashes the browser. TASK-2601 Phase 0 already found one real instance of
 * exactly this class of bug — a bare `__DEV__`, which exists on React Native and not in a
 * browser.
 *
 * Comments and string literals are stripped before scanning, so prose like "the browser's
 * window" in a doc comment does not trip it. Test files are excluded: they legitimately read
 * fixture files off disk, exactly as the Java suite does.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcRoot = dirname(fileURLToPath(import.meta.url));

/**
 * Identifiers that exist on one platform and not the other.
 *
 * Globals are matched as *usage* — `window.` / `typeof window` — rather than as bare words,
 * because a bare word also matches an ordinary object key. The translation catalogue really
 * does have a key called `navigator` (the mock test's Question Navigator), and flagging it
 * would train people to ignore this test, which is worse than not having it.
 */
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /(?:\btypeof\s+)?\bwindow\s*[.[]/, why: "browser-only (React Native has no window)" },
  { pattern: /(?:\btypeof\s+)?\bdocument\s*[.[]/, why: "browser-only" },
  { pattern: /\blocalStorage\s*[.[]/, why: "browser-only — each app owns its own persistence" },
  { pattern: /\bsessionStorage\s*[.[]/, why: "browser-only" },
  { pattern: /\bnavigator\s*[.[]/, why: "browser-only, and unreliable even there" },
  { pattern: /\bprocess\s*[.[]/, why: "Node-only (and Metro/Vite inline it differently)" },
  { pattern: /\brequire\s*\(/, why: "CommonJS — this package is ESM-only" },
  { pattern: /\b__dirname\b|\b__filename\b/, why: "Node-only" },
  { pattern: /\bBuffer\s*[.[]/, why: "Node-only" },
  { pattern: /from\s+["']react-native["']|from\s+["']expo[-/]/, why: "React Native / Expo import" },
  { pattern: /from\s+["']react["']/, why: "React — this package must stay framework-free" },
  { pattern: /from\s+["']node:/, why: "Node built-in" },
];

/**
 * `__DEV__` gets its own rule rather than a regex in the table above. It is legitimate to use
 * — mobile relies on it — but only behind a `typeof` guard, and the guarded form
 * `typeof __DEV__ !== "undefined" && __DEV__` necessarily contains a bare reference too. So
 * the check is per-file: any use at all requires the guard to be present somewhere in it.
 */
function devGlobalViolation(code: string): string | null {
  if (!/\b__DEV__\b/.test(code)) return null;
  if (/\btypeof\s+__DEV__\b/.test(code)) return null;
  return '__DEV__ used without a `typeof __DEV__ !== "undefined"` guard — it does not exist in a browser';
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (extname(entry.name) !== ".ts") return [];
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".d.ts")) return [];
    return [full];
  });
}

/** Removes block comments, line comments and string literals so prose cannot trip the scan. */
function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

describe("platform purity", () => {
  const files = sourceFiles(srcRoot);

  it("finds source files to scan", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const relative = file.slice(srcRoot.length + 1).replace(/\\/g, "/");

    it(`${relative} uses no platform-specific global`, () => {
      const code = stripNonCode(readFileSync(file, "utf8"));
      const violations = [
        ...FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(
          ({ pattern, why }) => `${pattern} — ${why}`,
        ),
        ...(devGlobalViolation(code) ? [devGlobalViolation(code)!] : []),
      ];

      expect(violations, `${relative} must run unchanged on React Native and in a browser`).toEqual([]);
    });
  }
});
