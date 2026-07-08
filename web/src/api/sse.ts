const EVENT_TYPES = [
  "snapshot",
  "stage:start",
  "stage:done",
  "checkpoint",
  "run:checkpoint",
  "run:done",
  "run:completed",
  "run:failed",
  "run:rejected",
  "ping",
];

export function subscribeRun(
  id: string,
  onEvent: (type: string, data: unknown) => void,
): () => void {
  if ("EventSource" in globalThis) {
    const es = new EventSource(`/api/events/${encodeURIComponent(id)}`);
    for (const type of EVENT_TYPES) {
      es.addEventListener(type, (event) => {
        const message = event as MessageEvent;
        onEvent(type, message.data ? JSON.parse(message.data) : {});
      });
    }
    return () => es.close();
  }

  const controller = new AbortController();
  void fetch(`/api/runs/${encodeURIComponent(id)}/events`, { signal: controller.signal })
    .then(async (res) => {
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const event = JSON.parse(dataLine.slice(6));
          onEvent(event.type, event.data);
        }
      }
    })
    .catch(() => {});
  return () => controller.abort();
}
