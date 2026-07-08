import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";
import type { RunDetail } from "../api/types";

export function useRun(id: string | null): { detail: RunDetail | null; reload: () => void } {
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const reload = useCallback(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    api.getRun(id).then(setDetail).catch((error) => console.error("載入 run 失敗：", error));
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { detail, reload };
}
