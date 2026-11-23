import { DurableObject } from "cloudflare:workers"; // Oh no, cloudflare workers!

const LIVE_MS = 75_000;
const ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const okOrigin = allowed.includes(origin);

    const headers = {
      "content-type": "application/json",
      "cache-control": "no-store",
      vary: "Origin",
    };
    if (okOrigin) {
      headers["access-control-allow-origin"] = origin;
      headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
      headers["access-control-allow-headers"] = "content-type";
      headers["access-control-max-age"] = "86400";
    }
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });

    if (request.method === "OPTIONS")
      return new Response(null, { status: okOrigin ? 204 : 403, headers });

    const path = new URL(request.url).pathname;
    const stub = env.STATS.get(env.STATS.idFromName("global"));

    if (request.method === "GET" && path === "/stats") {
      return reply({ n: null, ...(await stub.counts()) });
    }

    if (request.method === "POST" && (path === "/hit" || path === "/ping")) {
      // only your own pages may count themselves
      if (!okOrigin) return reply({ error: "forbidden" }, 403);
      let id;
      try {
        ({ id } = await request.json());
      } catch {
        return reply({ error: "bad json" }, 400);
      }
      if (typeof id !== "string" || !ID_RE.test(id))
        return reply({ error: "bad id" }, 400);
      return reply(await stub.touch(id));
    }

    return reply({ error: "not found" }, 404);
  },
};

export class Stats extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, n INTEGER NOT NULL, seen INTEGER NOT NULL)",
    );
    this.sql.exec("CREATE INDEX IF NOT EXISTS visitors_seen ON visitors(seen)");
  }

  counts(now = Date.now()) {
    const live = this.sql
      .exec("SELECT COUNT(*) AS c FROM visitors WHERE seen > ?", now - LIVE_MS)
      .one().c;
    const total = this.sql
      .exec("SELECT COALESCE(MAX(n), 0) AS m FROM visitors")
      .one().m;
    return { live, total };
  }

  // register-or-refresh a visitor; the first time an id shows up it gets the next number
  touch(id) {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO visitors (id, n, seen)
       VALUES (?1, (SELECT COALESCE(MAX(n), 0) + 1 FROM visitors), ?2)
       ON CONFLICT(id) DO UPDATE SET seen = ?2`,
      id,
      now,
    );
    const n = this.sql.exec("SELECT n FROM visitors WHERE id = ?", id).one().n;
    return { n, ...this.counts(now) };
  }
}
