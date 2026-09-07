import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createStore, ApiError } from "./store.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_BODY = 6 * 1024 * 1024;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const json = (res, status, data, extra = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extra,
  });
  res.end(JSON.stringify(data));
};
async function body(req, limit = MAX_BODY) {
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] ?? ""))
    throw new ApiError(415, "Send application/json.");
  if (Number(req.headers["content-length"]) > limit) {
    req.resume();
    throw new ApiError(
      413,
      `Request exceeds the ${limit / 1024 / 1024} MiB limit.`,
    );
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
  }
  if (size > limit)
    throw new ApiError(
      413,
      `Request exceeds the ${limit / 1024 / 1024} MiB limit.`,
    );
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ApiError(400, "Invalid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError(400, "Expected a JSON object.");
  return input;
}
export async function createAppServer({
  dataPath = process.env.DIMENTION_DB ||
    resolve(root, "data", "dimention.sqlite"),
  seed = true,
  dev = false,
} = {}) {
  const store = createStore(dataPath, { seed });
  let vite;
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    try {
      const host = req.headers.host ?? "";
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
        throw new ApiError(403, "Use localhost or 127.0.0.1.");
      if (req.headers.origin && req.headers.origin !== `http://${host}`)
        throw new ApiError(403, "Cross-origin requests are not allowed.");
      const pathname = new URL(req.url, `http://${host}`).pathname;
      if (pathname.startsWith("/api/")) {
        if (req.method === "GET" && pathname === "/api/health")
          return json(res, 200, { ok: true, app: "Dimention" });
        if (req.method === "GET" && pathname === "/api/workspace")
          return json(res, 200, store.graph());
        if (req.method === "GET" && pathname === "/api/export")
          return json(res, 200, store.export(), {
            "Content-Disposition":
              'attachment; filename="dimention-workspace.json"',
          });
        if (req.method === "GET" && pathname === "/api/trash")
          return json(res, 200, store.trash());
        const zoneRoute = pathname.match(
          /^\/api\/dims\/([^/]+)\/zones(?:\/([^/]+))?$/,
        );
        if (zoneRoute) {
          const [, dimId, zoneId] = zoneRoute;
          if (req.method === "POST" && !zoneId)
            return json(res, 201, store.createZone(dimId, await body(req)));
          if (req.method === "PATCH" && zoneId)
            return json(
              res,
              200,
              store.renameZone(dimId, zoneId, await body(req)),
            );
          if (req.method === "DELETE" && zoneId)
            return json(
              res,
              200,
              store.removeZone(dimId, zoneId, await body(req)),
            );
        }
        if (req.method === "POST" && pathname === "/api/import") {
          const input = await body(req, 32 * 1024 * 1024);
          return json(
            res,
            200,
            store.importWorkspace(input.workspace, input.preview === true),
          );
        }
        if (req.method === "PATCH" && pathname === "/api/positions")
          return json(
            res,
            200,
            store.batchPositions((await body(req)).positions),
          );
        if (req.method === "PATCH" && pathname === "/api/organize")
          return json(res, 200, store.organize(await body(req)));
        const restore = pathname.match(/^\/api\/trash\/([^/]+)\/restore$/);
        if (req.method === "POST" && restore)
          return json(res, 200, store.restore(restore[1]));
        if (req.method === "POST" && pathname === "/api/nodes")
          return json(res, 201, store.createNode(await body(req)));
        if (req.method === "POST" && pathname === "/api/connections")
          return json(res, 201, store.createEdge(await body(req)));
        const match = pathname.match(/^\/api\/(nodes|connections)\/([^/]+)$/);
        if (match) {
          const [, kind, id] = match;
          if (req.method === "PATCH" && kind === "nodes")
            return json(res, 200, store.updateNode(id, await body(req)));
          if (req.method === "DELETE") {
            kind === "nodes" ? store.deleteNode(id) : store.deleteEdge(id);
            return json(res, 200, { ok: true });
          }
        }
        throw new ApiError(404, "API route not found.");
      }
      if (!["GET", "HEAD"].includes(req.method))
        throw new ApiError(405, "Method not allowed.");
      if (vite)
        return vite.middlewares(req, res, () =>
          json(res, 404, { error: "Not found." }),
        );
      const dist = resolve(root, "dist");
      let filename;
      try {
        filename = resolve(
          dist,
          "." + decodeURIComponent(pathname === "/" ? "/index.html" : pathname),
        );
      } catch {
        throw new ApiError(400, "Invalid path.");
      }
      if (!filename.startsWith(dist + sep))
        throw new ApiError(403, "Invalid path.");
      let file;
      try {
        if (!(await stat(filename)).isFile()) throw new Error();
        file = await readFile(filename);
      } catch {
        throw new ApiError(
          404,
          "File not found. Run npm run build before npm start.",
        );
      }
      res.writeHead(200, {
        "Content-Type": mime[extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? undefined : file);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error(error);
      if (!res.headersSent)
        json(res, error.status ?? 500, {
          error:
            error instanceof ApiError
              ? error.message
              : "The local server could not complete this request.",
        });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  if (dev) {
    const { createServer } = await import("vite");
    vite = await createServer({
      root,
      server: { middlewareMode: true, hmr: { server }, host: "127.0.0.1" },
    });
  }
  return {
    server,
    store,
    dataPath,
    async close() {
      await vite?.close();
      await new Promise((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      store.close();
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const app = await createAppServer({ dev: process.argv.includes("--dev") });
  let port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  for (let attempt = 0; ; attempt++) {
    try {
      await new Promise((done, reject) => {
        const onError = (error) => {
          app.server.off("listening", onListen);
          reject(error);
        };
        const onListen = () => {
          app.server.off("error", onError);
          done();
        };
        app.server
          .once("error", onError)
          .once("listening", onListen)
          .listen(port, "127.0.0.1");
      });
      break;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || attempt >= 20 || port === 65535)
        throw error;
      port++;
    }
  }
  console.log(
    `Dimention is running at http://localhost:${port}\nDatabase: ${app.dataPath}`,
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, async () => {
      await app.close();
      process.exit(0);
    });
}
