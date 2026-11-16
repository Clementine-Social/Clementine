// Life around your people — ideas taken from the best people apps and made to fit Clementine. Pure functions (no DOM).
//  · circles of closeness (Fabriq, after Dunbar) with a keep-in-touch gap per circle
//  · life events (Monica, Clay): new job, moved, baby… with a nudge to ask how it went
//  · things to ask about next time (Monica's reminders, Fabriq's conversation starters)
//  · family links and "how are we related?" (Monica's relationships, MyHeritage's relationship diagram)
//  · places you go together and how you rate them (Swarm's lifelog, Beli's lists)
//  · memories from this week in other years (Howbout memories, Day One's "on this day")
//  · streaks and stickers (Swarm), RSVPs and food notes (Partiful)
import { keyOf, fromKey, addDays, startOfDay } from './util.js';
import * as F from './social.js';

const rec = (m) => Object.values(m || {});
const rid = (p) => p + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const isDay = (v) => /^\d{4}-\d\d-\d\d$/.test(v || '');
const drop = (s, coll, pre, id) => { const m = { ...(s[coll] || {}) }; delete m[id]; return { ...s, [coll]: m, deleted: { ...(s.deleted || {}), [`${pre}:${id}`]: Date.now() } }; };
const dayDiff = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);

// ════════════════════════════════════════ circles
export { CIRCLES, cadence } from './social.js';
/** Your people by circle, each with how many are in touch within their gap. → [{id, label, icon, days, hint, people:[{f, since, late}], ok}] + 'none' last. */
export function circles(s, now = new Date()) {
  const out = [...F.CIRCLES, ['', 'Not placed yet', '⚪', 0, 'Tap someone to give them a circle']].map(([id, label, icon, days, hint]) => ({ id, label, icon, days, hint, people: [] }));
  for (const f of F.friendList(s)) {
    const c = out.find(x => x.id === (f.circle || '')) || out[out.length - 1], last = F.lastContact(s, f.id, now);
    c.people.push({ f, since: last ? dayDiff(now, fromKey(last)) : null, late: F.overdue(s, f, now) });
  }
  for (const c of out) { c.people.sort((a, b) => b.late - a.late || a.f.name.localeCompare(b.f.name)); c.ok = c.people.filter(p => !p.late).length; }
  return out;
}

// ════════════════════════════════════════ life events
export const LIFE_KINDS = [['job', '💼', 'New job'], ['move', '🏡', 'Moved home'], ['engaged', '💍', 'Engaged'], ['married', '💒', 'Married'], ['baby', '🍼', 'New baby'], ['grad', '🎓', 'Graduated'], ['exam', '📚', 'Exam or interview'], ['travel', '✈️', 'Big trip'], ['health', '🩹', 'Unwell or an operation'], ['loss', '🕊️', 'Lost someone'], ['win', '🏆', 'Big win'], ['other', '✨', 'Something else']];
const LIFE_IDS = LIFE_KINDS.map(k => k[0]);
const YEARLY = ['married', 'engaged', 'baby', 'job', 'move'];   // worth remembering each year
const ASK_AFTER = { exam: 'How did the exam go?', health: 'How are they feeling?', travel: 'How was the trip?', job: 'How is the new job?', move: 'How is the new place?', baby: 'How are they and the baby?', loss: 'Check in on them', grad: 'What is next after graduating?' };
export const lifeIcon = (k) => LIFE_KINDS.find(x => x[0] === k)?.[1] || '✨';
export const lifeLabel = (l) => l.note || LIFE_KINDS.find(x => x[0] === l.kind)?.[2] || 'Life event';
/** Add or change a life event. `follow` (default on for exams, trips, illness…) also adds "ask how it went" for the day after. */
export function addLife(s, l, { follow = null, now = new Date() } = {}) {
  if (!s.friends?.[l.who] && !l.gone) return s;
  const id = l.id || rid('l'), kind = LIFE_IDS.includes(l.kind) ? l.kind : 'other', date = isDay(l.date) ? l.date : keyOf(now);
  let out = { ...s, life: { ...(s.life || {}), [id]: { id, who: l.who, kind, date, note: String(l.note || '').trim().slice(0, 120), yearly: l.yearly ?? YEARLY.includes(kind), ...(l.gone ? { gone: String(l.gone).slice(0, 40) } : {}), at: Date.now() } } };
  const wantFollow = follow ?? (!l.id && !!ASK_AFTER[kind]);
  if (wantFollow && ASK_AFTER[kind]) { const due = date >= keyOf(now) ? keyOf(addDays(fromKey(date), 1)) : keyOf(now); out = addAsk(out, { who: l.who, text: l.note ? `${ASK_AFTER[kind].replace(/\?$/, '')}: ${l.note}` : ASK_AFTER[kind], due, from: id }); }
  return out;
}
export const deleteLife = (s, id) => drop(s, 'life', 'life', id);
export const lifeList = (s, who = null) => rec(s.life).filter(l => (who ? l.who === who : s.friends?.[l.who] || l.gone)).sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
/** Anniversaries of yearly life events in the next `days`: [{l, friend, date, inDays, years}]. */
export function lifeAnniversaries(s, now = new Date(), days = 30) {
  const t = startOfDay(now), out = [];
  for (const l of lifeList(s)) {
    if (!l.yearly || !s.friends?.[l.who]) continue; const n = F.nextBirthday(l.date, t); if (!n) continue; const years = n.getFullYear() - +l.date.slice(0, 4), inDays = dayDiff(n, t);
    if (years > 0 && inDays <= days) out.push({ l, friend: s.friends[l.who], date: n, inDays, years });
  }
  return out.sort((a, b) => a.inDays - b.inDays);
}

