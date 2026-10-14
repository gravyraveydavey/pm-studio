import { A, IN } from './actions.js';
import { S, D, persistence, save } from '../core/store.js';
import { initialState, COLLECTIONS } from '../../shared/workspace.js';
import { toast } from '../ui/toast.js';
import { render } from '../shell/render.js';

A.retrySave = () => {
  void persistence.flush();
};
A.exportDraft = () => persistence.exportDraft();
A.reloadSaved = () => {
  void persistence.reloadSaved().catch(error => toast(error.message, { kind: 'err' }));
};
A.exportWorkspace = async () => {
  if (!(await persistence.flush())) return toast('Save your changes first, or download your unsaved changes.', { kind: 'err' });
  location.assign('/api/export');
};
const personalOnly = () => toast('This workspace is private to your Cloudflare Access account.', { kind: 'info' });
for (const action of [
  'invite',
  'share',
  'newWorkspace',
  'startOnboarding',
  'resetDemo',
  'delWorkspace',
  'socialAuth',
  'doLogin',
  'doSignup',
  'doReset',
  'setup2fa',
  'savePassword',
  'shareInvite',
  'resendInvite',
  'copyInviteLink',
])
  A[action] = personalOnly;
A.retryOnline = () => {
  S.ui.offline = false;
  void persistence.flush();
  render();
};
A.dupFile = () => toast('Download and upload the attachment to create another copy.', { kind: 'info' });
A.newTask = (
  original =>
  (...args) => {
    if (!D().projects.some(p => !p.archived)) {
      toast('Create a project first.', { kind: 'info' });
      return A.newProject();
    }
    return original(...args);
  }
)(A.newTask);

IN.importWorkspace = async el => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  if (!persistence.canEdit() || !(await persistence.flush())) return toast('Save your changes before importing.', { kind: 'err' });
  // Imports merge records into an empty personal workspace, never replace existing projects.
  if (D().projects.length || D().tasks.length) return toast('Import is available in an empty workspace. Export a backup first.', { kind: 'err' });
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Choose a JSON backup under 5 MB.');
    const parsed = JSON.parse(await file.text()),
      imported = parsed.state || parsed;
    if (!imported.data || !Array.isArray(imported.data.projects) || !Array.isArray(imported.data.tasks)) throw new Error('This is not a workspace backup.');
    const state = initialState(D().members.find(m => m.id === 'm1').email);
    for (const key of COLLECTIONS) {
      if (key === 'members') continue;
      if (!Array.isArray(imported.data[key] || [])) throw new Error(`Invalid ${key} collection.`);
      state.data[key] = imported.data[key] || [];
    }
    state.data.ws = imported.data.ws || state.data.ws;
    state.data.workspaces[0].name = state.data.ws.name;
    state.data.projOrder = imported.data.projOrder || state.data.projects.map(p => p.id);
    state.data.members.push(...(imported.data.members || []).filter(m => m.id !== 'm1').map(m => ({ ...m, role: 'Member' })));
    S.data = state.data;
    S.views = imported.views || {};
    save();
    render();
    if (await persistence.flush()) toast('Workspace imported.');
  } catch (error) {
    toast(error.message, { kind: 'err' });
  }
};
