import { useEffect, type ReactNode } from "react";

export function OverlayWindow({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div
        className="overlay-window ct-window"
        role="dialog"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="overlay-close" aria-label="關閉" onClick={onClose}>
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
