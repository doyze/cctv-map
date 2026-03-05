import { createServer, get as httpGet } from "http";
import { get as httpsGet } from "https";
import { readFile } from "fs/promises";
import { readFileSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Load .env
try {
  const envFile = readFileSync(join(__dirname, ".env"), "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
} catch {}

const PORT = parseInt(process.env.PORT || "8090", 10);
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "";
const db = new Database(join(__dirname, "data", "cctv.db"));
db.pragma("journal_mode = WAL");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// --- Helpers ---

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

// --- Prepared statements ---

const stmts = {
  getAll: db.prepare("SELECT * FROM cameras ORDER BY id"),
  getOne: db.prepare("SELECT * FROM cameras WHERE id = ?"),
  insert: db.prepare(
    "INSERT INTO cameras (name, status, lat, lon, stream_url) VALUES (@name, @status, @lat, @lon, @stream_url)"
  ),
  update: db.prepare(
    "UPDATE cameras SET name=@name, status=@status, lat=@lat, lon=@lon, stream_url=@stream_url WHERE id=@id"
  ),
  delete: db.prepare("DELETE FROM cameras WHERE id = ?"),
  updateStatus: db.prepare("UPDATE cameras SET status=? WHERE id=?"),
};

// --- Stream check ---

function checkStream(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const getter = url.startsWith("https") ? httpsGet : httpGet;
    const req = getter(url, { timeout: timeoutMs }, (res) => {
      const online = res.statusCode >= 200 && res.statusCode < 400;
      res.destroy();
      resolve(online);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

async function checkCamerasByIds(ids) {
  const cameras = ids.length
    ? ids.map((id) => stmts.getOne.get(id)).filter(Boolean)
    : stmts.getAll.all();
  const results = await Promise.all(
    cameras.map(async (cam) => {
      const online = await checkStream(cam.stream_url);
      const status = online ? "online" : "offline";
      if (cam.status !== status) {
        stmts.updateStatus.run(status, cam.id);
      }
      return { id: cam.id, name: cam.name, status };
    })
  );
  return results;
}

// --- Auth ---

function checkAuth(req) {
  const auth = req.headers["x-admin-token"];
  return auth === ADMIN_PASSCODE;
}

// --- API Router ---

async function handleAPI(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // POST /api/login
  if (path === "/api/login" && method === "POST") {
    try {
      const body = await readBody(req);
      if (body.passcode === ADMIN_PASSCODE) {
        return json(res, 200, { ok: true });
      }
      return json(res, 401, { error: "Passcode ไม่ถูกต้อง" });
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  // POST /api/cameras/check-status (requires auth)
  // body: { ids: [1,2,3] } to check specific cameras, or omit for all
  if (path === "/api/cameras/check-status" && method === "POST") {
    if (!checkAuth(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }
    try {
      const body = await readBody(req).catch(() => ({}));
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const results = await checkCamerasByIds(ids);
      return json(res, 200, results);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // POST /api/cameras/check-one (public - for map popup)
  // body: { id: 123 }
  if (path === "/api/cameras/check-one" && method === "POST") {
    try {
      const body = await readBody(req);
      const cam = stmts.getOne.get(body.id);
      if (!cam) return json(res, 404, { error: "Not found" });
      const online = await checkStream(cam.stream_url);
      const status = online ? "online" : "offline";
      if (cam.status !== status) {
        stmts.updateStatus.run(status, cam.id);
      }
      return json(res, 200, { id: cam.id, status });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  // GET /api/cameras (public)
  if (path === "/api/cameras" && method === "GET") {
    return json(res, 200, stmts.getAll.all());
  }

  // Write operations require auth
  if (method === "POST" || method === "PUT" || method === "DELETE") {
    if (!checkAuth(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }
  }

  // POST /api/cameras
  if (path === "/api/cameras" && method === "POST") {
    try {
      const body = await readBody(req);
      const result = stmts.insert.run({
        name: body.name,
        status: body.status || "online",
        lat: parseFloat(body.lat),
        lon: parseFloat(body.lon),
        stream_url: body.stream_url,
      });
      const cam = stmts.getOne.get(result.lastInsertRowid);
      return json(res, 201, cam);
    } catch (e) {
      return json(res, 400, { error: e.message });
    }
  }

  // GET/PUT/DELETE /api/cameras/:id
  const match = path.match(/^\/api\/cameras\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);

    if (method === "GET") {
      const cam = stmts.getOne.get(id);
      return cam ? json(res, 200, cam) : json(res, 404, { error: "Not found" });
    }

    if (method === "PUT") {
      try {
        const body = await readBody(req);
        stmts.update.run({
          id,
          name: body.name,
          status: body.status || "online",
          lat: parseFloat(body.lat),
          lon: parseFloat(body.lon),
          stream_url: body.stream_url,
        });
        const cam = stmts.getOne.get(id);
        return cam ? json(res, 200, cam) : json(res, 404, { error: "Not found" });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    }

    if (method === "DELETE") {
      const result = stmts.delete.run(id);
      return result.changes
        ? json(res, 200, { deleted: true })
        : json(res, 404, { error: "Not found" });
    }
  }

  return json(res, 404, { error: "API route not found" });
}

// --- Server ---

const server = createServer(async (req, res) => {
  // API routes
  if (req.url.startsWith("/api/")) {
    return handleAPI(req, res);
  }

  // Static files
  let filePath = req.url === "/" ? "/map.html" : req.url.split("?")[0];
  filePath = join(__dirname, filePath);

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Map:   http://localhost:${PORT}/`);
  console.log(`Admin: http://localhost:${PORT}/admin.html`);
});
