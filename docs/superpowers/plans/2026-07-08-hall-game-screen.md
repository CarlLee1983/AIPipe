# 公會大廳「遊戲畫面化」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把公會大廳從「垂直堆疊、會捲動的網頁」改成「一台固定比例的遊戲機台」：letterbox 滿版、頁面永不捲動，大廳用底部指令列開選單、查任務詳情靠整頁轉場。

**Architecture:** 純前端（`web/`）。整個 app 是一台固定比例的 `.cabinet`，內部以 z-index 分層堆疊（場景背景→HUD→指令列→選單視窗／詳情畫面→對話框）。`Hall` 升級為畫面協調器，持有 `screen`（`"lobby" | "detail"`）與 `lobbyMenu`（`null | "board" | "new"`）兩個狀態。新增三個小元件（`CommandBar`、`OverlayWindow`、`QuestDetailScreen`），其餘元件沿用只換擺放位置。後端／API／SSE／引擎不動。

**Tech Stack:** React 18 + Vite、Bun、`@testing-library/react` + happy-dom（元件測試）、Playwright（E2E，強制走 MockDriver）。

## Global Constraints

- 執行環境是 **Bun**（非 Node）。前端指令在 `web/` 目錄下跑；型別檢查 `cd web && bunx tsc --noEmit`。
- 使用者可見字串、log、錯誤訊息一律**繁體中文**（沿用現有語氣）。
- **不可變**風格：以回傳新狀態推進，勿 mutate。
- **不新增第三方依賴**（不引入 react-router）。
- **不改**後端、`src/`、API、SSE、引擎、`web/src/api/*`、`web/src/hooks/*`。
- 元件測試檔頭一律 `import "../../test-setup";`，用 `bun:test` 的 `test`/`expect`，`@testing-library/react` 的 `render`/`within`（沿用現有測試寫法）。
- 動畫須尊重 `prefers-reduced-motion: reduce`。
- 機台比例以 CSS 變數 `--cabinet-ratio`（預設 `4 / 3`）集中控制。

---

## File Structure

**新增：**
- `web/src/components/CommandBar.tsx` — 大廳底部 JRPG 指令列，點指令回呼 `LobbyCommand`。
- `web/src/components/OverlayWindow.tsx` — 通用選單視窗殼（壓暗背景＋置中視窗＋關閉鈕＋Esc／點背景關閉）。
- `web/src/components/QuestDetailScreen.tsx` — 詳情畫面：返回鈕＋`QuestLog`（面板內遞捲）＋`CheckpointPrompt`/`DialogBox`。
- 對應測試：`web/tests/components/CommandBar.test.tsx`、`OverlayWindow.test.tsx`、`QuestDetailScreen.test.tsx`。

**修改：**
- `web/src/components/Scene.tsx` — 移除自帶的 `.cabinet` 外層，只保留 `.field` 背景層（`.cabinet` 改由 `Hall` 擁有）。
- `web/src/components/Hall.tsx` — 改為畫面狀態機，組裝分層。
- `web/src/theme/scene.css` — letterbox 機台、分層定位、移除失效的 `.hall-layout`/`.hall-sidebar` 規則。
- `web/src/theme/ct-window.css` — 新增 `command-bar`/`overlay-*`/`detail-*` 樣式、HUD 貼頂、詳情內 `QuestLog` 填滿。
- `web/tests/components/Hall.test.tsx` — 改為驗證畫面切換流程。
- `web/tests/e2e/quest-flow.e2e.ts` — 走「發任務指令→開視窗→發佈→轉場詳情→核可」新流程。

---

## Task 1: OverlayWindow 選單視窗殼

**Files:**
- Create: `web/src/components/OverlayWindow.tsx`
- Test: `web/tests/components/OverlayWindow.test.tsx`

