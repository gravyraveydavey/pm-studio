import { clone, diffStates, applyChanges, rebaseState } from '../../shared/workspace.js';

export async function apiRequest(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(30000), ...options });
  const body = await response.json().catch(() => ({ error: 'Your sign-in may have expired. Reload to sign in again.' }));
  if (!response.ok) throw Object.assign(new Error(body.error || 'The request failed.'), { status: response.status });
  return body;
}

export function createPersistence({ key, getState, setState }) {
  let base,
    version = 0,
    saving = false,
    timer,
    connected = false,
    blocked = false;
  const notify = (status, message = '') => window.dispatchEvent(new CustomEvent('workspace-sync', { detail: { status, message } }));
  const dirty = () => base && diffStates(base, getState()).length > 0;
  function cache() {
    try {
      localStorage.setItem(key, JSON.stringify({ state: getState(), base, version, pending: !!dirty() }));
    } catch {
      /* Server persistence remains authoritative when browser storage is unavailable. */
    }
  }
  async function connect() {
    const remote = await apiRequest('/api/workspace');
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(key));
    } catch {
      /* No recoverable draft. */
    }
    base = clone(remote.state);
    version = remote.version;
    if (
      draft?.pending &&
      draft.base &&
      draft.state?.data?.members?.find(m => m.id === 'm1')?.email === remote.state.data.members.find(m => m.id === 'm1')?.email
    ) {
      const rebased = rebaseState(draft.base, draft.state, remote.state);
      setState(rebased.state);
      blocked = rebased.conflicts.length > 0;
    } else setState(remote.state);
    connected = true;
    notify(
      blocked ? 'conflict' : 'saved',
      blocked ? 'Unsaved edits conflict with changes saved elsewhere. Download them before reloading.' : 'All changes saved',
    );
    cache();
    if (!blocked && dirty()) schedule();
  }
  function schedule() {
    if (!connected) return;
    cache();
    if (blocked) return;
    notify('saving', 'Saving changes…');
    clearTimeout(timer);
    timer = setTimeout(() => {
      void flush();
    }, 200);
  }
  async function flush() {
    clearTimeout(timer);
    if (saving) return false;
    if (!connected || blocked) return false;
    saving = true;
    try {
      let retries = 0;
      while (dirty()) {
        const changes = diffStates(base, getState()).slice(0, 30);
        try {
          const result = await apiRequest('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version, changes }),
          });
          version = result.version;
          base = applyChanges(base, changes);
          cache();
        } catch (error) {
          if (error.status !== 409 || ++retries > 3) throw error;
          const remote = await apiRequest('/api/workspace');
          const rebased = rebaseState(base, getState(), remote.state);
          if (rebased.conflicts.length) {
            blocked = true;
            throw Object.assign(new Error('This workspace changed elsewhere. Your unsaved edits are kept on this device. Download them before reloading.'), {
              conflict: true,
            });
          }
          base = clone(remote.state);
          version = remote.version;
          setState(rebased.state);
          window.dispatchEvent(new Event('workspace-refresh'));
        }
      }
      notify('saved', 'All changes saved');
      cache();
      return true;
    } catch (error) {
      cache();
      notify(error.conflict ? 'conflict' : 'error', error.message);
      return false;
    } finally {
      saving = false;
    }
  }
  async function refresh() {
    if (!connected || saving || dirty() || blocked) return;
    try {
      const remote = await apiRequest('/api/workspace');
      // Edits may have begun while the request was in flight.
      if (saving || dirty() || blocked || remote.version === version) return;
      base = clone(remote.state);
      version = remote.version;
      setState(remote.state);
      cache();
      window.dispatchEvent(new Event('workspace-refresh'));
    } catch {
      /* A read failure never replaces the current workspace. */
    }
  }
  function exportDraft() {
    const blob = new Blob([JSON.stringify({ format: 'pm-studio-v1', state: getState(), version, exportedAt: new Date().toISOString() }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'pm-studio-unsaved-backup.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function reloadSaved() {
    exportDraft();
    const remote = await apiRequest('/api/workspace');
    base = clone(remote.state);
    version = remote.version;
    blocked = false;
    setState(remote.state);
    cache();
    notify('saved', 'Saved workspace loaded');
    window.dispatchEvent(new Event('workspace-refresh'));
  }
  window.addEventListener('online', () => {
    void flush();
  });
  window.addEventListener('focus', () => {
    void refresh();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  window.addEventListener('beforeunload', event => {
    if (dirty()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  return { connect, schedule, flush, refresh, exportDraft, reloadSaved, canEdit: () => connected && !blocked, isDirty: dirty };
}
