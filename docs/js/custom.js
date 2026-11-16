// Your choices for how Clementine looks and behaves — synced with your state (settings.custom), unlike the per-device interface.
// Pure: defaults, sanitising and small getters. Settings › Customise edits it. `social` is the same shape Citrus used, so the
// migration brings your wake / late / shortest-meet timing over unchanged.
export const TABS = [['today', 'Today'], ['free', 'Free'], ['people', 'People'], ['outings', 'Outings'], ['plans', 'Plans']];
export const DEFAULTS = {
  start: 'today',
  tabs: { hidden: [], order: TABS.map(t => t[0]) },
  social: { days: 0, wake: 8 * 60, late: 24 * 60, minMeet: 90 },   // days 0 = fit the screen
  remind: { birthdays: 3 },                                         // days ahead a birthday becomes "waiting on you" (and a task offered to Citrus)
};
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
  };
  if (out.social.late - out.social.wake < 4 * 60) out.social.late = Math.min(26 * 60, out.social.wake + 4 * 60);
  return out;
}
/** Change one part: returns the new state (patch is merged one level deep). */
export function setCustom(s, part, patch) { const cur = custom(s); return { ...s, settings: { ...s.settings, custom: { ...cur, [part]: typeof patch === 'object' && !Array.isArray(patch) ? { ...cur[part], ...patch } : patch } } }; }
export const toggleIn = (list, id) => list.includes(id) ? list.filter(x => x !== id) : [...list, id];
export function move(list, id, dir) { const i = list.indexOf(id), j = i + dir; if (i < 0 || j < 0 || j >= list.length) return list; const l = [...list]; [l[i], l[j]] = [l[j], l[i]]; return l; }
export const visibleTabs = (s) => { const c = custom(s); return c.tabs.order.filter(t => !c.tabs.hidden.includes(t)); };
