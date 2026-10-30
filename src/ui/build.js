// Strela — informations du build (version, tests, date, commit), lues dans <div id="build"> d'index.html,
// rempli par tools/build-site.mjs. En local, sans build : « dev ».
const el = document.getElementById('build');
const read = k => (el && el.querySelector(`[data-k="${k}"]`)?.textContent.trim()) || '';

export const BUILD = Object.freeze({
  version: read('version') || 'dev',
  pass: read('pass') || '—',
  total: read('total') || '—',
  date: read('date') || '—',
  commit: read('commit') || 'local',
});
