# AUDIO SPEC — 宵祭(よいまつり)

所有者: audio-director / 最終更新: 2026-06-14(T-011 G3-2 判定) / 版: 1.0(Vertical Slice)

## 1. 方針

- 外部音声ファイル不使用。**全音源をWeb Audio APIでプロシージャル合成**(D-004)
- 初回ユーザー操作(クリック/キー入力)でAudioContextをresumeする(autoplay制約対応)。それまでの音響イベントは破棄してよい
- マスターにリミッタ(DynamicsCompressor)を必ず挟む。爆音事故を構造的に防ぐ

## 2. ミックス構成

```
[各音源] → [カテゴリGain] → [マスターGain 0.8] → [Compressor] → destination
カテゴリ: ambient(環境) 0.6 / music(祭囃子) 0.5 / sfx(効果音) 0.9
```

## 3. 環境音レイヤー(approachで常時再生)

| 音源 | 合成方法 | 備考 |
|---|---|---|
| 虫の声(スズムシ) | 4.2kHz帯のサイン波+AM変調(約18Hz)を短いバースト(0.3s)で確率的に発音。2〜3声を左右にパン | 参道の静かな側で目立つ。音量は屋台から離れるほど+20% |
| 群衆のざわめき | ブラウンノイズ→バンドパス(300-800Hz)+ゆらぎLFO。時々ピッチの異なる短い「声」風バースト | 屋台・群衆に近いほど音量+ |
| 祭囃子 | 笛: 矩形波+ビブラートで五音音階(レ・ミ・ソ・ラ・シ)の8小節ループ(BPM 92)。太鼓: 低周波サイン減衰(60Hz, 0.2s)で「ドン・ドン・カッ」パターン。鉦: 2.8kHz金属的短音 | 屋台に近づくほど音量+(距離減衰)。遠くでは笛がかすかに聞こえる |
| 花火 | 打ち上げ: 上昇ホイッスル(0.8s)。開花: ノイズバースト+低域ドン(打ち上げから1.2s後、視覚と同期) | `fireworks:launch` / `fireworks:burst` イベント駆動 |

goldfishシーン中は環境音を-6dB(没入と集中)。resultで復帰。

## 4. 効果音(イベントマッピング表 — EventBus `sfx:play` の name)

| イベント名 | 発火タイミング | 発火責任 | 合成方法(目安) |
|---|---|---|---|
| `prompt` | 近接プロンプト表示 | scenes/approach | 柔らかいサイン2音(C6→E6, 80ms) |
| `interact` | 屋台インタラクト | scenes/approach | 木質クリック(ノイズ+BP 1kHz, 50ms) |
| `dialogue-next` | セリフ送り | ui/Dialogue | 短いポップ(三角波 660Hz, 40ms) |
| `select` | 選択肢フォーカス | ui/Dialogue | サイン 880Hz, 30ms |
| `confirm` | 選択確定/ボタン | ui共通 | 2音上昇(660→990Hz, 90ms) |
| `poi-dip` | ポイ着水 | scenes/goldfish | 水音: ノイズ+LP 600Hz+ピッチ下降, 150ms |
| `poi-lift` | ポイ持ち上げ | scenes/goldfish | 水滴: サイン1.2kHz→0.4kHz, 120ms+滴り |
| `catch` | 捕獲成功 | game/goldfish経由 | 明るい3音(C5-E5-G5, 200ms) |
| `secure` | お椀へ確保 | game/goldfish経由 | `catch`+低域タップ |
| `fish-escape` | 金魚こぼれ/逃げ | game/goldfish経由 | 水はね(ノイズバースト 100ms)+下降2音 |
| `paper-warning` | 耐久30以下(初回) | game/goldfish経由 | 低い注意音(サイン 220Hz×2, 控えめ) |
| `paper-tear` | ポイ破損 | game/goldfish経由 | ノイズバースト(HP 2kHz, 250ms)=紙が裂ける音 |
| `result-success` | 結果画面(成功/大成功) | scenes/result | 祭囃子モチーフの短いジングル(1.5s) |
| `result-fail` | 結果画面(失敗) | scenes/result | 下降3音+優しい鈴(残念だが温かい) |
| `footstep` | 歩行(0.45s間隔) | scenes/approach | 砂利: ノイズバースト+BP 2kHz, 60ms, 音量小 |

## 5. 実装構造(src/audio/)

```
AudioEngine.ts   # context管理, resume, カテゴリGain, リミッタ, EventBus購読
ambient/         # crickets.ts, crowd.ts, hayashi.ts(祭囃子), fireworksSfx.ts
sfx/             # 上記イベント名ごとの合成関数(再生時に都度ノード生成)
```

