import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tsParser from "@typescript-eslint/parser";
import tseslint from "typescript-eslint";
import { PlainTextParser } from "eslint-plugin-obsidianmd/dist/lib/plainTextParser.js";

// The obsidianmd recommended config applies a number of JS-/TS-only rules
// globally (validate-manifest and validate-license rely on this so they can
// fire on any file, but a few type-aware rules in the same bundle blow up on
// the JSON / plain-text ASTs). Turn the noisy ones off for non-source files.
const disableNonSourceRules = {
  "no-irregular-whitespace": "off",
  "no-unused-vars": "off",
  "no-undef": "off",
  "no-self-compare": "off",
  "no-eval": "off",
  "no-implied-eval": "off",
  "no-implicit-globals": "off",
  "no-restricted-globals": "off",
  "no-restricted-imports": "off",
  "no-alert": "off",
  "no-console": "off",
  "obsidianmd/no-plugin-as-component": "off",
  "obsidianmd/no-view-references-in-plugin": "off",
  "obsidianmd/no-unsupported-api": "off",
  "obsidianmd/prefer-file-manager-trash-file": "off",
  "obsidianmd/prefer-instanceof": "off",
  "obsidianmd/no-tfile-tfolder-cast": "off",
  "obsidianmd/rule-custom-message": "off",
  "@typescript-eslint/no-deprecated": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "import/no-nodejs-modules": "off",
  "import/no-extraneous-dependencies": "off",
};

export default defineConfig([
  {
    ignores: [
      "main.js",
      "dist/**",
      "build/**",
      "node_modules/**",
      "*.mjs",
      "version-bump.mjs",
      "esbuild.config.mjs",
    ],
  },

  ...obsidianmd.configs.recommended,

  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname || process.cwd(),
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Iconocolor"],
          acronyms: ["HSL", "URL", "SVG"],
          enforceCamelCaseLower: true,
          ignoreRegex: [
            "^None \\(.*\\)$",
            "^[A-Z].*adjustment$",
            "^#[A-Z]+$",
          ],
        },
      ],
    },
  },

  // Lint manifest.json so obsidianmd/validate-manifest fires. The rule expects
  // a JS-style AST (ExpressionStatement + ObjectExpression) which the TS-ESLint
  // parser produces when told to handle .json files via extraFileExtensions.
  {
    files: ["manifest.json"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        extraFileExtensions: [".json"],
      },
    },
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      ...disableNonSourceRules,
      "obsidianmd/validate-manifest": "error",
    },
  },

  // Parse LICENSE as plain text so obsidianmd/validate-license can inspect
  // its lines. The plain-text parser ships with eslint-plugin-obsidianmd but
  // is not wired up by the recommended config out of the box.
  {
    files: ["LICENSE"],
    languageOptions: { parser: PlainTextParser },
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      ...disableNonSourceRules,
      "obsidianmd/validate-license": "error",
    },
  },
]);
