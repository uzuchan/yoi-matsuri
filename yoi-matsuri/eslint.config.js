import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'test-results', 'playwright-report']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // インターフェース準拠のため未使用引数は `_` 接頭辞で明示する(例: Scene.update(_dt))
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // src/game/ は描画・UI非依存の純TSドメインロジック領域(TECHNICAL_ARCHITECTURE §2)。
    // three / react のimportはモジュール境界違反としてエラーにする。
    files: ['src/game/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message:
                'src/game は three 非依存の純TSロジック領域です(TECHNICAL_ARCHITECTURE §2)。描画は src/scenes 側で行ってください。',
            },
            {
              group: ['react', 'react/*', 'react-dom', 'react-dom/*'],
              message:
                'src/game は react 非依存の純TSロジック領域です(TECHNICAL_ARCHITECTURE §2)。UIは src/ui 側で行ってください。',
            },
          ],
        },
      ],
    },
  },
])
