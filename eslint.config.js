// eslint.config.js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.commonjs,
        ...globals.es2021,
        ...globals.jest,
        ...globals.node,
      },
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        project: "./client/tsconfig.json",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      import: importPlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Inherit recommended rules
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // TypeScript-specific rules
      "@typescript-eslint/adjacent-overload-signatures": ["error"],
      // "@typescript-eslint/decorator-position": ["error", {
      //   decoratorsBeforeExport: true,
      //   minLineBetweenDecorators: 0,
      // }],
      // "@typescript-eslint/lines-between-class-members": ["error", "always", {
      //   exceptAfterOverload: false,
      //   exceptAfterSingleLine: true,
      // }],

      // Rules from main config
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      indent: ["error", 2, { SwitchCase: 1 }],
      "brace-style": ["error", "1tbs", { allowSingleLine: true }],
      "object-curly-spacing": ["error", "always"],
      "key-spacing": [
        "error",
        {
          beforeColon: false,
          afterColon: true,
          mode: "strict",
          align: "colon",
        },
      ],
      "space-in-parens": ["error", "never"],
      "array-bracket-spacing": ["error", "never"],
      "comma-dangle": ["error", "always-multiline"],
      semi: ["error", "always"],
      "arrow-parens": ["error", "always"],

      // Rules from base-config.js
      curly: "error",
      "no-debugger": "error",
      "no-useless-return": "error",
      "block-scoped-var": "error",
      "default-case": "error",
      "no-else-return": "error",
      "no-eq-null": "error",
      "no-floating-decimal": "error",
      "no-loop-func": "error",
      "prefer-template": "error",
      "spaced-comment": "error",
      "space-before-blocks": ["error", "always"],
      "keyword-spacing": ["error", { after: true }],
      "max-len": [
        "error",
        {
          code: 120,
          ignoreComments: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      "space-infix-ops": "error",
      "template-curly-spacing": ["error", "never"],
      "arrow-spacing": ["error", { before: true, after: true }],
      "semi-spacing": ["error", { before: false, after: true }],
      "comma-spacing": ["error", { before: false, after: true }],
      "prefer-arrow-callback": [
        "error",
        { allowNamedFunctions: true, allowUnboundThis: true },
      ],
      quotes: ["error", "single"],
      "no-var": "error",
      // "no-console": ["warn", { allow: ["error", "warn"] }],
      "no-alert": "error",
      "no-extra-semi": "error",
      "no-multi-spaces": ["error"],
      "no-unmodified-loop-condition": "error",
      "no-useless-concat": "error",
      "prefer-spread": "error",
      complexity: ["error", 100],
      "object-shorthand": ["error", "always"],
      "eol-last": "error",
      "prefer-const": "error",
      "no-unused-vars": "off",

      // Import plugin rules
      "import/no-import-module-exports": "error",
      "import/no-self-import": "error",
      "import/no-useless-path-segments": "error",
      "import/no-mutable-exports": "error",
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            ["object", "unknown"],
          ],
          pathGroups: [
            { pattern: "react", group: "builtin", position: "after" },
            {
              pattern: "**/*.+(css|sass|less|scss|pcss|styl)",
              patternOptions: { dot: true, nocomment: true },
              group: "unknown",
              position: "after",
            },
            {
              pattern: "../**/*.+(css|sass|less|scss|pcss|styl)",
              patternOptions: { dot: true, nocomment: true },
              group: "unknown",
              position: "after",
            },
            {
              pattern: "./**/*.+(css|sass|less|scss|pcss|styl)",
              patternOptions: { dot: true, nocomment: true },
              group: "unknown",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["react"],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
          warnOnUnassignedImports: true,
        },
      ],
      "import/newline-after-import": "error",
      "import/no-named-default": "error",
      "import/no-anonymous-default-export": "error",
    },
  },
);
