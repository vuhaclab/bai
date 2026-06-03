const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

const state = {
  tools: [
    {
      id: "hash-checker",
      name: "Hash Checker",
      category: "Security",
      status: "ready",
      lastRun: "2026-06-03T08:15:00.000Z",
      description: "Verify MD5, SHA-1, and SHA-256 values before using artifacts."
    },
    {
      id: "token-parser",
      name: "Token Parser",
      category: "Utility",
      status: "running",
      lastRun: "2026-06-03T09:20:00.000Z",
      description: "Inspect JWT payloads and expiration metadata."
    },
    {
      id: "domain-health",
      name: "Domain Health",
      category: "Network",
      status: "ready",
      lastRun: "2026-06-02T21:42:00.000Z",
      description: "Track DNS, blacklist, and connectivity checks."
    }
  ],
  apis: [
    {
      id: "api-main",
      name: "Primary Gateway",
      baseUrl: "https://api.example.local/v1",
      environment: "Production",
      status: "online",
      latency: 86,
      requestsToday: 18420,
      owner: "Core"
    },
    {
      id: "api-auth",
      name: "Auth Broker",
      baseUrl: "https://auth.example.local",
      environment: "Staging",
      status: "warning",
      latency: 241,
      requestsToday: 3271,
      owner: "Identity"
    }
  ],
  proxies: [
    {
      id: "proxy-us-01",
      label: "US East Pool",
      host: "us-east.proxy.local",
      port: 8080,
      protocol: "HTTP",
      ipVersion: "IPv4",
      status: "active",
      checkStatus: "unchecked",
      lastCheckedAt: null,
      addedAt: "2026-06-03T08:05:00.000Z",
      expiresAt: "2026-07-03T08:05:00.000Z",
      username: "",
      password: "",
      note: "Main HTTP proxy pool",
      latency: 86,
      successRate: 98.4,
      traffic: "42.1 GB"
    },
    {
      id: "proxy-eu-02",
      label: "EU Relay",
      host: "eu-relay.proxy.local",
      port: 1080,
      protocol: "SOCKS5",
      ipVersion: "IPv4",
      status: "active",
      checkStatus: "unchecked",
      lastCheckedAt: null,
      addedAt: "2026-06-02T13:20:00.000Z",
      expiresAt: "2026-06-20T13:20:00.000Z",
      username: "relay_user",
      password: "",
      note: "EU relay with auth username",
      latency: 122,
      successRate: 94.7,
      traffic: "18.6 GB"
    },
    {
      id: "proxy-apac-01",
      label: "APAC Backup",
      host: "apac-backup.proxy.local",
      port: 3128,
      protocol: "HTTP",
      ipVersion: "IPv6",
      status: "paused",
      checkStatus: "unchecked",
      lastCheckedAt: null,
      addedAt: "2026-05-28T17:45:00.000Z",
      expiresAt: "2026-06-10T17:45:00.000Z",
      username: "",
      password: "",
      note: "Backup route",
      latency: 0,
      successRate: 81.2,
      traffic: "5.4 GB"
    }
  ],
  emails: [
    {
      id: "mail-transactional",
      name: "Transactional SMTP",
      provider: "Postmark",
      status: "connected",
      sentToday: 3240,
      bounceRate: 0.6,
      queue: 18
    },
    {
      id: "mail-campaign",
      name: "Campaign Sender",
      provider: "SendGrid",
      status: "connected",
      sentToday: 971,
      bounceRate: 1.9,
      queue: 42
    }
  ],
  activity: [
    {
      id: "evt-1",
      level: "success",
      title: "Proxy health check completed",
      detail: "3 pools checked, 2 active and 1 paused.",
      time: "2026-06-03T09:35:00.000Z"
    },
    {
      id: "evt-2",
      level: "warning",
      title: "Auth Broker latency spike",
      detail: "Median latency crossed 200 ms in staging.",
      time: "2026-06-03T09:10:00.000Z"
    },
    {
      id: "evt-3",
      level: "info",
      title: "Email queue synced",
      detail: "60 messages waiting across 2 providers.",
      time: "2026-06-03T08:54:00.000Z"
    }
  ]
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": MIME_TYPES[".json"],
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, body, filename) {
  const headers = {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  };

  if (filename) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  res.writeHead(statusCode, headers);
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex")}`;
}

