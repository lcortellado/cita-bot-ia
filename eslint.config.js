import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    // Root *.js is tooling config only (eslint.config.js); application code is TypeScript in src/.
    ignores: ['node_modules/', 'dist/', 'coverage/', '*.js'],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'] },
        { selector: 'import', format: null },
        // `_name` marks a parameter that is intentionally unused.
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE'] },
        {
          selector: 'variable',
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'can', 'should'],
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        // External payloads (WhatsApp, OpenRouter, Cal.com) use snake_case and dashed keys.
        { selector: ['objectLiteralProperty', 'typeProperty'], format: null },
      ],
    },
  },
  prettierConfig,
);
