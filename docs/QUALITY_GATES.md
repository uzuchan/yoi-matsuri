# QUALITY GATES — 宵祭(よいまつり)

所有者: qa-performance-engineer / 最終更新: 2026-06-13

タスクの「完成」と Vertical Slice の「出荷」は、以下のゲートで判定する。主観の入る項目には判定者を明記する。

## G1. 静的品質(全タスク必須)

| # | 基準 | 計測コマンド | 合格条件 |
|---|---|---|---|
| G1-1 | TypeScript型エラー | `npm run typecheck` | エラー0件(strict: true 有効) |
| G1-2 | ESLint | `npm run lint` | エラー0件(warning は10件以下) |
| G1-3 | Unit test | `npm run test` | 全件成功 |
| G1-4 | ビルド | `npm run build` | 成功、gzip後総量500KB以下 |

## G2. 動的品質(機能タスクで必須)

| # | 基準 | 計測方法 | 合格条件 |
|---|---|---|---|
| G2-1 | E2E主要動線 | `npm run test:e2e` | 起動→参道移動→会話開始→金魚すくい→結果→参道復帰 が成功 |
| G2-2 | コンソールエラー | E2E実行中のconsole/pageerror捕捉 | 重大エラー(error/pageerror)0件 |
| G2-3 | FPS | 通常プレイ中 `GameLoop.fps` を10秒サンプリング(approach歩行時とgoldfishプレイ時の両方) | 平均50以上、下位10%が45以上 |
| G2-4 | 入力経路 | E2E+手動 | 主要操作がマウスのみ・キーボードのみの両方で完結 |
| G2-5 | フィードバック | INTERACTION_SPEC §3の表と突合(手動) | 全操作に視覚または音響フィードバックがある |

## G3. 体験品質(Vertical Slice出荷判定。判定者を明記)

| # | 基準 | 判定者 | 合格条件 |
|---|---|---|---|
| G3-1 | 視覚統一感 | art-director | ART_DIRECTION §7のレビュー基準4項目すべて合格 |
| G3-2 | 音響統一感 | audio-director | AUDIO_SPEC §6の3項目+「夏祭りの夜に聞こえるか」 |
| G3-3 | 手触り | game-director | ポイ速度・水の抵抗・紙耐久が結果に影響することを体感確認 |
| G3-4 | 物語 | game-director | 会話開始→結果別の店主反応→報酬が動作 |
| G3-5 | 総合 | critical-reviewer | 重大問題(Critical/Major)なしの判定 |

## G4. 禁止事項チェック(全タスク。1つでも該当したら不合格)

- [ ] TODO/FIXMEコメントが新規追加されたまま残っている
- [ ] ダミー表示・仮ボタン・未接続画面が「完成」として報告されている
- [ ] 動作確認の証跡なしにCOMPLETEと報告されている
- [ ] 未承認の依存関係が追加されている(DECISION_LOGに記録がない)
- [ ] Vertical Slice範囲外の機能(追加屋台等)が実装されている
- [ ] テスト失敗が残ったまま新機能に着手している

## 計測環境

- 基準環境: このリポジトリの開発マシン(macOS / Apple Silicon)、Chromium(Playwright同梱)最新
- FPS計測はdevビルドではなく `npm run build` + `npm run preview` で行う(devのHMRオーバーヘッド除外)
