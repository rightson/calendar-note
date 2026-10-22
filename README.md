# Calendar-Note

Calendar-Note 是一個規劃中的 Obsidian 行事曆外掛。以 Event Note 保存事件，點擊後開啟筆記，並在事件當日的 Daily Note `Event` 段落留下連結。iCal 是可選來源，沒有訂閱仍能建立與調整本機事件。

目前提供產品提案與本機 HTML 互動原型，尚未實作 Obsidian 外掛、真實 iCal 抓取或 Vault 寫入。

## 提案與預覽

所有提案 HTML 與相關資源集中於 `docs/changes/calendar-note/`：

- [產品提案](docs/changes/calendar-note/proposal.html)：使用者故事、事件／日誌連動、frontmatter、訂閱邊界、架構與驗收條件。
- [主頁預覽](docs/changes/calendar-note/preview/index.html)：週／月／日／清單、建立本機事件、事件筆記與 Daily Note 預覽。
- [設定頁預覽](docs/changes/calendar-note/preview/settings.html)：可選訂閱、Event Note 路徑、Daily Note 路徑及即時格式預覽。

GitHub 的檔案頁面顯示原始碼；檢視互動版請將專案下載到本機，以瀏覽器直接開啟 HTML，或使用以下靜態伺服器。

```sh
python3 -m http.server 4317 --bind 127.0.0.1
```

從專案根目錄執行後開啟：

- 提案：<http://127.0.0.1:4317/docs/changes/calendar-note/proposal.html>
- 主頁：<http://127.0.0.1:4317/docs/changes/calendar-note/preview/index.html>
- 設定：<http://127.0.0.1:4317/docs/changes/calendar-note/preview/settings.html>

不需安裝套件或建置。Moment 已隨檔案提供，不依賴外部 CDN。

## 原型操作

1. **不設定 iCal 直接使用。** 本機事件來源獨立存在；不需要先填寫網址。示範日期位於 2026 年 10 月 19–25 日。
2. **建立事件。** 在週／日檢視點擊空白時間格，或使用「新增事件」，填寫名稱及起訖時間。取消對話框不會留下事件。
3. **建立重疊事件。** 在既有事件上按右鍵，選擇在此時間新增；不必尋找被遮住的空白格。也能從新增對話框輸入相同時段。
4. **點擊並記錄。** 首次開啟事件會建立示範 Event Note，並在事件開始日期的 Daily Note `## Event` 下追加 bullet link。再次開啟不重複插入。
5. **檢查過去日期。** 點擊 10 月 22 日的事件，切換至 Daily Note 預覽，確認連結寫在 10 月 22 日，而非操作當天的日誌。
6. **調整區間。** 拖曳事件上緣修改開始時間、下緣修改結束時間；另可用時間編輯對話框精確輸入。調整後維持同一筆記，更新 frontmatter 與日誌時間。
7. **檢視 Markdown。** Event Note 的三個必要屬性預設折疊；可以預覽或下載 Event Note 與 Daily Note。
8. **可選訂閱。** 新增網址僅演示設定；示範訂閱須由介面明確載入，不會讀取真實遠端事件。

## 檔案與格式規則

Event Note 預設路徑：

```text
[Calendar Notes]/{title}
```

也能使用日期資料夾，例如：

```text
[Meetings]/YYYY/MM/DD/{title}
```

事件標題 `產品策略 / Q4: Roadmap?` 會轉成合法檔名 `產品策略 Q4 Roadmap.md`。日期使用事件開始時間，支援 Moment 日期 token、locale、`[literal]` 與跳脫字元；`{title}`、`{calendar}`、`{uid}` 是額外事件變數。未知變數、越界及絕對路徑會被阻擋。重名事件自動加編號，不覆寫其他筆記；修改路徑格式不搬動既有筆記。

本機 Event Note 使用三個必要 frontmatter 欄位：

```yaml
---
event_id: "local|event-42"
start: "2026-10-22T10:00:00+08:00"
end: "2026-10-22T11:00:00+08:00"
---
```

Daily Note 另有自己的 Moment 路徑格式，預設：