function normalizeProtocol(protocol) {
  const value = String(protocol || "HTTP").trim().toUpperCase();
  const allowed = new Set(["HTTP", "HTTPS", "SOCKS4", "SOCKS5"]);
  return allowed.has(value) ? value : "HTTP";
}

function normalizeIpVersion(ipVersion, host) {
  if (net.isIP(host) === 6 || String(host || "").includes(":")) {
    return "IPv6";
  }

  const value = String(ipVersion || "").trim().toUpperCase();

  if (value === "IPV4") {
    return "IPv4";
  }

  if (value === "IPV6") {
    return "IPv6";
  }

  return "IPv4";
}

function normalizeStatus(status) {
  const value = String(status || "active").trim().toLowerCase();
  const allowed = new Set(["active", "paused", "failed", "expired"]);
  return allowed.has(value) ? value : "active";
}

function normalizePort(port) {
  const value = Number(port);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return null;
  }

  return value;
}

function parseProxyLine(line, defaults = {}) {
  const cleaned = String(line || "").trim();

  if (!cleaned || cleaned.startsWith("#")) {
    return null;
  }

  let protocol = normalizeProtocol(defaults.protocol);
  let value = cleaned;
  const protocolMatch = value.match(/^([a-z0-9]+):\/\//i);

  if (protocolMatch) {
    protocol = normalizeProtocol(protocolMatch[1]);
    value = value.slice(protocolMatch[0].length);
  }

  if (value.includes("@")) {
    const [authPart, endpointPart] = value.split("@");
    const authParts = authPart.split(":");
    const parsed = parseProxyLine(endpointPart, defaults);

    if (!parsed) {
      return null;
    }

    parsed.protocol = protocol;
    parsed.username = authParts[0] || "";
    parsed.password = authParts[1] || "";
    parsed.label = defaults.label || `${protocol} ${parsed.host}:${parsed.port}`;
    return parsed;
  }

  const parts = value.split(":");
  let host = "";
  let port = null;
  let username = "";
  let password = "";

  if (value.startsWith("[") && value.includes("]")) {
    const closeIndex = value.indexOf("]");
    host = value.slice(1, closeIndex);
    const rest = value.slice(closeIndex + 1).replace(/^:/, "");
    const restParts = rest.split(":");
    port = normalizePort(restParts[0]);
    username = restParts[1] || "";
    password = restParts[2] || "";
  } else if (parts.length >= 2) {
    host = parts[0];
    port = normalizePort(parts[1]);
    username = parts[2] || "";
    password = parts[3] || "";
  }

  if (!host || !port) {
    return null;
  }

  return {
    label: defaults.label || `${protocol} ${host}:${port}`,
    host,
    port,
    protocol,
    ipVersion: normalizeIpVersion(defaults.ipVersion, host),
    username,
    password,
    expiresAt: defaults.expiresAt || "",
    note: defaults.note || ""
  };
}

function buildProxy(payload) {
  const host = String(payload.host || "").trim();
  const port = normalizePort(payload.port);

  if (!host || !port) {
    return null;
  }

  const protocol = normalizeProtocol(payload.protocol);
  const now = new Date().toISOString();

  return {
    id: createId("proxy"),
    label: String(payload.label || `${protocol} ${host}:${port}`).trim(),
    host,
    port,
    protocol,
    ipVersion: normalizeIpVersion(payload.ipVersion, host),
    status: normalizeStatus(payload.status),
    checkStatus: "unchecked",
    lastCheckedAt: null,
    addedAt: payload.addedAt || now,
    expiresAt: payload.expiresAt || "",
    username: String(payload.username || "").trim(),
    password: String(payload.password || "").trim(),
    note: String(payload.note || "").trim(),
    latency: 0,
    successRate: 100,
    traffic: "0 GB"
  };
}

function findProxy(id) {
  return state.proxies.find((proxy) => proxy.id === id);
}

function proxyToExportLine(proxy) {
  const host = (net.isIP(proxy.host) === 6 || proxy.host.includes(":")) && !proxy.host.startsWith("[")
    ? `[${proxy.host}]`
    : proxy.host;
  const auth = proxy.username || proxy.password ? `${proxy.username}:${proxy.password}@` : "";
  return `${proxy.protocol.toLowerCase()}://${auth}${host}:${proxy.port}`;
}

function checkTcpConnection(proxy) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: proxy.host,
      port: proxy.port,
      timeout: 5000
    });

    socket.once("connect", () => {
      const latency = Date.now() - startedAt;
      socket.destroy();
      resolve({ ok: true, latency, message: "TCP connection succeeded" });
    });

    socket.once("timeout", () => {
      socket.destroy();
      resolve({ ok: false, latency: 0, message: "Connection timed out" });
    });

    socket.once("error", (error) => {
      socket.destroy();
      resolve({ ok: false, latency: 0, message: error.message });
    });
  });
}

