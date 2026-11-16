// Your choices for how Clementine looks and behaves — synced with your state (settings.custom), unlike the per-device interface.
// Pure: defaults, sanitising and small getters. Settings › Customise edits it. `social` is the same shape Citrus used, so the
// migration brings your wake / late / shortest-meet timing over unchanged.
export const TABS = [['today', 'Today'], ['free', 'Free'], ['people', 'People'], ['outings', 'Outings'], ['plans', 'Plans']];
export const DEFAULTS = {
  start: 'today',
  tabs: { hidden: [], order: TABS.map(t => t[0]) },
  social: { days: 0, wake: 8 * 60, late: 24 * 60, minMeet: 90 },   // days 0 = fit the screen
  remind: { birthdays: 3 },                                         // days ahead a birthday becomes "waiting on you" (and a task offered to Citrus)
  today: { show: 'free', sort: 'free', max: 12, order: [], sections: { order: [], hidden: [] }, hidden: { date: '', ids: [] } },
  look: { accent: 'clementine', shape: 'bubbly', density: 'comfy', fun: true },
  me: { avatar: null },
};
/** The cards on Today, in their default order. Hide any; the faces row is the hero and always first. */
export const SECTIONS = [['week', 'This week strip'], ['due', 'Did these happen?'], ['coming', 'Coming up'], ['reminders', 'Don’t let it slip'], ['polls', 'Open polls'], ['best', 'Best times to meet'], ['actions', 'Quick actions']];
export const FACE_SHOW = [['free', 'Who is free today'], ['favs', 'Favourites only'], ['pinned', 'Only people I pin']];
export const FACE_SORT = [['free', 'Free soonest'], ['longest', 'Most time together'], ['overdue', 'Most overdue'], ['name', 'Name'], ['manual', 'My own order']];
export const ACCENTS = [['clementine', 'Clementine', '#ff6a3d'], ['peach', 'Peach', '#ff9466'], ['berry', 'Berry', '#ff4f8b'], ['lime', 'Lime', '#8fd14f'], ['sky', 'Sky', '#4fb4ff'], ['grape', 'Grape', '#a77bff']];
const arr = (v, ok) => Array.isArray(v) ? [...new Set(v.filter(x => ok.includes(x)))] : [];
const num = (v, lo, hi, d) => Number.isFinite(+v) && v !== '' && v !== null ? Math.max(lo, Math.min(hi, Math.round(+v))) : d;
const ids = (l) => l.map(x => Array.isArray(x) ? x[0] : x);
/** Clean, complete settings — never trust what came from storage or another device. */
export function custom(s) {
  const c = s?.settings?.custom || {}, t = c.tabs || {};
  const order = [...arr(t.order, ids(TABS)), ...ids(TABS).filter(x => !(t.order || []).includes(x))];
  const hidden = arr(t.hidden, ids(TABS)).filter(x => x !== 'today');   // Today can't be hidden: it's home
  const sc = c.social || {};
  const out = {
    start: ids(TABS).includes(c.start) && !hidden.includes(c.start) ? c.start : 'today',
    tabs: { hidden, order },
    social: { days: [0, 7, 10, 14, 21].includes(+sc.days) ? +sc.days : 0, wake: num(sc.wake, 4 * 60, 14 * 60, 480), late: num(sc.late, 18 * 60, 26 * 60, 1440), minMeet: num(sc.minMeet, 30, 360, 90) },
    remind: { birthdays: num(c.remind?.birthdays, 0, 14, 3) },
    today: (() => { const t = c.today || {}, so = arr(t.sections?.order, ids(SECTIONS)), hid = t.hidden && typeof t.hidden === 'object' ? t.hidden : {};
      return { show: ids(FACE_SHOW).includes(t.show) ? t.show : 'free', sort: ids(FACE_SORT).includes(t.sort) ? t.sort : 'free', max: num(t.max, 3, 40, 12), order: Array.isArray(t.order) ? t.order.filter(x => typeof x === 'string').slice(0, 200) : [],
        sections: { order: [...so, ...ids(SECTIONS).filter(x => !so.includes(x))], hidden: arr(t.sections?.hidden, ids(SECTIONS)) },
        hidden: { date: /^\d{4}-\d\d-\d\d$/.test(hid.date || '') ? hid.date : '', ids: Array.isArray(hid.ids) ? hid.ids.filter(x => typeof x === 'string').slice(0, 100) : [] } }; })(),
    look: (() => { const l = c.look || {}; return { accent: ids(ACCENTS).includes(l.accent) ? l.accent : 'clementine', shape: ['bubbly', 'classic'].includes(l.shape) ? l.shape : 'bubbly', density: ['comfy', 'compact'].includes(l.density) ? l.density : 'comfy', fun: l.fun !== false }; })(),
    me: { avatar: c.me?.avatar && typeof c.me.avatar === 'object' ? c.me.avatar : null },
  };
  if (out.social.late - out.social.wake < 4 * 60) out.social.late = Math.min(26 * 60, out.social.wake + 4 * 60);
  return out;
}
/** Change one part: returns the new state (patch is merged one level deep). */
export function setCustom(s, part, patch) { const cur = custom(s); return { ...s, settings: { ...s.settings, custom: { ...cur, [part]: typeof patch === 'object' && !Array.isArray(patch) ? { ...cur[part], ...patch } : patch } } }; }
export const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
export function move(list, id, dir) { const i = list.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return list; const l = [...list]; [l[i], l[j]] = [l[j], l[i]]; return l; }
export const visibleTabs = (s) => { const c = custom(s); return c.tabs.order.filter(t => !c.tabs.hidden.includes(t)); };
