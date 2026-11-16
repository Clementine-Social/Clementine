// Clementine — Social & People. Every contact card (friends, family, colleagues, nurses), who is free when, find a day,
// meet-ups and the last-seen log, time polls, the wishlist, team treats and birthdays. Split out of Citrus Maxima (16/11/2026):
// Clementine owns people; who works when is read from Mandarin (hub/mandarin/shifts.json). Vanilla ES modules, no build step.
import * as store from './store.js';
import { mergeStates } from './store.js';
import * as G from './google.js';
import * as F from './social.js';
import * as R from './roster.js';
import * as CZ from './custom.js';
import * as HUB from './hub.js';
import * as MIG from './migrate.js';
import * as SU from './social-ui.js';
import * as PU from './people-ui.js';
import * as XU from './plans-ui.js';
import * as PE from './person-ui.js';
import { checkBackup, describeCounts } from './backup-check.js';
import { h, toast, keyOf, fromKey, addDays, startOfDay, fmtDate, pad2, DAY_NAMES, MONTHS, uid } from './util.js';

export const VERSION = '1.1.0';
const CITRUS_URL = 'https://amaerys.github.io/citrus-maxima/';
const MANDARIN_URL = 'https://mandarin-work.github.io/Mandarin/';

// ---------------- runtime state (not persisted) ----------------
const rt = {
  view: 'today',
  events: {},             // dateKey -> events[] (Google Calendar), for "you are busy then"
  eventsLoaded: {},
  calendars: [],
  syncing: false,
  online: navigator.onLine,
  hub: { at: 0, shiftsAt: '' },
  fromCitrus: false,
};
const $ = (s, el = document) => el.querySelector(s);
const S = () => store.get();

// ---------------- boot ----------------
async function boot() {
  applyTheme(); watchSheets(); applyTiming();
  for (const b of document.querySelectorAll('nav.tabs button')) b.addEventListener('click', () => go(b.dataset.view));
  $('#btnRefresh').addEventListener('click', () => refreshAll(true));
  $('#btnMore').addEventListener('click', () => show('more'));
  $('#btnSearch').addEventListener('click', () => openSearch());
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if (e.key === 'Escape') { const sr = document.querySelector('.search'); if (sr) { sr.remove(); e.stopImmediatePropagation(); return; } closeTopSheet(); return; }
    if (typing) return;
    if (e.key === '/' && !document.querySelector('.search')) { openSearch(); e.preventDefault(); return; }
    if (document.querySelector('.sheet-bg, .search')) return;   // tab shortcuts never switch the page behind a sheet
    const tabs = CZ.visibleTabs(S());
    if (/^[1-5]$/.test(e.key) && tabs[+e.key - 1]) { show(tabs[+e.key - 1]); e.preventDefault(); }
    else if (e.key === 'r') { if (!rt.online) toast('Offline — Clementine syncs when you are back online'); else refreshAll(true); }
    else if (e.key === ',') show('more');
    else if (e.key === 'f') { SU.findSheet(); e.preventDefault(); }
    else if (e.key === 'i') { SU.inviteSheet([]); e.preventDefault(); }
    else if (e.key === 'l') { SU.outingSheet(null); e.preventDefault(); }
    else if (e.key === 'c') { PE.touchSheet(); e.preventDefault(); }
    else if (e.key === 'a') { PE.availabilitySheet(); e.preventDefault(); }
    else if (e.key === '?') { shortcutsSheet(); e.preventDefault(); }
  });
  window.addEventListener('online', () => { rt.online = true; renderSync(); flushOutbox().then(render).catch(() => {}); });
  window.addEventListener('offline', () => { rt.online = false; renderSync(); });
  const sub = { S, update: (fn) => store.update(fn), revert: store.revert, sheet: (c) => sheet(c), render: () => render(), go: (v, p) => go(v, p), busyOf, addEvent, removeEvent, signedIn: () => G.isSignedIn() || G.wasSignedIn(), personSheet: (k) => PU.personSheet(k), freePart: SU.freePart };
  SU.initSocial(sub); PU.initPeople(sub); XU.initPlans(sub); PE.initPerson(sub);
  store.subscribe(() => { applyTiming(); render(); publishSoon(); });
  store.onRemoteSync(scheduleRemoteSave);
  loadCachedEvents(); R.load(); loadHubCache();
  handleIncoming();
  if (!rt.handled) show(location.hash.replace('#', '') || CZ.custom(S()).start);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  const cid = S().settings.clientId;
  G.onAuthChange(() => { renderSync(); render(); });
  G.renewOnTap(() => { render(); refreshAll(false); });   // the hourly token renews on your next tap (phones only allow Google's window inside a tap)
  if (cid && rt.online) {
    try { await G.init(cid); } catch (e) { console.warn(e); }
    if (G.isSignedIn()) refreshAll(false);
    else if (G.wasSignedIn()) { G.auth.needsSignIn = true; render(); }
  }
  navigator.storage?.persist?.().then(ok => { rt.storagePersisted = ok; }).catch(() => {});
  navigator.storage?.estimate?.().then(e => { rt.storageEst = e; }).catch(() => {});
  setInterval(() => {
    const busy = document.querySelector('.sheet-bg, .search') || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    if (rt.view === 'today' && document.visibilityState === 'visible' && !busy) render();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { flushRemoteSave(); return; }
    if (G.isSignedIn() && Date.now() - (S().google.lastSync || 0) > 2 * 60000) refreshAll(false);
    render();
  });
  window.addEventListener('pagehide', flushRemoteSave);
  setInterval(() => { if (document.visibilityState === 'visible' && G.isSignedIn() && rt.online && Date.now() - (S().google.lastSync || 0) > 5 * 60000) refreshAll(false); }, 60000);
  renderSync();
}
function applyTiming() { F.setTiming(CZ.custom(S()).social); }

// Arriving from another app or a link: ?from=citrus shows "← Citrus"; ?do=<action> (or #view) jumps straight there.
const DO = { call: ['today', 'call'], share: ['today', 'share'], today: ['today'], free: ['free'], find: ['free', 'find'], invite: ['today', 'invite'], log: ['outings', 'log'], outings: ['outings'], birthdays: ['people', 'birthdays'], people: ['people'], colleagues: ['people', 'colleagues'], groups: ['people', 'groups'], plans: ['plans'], poll: ['plans', 'poll'], polls: ['plans'], add: ['people', 'add'] };
function handleIncoming() {
  try {
    const q = new URLSearchParams(location.search);
    const from = String(q.get('from') || '').toLowerCase(), action = String(q.get('do') || '').toLowerCase();
    if (from === 'citrus') { rt.fromCitrus = true; try { sessionStorage.setItem('clementine.fromCitrus', '1'); } catch {} }
    else { try { if (sessionStorage.getItem('clementine.fromCitrus')) rt.fromCitrus = true; } catch {} }   // kept over a reload
    if (from === 'mandarin') rt.fromMandarin = true;
    const target = DO[action] || DO[location.hash.replace('#', '')] || null;
    if (q.toString()) history.replaceState(null, '', location.pathname + (target ? `#${target[0]}` : location.hash || '#today'));
    if (!target) return;
    rt.handled = true; go(target[0], target[1]);
    const later = (fn) => setTimeout(fn, 300);
    if (target[1] === 'find') later(() => SU.findSheet());
    else if (target[1] === 'invite') later(() => SU.inviteSheet([]));
    else if (target[1] === 'log') later(() => SU.outingSheet(null));
    else if (target[1] === 'poll') later(() => XU.newPoll());
    else if (target[1] === 'add') later(() => SU.friendSheet(null));
    else if (target[1] === 'call') later(() => PE.touchSheet());
    else if (target[1] === 'share') later(() => PE.availabilitySheet());
  } catch (e) { console.warn('incoming', e); }
}

