import "../../test-setup";
import { expect, test } from "bun:test";
import { renderHook, waitFor } from "@testing-library/react";
import { useTypewriter } from "../../src/hooks/useTypewriter";

test("useTypewriter disabled 時立即顯示全文", () => {
  const { result } = renderHook(() => useTypewriter("你好", false));
  expect(result.current).toBe("你好");
});

test("useTypewriter enabled 時逐字顯示", async () => {
  const { result } = renderHook(() => useTypewriter("abc", true, 10));
  expect(result.current).toBe("");
  await waitFor(() => expect(result.current.length).toBeGreaterThan(0));
  await waitFor(() => expect(result.current).toBe("abc"), { timeout: 2000 });
});
