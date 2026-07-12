import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // dist = build ; _sources = clones externes (paperasse) non lintés ici.
  globalIgnores(['dist', '_sources']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Espaces fines insécables (U+202F) volontaires dans les chaînes françaises
      // et les regex de parsing des montants ([\s ] — convention CLAUDE.md).
      'no-irregular-whitespace': ['error', { skipStrings: true, skipTemplates: true, skipJSXText: true, skipRegExps: true }],
      // Préfixe _ = « volontairement inutilisé » (destructuring d'exclusion).
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Pattern Context idiomatique : le fichier exporte provider + hook useApp.
    files: ['src/context/**/*.jsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    // Scripts d'outillage exécutés par Node (update-bareme, syncs) + backend api/ (Vercel Functions).
    files: ['scripts/**/*.js', 'vitest.setup.js', 'api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests Vitest : env Node (fs, path, process) en plus du DOM simulé.
    files: ['src/**/__tests__/**/*.{js,jsx}', 'src/**/*.test.{js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
])
