import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { importGroups } from './tools/eslint/import-groups.mjs';

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
  {
    // The application's own source; tests and scripts read their imports as a list.
    files: ['src/**/*.{ts,tsx}', 'electron/**/*.ts'],
    plugins: { copacetic: { rules: { 'import-groups': importGroups } } },
    rules: { 'copacetic/import-groups': 'error' },
  },
  {
    // The engine layer is the one place the main process meets Electron, so moving engine is a port of that folder.
    files: ['electron/main/**/*.ts', 'electron/shared/**/*.ts'],
    ignores: ['electron/main/engine/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['electron', 'electron-updater'].map((name) => ({
            name,
            message: 'Reach Electron through electron/main/engine, which is the whole of what a port replaces.',
          })),
          patterns: [
            { group: ['**/engine/native'], message: 'Only the engine hands Electron its own objects back.' },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSQualifiedName[left.name='Electron']",
          message: 'Use the engine type from electron/main/engine rather than the global Electron namespace.',
        },
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='versions'][property.name=/^(electron|chrome)$/]",
          message: 'Read the engine version through engineVersions() in electron/main/engine/system.',
        },
      ],
      'no-restricted-properties': [
        'error',
        ...['resourcesPath', 'getSystemVersion', 'getSystemMemoryInfo'].map((property) => ({
          object: 'process',
          property,
          message: 'Electron adds this to process; reach it through electron/main/engine/system.',
        })),
      ],
    },
  },
]);

export default eslintConfig;
