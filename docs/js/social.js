// People and time together: contact cards, friends, who is free when, when you and they overlap, and what to do with that time.
// Pure functions (no DOM). Shifts come from Mandarin's roster (roster.js); everything else is Clementine's own state.
// Ported from Citrus Maxima's Social (social.js) on 16/11/2026, with the rota reading moved to roster.js.
import { keyOf, fromKey, addDays, startOfDay } from './util.js';
import * as R from './roster.js';

const rec = (m) => Object.values(m || {});
const uid = () => 'f' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9, so a number typed on an Arabic keyboard still dials. */
export const asciiDigits = (v) => String(v ?? '').replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6F0));

// ───────────────────────────── handles and links (paste a link, an @name or a bare name — all work)
const HANDLE = /^[A-Za-z0-9._-]{1,40}$/;
const SITE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|snapchat\.com\/add|snapchat\.com\/@|snapchat\.com|tiktok\.com\/@|x\.com|twitter\.com)\/+/i;
/** A username from whatever was pasted: a profile link (with or without https), "@name", "@@name!!", or a sentence ("my snap is faisal" → the @word, else the last word). '' when nothing usable is left. */
export const cleanHandle = (v) => {
  let x = String(v || '').trim(); if (!x) return '';
  x = x.replace(SITE, '').split(/[/?#]/)[0];
  const words = x.split(/\s+/).filter(Boolean), at = words.find(w => w.startsWith('@'));
  x = (at || words[words.length - 1] || '').replace(/^@+/, '').replace(/[!?.,;:)]+$/, '');   // other junk (<b>, quotes) makes it unusable rather than guessed
  return HANDLE.test(x) ? x : '';
};
/** Digits only with a country code. Local Saudi numbers (05xxxxxxxx) get 966; anything with + or 00 is kept as given. */
export function normPhone(v, cc = '966') {
  let d = asciiDigits(v).trim(); if (!d) return ''; const plus = d.startsWith('+') || d.startsWith('00'); d = d.replace(/[^\d]/g, ''); if (d.startsWith('00')) d = d.slice(2);
  if (plus) return d.length >= 8 && d.length <= 15 ? d : '';
  if (d.startsWith('0')) d = cc + d.slice(1); else if (d.length <= 9) d = cc + d;
  return d.length >= 8 && d.length <= 15 ? d : '';
}
export const links = (f, cc = '966') => {
  const ph = normPhone(f.phone, cc), wa = normPhone(f.whatsapp, cc) || ph, snap = cleanHandle(f.snap), ig = cleanHandle(f.insta);   // a junk WhatsApp entry falls back to the phone
  return { tel: ph ? `tel:+${ph}` : '', wa: wa ? `https://wa.me/${wa}` : '', snap: snap ? `https://www.snapchat.com/add/${snap}` : '', insta: ig ? `https://www.instagram.com/${ig}/` : '', sms: ph ? `sms:+${ph}` : '' };
};
export const waWith = (f, text, cc) => { const l = links(f, cc).wa; return l ? `${l}?text=${encodeURIComponent(text)}` : ''; };

/** A birthday from what people actually type: 1990-03-14, 14/03/1990, 14.3, 14-03, 03-14 (ISO month-day), vCard --0314. Day first when it is ambiguous (Saudi habit). Returns YYYY-MM-DD, MM-DD or ''. */
export function parseBirthday(v) {
  const x = asciiDigits(v).trim(); if (!x) return '';
  const ok = (y, m, d) => { m = +m; d = +d; if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return ''; const dt = new Date(y ? +y : 2000, m - 1, d); if (dt.getMonth() !== m - 1) return ''; const md = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return y ? `${y}-${md}` : md; };
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(x))) return ok(m[1], m[2], m[3]);
  if ((m = /^(\d{4})(\d\d)(\d\d)$/.exec(x))) return ok(m[1], m[2], m[3]);
  if ((m = /^--(\d\d)-?(\d\d)$/.exec(x))) return ok('', m[1], m[2]);
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(x))) return ok(m[3], m[2], m[1]);
  if ((m = /^(\d{1,2})[/.](\d{1,2})$/.exec(x))) return ok('', m[2], m[1]);
  if ((m = /^(\d\d)-(\d\d)$/.exec(x))) return ok('', m[1], m[2]) || ok('', m[2], m[1]);   // MM-DD is the stored form; 31-12 still works
  return '';
}
/** "14/03" (or "14/03/1990") for a stored birthday. */
export const fmtBirthday = (b) => { const p = String(b || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : p.length === 2 ? `${p[1]}/${p[0]}` : ''; };

// ───────────────────────────── friend records (merge per record by `at`, like everything else)
export const FRIEND_KINDS = [{ id: 'gp', label: 'GP colleague' }, { id: 'nurse', label: 'Nurse / shifts' }, { id: 'colleague', label: 'Other colleague' }, { id: 'family', label: 'Family' }, { id: 'other', label: 'Friend' }];
const KIND_IDS = FRIEND_KINDS.map(k => k.id);
/** Circles of closeness (after Dunbar: about 5 closest, 15 close, 50 friends, 150 wider), each with a default keep-in-touch gap.
 *  [id, label, icon, days, hint]. A friend's own "every" wins over their circle's. */
export const CIRCLES = [['inner', 'Inner circle', '💛', 7, 'Your closest few, the ones you would call at 3am'], ['close', 'Close friends', '🧡', 21, 'You see them often and tell them things'], ['friends', 'Friends', '💚', 45, 'Good company, every month or so'], ['wider', 'Wider circle', '💙', 90, 'People you like to catch up with now and then']];
const CIRCLE_IDS = CIRCLES.map(c => c[0]);
/** Days you want between catch-ups: theirs, else their circle's, else 0 (no reminder). */
export const cadence = (f) => +f?.every || CIRCLES.find(c => c[0] === f?.circle)?.[3] || 0;
export const SHIFT_CODES = [{ id: 'D', label: 'Day' }, { id: 'E', label: 'Evening' }, { id: 'N', label: 'Night' }, { id: 'off', label: 'Off' }, { id: 'leave', label: 'Leave' }];
// Hours for shifts entered by hand when neither the friend nor their rota says otherwise. Nurses here work 12h D/N.
const DEFAULT_HOURS = { D: [7 * 60, 19 * 60], E: [13 * 60, 22 * 60], N: [19 * 60, 7 * 60] };
const NURSE_HOURS = { D: [8 * 60, 20 * 60], E: [12 * 60, 24 * 60], N: [20 * 60, 8 * 60] };
const cleanHours = (o) => { const out = {}; for (const c of ['D', 'E', 'N']) { const v = o?.[c]; if (Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(+n) && +n >= 0 && +n <= 1440) && +v[0] !== +v[1]) out[c] = [+v[0], +v[1]]; } return out; };
// hand-entered days older than ~2 months are dropped: they can never matter again and would only grow the file
const cleanSched = (o, now = new Date()) => { const out = {}, cut = keyOf(addDays(startOfDay(now), -60)); if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (/^\d{4}-\d\d-\d\d$/.test(k) && k >= cut && ['D', 'E', 'N', 'off', 'leave'].includes(v)) out[k] = v; return out; };
/** Other dates worth remembering for a person (anniversary, their child's birthday, a graduation): [{label, date}] with MM-DD or YYYY-MM-DD. */
const cleanDates = (l) => (Array.isArray(l) ? l : []).map(d => ({ label: String(d?.label || '').trim().slice(0, 30), date: parseBirthday(d?.date) })).filter(d => d.label && d.date).slice(0, 8);
/** Gift ideas: [{id, text, done}] — done is the date it was given ('' while it is still an idea). */
/** How a face looks: initials (default), an emoji, a built-in character, or a small photo (a data URL made on this device).
 *  `hue` overrides the colour picked from the name. Anything else is dropped. */
