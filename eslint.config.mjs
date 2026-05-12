import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

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
          ],
        },
      ],
    },
  },
]);