```text
[Daily Notes]/YYYY-MM-DD
```

日誌連動結果：

```markdown
## Event
- 10:00–11:00 [[Calendar Notes/產品策略 Q4 Roadmap|產品策略 Q4 Roadmap]]
```

實際外掛規劃沿用核心 Daily Notes 的資料夾、Custom format 及模板；核心外掛未啟用時使用 Calendar-Note 的設定。原型以設定頁獨立示範，不會讀取真實 Obsidian 設定。

## 資料與限制

- 事件、設定與兩種筆記只存於目前瀏覽器的 localStorage；下載 Markdown 才會產生匯出檔案。清除瀏覽器儲存資料會重置原型。
- 檔案開啟與 HTTP 開啟的儲存空間可能不同。瀏覽器禁止儲存時，當次頁面仍可操作，但重開可能不保留資料。
- 使用示範網址即可；沒有真實 iCal 請求、排程監控、Obsidian API 操作或遠端寫入。
- iCal 的時間調整規劃為本機覆寫，不回寫訂閱來源；示範介面用本機資料呈現此行為。
- 原型時區固定為 Asia/Taipei（UTC+8）。目前事件編輯以單日區間為範圍，結束最晚可到翌日 00:00，至少 15 分鐘；完整跨日與 DST 處理列在 V1 規格中。
- HTML 提供週／月／日／清單；年、自訂天數、完整 RRULE 及實際 Vault 寫入屬於待實作的外掛規格。

## 檢查

從專案根目錄執行：

```sh
node --check docs/changes/calendar-note/preview/app.js
node --check docs/changes/calendar-note/preview/path-format.js
node --check docs/changes/calendar-note/preview/event-core.js
node docs/changes/calendar-note/preview/smoke-test.cjs
node docs/changes/calendar-note/preview/event-core.test.cjs
```

格式測試涵蓋完整 Moment 日期、語系、literal、事件變數保護、合法檔名、Unicode 長度與相對路徑。事件核心測試涵蓋事件日期的日誌路徑、段落邊界與程式碼區塊、重複連結、保留筆記內容、穩定識別、重疊布局及時間調整。

另外使用暫存安裝的 DOM 模擬環境驗證頁面初始化、零訂閱新增、昨日連結與去重、改日後日誌項目移動、三事件重疊、上下緣事件處理與取消、右鍵所指時間、空白網址草稿、重新載入，以及建立／編輯遇到路徑衝突時的回復。DOM 模擬套件未加入專案執行依賴。

瀏覽器自動化環境目前回報 `Sky Computer Use native pipe startup failed`，因此這次未完成視覺及端到端滑鼠拖曳驗證；不能把核心測試視為完整瀏覽器驗收。

## 文件生命週期

提案階段維持在 `docs/changes/calendar-note/`。規格正式定案後，將整組文件與預覽資源移至 `docs/specs/calendar-note/`，並一併修改 README 與相對連結。現階段不把草案標示為已完成的外掛規格。

## GitHub 分支

此輪成果發布至 [`proposal-codex`](https://github.com/rightson/calendar-note/tree/proposal-codex) 分支，包含提案、原型、測試與 README。這是原始碼分支發布，不是 GitHub Pages 網站或 Obsidian 外掛商店發布。

## 參考與授權

- [TaskNotes](https://github.com/callumalpass/tasknotes)，本機參考版本 `971e5c9a`：行事曆檢視與事件筆記概念。
- [Obsidian Day Planner](https://github.com/ivan-lednev/obsidian-day-planner)，本機參考版本 `9c483b36`：來源設定、快取、重複事件與時區處理。
- [Daily Notes 官方說明](https://obsidian.md/help/plugins/daily-notes)。
- [Moment 日期格式](https://momentjs.com/docs/#/displaying/format/)。

兩個參考專案皆為 MIT。原型未移入其完整外掛架構；隨附 Moment 2.30.1 的授權見 [MOMENT-LICENSE](docs/changes/calendar-note/preview/vendor/MOMENT-LICENSE)。本專案授權見 [LICENSE](LICENSE)。
