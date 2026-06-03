const crypto = require("node:crypto");

const HASH_ALGORITHM = "sha256";
const HASH_ITERATIONS = 210000;
const HASH_KEY_LENGTH = 32;

function base64Url(input) {
  return Buffer.from(input).toString("base64url");
}

function fromBase64Url(input) {
  return Buffer.from(input, "base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const digest = crypto.pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, HASH_ALGORITHM).toString("base64url");
  return `pbkdf2_${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${digest}`;
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  const [algorithmTag, iterationsText, salt, expected] = storedHash.split("$");
  if (algorithmTag !== "pbkdf2_sha256" || !iterationsText || !salt || !expected) return false;
  const iterations = Number(iterationsText);
  const actual = crypto.pbkdf2Sync(password, salt, iterations, HASH_KEY_LENGTH, HASH_ALGORITHM);
  const expectedBuffer = fromBase64Url(expected);
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || "bookpro-local-dev-secret-change-me";
  return Buffer.from(secret);
}

function signJwt(payload, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options.expiresInSeconds || 60 * 60 * 8;
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: now, exp: now + expiresIn };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedBody = base64Url(JSON.stringify(body));
  const signature = crypto.createHmac("sha256", getJwtSecret()).update(`${encodedHeader}.${encodedBody}`).digest("base64url");
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyJwt(token) {
  if (!token) return null;
  const [encodedHeader, encodedBody, signature] = token.split(".");
  if (!encodedHeader || !encodedBody || !signature) return null;
  const expected = crypto.createHmac("sha256", getJwtSecret()).update(`${encodedHeader}.${encodedBody}`).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  const payload = JSON.parse(Buffer.from(encodedBody, "base64url").toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function verifyPaystackSignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const digest = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(digest);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  verifyPaystackSignature
};
