# 啟動勇者大廳

## 開發模式

後端 API 預設跑在 `:3000`：

```bash
bun run server
```

前端 Vite dev server 跑在 `:5173`，並把 `/api` proxy 到後端：

```bash
cd web
bun run dev
```

瀏覽器開 `http://localhost:5173`。

若只想測流程、不呼叫真實 Claude driver：

```bash
AIPIPE_MOCK=1 bun run server
```

## 單一行程

```bash
cd web && bun run build
AIPIPE_STATIC=./web/dist bun run server
```

瀏覽器開 `http://localhost:3000`。

## 測試

```bash
bun test
cd web && bun run build
cd web && bun run e2e
```
