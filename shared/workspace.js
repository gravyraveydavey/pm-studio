// The UI's collections map to separate D1 tables. Presentation state stays in settings.
export const COLLECTIONS = ['members', 'projects', 'tasks', 'comments', 'activity', 'notifs', 'files', 'events', 'savedViews', 'teams'];
export const TABLES = [...COLLECTIONS, 'settings'];
export const clone = value => JSON.parse(JSON.stringify(value));
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function initialState(email = 'dave@creativerandom.com') {
  return {
    data: {
      ...Object.fromEntries(COLLECTIONS.map(key => [key, []])),
      me: 'm1',
      ws: { name: "Dave's workspace", url: 'personal', c: '#5A67D8', brand: true },
      workspaces: [{ id: 'w1', name: "Dave's workspace", c: '#5A67D8', plan: 'Personal', brand: true }],
      members: [{ id: 'm1', name: 'Dave', email, role: 'Owner', team: '', title: '', c: '#5A67D8', status: 'active', last: 0, tz: 'Europe/Istanbul' }],
      projOrder: [],
      recentSearches: [],
      sessions: [],
      invoices: [],
      tfa: false,
      notifPrefs: {},
    },
    prefs: { name: 'Dave', title: '', tz: 'Europe/Istanbul' },
    views: {},
    collapsed: false,
  };
}

export function records(state) {
  const result = {};
  for (const table of COLLECTIONS) result[table] = new Map((state.data[table] || []).map(row => [row.id, row]));
  const data = Object.fromEntries(Object.entries(state.data).filter(([key]) => !COLLECTIONS.includes(key)));
  result.settings = new Map([['main', { data, prefs: state.prefs, views: state.views, collapsed: state.collapsed }]]);
  return result;
}

export function diffStates(base, current) {
  const before = records(base),
    after = records(current),
    changes = [];
  for (const table of TABLES) {
    for (const [id, value] of after[table]) if (!equal(before[table].get(id), value)) changes.push({ table, id, value });
    for (const id of before[table].keys()) if (!after[table].has(id)) changes.push({ table, id, value: null });
  }
  // Create parent projects first, remove their tasks first, update ordering last.
  const priority = change => (change.table === 'settings' ? 100 : change.table === 'projects' ? (change.value === null ? 90 : 0) : 10);
  return changes.sort((a, b) => priority(a) - priority(b));
}

export function applyChanges(state, changes) {
  const next = clone(state);
  for (const { table, id, value } of changes) {
    if (table === 'settings') {
      const collections = Object.fromEntries(COLLECTIONS.map(key => [key, next.data[key] || []]));
      Object.assign(next, clone(value));
      next.data = { ...next.data, ...collections };
      continue;
    }
    const rows = next.data[table] || (next.data[table] = []);
    const index = rows.findIndex(row => row.id === id);
    if (value === null) {
      if (index >= 0) rows.splice(index, 1);
    } else if (index >= 0) rows[index] = clone(value);
    else rows.push(clone(value));
  }
  return next;
}

// Reapply edits to unaffected records only; conflicting edits are never silently overwritten.
export function rebaseState(base, local, remote) {
  const before = records(base),
    after = records(remote),
    changes = diffStates(base, local);
  const conflicts = changes.filter(
    ({ table, id, value }) => !equal(before[table].get(id), after[table].get(id)) && !equal(value ?? undefined, after[table].get(id)),
  );
  return { conflicts, state: conflicts.length ? local : applyChanges(remote, changes) };
}
