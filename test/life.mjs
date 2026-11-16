// Life around your people: circles, life events, things to ask, family links and "how are we related", places, memories,
// streaks, stickers and RSVPs. Made-up people only. Run: TZ=Asia/Riyadh node test/life.mjs
import * as F from '../docs/js/social.js';
import * as L from '../docs/js/life.js';
import { sanitize, mergeStates } from '../docs/js/store.js';
import { checker } from './helpers-node.mjs';

const { check, bad } = checker();
const NOW = new Date(2026, 10, 16, 9, 30);
const at = Date.parse('2026-11-10T10:00:00Z');
const fr = (id, name, extra = {}) => ({ id, name, nick: '', kind: 'other', every: 0, sched: {}, weeklyOff: [], hours: {}, createdAt: at - 9e9, at, ...extra });
let s = { friends: { fa: fr('fa', 'Ann Able', { circle: 'inner', birthday: '11-14' }), fb: fr('fb', 'Bo Bright', { circle: 'close', every: 10 }), fc: fr('fc', 'Cy Cole'), fd: fr('fd', 'Di Dune', { kind: 'family' }) },
  outings: {}, touches: {}, deleted: {} };

// ── circles: the circle sets the gap unless they have their own
check(F.cadence(s.friends.fa) === 7 && F.cadence(s.friends.fb) === 10 && F.cadence(s.friends.fc) === 0, 'circle gap, own gap wins, none = off');
check(F.overdue(s, s.friends.fa, NOW) > 0, 'inner circle with no contact is overdue');
s = F.updateFriend(s, 'fc', { circle: 'wider', met: 'Uni, 2015', food: 'No seafood' });
check(s.friends.fc.circle === 'wider' && s.friends.fc.met === 'Uni, 2015' && s.friends.fc.food === 'No seafood', 'circle, how we met and food notes are kept');
check(F.updateFriend(s, 'fc', { circle: 'bogus' }).friends.fc.circle === '', 'an unknown circle is dropped');
const cs = L.circles(s, NOW);
check(cs[0].id === 'inner' && cs[0].people[0].f.id === 'fa' && cs.at(-1).id === '' && cs.at(-1).people.some(p => p.f.id === 'fd'), 'circles list with an unplaced row');

// ── life events and the "ask how it went" they leave behind
s = L.addLife(s, { who: 'fb', kind: 'exam', date: '2026-11-18', note: 'Board exam' }, { now: NOW });
const ask = Object.values(s.asks)[0];
check(Object.keys(s.life).length === 1 && ask && ask.who === 'fb' && ask.due === '2026-11-19' && /Board exam/.test(ask.text), 'an exam adds an ask for the day after');
check(L.asksNow(s, NOW).length === 0 && L.asksNow(s, new Date(2026, 10, 19, 9)).length === 1, 'the ask comes up when due');
s = L.addAsk(s, { who: 'fa', text: 'Her new flat' });
s = F.logOuting(s, { who: ['fa'], date: '2026-11-17', what: 'Coffee', planned: true }, NOW);
check(L.asksNow(s, NOW).some(x => x.f.id === 'fa' && x.why === 'seeing'), 'an ask comes up before you see them');
const qa = Object.values(s.asks).find(a => a.who === 'fa');
s = L.doneAsk(s, qa.id, true, NOW);
check(L.askList(s, 'fa').length === 0 && L.askList(s, 'fa', { open: false }).length === 1, 'done asks leave the open list');
s = L.addLife(s, { who: 'fd', kind: 'married', date: '2019-11-20' }, { now: NOW });
const ann = L.lifeAnniversaries(s, NOW, 30);
check(ann.length === 1 && ann[0].years === 7 && ann[0].inDays === 4, 'a wedding comes round each year');
check(L.addLife(s, { who: 'nobody', kind: 'job' }) === s, 'no life event for someone unknown');

// ── family links and how anyone is related
const T = (a, b, rel) => { s = L.addTie(s, { a, b, rel }); };
T('p:Mum', 'me', 'parent'); T('p:Mum', 'p:Aunt May', 'sibling'); T('p:Aunt May', 'fd', 'parent'); T('fd', 'p:Kid', 'parent'); T('me', 'fa', 'partner'); T('p:Ann mum', 'fa', 'parent'); T('p:Mum', 'p:Sis', 'parent');
const rel = (to) => L.relation(s, 'me', to)?.label;
check(rel('p:Mum') === 'your parent', 'parent');
check(rel('p:Aunt May') === 'your aunt or uncle', 'aunt via a sibling of a parent');
check(rel('fd') === 'your first cousin', 'cousin');
check(rel('p:Kid') === 'your first cousin once removed', 'cousin once removed');
check(rel('p:Sis') === 'your sibling', 'sibling through a shared parent');
check(rel('fa') === 'your partner' && rel('p:Ann mum') === 'your parent-in-law', 'partner and parent-in-law');
check(L.relation(s, 'fd', 'me')?.label === 'your first cousin', 'the other way round too');
const n0 = Object.keys(s.ties).length; T('me', 'fa', 'partner'); T('fa', 'me', 'partner');
check(Object.keys(s.ties).length === n0, 'the same link is not added twice');
check(L.relation(s, 'me', 'fc') === null, 'no chain, no relation');
const gen = L.generations(s);
check(gen.get('p:Mum') === -1 && gen.get('fd') === 0 && gen.get('p:Kid') === 1 && gen.get('fa') === 0, 'generations for the tree');
const gone = F.deleteFriend(s, 'fd');
check(Object.values(gone.ties).some(t => t.b === 'p:Di Dune') && Object.values(gone.ties).some(t => t.a === 'p:Di Dune'), 'removing a friend keeps them in the tree by name');

