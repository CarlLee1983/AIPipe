import "../../test-setup";
import { expect, test } from "bun:test";
import { render, within } from "@testing-library/react";
import { DialogBox } from "../../src/components/DialogBox";

test("DialogBox 顯示說話者與內容", () => {
  const view = render(<DialogBox speaker="公會主">是否核可發佈？</DialogBox>);
  const root = within(view.container);
  expect(root.getByText("公會主：")).toBeDefined();
  expect(root.getByText("是否核可發佈？")).toBeDefined();
});
