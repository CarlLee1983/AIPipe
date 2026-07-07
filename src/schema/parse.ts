import { parse as parseYaml } from "yaml";
import { WorkflowSchema, type Workflow } from "./workflow";

export interface LoadResult {
  workflow: Workflow;
  warnings: string[];
}

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function extractVars(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(VAR_RE)) names.push(m[1]);
  return names;
}

export function loadWorkflowFromString(text: string): LoadResult {
  const raw = parseYaml(text); // YAML 語法錯誤在此擲出
  const workflow = WorkflowSchema.parse(raw); // zod 驗證，失敗擲出

  // 跨欄位致命檢查：stage id 唯一
  const seenIds = new Set<string>();
  for (const stage of workflow.stages) {
    if (seenIds.has(stage.id)) {
      throw new Error(`workflow "${workflow.name}"：stage id "${stage.id}" 重複`);
    }
    seenIds.add(stage.id);
  }

  // output 不得重複、不得與 input 名衝突
  const inputNames = new Set(workflow.inputs.map((i) => i.name));
  const seenOutputs = new Set<string>();
  for (const stage of workflow.stages) {
    if (!stage.output) continue;
    if (inputNames.has(stage.output)) {
      throw new Error(`workflow "${workflow.name}"：output "${stage.output}" 與 input 名 衝突`);
    }
    if (seenOutputs.has(stage.output)) {
      throw new Error(`workflow "${workflow.name}"：output "${stage.output}" 重複`);
    }
    seenOutputs.add(stage.output);
  }

  // 未定義變數 → 警告（非致命）。逐階段累積可用變數（inputs + 先前 outputs）。
  const warnings: string[] = [];
  const available = new Set(inputNames);
  for (const stage of workflow.stages) {
    const referenced = [
      ...extractVars(stage.agent.prompt),
      ...(stage.checkpoint ? extractVars(stage.checkpoint.prompt) : []),
    ];
    for (const name of referenced) {
      if (!available.has(name)) {
        warnings.push(`stage "${stage.id}" 引用未定義變數 {{${name}}}`);
      }
    }
    if (stage.output) available.add(stage.output);
  }

  return { workflow, warnings };
}

export async function loadWorkflowFile(path: string): Promise<LoadResult> {
  const text = await Bun.file(path).text();
  return loadWorkflowFromString(text);
}