// ── the friend tree: introductions hang people under who introduced them; family links stay out of it
s = L.addTie(s, { a: 'fa', b: 'fb', rel: 'introduced' }); s = L.addTie(s, { a: 'fb', b: 'fc', rel: 'introduced' }); s = L.addTie(s, { a: 'fc', b: 'fa', rel: 'knows' });
const ftr = L.friendTree(s), fa = ftr.root.kids.find(k => k.id === 'fa');
check(fa && fa.kids[0].id === 'fb' && fa.kids[0].kids[0].id === 'fc' && !ftr.root.kids.some(k => k.id === 'fb'), 'introductions make branches');
check(ftr.knows.get('fa').includes('fc') && L.relation(s, 'me', 'fb') === null, 'knows links, and they never make a relative');
s = L.addTie(s, { a: 'fc', b: 'fa', rel: 'introduced' });
check(JSON.stringify(L.friendTree(s).root).split('"fa"').length === 2, 'a loop of introductions still shows everyone once');

// ── places, memories, streaks, stickers
s = F.logOuting(s, { who: ['fa', 'fb'], date: '2026-11-02', what: 'Dinner', where: 'Blue Door', rating: 5 }, NOW);
s = F.logOuting(s, { who: ['fa'], date: '2026-11-09', what: 'Coffee', where: ' blue door ', rating: 3 }, NOW);
s = F.logOuting(s, { who: ['fb'], date: '2025-11-15', what: 'Padel', where: 'Court 3' }, NOW);
s = F.logTouch(s, { who: ['fc'], kind: 'call', date: '2026-11-15' }, NOW);
const pl = L.places(s, NOW);
check(pl[0].name === 'Blue Door' && pl[0].visits === 2 && pl[0].rating === 4 && pl[0].people[0][0] === 'fa', 'places merge spelling and count who came');
check(L.topPlaces(s, NOW)[0].key === 'blue door', 'top places by rating');
const mem = L.memories(s, NOW);
check(mem.length === 1 && mem[0].years === 1 && mem[0].rec.what === 'Padel', 'a memory from this week last year');
check(L.weekStreak(s, NOW) === 3, 'three weeks in a row');
const st = L.stickers(s, NOW);
check(st.find(x => x.id === 'first').got && !st.find(x => x.id === 'regular').got && st.find(x => x.id === 'regular').have === 3, 'stickers and progress');
check(st.find(x => x.id === 'roots').got, 'roots sticker for five links');

// ── RSVPs and food notes
const plan = Object.values(s.outings).find(o => o.planned);
s = L.setRsvp(s, plan.id, 'fa', 'yes'); s = L.setRsvp(s, plan.id, 'fz', 'yes');
check(s.outings[plan.id].rsvp.fa === 'yes' && !s.outings[plan.id].rsvp.fz && L.rsvpLine(s.outings[plan.id]) === '1 going', 'RSVP only for people invited');
check(F.logOuting(s, { ...s.outings[plan.id] }, NOW).outings[plan.id].rsvp.fa === 'yes', 'RSVPs survive a save');
check(L.foodNotes(s, { who: ['fa', 'fc'] }).length === 1, 'food notes of who is coming');

// ── the store knows the new collections: repaired on load, merged per record
const rep = { fixed: 0, notes: [] }, clean = sanitize({ life: { x: 5, y: { who: 'fa' } }, asks: { a: { who: 'fa', text: 3 } }, ties: { t: { a: 'me' } } }, rep);
check(!clean.life.x && clean.life.y.date === '' && clean.asks.a.text === '3' && clean.ties.t.b === '', 'new collections are sanitised');
const A = { ...s, life: { ...s.life, la: { id: 'la', who: 'fa', kind: 'job', date: '2026-11-01', at: 5 } }, updatedAt: 5 }, B = { ...s, ties: { ...s.ties, kb: { id: 'kb', a: 'me', b: 'fc', rel: 'sibling', at: 6 } }, updatedAt: 6 };
const M = mergeStates(A, B);
check(M.life.la && M.ties.kb, 'life events and ties merge per record');

if (bad()) { console.log(`${bad()} check(s) FAILED`); process.exit(1); }
console.log('all good');
