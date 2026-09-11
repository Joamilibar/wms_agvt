import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
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
      // Tracked debt, not an exemption: 54 `any` annotations remain on API
      // response shapes (half of them in CreatePickingModal). They stay visible
      // as warnings so CI can gate on real errors instead of being red from day
      // one over pre-existing code. Typing the API responses removes the rule.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
])
