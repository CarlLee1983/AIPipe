import { loadWorkflowFromString } from "../../schema/parse";
import { createRun, prepareResume, type EngineDeps } from "../../engine/runner";
import { startInBackground, resumeInBackground } from "../background";
import { CreateRunSchema, ResumeRunSchema, validateBody } from "../validation";
import type { WorkflowCatalog } from "../workflows";
import type { EventBus } from "../events/bus";

function json(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function createRunHandler(
  req: Request,
  deps: EngineDeps,
  catalog: WorkflowCatalog,
  bus: EventBus,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const val = validateBody(CreateRunSchema, body);
  if (!val.success) {
    return json({ error: val.error }, 400);
  }

  const summary = await catalog.get(val.data.workflow);
  if (!summary) {
    return json({ error: `Workflow "${val.data.workflow}" 不存在` }, 404);
  }

  let workflow;
  try {
    workflow = loadWorkflowFromString(summary.rawYaml).workflow;
  } catch (err) {
    return json({ error: `Workflow 解析失敗：${err instanceof Error ? err.message : String(err)}` }, 500);
  }

  let run;
  try {
    run = createRun(deps, workflow, val.data.inputs, summary.rawYaml);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }

  startInBackground(deps, bus, run, workflow);

  return json({ runId: run.id, status: "running", workflow: workflow.name }, 201);
}

export async function resumeRunHandler(
  req: Request,
  deps: EngineDeps,
  catalog: WorkflowCatalog,
  bus: EventBus,
  runId: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const val = validateBody(ResumeRunSchema, body);
  if (!val.success) {
    return json({ error: val.error }, 400);
  }

  const run = deps.runs.get(runId);
  if (!run) {
    return json({ error: `Run "${runId}" 不存在` }, 404);
  }

  if (run.status !== "paused") {
    return json({ error: `Run 狀態為 "${run.status}"，僅能對 "paused" 狀態執行審批` }, 409);
  }

  let prep;
  try {
    prep = prepareResume(deps, runId, { approve: val.data.approve, note: val.data.note });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }

  if (prep.resume && !prep.workflow) {
    const summary = await catalog.get(prep.run.workflowName);
    if (summary) {
      prep.workflow = loadWorkflowFromString(summary.rawYaml).workflow;
    }
  }

  resumeInBackground(deps, bus, prep);

  return json({ runId, status: prep.resume ? "running" : "failed" });
}

export async function getRunHandler(
  _req: Request,
  deps: EngineDeps,
  runId: string,
): Promise<Response> {
  const run = deps.runs.get(runId);
  if (!run) {
    return json({ error: `Run "${runId}" 不存在` }, 404);
  }

  const steps = deps.steps.listByRun(runId);
  const checkpoint = deps.checkpoints.getLatestByRun(runId);

  return json({
    ...run,
    stepCount: steps.length,
    checkpoint: checkpoint ?? null,
  });
}