- AudioEngineは `sfx:play` / `fireworks:*` / `scene:transition` を購読する。ゲームコードからaudioモジュールを直接importしない

## 6. 品質基準

- 全操作フィードバック音は発火から実発音まで50ms以内
- 1分間放置しても環境音にループの継ぎ目・位相の唸りが目立たない
- マスター出力がフルスケールの-3dBを超えない(リミッタ動作確認)

## 7. 実装状況(T-008 / 2026-06-14)

T-008 で §2〜§6 を実装済み(`src/audio/`)。AudioEngine は EventBus を購読するのみ(ゲームコードから直接 import 0件)。
AudioContext は初回ユーザー操作まで生成を遅延し、未対応環境(node/test/SSR)は no-op。マスターに DynamicsCompressor。

- **§4 全効果音(15種)**: 合成関数を実装し `sfx:play{name}` で発火(`src/audio/sfx/`)。レジストリと §4 の name の 1:1 を unit test で固定。
- **§3 環境音**: crickets / crowd / hayashi をルックアヘッド・スケジューラで連続合成し、`resume` 後に常時再生。
  屋台近接(`stall:approach`/`leave`)で hayashi・crowd を強め crickets を弱めるクロスフェード、`scene:transition` の
  goldfish 入場で ambient/music を -6dB ダッキング、他シーンで復帰。
- **発火側の現状(T-009 で解消済み)**:
  - `prompt`(近接プロンプト表示音)・`footstep`(歩行音)は T-009 で `scenes/approach` が発火するようになった
    (`ApproachScene`: 近接 enter で `stall:approach` と同時に `prompt`、移動中 0.45s 間隔で `footstep`)。
    これで §4 の全効果音 15 種が発火側まで接続済み(audio はイベント駆動・購読のみ)。
- **§3 花火(T-009 / 有効化済み)**: `fireworks:launch`(上昇ホイッスル 0.8s)/ `fireworks:burst`
  (ノイズバースト+低域ドン)を AudioEngine が購読して再生する(`ambient/fireworksSfx.ts`)。発火は
  視覚側(world/fireworks = environment-engineer)が launch → 約1.2s → burst の順で行い、音は sfx
  カテゴリ経由でマスター→リミッタを通る。購読は dispose で解除。OfflineAudioContext で両者の非無音を確認。

## 8. G3-2 出荷判定(T-011 / 2026-06-14 / audio-director)

Vertical Slice の音響を QUALITY_GATES G3-2(§6 の 3 項目 +「夏祭りの夜に聞こえるか」)で判定: **合格(出荷可)**。

- **§6-1 操作フィードバック 50ms 以内**: 合格。全 SFX は `events.emit('sfx:play')` 同フレームで
  `AudioEngine.playSfx` が `ctx.currentTime` 即時再生(ルックアヘッド・スケジュール無し)。構造的に即時。
- **§6-2 1分放置のループ継ぎ目/位相唸り**: 合格。crickets=独立3声の確率的間隔、crowd=4s ノイズループ+LFO 揺らぎ、
  hayashi=8小節(≈21s)の楽音ループ(各音は都度合成・スプライス継ぎ目なし。反復は意図した音楽的ループ)。
- **§6-3 マスター -3dBFS 超えない(リミッタ)**: 合格。Chromium OfflineAudioContext で §2 グラフ実測。
  実ゲームで到達しうる最大の場面でいずれも ≤ -3dBFS: goldfish secure(-6dB ダッキング)= -10.2dBFS /
  goldfish paper-tear = -5.5dBFS / approach 花火 burst + 全環境音 = -3.1dBFS。
  ※全 SFX 同時刻スタック等の非現実な合成最悪条件では -1.0dBFS に達したが、シーン分離(result/approach/goldfish)上
    到達不能。**残課題(非ブロッカー)**: 花火 burst + 全環境音が境界(-3.1dBFS)で余裕が薄い。将来 SFX を増やす際は
    リミッタ threshold/ratio の再調整余地あり。
- **夏祭りの夜に聞こえるか**: 合格。五音音階の笛+太鼓「ドン・ドン・カッ」+鉦、スズムシ、群衆、水音、花火が
  ambient/music/sfx の 3 カテゴリで成立。屋台近接で hayashi/crowd を強め crickets を弱めるクロスフェード、
  goldfish 入場で -6dB ダッキング、result 復帰の場面ミックスが自然。result ジングルも五音音階で囃子と統一。
