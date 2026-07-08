import { ClaudeCodeDriver } from "./claude-code";
import type { AgentDriver } from "./types";

export type Driver = AgentDriver;
export type { AgentDriver, DriverInput, DriverResult } from "./types";
export { ClaudeCodeDriver, buildClaudeArgs, parseClaudeJson } from "./claude-code";
export { MockDriver } from "./mock";

export function createDriver(): Driver {
  return new ClaudeCodeDriver();
}