export const CHAR_PARTS = { body: ['round', 'bean', 'drop', 'citrus', 'cloud'], eyes: ['dot', 'happy', 'sleepy', 'wink', 'glasses', 'sparkle'], mouth: ['smile', 'grin', 'o', 'cat', 'flat', 'tongue'], top: ['none', 'leaf', 'bow', 'cap', 'ghutra', 'hijab', 'crown', 'headphones', 'curls'] };
const PHOTO = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$/;
export function cleanAvatar(a) {
  if (!a || typeof a !== 'object') return null;
  const hue = Number.isFinite(+a.hue) && a.hue !== null && a.hue !== '' ? Math.round(((+a.hue % 360) + 360) % 360) : null, base = hue != null ? { hue } : {};
  if (a.type === 'photo' && typeof a.photo === 'string' && a.photo.length <= 60000 && PHOTO.test(a.photo)) return { type: 'photo', photo: a.photo, ...base };
  if (a.type === 'emoji' && typeof a.emoji === 'string' && a.emoji.trim() && [...a.emoji.trim()].length <= 4) return { type: 'emoji', emoji: a.emoji.trim(), ...base };
  if (a.type === 'char' && a.char && typeof a.char === 'object') { const c = {}; for (const [k, l] of Object.entries(CHAR_PARTS)) c[k] = l.includes(a.char[k]) ? a.char[k] : l[0]; return { type: 'char', char: c, ...base }; }
  return hue != null ? { type: 'initials', ...base } : null;
}
const cleanGifts = (l) => (Array.isArray(l) ? l : []).map(g => ({ id: String(g?.id || 'g' + Math.random().toString(36).slice(2, 8)).slice(0, 20), text: String(g?.text || '').trim().slice(0, 80), done: /^\d{4}-\d\d-\d\d$/.test(g?.done || '') ? g.done : '' })).filter(g => g.text).slice(0, 30);
export function addFriend(s, f) {
  const name = String(f.name || '').trim().slice(0, 60); if (!name) return s; const id = f.id || uid();
  const fr = { id, name, nick: String(f.nick || '').slice(0, 30), kind: KIND_IDS.includes(f.kind) ? f.kind : 'other', phone: asciiDigits(f.phone || '').slice(0, 24), whatsapp: asciiDigits(f.whatsapp || '').slice(0, 24), snap: cleanHandle(f.snap), insta: cleanHandle(f.insta),
    rotaKey: /^(id|name):/.test(f.rotaKey || '') ? f.rotaKey : '', place: String(f.place || '').slice(0, 60), birthday: parseBirthday(f.birthday), every: Math.max(0, Math.min(365, +f.every || 0)), notes: String(f.notes || '').slice(0, 500),
    sched: cleanSched(f.sched), avatar: cleanAvatar(f.avatar), onToday: ['always', 'never'].includes(f.onToday) ? f.onToday : 'auto', dates: cleanDates(f.dates), gifts: cleanGifts(f.gifts), weeklyOff: Array.isArray(f.weeklyOff) ? [...new Set(f.weeklyOff.map(Number).filter(n => n >= 0 && n <= 6))] : [], hours: cleanHours(f.hours), circle: CIRCLE_IDS.includes(f.circle) ? f.circle : '', met: String(f.met || '').slice(0, 160), food: String(f.food || '').slice(0, 160), fav: !!f.fav, createdAt: f.createdAt || Date.now(), at: Date.now() };
  const s2 = { ...s, friends: { ...(s.friends || {}), [id]: fr } };
  // a colleague who becomes a friend: their friend record is now their card, so the separate card goes (with a tombstone)
  if (fr.rotaKey && s2.contacts?.[fr.rotaKey]) { const contacts = { ...s2.contacts }; delete contacts[fr.rotaKey]; return { ...s2, contacts, deleted: { ...(s2.deleted || {}), [`contact:${fr.rotaKey}`]: Date.now() } }; }
  return s2;
}
export function updateFriend(s, id, patch) { const cur = s.friends?.[id]; if (!cur) return s; return addFriend(s, { ...cur, ...patch, id, createdAt: cur.createdAt }); }
/** Remove a friend. A colleague (linked to a rota row) keeps their numbers as a contact card unless `drop`.
 *  Their id leaves groups, open polls and the wishlist (so a poll is never stuck "waiting" on someone gone); past outings
 *  and touches keep their name, so the history still reads right. */
