import { serve, type Server } from "bun";
import { openDb } from "../store/db";
import { RunRepository } from "../store/runs";
import { StepRepository } from "../store/steps";
import { CheckpointRepository } from "../store/checkpoints";
import { createDriver, type Driver } from "../driver";
import { EventBus } from "./events/bus";
import { WorkflowCatalog } from "./workflows";
import { createRunHandler, resumeRunHandler, getRunHandler, listRunsHandler } from "./routes/runs";
import { sseHandler } from "./sse";
import type { EngineDeps } from "../engine/runner";

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  workflowsDir?: string;
  driver?: Driver;
}

export function startServer(options: ServerOptions = {}) {
  const db = openDb(options.dbPath ?? "aipipe.db");
  const deps: EngineDeps = {
    runs: new RunRepository(db),
    steps: new StepRepository(db),
    checkpoints: new CheckpointRepository(db),
    driver: options.driver ?? createDriver(),
  };
  const catalog = new WorkflowCatalog(options.workflowsDir ?? "workflows");
  const bus = new EventBus();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  function withCors(res: Response): Response {
    for (const [k, v] of Object.entries(corsHeaders)) {
      res.headers.set(k, v);
    }
    return res;
  }

  const server: Server = serve({
    port: options.port ?? 3000,
    async fetch(req: Request): Promise<Response> {
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(req.url);
      const path = url.pathname;

      try {
        if (req.method === "POST" && path === "/api/runs") {
          return withCors(await createRunHandler(req, deps, catalog, bus));
        }
        if (req.method === "GET" && path === "/api/runs") {
          return withCors(await listRunsHandler(req, deps));
        }

        const runMatch = path.match(/^\/api\/runs\/([^\/]+)$/);
        if (req.method === "GET" && runMatch) {
          return withCors(await getRunHandler(req, deps, runMatch[1]));
        }

        const resumeMatch = path.match(/^\/api\/runs\/([^\/]+)\/resume$/);
        if (req.method === "POST" && resumeMatch) {
          return withCors(await resumeRunHandler(req, deps, catalog, bus, resumeMatch[1]));
        }

        const eventsMatch = path.match(/^\/api\/runs\/([^\/]+)\/events$/);
        if (req.method === "GET" && eventsMatch) {
          return withCors(sseHandler(req, bus, deps, eventsMatch[1]));
        }

        return withCors(
          new Response(JSON.stringify({ error: "Not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          }),
        );
      } catch (err) {
        return withCors(
          new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
    },
  });

  return {
    server,
    stop: () => server.stop(true),
    deps,
    catalog,
    bus,
  };
}
