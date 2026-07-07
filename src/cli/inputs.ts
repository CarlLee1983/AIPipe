export function parseInputPairs(pairs: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 0) throw new Error(`--input 格式錯誤（需 k=v）：${pair}`);
    const key = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    if (!key) throw new Error(`--input 缺少變數名：${pair}`);
    out[key] = value;
  }
  return out;
}