// ════════════════════════════════════════ things to ask about
export function addAsk(s, a) {
  const text = String(a.text || '').trim().slice(0, 140); if (!text || !s.friends?.[a.who]) return s; const id = a.id || rid('q');
  return { ...s, asks: { ...(s.asks || {}), [id]: { id, who: a.who, text, ...(isDay(a.due) ? { due: a.due } : {}), ...(isDay(a.done) ? { done: a.done } : {}), ...(a.from ? { from: String(a.from).slice(0, 30) } : {}), at: Date.now() } } };
}
export function doneAsk(s, id, done = true, now = new Date()) { const a = s.asks?.[id]; if (!a) return s; const { done: _d, ...rest } = a; return { ...s, asks: { ...s.asks, [id]: { ...rest, ...(done ? { done: keyOf(now) } : {}), at: Date.now() } } }; }
export const deleteAsk = (s, id) => drop(s, 'asks', 'ask', id);
export const askList = (s, who = null, { open = true } = {}) => rec(s.asks).filter(a => s.friends?.[a.who] && (!who || a.who === who) && (open ? !a.done : true)).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || (a.due || '9').localeCompare(b.due || '9') || a.at - b.at);
/** What to ask now: open asks that are due, or for people you are seeing in the next two days. → [{a, f, why: 'due'|'seeing', date}] */
export function asksNow(s, now = new Date()) {
  const t = keyOf(now), soon = keyOf(addDays(startOfDay(now), 2)), seeing = new Map();
  for (const o of F.outingList(s)) if (o.planned && o.date >= t && o.date <= soon) for (const w of o.who) if (!seeing.has(w) || o.date < seeing.get(w)) seeing.set(w, o.date);
  return askList(s).flatMap(a => seeing.has(a.who) ? [{ a, f: s.friends[a.who], why: 'seeing', date: seeing.get(a.who) }] : a.due && a.due <= t ? [{ a, f: s.friends[a.who], why: 'due', date: a.due }] : []);
}

