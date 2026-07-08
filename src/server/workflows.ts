import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadWorkflowFromString } from "../schema/parse";
import type { InputDef as WorkflowInput } from "../schema/workflow";

export type { WorkflowInput };

export interface WorkflowSummary {
  name: string;
  description?: string;
  inputs: WorkflowInput[];
  stageCount: number;
  rawYaml: string;
  sourcePath?: string;
}

export class WorkflowCatalog {
  constructor(private dirPath: string = "workflows") {}

  async list(): Promise<WorkflowSummary[]> {
    let files: string[];
    try {
      files = await readdir(this.dirPath);
    } catch {
      return [];
    }

    const summaries: WorkflowSummary[] = [];
    for (const file of files) {
      if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
      const fullPath = join(this.dirPath, file);
      try {
        const rawYaml = await readFile(fullPath, "utf-8");
        const { workflow } = loadWorkflowFromString(rawYaml);
        summaries.push({
          name: workflow.name,
          description: workflow.description,
          inputs: workflow.inputs,
          stageCount: workflow.stages.length,
          rawYaml,
          sourcePath: fullPath,
        });
      } catch (err) {
        console.warn(`[WorkflowCatalog] 載入失敗跳過 "${file}"：`, err instanceof Error ? err.message : err);
      }
    }

    summaries.sort((a, b) => a.name.localeCompare(b.name));
    return summaries;
  }

  async get(name: string): Promise<WorkflowSummary | null> {
    const all = await this.list();
    return all.find((w) => w.name === name) ?? null;
  }
}

export async function listWorkflows(dir: string): Promise<Array<{
  name: string;
  description?: string;
  inputs: { name: string; required: boolean; default?: string }[];
  file: string;
}>> {
  const catalog = new WorkflowCatalog(dir);
  const summaries = await catalog.list();
  return summaries.map((summary) => ({
    name: summary.name,
    description: summary.description,
    inputs: summary.inputs.map((input) => ({
      name: input.name,
      required: input.required,
      default: input.default,
    })),
    file: summary.sourcePath ? summary.sourcePath.split("/").at(-1)! : `${summary.name}.yaml`,
  }));
}
