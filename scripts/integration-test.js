// Uses only the disposable local D1/R2 emulator. Never point this at production.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const origin = 'http://localhost:8787';
async function request(path, method = 'GET', body) {
  const response = await fetch(origin + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, body: json };
}
let snapshot = (await request('/api/workspace')).body;
assert.ok(Number.isInteger(snapshot.version));
let result = await request('/api/projects', 'POST', {
  version: snapshot.version,
  name: `Integration ${crypto.randomUUID()}`,
  desc: 'Cloudflare knowledgebase feasibility',
});
assert.equal(result.status, 201, JSON.stringify(result));
const project = result.body.record;
let version = result.body.version;
result = await request('/api/tasks', 'POST', { version, project: project.id, title: 'Verify durable persistence', desc: 'A searchable migration checklist' });
assert.equal(result.status, 201, JSON.stringify(result));
const task = result.body.record;
version = result.body.version;
result = await request('/api/comments', 'POST', { version, task: task.id, text: 'Verified from a separate API request.' });
assert.equal(result.status, 201, JSON.stringify(result));
version = result.body.version;
const stale = await request(`/api/tasks/${task.id}`, 'PATCH', { version: version - 1, title: 'Stale overwrite' });
assert.equal(stale.status, 409);
assert.equal((await request(`/api/tasks/${task.id}`)).body.title, task.title);
snapshot = (await request('/api/workspace')).body;
const races = await Promise.all(
  ['First', 'Second'].map(title =>
    request('/api/sync', 'POST', { version: snapshot.version, changes: [{ table: 'tasks', id: task.id, value: { ...task, title } }] }),
  ),
);
assert.deepEqual(races.map(r => r.status).sort(), [200, 409]);
assert.equal((await request(`/api/tasks/${task.id}`)).body.title, races.find(r => r.status === 200) === races[0] ? 'First' : 'Second');
const bytes = 'PM Studio attachment round trip';
const fileId = crypto.randomUUID();
const uploadResponse = await fetch(`${origin}/api/uploads/${fileId}?name=proof.txt&project=${project.id}&task=${task.id}`, { method: 'PUT', body: bytes });
const uploaded = await uploadResponse.json();
assert.equal(uploadResponse.status, 200, JSON.stringify(uploaded));
snapshot = (await request('/api/workspace')).body;
const file = { id: fileId, ...uploaded, project: project.id, task: task.id, type: 'doc', size: '31 B', by: 'm1', at: Date.now() };
assert.equal((await request('/api/sync', 'POST', { version: snapshot.version, changes: [{ table: 'files', id: fileId, value: file }] })).status, 200);
assert.equal(await (await fetch(`${origin}/api/files/${fileId}/download`)).text(), bytes);
assert.ok((await request('/api/search?q=migration')).body.some(r => r.id === task.id));
assert.ok((await request(`/api/projects/${project.id}/context`)).body.comments.length);
assert.ok((await request('/api/export')).body.state.data.tasks.some(t => t.id === task.id));
const crossOrigin = await fetch(origin + '/api/workspace', { headers: { Origin: 'https://other.example' } });
assert.equal(crossOrigin.status, 403);
const client = new Client({ name: 'integration-test', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp')));
const tools = await client.listTools();
assert.ok(tools.tools.some(t => t.name === 'search_workspace'));
const found = await client.callTool({ name: 'search_workspace', arguments: { query: 'migration' } });
assert.ok(found.content[0].text.includes(task.id));
await client.close();
console.log('Passed: D1 CRUD, fresh reads, stale and concurrent write rejection, R2 round trip, FTS, export, origin protection and MCP SDK connection.');