// Shown at the top of every screen when the Google session needs a tap to come back
function authBanner() {
  if (!G.auth.needsSignIn || !rt.online) return null;
  return h('div', { class: 'banner' }, h('span', { class: 'grow' }, 'Google needs a tap to reconnect — nothing is lost, sync resumes after.'),
    h('button', { class: 'btn sm primary', onClick: async () => { try { await G.signIn({ renew: G.wasSignedIn() }); refreshAll(true); } catch (e) { try { await G.signIn(); refreshAll(true); } catch (e2) { toast(e2.message, 'err'); } } } }, 'Reconnect'));
}
/** "← Citrus" while you came from Citrus: one tap back, and Citrus toasts "Back from Clementine" and refreshes its hub. */
function backBar() {
  if (!rt.fromCitrus && !rt.fromMandarin) return null;
  const to = rt.fromCitrus ? ['Citrus', `${CITRUS_URL}?from=clementine`] : ['Mandarin', `${MANDARIN_URL}?from=clementine`];
  return h('div', { class: 'back-bar' }, h('a', { class: 'btn sm ghost', href: to[1] }, `← ${to[0]}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Hide', onClick: () => { rt.fromCitrus = rt.fromMandarin = false; try { sessionStorage.removeItem('clementine.fromCitrus'); } catch {} render(); } }, '✕'));
}

const VIEWS = ['today', 'free', 'people', 'outings', 'plans', 'more'];
const VIEW_NAMES = { today: 'Today', free: 'Who is free', people: 'People', outings: 'Outings', plans: 'Plans', more: 'Settings' };
const OLD = { social: 'today', friends: 'people', settings: 'more' };
/** Bottom tabs / rail in your order; hidden ones disappear (Settings › Customise). Today and Settings always stay. */
function applyTabs(c) {
  const nav = document.querySelector('nav.tabs'); if (!nav) return;
  for (const id of c.tabs.order) { const b = nav.querySelector(`button[data-view="${id}"]`); if (b) nav.insertBefore(b, nav.querySelector('button[data-view="more"]')); }
  for (const b of nav.querySelectorAll('button[data-view]')) b.hidden = c.tabs.hidden.includes(b.dataset.view);
  nav.style.setProperty('--tabs', String(CZ.TABS.length - c.tabs.hidden.length));
}
/** Open a tab, and optionally a part of it: go('people', 'birthdays'), go('free', 'family'). */
function go(view, part) {
  if (view === 'people' && part) PU.peoplePart(part);
  if (view === 'free' && part) SU.freePart(part);
  show(view);
}
function show(view) {
  view = OLD[view] || view;
  if (!VIEWS.includes(view)) view = 'today';
  rt.view = view;
  for (const s of document.querySelectorAll('section.view')) s.classList.toggle('active', s.id === `view-${view}`);
  for (const b of document.querySelectorAll('nav.tabs button')) { b.classList.toggle('active', b.dataset.view === view); if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  history.replaceState(null, '', `#${view}`);
  render();
  window.scrollTo(0, 0);
}
function render() {
  applyTabs(CZ.custom(S()));
  const fn = { today: SU.renderToday, free: SU.renderFree, people: PU.renderPeople, outings: SU.renderOutings, plans: XU.renderPlans, more: renderMore }[rt.view] || SU.renderToday;
  const el = $(`#view-${rt.view}`); if (!el) return;
  const y = window.scrollY, focus = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches('.dir-search') ? { v: true } : null;
  let body;
  try { body = fn(); } catch (e) { console.error(e); body = crashCard(e); }   // one broken screen never blanks the app
  el.replaceChildren(...[backBar(), authBanner(), body].flat(Infinity).filter(Boolean));
  if (!el.querySelector('h1')) el.prepend(h('h1', { class: 'sr-only' }, VIEW_NAMES[rt.view] || 'Clementine'));
  if (focus) { const i = el.querySelector('.dir-search'); if (i) { i.focus({ preventScroll: true }); i.setSelectionRange(i.value.length, i.value.length); } }
  if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
  const pt = document.getElementById('pageTitle'), d = new Date(); if (pt) pt.textContent = rt.view === 'today' ? '' : `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;   // Today says the date in its own heading
}
function crashCard(e) {
  return h('div', { class: 'card warn' }, h('div', { class: 'title' }, 'This screen hit a problem'), h('div', { class: 'small' }, 'Your data is safe. Try another tab, sync, or download a backup and tell Claude what you tapped.'),
    h('div', { class: 'tiny dim', style: { marginTop: '6px' } }, String(e?.message || e).slice(0, 160)),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn sm', onClick: () => location.reload() }, 'Reload'), h('button', { class: 'btn sm', onClick: downloadBackup }, '⬇ Backup')));
}

// Interfaces (Orange 8.12 pattern): Arcade / Clean / Paper + text size, chosen per device (localStorage, never synced); index.html applies them before first paint.
const UI_KEY = 'clementine.ui';
function getUi() { let u = {}; try { u = JSON.parse(localStorage.getItem(UI_KEY) || '{}') || {}; } catch {} if (!u.ui) u.ui = S().settings.theme === 'light' ? 'paper' : 'clean'; if (!u.size) u.size = 'normal'; return u; }
function setUi(patch) { const u = { ...getUi(), ...patch }; try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch {} applyTheme(); render(); if (rt.view === 'more') document.querySelector('#view-more .ui-pick')?.scrollIntoView({ block: 'nearest' }); }
function applyTheme() { const u = getUi(), r = document.documentElement; r.dataset.ui = u.ui; r.dataset.size = u.size; r.dataset.theme = u.ui === 'paper' ? 'light' : 'dark'; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = u.ui === 'paper' ? '#F3F4F9' : u.ui === 'arcade' ? '#12141F' : '#0e0f13'; }

// ---------------- sync ----------------
function renderSync() {
  const dot = $('#syncDot'), txt = $('#syncText'), signed = G.isSignedIn();
  dot.className = 'sync ' + (rt.syncing ? 'busy' : signed && rt.online ? 'on' : '');
  txt.textContent = !rt.online ? 'offline' : rt.syncing ? 'syncing…' : signed ? (S().google.email || 'Google') : '';
}
// state.json is written at most every 2.5 s, only when its content changed, and only if no other device wrote it since we
// read it — otherwise Clementine pulls, merges and writes the merged copy. Drive answers "anything new?" through its changes
// feed, so a sync where nothing moved is a single request; only what changed is read again.
let saveTimer = null, saving = null;
function scheduleRemoteSave() {
  if (!G.wasSignedIn()) return;
  rt.saveDirty = true;
  clearTimeout(saveTimer);
  if (!G.isSignedIn() || !rt.online) return;   // stays dirty: the next sync saves it
  saveTimer = setTimeout(() => saveStateNow().catch(e => console.warn('remote save failed', e.message)), 2500);
}
function flushRemoteSave() { if (rt.saveDirty && G.isSignedIn() && rt.online) { clearTimeout(saveTimer); saveStateNow().catch(() => {}); } }
async function saveStateNow() {
  if (saving) { await saving.catch(() => {}); if (!rt.saveDirty) return; }
  saving = (async () => {
    const root = S().settings.driveFolder;
    rt.saveDirty = false;
    if (store.needsMerge()) await pullState(true);              // a copy recovered from damage never goes out before Drive's is merged in
    try { await G.saveRemoteState(root, stripForRemote(S())); }
    catch (e) {
      if (!e.conflict) { rt.saveDirty = true; throw e; }
      await pullState(true);                                   // someone else saved first: take theirs in, then write the union
      try { await G.saveRemoteState(root, stripForRemote(S()), { force: true }); } catch (e2) { rt.saveDirty = true; throw e2; }
    }
    rt.lastSave = Date.now();
  })().finally(() => { saving = null; });
  return saving;
}
// what goes to Drive: everything except what belongs to this device (sync bookkeeping, calendar outbox)
function stripForRemote(s) { const { outbox, google, ...rest } = s; return rest; }
const comparable = (s) => G.fingerprint(stripForRemote(s || {}), ['updatedAt']);
/** Read state.json and merge it in. Writes back only if the merged copy holds something Drive doesn't. */
async function pullState(fromConflict = false) {
  const remote = await G.loadRemoteState(S().settings.driveFolder);
  if (!remote) { store.merged(); scheduleRemoteSave(); return false; }
  if (typeof remote !== 'object' || (remote.app && remote.app !== 'clementine')) throw new Error('state.json on Drive is not Clementine’s — kept your copy (backups are in hub/clementine/backups)');
  const force = fromConflict || store.needsMerge(); store.merged();
  if ((!force && (remote.updatedAt || 0) === (S().updatedAt || 0)) || comparable(remote) === comparable(S())) return false;
  const merged = mergeStates(S(), remote);
  merged.updatedAt = Math.max(S().updatedAt || 0, remote.updatedAt || 0) + (comparable({ ...merged, updatedAt: 0 }) !== comparable({ ...remote, updatedAt: 0 }) ? 1 : 0);
  store.replaceState(merged);
  if (comparable(merged) !== comparable(remote)) { if (fromConflict) rt.saveDirty = true; else scheduleRemoteSave(); }
  rt.lastPull = Date.now();
  return true;
}
const WATCH_KEY = 'clementine.drive.watch';
function loadWatch() { try { const w = JSON.parse(localStorage.getItem(WATCH_KEY) || 'null'); return w && w.root === S().settings.driveFolder ? w : null; } catch { return null; } }
function saveWatch(w) { rt.watch = w; try { w ? localStorage.setItem(WATCH_KEY, JSON.stringify(w)) : localStorage.removeItem(WATCH_KEY); } catch {} }

async function syncCalendar(force) {
  if (!force && Date.now() - (rt.calendarAt || 0) < 4 * 60000) return;   // calendar has no cheap "anything new?", so it's throttled
  rt.calendars = await G.listCalendars();
  const now = new Date();
  await loadEvents(startOfDay(now), addDays(startOfDay(now), 43));
  rt.calendarAt = Date.now();
}
async function refreshAll(manual, { full = false } = {}) {
  if (!rt.online && manual) { toast('Offline — Clementine syncs when you are back online'); return; }
  if (!G.isSignedIn()) { if (manual) toast(G.wasSignedIn() ? 'Google needs a tap to reconnect' : S().settings.clientId ? 'Sign in to Google in Settings' : 'Add your Google client ID in Settings'); render(); return; }
  if (!rt.online) { if (manual) toast('You are offline'); return; }
  if (rt.syncing) { if (manual) toast('Already syncing…'); return; }   // one sync at a time
  rt.syncing = true; renderSync();
  const root = S().settings.driveFolder, problems = [];
  const step = async (label, fn) => { try { await fn(); } catch (e) { problems.push(`${label}: ${e.message}`); } };
  const t0 = performance.now();
  try {
    // 1. what moved on Drive since last time?
    let watch = loadWatch(), plan = null, newToken = '';
    const stale = !watch?.token || Date.now() - (watch.fullAt || 0) > 12 * 3600000;   // a full pass at least twice a day, whatever the feed says
    if (!full && !manual && !stale) {
      try { const ch = await G.changesSince(watch.token); if (ch) { newToken = ch.token; plan = classifyChanges(ch.changes, watch); if (ch.more) plan = null; } }
      catch (e) { if (e.auth) throw e; }
    }
    if (!plan) { G.reverify(); newToken = await G.startToken().catch(() => ''); plan = { full: true, state: true, hub: true }; }
    if (!G.seenStateRev() && !rt.stateLoaded) plan.state = true;   // read state.json once per app session at least
    rt.syncMode = plan.full ? 'full' : plan.state || plan.hub ? 'changes' : 'nothing new';
    // 2. state first (the merge decides what everything else shows), then the rest in parallel
    if (plan.state) await step('state', async () => { await pullState(); rt.stateLoaded = true; });
    await Promise.all([
      step('account', async () => { if (!S().google.email) { const u = await G.userInfo(); store.update(s => ({ ...s, google: { ...s.google, email: u.email } }), { remote: false, silent: true }); } }),
      plan.hub || !rt.hub.at ? step('hub', () => syncHub({ full: plan.full })) : null,
      step('calendar', () => syncCalendar(manual || plan.full)),
    ]);
    // 3. queued calendar writes, unsaved local changes
    await step('outbox', flushOutbox);
    if (rt.saveDirty) await step('save', saveStateNow);
    // 4. remember where we are in the feed — only when everything worked, so a failed step is retried next time
    if (!problems.length && newToken) {
      const next = { ...(watch || {}), root, token: newToken };
      if (plan.full) Object.assign(next, await G.watchedFolders(root).catch(() => ({})), { fullAt: Date.now() });
      saveWatch(next);
    }
    // 5. a daily snapshot on Drive (14 kept), then tell the other apps
    if (!problems.length) G.backupDaily(root, stripForRemote(S()), keyOf(new Date())).catch(e => console.warn('backup', e.message));
    await step('publish', publish);
    store.update(s => ({ ...s, google: { ...s.google, lastSync: Date.now() } }), { remote: false, silent: true });
    rt.lastProblems = problems; rt.lastSyncMs = Math.round(performance.now() - t0);
    if (manual) toast(problems.length ? 'Synced with issues — see Settings › Diagnostics' : 'Synced', problems.length ? 'err' : 'ok');
    else if (problems.length) console.warn(problems);
  } catch (e) {
    rt.lastProblems = [e.message];
    if (manual) toast(e.message, 'err');
  } finally { rt.syncing = false; renderSync(); render(); }
}
/** Turn a page of Drive changes into the smallest sync that covers them. null = can't tell, do a full pass. */
function classifyChanges(changes, w) {
  const plan = { state: false, hub: false };
  const roots = new Set([w.hub, w.me].filter(Boolean));
  for (const c of changes) {
    if (roots.has(c.id) && (c.removed || c.trashed || !(c.parents || []).length)) { G.forgetFolders(); return null; }   // one of our folders vanished: rebuild
    const par = c.parents || [];
    if (par.includes(w.me) && c.name === 'state.json' && (c.props?.rev || '') !== G.seenStateRev()) plan.state = true;
    if (w.mandarin && par.includes(w.mandarin) && c.name === 'shifts.json') plan.hub = true;
    if (par.includes(w.hub) && c.mimeType === 'application/vnd.google-apps.folder' && (c.name === 'mandarin' || c.name === 'citrus') && c.id !== w.mandarin && c.id !== w.citrus) return null;   // a folder Clementine reads appeared: full pass
  }
  return plan;
}

// ---------------- the hub: what Clementine reads from other apps, and what it publishes ----------------
const HUB_KEY = 'clementine.hub';
function loadHubCache() { try { const j = JSON.parse(localStorage.getItem(HUB_KEY) || 'null'); if (j && typeof j === 'object') rt.hub = { ...rt.hub, ...j }; } catch {} }
function saveHubCache() { try { localStorage.setItem(HUB_KEY, JSON.stringify(rt.hub)); } catch {} }
/** Read Mandarin's shifts.json (who works when) and, until the social parts are taken over, Citrus's state (once). Read only. */
async function syncHub({ full = false } = {}) {
  const root = S().settings.driveFolder;
  const sh = await G.readOtherFile(root, 'mandarin', 'shifts.json').catch(() => null);
  if (sh?.data) { if (R.set(sh.data)) { rt.hub.shiftsAt = sh.modifiedTime || ''; rt.hub.shiftsError = ''; } else rt.hub.shiftsError = 'Mandarin’s shifts.json could not be read'; }
  else rt.hub.shiftsError = 'Mandarin has not published shifts.json yet';
  rt.hub.at = Date.now();
  if (!S().migrated) {
    const citrus = await G.readOtherFile(root, 'citrus', 'state.json').catch(() => null);
    if (citrus?.data && !S().migrated) offerMigration(citrus.data, 'Citrus on Drive');
  }
  saveHubCache();
}
// Taking over the social parts of Citrus: offered once, with an Undo and a copy kept on Drive before it runs
let migrationOffered = false;
function offerMigration(citrus, source) {
  const { counts } = MIG.socialPart(citrus); if (!Object.entries(counts).some(([k, n]) => n > 0 && k !== 'timing')) { if (source !== 'Citrus on Drive') toast(`No friends or contacts in ${source}`); return; } if (migrationOffered) return;
  migrationOffered = true;
  setTimeout(() => {
    const { close } = sheet([h('h2', {}, 'Bring your friends over from Citrus?'),
      h('p', { class: 'small' }, `Found in ${source}: ${MIG.describe(counts)}${counts.timing ? ', and your Social timing' : ''}.`),
      h('p', { class: 'small muted' }, 'Clementine copies them and owns them from now on. Nothing is deleted in Citrus. Anything you already changed here is kept: for each item the newest edit wins. A copy of your Clementine data as it is now is kept on Drive first, and you can Undo.'),
      h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn primary grow', onClick: () => { close(); runMigration(citrus, source); } }, 'Bring them over'), h('button', { class: 'btn ghost', onClick: () => { close(); store.update(s => ({ ...s, migrated: { from: 'skipped', at: Date.now(), counts: {} } })); toast('Skipped. You can do it later in Settings › Data.'); } }, 'Not now'))]);
  }, 300);
}
function backupBefore(what) { if (G.isSignedIn()) G.backupBefore(S().settings.driveFolder, stripForRemote(S()), what).catch(e => console.warn('backup before', e.message)); }
function runMigration(citrus, source) {
  const before = S(), r = MIG.applyMigration(before, citrus);
  if (!r.changed) { toast('No friends or contacts found'); return; }
  backupBefore('migration');
  try { store.replaceState(r.state, { bump: true }); smokeRender(); }
  catch (e) { console.warn(e); store.replaceState(before, { bump: true, exact: S() }); toast(`That copy would break the app (${String(e.message).slice(0, 60)}). Nothing was changed.`, 'err'); return; }
  render(); toast(`Brought over: ${MIG.describe(r.counts)}`, 'ok', { action: { label: 'Undo', run: () => { store.replaceState(before, { bump: true, exact: S() }); render(); toast('Undone: back to before the migration'); } } });
}
async function migrateNow() {
  if (!G.isSignedIn()) return toast('Sign in with Google first', 'err');
  try { const c = await G.readOtherFile(S().settings.driveFolder, 'citrus', 'state.json'); if (!c?.data) return toast('No Citrus data found on Drive'); migrationOffered = false; offerMigration(c.data, 'Citrus on Drive'); }
  catch (e) { toast(e.message, 'err'); }
}
// What Clementine publishes: status.json for Citrus, contacts.json for Mandarin and Citrus. At most every few seconds, only when it changed.
let pubTimer = null;
function publishSoon() { clearTimeout(pubTimer); if (!G.isSignedIn() || !rt.online) return; pubTimer = setTimeout(() => publish().catch(e => console.warn('publish', e.message)), 4000); }
async function publish() {
  if (!G.isSignedIn() || !rt.online) return;
  const root = S().settings.driveFolder, now = new Date();
  await G.writeOwnFile(root, 'status.json', HUB.buildStatus(S(), now, { busyOf }), { omit: ['updatedAt'] });
  await G.writeOwnFile(root, 'contacts.json', HUB.buildContacts(S(), now), { omit: ['updatedAt'] });
  rt.publishedAt = Date.now();
}

// ---------------- calendar: your events (busy time), and planned meet-ups put on it ----------------
const busyEvent = (e) => !e.allDay && e.tag !== 'shift' && e.citrus !== 'shift' && !/^(shift|mandarin)$/.test(e.tag || '');
/** Minutes of `date` you are busy in Google Calendar (timed events only; your shifts come from Mandarin, so its shift mirror is left out). */
function busyOf(date) {
  const k = keyOf(date), out = [];
  for (const e of rt.events[k] || []) { if (!busyEvent(e)) continue; const a = (e.start - startOfDay(date)) / 60000, b = (e.end - startOfDay(date)) / 60000; if (b > 0 && a < 1440) out.push([Math.max(0, Math.round(a)), Math.min(1440, Math.round(b))]); }
  return out;
}
async function loadEvents(from, to) {
  if (!G.isSignedIn()) return;
  const ids = S().settings.calendarIds?.length ? S().settings.calendarIds : ['primary'], all = [];
  for (const id of ids) { try { all.push(...await G.listEvents(id, from, to)); } catch (e) { console.warn('cal', id, e.message); } }
  rt.events = {};
  for (const ev of all) (rt.events[keyOf(ev.start)] ||= []).push(ev);
  cacheEvents();
}
function cacheEvents() { try { localStorage.setItem('clementine.events', JSON.stringify(rt.events, (k, v) => v instanceof Date ? v.toISOString() : v)); } catch {} }
function loadCachedEvents() { try { const raw = JSON.parse(localStorage.getItem('clementine.events') || '{}'); for (const [k, list] of Object.entries(raw)) rt.events[k] = list.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) })); } catch {} }
/** Put a planned meet-up on your calendar. → {status: 'cal' (added) | 'queued' (offline: added when back) | 'none' (not signed in), id}. */
async function addEvent({ title, date, start, minutes = 120, key = '' }) {
  if (!G.isSignedIn() && !G.wasSignedIn()) return { status: 'none', id: '' };
  const d = fromKey(date), s = new Date(+d + start * 60000), e = new Date(+s + minutes * 60000), cal = S().settings.outingCalendarId || 'primary';
  const payload = { title, start: s, end: e, description: 'Planned in Clementine.', tag: 'outing', reminders: [60], ...(key ? { key } : {}) };
  if (!rt.online || !G.isSignedIn()) { queueOutbox({ type: 'create', calendarId: cal, payload, outing: key }); return { status: 'queued', id: '' }; }
  try { const ev = await G.createEvent(cal, payload); syncCalendar(true).catch(() => {}); return { status: 'cal', id: ev?.id ? `${cal}|${ev.id}` : '' }; }
  catch (err) { if (err.network || /expired|not signed/i.test(err.message)) { queueOutbox({ type: 'create', calendarId: cal, payload, outing: key }); return { status: 'queued', id: '' }; } throw err; }
}
/** Take a cancelled plan's event off the calendar (queued when offline). The id is "calendar|event". */
function removeEvent(ref) {
  const [cal, id] = String(ref || '').includes('|') ? String(ref).split('|') : [S().settings.outingCalendarId || 'primary', ref]; if (!id) return;
  if (!rt.online || !G.isSignedIn()) { queueOutbox({ type: 'delete', calendarId: cal, eventId: id }); return; }
  G.deleteEvent(cal, id).then(() => syncCalendar(true)).catch(() => queueOutbox({ type: 'delete', calendarId: cal, eventId: id }));
}
function queueOutbox(op) { store.update(s => ({ ...s, outbox: [...(s.outbox || []), { ...op, id: uid(), at: Date.now() }] }), { silent: true, remote: false }); }
let flushing = null;
function flushOutbox() { if (!flushing) flushing = flushOutboxOnce().finally(() => { flushing = null; }); return flushing; }
async function flushOutboxOnce() {
  const ops = S().outbox || []; if (!ops.length || !G.isSignedIn() || !rt.online) return;
  const done = new Set();
  for (const op of ops) {
    try {
      if (op.type === 'create') {
        // a create whose answer was lost may already be in the calendar: look for it by its key before sending it again
        const payload = { ...op.payload, start: new Date(op.payload.start), end: new Date(op.payload.end), key: op.id };
        let ev = op.tried ? await G.findEventByKey(op.calendarId, op.id, addDays(payload.start, -1), addDays(payload.end, 1)).catch(() => null) : null;
        if (!ev) { store.update(s => ({ ...s, outbox: (s.outbox || []).map(o => o.id === op.id ? { ...o, tried: true } : o) }), { silent: true, remote: false }); ev = await G.createEvent(op.calendarId, payload); }
        // the plan it belongs to remembers the event, so cancelling the plan later removes it
        if (op.outing && ev?.id) store.update(s => s.outings?.[op.outing] ? { ...s, outings: { ...s.outings, [op.outing]: { ...s.outings[op.outing], eventId: `${op.calendarId}|${ev.id}`, at: Date.now() } } } : s, { silent: true });
      } else if (op.type === 'delete') await G.deleteEvent(op.calendarId, op.eventId);
      done.add(op.id);
    } catch (e) { if (e.status && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) done.add(op.id); }   // rejected for good: don't retry forever
  }
  store.update(s => ({ ...s, outbox: (s.outbox || []).filter(op => !done.has(op.id)) }), { silent: true, remote: false });
}

// ---------------- sheets ----------------
const topSheet = () => [...document.querySelectorAll('.sheet-bg, body > .search')].pop() || null;
const sheetOpeners = new WeakMap();
function sheet(content) {
  const opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const bg = h('div', { class: 'sheet-bg', onClick: (e) => { if (e.target === bg) close(); } });
  const x = h('button', { class: 'sheet-x', type: 'button', 'aria-label': 'Close', title: 'Close (Esc)', onClick: () => { if (topSheet() === bg) closeTopSheet(); else close(); } }, '✕');
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' }, h('div', { class: 'handle' }), x, ...[content].flat());
  const title = box.querySelector('h2'); if (title) { title.id ||= 'sh-' + uid(); box.setAttribute('aria-labelledby', title.id); } else box.setAttribute('aria-label', 'Details');
  // remember typed edits, so Escape asks before throwing them away
  box.addEventListener('input', (e) => { if (e.target.matches?.('textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=search]):not([type=file]):not([data-nodirty])')) bg.dataset.dirty = '1'; });
  bg.append(box); document.body.append(bg); sheetOpeners.set(bg, opener);
  const close = () => bg.remove();
  queueMicrotask(() => { if (!bg.isConnected || box.contains(document.activeElement)) return; const f = box.querySelector('input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([data-nofocus]), textarea:not([data-nofocus]), select:not([data-nofocus])'); (f && !matchMedia('(hover: none)').matches ? f : box).focus({ preventScroll: true }); });
  return { close, box };
}
/** Escape: close the top sheet; with unsaved typing, the first Escape only warns. */
function closeTopSheet() {
  const bg = topSheet(); if (!bg) return false;
  if (bg.dataset.dirty && !bg.dataset.warned) { bg.dataset.warned = '1'; toast('Unsaved changes: press Esc again to discard'); setTimeout(() => { delete bg.dataset.warned; }, 4000); return true; }
  bg.remove(); return true;
}
function shortcutsSheet() {
  const rows = [['1 – 5', 'Today, Free, People, Outings, Plans (in your tab order)'], [',', 'Settings'], ['/', 'Search people'], ['f', 'Find a day'], ['i', 'Plan a meet-up'], ['l', 'Log an outing'], ['c', 'Log a call or message'], ['a', 'Share my free time'], ['r', 'Sync with Google now'], ['Esc', 'close the top sheet or the search'], ['?', 'this list']];
  sheet([h('h2', {}, 'Keyboard shortcuts'), h('div', { class: 'kv keys' }, rows.flatMap(([k, v]) => [h('kbd', {}, k), h('span', {}, v)]))]);
}
// Back button closes the top sheet: one history entry guards all open sheets.
let sheetGuard = false, sheetSelfBack = false, lastSheetClose = 0;
// the second tap of a double-tap on Save lands on whatever was under the sheet (the bottom tabs): swallow it
document.addEventListener('click', (e) => { if (Date.now() - lastSheetClose < 280 && !e.target.closest?.('.sheet, .toast')) { e.preventDefault(); e.stopPropagation(); } }, true);
function watchSheets() {
  new MutationObserver((muts) => {
    const removed = muts.flatMap(m => [...m.removedNodes]).filter(n => n.classList?.contains('sheet-bg') || n.classList?.contains('search')), open = document.querySelectorAll('.sheet-bg, body > .search').length;
    if (removed.length) lastSheetClose = Date.now();
    document.documentElement.classList.toggle('sheet-open', open > 0);
    for (const bg of removed) { const o = sheetOpeners.get(bg); if (o?.isConnected && !topSheet()) o.focus({ preventScroll: true }); }
    if (open && !sheetGuard) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; }
    else if (!open && sheetGuard && !sheetSelfBack && history.state?.cSheet) { sheetSelfBack = true; history.back(); }
  }).observe(document.body, { childList: true });
  addEventListener('popstate', () => {
    if (sheetSelfBack) { sheetSelfBack = false; sheetGuard = false; if (topSheet()) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; } return; }
    sheetGuard = false; const bg = topSheet(); if (bg) { bg.remove(); if (topSheet()) { history.pushState({ cSheet: 1 }, '', location.href); sheetGuard = true; } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return; const bg = topSheet(); if (!bg) return;
    const f = [...bg.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { e.preventDefault(); return; }
    const i = f.indexOf(document.activeElement);
    if (!bg.contains(document.activeElement) || (e.shiftKey && i <= 0) || (!e.shiftKey && i === f.length - 1)) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); }
  });
}

// ---------------- search: anyone in the app ----------------
function openSearch() {
  if (document.querySelector('.search')) return;
  const s = S(), seen = new Set(), all = [];
  for (const f of F.friendList(s)) { all.push({ key: f.id, name: f.name, sub: [f.nick, F.FRIEND_KINDS.find(k => k.id === f.kind)?.label].filter(Boolean).join(' · '), open: () => SU.friendSheet(f) }); if (f.rotaKey) seen.add(f.rotaKey); }
  for (const p of R.people()) if (!seen.has(p.key)) { const c = F.contactOf(s, p.key); all.push({ key: p.key, name: R.bare(p.name), sub: [c.nick, R.UNIT_LABEL[p.unit]].filter(Boolean).join(' · '), open: () => PU.personSheet(p.key) }); }
  let sel = 0, hits = [];
  const list = h('div', { class: 'res' });
  const paint = (q) => {
    const qq = q.trim().toLowerCase(), fuzzy = qq ? new Set(R.match(q).map(p => p.key)) : new Set();
    hits = qq ? all.filter(x => x.name.toLowerCase().includes(qq) || x.sub.toLowerCase().includes(qq) || fuzzy.has(x.key)).slice(0, 30) : all.slice(0, 12); sel = 0;
    list.replaceChildren(...(hits.length ? hits.map((x, i) => h('button', { class: `item ${i === sel ? 'hl' : ''}`, onClick: () => { box.remove(); x.open(); } }, h('div', { class: 'grow' }, h('div', { class: 'name' }, x.name), h('div', { class: 'meta' }, x.sub)))) : [h('div', { class: 'empty small' }, 'Nobody found')]));
  };
  const inp = h('input', { type: 'search', placeholder: 'Search friends, family, colleagues', onInput: (e) => paint(e.target.value), onKeydown: (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { sel = Math.max(0, Math.min(hits.length - 1, sel + (e.key === 'ArrowDown' ? 1 : -1))); [...list.children].forEach((c, i) => c.classList.toggle('hl', i === sel)); list.children[sel]?.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[sel]) { box.remove(); hits[sel].open(); }
  } });
  const box = h('div', { class: 'search', onClick: (e) => { if (e.target === box) box.remove(); } }, h('div', { class: 'box', role: 'dialog', 'aria-label': 'Search people' }, inp, list));
  document.body.append(box); paint(''); setTimeout(() => inp.focus(), 30);
}

// ---------------- backups, restore, Drive check ----------------
async function backupsSheet() {
  let list = [];
  try { list = await G.listBackups(S().settings.driveFolder); } catch (e) { return toast(e.message, 'err'); }
  const { close } = sheet([h('h2', {}, 'Restore a daily backup'),
    h('p', { class: 'small muted' }, 'Clementine keeps one snapshot of your friends, cards, outings and plans per day on Drive (hub/clementine/backups, newest 14). Restoring replaces this copy and syncs it to your other devices.'),
    list.length ? h('div', { class: 'list' }, ...list.map(b => h('div', { class: 'item' }, h('div', { class: 'grow' }, h('div', { class: 'name' }, b.name.replace(/^state-|\.json$/g, '')), h('div', { class: 'meta' }, `${Math.max(1, Math.round(b.size / 1024))} KB`)),
      h('button', { class: 'btn sm', onClick: async () => { try { const j = await G.readBackup(b.id); close(); restoreSheet(j, { source: `Drive backup ${b.name}` }); } catch (e) { toast(e.message, 'err'); } } }, 'Restore')))) : h('div', { class: 'muted small' }, 'No backups yet — the first is made after today\'s sync.')]);
}
const PRE_KEY = 'clementine.preRestore';
function preRestore() { if (rt.preRestore) return rt.preRestore; try { return JSON.parse(localStorage.getItem(PRE_KEY) || 'null'); } catch { return null; } }
function keepPreRestore() { const snap = { at: Date.now(), state: S() }; rt.preRestore = snap; try { localStorage.setItem(PRE_KEY, JSON.stringify(snap)); return true; } catch { return false; } }
function dropPreRestore() { rt.preRestore = null; try { localStorage.removeItem(PRE_KEY); } catch {} }
/** Draw every main screen off-page; a state that throws anywhere is rolled back before anyone sees an empty app. */
function smokeRender() { for (const fn of [SU.renderToday, SU.renderFree, PU.renderPeople, SU.renderOutings, XU.renderPlans]) fn(); }
const when = (t) => t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown date';
function restoreSheet(json, { source = 'Backup file' } = {}) {
  const chk = checkBackup(json); if (!chk.ok) { toast(`${source}: ${chk.error}`, 'err'); return; }
  const sm = chk.summary, cur = checkBackup({ ...S(), app: 'clementine' }).summary, older = sm.savedAt && (S().updatedAt || 0) > sm.savedAt;
  const kv = (rows) => h('div', { class: 'kv' }, ...rows.flatMap(([a, b]) => [h('b', {}, a), h('span', {}, b)]));
  const { close } = sheet([h('h2', {}, 'Restore this backup?'), h('div', { class: 'small muted', style: { marginBottom: '10px' } }, source),
    h('div', { class: 'rs-cols' }, h('div', { class: 'card rs-in' }, h('div', { class: 'title' }, 'In the backup'), kv([['Saved', when(sm.savedAt)], ['Holds', describeCounts(sm.counts)]])), h('div', { class: 'card' }, h('div', { class: 'title' }, 'On this device now'), kv([['Saved', when(S().updatedAt)], ['Holds', describeCounts(cur?.counts)]]))),
    older ? h('div', { class: 'small late', style: { margin: '8px 0' } }, 'This backup is older than the data on this device.') : null,
    chk.dropped.length ? h('div', { class: 'card warn' }, h('div', { class: 'title' }, `Left out: ${chk.dropped.length} part${chk.dropped.length > 1 ? 's' : ''}`), h('div', { class: 'tiny' }, chk.dropped.slice(0, 8).join(' · '))) : null,
    h('p', { class: 'small muted' }, 'Replace puts the backup in place of everything here, then on your other devices. Merge keeps both: for each item the newest edit wins. Either way Clementine keeps a copy of your data as it is now, so you can undo.'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn danger grow', onClick: () => { close(); applyRestore(chk.state, { merge: false }); } }, 'Replace everything'), h('button', { class: 'btn primary grow', onClick: () => { close(); applyRestore(chk.state, { merge: true }); } }, 'Merge into mine'), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'))]);
}
function applyRestore(next, { merge = false } = {}) {
  const before = S(), kept = keepPreRestore();
  backupBefore(merge ? 'merge' : 'restore');
  const target = merge ? { ...mergeStates(before, next), updatedAt: Math.max(before.updatedAt || 0, next.updatedAt || 0) } : { ...next, outbox: before.outbox, google: before.google };
  try { store.replaceState(target); smokeRender(); }
  catch (e) { console.warn('restore rolled back', e); store.replaceState(before); dropPreRestore(); render(); toast(`That backup would break the app (${String(e.message).slice(0, 60)}). Nothing was changed.`, 'err'); return false; }
  store.replaceState(S(), { bump: true, exact: merge ? null : before });
  render();
  toast(`${merge ? 'Merged' : 'Restored'}${kept ? '' : ' (undo copy kept until you close the app)'}`, 'ok', { action: { label: 'Undo', run: undoRestore } });
  return true;
}
function undoRestore() { const snap = preRestore(); if (!snap?.state) { toast('Nothing to undo'); return; } store.replaceState(snap.state, { bump: true, exact: S() }); dropPreRestore(); render(); toast(`Back to your data from ${when(snap.at)}`, 'ok'); }
async function repairSheet() {
  const body = h('div', {}, h('div', { class: 'muted small' }, 'Looking through Drive › ' + S().settings.driveFolder + '…'));
  const { close } = sheet([h('h2', {}, 'Check Drive'), body]);
  let rep; try { rep = await G.scanDrive(S().settings.driveFolder); } catch (e) { body.replaceChildren(h('div', { class: 'small' }, e.message)); return; }
  const issues = [...rep.twinFolders, ...rep.twinFiles].filter(t => t.fixable).length;
  body.replaceChildren(...[
    h('div', { class: 'small' }, `${rep.folders} folders · ${rep.files} files · ${issues ? `${issues} duplicate${issues > 1 ? 's' : ''}` : 'no duplicates'}`),
    ...rep.twinFolders.map(t => h('div', { class: 'small', style: { marginTop: '6px' } }, t.fixable ? `▸ ${t.path} ×${t.items.length} — contents will be merged into the oldest` : `▸ ${t.path} ×${t.items.length} — belongs to its own app; open that app to tidy it`)),
    ...rep.twinFiles.filter(t => t.fixable).map(t => h('div', { class: 'small', style: { marginTop: '6px' } }, `· ${t.path} ×${t.items.length} — newest kept, others to the trash`)),
    h('pre', { class: 'tiny', style: { background: 'var(--bg2)', padding: '10px', borderRadius: '10px', overflow: 'auto', marginTop: '10px', maxHeight: '40vh' } }, rep.tree.join('\n') || '(empty)'),
    issues ? h('button', { class: 'btn primary', style: { marginTop: '10px' }, onClick: async (e) => { e.target.disabled = true; e.target.textContent = 'Fixing…'; try { const r = await G.repairDrive(rep); saveWatch(null); close(); toast(`Fixed: ${r.moved} moved, ${r.trashed} to the trash (restorable for 30 days)`, 'ok'); refreshAll(false, { full: true }); } catch (err) { toast(err.message, 'err'); e.target.disabled = false; e.target.textContent = 'Fix duplicates'; } } }, 'Fix duplicates') : null].filter(Boolean));
}

// ---------------- SETTINGS ----------------
const czOpen = new Set();
const hmIn = (m, label, onChange) => h('input', { type: 'time', value: F.hhmm(m % 1440), 'aria-label': label, step: 900, onChange: (e) => { const [a, b] = e.target.value.split(':').map(Number); if (Number.isFinite(a)) onChange(a * 60 + (b || 0)); } });
function customiseCard() {
  const c = CZ.custom(S()), set = (part, patch) => store.update(s => CZ.setCustom(s, part, patch));
  const sec = (title, sub, ...kids) => h('details', { class: 'cz-sec', open: czOpen.has(title), onToggle: (e) => { e.currentTarget.open ? czOpen.add(title) : czOpen.delete(title); } }, h('summary', {}, h('b', {}, title), h('small', {}, sub)), ...kids);
  const chip = (on, label, onClick, extra = {}) => h('button', { class: `chip ${on ? 'sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', onClick, ...extra }, label);
  const tabRow = ([id, label]) => { const hidden = c.tabs.hidden.includes(id), i = c.tabs.order.indexOf(id);
    return h('div', { class: 'cz-row' }, h('span', { class: 'grow' }, label), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${label} up`, disabled: i === 0, onClick: () => set('tabs', { order: CZ.move(c.tabs.order, id, -1) }) }, '↑'), h('button', { class: 'btn sm ghost', 'aria-label': `Move ${label} down`, disabled: i === c.tabs.order.length - 1, onClick: () => set('tabs', { order: CZ.move(c.tabs.order, id, 1) }) }, '↓'),
      id === 'today' ? h('span', { class: 'tiny dim cz-fixed' }, 'always') : chip(!hidden, hidden ? 'Hidden' : 'Shown', () => set('tabs', { hidden: CZ.toggleIn(c.tabs.hidden, id) }))); };
  return h('div', { class: 'card cz' }, h('div', { class: 'title' }, 'Customise'), h('div', { class: 'tiny dim' }, 'Synced to all your devices.'),
    sec('Your day', 'when you are up, when you call it a night, the shortest meet-up',
      h('div', { class: 'tiny dim' }, 'Who is free and every suggestion use these. After a night shift Clementine always lets you sleep about 8 hours first.'),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Up from'), hmIn(c.social.wake, 'Up from', (m) => set('social', { wake: m }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Out until'), hmIn(c.social.late, 'Out until', (m) => set('social', { late: m <= 6 * 60 ? m + 1440 : m }))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Shortest meet-up worth suggesting'), h('select', { 'aria-label': 'Shortest meet-up', onChange: (e) => set('social', { minMeet: +e.target.value }) }, [[60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours']].map(([v, l]) => h('option', { value: v, selected: c.social.minMeet === v }, l)))),
      h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Days in the Who is free grid'), h('select', { 'aria-label': 'Days in the grid', onChange: (e) => set('social', { days: +e.target.value }) }, [[0, 'Fit the screen'], [7, '7'], [10, '10'], [14, '14'], [21, '21']].map(([v, l]) => h('option', { value: v, selected: c.social.days === v }, l))))),
    sec('Reminders', 'when a birthday starts waiting on you', h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Birthdays show in Citrus from'), h('select', { 'aria-label': 'Birthday reminder', onChange: (e) => set('remind', { birthdays: +e.target.value }) }, [[0, 'the day itself'], [1, '1 day before'], [3, '3 days before'], [7, 'a week before']].map(([v, l]) => h('option', { value: v, selected: c.remind.birthdays === v }, l))))),
    sec('Tabs', 'order, hide, start tab', ...[...c.tabs.order].map(id => tabRow(CZ.TABS.find(t => t[0] === id))), h('div', { class: 'cz-row' }, h('span', { class: 'grow small' }, 'Open on'), h('select', { 'aria-label': 'Open on', onChange: (e) => set('start', e.target.value) }, CZ.TABS.filter(([id]) => !c.tabs.hidden.includes(id)).map(([id, l]) => h('option', { value: id, selected: c.start === id }, l))))),
    h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onClick: () => { if (confirm('Put every Customise choice back to the default?')) store.update(s => ({ ...s, settings: { ...s.settings, custom: {} } })); } }, 'Reset Customise'));
}
function uiPicker() {
  const u = getUi(), opt = (id, name, note) => h('button', { class: `ui-opt ${u.ui === id ? 'sel' : ''}`, 'aria-pressed': u.ui === id ? 'true' : 'false', onClick: () => setUi({ ui: id }) }, h('span', { class: `ui-thumb ui-${id}` }, h('i'), h('i'), h('b', {}, 'Aa')), h('b', {}, name), h('small', {}, note));
  return h('div', { class: 'ui-pick' }, h('div', { class: 'title' }, 'Interface on this device'), h('div', { class: 'ui-opts' }, opt('arcade', 'Arcade', '8-bit, the family look'), opt('clean', 'Clean', 'Calm, rounded, dark'), opt('paper', 'Paper', 'Light, for daylight')),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'small grow' }, 'Text size'), h('div', { class: 'seg ui-size' }, [['small', 'S'], ['normal', 'M'], ['large', 'L']].map(([k, l]) => h('button', { class: u.size === k ? 'active' : '', 'aria-label': `Text size ${k}`, 'aria-pressed': String(u.size === k), onClick: () => setUi({ size: k }) }, l)))));
}
function diagnosticsCard() {
  const s = S(), n = (k) => Object.keys(s[k] || {}).length;
  const rows = [
    ['Google', G.isSignedIn() ? `signed in as ${G.accountEmail() || s.google.email || '?'}` : G.wasSignedIn() ? 'session expired — tap Sign in' : 'not signed in'],
    ['Session', G.isSignedIn() ? `${G.tokenMinutesLeft()} min left · renews on your next tap` : '—'],
    ['Last sync', s.google.lastSync ? `${new Date(s.google.lastSync).toLocaleString('en-GB')}${rt.syncMode ? ` · ${rt.syncMode}` : ''}${rt.lastSyncMs ? ` · ${(rt.lastSyncMs / 1000).toFixed(1)} s` : ''}` : 'never'],
    ['Drive requests', `${G.stats.requests} sent · ${G.stats.retries} retried · ${G.stats.errors} failed · ${G.stats.skippedWrites} unchanged writes skipped`],
    ['Last Google error', G.stats.lastError ? `${G.stats.lastError} (${new Date(G.stats.lastErrorAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })})` : 'none'],
    ['Unsaved to Drive', rt.saveDirty ? 'yes — saves on the next sync' : 'no'],
    ['This device', `${store.persistence.ok ? 'saved' : '⚠ ' + store.persistence.lastError} · ${Math.round(store.persistence.bytes / 1024)} KB${rt.storagePersisted ? ' · protected from clean-up' : ''}`],
    ['Sync issues', (rt.lastProblems || []).length ? rt.lastProblems.join(' · ') : 'none'],
    ['Roster from Mandarin', R.has() ? `${R.people().length} people · you: ${R.meName() || 'not picked in Mandarin'} · to ${R.coverEnd() ? fmtDate(R.coverEnd()) : '?'} · published ${R.updatedAt() ? new Date(R.updatedAt()).toLocaleString('en-GB') : '?'}` : (rt.hub.shiftsError || 'not read yet')],
    ['Published to the hub', rt.publishedAt ? `status.json and contacts.json at ${new Date(rt.publishedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'not yet this session'],
    ['Your data', `${n('friends')} friends · ${n('contacts')} colleague cards · ${n('groups')} groups · ${n('outings')} outings · ${n('polls')} polls · ${n('wishlist')} wishlist · ${n('treats')} treats`],
    ['Taken over from Citrus', s.migrated ? (s.migrated.from === 'skipped' ? 'skipped' : `${new Date(s.migrated.at).toLocaleDateString('en-GB')} · ${MIG.describe(s.migrated.counts || {})}`) : 'not yet'],
    ['Queued calendar writes', String((s.outbox || []).length)],
    ['Version', VERSION], ['Online', rt.online ? 'yes' : 'no'], ['Installed', window.matchMedia('(display-mode: standalone)').matches ? 'yes (home screen)' : 'browser tab'],
  ];
  return h('div', { class: 'card' }, h('div', { class: 'title' }, 'Diagnostics'), h('div', { class: 'kv' }, ...rows.flatMap(([a, b]) => [h('b', {}, a), h('span', {}, b)])),
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onClick: () => refreshAll(true) }, 'Sync now'), h('button', { class: 'btn sm', onClick: async () => { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; for (const r of regs) await r.unregister(); const ks = await caches.keys(); for (const k of ks) await caches.delete(k); location.reload(); } }, 'Reinstall app files')));
}
function renderMore() {
  const s = S(), signed = G.isSignedIn();
  const out = [h('h1', {}, 'Settings'), h('div', { class: 'card' }, uiPicker()), customiseCard()];
  const cid = h('input', { type: 'text', value: s.settings.clientId, placeholder: '1234567890-xxxx.apps.googleusercontent.com', spellcheck: false, 'aria-label': 'OAuth client ID' });
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Google'),
    h('div', { class: 'small muted' }, 'Drive keeps Clementine in step on all your devices and with your other apps (My Apps › hub › clementine), and brings who-works-when from Mandarin. Calendar takes your events out of your free time and holds your planned meet-ups.'),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } },
      signed ? h('button', { class: 'btn', onClick: () => { G.signOut(); saveWatch(null); render(); } }, 'Sign out') : h('button', { class: 'btn primary', onClick: async () => { try { if (cid.value.trim() !== s.settings.clientId) { store.update(x => ({ ...x, settings: { ...x.settings, clientId: cid.value.trim() } }), { remote: false }); } await G.init(cid.value.trim() || s.settings.clientId); await G.signIn({ renew: G.wasSignedIn() }).catch(() => G.signIn()); toast('Signed in', 'ok'); refreshAll(true, { full: true }); } catch (e) { toast(e.message, 'err'); } } }, G.wasSignedIn() ? 'Reconnect Google' : 'Sign in with Google'),
      signed ? h('button', { class: 'btn', onClick: () => refreshAll(true) }, '↻ Sync now') : null),
    signed ? h('div', { class: 'small muted', style: { marginTop: '8px' } }, `${s.google.email || 'signed in'}${s.google.lastSync ? ` · last sync ${new Date(s.google.lastSync).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}`) : null,
    h('details', { class: 'adv' }, h('summary', { class: 'small' }, 'Advanced'), h('div', { class: 'field' }, h('label', {}, 'OAuth client ID (the one Google Cloud client all your apps share)'), cid, h('div', { class: 'tiny dim' }, 'Only the client ID, never the secret. This site must be in the client’s "Authorised JavaScript origins".')),
      h('button', { class: 'btn sm', onClick: async () => { store.update(x => ({ ...x, settings: { ...x.settings, clientId: cid.value.trim() } }), { remote: false }); try { await G.init(cid.value.trim()); toast('Saved', 'ok'); } catch (e) { toast(e.message, 'err'); } } }, 'Save ID'),
      h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Country code for local numbers'), h('input', { value: s.settings.cc || '966', inputmode: 'numeric', 'aria-label': 'Country code', onChange: (e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4) || '966'; store.update(x => ({ ...x, settings: { ...x.settings, cc: v } })); } }), h('div', { class: 'tiny dim' }, '05… numbers become +966 5… for Call and WhatsApp.')),
      h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'Drive folder'), h('input', { value: s.settings.driveFolder, 'aria-label': 'Drive folder', onChange: (e) => { const v = e.target.value.trim() || 'My Apps'; if (/[\/\\]/.test(v) || v.length > 60) { e.target.value = s.settings.driveFolder; return toast('One folder name only (no “/”)', 'err'); } if (v !== 'My Apps' && !confirm(`Your apps share one folder, “My Apps”. Use “${v}” for Clementine anyway? Mandarin's roster and Citrus will not be found there.`)) { e.target.value = s.settings.driveFolder; return; } store.update(x => ({ ...x, settings: { ...x.settings, driveFolder: v } })); } }), h('div', { class: 'tiny dim' }, 'Keep “My Apps”: every app reads the hub there. Clementine keeps its files in My Apps/hub/clementine/.')))));
  if (signed) {
    const cals = rt.calendars, writable = cals.filter(c => /owner|writer/.test(c.accessRole || 'owner'));
    out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Calendars'),
      h('div', { class: 'tiny dim' }, 'Events in these calendars count as busy time.'),
      cals.length ? h('div', {}, ...cals.map(c => toggleRow(`${c.name}${c.primary ? ' (primary)' : ''}`, s.settings.calendarIds.includes(c.id), (on) => { store.update(x => ({ ...x, settings: { ...x.settings, calendarIds: on ? [...new Set([...x.settings.calendarIds, c.id])] : x.settings.calendarIds.filter(i => i !== c.id) } })); syncCalendar(true).then(render).catch(() => {}); }))) : h('div', { class: 'muted small' }, 'Sync to load calendars'),
      writable.length ? h('div', { class: 'field', style: { marginTop: '8px' } }, h('label', {}, 'Put planned meet-ups on'), h('select', { onChange: (e) => store.update(x => ({ ...x, settings: { ...x.settings, outingCalendarId: e.target.value } })) }, writable.map(c => h('option', { value: c.id, selected: (s.settings.outingCalendarId || 'primary') === c.id || (c.primary && s.settings.outingCalendarId === 'primary') }, c.name)))) : null,
      h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn sm', onClick: backupsSheet }, '⟲ Daily backups'), h('button', { class: 'btn sm', onClick: repairSheet }, '🩺 Check Drive'))));
  }
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Your apps'),
    h('div', { class: 'small muted' }, 'Clementine owns every contact card and everything social. It writes hub/clementine/status.json (what Citrus shows: birthdays, meet-ups, who is free) and contacts.json (phone, WhatsApp, Snapchat, Instagram by rota key, never notes). It reads Mandarin’s shifts.json for who works when, and never writes into another app’s files.'),
    R.has() ? null : h('div', { class: 'small', style: { marginTop: '6px' } }, rt.hub.shiftsError ? `Roster: ${rt.hub.shiftsError}.` : 'Roster: sign in to read it from Mandarin.'),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('a', { class: 'btn sm', href: `${CITRUS_URL}?from=clementine`, target: '_blank', rel: 'noopener' }, '🍊 Open Citrus'), h('a', { class: 'btn sm', href: `${MANDARIN_URL}?from=clementine`, target: '_blank', rel: 'noopener' }, '🍊 Open Mandarin'), signed ? h('button', { class: 'btn sm', onClick: () => publish().then(() => toast('Published', 'ok')).catch(e => toast(e.message, 'err')) }, 'Publish now') : null)));
  out.push(diagnosticsCard());
  out.push(h('div', { class: 'card' }, h('div', { class: 'title' }, 'Backup and data'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onClick: downloadBackup }, '⬇ Backup'),
      (() => { const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; let j; try { j = JSON.parse(await f.text()); } catch { return toast(`${f.name} is not a backup file (it isn’t JSON)`, 'err'); } if (MIG.looksLikeCitrus(j)) { migrationOffered = false; offerMigration(j, f.name); return; } restoreSheet(j, { source: f.name }); } }); return h('span', {}, inp, h('button', { class: 'btn', title: 'A Clementine backup, or a Citrus backup to bring your friends over', onClick: () => inp.click() }, '⬆ Restore or import')); })(),
      preRestore() ? h('button', { class: 'btn', onClick: undoRestore }, '↶ Undo restore') : null,
      signed ? h('button', { class: 'btn', onClick: migrateNow }, '🍊 Bring friends over from Citrus') : null,
      h('button', { class: 'btn danger', onClick: eraseSheet }, 'Erase this device…')),
    h('div', { class: 'tiny dim', style: { marginTop: '10px' } }, `Clementine ${VERSION} · Social & People · your data lives in this browser and your own Google Drive.`)));
  return out;
}
function downloadBackup() { const blob = new Blob([store.exportJSON()], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(blob), download: `clementine-backup-${keyOf(new Date())}.json` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
const ownKeys = () => { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('clementine.')) out.push(k); } } catch {} return out; };
function eraseSheet() {
  const signed = G.isSignedIn() || G.wasSignedIn();
  const { close } = sheet([h('h2', {}, 'Erase Clementine on this device?'),
    h('p', { class: 'small' }, `This removes Clementine's data from this browser only: friends, cards, outings, plans, settings and the interface choice (${ownKeys().length} saved items).`),
    h('p', { class: 'small muted' }, signed ? 'Your Google Drive copy is not touched. If you sign in again here, the next sync brings everything back from Drive.' : 'You are not using Google sync, so nothing else holds a copy: download a backup first if you may want it back.'),
    h('div', { class: 'row wrap sh-foot' }, h('button', { class: 'btn', onClick: downloadBackup }, '⬇ Backup first'), h('button', { class: 'btn danger grow', onClick: () => { for (const k of ownKeys()) try { localStorage.removeItem(k); } catch {} close(); location.reload(); } }, 'Erase this device'), h('button', { class: 'btn ghost', onClick: () => close() }, 'Cancel'))]);
}
function toggleRow(label, on, cb) {
  const t = h('button', { class: `toggle ${on ? 'on' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, onClick: () => { on = !on; t.classList.toggle('on', on); t.setAttribute('aria-checked', on ? 'true' : 'false'); cb(on); } });
  return h('div', { class: 'switch' }, h('span', { class: 'small' }, label), t);
}

window.__clementine = { refreshAll, publish, saveStateNow, pullState, store, G, R, rt, VERSION };   // for the console and the tests
boot();
