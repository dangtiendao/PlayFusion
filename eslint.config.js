import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', '.system_generated', '.husky'],
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
  // ==============================================================================
  // RULE KIẾN TRÚC BẤT BIẾN (ARCHITECTURAL BOUNDARY INVARIANT):
  // Các module bên trong packages/engines/** là Game Engine logic thuần túy (Pure TS).
  // Tuyệt đối KHÔNG import:
  //   1. "react" hoặc "react-dom" (chống dính coupling vào UI framework)
  //   2. "@/*" hoặc "src/*" (chống import ngược tầng UI / browser API wrapper)
  //   3. Relative path vượt ra ngoài packages/engines ("../*")
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
              group: ['@/*', 'src/*', '../*'],
              message:
                'VI PHẠM KIẾN TRÚC: Engine trong packages/engines không được phép import từ tầng UI (@/*, src/*, hoặc ../*)',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
