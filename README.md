# Calendar-Note

Calendar-Note 的產品提案與本機互動 HTML 原型。這個階段尚未實作 Obsidian 外掛、真實 iCal 訂閱或 Vault 寫入。

## 預覽

直接用瀏覽器開啟：

- `proposal.html`：產品提案、參考依據、完整 V1 規格與驗收條件。
- `preview/index.html`：預設週曆與事件筆記互動。
- `preview/settings.html`：訂閱設定、路徑格式與即時預覽。

也可以從本目錄啟動靜態伺服器：

```sh
python3 -m http.server 4317 --bind 127.0.0.1
```

開啟 <http://127.0.0.1:4317/preview/index.html>；設定頁為 <http://127.0.0.1:4317/preview/settings.html>。

原型使用示範事件；設定及筆記內容儲存於瀏覽器 localStorage。檔案開啟與 HTTP 開啟的資料可能分開；若瀏覽器禁止儲存，當次操作仍可用，但重新開啟可能不保留。請勿填入真實私密訂閱網址；原型不會抓取 URL。

## 檢查

```sh
node --check preview/app.js
node --check preview/path-format.js
node preview/smoke-test.cjs
```

## 驗證範圍

已執行 JavaScript 語法檢查、筆記路徑核心測試與 HTML 本機連結／資源檢查，主頁及設定頁的靜態伺服器回應均為 HTTP 200。瀏覽器自動化工具發生 `Sky Computer Use native pipe startup failed`，尚未完成主頁與設定頁的視覺及端到端操作驗證。

## 參考

- [TaskNotes](https://github.com/callumalpass/tasknotes)，本機參考版本 `971e5c9a`。
- [Obsidian Day Planner](https://github.com/ivan-lednev/obsidian-day-planner)，本機參考版本 `9c483b36`。
- [Daily Notes 官方說明](https://obsidian.md/help/plugins/daily-notes)。
- [Moment 日期格式文件](https://momentjs.com/docs/#/displaying/format/)。

兩個參考專案皆為 MIT；原型不複製其完整外掛架構。隨附依賴的授權見 `preview/vendor/`。