// ════════════════════════════════════════ family links and how anyone is related
export const TIE_RELS = [['parent', 'is the parent of'], ['partner', 'is the partner of'], ['sibling', 'is the sibling of']];
/** The friend tree: who introduced whom (a introduced b), and who simply knows whom. */
export const FRIEND_RELS = [['introduced', 'introduced'], ['knows', 'knows']];
const ALL_RELS = [...TIE_RELS, ...FRIEND_RELS], FAMILY = TIE_RELS.map(r => r[0]);
export const relWords = (rel) => ALL_RELS.find(r => r[0] === rel)?.[1] || rel;
export const isFamily = (t) => FAMILY.includes(t.rel);
export const nodeName = (s, n) => n === 'me' ? 'You' : String(n).startsWith('p:') ? n.slice(2) : s.friends?.[n] ? F.shortName(s.friends[n]) : 'someone';
const goodNode = (s, n) => n === 'me' || (typeof n === 'string' && n.startsWith('p:') && n.length > 2 && n.length < 64) || !!s.friends?.[n];
/** Link two people. A parent link reads "a is b's parent". A link that already exists (either way round) is not added twice. */
export function addTie(s, t) {
  const rel = ALL_RELS.some(r => r[0] === t.rel) ? t.rel : ''; let { a, b } = t; if (typeof a === 'string' && a.startsWith('p:')) a = `p:${a.slice(2).trim().slice(0, 50)}`; if (typeof b === 'string' && b.startsWith('p:')) b = `p:${b.slice(2).trim().slice(0, 50)}`;
  if (!rel || a === b || !goodNode(s, a) || !goodNode(s, b)) return s;
  const same = rec(s.ties).find(x => x.id !== t.id && ((x.a === a && x.b === b) || (x.a === b && x.b === a && rel !== 'parent' && rel !== 'introduced')) && x.rel === rel); if (same) return s;
  const id = t.id || rid('k'); return { ...s, ties: { ...(s.ties || {}), [id]: { id, a, b, rel, at: Date.now() } } };
}
export const deleteTie = (s, id) => drop(s, 'ties', 'tie', id);
export const tieList = (s, n = null) => rec(s.ties).filter(t => goodNode(s, t.a) && goodNode(s, t.b) && (!n || t.a === n || t.b === n));
/** Every person in the family tree: 'me', friends and tree-only names. */
export const treeNodes = (s) => [...new Set(['me', ...tieList(s).filter(isFamily).flatMap(t => [t.a, t.b])])];
function edges(s) {
  const g = new Map(), add = (x, y, step) => { if (!g.has(x)) g.set(x, []); g.get(x).push([y, step]); };
  for (const t of tieList(s).filter(isFamily)) { if (t.rel === 'parent') { add(t.a, t.b, 'D'); add(t.b, t.a, 'U'); } else if (t.rel === 'partner') { add(t.a, t.b, 'P'); add(t.b, t.a, 'P'); } else { add(t.a, t.b, 'S'); add(t.b, t.a, 'S'); } }
  return g;
}
/** The shortest chain of links from one person to another: ['U','D','P','S'…] (up to a parent, down to a child, partner, sibling), or null. */
export function path(s, from, to) {
  if (from === to) return []; const g = edges(s), seen = new Map([[from, []]]), q = [from];
  while (q.length) { const x = q.shift(); for (const [y, st] of g.get(x) || []) if (!seen.has(y)) { const p = [...seen.get(x), st]; if (y === to) return p; seen.set(y, p); q.push(y); } }
  return null;
}
const ord = (n) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'][n - 1] || `${n}th`;
const greats = (n) => n <= 0 ? '' : n === 1 ? 'great-' : `${n}× great-`;
/** A blood relation from ups and downs: (1,0) parent, (2,1) aunt or uncle, (3,3) second cousin… */
function blood(u, d) {
  if (!u && !d) return 'you';
  if (!d) return u === 1 ? 'parent' : `${greats(u - 2)}grandparent`;
  if (!u) return d === 1 ? 'child' : `${greats(d - 2)}grandchild`;
  if (u === 1 && d === 1) return 'sibling';
  if (d === 1) return u === 2 ? 'aunt or uncle' : `${greats(u - 3)}great-aunt or uncle`;
  if (u === 1) return d === 2 ? 'niece or nephew' : `${greats(d - 3)}grand-niece or nephew`;
  const c = Math.min(u, d) - 1, r = Math.abs(u - d); return `${ord(c)} cousin${r ? ` ${r === 1 ? 'once' : r === 2 ? 'twice' : `${r} times`} removed` : ''}`;
}
/** Ups-then-downs for a run of blood steps, or null if it goes down then up again (a child's other parent…). */
function updown(steps) { let u = 0, d = 0; for (const st of steps) { if (st === 'U') { if (d) return null; u++; } else if (st === 'D') d++; else if (st === 'S') { if (d) return null; u++; d++; } } return [u, d]; }
/** How `to` is related to `from`, in words: "your aunt or uncle", "your partner's sibling (sibling-in-law)". Null when no chain links them. */
export function relation(s, from, to) {
  const p = path(s, from, to); if (!p) return null; if (!p.length) return { label: 'you', short: 'you', steps: 0 };
  const segs = [[]]; for (const st of p) { if (st === 'P') segs.push(['P'], []); else segs[segs.length - 1].push(st); }
  const parts = segs.filter(x => x.length).map(x => x[0] === 'P' ? 'partner' : (() => { const ud = updown(x); return ud ? blood(...ud) : null; })());
  if (parts.includes(null)) { const chain = p.map(st => ({ U: 'parent', D: 'child', P: 'partner', S: 'sibling' })[st]); return { label: `your ${chain.join('’s ')}`, short: chain[chain.length - 1], steps: p.length }; }
  const named = { 'partner,parent': 'parent-in-law', 'partner,sibling': 'sibling-in-law', 'sibling,partner': 'sibling-in-law', 'child,partner': 'child-in-law', 'partner,child': 'stepchild', 'parent,partner': 'step-parent', 'partner,grandparent': 'grandparent-in-law', 'grandchild,partner': 'grandchild-in-law', 'partner,aunt or uncle': 'aunt or uncle by marriage', 'aunt or uncle,partner': 'aunt or uncle by marriage', 'niece or nephew,partner': 'niece or nephew by marriage', 'partner,niece or nephew': 'niece or nephew by marriage', 'partner,first cousin': 'cousin by marriage', 'first cousin,partner': 'cousin by marriage' }[parts.join(',')];
  return { label: named ? `your ${named}` : `your ${parts.join('’s ')}`, short: named || parts[parts.length - 1], steps: p.length };
}
/** Generations relative to `root` (−1 parents, +1 children; partners and siblings share a row), for laying the tree out. */
export function generations(s, root = 'me') {
  const g = edges(s), gen = new Map([[root, 0]]), q = [root];
  while (q.length) { const x = q.shift(); for (const [y, st] of g.get(x) || []) if (!gen.has(y)) { gen.set(y, gen.get(x) + (st === 'U' ? -1 : st === 'D' ? 1 : 0)); q.push(y); } }
  return gen;
}

