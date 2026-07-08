export type LobbyCommand = "board" | "new";

const COMMANDS: { key: LobbyCommand; label: string }[] = [
  { key: "board", label: "任務板" },
  { key: "new", label: "發任務" },
];

export function CommandBar({ onCommand }: { onCommand: (command: LobbyCommand) => void }) {
  return (
    <div className="command-bar ct-window">
      <span className="ct-cursor">▶</span>
      {COMMANDS.map((command) => (
        <button
          key={command.key}
          type="button"
          className="command-item"
          onClick={() => onCommand(command.key)}
        >
          {command.label}
        </button>
      ))}
    </div>
  );
}
