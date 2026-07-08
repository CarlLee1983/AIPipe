import "../../test-setup";
import { beforeEach, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useSfx } from "../../src/hooks/useSfx";

const MUTE_KEY = "aipipe-sfx-muted";

let audioCount: number;

// 攔截 new Audio()，避免測試中真的載入/播放音效並記錄呼叫次數
class FakeAudio {
  volume = 1;
  constructor(public src: string) {
    audioCount += 1;
  }
  play() {
    return Promise.resolve();
  }
}

beforeEach(() => {
  localStorage.clear();
  audioCount = 0;
  (globalThis as unknown as { Audio: typeof FakeAudio }).Audio = FakeAudio;
});

test("預設未靜音（localStorage 空）", () => {
  const { result } = renderHook(() => useSfx());
  expect(result.current.muted).toBe(false);
});

test("localStorage 記錄靜音時，初始即為 muted", () => {
  localStorage.setItem(MUTE_KEY, "1");
  const { result } = renderHook(() => useSfx());
  expect(result.current.muted).toBe(true);
});

test("toggle 由未靜音切到靜音並寫入 localStorage", () => {
  const { result } = renderHook(() => useSfx());

  act(() => result.current.toggle());

  expect(result.current.muted).toBe(true);
  expect(localStorage.getItem(MUTE_KEY)).toBe("1");
});

test("toggle 再切回未靜音並更新 localStorage", () => {
  localStorage.setItem(MUTE_KEY, "1");
  const { result } = renderHook(() => useSfx());

  act(() => result.current.toggle());

  expect(result.current.muted).toBe(false);
  expect(localStorage.getItem(MUTE_KEY)).toBe("0");
});

test("play 不丟例外；sfx 素材尚未接入（路徑為 null）時不建立 Audio", () => {
  const { result } = renderHook(() => useSfx());

  expect(() => act(() => result.current.play("sfx-confirm"))).not.toThrow();
  expect(audioCount).toBe(0);
});

test("靜音時 play 直接返回，不建立 Audio", () => {
  localStorage.setItem(MUTE_KEY, "1");
  const { result } = renderHook(() => useSfx());

  act(() => result.current.play("sfx-cursor"));

  expect(audioCount).toBe(0);
});
