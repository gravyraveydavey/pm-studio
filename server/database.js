import { drizzle } from 'drizzle-orm/d1';
import { eq, sql } from 'drizzle-orm';
import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import * as schema from './schema.js';
import { COLLECTIONS, TABLES, initialState, records } from '../shared/workspace.js';
import { HttpError } from './auth.js';

export const dbFor = env => drizzle(env.DB);
const columns = value => ({
  payload: value,
  project: value.project || null,
  title: value.title || value.name || '',
  body: value.desc || value.text || '',
  updated: Date.now(),
});

export async function bootstrap(env) {
  const db = dbFor(env);
  const state = initialState(env.ADMIN_EMAIL);
  if (!(await db.select().from(schema.workspace).get())) {
    const r = records(state);
    await db.batch([
      db.insert(schema.workspace).values({ id: 1 }).onConflictDoNothing(),
      db
        .insert(schema.settings)
        .values({ id: 'main', ...columns(r.settings.get('main')) })
        .onConflictDoNothing(),
      db
        .insert(schema.members)
        .values({ id: 'm1', ...columns(state.data.members[0]) })
        .onConflictDoNothing(),
    ]);
  }
  // One D1 batch gives a consistent snapshot, including its revision.
  const result = await db.batch([db.select().from(schema.workspace), ...TABLES.map(table => db.select().from(schema[table]))]);
  const [meta, ...collections] = result;
  const settings = collections[TABLES.indexOf('settings')].find(row => row.id === 'main')?.payload;
  const loaded = { ...state, ...settings, data: { ...state.data, ...settings?.data } };
  COLLECTIONS.forEach((table, index) => {
    loaded.data[table] = collections[index].map(row => row.payload);
  });
  loaded.data.activity.sort((a, b) => b.at - a.at);
  loaded.data.notifs.sort((a, b) => b.at - a.at);
  loaded.data.me = 'm1';
  return { version: meta[0].version, state: loaded };
}

export function validateChanges(changes, email) {
  if (!Array.isArray(changes) || !changes.length || changes.length > 30) throw new HttpError(400, 'Send between 1 and 30 record changes.');
  const seen = new Set();
  return changes.map(change => {
    const { table, id, value } = change;
    if (!TABLES.includes(table) || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new HttpError(400, 'Invalid record.');
    const key = `${table}/${id}`;
    if (seen.has(key)) throw new HttpError(400, 'Duplicate record change.');
    seen.add(key);
    if (table === 'settings' && (id !== 'main' || !value || !value.data || !value.prefs || !value.views))
      throw new HttpError(400, 'Invalid workspace settings.');
    if (value !== null && (typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 150000))
      throw new HttpError(400, 'Invalid or oversized record.');
    if (value && table !== 'settings' && value.id !== id) throw new HttpError(400, 'Record ID mismatch.');
    if (table === 'members' && id === 'm1' && (!value || value.email !== email || value.role !== 'Owner'))
      throw new HttpError(400, 'The workspace owner cannot be removed or changed.');
    if (table === 'settings' && value) value.data.me = 'm1';
    return { table, id, value };
  });
}

export async function commit(env, version, changes) {
  if (!Number.isSafeInteger(version) || version < 0) throw new HttpError(400, 'A workspace version is required.');
  changes = validateChanges(changes, env.ADMIN_EMAIL);
  const db = dbFor(env),
    token = crypto.randomUUID();
  const guard = sql`exists (select 1 from workspace where id = 1 and last_commit = ${token})`;
  const statements = [
    db
      .update(schema.workspace)
      .set({ version: sql`${schema.workspace.version} + 1`, lastCommit: token })
      .where(eq(schema.workspace.version, version))
      .toSQL(),
  ];
  for (const { table, id, value } of changes) {
    const t = schema[table];
    if (value === null)
      statements.push(
        db
          .delete(t)
          .where(sql`${t.id} = ${id} and ${guard}`)
          .toSQL(),
      );
    else {
      const row = columns(value);
      // The CAS and every dependent change run in one atomic D1 batch. The unique
      // commit token prevents a losing writer from modifying any rows.
      statements.push(
        new SQLiteAsyncDialect().sqlToQuery(sql`insert into ${t} (id, payload, project, title, body, updated)
        select ${id}, ${JSON.stringify(value)}, ${row.project}, ${row.title}, ${row.body}, ${row.updated} where ${guard}
        on conflict(id) do update set payload=excluded.payload, project=excluded.project, title=excluded.title, body=excluded.body, updated=excluded.updated`),
      );
    }
  }
  // D1's native batch accepts both Drizzle queries and the conditional SQL above;
  // Drizzle's batch helper does not support SQLiteRaw queries on this driver.
  const result = await env.DB.batch(statements.map(query => env.DB.prepare(query.sql).bind(...query.params)));
  if (!result[0].meta.changes) throw new HttpError(409, 'The workspace changed elsewhere. Refresh before saving.');
  return { version: version + 1 };
}

export async function listRecords(env, table, project) {
  const db = dbFor(env),
    t = schema[table];
  if (!COLLECTIONS.includes(table)) throw new HttpError(404, 'Unknown collection.');
  const query = db.select().from(t);
  const rows = await (project ? query.where(eq(t.project, project)) : query).limit(500).all();
  return rows.map(row => row.payload);
}

export async function getRecord(env, table, id) {
  if (!COLLECTIONS.includes(table)) throw new HttpError(404, 'Unknown collection.');
  const t = schema[table];
  const row = await dbFor(env).select().from(t).where(eq(t.id, id)).get();
  if (!row) throw new HttpError(404, 'Record not found.');
  return row.payload;
}

export async function search(env, query) {
  if (!query?.trim()) return [];
  const terms = query
    .trim()
    .slice(0, 200)
    .split(/\s+/)
    .map(term => `"${term.replaceAll('"', '""')}"`)
    .join(' AND ');
  const result = await env.DB.prepare(
    "SELECT collection, id, title, snippet(knowledge_search, 3, '', '', '…', 32) AS excerpt FROM knowledge_search WHERE knowledge_search MATCH ? ORDER BY rank LIMIT 50",
  )
    .bind(terms)
    .all();
  return result.results;
}
