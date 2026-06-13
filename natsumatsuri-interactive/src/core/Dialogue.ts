/**
 * 会話システムの契約(D-008)。
 *
 * この契約は three / react / DOM に非依存の純TSとして core に置く。これにより
 * 依存方向(game→core / scenes→core / ui→core)を守ったまま、3つの利用者が同じ型を共有する:
 *   - game/dialogue(段B): DialogueController を実装する(店主会話データ・状態遷移)
 *   - scenes/dialogue: DialogueController を駆動し(キーボード入力)、表示状態を HUD へ橋渡しする
 *   - ui/Dialogue(段B): DialogueView を受けて会話ボックス・選択肢を描画し、クリック入力を controller へ返す
 *
 * 段A(technical-architect)はこの「契約」と駆動の土台のみを用意する。実際のセリフ内容・
 * 状態遷移ロジック・見た目は段B(gameplay-engineer)が実装する。
 */

/** 1つの選択肢。id は分岐の識別、label は表示文言(GDD §3.1: 「遊んでいく」「またあとで」)。 */
export interface DialogueChoice {
  /** 分岐識別子(例 'play' | 'later')。'dialogue:choice' イベントの choiceId に使う。 */
  readonly id: string
  /** 画面に表示する文言。 */
  readonly label: string
}

/**
 * HUD(ui/Dialogue)が描画に必要とする会話の「表示状態」スナップショット。
 * 完全にプレーンなデータ(関数・three/react 型を含まない)で、EventBus 経由でも安全に運べる。
 *
 * - speaker: 話者名(例「店主」)。表示しない実装なら空文字でよい
 * - text: 現在のセリフ全文(送り途中でも全文を保持する。可視範囲は visibleText で表す)
 * - visibleText: 1文字送り(INTERACTION_SPEC §3.2: 約30字/s)で「今見えている」部分文字列
 * - typing: 送り中(visibleText がまだ text に達していない)なら true
 * - choices: 選択肢表示中はその一覧。セリフ送り中は空配列
 * - focusedChoiceIndex: 選択肢のフォーカス位置(choices が空なら -1)
 * - active: 会話が進行中なら true。終了(打ち切り/分岐確定後)で false
 */
export interface DialogueView {
  readonly speaker: string
  readonly text: string
  readonly visibleText: string
  readonly typing: boolean
  readonly choices: readonly DialogueChoice[]
  readonly focusedChoiceIndex: number
  readonly active: boolean
}

/**
 * 会話が終了したときの結末。DialogueScene はこれを受けてシーン遷移(transition)を決める。
 * - kind 'continue': まだ会話中(終了していない)。advance/confirm の戻り値として使う
 * - kind 'choice': 選択肢が確定した。choiceId は確定した DialogueChoice.id
 * - kind 'aborted': Esc 等で打ち切られた(approach へ戻る)
 *
 * 「どのシーンへ遷移するか」は controller ではなく DialogueScene 側が解釈する
 * (goldfish 未実装時の安全な扱いはシーン側の責務 = D-008)。controller は分岐の事実だけを返す。
 */
export type DialogueOutcome =
  | { readonly kind: 'continue' }
  | { readonly kind: 'choice'; readonly choiceId: string }
  | { readonly kind: 'aborted' }

/**
 * 会話の状態機械(段Bが game/dialogue に実装する具象の契約)。
 *
 * three/react/DOM 非依存。入力は2経路(DialogueScene=キーボード / ui/Dialogue=クリック)から
 * 来るが、どちらもこのインターフェースのメソッドへ集約する(D-008)。
 * 表示状態は view() で取得し、変化は DialogueScene が 'dialogue:view-changed' で HUD へ伝える。
 */
export interface DialogueController {
  /** 会話を開始し、初期表示状態へ遷移する。再開可能(再度呼べば最初から)。 */
  start(): void

  /**
   * 固定タイムステップで進む内部時間。1文字送り(約30字/s)のタイピングを進める。
   * 入力に依らず毎フレーム呼ぶ。dt は秒。
   */
  tick(dt: number): void

  /**
   * 送り(クリック/Enter/Space)。送り中なら全文即時表示、表示済みなら次のセリフへ。
   * 最後のセリフで呼ぶと選択肢表示へ進む(選択肢があれば)。
   * 戻り値で選択が確定したか・継続かを返す。
   */
  advance(): DialogueOutcome

  /** 選択肢のフォーカスを移動する(↑↓ / ホバー)。delta は ±1。選択肢非表示時は無視。 */
  moveFocus(delta: number): void

  /** インデックス指定でフォーカスを合わせる(マウスホバー用)。範囲外は無視。 */
  focus(index: number): void

  /**
   * 現在フォーカス中の選択肢を確定する(Enter/クリック)。
   * 選択肢非表示時は { kind: 'continue' } を返す。
   */
  confirm(): DialogueOutcome

  /** 会話を打ち切る(Esc)。常に { kind: 'aborted' } を返し、view().active を false にする。 */
  abort(): DialogueOutcome

  /** 現在の表示状態スナップショットを返す(イミュータブルに扱うこと)。 */
  view(): DialogueView
}
