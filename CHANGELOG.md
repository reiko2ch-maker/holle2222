# B50 Immersion Init Fix

- Fixed startup freeze caused by calling missing `applyImmersionPass()` after the graphics immersion pass.
- The correct `addImmersionPass(areaId)` function now runs during area build.
- Kept the B49 graphics / lighting / immersion improvements intact.
- Updated cache version strings to B50.

# CHANGELOG

## B49 - Graphics / Immersion Pass
- 全体の露出・環境光・視認性を上げ、暗すぎてプレイに支障が出る箇所を緩和。
- 帳場、客室廊下、北廊下、宿帳庫、離れ通路、旧館導入廊下、旧館深部にベースボード・天井梁・汚れ・床の擦れ・紙束・小物・補助光を追加。
- 既存ストーリーやミニゲームの導線は維持しつつ、空間のチープさを減らす環境美術パスを追加。
- スマホ操作の手触りを微調整し、視点感度と移動速度を少し改善。
- 歩行時のごく軽いヘッドボブを追加し、没入感を強化。


## B45 - Minigame real fix
- Fixed 10-stage minigame crash caused by object stage definitions being treated as arrays.
- Added robust stage parser for object/array map formats.
- Added safe fallback so the minigame does not freeze on malformed stage data.
- Updated cache-busting version to b48_stage9_enemy_fix.

## B41 Special Route / 10 Stage Mini Game
- ミニゲームを10ステージ制に拡張。鍵、扉、巡回敵、罠床、視界制限、速度上昇など段階的に難しくなるギミックを追加。
- ミニゲーム内に「戻る」ボタンを追加。途中で中断して本編へ戻れるように調整。
- ミニゲーム全10ステージクリア後、小さな銀鍵を入手。
- 田舎町に古いコインロッカーを追加。銀鍵で開けると従業員メモ、旧館見取り図の切れ端、懐中電灯を入手。
- コインロッカー開放後、田舎町から旅館裏庭へ進める特殊ルートを追加。
- 旅館裏庭に祠、旧館の窓、焦げた203号室札、裏庭通用口を追加。
- レアキャラクターの会話を特殊ルートのヒント寄りに更新。
- 旧館・旧館渡り廊下・旅館裏庭では目的地までの距離表示を非表示化し、探索ホラー寄りに調整。

## B41 Special Route / 10 Stage Mini Game
- 赤パーカーの客・白パーカーの客を超レア発見キャラとして追加。
- 序盤で遊べるドットRPG風ミニゲームを追加。
- ミニゲームクリアで「小さな銀鍵」を入手できるフラグを追加。
- スマホ操作用のミニゲーム十字ボタンとキーボード操作に対応。

# Changelog

- B30: DAY3しゃがみ客イベントの進行定義不足によるフリーズを修正。トイレットペーパー取得/受け渡しステップを追加し、未定義ステップでも進行UIが落ちないよう安全化。

# CHANGELOG

## B29 Day3 Fix + Toilet Key Event
- DAY3の宿帳ACTが出ても進めない問題を修正
- 宿帳確認後、しゃがみ客にトイレットペーパーを渡して旧館の鍵を受け取る新イベントを追加
- 浴場の替え棚にトイレットペーパー配置を追加
- 番台裏の鉄扉が、鍵入手後は専用テキストに変わるよう修正
- 女将の初回登場位置を少し手前の空き空間へ変更
- 宿帳庫追跡の開始位置を安全側へ再調整

## B24 Full Horror Audio Pass
- Web Audio ベースのSE / 環境音 / 追跡音を追加
- メニューに SOUND ON/OFF を追加
- エリアごとの環境音切替、足音、紙・扉・金属・水音を実装
- 旧館鉄扉ノック、北廊下の行灯音、浴場の水滴音などを追加
- 青いノート取得後の追跡開始音、トイレ個室の遅延音、エンディング音を追加

## B23
- 旅館の外側の玄関扉を見えやすく調整
- 帳場から田舎町へ戻れる玄関と土間を追加
- DAY3の掲示板判定を常時有効化して調べやすく修正
- 田舎町の住民NPCを追加
- 北廊下に入った瞬間に動けなくなる出現位置バグを修正
- 北廊下・宿帳庫・離れ通路の明るさを少し引き上げ

