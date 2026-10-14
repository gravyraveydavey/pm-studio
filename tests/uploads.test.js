import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareUpload } from '../src/core/uploads.js';
import { createPersistence } from '../src/core/persistence.js';
import { initialState, clone } from '../shared/workspace.js';

test('file selection survives input reset and drop event cleanup during a save', async () => {
  const files = [new File(['first'], 'first.txt'), new File(['second'], 'second.txt')];
  const selected = [...files];
  let finishSave;
  const saved = new Promise(resolve => {
    finishSave = resolve;
  });
  const pending = prepareUpload(selected, { canEdit: () => true, flush: () => saved });
  // The input handler resets the picker immediately; drop events also expire after dispatch.
  selected.length = 0;
  finishSave(true);
  assert.deepEqual(await pending, files);
});

test('an upload waits for an active save and for edits made during that save', async t => {
  const state = initialState();
  const remote = clone(state);
  const windowMock = new EventTarget();
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/workspace') return Response.json({ state: remote, version: 0 });
    const payload = JSON.parse(options.body);
    saves.push(payload);
    if (saves.length === 1) await gate;
    return Response.json({ version: payload.version + 1 });
  });
  for (const [key, value] of Object.entries({
    window: windowMock,
    document: new EventTarget(),
    localStorage: { getItem: () => null, setItem: () => {} },
  })) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    });
  }
  let finishSave;
  const gate = new Promise(resolve => {
    finishSave = resolve;
  });
  const saves = [];
  const persistence = createPersistence({ key: 'test', getState: () => state, setState: value => Object.assign(state, value) });
  await persistence.connect();
  state.data.projects.push({ id: 'p1', name: 'Upload project' });
  const activeSave = persistence.flush();
  await Promise.resolve();
  assert.equal(saves.length, 1);
  state.data.tasks.push({ id: 't1', project: 'p1', title: 'New task' });
  const file = new File(['attachment'], 'attachment.txt');
  const pending = prepareUpload([file], persistence);
  const result = pending.then(
    value => ({ value }),
    error => ({ error }),
  );
  finishSave();
  assert.equal(await activeSave, true);
  assert.deepEqual(await result, { value: [file] });
  assert.equal(saves.length, 2);
  assert.equal(persistence.isDirty(), false);
  assert.equal(await persistence.flush(), true);
  state.data.tasks[0].title = 'Edited after upload';
  assert.equal(await persistence.flush(), true);
  assert.equal(saves.length, 3);
  assert.equal(persistence.isDirty(), false);
});
