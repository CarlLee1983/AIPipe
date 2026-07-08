import { join } from "node:path";
import { createRun, prepareResume, type EngineDeps } from "../engine/runner";
import { loadWorkflowFromString } from "../schema/parse";
import { resumeInBackground, startInBackground } from "./background";
import type { EventBus } from "./events/bus";
import { listWorkflows } from "./workflows";
import { parseCreateRunBody, parseDecisionBody, ValidationError } from "./validation";

export interface ApiResult {
  status: number;
  body: { success: boolean; data?: unknown; error?: string };
}

const ok = (data: unknown, status = 200): ApiResult => ({ status, body: { success: true, data } });
const err = (status: number, message: string): ApiResult => ({ status, body: { success: false, error: message } });

export async function listWorkflowsHandler(dir: string): Promise<ApiResult> {
  return ok(await listWorkflows(dir));
}

export async function createRunHandler(
  deps: EngineDeps,
  bus: EventBus,
  dir: string,
  rawBody: unknown,
): Promise<ApiResult> {
  let body;
  try {
    body = parseCreateRunBody(rawBody);
  } catch (error) {
    if (error instanceof ValidationError) return err(400, error.message);
    throw error;
  }

  let text: string;
  try {
    text = await Bun.file(join(dir, `${body.workflow}.yaml`)).text();
  } catch {
    try {
      text = await Bun.file(join(dir, `${body.workflow}.yml`)).text();
    } catch {
      return err(404, `找不到 workflow：${body.workflow}`);
    }
  }

  try {
    const { workflow } = loadWorkflowFromString(text);
    const run = createRun(deps, workflow, body.inputs, text);
    startInBackground(deps, bus, run, workflow);
    return ok({ runId: run.id, status: run.status }, 201);
  } catch (error) {
    return err(400, error instanceof Error ? error.message : String(error));
  }
}

export function listRunsHandler(deps: EngineDeps): ApiResult {
  return ok(deps.runs.list());
}

export function getRunHandler(deps: EngineDeps, id: string): ApiResult {
  const run = deps.runs.get(id);
  if (!run) return err(404, `找不到 run：${id}`);
  return ok({ run, steps: deps.steps.listByRun(id), checkpoints: deps.checkpoints.listByRun(id) });
}

export function decisionHandler(
  deps: EngineDeps,
  bus: EventBus,
  id: string,
  approve: boolean,
  rawBody: unknown,
): ApiResult {
  let body;
  try {
    body = parseDecisionBody(rawBody);
  } catch (error) {
    if (error instanceof ValidationError) return err(400, error.message);
    throw error;
  }

  try {
    const prep = prepareResume(deps, id, { approve, note: body.note });
    resumeInBackground(deps, bus, prep);
    return ok(prep.run);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("找不到")) return err(404, message);
    return err(409, message);
  }
}