export function deleteFriend(s, id, { drop = false } = {}) {
  const f = s.friends?.[id]; if (!f) return s; const friends = { ...(s.friends || {}) }; delete friends[id]; const now = Date.now(), name = shortName(f);
  let out = { ...s, friends, deleted: { ...(s.deleted || {}), [`friend:${id}`]: now } };
  const touchRecs = (coll, fn) => { const m = { ...(out[coll] || {}) }; let changed = false; for (const [k, r] of Object.entries(m)) { const n = fn(r); if (n && n !== r) { m[k] = { ...n, at: now }; changed = true; } } if (changed) out = { ...out, [coll]: m }; };
  touchRecs('groups', (g) => g.members?.includes(id) ? { ...g, members: g.members.filter(m => m !== id) } : g);
  touchRecs('polls', (p) => p.status === 'open' && p.who?.includes(id) ? { ...p, who: p.who.filter(w => w !== id), votes: Object.fromEntries(Object.entries(p.votes || {}).filter(([k]) => k !== id)) } : p);
  touchRecs('wishlist', (w) => w.with?.includes(id) ? { ...w, with: w.with.filter(x => x !== id) } : w);
  touchRecs('outings', (o) => o.who?.includes(id) ? { ...o, gone: { ...(o.gone || {}), [id]: name } } : o);
  touchRecs('touches', (t) => t.who?.includes(id) ? { ...t, gone: { ...(t.gone || {}), [id]: name } } : t);
  // their family links stay in the tree under their name; open things to ask them go; life events keep their name
  touchRecs('ties', (t) => t.a === id || t.b === id ? { ...t, a: t.a === id ? `p:${R.bare(f.name)}` : t.a, b: t.b === id ? `p:${R.bare(f.name)}` : t.b } : t);
  touchRecs('life', (l) => l.who === id ? { ...l, gone: name } : l);
  for (const [k, a] of Object.entries(out.asks || {})) if (a.who === id) { const asks = { ...out.asks }; delete asks[k]; out = { ...out, asks, deleted: { ...out.deleted, [`ask:${k}`]: now } }; }
  if (!drop && f.rotaKey && (f.phone || f.whatsapp || f.snap || f.insta || f.birthday)) out = setContact(out, f.rotaKey, { phone: f.phone, whatsapp: f.whatsapp, snap: f.snap, insta: f.insta, birthday: f.birthday, note: '' });
  return out;
}
export const friendList = (s) => rec(s.friends).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.name.localeCompare(b.name));
export const shortName = (f) => f.nick || R.bare(f.name).split(' ')[0] || String(f.name);
/** Short names that stay unique inside one list: first name, plus the last initial when two share it ("Fatima M.", "Fatima A."). */
export function shortNames(list) {
  const first = list.map(f => f.nick || R.bare(f.name).split(' ')[0]), n = {}; first.forEach(x => { n[x] = (n[x] || 0) + 1; });
  return list.map((f, i) => { if (f.nick || n[first[i]] < 2) return first[i] || String(f.name); const w = R.bare(f.name).split(' '); return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : first[i]; });
}
/** Set (or clear with '') one day of a manually-kept schedule. */
export function setShift(s, id, date, code) { const f = s.friends?.[id]; if (!f) return s; const sched = { ...(f.sched || {}) }; if (!code) delete sched[date]; else sched[date] = code; return updateFriend(s, id, { sched }); }

// ───────────────────────────── groups (saved sets of friends for find-a-day and invites)
export function saveGroup(s, g) {
  const id = g.id || 'g' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3), name = String(g.name || '').trim().slice(0, 40); if (!name) return s;
  const members = [...new Set((g.members || []).filter(m => typeof m === 'string' && m))].slice(0, 40);
  return { ...s, groups: { ...(s.groups || {}), [id]: { id, name, icon: String(g.icon || '').slice(0, 4), members, at: Date.now() } } };
}
export function deleteGroup(s, id) { const groups = { ...(s.groups || {}) }; delete groups[id]; return { ...s, groups, deleted: { ...(s.deleted || {}), [`group:${id}`]: Date.now() } }; }
/** Groups by name; members who are no longer friends are left out. */
export const groupList = (s) => rec(s.groups).map(g => ({ ...g, members: g.members.filter(m => s.friends?.[m]) })).sort((a, b) => a.name.localeCompare(b.name));

// ───────────────────────────── linking to the roster
export const rotaPeopleList = () => R.people();
export const matchRota = (s, name) => R.match(name);
export const unitOfKey = (s, key) => R.unitOf(key);
/** Hours for a hand-entered code: what you set on the friend, else their roster's hours for that letter, else a sensible default. */
export function shiftHours(s, f, code) {
  if (f.hours?.[code]) return f.hours[code];
  const unit = f.rotaKey ? R.unitOf(f.rotaKey) : '';
  if (unit) { const h = R.hoursFor(code, unit); if (h) return [h[0], h[1] % 1440 || 1440]; }
  return ((f.kind === 'nurse' || unit === 'nurse') ? NURSE_HOURS : DEFAULT_HOURS)[code] || null;
}
/** The last day the roster covers, so "later days unknown" can be said out loud. */
export const scheduleEnd = () => R.coverEnd();

// ───────────────────────────── when is someone free?
const H = 60, AFTER = 45, BEFORE = 90;
let MIN_WINDOW = 90, WAKE = 8 * H, LATE = 24 * H;
/** Your own day: when you're up, when you call it a night, and the shortest meet-up worth suggesting (Settings › Timing). */
export function setTiming({ wake = 8 * H, late = 24 * H, minMeet = 90 } = {}) { WAKE = wake; LATE = late; MIN_WINDOW = minMeet; }
export const timing = () => ({ wake: WAKE, late: LATE, minMeet: MIN_WINDOW });
/** The shift (or lack of one) of a person on a date: { status: 'off'|'work'|'leave'|'unknown', start, end, type } with minutes from that day's midnight (end may pass 1440). */
function personShift(s, f, date) {
  const key = keyOf(date);
  let why = '';
  if (f.rotaKey) {
    const sh = R.shiftOf(f.rotaKey, key);
    if (sh && sh.kind === 'work' && sh.start != null) return { status: 'work', type: sh.type, start: sh.start, end: sh.end <= sh.start ? sh.end + 1440 : sh.end, site: sh.site };
    if (sh && (sh.kind === 'leave' || sh.kind === 'off')) return { status: sh.kind, type: '' };
    if (sh && sh.kind === 'other') why = /pull/i.test(sh.code) ? 'pulled out' : sh.code === 'other' ? 'away from the rota' : sh.code.toLowerCase();   // training, pulled out…: the schedule says nothing useful, so use what you entered by hand
  }
  const code = f.sched?.[key];
  if (code) { if (code === 'off') return { status: 'off', type: '' }; if (code === 'leave') return { status: 'leave', type: '' }; const hrs = shiftHours(s, f, code); if (hrs) return { status: 'work', type: code, start: hrs[0], end: hrs[1] <= hrs[0] ? hrs[1] + 1440 : hrs[1], manual: true }; }
  if (f.weeklyOff?.includes(date.getDay())) return { status: 'off', type: '' };
  return { status: 'unknown', type: '', why };
}
/** Is the person coming off a real night (yesterday's shift still running into this morning)? Then the day is for sleep first — never "a day off". */
const nightTail = (prev) => prev.status === 'work' && prev.end > 1440 ? prev.end - 1440 : 0;
/** Free windows [from, to] in minutes for someone on a date, allowing for travel, sleep after a night and a rest before one. */
export function freeWindows(s, f, date) {
  const today = personShift(s, f, date), prev = personShift(s, f, addDays(date, -1)), wins = [];
  const tailEnd = nightTail(prev);                                                     // yesterday's night shift still running into this morning
  const from = Math.max(WAKE, tailEnd ? tailEnd + 8 * H : WAKE);                       // after a night, sleep ~8h first
  if (today.status === 'leave' || today.status === 'off') wins.push([Math.min(from, 20 * H), LATE]);
  else if (today.status === 'work') {
    if (today.type === 'N' || today.start >= 17 * H) { const to = today.start - BEFORE - (today.type === 'N' ? 2 * H : 0); if (to - Math.max(from, 14 * H) >= MIN_WINDOW) wins.push([Math.max(from, 14 * H), to]); }   // before an evening or night: only the afternoon
    else { if (today.start - BEFORE - from >= MIN_WINDOW) wins.push([from, today.start - BEFORE]); const after = today.end + AFTER; if (today.end <= LATE && LATE - after >= MIN_WINDOW) wins.push([after, LATE]); }
  } else return [];
  return wins.filter(w => w[1] - w[0] >= MIN_WINDOW);
}
export const dayState = (s, f, date) => {
  const sh = personShift(s, f, date), w = freeWindows(s, f, date), prev = personShift(s, f, addDays(date, -1)), afterNight = nightTail(prev) >= 3 * H;
  return { ...sh, windows: w, free: w.length ? (!afterNight && w.some(x => x[1] - x[0] >= 8 * H) ? 'all' : 'part') : sh.status === 'unknown' ? 'unknown' : 'busy', afterNight, prevTail: nightTail(prev) };
};
/** Drop what is already past: on `now`'s day nothing starts before now + `lead` minutes (getting there), earlier days have nothing left. */
export function clipToNow(wins, date, now = new Date(), lead = AFTER, min = MIN_WINDOW) {
  const cut = Math.round((now - startOfDay(date)) / 60000) + lead; if (cut <= WAKE) return wins;
  return wins.map(([a, b]) => [Math.max(a, cut), b]).filter(([a, b]) => b - a >= min);
}

