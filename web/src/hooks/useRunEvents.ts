import { useEffect } from "react";
import { subscribeRun } from "../api/sse";

export function useRunEvents(id: string | null, onEvent: (type: string, data: unknown) => void): void {
  useEffect(() => {
    if (!id) return;
    return subscribeRun(id, onEvent);
  }, [id, onEvent]);
}
