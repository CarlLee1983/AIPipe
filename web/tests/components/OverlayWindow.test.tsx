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
