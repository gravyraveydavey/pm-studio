import { createRemoteJWKSet, jwtVerify } from 'jose';

const keys = new Map();
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function authenticate(request, env) {
  const url = new URL(request.url);
  if (env.DEV_AUTH === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return { email: env.ADMIN_EMAIL, local: true };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw new HttpError(503, 'Private access is not configured yet.');
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) throw new HttpError(401, 'Sign in through Cloudflare Access.');
  const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
  if (!keys.has(issuer)) keys.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys.get(issuer), { issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'] }));
  } catch {
    throw new HttpError(401, 'Your sign-in has expired. Please sign in again.');
  }
  return authorizeClaims(payload, env);
}

export function authorizeClaims(payload, env) {
  if (String(payload.email || '').toLowerCase() === env.ADMIN_EMAIL.toLowerCase()) return { email: env.ADMIN_EMAIL };
  const includes = key =>
    (env[key] || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .includes(payload.common_name);
  if (payload.common_name && includes('ACCESS_READ_SERVICE_IDS')) return { service: true, readOnly: true };
  if (payload.common_name && includes('ACCESS_WRITE_SERVICE_IDS')) return { service: true, readOnly: false };
  throw new HttpError(403, 'This workspace is private.');
}

export function checkOrigin(request) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) throw new HttpError(403, 'Cross-origin requests are not allowed.');
  // Access returns users from its separate sign-in hostname. A top-level GET
  // navigation is safe after JWT validation; cross-site API calls remain blocked.
  const navigation = request.method === 'GET' && request.headers.get('Sec-Fetch-Mode') === 'navigate';
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' && !navigation) throw new HttpError(403, 'Cross-site requests are not allowed.');
}
