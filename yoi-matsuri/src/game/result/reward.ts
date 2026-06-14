/**
 * 結果の報酬段判定(T-007 / GDD §3.2)。three / react / DOM 非依存の純TS(D-003)。
 *
 * 金魚すくい終了時の確保数(secured = finished.caught)から、店主の反応の段(tier)を決め、
 * 見出し・店主セリフ・報酬を返す。文言は GAME_DESIGN_DOCUMENT.md §3.2 と
 * INTERACTION_SPEC.md §4 が正で、ここを唯一の出典にする(セリフ・報酬IDのコード分散を防ぐ)。
 *
 * 段判定基準(GDD §3.2「捕獲」の定義 = secured):
 *   - 0 匹      → 'fail'    (失敗)
 *   - 1〜2 匹   → 'success' (成功)
 *   - 3 匹以上  → 'great'   (大成功)
 * 段は reason(torn / timeout / quit)に依らず secured 数のみで決まる(GDD §3.2)。
 */

/** 結果の段。GDD §3.2: 失敗 / 成功 / 大成功。 */
export type ResultTier = 'fail' | 'success' | 'great'

/**
 * 金魚すくいの終了理由(GoldfishSession の finished.reason と同型 / GDD §3.2)。
 *   - 'torn'    : ポイ破損で終了
 *   - 'timeout' : 制限時間切れで終了
 *   - 'quit'    : プレイヤーが途中退出(Esc)で終了
 * 見出し・店主セリフは失敗段(secured 0匹)のみ reason で分岐する(GDD §3.2 v1.2)。
 */
export type ResultReason = 'torn' | 'timeout' | 'quit'

/** 報酬ID(GDD §3.2)。所持品スロットの表示はこのIDを引いて行う(使用機能は無し)。 */
export type RewardId = 'reward:candy' | 'reward:bag-small' | 'reward:bag-deluxe'

/** 報酬の表示情報(所持品スロット・結果画面で使う純データ)。 */
export interface RewardInfo {
  /** 報酬ID(GDD §3.2)。 */
  readonly id: RewardId
  /** 表示名(短い)。所持品スロットのラベル・結果画面に出す。 */
  readonly name: string
  /** アイコン代わりの絵文字(外部画像アセット禁止のため文字で表す)。 */
  readonly icon: string
}

/** 段ごとの確定結果(見出し・店主セリフ・報酬)。 */
export interface ResultOutcome {
  /** 段(失敗 / 成功 / 大成功)。 */
  readonly tier: ResultTier
  /** 確保数(secured = finished.caught)をそのまま保持する。 */
  readonly caught: number
  /** 結果画面見出し(INTERACTION_SPEC §4)。 */
  readonly heading: string
  /** 店主のセリフ(GDD §3.2)。 */
  readonly shopkeeperLine: string
  /** 報酬(GDD §3.2)。 */
  readonly reward: RewardInfo
}

/** 話者名(GDD §3.1/§3.2: 「店主」)。 */
export const SHOPKEEPER = '店主'

/** 段の境界(GDD §3.2)。1 匹以上で成功、3 匹以上で大成功。 */
export const SUCCESS_THRESHOLD = 1
export const GREAT_THRESHOLD = 3

/** 報酬の表示情報テーブル(GDD §3.2)。 */
export const REWARDS: Readonly<Record<RewardId, RewardInfo>> = {
  'reward:candy': { id: 'reward:candy', name: 'ラムネ風アメ', icon: '🍬' },
  'reward:bag-small': { id: 'reward:bag-small', name: '金魚袋', icon: '🐟' },
  'reward:bag-deluxe': { id: 'reward:bag-deluxe', name: '大きな金魚袋+出目金', icon: '🎏' },
}

/**
 * 結果画面見出し(成功・大成功 / INTERACTION_SPEC §4)。reason 非依存。
 * 失敗段(0匹)は破れた/破れていないで文言が変わるため FAIL_HEADING_BY_REASON で分岐する。
 */
const HEADINGS: Readonly<Record<'success' | 'great', string>> = {
  success: '金魚をすくった!',
  great: '大漁!名人級!',
}

/**
 * 失敗段(0匹)の見出しを終了理由で分岐する(GDD §3.2 v1.2 / INTERACTION_SPEC §4)。
 *   - 'torn'           : 「ポイが破れてしまった…」(破損)
 *   - 'timeout'/'quit' : 「すくえなかった…」(破れていないのに「破れた」と出る齟齬を解消)
 */
