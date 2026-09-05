/**
 * Admin authentication. Single role ("editor") — this app's admin is much
 * smaller than trivo-lean's, so the viewer/editor split isn't needed yet.
 * Same signed-session-token mechanism as trivo-lean for consistency.
 */
import crypto from 'node:crypto';

const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('Server is not configured: set ADMIN_PASSWORD (and ideally SESSION_SECRET) in your environment.');
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

function sign(payloadObj) {
  const payload = base64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return payload + '.' + sig;
}

function verify(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  const a = Buffer.from(sig || '', 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(base64urlDecode(payload));
  } catch (e) {
    return null;
  }
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function login(password) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is not set on the server.');
  }
  if (!safeEqual(password, adminPassword)) return null;

  const now = Date.now();
  const token = sign({ role: 'editor', iat: now, exp: now + SESSION_TTL_MS });
  return { token, role: 'editor', expiresAt: new Date(now + SESSION_TTL_MS).toISOString() };
}

function tokenFromEvent(event) {
  const header = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

function requireAuth(event) {
  const token = tokenFromEvent(event);
  const session = token ? verify(token) : null;
  if (!session) return { ok: false, error: 'Sign-in required.', code: 401 };
  return { ok: true, session };
}

export { login, verify, requireAuth, tokenFromEvent };
