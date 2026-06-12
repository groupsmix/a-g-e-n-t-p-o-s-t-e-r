// @ts-check
import tseslint from 'typescript-eslint'
import js from '@eslint/js'

/**
 * Root ESLint flat config — covers all packages and apps in the monorepo.
 *
 * Rules philosophy:
 *  • Strict TypeScript but pragmatic — `any` is warned not errored so legacy
 *    code survives until it is properly typed.
 *  • Unused variables are errors to keep imports honest.
 *  • No-explicit-any is a warning so handlers / adapters can still use it
 *    as an escape hatch where needed, but it surfaces in CI output.
 */
export default tseslint.config(
  // ── Base JS recommended ───────────────────────────────────────────────
  js.configs.recommended,

  // ── TypeScript strict (applied to all .ts/.tsx files) ─────────────────
  ...tseslint.configs.recommended,

  // ── Global ignores ────────────────────────────────────────────────────
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/legacy/**',
      '**/.turbo/**',
      '**/migrations/**',
      '**/*.js',          // compiled output — only lint source
      '**/*.mjs',
      '**/*.cjs',
    ],
  },

  // ── Monorepo-wide rule overrides ──────────────────────────────────────
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Warn on `any` — not error — so adapters can still use it deliberately
      '@typescript-eslint/no-explicit-any': 'warn',
      // Unused locals are always a bug
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // Prefer type-only imports to keep runtime bundles small
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // console.log is fine in scripts/workers, but warn to avoid noise
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    },
  },

  // ── Test files — relax some rules ─────────────────────────────────────
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
    },
  },

  // ── Scripts — Node.js context ──────────────────────────────────────────
  {
    files: ['scripts/**/*.ts', 'scripts/**/*.mts'],
    rules: {
      'no-console': 'off',
    },
  },
)
