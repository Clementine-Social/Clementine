// Taking over the social parts of Citrus (pure). Clementine reads My Apps/hub/citrus/state.json (or a Citrus backup file) and
// copies what it now owns: friends (and family), contact cards for colleagues, outings and the last-seen log, time polls, the
// wishlist, team treats, and the Social timing (wake / late / shortest meet-up). It never writes into Citrus's file; Citrus
// stops writing friends and contacts once Clementine is live. Running it twice is harmless: the copy is merged record by
// record, newest edit wins.
import { mergeStates, sanitize } from './store.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const TAKE = ['friends', 'contacts', 'outings', 'polls', 'wishlist', 'treats'];
const TOMB = /^(friend|contact|outing|poll|wish|treat|touch):/;

/** The social part of a Citrus state, shaped as a Clementine state. → {part, counts} (part is null when there is nothing to take). */
export function socialPart(citrus) {
  if (!isObj(citrus)) return { part: null, counts: {} };
  const c = sanitize(citrus), part = { updatedAt: +c.updatedAt || 0, stamps: {}, deleted: {}, settings: {} }, counts = {};
  for (const k of TAKE) if (isObj(c[k]) && Object.keys(c[k]).length) {
    const m = {};
    for (const [id, v] of Object.entries(c[k])) if (isObj(v)) m[id] = { ...v, at: +v.at || +v.createdAt || 1 };   // a record without an edit time still counts (and loses to any real edit)
    if (Object.keys(m).length) { part[k] = m; counts[k] = Object.keys(m).length; }
  }
  // contacts are keyed by rota key; Citrus kept the key inside too, but make sure
  if (part.contacts) for (const [k, v] of Object.entries(part.contacts)) if (!v.key) part.contacts[k] = { ...v, key: k };
  for (const [k, t] of Object.entries(c.deleted || {})) if (TOMB.test(k)) part.deleted[k] = t;
  const soc = c.settings?.custom?.social;
  if (isObj(soc)) { part.settings.custom = { social: soc }; if (c.stamps?.['set:custom']) part.stamps['set:custom'] = c.stamps['set:custom']; counts.timing = 1; }
  return { part: Object.keys(counts).some(k => k !== 'timing') || counts.timing ? part : null, counts };
}

/** Merge the social part into this device's state. Local edits that are newer win; nothing local is lost. */
export function applyMigration(local, citrus, { source = 'citrus' } = {}) {
  const { part, counts } = socialPart(citrus);
  if (!part) return { state: local, counts, changed: false };
  const settings = { ...(local.settings || {}) };
  // the timing comes over only if you have not set your own here
  if (part.settings.custom && !local.settings?.custom?.social) settings.custom = { ...(settings.custom || {}), social: part.settings.custom.social };
  const merged = mergeStates(local, { ...local, ...part, settings, stamps: { ...(local.stamps || {}), ...part.stamps }, deleted: { ...(local.deleted || {}), ...part.deleted }, updatedAt: Math.max(local.updatedAt || 0, part.updatedAt) });
  if (settings.custom) merged.settings = { ...merged.settings, custom: settings.custom };
  merged.migrated = { from: source, at: Date.now(), counts };
  return { state: merged, counts, changed: true };
}
/** "12 friends · 4 contact cards · 30 outings" for the confirmation and the toast. */
export function describe(counts) {
  const W = { friends: ['friend', 'friends'], contacts: ['contact card', 'contact cards'], outings: ['outing', 'outings'], polls: ['poll', 'polls'], wishlist: ['wishlist item', 'wishlist items'], treats: ['treat', 'treats'], timing: ['timing setting', 'timing settings'] };
  return Object.entries(counts).filter(([k, n]) => n && k !== 'timing').map(([k, n]) => `${n} ${W[k] ? W[k][n === 1 ? 0 : 1] : k}`).join(' · ') || 'nothing social';
}
const CITRUS_ONLY = ['tasks', 'goals', 'plan', 'rotas', 'memos', 'media', 'notes', 'dayLog', 'habits', 'aims', 'study', 'chores', 'swaps'];
/** A backup that is not Clementine's own: anything without app:"clementine" that holds a Citrus-only key. */
export function looksLikeCitrus(j) { return isObj(j) && j.app !== 'clementine' && (j.app === 'citrus' || CITRUS_ONLY.some(k => k in j)); }
