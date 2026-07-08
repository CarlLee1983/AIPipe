import "../../test-setup";
import { expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { DialogBox } from "../../src/components/DialogBox";

test("DialogBox 顯示說話者、頭像與內容", () => {
  const view = render(
    <DialogBox speaker="公會主" portraitKey="npc-master">
      是否核可發佈？
    </DialogBox>,
  );
  const root = within(view.container);
  expect(root.getByText("公會主：")).toBeDefined();
  expect(root.getByAltText("公會主")).toBeDefined();
  expect(root.getByText("是否核可發佈？")).toBeDefined();
});

test("DialogBox typewriter 初始不顯示全文", () => {
  const view = render(
    <DialogBox speaker="公會主" portraitKey="npc-master" typewriter>
      你好勇者
    </DialogBox>,
  );
  const root = within(view.container);
  expect(root.queryByText("你好勇者")).toBeNull();
  expect(root.getByText("▼")).toBeDefined();
});
