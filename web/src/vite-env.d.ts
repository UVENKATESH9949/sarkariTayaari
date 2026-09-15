/// <reference types="vite/client" />

/**
 * Supplied by Vite's `define` (see vite.config.ts), because `@sarkaritaiyaari/core` is shared
 * with the React Native app where Metro injects it. Shared code only ever reads it behind a
 * `typeof` guard; defining it here means the development branches actually run in `npm run
 * dev` instead of silently taking the production path.
 */
declare const __DEV__: boolean;

interface ImportMetaEnv {
  /** Backend origin including the `/api` suffix. See .env.example. */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
