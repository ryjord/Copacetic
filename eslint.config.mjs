import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'release/**', 'build/**', 'node_modules/**', 'next-env.d.ts']),
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // A guard clause on the same line as its condition reads as part of it,
      // and adding a second statement later silently leaves it outside the if.
      curly: ['error', 'all'],
      'nonblock-statement-body-position': ['error', 'below'],
      // `any` defeats every other check in this file.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]);

export default eslintConfig;
