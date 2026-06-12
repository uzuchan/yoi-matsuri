import { defineConfig } from 'vitest/config'

// Unit testはDOM非依存(jsdom禁止)。DOMが必要な箇所はテスト側で最小モックを使う。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
