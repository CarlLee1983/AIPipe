import { useEffect, useState } from "react";

export function useTypewriter(text: string, enabled: boolean, msPerChar = 30): string {
  const [displayed, setDisplayed] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      return;
    }
    setDisplayed("");
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index >= text.length) clearInterval(timer);
    }, msPerChar);
    return () => clearInterval(timer);
  }, [text, enabled, msPerChar]);

  return displayed;
}
