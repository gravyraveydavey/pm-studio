import test from 'node:test';
import assert from 'node:assert/strict';
import { clone, initialState, diffStates, rebaseState, applyChanges } from '../shared/workspace.js';
import { authenticate, authorizeClaims, checkOrigin } from '../server/auth.js';
import { validateChanges } from '../server/database.js';
import { validateWorkspace } from '../server/operations.js';
import worker from '../server/index.js';

test('independent browser and agent record edits merge without losing either edit', () => {
  const base = initialState();
  base.data.projects = [
    { id: 'p1', name: 'One' },
    { id: 'p2', name: 'Two' },
  ];
  const local = clone(base),
    remote = clone(base);
  local.data.projects[0].name = 'Local';
  remote.data.projects[1].name = 'Agent';
  const result = rebaseState(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(
    result.state.data.projects.map(p => p.name),
    ['Local', 'Agent'],
  );
});
test('different edits to the same record are preserved as a conflict', () => {
  const base = initialState();
  base.data.projects = [{ id: 'p1', name: 'Original' }];
  const local = clone(base),
    remote = clone(base);
  local.data.projects[0].name = 'Local';
  remote.data.projects[0].name = 'Remote';
  const result = rebaseState(base, local, remote);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.state.data.projects[0].name, 'Local');
});
test('project removals are sequenced after task removals, preserving valid intermediate batches', () => {
  const base = initialState();
  base.data.projects = [{ id: 'p1' }];
  base.data.tasks = [{ id: 't1', project: 'p1' }];
  const next = clone(base);
  next.data.projects = [];
  next.data.tasks = [];
  const changes = diffStates(base, next);
  assert.deepEqual(
    changes.map(c => c.table),
    ['tasks', 'projects'],
  );
  assert.deepEqual(applyChanges(base, changes), next);
});
test('workspace owner cannot be removed or replaced', () => {
  assert.throws(() => validateChanges([{ table: 'members', id: 'm1', value: null }], 'dave@creativerandom.com'), /owner/);
  const state = initialState();
  state.data.tasks.push({ id: 't1', project: 'missing' });
  assert.throws(() => validateWorkspace(state), /existing project/);
});
test('development authentication accepts only local addresses', async () => {
  const env = { DEV_AUTH: '1', ADMIN_EMAIL: 'dave@creativerandom.com' };
  assert.equal((await authenticate(new Request('http://localhost:8787/api/workspace'), env)).email, env.ADMIN_EMAIL);
  await assert.rejects(authenticate(new Request('https://pm-studio.example.workers.dev/api/workspace'), env), /not configured/);
});
test('production assets and API fail closed before Access is configured', async () => {
  for (const path of ['/', '/assets/app.js', '/api/workspace', '/mcp']) {
    const response = await worker.fetch(new Request(`https://example.workers.dev${path}`), { DEV_AUTH: '1' });
    assert.equal(response.status, 503);
  }
});
test('spoofed identity headers and malformed JWTs cannot authenticate', async () => {
  const env = { ADMIN_EMAIL: 'dave@creativerandom.com', ACCESS_TEAM_DOMAIN: 'example.cloudflareaccess.com', ACCESS_AUD: 'private-audience' };
  const headers = { 'Cf-Access-Authenticated-User-Email': env.ADMIN_EMAIL };
  await assert.rejects(authenticate(new Request('https://example.workers.dev/', { headers }), env), /Sign in/);
  headers['Cf-Access-Jwt-Assertion'] = 'not-a-jwt';
  await assert.rejects(authenticate(new Request('https://example.workers.dev/', { headers }), env), /expired/);
});

test('service identities must be explicitly allowed and retain their read-only scope', () => {
  const env = { ADMIN_EMAIL: 'dave@creativerandom.com', ACCESS_READ_SERVICE_IDS: 'read-client.access' };
  assert.deepEqual(authorizeClaims({ common_name: 'read-client.access' }, env), { service: true, readOnly: true });
  assert.throws(() => authorizeClaims({ common_name: 'other-client.access' }, env), /private/);
  assert.throws(() => authorizeClaims({ email: 'someone@creativerandom.com' }, env), /private/);
});

test('Access redirects can navigate to the app while cross-site API requests stay blocked', () => {
  const url = 'https://pm-studio.dave-1b0.workers.dev/';
  assert.doesNotThrow(() => checkOrigin(new Request(url, { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } })));
  assert.throws(
    () => checkOrigin(new Request(url + 'api/sync', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } })),
    /Cross-site/,
  );
  assert.throws(() => checkOrigin(new Request(url + 'api/workspace', { headers: { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'cors' } })), /Cross-site/);
  assert.throws(
    () => checkOrigin(new Request(url, { headers: { Origin: 'https://other.example', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate' } })),
    /Cross-origin/,
  );
});
