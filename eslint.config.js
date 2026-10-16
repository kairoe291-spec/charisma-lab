import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': hooks },
    rules: { ...hooks.configs.recommended.rules, '@typescript-eslint/no-explicit-any': 'error' },
  },
  {
    files: [
      'src/pages/{Dashboard,Academy,Lesson,Scenarios,Training,Journal,Assessment,Studio}.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/data/**',
                '**/cloud/**',
                '**/sync/**',
                '**/hooks/**',
                '**/content',
                '**/content/**',
                '**/app/**',
              ],
              message: 'Pages compose Features; queries and business rules belong in the Feature.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/pages/**',
                '**/app/**',
                '**/components/**',
                '**/data/database',
                '**/cloud/**',
                '**/sync/**',
              ],
              message:
                'Features use shared UI, public types and Repository access; do not depend on Pages or cloud internals.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/shared/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/features/**',
                '**/pages/**',
                '**/app/**',
                '**/data/**',
                '**/cloud/**',
                '**/sync/**',
              ],
              message: 'Shared components must not depend on business modules or persistence.',
            },
          ],
        },
      ],
    },
  },
);
