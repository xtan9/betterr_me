import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  // Ignore worktrees and shadcn/ui managed files
  {
    ignores: [".worktrees/**", "components/ui/**"],
  },
  // Global: unused vars are errors, not warnings
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
    },
  },
  // Test files — relax strict rules
  {
    files: ["tests/**", "e2e/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Config files using require()
  {
    files: ["*.js", "*.cjs", "scripts/**/*.js", "tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;
