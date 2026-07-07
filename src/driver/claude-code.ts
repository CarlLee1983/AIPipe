import type { AgentDriver, DriverInput, DriverResult } from "./types";

export function buildClaudeArgs(input: DriverInput, command = "claude"): string[] {
  const args = [command, "-p", input.prompt, "--output-format", "json"];
  if (input.allowedTools?.length) {
    args.push("--allowedTools", input.allowedTools.join(","));
  }
  if (input.model) {
    args.push("--model", input.model);
  }
  return args;
}

export function parseClaudeJson(stdout: string): { output: string; raw: unknown } {
  const parsed = JSON.parse(stdout) as { result?: unknown };
  const output = typeof parsed.result === "string" ? parsed.result : "";
  return { output, raw: parsed };
}

export type ProcRunner = (
  args: string[],
  cwd?: string,
) => Promise<{ stdout: string; exitCode: number }>;

const defaultProcRunner: ProcRunner = async (args, cwd) => {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, exitCode] = await Promise.all([proc.stdout.text(), proc.exited]);
  return { stdout, exitCode };
};

export class ClaudeCodeDriver implements AgentDriver {
  private command: string;
  private runner: ProcRunner;

  constructor(opts: { command?: string; run?: ProcRunner } = {}) {
    this.command = opts.command ?? "claude";
    this.runner = opts.run ?? defaultProcRunner;
  }

  async run(input: DriverInput): Promise<DriverResult> {
    const args = buildClaudeArgs(input, this.command);
    try {
      const { stdout, exitCode } = await this.runner(args, input.cwd);
      if (exitCode !== 0) {
        return { output: "", success: false, raw: { exitCode, stdout } };
      }
      const { output, raw } = parseClaudeJson(stdout);
      const isError = (raw as { is_error?: boolean }).is_error === true;
      return { output, success: !isError, raw };
    } catch (err) {
      return { output: "", success: false, raw: { error: String(err) } };
    }
  }
}
