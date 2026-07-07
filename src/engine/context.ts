import type { Workflow } from "../schema/workflow";

export type Context = Record<string, string>;

export interface InterpolateResult {
  text: string;
  missing: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function interpolate(template: string, context: Context): InterpolateResult {
  const missing: string[] = [];
  const text = template.replace(VAR_RE, (_full, name: string) => {
    if (name in context) return context[name];
    missing.push(name);
    return "";
  });
  return { text, missing };
}

export function withOutput(context: Context, name: string, value: string): Context {
  return { ...context, [name]: value };
}

export function resolveInputs(
  workflow: Workflow,
  provided: Record<string, string>,
): Context {
  const ctx: Context = {};
  for (const input of workflow.inputs) {
    if (input.name in provided) {
      ctx[input.name] = provided[input.name];
    } else if (input.default !== undefined) {
      ctx[input.name] = input.default;
    } else if (input.required) {
      throw new Error(`缺少必填 input：${input.name}`);
    }
  }
  return ctx;
}
