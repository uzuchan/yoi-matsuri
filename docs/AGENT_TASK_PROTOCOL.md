# AGENT TASK PROTOCOL — 宵祭(よいまつり)

所有者: executive-producer / 最終更新: 2026-06-13

Lead Agent(Executive Producer兼任)と10体のサブエージェントの協働規則。全エージェントはこの文書に従う。

## 1. 体制

- **Lead Agent**: 全体統括。タスク割当、コード統合(git commit)、品質ゲート最終確認。**統合責任はLead Agentのみが持つ**
- **サブエージェント**(.claude/agents/): executive-producer, game-director, technical-architect, art-director, interaction-designer, gameplay-engineer, environment-engineer, audio-director, qa-performance-engineer, critical-reviewer

## 2. 並行作業の規則

1. **コード編集の同時実行は最大1エージェント**(10体全員を同時にコード編集させない)。例外的に2実装エージェントを並行させる場合、Editable Filesが完全に素である(同じファイルを共有しない)ことをLead Agentが事前に確認する
2. 同じファイルを複数エージェントへ同時に編集させない。所有者マップ(CLAUDE.md)が既定、タスクカードのEditable Filesが最終
3. 調査・設計・レビュー(コードを書かない作業)は並列化してよい
4. 実装者(Owner)とReviewerは必ず別エージェント。Reviewerはコードを直接修正しない(1文字でも差し戻し)
5. 依存関係の追加は事前に technical-architect が必要性を評価し、DECISION_LOG に記録する

## 3. タスクカード形式(全タスク必須。docs/BACKLOG.md に記載)

```
Task ID：T-XXX
Owner：(実装責任エージェント1体)
Reviewer：(critical-reviewer または領域の設計責任者)
Goal：(1〜2文)
User Story：(〜として、〜したい、なぜなら〜)
Inputs：(読むべき文書・セクション)
Editable Files：(このタスクで触ってよいファイル/ディレクトリの明示列挙)
Forbidden Changes：(特に禁止する変更)
Acceptance Criteria：(検証可能な箇条書き。曖昧語禁止)
Tests：(追加・更新するテストと実行コマンド)
Evidence：(完了時に提示する証跡: コマンド出力、スクリーンショット等)
Risks：(既知のリスクと回避策)
Status：READY | IN_PROGRESS | IN_REVIEW | COMPLETE | BLOCKED
```

## 4. 開発ループ

1. **1ループ=1ユーザーストーリー**。前のストーリーのテストが失敗している間、新機能へ進まない
2. 実装前にAcceptance Criteriaを確定する(後出し変更はLead Agentの承認が必要)
3. ループ手順: Owner実装 → Owner自己検証(品質ゲートG1+動作確認) → Reviewerレビュー → Lead Agent統合(git diff確認→commit)
4. **1タスク最大5ループ**。各ループ終了時にLead Agentが判定:
   - **KEEP**: 方向は正しい。指摘対応して次ループ
   - **REVISE**: 設計を修正して次ループ
   - **REVERT**: 変更を破棄して仕切り直し(git restore)
   - **COMPLETE**: 全Acceptance Criteria合格+Reviewer承認
   - **BLOCKED**: 外部要因で進行不能。CURRENT_STATUSに記録
5. **同じ不具合の修正に3回失敗したら作業停止**し、reports/CURRENT_STATUS.md へ記録する: 発生している問題 / 再現手順 / 試した修正 / 失敗した理由 / 推奨する次の対応 / 影響を受けるファイル

## 5. 完了報告フォーマット(全エージェント共通)

```
## 完了報告
- Task ID: T-XXX
- Status: COMPLETE | REVISE | BLOCKED(+ループ番号)
- 実施内容: (箇条書き)
- 変更ファイル: (git diff --stat 相当)
- 実行したテスト: (コマンドと結果。「実行していない」も正直に書く)
- 動作確認の証跡: (確認手順と観察結果。未確認の機能をCOMPLETEにしない)
- 未解決の問題/リスク:
- 引き継ぎ事項: (次のエージェントが必要とする情報)
```

禁止: TODO・ダミー表示・仮ボタン・未接続画面をCOMPLETEとして報告すること。動作確認していない内容を「完了」と書くこと。

## 6. 受け渡し(ハンドオフ)

- 永続化が必要な成果物は所有文書(docs/)または reports/ に書いてから報告する。「会話の中だけの仕様」を禁止
- 実装間のインターフェース受け渡しは、イベント名・型シグネチャを報告に明記する
- レビュー結果は reports/reviews/REV-<TaskID>-<連番>.md
- バグは reports/qa/bugs/BUG-<連番>-<slug>.md

## 7. git規律

- commit/push操作はLead Agentのみ。サブエージェントは git diff / git log / git status のみ使用可
- 小さなコミット単位(1タスク=1〜3コミット)。各タスク完了後にLead Agentが git diff とテスト結果を確認してからcommit
- **リモートリポジトリへのpushは、ユーザーの明示的な許可なく絶対に行わない**
