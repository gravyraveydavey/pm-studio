import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { bootstrap, getRecord, listRecords, search } from './database.js';
import { projectContext, writeRecord } from './operations.js';

export async function handleMcp(request, env, identity = {}) {
  const server = new McpServer({ name: 'pm-studio', version: '1.0.0' });
  const output = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const tool = (name, description, inputSchema, run, readOnly = true) =>
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: { readOnlyHint: readOnly, destructiveHint: false, openWorldHint: false },
      },
      async args => {
        try {
          return output(await run(args));
        } catch (error) {
          return { ...output({ error: error.message }), isError: true };
        }
      },
    );
  tool('workspace_version', 'Get the current workspace revision. Supply it to writes; a stale revision is rejected.', {}, async () => ({
    version: (await bootstrap(env)).version,
  }));
  tool('list_projects', 'List personal projects.', {}, () => listRecords(env, 'projects'));
  tool('get_project', 'Read a project with its tasks and comments.', { id: z.string() }, ({ id }) => projectContext(env, id));
  tool('list_tasks', 'List tasks, optionally filtered by project ID.', { project: z.string().optional() }, ({ project }) => listRecords(env, 'tasks', project));
  tool('get_task', 'Read a task by ID.', { id: z.string() }, ({ id }) => getRecord(env, 'tasks', id));
  tool('search_workspace', 'Search project descriptions, tasks and comments using full-text search.', { query: z.string().min(1).max(200) }, ({ query }) =>
    search(env, query),
  );
  if (!identity.readOnly) {
    tool(
      'create_task',
      'Create a task. Requires a current workspace revision.',
      { version: z.number().int().nonnegative(), project: z.string(), title: z.string().min(1).max(1000), desc: z.string().max(100000).optional() },
      ({ version, ...input }) => writeRecord(env, 'tasks', input, null, version),
      false,
    );
    tool(
      'update_task',
      'Update a task title, description or status with revision conflict protection.',
      {
        version: z.number().int().nonnegative(),
        id: z.string(),
        title: z.string().min(1).max(1000).optional(),
        desc: z.string().max(100000).optional(),
        status: z.enum(['backlog', 'todo', 'progress', 'review', 'done']).optional(),
      },
      ({ version, id, ...input }) => writeRecord(env, 'tasks', input, id, version),
      false,
    );
  }
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 1024 * 1024 });
  await server.connect(transport);
  return transport.handleRequest(request);
}
