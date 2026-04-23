import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/components/ui']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Respect leading-underscore convention for intentionally-unused
      // parameters, e.g. React.FC props destructuring where the consumer
      // matches a third-party shape.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Test files often call `require()` inside `vi.mock()` factories — that is
  // the documented pattern because vi.mock hoists above ESM imports, so the
  // factory cannot reference imported bindings. Allow it for tests only.
  {
    files: [
      '**/*.test.{ts,tsx}',
      'src/test-setup.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
])
