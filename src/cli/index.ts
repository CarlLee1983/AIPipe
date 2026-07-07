import { parseArgs } from "node:util";
import { buildDeps } from "./deps";
import { parseInputPairs } from "./inputs";
import { runCommand } from "./commands/run";
import { listCommand } from "./commands/list";
import { showCommand } from "./commands/show";
import { approveCommand } from "./commands/approve";
import { rejectCommand } from "./commands/reject";

const USAGE = `用法：
  aipipe run <workflow.yaml> --input k=v [--input k=v ...]
  aipipe list
  aipipe show <runId>
  aipipe approve <runId> [--note "..."]
  aipipe reject <runId> [--note "..."]`;

export async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      input: { type: "string", multiple: true },
      note: { type: "string" },
    },
  });
  const [command, target] = positionals;
  const deps = buildDeps();

  switch (command) {
    case "run": {
      if (!target) throw new Error("run 需要 <workflow.yaml>");
      const inputs = parseInputPairs((values.input as string[]) ?? []);
      console.log(await runCommand(deps, { file: target, inputs }));
      break;
    }
    case "list":
      console.log(listCommand(deps));
      break;
    case "show":
      if (!target) throw new Error("show 需要 <runId>");
      console.log(showCommand(deps, { runId: target }));
      break;
    case "approve":
      if (!target) throw new Error("approve 需要 <runId>");
      console.log(await approveCommand(deps, { runId: target, note: values.note as string | undefined }));
      break;
    case "reject":
      if (!target) throw new Error("reject 需要 <runId>");
      console.log(await rejectCommand(deps, { runId: target, note: values.note as string | undefined }));
      break;
    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

if (import.meta.main) {
  main(Bun.argv.slice(2)).catch((err) => {
    console.error(`錯誤：${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
