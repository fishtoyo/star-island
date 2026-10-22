# 鉅潞島 GRNET ISLAND

用 3D 六角島嶼介紹鉅潞科技：公司願景、團隊同仁、案件流程、服務項目與作品集。每一座島是一個主題，島上的建築／人物是細項，島與島之間的弧線是協作關係。

目前內容整理自 [鉅潞科技官網](https://www.grnet.com.tw/)，僅供示範，可直接在 `assets/data/data.json` 修改。

架構參考 [HEART 政策島](https://puma.taipei/heart-island) 的做法：純靜態網站、原生 ES Modules，用 importmap 載入 Three.js，內容放在 JSON。沒有建置步驟，可以直接放上 GitHub Pages。

## 本機預覽

ES Modules 和 `fetch` 在 `file://` 下會被瀏覽器擋掉，所以**不能直接雙擊 `index.html`**，要用本機伺服器開啟：

```bash
cd star-island
php -S localhost:8000      # 或 npx serve .
```

然後打開 http://localhost:8000

## 檔案結構

```
index.html                 頁面骨架、importmap
assets/css/theme.css       色系（只改這個檔就能換色）
assets/css/ui.css          介面樣式
assets/data/data.json      內容：主題、細項、標籤、協作關係
assets/js/app.js           主程式：場景、互動、面板、清單
assets/js/world.js         六角島、建築造型、協作線
assets/js/environment.js   水面、燈光、霧
assets/js/palette.js       把 CSS 變數套到 3D 材質
assets/vendor/three/       Three.js r170（MIT License）
```

## 改色系

所有顏色（介面 + 3D）都是 `assets/css/theme.css` 裡的 CSS 變數：

- **改現有色系**：直接改 `:root` 那組（預設「鉅潞紅」）的色碼，例如 `--c-primary`。內建色系：鉅潞紅、珊瑚、海洋、夜空。
- **新增色系**：複製一組 `:root[data-theme="ocean"] { … }`，改成新的 id 和顏色，再到 `assets/js/app.js` 最上方的 `THEMES` 加一行 `{ id: "新id", name: "顯示名稱" }`。
- 網頁右上的「色系」按鈕可以切換，會記住使用者上次的選擇。

常用變數：

| 變數 | 用途 |
|---|---|
| `--c-primary` | 主色（按鈕、編號、強調） |
| `--tag-c / -t / -s / -w` | 四個標籤（公司、團隊、服務、作品）的顏色，也是建築與人物的顏色 |
| `--c-bg-top / --c-bg-bottom / --c-fog` | 背景漸層；`--c-fog` 要和 `--c-bg-bottom` 一致，水面才會自然融入背景 |
| `--c-water / --c-land / --c-sand / --c-plaza / --c-cliff` | 水面、草地、沙地、廣場、島的側面 |
| `--c-wall / --c-roof / --c-tree / --c-link` | 牆面、屋頂、樹、協作線 |
| `--sky-intensity / --sun-intensity` | 環境光、日光強度（夜間色系調低） |

## 改內容（`assets/data/data.json`）

```jsonc
{
  "meta":  { "title", "kicker", "headline", "lead", "note" },
  "tags":  [{ "id": "c", "letter": "C", "name": "公司", "en": "Company" }],
  "islands": [{
    "id": "hq",                // 英數字，也會用在網址 #hq
    "number": 1,
    "name": "鉅潞總部",
    "summary": "一句話說明",
    "tags": ["c"],              // 第一個標籤決定島的主色
    "axial": [0, 0],            // 六角座標 [q, r]，相鄰位置見下方
    "ground": "plaza",          // land | sand | plaza
    "items": [{
      "id": "hq-tainan", "name": "名稱", "desc": "說明",
      "role": "職稱或副標",       // 可省略
      "url": "https://…",        // 可省略，有填會出現「查看作品」連結
      "shape": "hall",          // tower | house | dome | hall | turbine | grove | person | flag
      "tag": "c"                // 可省略，省略時用島的第一個標籤
    }]
  }],
  "links": [{ "id": "L1", "from": "hq", "to": ["vision", "leaders"], "text": "關係說明" }]
}
```

**六角座標**：`[q, r]` 的六個鄰居是 `[q+1, r]`、`[q-1, r]`、`[q, r+1]`、`[q, r-1]`、`[q+1, r-1]`、`[q-1, r+1]`。每座島的細項建議 1～6 個；人物（person）、旗子（flag）體積小，可以放到 8 個。

## 部署到 GitHub Pages

1. 把整個資料夾 push 到 GitHub repo 的 `main` 分支。
2. 到 repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，分支選 `main`，資料夾選 `/ (root)`。
3. 一兩分鐘後網址會是 `https://<帳號>.github.io/star-island/`。

所有路徑都用相對路徑（`./assets/...`），所以放在子路徑底下也能正常運作。

## 網址參數

- `#hq`：開啟時直接選取某座島
- `?quality=medium`／`?quality=low`：強制降低畫質（手機預設為 medium）