## B21 Cutscene + Poster + Door Readability Fix
- B16のDAY3拡張をベースに、スマホ操作改善を再統合
- RUNボタンを常時表示・タップ切替式に変更
- LOOK感度と移動速度を微調整
- 女将登場カットシーンをロード後でも発火するよう補強
- 宿帳庫とDAY3廊下の誘導員演出トリガーを見やすく調整
- 帳場の番台まわりに鍵棚・灯り・敷物・花器などを追加して密度アップ

# B16 Day3 Continuation

- DAY3の前半から終幕までを追加
- 第二夜の終了を中間終幕へ変更し、翌朝へ続く構成に修正
- 203号室の記録異常、しゃがみ客の再会話、清掃案内、避難図、青いノート続き、203の痕跡、3分岐エンドを追加
- 旧セーブの第二夜終了データをDAY3開始へ移行する互換処理を追加

# CHANGELOG

## Public Test Complete v1
- タイトルからはじめから / LOAD / 全スロット削除
- 自宅 -> 田舎町 -> 旅館導入
- 昼勤務の作業パート
- 深夜の宿帳庫追跡
- 帰宅 -> 睡眠 -> 翌朝
- 第2幕導入
- スマホ向けUI調整
- 3スロットセーブ / ロード

- B4 Realism Pass: realistic scale pass, improved human meshes, asset-driven backdrop integration, higher ceilings.

- b9: 田舎町の旅館外観を正面玄関寄りに調整、帳場に行方不明者ポスター追加、浴場内にトイレ区画としゃがみキャラを追加、役職ごとの服装差し替えを反映。

- b11: 浴場トイレの手前個室をACT開閉演出に変更し、開けた後にしゃがみ客が出現するよう修正。
- b11: 田舎町の旅館外観を回り込み不要の正面向きに再配置し、自宅からまっすぐ入れる導線に調整。


## B19
- 扉を壁埋め込み風に調整し、各エリアで浮いて見えにくく修正
- 旅館ロビーの側面扉位置を整理し、女将カットシーンの導線をクリア化
- 女将の登場位置と歩行経路を修正し、ドアで詰まりにくく改善
- お仕事パートで使う物品の配置を通路から外した
- 非対象アイテムの吸着距離を少し短くして誤反応を軽減


## B27
- Fixed Day 3 register ACT prompt with front-side interaction proxy.
- Improved second chase unstuck logic and safer guide spawn points.
- Updated guide portrait asset binding.

- B28: chase spawn safety, guide always-front texture, okami cutscene path fix.

- b32: 同一エリア内で進行ステップが変わった時に、その場で対象物が出現するようエリア再構築を追加。
- b33: 旧館導入として番台裏の鉄扉から入るガラス張り渡り廊下を追加。庭園が見える一本道廊下、窓の追跡者チラ見せ、窓ドン、旧館入口の確認イベントを追加。

- b34: 旧館渡り廊下追加後にミニマップ描画で oldhall 座標が未登録となりフリーズする問題を修正。未知エリアがあっても描画で落ちない安全処理を追加。
- b35: 旧館渡り廊下から帳場へ戻った後も鉄扉から再入場できるよう修正。旧館廊下の窓演出を強制視点移動つきに変更し、旧館帰還後の本館全域に赤い霧・血痕・崩れ表現を追加。

- b36: 旧館渡り廊下の窓演出を実際に操作停止＋強制視点移動で見せるよう修正。旧館から本館へ戻った瞬間に本館ホラー化フラグを立て、帳場・廊下・浴場などの赤い霧、血痕、壊れ板、暗赤色ライトが確実に反映されるよう修正。


## B38
- 交代エンドの はい/いいえ 分岐を安定化
- はいで特殊ムービー→交代エンド
- いいえで旧館深部ルート開始を安定化
- キャッシュ更新

## B39 Polish / Old Wing Story Expansion
- タイトル画面を旧館ホラー寄りの高品質ビジュアルに刷新
- 旧館深部に探索用の客依頼ルートを追加
  - 破れた依頼メモ
  - 欠けた櫛
  - 焦げた写真
  - 古い薬包
- 客の忘れ物を回収すると、新分岐「供養エンド」へ進める導線を追加
- 旧館深部の部屋ラベル、施錠札、破損板、破れ布、赤い光だまりを増やして密度を改善
- 既存の帰還 / 宿泊 / 交代 / 旧館ルートは維持

## B51
- 歩行時のカメラ揺れを大幅に抑制。
- 旧館奥の鍵を拾った後のストーリーを拡張：供養台、血の紙片、旧館奥扉の新台詞を追加。
- 旧館から戻った後の本館異変を、より暗く赤く不気味に調整。