const FAIL_HEADING_BY_REASON: Readonly<Record<ResultReason, string>> = {
  torn: 'ポイが破れてしまった…',
  timeout: 'すくえなかった…',
  quit: 'すくえなかった…',
}

/** 店主のセリフ(成功・大成功 / GDD §3.2)。reason 非依存。 */
const SHOPKEEPER_LINES: Readonly<Record<'success' | 'great', string>> = {
  success: 'おっ、やるねえ!ほら、大事にしてやんなよ。',
  great: 'うおっ、名人かい!?こりゃあ参った、特別だ!',
}

/**
 * 失敗段(0匹)の店主セリフを終了理由で分岐する(GDD §3.2 v1.2)。
 * 見出しに合わせて出し分ける(timeout/quit は破れていないため破損前提の文言を出さない)。
 *   - 'torn'           : 「ありゃー、破れちまったか。…」(破損)
 *   - 'timeout'/'quit' : 「おっと時間だ。今日はご縁がなかったか。…」
 */
const FAIL_LINE_BY_REASON: Readonly<Record<ResultReason, string>> = {
  torn: 'ありゃー、破れちまったか。まあ祭りの夜は長いんだ、また挑戦しな!',
  timeout: 'おっと時間だ。今日はご縁がなかったか。…また挑戦しな!',
  quit: 'おっと時間だ。今日はご縁がなかったか。…また挑戦しな!',
}

/** 段ごとの報酬ID(GDD §3.2)。 */
const TIER_REWARD: Readonly<Record<ResultTier, RewardId>> = {
  fail: 'reward:candy',
  success: 'reward:bag-small',
  great: 'reward:bag-deluxe',
}

/**
 * 確保数(secured)から段を決める(GDD §3.2)。reason には依存しない。
 * 負数や非整数が来ても安全に扱う(0 未満は 0 とみなす)。
 */
export function tierForCaught(caught: number): ResultTier {
  const n = Number.isFinite(caught) ? Math.max(0, Math.floor(caught)) : 0
  if (n >= GREAT_THRESHOLD) return 'great'
  if (n >= SUCCESS_THRESHOLD) return 'success'
  return 'fail'
}

/** reason が未指定/不正なときの既定(破損)。後方互換: 旧呼び出し resolveResult(caught) を破損扱いにする。 */
const DEFAULT_REASON: ResultReason = 'torn'

/** 渡された値を ResultReason に正規化する(不正値は破損へ丸める)。 */
function normalizeReason(reason: ResultReason | undefined): ResultReason {
  return reason === 'torn' || reason === 'timeout' || reason === 'quit' ? reason : DEFAULT_REASON
}

/**
 * 確保数(secured = finished.caught)と終了理由(reason)から結果(段・見出し・店主セリフ・報酬)を
 * 確定する。結果画面(ResultScene / ui/Result)はこの戻り値を表示・所持品反映に使う。
 *
 * 段判定(tier)・報酬は secured 数のみで決まる(reason 非依存 / GDD §3.2)。
 * 見出し・店主セリフは **失敗段(0匹)のみ** reason で分岐する(GDD §3.2 v1.2):
 *   - torn           → 「ポイが破れてしまった…」/「ありゃー、破れちまったか。…」
 *   - timeout / quit → 「すくえなかった…」/「おっと時間だ。今日はご縁がなかったか。…」
 * 成功・大成功段は reason 非依存(1匹以上確保=「すくえた」事実が成立するため)。
 */
export function resolveResult(caught: number, reason?: ResultReason): ResultOutcome {
  const tier = tierForCaught(caught)
  const safeCaught = Number.isFinite(caught) ? Math.max(0, Math.floor(caught)) : 0
  const r = normalizeReason(reason)
  const heading = tier === 'fail' ? FAIL_HEADING_BY_REASON[r] : HEADINGS[tier]
  const shopkeeperLine = tier === 'fail' ? FAIL_LINE_BY_REASON[r] : SHOPKEEPER_LINES[tier]
  return {
    tier,
    caught: safeCaught,
    heading,
    shopkeeperLine,
    reward: REWARDS[TIER_REWARD[tier]],
  }
}
