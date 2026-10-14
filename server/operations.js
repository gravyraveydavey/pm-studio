import { bootstrap, commit, getRecord, listRecords } from './database.js';
import { diffStates, clone } from '../shared/workspace.js';
import { HttpError } from './auth.js';

const statuses = ['backlog', 'todo', 'progress', 'review', 'done'];
export function validateWorkspace(state) {
  const projects = new Set(state.data.projects.map(p => p.id));
  for (const p of state.data.projects) {
    if (typeof p.name !== 'string' || !p.name.trim() || !Array.isArray(p.members)) throw new HttpError(400, 'Projects need a name and member list.');
    if (!['planning', 'active', 'risk', 'hold', 'complete'].includes(p.status) || typeof p.desc !== 'string')
      throw new HttpError(400, 'Invalid project status or description.');
  }
  for (const t of state.data.tasks) {
    if (!projects.has(t.project)) throw new HttpError(400, 'Every task must belong to an existing project.');
    if (typeof t.title !== 'string' || !t.title.trim() || !statuses.includes(t.status)) throw new HttpError(400, 'Invalid task title or status.');
    if (!['none', 'low', 'medium', 'high', 'urgent'].includes(t.priority) || typeof t.desc !== 'string')
      throw new HttpError(400, 'Invalid task priority or description.');
    for (const key of ['due', 'start'])
      if (t[key] != null && (typeof t[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t[key]))) throw new HttpError(400, 'Dates must use YYYY-MM-DD.');
    for (const key of ['subtasks', 'attachments', 'labels', 'deps']) if (!Array.isArray(t[key])) throw new HttpError(400, `Tasks need a ${key} list.`);
  }
  for (const m of state.data.members) {
    if (
      typeof m.name !== 'string' ||
      typeof m.email !== 'string' ||
      !['Owner', 'Admin', 'Member', 'Guest'].includes(m.role) ||
      !/^#[a-fA-F0-9]{3,8}$/.test(m.c)
    )
      throw new HttpError(400, 'Invalid member profile.');
  }
}

export async function writeRecord(env, table, input, id, version) {
  if (!['projects', 'tasks', 'comments'].includes(table)) throw new HttpError(400, 'This collection cannot be written through this endpoint.');
  const snapshot = await bootstrap(env);
  if (version !== snapshot.version) throw new HttpError(409, 'Refresh the workspace version before writing.');
  const next = clone(snapshot.state),
    now = Date.now();
  let row = id ? next.data[table].find(item => item.id === id) : null;
  if (id && !row) throw new HttpError(404, 'Record not found.');
  if (row) {
    const allowed =
      table === 'tasks'
        ? ['title', 'desc', 'status', 'priority', 'assignee', 'due', 'start', 'labels', 'subtasks', 'estimate', 'archived']
        : table === 'projects'
          ? ['name', 'desc', 'status', 'due', 'start', 'color', 'icon', 'archived']
          : ['text'];
    for (const key of Object.keys(input)) if (!allowed.includes(key)) throw new HttpError(400, `Cannot update ${key}.`);
    Object.assign(row, input, { updated: now });
    if (table === 'tasks' && input.status === 'done') row.completedAt = now;
  } else {
    id = crypto.randomUUID();
    if (table === 'projects') {
      if (!input.name?.trim()) throw new HttpError(400, 'Project name is required.');
      const key = `P${next.data.projects.length + 1}-${id.slice(0, 4).toUpperCase()}`;
      row = {
        id,
        key,
        name: input.name,
        desc: input.desc || '',
        status: 'planning',
        color: 'indigo',
        icon: 'folder',
        team: '',
        lead: 'm1',
        members: ['m1'],
        start: null,
        due: null,
        milestones: [],
        last: 0,
        seq: 0,
        fav: false,
      };
      next.data.projOrder.push(id);
    } else if (table === 'tasks') {
      const project = next.data.projects.find(p => p.id === input.project);
      if (!project) throw new HttpError(400, 'An existing project is required.');
      project.seq = (project.seq || 200) + 1;
      row = {
        id,
        key: `${project.key}-${project.seq}`,
        project: project.id,
        title: input.title,
        desc: input.desc || '',
        status: input.status || 'todo',
        priority: input.priority || 'none',
        assignee: 'm1',
        due: input.due || null,
        start: null,
        labels: [],
        subtasks: [],
        attachments: [],
        deps: [],
        estimate: null,
        created: now,
        updated: now,
        order: now,
        fav: false,
        recur: null,
      };
    } else {
      if (!next.data.tasks.some(t => t.id === input.task) || !input.text?.trim()) throw new HttpError(400, 'An existing task and comment text are required.');
      row = { id, task: input.task, by: 'm1', text: input.text, at: now, re: {} };
    }
    next.data[table].push(row);
  }
  validateWorkspace(next);
  next.data.activity.unshift({
    id: crypto.randomUUID(),
    by: 'm1',
    verb: 'updated through API',
    task: table === 'tasks' ? id : null,
    project: table === 'projects' ? id : row.project || null,
    at: now,
    extra: row.title || row.name || '',
  });
  const result = await commit(env, version, diffStates(snapshot.state, next));
  return { ...result, record: row };
}

export async function projectContext(env, id) {
  const [project, tasks, comments] = await Promise.all([getRecord(env, 'projects', id), listRecords(env, 'tasks', id), listRecords(env, 'comments')]);
  const ids = new Set(tasks.map(t => t.id));
  return { project, tasks, comments: comments.filter(c => ids.has(c.task)) };
}
