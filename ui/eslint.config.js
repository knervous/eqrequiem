import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // Enforce consistent indentation (2 spaces in this example)
      indent: ["error", 2, { SwitchCase: 1 }],
      // Enforce consistent brace style for blocks
      "brace-style": ["error", "1tbs", { allowSingleLine: true }],
      // Require spacing inside curly braces for objects, destructuring, and imports
      "object-curly-spacing": ["error", "always"],
      // Enforce consistent spacing around colons in object literals
      "key-spacing": [
        "error",
        { beforeColon: false, afterColon: true, mode: "strict" },
      ],
      // Enforce spacing inside parentheses
      "space-in-parens": ["error", "never"],
      // Enforce spacing inside array brackets
      "array-bracket-spacing": ["error", "never"],
      // Enforce consistent trailing commas in multiline object and array literals
      "comma-dangle": ["error", "always-multiline"],
      // Enforce semicolons at the end of statements
      semi: ["error", "always"],
      // Always require parens around arrow function arguments
      "arrow-parens": ["error", "always"],
    },
  }
);