async function checkProxy(proxy) {
  proxy.checkStatus = "checking";
  const result = await checkTcpConnection(proxy);

  proxy.lastCheckedAt = new Date().toISOString();
  proxy.latency = result.latency;
  proxy.checkStatus = result.ok ? "live" : "dead";
  proxy.status = result.ok ? "active" : "failed";
  proxy.successRate = result.ok ? Math.max(proxy.successRate, 95) : Math.min(proxy.successRate, 40);
  proxy.lastCheckMessage = result.message;

  return {
    proxy,
    result
  };
}

function getDashboardPayload() {
  const activeProxyCount = state.proxies.filter((proxy) => proxy.status === "active").length;
  const onlineApiCount = state.apis.filter((api) => api.status === "online").length;
  const totalEmailQueue = state.emails.reduce((total, item) => total + item.queue, 0);
  const runningToolCount = state.tools.filter((tool) => tool.status === "running").length;

  return {
    stats: {
      tools: state.tools.length,
      runningTools: runningToolCount,
      apis: state.apis.length,
      onlineApis: onlineApiCount,
      proxies: state.proxies.length,
      activeProxies: activeProxyCount,
      emailProfiles: state.emails.length,
      queuedEmails: totalEmailQueue
    },
    tools: state.tools,
    apis: state.apis,
    proxies: state.proxies,
    emails: state.emails,
    activity: state.activity
  };
}