/** You, as a friend-shaped record so the same code answers "when am I free?". Events you already have that day subtract from your windows. */
const myKey = () => R.meKey();
export function myWindows(s, date, busy = []) {
  const key = myKey();
  let wins = key ? freeWindows(s, { rotaKey: key }, date) : [[WAKE, LATE]];
  if (key && !wins.length && personShift(s, { rotaKey: key }, date).status === 'unknown') wins = [[WAKE, LATE]];   // no rota for that day: assume you are free, like without Mandarin
  for (const [bs, be] of busy) wins = wins.flatMap(([a, b]) => be <= a || bs >= b ? [[a, b]] : [[a, Math.min(b, bs)], [Math.max(a, be), b]]).filter(w => w[1] - w[0] >= MIN_WINDOW);
  return wins;
}
const intersect = (A, B) => A.flatMap(([a, b]) => B.map(([c, d]) => [Math.max(a, c), Math.min(b, d)])).filter(w => w[1] - w[0] >= MIN_WINDOW);

/** Ranked chances to meet. For every day in range: the windows when you and the chosen friends are all free (or most of them).
 *  Times before `now` (+ travel) are never offered. `busy` = known but not free; `unknown` = no schedule info (not the same as busy). */
export function meetups(s, { ids = null, from = null, days = 21, minMin = 120, busyOf = () => [], now = new Date() } = {}) {
  const friends = friendList(s).filter(f => !ids || ids.includes(f.id)); const out = [], start = startOfDay(from || now), meKey = myKey();   // no `from`: start on `now`'s day, not the machine's
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i), mine = clipToNow(myWindows(s, date, busyOf(date)), date, now); if (!mine.length) continue;
    const states = friends.map(f => { const st = dayState(s, f, date); return { f, wins: st.windows, st }; });
    const known = states.filter(x => x.st.free !== 'unknown').sort((a, b) => (b.f.fav ? 1 : 0) - (a.f.fav ? 1 : 0)), unknownF = states.filter(x => x.st.free === 'unknown').map(x => x.f);
    const meNight = meKey ? dayState(s, { rotaKey: meKey }, date).afterNight : false;
    // best window for the largest group: try each of my windows, intersect friend by friend, keep those who still fit
    for (const mw of mine) {
      let group = [], win = [mw];
      for (const x of known) { const nw = intersect(win, x.wins); if (nw.length) { win = nw; group.push(x); } }
      if (!group.length) continue; const w = win.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]; if (w[1] - w[0] < minMin) continue;
      const gf = group.map(x => x.f), missing = friends.filter(f => !gf.includes(f)), dow = date.getDay(), weekend = dow === 5 || dow === 6;
      const all = !missing.length, unknownN = unknownF.length, dayLong = w[1] - w[0] >= 8 * H && !meNight && !group.some(x => x.st.afterNight);
      const score = gf.length * 10 + (all && friends.length > 1 ? 15 : 0) - missing.length * 3 + Math.min(w[1] - w[0], 480) / 60 + (weekend ? 4 : 0) + (w[0] >= 17 * H ? 1.5 : 0) - i * 0.15 - unknownN * 0.5 + gf.filter(f => overdue(s, f, date) > 0).length * 2;
      out.push({ date, key: keyOf(date), window: w, who: gf.map(f => f.id), missing: missing.map(f => f.id), busy: missing.filter(f => !unknownF.includes(f)).map(f => f.id), unknown: unknownF.map(f => f.id), all, unknownN, weekend, score, dayLong });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ───────────────────────────── outings, keeping in touch