**Interfaces:**
- Consumes: 無（葉元件）。
- Produces: `OverlayWindow({ title: string; onClose: () => void; children: ReactNode })` — 渲染 `.overlay-backdrop` > `.overlay-window.ct-window`；點背景或關閉鈕或按 Esc 皆呼叫 `onClose`；點視窗內容不關閉。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/OverlayWindow.test.tsx`:

```tsx
import "../../test-setup";
import { expect, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import { OverlayWindow } from "../../src/components/OverlayWindow";

test("點關閉鈕會呼叫 onClose", () => {
  let closed = 0;
  const view = render(
    <OverlayWindow title="任務佈告欄" onClose={() => { closed += 1; }}>
      <div>內容</div>
    </OverlayWindow>,
  );
  const root = within(view.container);
  fireEvent.click(root.getByLabelText("關閉"));
  expect(closed).toBe(1);
});

test("點背景會關閉，點視窗內容不會", () => {
  let closed = 0;
  const view = render(
    <OverlayWindow title="任務佈告欄" onClose={() => { closed += 1; }}>
      <button type="button">內容鈕</button>
    </OverlayWindow>,
  );
  const root = within(view.container);
  fireEvent.click(root.getByText("內容鈕"));
  expect(closed).toBe(0);
  fireEvent.click(view.container.querySelector(".overlay-backdrop")!);
  expect(closed).toBe(1);
});

test("按 Esc 會呼叫 onClose", () => {
  let closed = 0;
  render(
    <OverlayWindow title="任務佈告欄" onClose={() => { closed += 1; }}>
      <div>內容</div>
    </OverlayWindow>,
  );
  fireEvent.keyDown(window, { key: "Escape" });
  expect(closed).toBe(1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && bun test tests/components/OverlayWindow.test.tsx`
Expected: FAIL（`Cannot find module ...OverlayWindow`）。

- [ ] **Step 3: 寫最小實作**

Create `web/src/components/OverlayWindow.tsx`:

```tsx
import { useEffect, type ReactNode } from "react";

export function OverlayWindow({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="overlay-window ct-window"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="overlay-close" aria-label="關閉" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && bun test tests/components/OverlayWindow.test.tsx`
Expected: PASS（3 tests）。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/OverlayWindow.tsx web/tests/components/OverlayWindow.test.tsx
git commit -m "feat: [web] 新增 OverlayWindow 選單視窗殼（Esc／點背景關閉）"
```

---

## Task 2: CommandBar 底部指令列

**Files:**
- Create: `web/src/components/CommandBar.tsx`
- Test: `web/tests/components/CommandBar.test.tsx`

**Interfaces:**
- Consumes: 無。
- Produces: `type LobbyCommand = "board" | "new"`；`CommandBar({ onCommand: (command: LobbyCommand) => void })` — 渲染「任務板」「發任務」兩個指令鈕，點擊各以對應 key 呼叫 `onCommand`。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/CommandBar.test.tsx`:

```tsx
import "../../test-setup";
import { expect, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import { CommandBar } from "../../src/components/CommandBar";

test("點指令會以對應 key 呼叫 onCommand", () => {
  const calls: string[] = [];
  const view = render(<CommandBar onCommand={(command) => calls.push(command)} />);
  const root = within(view.container);
  fireEvent.click(root.getByRole("button", { name: "任務板" }));
  fireEvent.click(root.getByRole("button", { name: "發任務" }));
  expect(calls).toEqual(["board", "new"]);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && bun test tests/components/CommandBar.test.tsx`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫最小實作**

Create `web/src/components/CommandBar.tsx`:

```tsx
export type LobbyCommand = "board" | "new";

const COMMANDS: { key: LobbyCommand; label: string }[] = [
  { key: "board", label: "任務板" },
  { key: "new", label: "發任務" },
];

export function CommandBar({ onCommand }: { onCommand: (command: LobbyCommand) => void }) {
  return (
    <div className="command-bar ct-window">
      <span className="ct-cursor">▶</span>
      {COMMANDS.map((command) => (
        <button
          key={command.key}
          type="button"
          className="command-item"
          onClick={() => onCommand(command.key)}
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && bun test tests/components/CommandBar.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/CommandBar.tsx web/tests/components/CommandBar.test.tsx
git commit -m "feat: [web] 新增 CommandBar 大廳底部指令列"
```

---

## Task 3: QuestDetailScreen 詳情畫面

**Files:**
- Create: `web/src/components/QuestDetailScreen.tsx`
- Test: `web/tests/components/QuestDetailScreen.test.tsx`

**Interfaces:**
- Consumes: `QuestLog`（`{ steps }`）、`CheckpointPrompt`（`{ runId, checkpoint, onDecided, onApprove }`）、`DialogBox`（`{ speaker, portraitKey, typewriter, children }`）、型別 `RunDetail`。
- Produces: `QuestDetailScreen({ runId: string; detail: RunDetail; onBack: () => void; onDecided: () => void; onApprove: () => void })` — 有 pending checkpoint 時底部顯示 `CheckpointPrompt`，否則顯示 `DialogBox`（`dialogText(detail)`，開 typewriter）；左上「← 返回大廳」呼叫 `onBack`。`dialogText` 由本檔內部持有（自 `Hall.tsx` 搬入）。

- [ ] **Step 1: 寫失敗測試**

Create `web/tests/components/QuestDetailScreen.test.tsx`:

```tsx
import "../../test-setup";
import { expect, test } from "bun:test";
import { fireEvent, render, within } from "@testing-library/react";
import { QuestDetailScreen } from "../../src/components/QuestDetailScreen";
import type { RunDetail } from "../../src/api/types";

function makeDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run: {
      id: "run-1",
      workflowName: "demo",
      status: "paused",
      inputs: {},
      context: {},
      currentStageIndex: 1,
      createdAt: "2026-07-08T00:00:00Z",
      updatedAt: "2026-07-08T00:00:00Z",
    },
    steps: [
      {
        id: "s1",
        runId: "run-1",
        stageId: "調查",
        output: "找到線索",
        status: "completed",
        error: null,
        startedAt: "2026-07-08T00:00:00Z",
        endedAt: "2026-07-08T00:00:01Z",
      },
    ],
    checkpoints: [],
    ...overrides,
  };
}

test("有 pending checkpoint 時顯示提示與核可鈕，返回鈕呼叫 onBack", () => {
  let back = 0;
  const detail = makeDetail({
    checkpoints: [
      { id: "c1", runId: "run-1", stageId: "調查", prompt: "資料看起來 OK 嗎？", decision: "pending", note: null, decidedAt: null },
    ],
  });
  const view = render(
    <QuestDetailScreen
      runId="run-1"
      detail={detail}
      onBack={() => { back += 1; }}
      onDecided={() => {}}
      onApprove={() => {}}
    />,
  );
  const root = within(view.container);
  expect(root.getByText("冒險日誌")).toBeDefined();
  expect(root.getByText("資料看起來 OK 嗎？")).toBeDefined();
  expect(root.getByRole("button", { name: "▶ 核可" })).toBeDefined();
  fireEvent.click(root.getByRole("button", { name: "← 返回大廳" }));
  expect(back).toBe(1);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && bun test tests/components/QuestDetailScreen.test.tsx`
Expected: FAIL（找不到模組）。

- [ ] **Step 3: 寫最小實作**

Create `web/src/components/QuestDetailScreen.tsx`:

```tsx
import type { RunDetail } from "../api/types";
import { CheckpointPrompt } from "./CheckpointPrompt";
import { DialogBox } from "./DialogBox";
import { QuestLog } from "./QuestLog";

function dialogText(detail: RunDetail): string {
  const lastStep = detail.steps[detail.steps.length - 1];
  switch (detail.run.status) {
    case "completed":
      return "任務完成，做得好，勇者！";
    case "failed":
      return "唔……勇者倒下了，這趟任務失敗了。";
    case "rejected":
      return "這份委託被退回了。";
    default:
      return lastStep ? `勇者正在進行：${lastStep.stageId}……` : "勇者整裝待發。";
  }
}

export function QuestDetailScreen({ runId, detail, onBack, onDecided, onApprove }: {
  runId: string;
  detail: RunDetail;
  onBack: () => void;
  onDecided: () => void;
  onApprove: () => void;
}) {
  const pending = detail.checkpoints.find((checkpoint) => checkpoint.decision === "pending") ?? null;

  return (
    <div className="detail-screen">
      <button type="button" className="detail-back" onClick={onBack}>
        ← 返回大廳
      </button>
      <QuestLog steps={detail.steps} />
      {pending ? (
        <CheckpointPrompt
          runId={runId}
          checkpoint={pending}
          onDecided={onDecided}
          onApprove={onApprove}
        />
      ) : (
        <DialogBox speaker="公會主" portraitKey="npc-master" typewriter>
          {dialogText(detail)}
        </DialogBox>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && bun test tests/components/QuestDetailScreen.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/QuestDetailScreen.tsx web/tests/components/QuestDetailScreen.test.tsx
git commit -m "feat: [web] 新增 QuestDetailScreen 任務詳情畫面"
```

---

## Task 4: Scene 拆出 .cabinet 外層

**Files:**
- Modify: `web/src/components/Scene.tsx`

**Interfaces:**
- Consumes: `assetPath`（沿用）。
- Produces: `Scene({ children })` 改為只渲染 `.field` 背景層（含 `.scene-decor` 與 `.scene-characters`），**不再自帶 `.cabinet`**。`.cabinet` 改由 `Hall`（Task 5）擁有。

> 說明：此任務單獨看會讓 `Hall`（尚未改）暫時少一層 `.cabinet` 外框，畫面會亂；但 Task 5 緊接補上。兩者連續執行。此任務無獨立測試（純結構搬移，行為由既有 `Hall.test`/`smoke` 在 Task 5 後覆蓋）。

- [ ] **Step 1: 修改 Scene**

Replace `web/src/components/Scene.tsx` with:

```tsx
import type { ReactNode } from "react";
import { assetPath } from "../assets/assets.config";

export function Scene({ children }: { children: ReactNode }) {
  const bg = assetPath("scene-bg");
  return (
    <div
      className="field"
      style={bg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover" } : undefined}
    >
      {!bg && <div className="grove" />}
      <div className="scene-decor">
        <div className="scene-counter" />
        <div className="scene-banner scene-banner-left" />
        <div className="scene-banner scene-banner-right" />
        <div className="scene-light" />
        <div className="scene-dust scene-dust-1" />
        <div className="scene-dust scene-dust-2" />
        <div className="scene-dust scene-dust-3" />
        <div className="scene-dust scene-dust-4" />
        <div className="scene-dust scene-dust-5" />
      </div>
      <div className="scene-characters">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型別檢查**

Run: `cd web && bunx tsc --noEmit`
Expected: 無錯誤（此檔）。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Scene.tsx
git commit -m "refactor: [web] Scene 只保留場景背景層，.cabinet 交由 Hall 擁有"
```

---

## Task 5: Hall 畫面狀態機

**Files:**
- Modify: `web/src/components/Hall.tsx`
- Test: `web/tests/components/Hall.test.tsx`

**Interfaces:**
- Consumes: `Scene`、`Sprite`、`HudBar`、`CommandBar`（`LobbyCommand`）、`OverlayWindow`、`QuestMenu`、`NewQuestForm`、`QuestDetailScreen`、`useRun`、`useRunEvents`、`useSfx`、`api`。
- Produces: `Hall()` — 機台外框 `.hall-shell` > `.cabinet`，內含 `Scene`＋`HudBar`；`screen==="lobby"` 顯示 `CommandBar` 與（依 `lobbyMenu`）`OverlayWindow` 包 `QuestMenu`/`NewQuestForm`；`screen==="detail"` 顯示 `QuestDetailScreen`。選任務→轉詳情；返回→回大廳並保留 `selectedId`；發任務成功→轉該 run 詳情。

- [ ] **Step 1: 改寫 Hall.test（失敗測試）**

Replace `web/tests/components/Hall.test.tsx` with:

```tsx
import "../../test-setup";
import { afterEach, expect, test } from "bun:test";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { Hall } from "../../src/components/Hall";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

class FakeEventSource {
  addEventListener() {}
  close() {}
  constructor(public url: string) {}
}

function stubFetch() {
  (globalThis as { EventSource?: typeof FakeEventSource }).EventSource = FakeEventSource;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/workflows")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    if (url.includes("/runs")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: null }), { status: 200 });
  }) as typeof fetch;
}

test("大廳預設只見場景與指令列，不直接顯示任務佈告欄", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByText("勇者公會大廳")).toBeDefined());
  expect(root.getByAltText("NPC 公會主")).toBeDefined();
  expect(root.getByAltText("玩家角色")).toBeDefined();
  expect(root.getByRole("button", { name: "任務板" })).toBeDefined();
  expect(root.queryByText("任務佈告欄")).toBeNull();
});

test("點『任務板』開任務佈告欄視窗，關閉後消失", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByRole("button", { name: "任務板" })).toBeDefined());
  fireEvent.click(root.getByRole("button", { name: "任務板" }));
  expect(root.getByText("任務佈告欄")).toBeDefined();
  fireEvent.click(root.getByLabelText("關閉"));
  expect(root.queryByText("任務佈告欄")).toBeNull();
});

test("點『發任務』開發佈新任務視窗", async () => {
  stubFetch();
  const view = render(<Hall />);
  const root = within(view.container);
  await waitFor(() => expect(root.getByRole("button", { name: "發任務" })).toBeDefined());
  fireEvent.click(root.getByRole("button", { name: "發任務" }));
  expect(root.getByText("發佈新任務")).toBeDefined();
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `cd web && bun test tests/components/Hall.test.tsx`
Expected: FAIL（現有 Hall 直接顯示「任務佈告欄」、無「任務板」鈕）。

- [ ] **Step 3: 改寫 Hall**

Replace `web/src/components/Hall.tsx` with:

```tsx
import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { Run, WorkflowSummary } from "../api/types";
import { useRun } from "../hooks/useRun";
import { useRunEvents } from "../hooks/useRunEvents";
import { useSfx } from "../hooks/useSfx";
import { CommandBar, type LobbyCommand } from "./CommandBar";
import { HudBar } from "./HudBar";
import { NewQuestForm } from "./NewQuestForm";
import { OverlayWindow } from "./OverlayWindow";
import { QuestDetailScreen } from "./QuestDetailScreen";
import { QuestMenu } from "./QuestMenu";
import { Scene } from "./Scene";
import { Sprite } from "./Sprite";

type Screen = "lobby" | "detail";

export function Hall() {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("lobby");
  const [lobbyMenu, setLobbyMenu] = useState<LobbyCommand | null>(null);
  const { detail, reload } = useRun(selectedId);
  const { muted, toggle, play } = useSfx();

  const loadRuns = useCallback(() => {
    api.listRuns().then(setRuns).catch((error) => console.error("載入任務清單失敗：", error));
  }, []);

  useEffect(() => {
    api.listWorkflows().then(setWorkflows).catch((error) => console.error("載入 workflow 失敗：", error));
    loadRuns();
  }, [loadRuns]);

  const onEvent = useCallback((type: string) => {
    if (type === "run:done") play("sfx-complete");
    reload();
    loadRuns();
  }, [loadRuns, play, reload]);
  useRunEvents(selectedId, onEvent);

  const openQuest = useCallback((id: string) => {
    play("sfx-cursor");
    setSelectedId(id);
    setScreen("detail");
    setLobbyMenu(null);
  }, [play]);

  const openMenu = useCallback((command: LobbyCommand) => {
    play("sfx-cursor");
    setLobbyMenu(command);
  }, [play]);

  return (
    <div className="hall-shell">
      <div className="cabinet">
        <Scene>
          <Sprite assetKey="npc-master" label="NPC 公會主" className="sprite sprite-npc" />
          <Sprite assetKey="player" label="玩家角色" className="sprite sprite-player" />
        </Scene>

        <HudBar title="勇者公會大廳" muted={muted} onToggleSfx={toggle} />

        {screen === "lobby" && (
          <>
            <CommandBar onCommand={openMenu} />
            {lobbyMenu === "board" && (
              <OverlayWindow title="任務佈告欄" onClose={() => setLobbyMenu(null)}>
                <QuestMenu runs={runs} selectedId={selectedId} onSelect={openQuest} />
              </OverlayWindow>
            )}
            {lobbyMenu === "new" && (
              <OverlayWindow title="發佈新任務" onClose={() => setLobbyMenu(null)}>
                <NewQuestForm workflows={workflows} onCreated={(id) => { loadRuns(); openQuest(id); }} />
              </OverlayWindow>
            )}
          </>
        )}

        {screen === "detail" && selectedId && detail && (
          <QuestDetailScreen
            runId={selectedId}
            detail={detail}
            onBack={() => setScreen("lobby")}
            onDecided={() => { reload(); loadRuns(); }}
            onApprove={() => play("sfx-confirm")}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `cd web && bun test tests/components/Hall.test.tsx`
Expected: PASS（3 tests）。

- [ ] **Step 5: 全前端測試與型別**

Run: `cd web && bun test && bunx tsc --noEmit`
Expected: 全數 PASS、無型別錯誤（`smoke.test.tsx` 的「App 渲染大廳」仍靠 HUD 標題通過）。

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Hall.tsx web/tests/components/Hall.test.tsx
git commit -m "feat: [web] Hall 改為畫面狀態機（大廳指令列＋選單視窗＋詳情轉場）"
```

---

## Task 6: Letterbox 機台與分層樣式

**Files:**
- Modify: `web/src/theme/scene.css`
- Modify: `web/src/theme/ct-window.css`

**Interfaces:**
- Consumes: Task 1–5 產生的 class（`.cabinet`、`.field`、`.command-bar`、`.command-item`、`.overlay-backdrop`、`.overlay-window`、`.overlay-close`、`.detail-screen`、`.detail-back`、`.hud-bar`、`.quest-log`、`.quest-log-list`）。
- Produces: 純樣式；機台 letterbox 填滿視窗、頁面不捲；HUD 貼頂、指令列貼底、選單/詳情分層疊放；詳情內 `QuestLog` 填滿並面板內遞捲；動畫尊重 reduced-motion。

- [ ] **Step 1: 改 `scene.css` 的機台外框與分層**

在 `web/src/theme/scene.css`：

將 `.cabinet` 規則（第 1–15 行）替換為：

```css
.cabinet {
  --cabinet-ratio: 4 / 3;
  font-family: ui-monospace, "Courier New", monospace;
  border: 4px solid #000;
  border-radius: 6px;
  overflow: hidden;
  position: relative;
  aspect-ratio: var(--cabinet-ratio);
  height: min(100vh, calc(100vw * 3 / 4));
  max-height: 100vh;
  max-width: 100vw;
  image-rendering: pixelated;
  box-shadow: inset 0 0 0 2px #e6d9b0;
  /* 角色高度以場景為基準；前中後景差距約 15–25%，避免尺寸斷層 */
  --char-h-front: 34%;
  --char-h-mid: 31%;
  --char-h-back: 27%;
}
```

將 `.hall-shell` 規則（原 grid 版）替換為 letterbox 框：

```css
.hall-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: radial-gradient(120% 80% at 50% 0%, var(--bg-dark-2), var(--bg-dark) 70%);
}
```

刪除已失效的 `.hall-layout` 與 `.hall-sidebar` 規則（JSX 已不再使用）。

將底部 `@media (max-width: 980px)` 內的 `.hall-layout { grid-template-columns: 1fr; }` 一段刪除（該 class 已移除）；同 media 內 `.cabinet { min-height: 460px; }` 改為留空或刪除（機台改為 viewport 自適應，不再需要 min-height）。`@media (max-width: 640px)` 內 `.hall-shell` 的 `width/padding` 覆寫刪除（新 `.hall-shell` 為滿版 flex），保留該 media 內 `.cabinet` 的 `--char-h-*` 覆寫。

- [ ] **Step 2: 在 `ct-window.css` 新增分層樣式**

在 `web/src/theme/ct-window.css` 末端新增：

```css
/* --- 遊戲畫面分層（大廳/詳情） --- */
.hud-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  border-radius: 0;
  background: linear-gradient(180deg, rgba(11, 26, 74, 0.92), rgba(34, 70, 173, 0.82));
}

.command-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 20px;
  border-radius: 0;
}

.command-item {
  background: none;
  border: 0;
  color: inherit;
  font: inherit;
  font-size: 15px;
  cursor: pointer;
  text-shadow: 1px 1px 0 var(--ct-edge);
}

.command-item:hover {
  color: #bff4ff;
}

.overlay-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(4, 8, 20, 0.55);
}

.overlay-window {
  position: relative;
  width: min(78%, 420px);
  max-height: 80%;
  overflow-y: auto;
  animation: screen-in 200ms ease-out;
}

.overlay-close {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: 0;
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.detail-screen {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  padding-top: 64px;
  overflow: hidden;
  background: rgba(6, 10, 26, 0.82);
  animation: screen-in 200ms ease-out;
}

.detail-back {
  align-self: flex-start;
  background: none;
  border: 0;
  color: #bff4ff;
  font: inherit;
  cursor: pointer;
  text-shadow: 1px 1px 0 var(--ct-edge);
}

.detail-screen .quest-log {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.detail-screen .quest-log-list {
  flex: 1;
  max-height: none;
}

@keyframes screen-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .overlay-window,
  .detail-screen {
    animation: none;
  }
}
```

- [ ] **Step 3: 建置驗證（樣式無法單元測；以 build 確保無語法錯誤）**

Run: `cd web && bun run build`
Expected: `tsc && vite build` 成功產出 `web/dist`，無錯誤。

- [ ] **Step 4: 人工目視驗證（開發伺服器）**

Run（另開終端，於 repo 根）：`AIPIPE_MOCK=1 bun run server` 與 `bun run dev:web`，瀏覽 `http://localhost:5173`。
Expected：
- 畫面是一台置中、四周留黑邊的機台；縮放視窗機台等比縮放、**頁面不出現捲軸**。
- HUD 貼機台頂緣、指令列貼底。點「任務板」/「發任務」跳出置中視窗，Esc／點暗背景可關。
- 發一個任務後自動進詳情畫面；冒險日誌很長時**在面板內捲動**、機台與頁面不動；左上「← 返回大廳」可回大廳。

- [ ] **Step 5: Commit**

```bash
git add web/src/theme/scene.css web/src/theme/ct-window.css
git commit -m "style: [web] letterbox 機台與遊戲畫面分層（HUD 貼頂／指令列貼底／詳情轉場）"
```

---

## Task 7: E2E journey 更新

**Files:**
- Modify: `web/tests/e2e/quest-flow.e2e.ts`

**Interfaces:**
- Consumes: 新版大廳（發任務為指令→視窗）。
- Produces: 反映「發任務指令→開視窗→發佈→自動轉場詳情→核可→完成」的 E2E。

- [ ] **Step 1: 更新 E2E journey**

Replace `web/tests/e2e/quest-flow.e2e.ts` with:

```ts
import { expect, test } from "@playwright/test";

test("發任務、命中檢查點、核可後完成", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("勇者公會大廳")).toBeVisible();

  await page.getByRole("button", { name: "發任務" }).click();
  await page.getByRole("combobox").selectOption("e2e-demo");
  await page.getByLabel("topic").fill("Bun 入門");
  await page.getByRole("button", { name: "發佈任務" }).click();

  await expect(page.getByText("資料看起來 OK 嗎？")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "▶ 核可" }).click();
  await expect(page.getByText("任務完成，做得好，勇者！")).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 2: 跑 E2E 確認通過**

Run: `cd web && bun run e2e`
Expected: 1 passed（會先 build 並自動起後端＋MockDriver）。

- [ ] **Step 3: Commit**

```bash
git add web/tests/e2e/quest-flow.e2e.ts
git commit -m "test: [web] E2E 走發任務指令→視窗→詳情轉場新流程"
```

---

## Self-Review

**Spec coverage：**
- 混合導覽（大廳為家、細節轉場）→ Task 5（`screen` 狀態機、`openQuest`/`onBack`）。
- letterbox 固定機台比例 → Task 6（`.hall-shell` flex 置中、`.cabinet` aspect-ratio＋viewport 尺寸、`--cabinet-ratio`）。
- 面板內部遞捲 → Task 6（`.detail-screen .quest-log-list { flex:1; max-height:none }` 搭配既有 `overflow-y:auto`）。
- 底部指令列開選單 → Task 2（`CommandBar`）＋ Task 1（`OverlayWindow`）＋ Task 5 組裝。
- 三新增元件 `CommandBar`/`OverlayWindow`/`QuestDetailScreen` → Task 1/2/3。
- 沿用元件換位置（`QuestMenu`/`NewQuestForm`/`QuestLog`/`DialogBox`/`CheckpointPrompt`/`HudBar`）→ Task 5/6。
- 轉場動畫＋reduced-motion → Task 6（`screen-in`＋media query）。
- 音效沿用（cursor/confirm/complete）→ Task 5（`openQuest`/`openMenu` 播 `sfx-cursor`、`onApprove` 播 `sfx-confirm`、`run:done` 播 `sfx-complete`）。
- 測試（Hall 切換、QuestLog 遞捲、E2E）→ Task 5（Hall.test）、Task 6（遞捲以 build＋目視）、Task 7（E2E）。
- 不改後端／不加依賴 → 全程僅動 `web/src`、`web/tests`。

**Placeholder scan：** 無 TBD/TODO；每個程式步驟均附完整程式碼與明確指令、預期輸出。

**Type consistency：** `LobbyCommand`（Task 2 定義，Task 5 引用一致）；`OverlayWindow` props（`title`/`onClose`/`children`，Task 1↔5 一致）；`QuestDetailScreen` props（`runId`/`detail`/`onBack`/`onDecided`/`onApprove`，Task 3↔5 一致）；`Scene` 移除 `.cabinet` 後由 Task 5 的 `.cabinet` 補上，class 對應一致。

> 註：Task 4（Scene 拆 `.cabinet`）與 Task 5（Hall 補 `.cabinet`）之間，單獨看 Task 4 會短暫缺一層外框；務必連續執行 4→5，勿在 4 後停留驗收畫面。
