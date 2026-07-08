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
