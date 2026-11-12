import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Зібрані файли (dist, dist-aldemi), лендинг і залежності — не наш вихідний код
  globalIgnores(['dist', 'dist-*', '**/node_modules', 'landing/**', 'public/**']),
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
      // _навмисно, Компоненти/КОНСТАНТИ з великої — як у шаблоні Vite; помилки в catch не обов'язково використовувати
      // Невикористані змінні (кольори теми, старі обробники календаря) — попередження: прибирати поступово
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Правила React Compiler: робочі патерни календаря (refs у рендері, setState в ефектах) переписувати ризиковано —
      // поки попередження, виправляти поступово з тестами
      'react-hooks/refs': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-refresh/only-export-components': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  // Сервер (Cloud Functions), тести й скрипти — Node.js, не браузер
  {
    files: ['functions/**/*.{js,cjs}', 'tests/**/*.{js,cjs}', 'scripts/**/*.{js,cjs}'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'commonjs' },
    rules: { 'no-unused-vars': ['warn', { caughtErrors: 'none' }] },
  },
  {
    files: ['tests/**/*.mjs', 'tests/flows/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' },
  },
])