/** The friend tree, rooted at you: everyone you met yourself hangs off you, everyone someone introduced hangs off them.
 *  → {id:'me', kids:[{id, kids:[…]}]}. A loop of introductions is broken (each person appears once). `knows`: id -> [ids]. */
export function friendTree(s) {
  const by = new Map(); for (const t of tieList(s).filter(t => t.rel === 'introduced')) if (t.b !== 'me' && !by.has(t.b)) by.set(t.b, t.a);
  const people = F.friendList(s).map(f => f.id), placed = new Set(['me']);
  const grow = (id, depth) => { const kids = [...by].filter(([, a]) => a === id).map(([b]) => b).filter(b => !placed.has(b)); kids.forEach(k => placed.add(k)); return { id, kids: depth > 12 ? [] : kids.map(k => grow(k, depth + 1)) }; };
  // roots: you, then anyone introduced by someone who is not connected back to you (their own little tree)
  const root = grow('me', 0); for (const id of people) if (!placed.has(id) && !by.has(id)) { placed.add(id); root.kids.push(grow(id, 1)); }
  for (const id of [...by.keys()]) if (!placed.has(id)) { placed.add(id); root.kids.push(grow(id, 1)); }
  const knows = new Map(); for (const t of tieList(s).filter(t => t.rel === 'knows')) { for (const [x, y] of [[t.a, t.b], [t.b, t.a]]) { if (!knows.has(x)) knows.set(x, []); knows.get(x).push(y); } }
  return { root, knows, introducedBy: by };
}

