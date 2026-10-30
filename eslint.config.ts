import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";
import stylistic from "@stylistic/eslint-plugin";

export default defineConfig([
  { ignores: ["node_modules/**", "dist/**", ".venv/**", ".vercel/**", "android/**", "ios/**", "supabase/.temp/**"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  tseslint.configs.recommended,
  { files: ["**/*.{jsx,tsx}"], extends: [pluginReact.configs.flat.recommended, pluginReact.configs.flat["jsx-runtime"]], settings: { react: { version: "detect" } } },
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/indent": ["error", 2, { SwitchCase: 1 }],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/quotes": ["error", "double", { avoidEscape: true }],
      "@stylistic/comma-spacing": "error",
      "@stylistic/key-spacing": "error",
      "@stylistic/keyword-spacing": "error",
      "@stylistic/space-infix-ops": "error",
      "@stylistic/arrow-spacing": "error",
      "@stylistic/object-curly-spacing": ["error", "always"],
      "@stylistic/no-trailing-spaces": "error",
      "@stylistic/eol-last": ["error", "always"],
    },
  },
]);