/** `start` (minutes) is kept for planned meet-ups so "did it happen?" waits until it has. A future date is always planned. */
export function logOuting(s, o, now = new Date()) {
  const id = o.id || 'o' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4), when = /^\d{4}-\d\d-\d\d$/.test(o.date) ? o.date : keyOf(now);
  const start = Number.isFinite(+o.start) && o.start !== '' && o.start != null ? Math.max(0, Math.min(1439, Math.round(+o.start))) : null;
  const out = { id, date: when, who: [...new Set((o.who || []).filter(Boolean))], what: String(o.what || '').slice(0, 80), where: String(o.where || '').slice(0, 80), rating: Math.max(0, Math.min(5, +o.rating || 0)), notes: String(o.notes || '').slice(0, 400), planned: !!o.planned || when > keyOf(now), ...(start != null ? { start } : {}), ...(o.eventId ? { eventId: String(o.eventId).slice(0, 200) } : {}), at: Date.now() };
  const bring = cleanBring(o.bring), cost = cleanCost(o.cost);
  if (bring.length) out.bring = bring; if (cost) out.cost = cost;
  if (o.gone && typeof o.gone === 'object') out.gone = Object.fromEntries(Object.entries(o.gone).slice(0, 20).map(([k, v]) => [k, String(v).slice(0, 40)]));
  if (o.fromPoll) out.fromPoll = String(o.fromPoll).slice(0, 40);
  if (o.rsvp && typeof o.rsvp === 'object') { const r = Object.fromEntries(Object.entries(o.rsvp).filter(([k, v]) => out.who.includes(k) && ['yes', 'maybe', 'no'].includes(v))); if (Object.keys(r).length) out.rsvp = r; }
  return { ...s, outings: { ...(s.outings || {}), [id]: out } };
}
/** Who brings what to a gathering: [{id, item, who ('me' | friend id | ''), done}]. */
export const cleanBring = (l) => (Array.isArray(l) ? l : []).map(b => ({ id: String(b?.id || 'b' + Math.random().toString(36).slice(2, 8)).slice(0, 20), item: String(b?.item || '').trim().slice(0, 60), who: typeof b?.who === 'string' ? b.who.slice(0, 40) : '', done: !!b?.done })).filter(b => b.item).slice(0, 40);
/** The bill: {total, paidBy ('me' | friend id), split: ['me', ids…], settled: [ids who paid you back, or 'me' when you paid them]}. null when there is none. */
export const cleanCost = (c) => { const total = Math.round((+c?.total || 0) * 100) / 100; if (!(total > 0) || total > 1e6) return null; const split = [...new Set((Array.isArray(c.split) ? c.split : []).filter(x => typeof x === 'string' && x))].slice(0, 30); const paidBy = typeof c.paidBy === 'string' && c.paidBy ? c.paidBy : 'me'; return { total, paidBy, split: split.length ? split : ['me'], settled: [...new Set((Array.isArray(c.settled) ? c.settled : []).filter(x => typeof x === 'string'))].slice(0, 30) }; };
/** Mark a share as paid back (or not). */
export function settle(s, outingId, who, paid = true) { const o = s.outings?.[outingId]; if (!o?.cost) return s; const set = new Set(o.cost.settled); paid ? set.add(who) : set.delete(who); return { ...s, outings: { ...s.outings, [outingId]: { ...o, cost: { ...o.cost, settled: [...set] }, at: Date.now() } } }; }
/** Money between you and each friend from shared bills: {id: amount}; positive = they owe you, negative = you owe them. Bills between two friends are theirs. */
export function balances(s) {
  const bal = {};
  for (const o of rec(s.outings)) {
    const c = o.cost; if (!c || !c.split.length) continue; const share = c.total / c.split.length;
    if (c.paidBy === 'me') { for (const p of c.split) if (p !== 'me' && !c.settled.includes(p)) bal[p] = (bal[p] || 0) + share; }
    else if (c.split.includes('me') && !c.settled.includes('me')) bal[c.paidBy] = (bal[c.paidBy] || 0) - share;
  }
  for (const k of Object.keys(bal)) { bal[k] = Math.round(bal[k] * 100) / 100; if (Math.abs(bal[k]) < 0.01) delete bal[k]; }
  return bal;
}
/** Open shares per friend, for the settle-up sheet: [{outing, amount, mine (you owe)}]. */
export function openShares(s, id) {
  const out = [];
  for (const o of outingList(s)) { const c = o.cost; if (!c) continue; const share = Math.round(c.total / c.split.length * 100) / 100;
    if (c.paidBy === 'me' && c.split.includes(id) && !c.settled.includes(id)) out.push({ outing: o, amount: share, mine: false });
    else if (c.paidBy === id && c.split.includes('me') && !c.settled.includes('me')) out.push({ outing: o, amount: share, mine: true }); }
  return out;
}
/** A friend's name on a record, even after they were removed (`gone` keeps it). */
export const nameOn = (s, rec, id) => { const f = s.friends?.[id]; return f ? shortName(f) : rec?.gone?.[id] || 'someone'; };

