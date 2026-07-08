import { serve, type Server } from "bun";
import { join } from "node:path";
import { openDb } from "../store/db";
import { RunRepository } from "../store/runs";
import { StepRepository } from "../store/steps";
import { CheckpointRepository } from "../store/checkpoints";
import { createDriver, MockDriver, type Driver } from "../driver";
import { EventBus } from "./events/bus";
import { WorkflowCatalog } from "./workflows";
import { createRunHandler, resumeRunHandler, getRunHandler, listRunsHandler } from "./routes/runs";
import { sseHandler } from "./sse";
import type { EngineDeps } from "../engine/runner";
import {
  createRunHandler as createRunResult,
  decisionHandler,
  getRunHandler as getRunResult,
  listRunsHandler as listRunsResult,
  listWorkflowsHandler,
  type ApiResult,
} from "./handlers";
import { sseResponse } from "./sse";

export interface ServerOptions {
  port?: number;
  dbPath?: string;
  workflowsDir?: string;
  staticDir?: string;
  driver?: Driver;
}

export interface CreateServerOptions {
  deps: EngineDeps;
  bus: EventBus;
  workflowsDir: string;
  staticDir?: string;
  port: number;
}

const resultJson = (result: ApiResult): Response =>
  new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { "Content-Type": "application/json" },
  });

export function createServer(opts: CreateServerOptions): Server {
  const { deps, bus, workflowsDir, staticDir } = opts;

  return serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;
      const method = req.method;

      if (path === "/api/workflows" && method === "GET") {
        return resultJson(await listWorkflowsHandler(workflowsDir));
      }
      if (path === "/api/runs" && method === "GET") {
        return resultJson(listRunsResult(deps));
      }
      if (path === "/api/runs" && method === "POST") {
        return resultJson(await createRunResult(deps, bus, workflowsDir, await safeJson(req)));
      }

      const runMatch = path.match(/^\/api\/runs\/([^/]+)$/);
      if (runMatch && method === "GET") {
        return resultJson(getRunResult(deps, decodeURIComponent(runMatch[1])));
      }

      const approveMatch = path.match(/^\/api\/runs\/([^/]+)\/approve$/);
      if (approveMatch && method === "POST") {
        return resultJson(decisionHandler(deps, bus, decodeURIComponent(approveMatch[1]), true, await safeJson(req)));
      }

      const rejectMatch = path.match(/^\/api\/runs\/([^/]+)\/reject$/);
      if (rejectMatch && method === "POST") {
        return resultJson(decisionHandler(deps, bus, decodeURIComponent(rejectMatch[1]), false, await safeJson(req)));
      }

      const eventsMatch = path.match(/^\/api\/events\/([^/]+)$/);
      if (eventsMatch && method === "GET") {
        return sseResponse(deps, bus, decodeURIComponent(eventsMatch[1]));
      }

      if (staticDir && method === "GET") {
        const file = Bun.file(join(staticDir, path === "/" ? "index.html" : path));
        if (await file.exists()) return new Response(file);
        const index = Bun.file(join(staticDir, "index.html"));
        if (await index.exists()) return new Response(index);
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
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
        if (req.method === "GET" && path === "/api/workflows") {
          const workflows = await catalog.list();
          return withCors(
            new Response(JSON.stringify(workflows), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
          );
        }

        const runMatch = path.match(/^\/api\/runs\/([^\/]+)$/);
        if (req.method === "GET" && runMatch) {
          return withCors(await getRunHandler(req, deps, decodeURIComponent(runMatch[1])));
        }

        const resumeMatch = path.match(/^\/api\/runs\/([^\/]+)\/resume$/);
        if (req.method === "POST" && resumeMatch) {
          return withCors(await resumeRunHandler(req, deps, catalog, bus, decodeURIComponent(resumeMatch[1])));
        }

        const approveMatch = path.match(/^\/api\/runs\/([^\/]+)\/approve$/);
        if (req.method === "POST" && approveMatch) {
          return withCors(await resumeRunHandler(
            new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ ...(await safeJson(req) as object), approve: true }) }),
            deps,
            catalog,
            bus,
            decodeURIComponent(approveMatch[1]),
          ));
        }

        const rejectMatch = path.match(/^\/api\/runs\/([^\/]+)\/reject$/);
        if (req.method === "POST" && rejectMatch) {
          return withCors(await resumeRunHandler(
            new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ ...(await safeJson(req) as object), approve: false }) }),
            deps,
            catalog,
            bus,
            decodeURIComponent(rejectMatch[1]),
          ));
        }

        const eventsMatch = path.match(/^\/api\/runs\/([^\/]+)\/events$/);
        if (req.method === "GET" && eventsMatch) {
          return withCors(sseHandler(req, bus, deps, decodeURIComponent(eventsMatch[1])));
        }

        const planEventsMatch = path.match(/^\/api\/events\/([^\/]+)$/);
        if (req.method === "GET" && planEventsMatch) {
          return withCors(sseResponse(deps, bus, decodeURIComponent(planEventsMatch[1])));
        }

        if (req.method === "GET" && !path.startsWith("/api") && options.staticDir) {
          const filePath = join(options.staticDir, path === "/" ? "index.html" : path);
          const file = Bun.file(filePath);
          if (await file.exists()) {
            return new Response(file);
          }
          const indexFile = Bun.file(join(options.staticDir, "index.html"));
          if (await indexFile.exists()) {
            return new Response(indexFile);
          }
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

export function main() {
  const port = process.env.AIPIPE_PORT ? parseInt(process.env.AIPIPE_PORT, 10) : 3000;
  const dbPath = process.env.AIPIPE_DB ?? "aipipe.db";
  const workflowsDir = process.env.AIPIPE_WORKFLOWS ?? "workflows";
  const staticDir = process.env.AIPIPE_STATIC;
  const driver = process.env.AIPIPE_MOCK === "1"
    ? new MockDriver((input) => ({ output: `（模擬輸出）${input.prompt}` }))
    : createDriver();

  const { server } = startServer({
    port,
    dbPath,
    workflowsDir,
    staticDir,
    driver,
  });
  console.log(`[AIPipe Server] running on http://localhost:${server.port}`);
}

if (import.meta.main) {
  main();
}
