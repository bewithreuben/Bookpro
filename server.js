const http = require("node:http");
const path = require("node:path");
const { loadEnv } = require("./src/env");
const { createRepository, publicUser } = require("./src/repository");
const { signJwt, verifyJwt, verifyPassword, verifyPaystackSignature } = require("./src/security");

loadEnv();

const root = __dirname;
const requestedPort = Number(process.env.PORT || process.argv[2]);
const port = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : 5177;
const repositoryPromise = createRepository();

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const staticSecurityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' https://js.paystack.co; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.paystack.co; img-src 'self' data:; object-src 'none'; base-uri 'self'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const rawBody = await readRawBody(req);
  if (!rawBody.length) return {};
  return JSON.parse(rawBody.toString("utf8"));
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

function getActor(req) {
  return verifyJwt(getBearerToken(req));
}

function requireRole(req, roles) {
  const actor = getActor(req);
  if (!actor) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }
  if (!roles.includes(actor.role)) {
    const error = new Error("You do not have permission to access this resource.");
    error.status = 403;
    throw error;
  }
  return actor;
}

async function handleApi(req, res, url) {
  const repository = await repositoryPromise;

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const bootstrap = await repository.bootstrap();
    return sendJson(res, 200, { ...bootstrap, databaseMode: repository.mode });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJson(req);
    const user = await repository.findUserByLogin(body.email);
    if (!user) return sendJson(res, 401, { error: "No BookPro account found for that email or phone." });
    if (!verifyPassword(body.password, user.passwordHash)) {
      return sendJson(res, 401, { error: "Invalid password." });
    }
    const safeUser = publicUser(user);
    return sendJson(res, 200, { user: safeUser, token: signJwt(safeUser) });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    const body = await readJson(req);
    if (!body.name || !body.email || !body.role || !body.password) {
      return sendJson(res, 400, { error: "Name, email, role, and password are required." });
    }
    const user = await repository.createUser(body);
    const safeUser = publicUser(user);
    return sendJson(res, 201, { user: safeUser, token: signJwt(safeUser) });
  }

  if (req.method === "GET" && url.pathname === "/api/professionals") {
    const results = await repository.searchProfessionals(url.searchParams);
    return sendJson(res, 200, { professionals: results });
  }

  if (req.method === "GET" && url.pathname === "/api/customer/history") {
    const actor = requireRole(req, ["customer", "admin"]);
    const history = await repository.customerHistory(actor.role === "admin" ? null : actor.id);
    return sendJson(res, 200, { bookings: history });
  }

  if (req.method === "POST" && url.pathname === "/api/bookings") {
    const actor = requireRole(req, ["customer", "admin"]);
    const body = await readJson(req);
    const booking = await repository.createBooking(body, actor);
    return sendJson(res, 201, { booking });
  }

  if (req.method === "POST" && url.pathname === "/api/payments/paystack/initialize") {
    requireRole(req, ["customer", "admin"]);
    const body = await readJson(req);
    const { booking, payment } = await repository.initializePayment(body);
    return sendJson(res, 200, {
      payment,
      authorizationUrl: `https://checkout.paystack.com/${booking.reference.toLowerCase()}`
    });
  }

  if (req.method === "POST" && url.pathname === "/api/payments/paystack/verify") {
    requireRole(req, ["customer", "admin"]);
    const body = await readJson(req);
    const reference = body.reference;
    if (!reference) return sendJson(res, 400, { error: "Payment reference is required." });
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return sendJson(res, 503, { error: "PAYSTACK_SECRET_KEY is required to verify live Paystack transactions." });
    }
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });
    const paystackResult = await verifyResponse.json();
    if (!verifyResponse.ok || !paystackResult.status) {
      return sendJson(res, 502, { error: paystackResult.message || "Paystack verification failed.", paystack: paystackResult });
    }
    const status = paystackResult.data?.status === "success" ? "authorized" : "failed";
    const result = await repository.markPaymentFromPaystack(reference, status, paystackResult);
    return sendJson(res, 200, { verified: true, status, result, paystack: paystackResult });
  }

  if (req.method === "POST" && url.pathname === "/api/payments/paystack/webhook") {
    const rawBody = await readRawBody(req);
    const signature = req.headers["x-paystack-signature"];
    if (!verifyPaystackSignature(rawBody, signature)) {
      return sendJson(res, 401, { error: "Invalid Paystack signature." });
    }
    const event = JSON.parse(rawBody.toString("utf8"));
    const reference = event?.data?.reference;
    const status = event?.event === "charge.success" ? "authorized" : "failed";
    const result = await repository.markPaymentFromPaystack(reference, status, event);
    return sendJson(res, 200, { received: true, result });
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/professional\/jobs\/[^/]+\/(accept|reject)$/)) {
    requireRole(req, ["professional", "admin"]);
    const [, bookingId, action] = url.pathname.match(/^\/api\/professional\/jobs\/([^/]+)\/(accept|reject)$/);
    const booking = await repository.updateJob(bookingId, action);
    return sendJson(res, 200, { booking });
  }

  if (req.method === "GET" && url.pathname === "/api/professional/dashboard") {
    const actor = requireRole(req, ["professional", "admin"]);
    const { professional, jobs, reviews } = await repository.professionalDashboard(actor);
    return sendJson(res, 200, { professional, jobs, reviews });
  }

  if (req.method === "GET" && url.pathname === "/api/admin/dashboard") {
    requireRole(req, ["admin"]);
    const dashboard = await repository.adminDashboard();
    return sendJson(res, 200, dashboard);
  }

  if (req.method === "POST" && url.pathname.match(/^\/api\/admin\/verify\/[^/]+$/)) {
    const actor = requireRole(req, ["admin"]);
    const [, verificationId] = url.pathname.match(/^\/api\/admin\/verify\/([^/]+)$/);
    const item = await repository.verifyWorker(verificationId, actor);
    return sendJson(res, 200, { verification: item });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(root, requested.slice(1));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await require("node:fs/promises").readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      ...staticSecurityHeaders
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return sendJson(res, 204, {});
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`BookPro Nigeria server running at http://127.0.0.1:${port}`);
});
