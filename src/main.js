/* =====================================================================
   ENTRY: styles, then every module in dependency order (several register
   global listeners or add handlers to the action table when they load), then boot.
   ===================================================================== */
import './styles/index.css';
import './core/utils.js';
import './core/icons.js';
import './core/constants.js';
import './data/seed.js';
import './core/store.js';
import './ui/helpers.js';
import './core/theme.js';
import './ui/toast.js';
import './ui/select.js';
import './shell/render.js';
import './shell/layout.js';
import './shell/skeletons.js';
import './shell/view-engine.js';
import './components/task-list.js';
import './pages/home.js';
import './pages/overview.js';
import './pages/my-tasks.js';
import './pages/tasks.js';
import './pages/inbox.js';
import './pages/notifications.js';
import './pages/favorites.js';
import './pages/projects.js';
import './pages/members.js';
import './pages/activity.js';
import './pages/search.js';
import './pages/errors.js';
import './pages/project.js';
import './views/project-overview.js';
import './views/board.js';
import './views/table.js';
import './views/calendar.js';
import './views/timeline.js';
import './views/files.js';
import './overlays/drawer.js';
import './overlays/modals.js';
import './overlays/popovers.js';
import './overlays/context-menu.js';
import './overlays/palette.js';
import './pages/settings.js';
import './pages/auth.js';
import './pages/design-system.js';
import './actions/actions.js';
import './actions/events.js';
import './actions/keyboard.js';
import './actions/drag-drop.js';
import './features/teams.js';
import './features/subtasks.js';
import './features/archive.js';
import './actions/teams.js';
import './actions/subtasks.js';
import './actions/archive.js';
import './actions/cloudflare.js';
import { S, D, persistence } from './core/store.js';
import { A } from './actions/actions.js';
import { ROUTE_NAMES, render, go } from './shell/render.js';
import { syncBanner } from './shell/layout.js';

(async function init() {
  document.documentElement.lang = 'en';
  if (!document.getElementById('sr-live')) {
    const l = document.createElement('div');
    l.id = 'sr-live';
    l.className = 'sr';
    l.setAttribute('aria-live', 'polite');
    document.body.appendChild(l);
  }
  document.getElementById('app').innerHTML = '<main class="page"><h1>Opening your workspace…</h1></main>';
  try {
    await persistence.connect();
  } catch (error) {
    document.getElementById('app').innerHTML =
      '<main class="page"><h1>Unable to open your workspace</h1><p id="boot-error" role="alert"></p><button class="btn btn-primary" id="boot-retry">Reload and try again</button></main>';
    document.getElementById('boot-error').textContent = error.message;
    document.getElementById('boot-retry').onclick = () => location.reload();
    return;
  }
  const h = (location.hash || '').slice(1);
  S.ui.route = ROUTE_NAMES[h] ? h : S.prefs.home || 'home';
  render();
})();

window.addEventListener('workspace-sync', event => {
  S.ui.sync = event.detail;
  const banner = document.getElementById('workspace-sync-status');
  if (banner) banner.outerHTML = syncBanner();
});
window.addEventListener('workspace-refresh', () => {
  if (S.ui.drawer && !D().tasks.some(t => t.id === S.ui.drawer)) S.ui.drawer = null;
  if (S.ui.route === 'project' && !D().projects.some(p => p.id === S.ui.params.id)) go('projects');
  else render();
});

// Poll while visible to pick up agent edits; tab focus also refreshes immediately.
setInterval(() => {
  if (document.visibilityState === 'visible') void persistence.refresh();
}, 30000);

// Dev-only handle for debugging and screenshot tooling; stripped from production builds.
if (import.meta.env.DEV) window.__gr8r = { S, D, A, go, render };