// ───────────── touches: a call, a message, a visit — keeping in touch without meeting up
export const TOUCH_KINDS = [['call', '📞', 'Call'], ['message', '💬', 'Message'], ['visit', '🏠', 'Visit'], ['gift', '🎁', 'Gift'], ['other', '✨', 'Other']];
export function logTouch(s, t, now = new Date()) {
  const id = t.id || 't' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4), who = [...new Set((t.who || []).filter(Boolean))].slice(0, 20); if (!who.length) return s;
  const kind = TOUCH_KINDS.some(k => k[0] === t.kind) ? t.kind : 'other', date = /^\d{4}-\d\d-\d\d$/.test(t.date) && t.date <= keyOf(now) ? t.date : keyOf(now);
  return { ...s, touches: { ...(s.touches || {}), [id]: { id, who, kind, date, note: String(t.note || '').slice(0, 200), ...(t.gone ? { gone: t.gone } : {}), at: Date.now() } } };
}
export function deleteTouch(s, id) { const touches = { ...(s.touches || {}) }; delete touches[id]; return { ...s, touches, deleted: { ...(s.deleted || {}), [`touch:${id}`]: Date.now() } }; }
export const touchList = (s) => rec(s.touches).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
export function lastTouch(s, id) { const t = touchList(s).find(x => x.who.includes(id)); return t ? t.date : ''; }
/** The last time you were in touch at all: met up, or a call / message / visit. */
export function lastContact(s, id, now = new Date()) { const a = lastSeen(s, id, now), b = lastTouch(s, id); return a > b ? a : b; }
/** Everything you did with someone, newest first: outings and touches together. */
export function timeline(s, id, now = new Date(), n = 30) {
  const t = keyOf(now), o = outingList(s).filter(x => x.who.includes(id) && (!x.planned || x.date >= t)).map(x => ({ kind: x.planned ? 'plan' : 'outing', date: x.date, rec: x })), k = touchList(s).filter(x => x.who.includes(id)).map(x => ({ kind: 'touch', date: x.date, rec: x }));
  return [...o, ...k].sort((a, b) => b.date.localeCompare(a.date)).slice(0, n);
}
/** A planned outing whose time has passed: ask whether it happened. Without a start time, ask from the next day. */
export const outingDue = (o, now = new Date()) => { if (!o.planned) return false; const t = keyOf(now); if (o.date < t) return true; if (o.date > t || o.start == null) return false; return now.getHours() * 60 + now.getMinutes() >= o.start + 120; };
export function deleteOuting(s, id) { const outings = { ...(s.outings || {}) }; delete outings[id]; return { ...s, outings, deleted: { ...(s.deleted || {}), [`outing:${id}`]: Date.now() } }; }
export const outingList = (s) => rec(s.outings).sort((a, b) => b.date.localeCompare(a.date) || (b.start ?? 0) - (a.start ?? 0));
export function lastSeen(s, id, now = new Date()) { const t = keyOf(now); const l = outingList(s).filter(o => !o.planned && o.date <= t && o.who.includes(id))[0]; return l ? l.date : ''; }
/** Days past the gap you said you want (0 if you set none or are on time). */
export function overdue(s, f, now = new Date()) {
  const every = cadence(f); if (!every) return 0; const ls = lastContact(s, f.id, now), since = ls ? Math.round((startOfDay(now) - fromKey(ls)) / 864e5) : Math.round((startOfDay(now) - startOfDay(new Date(f.createdAt || now))) / 864e5);
  return Math.max(0, since - every);
}
export function friendStats(s, f, now = new Date()) {
  const y = String(now.getFullYear()), t = keyOf(now), all = outingList(s).filter(o => !o.planned && o.date <= t && o.who.includes(f.id)), yr = all.filter(o => o.date.startsWith(y)), rated = all.filter(o => o.rating);
  return { total: all.length, thisYear: yr.length, last: lastSeen(s, f.id, now), lastContact: lastContact(s, f.id, now), touches: touchList(s).filter(x => x.who.includes(f.id)).length, avgRating: rated.length ? rated.reduce((t, o) => t + o.rating, 0) / rated.length : null, favPlace: (() => { const c = {}; all.forEach(o => { if (o.where) c[o.where] = (c[o.where] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ''; })() };
}
export const nextBirthday = (b, t) => { const [m, d] = String(b).split('-').slice(-2).map(Number); if (!m || !d) return null; const mk = (y) => (m === 2 && d === 29 && new Date(y, 1, 29).getMonth() !== 1) ? new Date(y, 1, 28) : new Date(y, m - 1, d); let n = mk(t.getFullYear()); if (n < t) n = mk(t.getFullYear() + 1); return n; };
/** Birthdays and other dates in the next `days`, soonest first: friends (birthday + their own dates) and colleagues' cards.
 *  → [{friend|null, key, name, label ('Birthday' or the date's own label), birthday (bool), date, inDays, age (years since, when the year is known)}] */
export function birthdays(s, now = new Date(), days = 45, { others = true } = {}) {
  const t = startOfDay(now), out = [];
  const add = (b, extra) => { if (!b) return; const n = nextBirthday(b, t); if (!n) return; const inDays = Math.round((n - t) / 864e5); if (inDays <= days) { const y = /^\d{4}-/.test(b) ? +b.slice(0, 4) : 0; out.push({ ...extra, date: n, inDays, age: y && n.getFullYear() > y ? n.getFullYear() - y : 0 }); } };
  for (const f of friendList(s)) {
    add(f.birthday, { friend: f, key: f.rotaKey || f.id, name: shortName(f), label: 'Birthday', birthday: true });
    if (others) (f.dates || []).forEach((d, i) => add(d.date, { friend: f, key: `${f.rotaKey || f.id}#${i}`, name: shortName(f), label: d.label, birthday: false }));
  }
  const fk = new Set(rec(s.friends).map(f => f.rotaKey).filter(Boolean));
  for (const c of rec(s.contacts)) if (!fk.has(c.key)) add(c.birthday, { friend: null, key: c.key, name: R.bare(R.person(c.key)?.name || c.name || String(c.key).replace(/^(id|name):/, '')), label: 'Birthday', birthday: true });
  return out.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
/** "Annie's birthday", "Annie: wedding anniversary". */
export const occasionName = (b) => b.birthday ? `${b.name}'s birthday` : `${b.name}: ${b.label}`;

// ───────────── birthdays from Google (Calendar's birthday events, made from Google Contacts)
const simple = (n) => R.bare(n).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9؀-ۿ ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Match Google's birthdays to your people. → [{item, target: {kind:'friend', id, name} | {kind:'contact', key, name} | null, current, status, fuzzy}]
 *  status: 'new' (nothing saved yet), 'same', 'differs' (you have another date saved), 'nomatch'. */
export function matchBirthdays(s, items) {
  const fr = friendList(s);
  return items.map(item => {
    const n = simple(item.name); let target = null, fuzzy = false;
    const f = fr.find(x => simple(x.name) === n || (x.nick && simple(x.nick) === n)) || fr.find(x => { const a = simple(x.name).split(' '), b = n.split(' '); return b.length > 1 && a[0] === b[0] && a[a.length - 1] === b[b.length - 1]; });
    if (f) target = { kind: 'friend', id: f.id, name: shortName(f) };
    else { const m = R.match(item.name); if (m.length === 1 || (m.length > 1 && m[0].score - m[1].score > 0.2)) { const fk = fr.find(x => x.rotaKey === m[0].key); target = fk ? { kind: 'friend', id: fk.id, name: shortName(fk) } : { kind: 'contact', key: m[0].key, name: R.bare(m[0].name) }; fuzzy = !!m[0].fuzzy; } }
    if (!target) return { item, target: null, current: '', status: 'nomatch', fuzzy: false };
    const rec = target.kind === 'friend' ? s.friends[target.id] : s.contacts?.[target.key] || {};
    const current = item.kind === 'birthday' ? (rec.birthday || '') : ((rec.dates || []).find(d => d.label.toLowerCase() === item.label.toLowerCase())?.date || '');
    const same = current && current.slice(-5) === item.date.slice(-5);
    return { item, target, current, status: !current ? 'new' : same ? 'same' : 'differs', fuzzy };
  });
}
/** Save the picked matches: birthdays on friends and colleagues' cards, other dates on friends. A saved year is kept when Google has none. */
export function applyBirthdays(s, picked) {
  let out = s;
  for (const m of picked) {
    if (!m.target) continue;
    const keepYear = (cur, nw) => nw.length === 5 && /^\d{4}-/.test(cur || '') && cur.slice(-5) === nw ? cur : nw;
    if (m.target.kind === 'friend') {
      const f = out.friends[m.target.id]; if (!f) continue;
      if (m.item.kind === 'birthday') out = updateFriend(out, f.id, { birthday: keepYear(f.birthday, m.item.date) });
      else { const dates = (f.dates || []).filter(d => d.label.toLowerCase() !== m.item.label.toLowerCase()); out = updateFriend(out, f.id, { dates: [...dates, { label: m.item.label, date: m.item.date }] }); }
    } else if (m.item.kind === 'birthday') { const c = out.contacts?.[m.target.key] || {}; out = setContact(out, m.target.key, { ...c, birthday: keepYear(c.birthday, m.item.date), name: m.target.name }); }
  }
  return out;
}

/** Your free time in the next days as text to paste into a group chat ("I'm free: Thu 19 from 20:45, Sat 21 all day…"). */
export function availabilityText(s, { days = 14, busyOf = () => [], now = new Date(), fmtDay = (d) => keyOf(d), minMin = 120 } = {}) {
  const start = startOfDay(now), lines = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i), st = meState(s, d, busyOf(d)), w = clipToNow(st.windows, d, now).filter(x => x[1] - x[0] >= minMin); if (!w.length) continue;
    const whole = !st.afterNight && st.status !== 'work' && w.some(x => x[1] - x[0] >= 8 * H);
    lines.push(`${fmtDay(d)}: ${whole ? 'all day' : w.map(x => x[1] >= LATE ? `from ${hhmm(x[0])}` : `${hhmm(x[0])}–${hhmm(x[1])}`).join(', ')}`);
  }
  return lines.length ? `I'm free:\n${lines.join('\n')}` : '';
}

// ───────────────────────────── ideas for the time you have
/** Suggestions fitted to the window (length, time of day, weekday), the group size and your wishlist. */
export function ideas({ window, size = 1, date = new Date(), wish = [], birthday = null }) {
  const len = window ? window[1] - window[0] : 180, startH = window ? window[0] / H : 18, dow = date.getDay(), weekend = dow === 5 || dow === 6, out = [];
  const add = (icon, title, why) => { if (!out.some(x => x.title === title)) out.push({ icon, title, why }); };
  if (birthday) add('🎂', `Surprise dinner for ${birthday}`, 'Their birthday is close; book a table and ask the others to chip in.');
  for (const w of wish.slice(0, 2)) add(w.icon || '📍', w.name, 'From your wishlist.');
  if (len >= 8 * H) { add('🏜️', 'Desert or dune day trip', 'A whole free day for everyone; leave early, be back by dark.'); add('🥾', 'Edge of the World / hiking morning', 'Sunrise start, long breakfast after.'); if (size >= 3) add('⚽', 'Padel or football match', 'Enough of you for two teams.'); }
  if (len >= 4 * H && startH < 15) { add('🍳', 'Late brunch, then somewhere to walk it off', 'Long window from the morning.'); add('☕', 'Specialty café crawl', 'Pick two, share dessert.'); }
  if (startH >= 17) { add('🍽️', 'Dinner out', 'Everyone is free after work; book for 20:00–20:30.'); add('☕', 'Late coffee and a walk', 'Short, easy after a shift.'); if (weekend) add('🎳', 'Bowling or arcade', 'Fri/Sat evening, good for groups.'); }
  if (len >= 3 * H) { if (size >= 3) add('🧩', 'Escape room', 'Best with 3–6 people and about 90 minutes.'); add('🎬', 'Movie night', 'Cinema, or a film at someone’s place.'); add('🎮', 'Game night', 'At someone’s place; ask who brings what.'); }
  if (len < 3 * H) { add('🥤', 'Quick coffee or shawarma', 'Short window: keep it close to whoever works furthest away.'); add('🚶', 'Evening walk', 'No booking needed.'); }
  if (size >= 4) add('🍖', 'Home BBQ or potluck', 'Cheaper than a restaurant and nobody leaves early.');
  return out.slice(0, 8);
}
/** HH:MM for a minute of the day. Exactly midnight at the end of a window is 24:00 (not 23:59); past midnight wraps (a 23:00–01:00 slot reads 23:00–01:00). */
export const hhmm = (m) => { m = Math.round(+m || 0); if (m === 1440) return '24:00'; m = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
/** The message you send to ask. `choices` are meetup results; with several, people reply with a number. */
export function inviteText({ names = [], choices = [], what = '', fmtDay = (d) => keyOf(d), fmtT = hhmm }) {
  const to = names.length ? names.join(', ') : 'everyone', line = (c) => `${fmtDay(c.date)} ${fmtT(c.window[0])}–${fmtT(c.window[1])}`;
  if (choices.length === 1) return `Hey ${to}! I’m free ${line(choices[0])}${what ? ` — ${what}?` : ' — are you up for something?'}`;
  return `Hey ${to}! ${what ? `${what}? ` : 'Shall we meet up? '}Which works for you?\n${choices.map((c, i) => `${i + 1}) ${line(c)}`).join('\n')}\nReply with a number 👍`;
}
/** Read .vcf contacts (FN + TEL + optional BDAY/NICKNAME). BDAY may be 19900105, 1990-01-05 or vCard 4's --0105. */
export function parseVCF(text) {
  const out = []; for (const card of String(text || '').split(/BEGIN:VCARD/i).slice(1)) {
    const g = (k) => { const m = new RegExp(`^${k}[^:\\r\\n]*:(.*)$`, 'im').exec(card); return m ? m[1].trim() : ''; };
    const name = g('FN') || g('N').split(';').filter(Boolean).reverse().join(' '); if (!name) continue; const bd = g('BDAY').split('T')[0].replace(/[^\d-]/g, ''); const tel = g('TEL');
    out.push({ name, phone: tel, nick: g('NICKNAME'), birthday: parseBirthday(bd) });
  } return out;
}

// ───────────── contact cards for people in the roster (doctors, specialists, nurses) who are not friends
/** Handles for a rota person. If they are also one of your friends, the friend record is the single source. */
export function contactOf(s, key) {
  const fr = rec(s.friends).find(f => f.rotaKey === key);
  if (fr) return { friend: fr, phone: fr.phone, whatsapp: fr.whatsapp, snap: fr.snap, insta: fr.insta, note: fr.notes, birthday: fr.birthday, nick: fr.nick };
  return { friend: null, ...(s.contacts?.[key] || {}) };
}
export const hasCard = (c) => !!(c && (c.phone || c.whatsapp || c.snap || c.insta || c.note || c.birthday));
export function setContact(s, key, patch) {
  const fr = rec(s.friends).find(f => f.rotaKey === key), p = { phone: asciiDigits(patch.phone || '').slice(0, 24), whatsapp: asciiDigits(patch.whatsapp || '').slice(0, 24), snap: cleanHandle(patch.snap), insta: cleanHandle(patch.insta), note: String(patch.note || '').slice(0, 300), birthday: parseBirthday(patch.birthday), nick: String(patch.nick || '').slice(0, 30) };
  if (fr) return updateFriend(s, fr.id, { birthday: p.birthday || fr.birthday, phone: p.phone, whatsapp: p.whatsapp, snap: p.snap, insta: p.insta, notes: p.note, nick: p.nick || fr.nick });
  const contacts = { ...(s.contacts || {}) }, name = R.person(key)?.name || patch.name || s.contacts?.[key]?.name || '';
  if (!hasCard(p) && !p.nick) delete contacts[key]; else contacts[key] = { key, ...p, ...(name ? { name: String(name).slice(0, 80) } : {}), at: Date.now() };
  return { ...s, contacts, deleted: { ...(s.deleted || {}), ...(!contacts[key] ? { [`contact:${key}`]: Date.now() } : {}) } };
}
/** Every handle we know for a rota person, as links. */
export function reachLinks(s, key, cc) { const c = contactOf(s, key); return links({ phone: c.phone || '', whatsapp: c.whatsapp || '', snap: c.snap, insta: c.insta }, cc); }
/** Make a rota person a friend (their shifts then feed the free-days grid). Everything saved on their card — birthday included — moves over. */
export function friendFromPerson(s, person, kind) {
  const key = person.key, old = s.contacts?.[key] || {};
  return addFriend(s, { name: R.bare(person.name) || person.name, nick: old.nick || '', kind: kind || (person.unit === 'nurse' ? 'nurse' : person.unit === 'gp' ? 'gp' : 'colleague'), rotaKey: key, phone: old.phone || '', whatsapp: old.whatsapp || '', snap: old.snap || '', insta: old.insta || '', notes: old.note || '', birthday: old.birthday || '', every: 30 });
}

/** Your own day in the same shape as a friend's (status work/off/leave, shift type, free windows), so the grid can show you working too. */
export function meState(s, date, busy = []) {
  const key = myKey(); if (!key) return { status: 'unknown', windows: myWindows(s, date, busy) };
  const st = dayState(s, { rotaKey: key }, date); return { ...st, windows: myWindows(s, date, busy) };
}

// ───────── find a day: any people from the app (friends, colleagues, nurses), not only friends
/** A friend-shaped record for anyone in the roster, reusing their friend entry when there is one (so hand-entered shifts count). */
export function personRecord(s, key, name) { const fr = friendList(s).find(f => f.rotaKey === key || f.id === key); return fr || { id: key, name: R.bare(name) || name || key.replace(/^(id|name):/, ''), rotaKey: key.startsWith('id:') || key.startsWith('name:') ? key : '' }; }
/** For each day ahead: the time everyone picked is free together (you included unless `withMe` is false).
 *  `all` = everyone free for at least `minMin`; otherwise who is missing. People with no schedule info are listed, never assumed free.
 *  Time already past (before `now` + travel) is dropped. Asking for a whole day (minMin ≥ 8h) never counts someone just off a night. */
export function commonFree(s, people, { from = null, days = 21, withMe = true, minMin = 120, busyOf = () => [], now = new Date() } = {}) {
  const out = [], start = startOfDay(from || now), whole = minMin >= 8 * H, meKey = myKey();
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i), states = people.map(p => ({ p, st: dayState(s, p, date) })), unknown = states.filter(x => x.st.free === 'unknown');
    const meNight = withMe && meKey ? dayState(s, { rotaKey: meKey }, date).afterNight : false;
    let win = clipToNow(withMe ? myWindows(s, date, busyOf(date)) : [[WAKE, LATE]], date, now); if (!win.length || (whole && meNight)) { out.push({ date, key: keyOf(date), all: false, me: false, window: null, windows: [], free: [], missing: states.filter(x => x.st.free !== 'unknown').map(x => x.p), unknown: unknown.map(x => x.p), weekend: [5, 6].includes(date.getDay()), dayLong: false }); continue; }
    const free = [], missing = [];
    for (const x of states) { if (x.st.free === 'unknown') continue; if (whole && x.st.afterNight) { missing.push(x.p); continue; } const nw = intersect(win, x.st.windows).filter(w => w[1] - w[0] >= minMin); if (nw.length) { win = nw; free.push(x.p); } else missing.push(x.p); }
    const w = win.filter(w => w[1] - w[0] >= minMin).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null;
    const dayLong = !!w && w[1] - w[0] >= 8 * H && !meNight && !free.some(p => states.find(x => x.p === p).st.afterNight);
    out.push({ date, key: keyOf(date), all: !!w && !missing.length && !unknown.length && free.length === people.length, me: true, window: w, windows: win, free, missing, unknown: unknown.map(x => x.p), weekend: [5, 6].includes(date.getDay()), dayLong });
  }
  return out;
}
/** The faces row on Today, as you set it up: who shows (free today, favourites, or only the people you pin), in which order,
 *  how many. People set to "Always" show even when busy (window null); "Never", and anyone hidden for today, never do.
 *  → [{f, window|null, frac (share of your day you are both free), overdue}] */
