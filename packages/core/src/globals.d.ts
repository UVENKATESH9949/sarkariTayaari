/**
 * The only non-standard ambient this package is allowed to see.
 *
 * `__DEV__` is injected by Metro on React Native and does NOT exist in a browser. It is typed
 * as possibly-undefined on purpose: every use must be guarded with
 * `typeof __DEV__ !== "undefined" && __DEV__`, never referenced bare, or a web bundle throws a
 * ReferenceError. web/ defines it through Vite's `define` so both platforms behave the same.
 *
 * Everything else comes from `lib` — see the note in tsconfig.json for why DOM is included
 * and how the no-platform-globals rule is actually enforced.
 */
declare const __DEV__: boolean | undefined;
