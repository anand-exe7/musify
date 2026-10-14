import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// `next lint` was removed in Next 16, so ESLint runs directly (`npm run lint`).
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React-compiler-style checks that the app's existing patterns trip on (loading
    // data in an effect, a mounted flag, random positions for decorative bursts).
    // They are surfaced as warnings to clean up over time, not build-blocking errors.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", "node_modules/**"]),
]);
