import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default [
  // 1. Ignore build output
  {
    ignores: ["main.js", "dist/**", "build/**"],
  },

  // 2. TypeScript parser and plugin
  ...tseslint.configs.recommended,

  // 3. Obsidian plugin rules with parser configuration
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname || process.cwd(),
      },
    },
    plugins: {
      obsidianmd: obsidianmd,
    },
    rules: {
        "obsidianmd/ui/sentence-case": [
          "warn",
          {
            brands: ["Iconocolor"],
            acronyms: ["HSL", "URL", "SVG"],
            enforceCamelCaseLower: true,
            // Allow dropdown option labels to start with capital letters
            ignorePatterns: [
              "^None \\(.*\\)$", // "None (same as base)", "None (no inheritance)"
              "^[A-Z].*adjustment$", // "Lightness adjustment", "HSL transformation"
            ],
          },
        ],
       ...obsidianmd.configs.recommended,
    },
  },
];
