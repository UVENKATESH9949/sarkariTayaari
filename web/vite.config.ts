import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // @sarkaritaiyaari/core is shared with the React Native app, where Metro injects __DEV__.
    // A browser has no such global, so shared code guards every use with `typeof __DEV__`.
    // Defining it here means the guarded branches behave identically on both platforms
    // instead of silently taking the production path in development.
    __DEV__: JSON.stringify(mode !== "production"),
  },
  server: {
    // The backend pins CORS to exact origins, and 127.0.0.1 is a different origin from
    // localhost — so the dev server must be reached at the host that is actually allowlisted.
    port: 5174,
    strictPort: true,
  },
}));
