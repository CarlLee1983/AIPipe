export interface DriverInput {
  prompt: string;
  allowedTools?: string[];
  model?: string;
  cwd?: string;
}

export interface DriverResult {
  output: string;
  success: boolean;
  raw: unknown;
}

export interface AgentDriver {
  run(input: DriverInput): Promise<DriverResult>;
}
