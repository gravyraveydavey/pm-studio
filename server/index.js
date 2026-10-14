import { authenticate, checkOrigin, HttpError } from './auth.js';
import { bootstrap, commit, getRecord, listRecords, search, validateChanges } from './database.js';
import { applyChanges } from '../shared/workspace.js';
import { validateWorkspace, projectContext, writeRecord } from './operations.js';
import { handleMcp } from './mcp.js';

const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const maxUpload = 25 * 1024 * 1024;
async function readJson(request) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) throw new HttpError(415, 'Send application/json.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Request body is required.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1024 * 1024) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

async function api(request, env) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path === '/api/session' && request.method === 'GET') return json({ email: env.ADMIN_EMAIL, role: 'Owner' });
  if (path === '/api/workspace' && request.method === 'GET') return json(await bootstrap(env));
  if (path === '/api/sync' && request.method === 'POST') {
    const { version, changes } = await readJson(request);
    const current = await bootstrap(env);
    if (version !== current.version) throw new HttpError(409, 'The workspace changed elsewhere.');
    const validated = validateChanges(changes, env.ADMIN_EMAIL);
    validateWorkspace(applyChanges(current.state, validated));
    return json(await commit(env, version, validated));
  }
  if (path === '/api/export' && request.method === 'GET')
    return json({ format: 'pm-studio-v1', exportedAt: new Date().toISOString(), ...(await bootstrap(env)) }, 200, {
      'Content-Disposition': 'attachment; filename="pm-studio-backup.json"',
    });
  if (path === '/api/search' && request.method === 'GET') return json(await search(env, url.searchParams.get('q')));
  const upload = path.match(/^\/api\/uploads\/([a-zA-Z0-9_-]{1,100})$/);
  if (upload && request.method === 'PUT') {
    const size = Number(request.headers.get('Content-Length'));
    if (!Number.isSafeInteger(size) || size <= 0 || size > maxUpload) throw new HttpError(413, 'Files must be between 1 byte and 25 MB.');
    const project = url.searchParams.get('project'),
      task = url.searchParams.get('task');
    await getRecord(env, 'projects', project);
    if (task && (await getRecord(env, 'tasks', task)).project !== project) throw new HttpError(400, 'Task belongs to another project.');
    const name = [...(url.searchParams.get('name') || 'attachment')]
      .filter(c => c.charCodeAt(0) >= 32)
      .join('')
      .slice(0, 250);
    const objectKey = `files/${upload[1]}/${crypto.randomUUID()}`;
    // Preserve the request's known-length stream: R2 cannot consume an arbitrary
    // TransformStream, and buffering a file would waste Worker memory and CPU.
    await env.FILES.put(objectKey, request.body, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { filename: name } });
    return json({ objectKey, bytes: size, name });
  }
  const file = path.match(/^\/api\/files\/([a-zA-Z0-9_-]{1,100})\/download$/);
  if (file && request.method === 'GET') {
    const row = await getRecord(env, 'files', file[1]);
    if (!row.objectKey || !row.objectKey.startsWith(`files/${row.id}/`)) throw new HttpError(404, 'This attachment has no stored file.');
    const object = await env.FILES.get(row.objectKey);
    if (!object) throw new HttpError(404, 'File not found.');
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(object.size),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        'Cache-Control': 'private, no-store',
      },
    });
  }
  const context = path.match(/^\/api\/projects\/([a-zA-Z0-9_-]{1,100})\/context$/);
  if (context && request.method === 'GET') return json(await projectContext(env, context[1]));
  const record = path.match(/^\/api\/(projects|tasks|comments|files|members|teams|activity|events)(?:\/([a-zA-Z0-9_-]{1,100}))?$/);
  if (record) {
    const [, table, id] = record;
    if (request.method === 'GET') return json(id ? await getRecord(env, table, id) : await listRecords(env, table, url.searchParams.get('project')));
    if ((request.method === 'POST' && !id) || (request.method === 'PATCH' && id)) {
      const { version, ...input } = await readJson(request);
      return json(await writeRecord(env, table, input, id, version), id ? 200 : 201);
    }
  }
  throw new HttpError(404, 'Endpoint not found.');
}

export default {
  async fetch(request, env) {
    let response;
    try {
      // Authenticate assets too, so an alternate hostname can never bypass Access.
      const identity = await authenticate(request, env);
      checkOrigin(request);
      const path = new URL(request.url).pathname;
      if (identity.readOnly && !['GET', 'HEAD'].includes(request.method) && path !== '/mcp') throw new HttpError(403, 'This agent has read-only access.');
      if (path === '/mcp') response = await handleMcp(request, env, identity);
      else if (path.startsWith('/api/')) response = await api(request, env);
      else response = await env.ASSETS.fetch(request);
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('Request failed:', error.message);
      response = json({ error: error instanceof HttpError ? error.message : 'Unable to complete the request. Please retry.' }, error.status || 500);
    }
    const secured = new Response(response.body, response);
    secured.headers.set('X-Content-Type-Options', 'nosniff');
    secured.headers.set('Referrer-Policy', 'same-origin');
    secured.headers.set('X-Frame-Options', 'DENY');
    secured.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    secured.headers.set('Cache-Control', 'private, no-store');
    return secured;
  },
};
