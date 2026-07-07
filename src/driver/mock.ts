import type { AgentDriver, DriverInput, DriverResult } from "./types";

export type MockResponse = {
  output: string;
  success?: boolean;
  raw?: unknown;
};

type Responder = MockResponse[] | ((input: DriverInput) => MockResponse);

export class MockDriver implements AgentDriver {
  readonly calls: DriverInput[] = [];
  private queue: MockResponse[] | null;
  private fn: ((input: DriverInput) => MockResponse) | null;

  constructor(responder: Responder) {
    if (Array.isArray(responder)) {
      this.queue = [...responder];
      this.fn = null;
    } else {
      this.queue = null;
      this.fn = responder;
    }
  }

  async run(input: DriverInput): Promise<DriverResult> {
    this.calls.push(input);
    const response = this.fn ? this.fn(input) : this.queue!.shift();
    if (!response) {
      throw new Error(`MockDriver：預錄回應已用盡（第 ${this.calls.length} 次呼叫）`);
    }
    return {
      output: response.output,
      success: response.success ?? true,
      raw: response.raw ?? { mock: true },
    };
  }
}