function logActivity(level, title, detail) {
  state.activity.unshift({
    id: createId("evt"),
    level,
    title,
    detail,
    time: new Date().toISOString()
  });

  state.activity = state.activity.slice(0, 20);
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    sendJson(res, 200, getDashboardPayload());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tools/run") {
    const body = await readRequestBody(req);
    const tool = state.tools.find((item) => item.id === body.id);

    if (!tool) {
      sendJson(res, 404, { error: "Tool not found" });
      return;
    }

    tool.status = "running";
    tool.lastRun = new Date().toISOString();
    logActivity("success", `${tool.name} started`, "The tool was queued and marked as running.");
    sendJson(res, 200, { tool, activity: state.activity[0] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/apis") {
    const body = await readRequestBody(req);

    if (!body.name || !body.baseUrl) {
      sendJson(res, 400, { error: "API name and base URL are required" });
      return;
    }

    const api = {
      id: createId("api"),
      name: String(body.name).trim(),
      baseUrl: String(body.baseUrl).trim(),
      environment: body.environment || "Development",
      status: "online",
      latency: 0,
      requestsToday: 0,
      owner: body.owner || "Unassigned"
    };

    state.apis.unshift(api);
    logActivity("success", "API profile added", `${api.name} is now available in API Manager.`);
    sendJson(res, 201, api);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/proxies") {
    const body = await readRequestBody(req);

    const proxy = buildProxy(body);

    if (!proxy) {
      sendJson(res, 400, { error: "Proxy host and valid port are required" });
      return;
    }

    state.proxies.unshift(proxy);
    logActivity("success", "Proxy added", `${proxy.label} is ready for health checks.`);
    sendJson(res, 201, proxy);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/proxies/import") {
    const body = await readRequestBody(req);
    const source = String(body.list || "").split(/\r?\n/);
    const defaults = {
      protocol: body.protocol,
      ipVersion: body.ipVersion,
      expiresAt: body.expiresAt,
      note: body.note
    };

    const proxies = source
      .map((line) => parseProxyLine(line, defaults))
      .filter(Boolean)
      .map((item) => buildProxy(item))
      .filter(Boolean);

    if (!proxies.length) {
      sendJson(res, 400, { error: "No valid proxy lines were found" });
      return;
    }

    state.proxies.unshift(...proxies);
    logActivity("success", "Proxy list imported", `${proxies.length} proxies were added to Proxy Manager.`);
    sendJson(res, 201, {
      added: proxies.length,
      proxies
    });
    return;
  }

  if (req.method === "PUT" && url.pathname.startsWith("/api/proxies/")) {
    const id = url.pathname.split("/").pop();
    const proxy = findProxy(id);

    if (!proxy) {
      sendJson(res, 404, { error: "Proxy not found" });
      return;
    }

    const body = await readRequestBody(req);
    const port = normalizePort(body.port ?? proxy.port);

    if (!String(body.host ?? proxy.host).trim() || !port) {
      sendJson(res, 400, { error: "Proxy host and valid port are required" });
      return;
    }

    proxy.label = String(body.label ?? proxy.label).trim();
    proxy.host = String(body.host ?? proxy.host).trim();
    proxy.port = port;
    proxy.protocol = normalizeProtocol(body.protocol ?? proxy.protocol);
    proxy.ipVersion = normalizeIpVersion(body.ipVersion ?? proxy.ipVersion, proxy.host);
    proxy.status = normalizeStatus(body.status ?? proxy.status);
    proxy.expiresAt = String(body.expiresAt ?? proxy.expiresAt ?? "").trim();
    proxy.username = String(body.username ?? proxy.username ?? "").trim();
    proxy.password = String(body.password ?? proxy.password ?? "").trim();
    proxy.note = String(body.note ?? proxy.note ?? "").trim();

    logActivity("info", "Proxy updated", `${proxy.label} was edited.`);
    sendJson(res, 200, proxy);
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/proxies/")) {
    const id = url.pathname.split("/").pop();
    const index = state.proxies.findIndex((proxy) => proxy.id === id);

    if (index === -1) {
      sendJson(res, 404, { error: "Proxy not found" });
      return;
    }

    const [deleted] = state.proxies.splice(index, 1);
    logActivity("warning", "Proxy deleted", `${deleted.label} was removed from Proxy Manager.`);
    sendJson(res, 200, deleted);
    return;
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/proxies\/[^/]+\/check$/)) {
    const id = url.pathname.split("/")[3];
    const proxy = findProxy(id);

    if (!proxy) {
      sendJson(res, 404, { error: "Proxy not found" });
      return;
    }

    const result = await checkProxy(proxy);
    logActivity(
      result.result.ok ? "success" : "warning",
      "Proxy checked",
      `${proxy.label} is ${proxy.checkStatus}${proxy.latency ? ` at ${proxy.latency} ms` : ""}.`
    );
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/proxies/check-all") {
    const results = [];

    for (const proxy of state.proxies) {
      results.push(await checkProxy(proxy));
    }

    const live = results.filter((item) => item.result.ok).length;
    logActivity("info", "Proxy batch check completed", `${live}/${results.length} proxies are live.`);
    sendJson(res, 200, {
      checked: results.length,
      live,
      dead: results.length - live,
      results
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/proxies/check-line") {
    const body = await readRequestBody(req);
    const parsed = parseProxyLine(body.proxyLine, body);
    const proxy = parsed ? buildProxy(parsed) : null;

    if (!proxy) {
      sendJson(res, 400, { error: "Valid proxy line is required" });
      return;
    }

    const result = await checkProxy(proxy);
    sendJson(res, 200, result);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/proxies/export") {
    const status = url.searchParams.get("status");
    const protocol = url.searchParams.get("protocol");
    const exported = state.proxies
      .filter((proxy) => !status || proxy.status === status || proxy.checkStatus === status)
      .filter((proxy) => !protocol || proxy.protocol === normalizeProtocol(protocol))
      .map(proxyToExportLine)
      .join("\n");

    sendText(res, 200, exported, "proxies.txt");
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/emails") {
    const body = await readRequestBody(req);

    if (!body.name || !body.provider) {
      sendJson(res, 400, { error: "Email profile name and provider are required" });
      return;
    }

    const email = {
      id: createId("mail"),
      name: String(body.name).trim(),
      provider: String(body.provider).trim(),
      status: "connected",
      sentToday: 0,
      bounceRate: 0,
      queue: 0
    };

    state.emails.unshift(email);
    logActivity("success", "Email profile connected", `${email.name} was added to Email Manager.`);
    sendJson(res, 201, email);
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const relativePath = decodeURIComponent(requestedPath).replace(/^[/\\]+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`) && filePath !== PUBLIC_DIR) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(PUBLIC_DIR, "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        res.writeHead(200, { "Content-Type": MIME_TYPES[".html"] });
        res.end(fallbackData);
      });
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Dracula Ops Dashboard running at http://localhost:${PORT}`);
});