export function todayFaces(s, date, { busy = [], now = new Date(), cfg = {} } = {}) {
  const k = keyOf(date), hiddenToday = cfg.hidden?.date === k ? new Set(cfg.hidden.ids) : new Set();
  const mine = clipToNow(myWindows(s, date, busy), date, now), span = Math.max(1, LATE - WAKE);
  let list = friendList(s).filter(f => f.onToday !== 'never' && !hiddenToday.has(f.id)).map(f => {
    const w = mine.length ? intersect(mine, dayState(s, f, date).windows).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] || null : null;
    return { f, window: w, frac: w ? (w[1] - w[0]) / span : 0, overdue: overdue(s, f, now), pinned: f.onToday === 'always' };
  });
  const show = cfg.show || 'free';
  list = list.filter(x => x.pinned || (show === 'free' ? !!x.window : show === 'favs' ? x.f.fav : false));
  const order = cfg.order || [], pos = (x) => { const i = order.indexOf(x.f.id); return i < 0 ? 1e6 : i; };
  const by = { free: (a, b) => (a.window ? a.window[0] : 1e5) - (b.window ? b.window[0] : 1e5), longest: (a, b) => b.frac - a.frac, overdue: (a, b) => b.overdue - a.overdue, name: (a, b) => shortName(a.f).localeCompare(shortName(b.f)), manual: (a, b) => pos(a) - pos(b) }[cfg.sort || 'free'] || (() => 0);
  return list.sort((a, b) => (cfg.sort === 'manual' ? 0 : (!!b.window - !!a.window)) || by(a, b) || shortName(a.f).localeCompare(shortName(b.f))).slice(0, cfg.max || 12);
}
/** Friends you could see on a day (free with you for at least the shortest meet-up), most overdue first. */
export function freeWith(s, date, { busy = [], now = new Date() } = {}) {
  const mine = clipToNow(myWindows(s, date, busy), date, now); if (!mine.length) return [];
  return friendList(s).map(f => { const w = intersect(mine, dayState(s, f, date).windows).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0]; return w ? { f, window: w, overdue: overdue(s, f, now) } : null; })
    .filter(Boolean).sort((a, b) => b.overdue - a.overdue || (b.f.fav ? 1 : 0) - (a.f.fav ? 1 : 0) || a.window[0] - b.window[0]);
}
