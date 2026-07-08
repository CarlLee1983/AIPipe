import { useCallback, useState } from "react";
import { assetPath, type AssetKey } from "../assets/assets.config";

const MUTE_KEY = "aipipe-sfx-muted";
type SfxKey = Extract<AssetKey, "sfx-cursor" | "sfx-confirm" | "sfx-complete">;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useSfx() {
  const [muted, setMuted] = useState(readMuted);

  const toggle = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const play = useCallback((key: SfxKey) => {
    if (readMuted()) return;
    const src = assetPath(key);
    if (!src) return;
    const audio = new Audio(src);
    audio.volume = 0.5;
    void audio.play().catch(() => {
      /* 缺檔或瀏覽器阻擋 autoplay 時靜默 */
    });
  }, []);

  return { muted, toggle, play };
}