// ════════════════════════════════════════ places
const placeKey = (w) => String(w || '').trim().toLowerCase().replace(/\s+/g, ' ');
/** Every place you have met people, from the outing log: [{key, name, visits, first, last, rating (average of rated), people:[[id, n]], whats:[...], outings:[...]}], most visited first. */
export function places(s, now = new Date()) {
  const t = keyOf(now), m = new Map();
  for (const o of F.outingList(s)) {
    if (o.planned || o.date > t || !o.where?.trim()) continue; const k = placeKey(o.where);
    if (!m.has(k)) m.set(k, { key: k, name: o.where.trim(), visits: 0, first: o.date, last: o.date, ratings: [], who: {}, what: {}, names: {}, outings: [] });
    const p = m.get(k); p.visits++; p.first = o.date < p.first ? o.date : p.first; p.last = o.date > p.last ? o.date : p.last; if (o.rating) p.ratings.push(o.rating); p.outings.push(o); const nm = o.where.trim(); p.names[nm] = (p.names[nm] || 0) + 1;
    for (const w of o.who) p.who[w] = (p.who[w] || 0) + 1; if (o.what) p.what[o.what] = (p.what[o.what] || 0) + 1;
  }
  return [...m.values()].map(p => ({ key: p.key, name: Object.entries(p.names).sort((a, b) => b[1] - a[1] || (/[A-Z]/.test(b[0]) ? 1 : 0) - (/[A-Z]/.test(a[0]) ? 1 : 0))[0][0], visits: p.visits, first: p.first, last: p.last, outings: p.outings, rating: p.ratings.length ? Math.round(p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length * 10) / 10 : 0,
    people: Object.entries(p.who).filter(([id]) => s.friends?.[id]).sort((a, b) => b[1] - a[1]), whats: Object.entries(p.what).sort((a, b) => b[1] - a[1]).map(x => x[0]) }))
    .sort((a, b) => b.visits - a.visits || b.rating - a.rating || b.last.localeCompare(a.last));
}
/** Your favourites, Beli-style: rated places ranked by average rating, then visits. */
export const topPlaces = (s, now = new Date(), n = 5) => places(s, now).filter(p => p.rating).sort((a, b) => b.rating - a.rating || b.visits - a.visits).slice(0, n);
/** Places you keep going back to, good for "somewhere we know". */
export const regulars = (s, now = new Date(), n = 5) => places(s, now).filter(p => p.visits >= 2).slice(0, n);

// ════════════════════════════════════════ memories
/** Outings and life events from this week (±3 days) in earlier years, closest to today first: [{years, date, kind: 'outing'|'life', rec}]. */
export function memories(s, now = new Date(), span = 3) {
  const t = startOfDay(now), y = t.getFullYear(), out = [];
  const near = (date) => { if (!isDay(date)) return null; const yy = +date.slice(0, 4); if (yy >= y) return null; const same = new Date(y, +date.slice(5, 7) - 1, +date.slice(8, 10)), d = Math.abs(dayDiff(same, t)); return d <= span ? { years: y - yy, off: d } : null; };
  for (const o of F.outingList(s)) { if (o.planned) continue; const n = near(o.date); if (n) out.push({ ...n, date: o.date, kind: 'outing', rec: o }); }
  for (const l of lifeList(s)) { const n = near(l.date); if (n) out.push({ ...n, date: l.date, kind: 'life', rec: l }); }
  return out.sort((a, b) => a.off - b.off || a.years - b.years);
}

