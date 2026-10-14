import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';

const collection = name =>
  sqliteTable(
    name,
    {
      id: text('id').primaryKey(),
      payload: text('payload', { mode: 'json' }).notNull(),
      project: text('project'),
      title: text('title').notNull().default(''),
      body: text('body').notNull().default(''),
      updated: integer('updated').notNull(),
    },
    table => [index(`${name}_project_idx`).on(table.project)],
  );

export const members = collection('members');
export const projects = collection('projects');
export const tasks = collection('tasks');
export const comments = collection('comments');
export const activity = collection('activity');
export const notifs = collection('notifs');
export const files = collection('files');
export const events = collection('events');
export const savedViews = collection('savedViews');
export const teams = collection('teams');
export const settings = collection('settings');
export const workspace = sqliteTable('workspace', {
  id: integer('id').primaryKey(),
  version: integer('version').notNull().default(0),
  lastCommit: text('last_commit').notNull().default(''),
});
