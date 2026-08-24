import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.system_generated', '.husky', 'dev-dist'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'writable',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  // ==============================================================================
  // RULE KIẾN TRÚC BẤT BIẾN (ARCHITECTURAL BOUNDARY INVARIANT):
  // Các module bên trong packages/engines/** là Game Engine logic thuần túy (Pure TS).
  // Tuyệt đối KHÔNG import:
  //   1. "react" hoặc "react-dom" (chống dính coupling vào UI framework)
  //   2. "@/*" hoặc "src/*" (chống import ngược tầng UI / browser API wrapper)
  //   3. "@rating/*" hoặc "packages/rating/*" (2 package engines và rating độc lập tuyệt đối)
  // Engine phải có khả năng chạy độc lập trên mọi môi trường (Client, Server Deno/Edge, WebWorker, Test).
  // ==============================================================================
  {
    files: ['packages/engines/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'VI PHẠM KIẾN TRÚC: packages/engines là TypeScript thuần túy, tuyệt đối KHÔNG import React.',
            },
            {
              name: 'react-dom',
              message:
                'VI PHẠM KIẾN TRÚC: packages/engines là TypeScript thuần túy, tuyệt đối KHÔNG import react-dom.',
            },
          ],
          patterns: [
            {
              group: [
                '@/*',
                'src/*',
                '**/src/*',
                '../src/*',
                '../../src/*',
                '@rating/*',
                'packages/rating/*',
                '**/packages/rating/*',
                '../rating/*',
                '../rating/**',
              ],
              message:
                'VI PHẠM KIẾN TRÚC: Engine trong packages/engines không được phép import từ tầng UI (@/*, src/*) hoặc rating package.',
            },
          ],
        },
      ],
    },
  },
  // ==============================================================================
  // RULE KIẾN TRÚC BẤT BIẾN (ARCHITECTURAL BOUNDARY INVARIANT):
  // Các module bên trong packages/rating/** là Rating logic thuần túy (Pure TS).
  // Tuyệt đối KHÔNG import:
  //   1. "react" hoặc "react-dom" (chống dính coupling vào UI framework)
  //   2. "@/*" hoặc "src/*" (chống import ngược tầng UI / browser API wrapper)
  //   3. "@engines/*" hoặc "packages/engines/*" (2 package engines và rating độc lập tuyệt đối)
  // Rating phải có khả năng chạy độc lập trên mọi môi trường (Client preview, Server Edge Functions, Test).
  // ==============================================================================
  {
    files: ['packages/rating/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react',
              message:
                'VI PHẠM KIẾN TRÚC: packages/rating là TypeScript thuần túy, tuyệt đối KHÔNG import React.',
            },
            {
              name: 'react-dom',
              message:
                'VI PHẠM KIẾN TRÚC: packages/rating là TypeScript thuần túy, tuyệt đối KHÔNG import react-dom.',
            },
          ],
          patterns: [
            {
              group: [
                '@/*',
                'src/*',
                '**/src/*',
                '../src/*',
                '../../src/*',
                '@engines/*',
                'packages/engines/*',
                '**/packages/engines/*',
                '../engines/*',
                '../engines/**',
              ],
              message:
                'VI PHẠM KIẾN TRÚC: Rating trong packages/rating không được phép import từ tầng UI (@/*, src/*) hoặc engines package.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