// ════════════════════════════════════════ streaks and stickers
const weekStart = (d) => { const x = startOfDay(d); return addDays(x, -((x.getDay() + 1) % 7)); };   // weeks start on Saturday
/** Weeks in a row (this one or last one back) with at least one meet-up or call. */
export function weekStreak(s, now = new Date()) {
  const t = keyOf(now), weeks = new Set();
  for (const o of F.outingList(s)) if (!o.planned && o.date <= t) weeks.add(keyOf(weekStart(fromKey(o.date))));
  for (const x of F.touchList(s)) if (x.date <= t) weeks.add(keyOf(weekStart(fromKey(x.date))));
  let w = weekStart(now), n = 0; if (!weeks.has(keyOf(w))) w = addDays(w, -7);
  while (weeks.has(keyOf(w))) { n++; w = addDays(w, -7); }
  return n;
}
/** Stickers to collect: [{id, icon, name, how, got, have, need}]. All worked out from what you logged; nothing is stored. */
export function stickers(s, now = new Date()) {
  const t = keyOf(now), done = F.outingList(s).filter(o => !o.planned && o.date <= t), touches = F.touchList(s), pl = places(s, now), streak = weekStreak(s, now), best = bestStreak(s, now);
  const bdayHit = (() => { for (const f of F.friendList(s)) { if (!f.birthday) continue; const md = f.birthday.slice(-5); if (done.some(o => o.who.includes(f.id) && o.date.slice(5) === md) || touches.some(x => x.who.includes(f.id) && x.date.slice(5) === md)) return 1; } return 0; })();
  const inner = F.friendList(s).filter(f => f.circle === 'inner'), innerOk = inner.length && inner.every(f => { const l = F.lastContact(s, f.id, now); return l && dayDiff(now, fromKey(l)) <= 7; });
  const bills = done.filter(o => o.cost), square = bills.length && !Object.values(F.balances(s)).some(v => Math.abs(v) > 0.009);
  const list = [
    ['first', '🌱', 'First outing', 'Log your first meet-up', done.length, 1],
    ['regular', '🔁', 'Regular', 'Ten meet-ups logged', done.length, 10],
    ['butterfly', '🦋', 'Social butterfly', 'Fifty meet-ups logged', done.length, 50],
    ['explorer', '🧭', 'Explorer', 'Meet up in ten different places', pl.length, 10],
    ['local', '🏠', 'Local legend', 'Go back to the same place five times', Math.max(0, ...pl.map(p => p.visits)), 5],
    ['squad', '👯', 'Squad goals', 'One outing with four or more friends', Math.max(0, ...done.map(o => o.who.length)), 4],
    ['roll', '🔥', 'On a roll', 'Four weeks in a row in touch with someone', Math.max(streak, best), 4],
    ['unstoppable', '☄️', 'Unstoppable', 'Twelve weeks in a row', Math.max(streak, best), 12],
    ['caller', '📞', 'Good on the phone', 'Twenty calls and messages logged', touches.length, 20],
    ['bday', '🎂', 'Never forgets', 'See or call someone on their birthday', bdayHit, 1],
    ['inner', '💛', 'Close to home', 'Everyone in your inner circle in touch this week', innerOk ? 1 : 0, 1],
    ['host', '🧺', 'Host with the most', 'Every item on a bring list sorted', done.some(o => o.bring?.length >= 3 && o.bring.every(b => b.done)) ? 1 : 0, 1],
    ['square', '🤝', 'All square', 'Split a bill and settle every share', square ? 1 : 0, 1],
    ['roots', '🌳', 'Roots', 'Five family links in your tree', tieList(s).length, 5],
    ['listener', '👂', 'Good listener', 'Follow up on five things you meant to ask', rec(s.asks).filter(a => a.done).length, 5],
    ['memory', '📸', 'Memory keeper', 'Log ten life events for your people', lifeList(s).length, 10],
  ];
  return list.map(([id, icon, name, how, have, need]) => ({ id, icon, name, how, have: Math.min(have, need), need, got: have >= need }));
}
function bestStreak(s, now) {
  const t = keyOf(now), weeks = [...new Set([...F.outingList(s).filter(o => !o.planned && o.date <= t).map(o => o.date), ...F.touchList(s).filter(x => x.date <= t).map(x => x.date)].map(d => +weekStart(fromKey(d))))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null; for (const w of weeks) { run = prev != null && Math.round((w - prev) / 864e5) === 7 ? run + 1 : 1; best = Math.max(best, run); prev = w; } return best;
}

// ════════════════════════════════════════ RSVPs
export const RSVP = [['yes', '✅', 'Going'], ['maybe', '🤔', 'Maybe'], ['no', '❌', 'Can’t']];
export function setRsvp(s, outingId, who, v) {
  const o = s.outings?.[outingId]; if (!o || !o.who.includes(who)) return s; const rsvp = { ...(o.rsvp || {}) }; if (RSVP.some(r => r[0] === v)) rsvp[who] = v; else delete rsvp[who];
  return { ...s, outings: { ...s.outings, [outingId]: { ...o, rsvp, at: Date.now() } } };
}
/** "2 going, 1 maybe, 1 not answered". */
export function rsvpLine(o) {
  if (!o.who?.length) return ''; const r = o.rsvp || {}, n = (v) => o.who.filter(w => r[w] === v).length, open = o.who.filter(w => !r[w]).length;
  return [n('yes') && `${n('yes')} going`, n('maybe') && `${n('maybe')} maybe`, n('no') && `${n('no')} can’t`, open && `${open} not answered`].filter(Boolean).join(', ');
}
/** Food notes of the people coming, for the host: [{f, food}]. */
export const foodNotes = (s, o) => (o?.who || []).map(id => s.friends?.[id]).filter(f => f?.food).map(f => ({ f, food: f.food }));
