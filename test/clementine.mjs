// Clementine's logic without a browser: the roster from Mandarin's shifts.json, free time around shifts and nights, meet-ups,
// contact cards, birthdays, polls, the hub files, the Citrus migration and the merge of two devices. Made-up people only.
// Run: node test/clementine.mjs
import * as R from '../docs/js/roster.js';
import * as F from '../docs/js/social.js';
import * as X from '../docs/js/extras.js';
import * as HUB from '../docs/js/hub.js';
import * as MIG from '../docs/js/migrate.js';
import * as CZ from '../docs/js/custom.js';
import { mergeStates, sanitize } from '../docs/js/store.js';
import { checkBackup } from '../docs/js/backup-check.js';
import { checker } from './helpers-node.mjs';

const { check, bad } = checker();
const NOW = new Date(2026, 10, 16, 9, 30);   // Mon 16/11/2026 09:30 (tests run with TZ=Asia/Riyadh)
const d = (n) => `2026-11-${String(n).padStart(2, '0')}`;

// ── a made-up shifts.json, shaped like Mandarin's
const myDays = [];
for (let n = 9; n <= 30; n++) {
  const k = d(n), dow = new Date(2026, 10, n).getDay();
  if (n === 17) myDays.push({ date: k, kind: 'work', code: 'N1', type: 'N', site: 'Upper Village', start: '20:00', end: '08:00', overnight: true });
  else if (n === 18) myDays.push({ date: k, kind: 'off', code: '' });
  else if (dow === 5 || dow === 6) myDays.push({ date: k, kind: 'off', code: '' });
  else if (n === 25) myDays.push({ date: k, kind: 'leave', code: 'AL', label: 'Annual leave' });
  else myDays.push({ date: k, kind: 'work', code: 'D1', type: 'D', site: 'Upper Village', start: '08:00', end: '20:00' });
}
const ann = {}, bo = {}, nina = {};
for (let n = 9; n <= 30; n++) { ann[d(n)] = [16, 20, 21].includes(n) ? undefined : 'D2'; if (n % 3 === 0) bo[d(n)] = 'N'; nina[d(n)] = n === 19 ? 'PULL OUT' : n % 2 ? 'D' : 'N'; }
for (const k of Object.keys(ann)) if (!ann[k]) delete ann[k];
const shifts = {
  app: 'mandarin', contract: 2, updatedAt: '2026-11-16T05:00:00Z', me: { name: 'Dr Test Me', key: 'id:1' }, days: myDays,
  roster: { 'id:1': { name: 'Dr Test Me', unit: 'gp', days: {} }, 'id:2': { name: 'Dr Ann Able', unit: 'gp', days: ann }, 'id:3': { name: 'Dr Bo Bright', unit: 'fsed', days: bo }, 'name:nina nurse': { name: 'Nina Nurse', unit: 'nurse', days: nina }, 'id:9': { name: 'Mohammad Merri', unit: 'gp', days: { [d(16)]: 'D1' } } },
  legend: { D1: { label: 'Day · Upper Village', site: 'Upper Village', type: 'D', start: '08:00', end: '20:00' }, D2: { label: 'Day · Lower Village', site: 'Lower Village', type: 'D', start: '08:00', end: '20:00' }, N1: { label: 'Night · Upper Village', site: 'Upper Village', type: 'N', start: '20:00', end: '08:00' } },
};

console.log('roster');
check(R.set(shifts, { keep: false }), 'a Mandarin shifts.json is accepted');
check(!R.clean({ app: 'citrus', days: [] }), "another app's file is refused");
check(R.meKey() === 'id:1' && R.people().length === 4 && !R.people().some(p => p.key === 'id:1'), 'everyone but me is listed');
check(R.shiftOf('id:2', d(17)).kind === 'work' && R.shiftOf('id:2', d(17)).start === 480, 'Ann works D2 08:00 on 17/11 (from the GP legend)');
check(R.shiftOf('id:2', d(16))?.kind === 'off', 'an empty cell in a month the row has codes is off');
check(R.shiftOf('id:2', '2026-12-20') === null, 'a day outside the roster is unknown, never off');
check(R.shiftOf('name:nina nurse', d(18)).end === 1920, 'a nurse night runs 20:00 → 08:00 the next day');
check(R.shiftOf('name:nina nurse', d(19)).kind === 'other', 'PULL OUT is "other", not work');
check(R.shiftOf('id:1', d(17)).kind === 'work' && R.shiftOf('id:1', d(17)).end === 1920, 'my own night comes from my days (corrections included)');
check(R.match('Mohammed Mari')[0]?.key === 'id:9' && R.match('Mohammed Mari')[0].fuzzy, 'spelling variants still find the row (fuzzy)');
check(R.kindOf('VL') === 'leave' && R.kindOf('other') === 'other' && R.kindOf('') === 'off', 'code kinds');

console.log('free time');
let s = { friends: {}, contacts: {}, outings: {}, polls: {}, wishlist: {}, treats: {}, groups: {}, deleted: {}, settings: {} };
s = F.addFriend(s, { id: 'fa', name: 'Ann Able', nick: 'Annie', kind: 'gp', rotaKey: 'id:2', phone: '0555000111', birthday: '18/11', every: 14, createdAt: +new Date(2026, 9, 1) });
s = F.addFriend(s, { id: 'fn', name: 'Nina Nurse', kind: 'nurse', rotaKey: 'name:nina nurse', sched: { [d(19)]: 'off' }, every: 30 });
s = F.addFriend(s, { id: 'fz', name: 'Zed Zane', kind: 'family', weeklyOff: [5, 6], birthday: '1990-11-16' });
F.setTiming(CZ.custom(s).social);
const mon = new Date(2026, 10, 16), tue = new Date(2026, 10, 17), wed = new Date(2026, 10, 18), fri = new Date(2026, 10, 20);
check(F.dayState(s, s.friends.fa, mon).free === 'all', 'Ann off on Monday → free all day');
check(JSON.stringify(F.freeWindows(s, s.friends.fa, tue)) === JSON.stringify([[1245, 1440]]), 'Ann on a day shift → free after 20:00 + travel');
check(F.meState(s, wed).afterNight && F.meState(s, wed).windows[0][0] >= 16 * 60, 'after my night I sleep first: nothing before 16:00 on Wednesday');
check(F.meState(s, wed).free !== 'all', 'the day after a night is never "a day off"');
check(F.dayState(s, s.friends.fn, new Date(2026, 10, 19)).status === 'off', 'pulled out: your hand-entered day is used instead');
check(F.dayState(s, s.friends.fz, fri).free === 'all' && F.dayState(s, s.friends.fz, mon).free === 'unknown', 'weekly days off work without a rota; other days are unknown');
const m = F.meetups(s, { days: 7, now: NOW });
check(m.length && m.every(x => x.date >= new Date(2026, 10, 16)), 'meet-ups from today on');
check(!m.some(x => x.key === d(16) && x.window[0] < 10 * 60 + 15), 'nothing offered before now + travel');
check(m.some(x => x.key === d(20) && x.who.includes('fz')), 'Friday: Zed is free with me (both off)');
const cf = F.commonFree(s, [s.friends.fa], { days: 7, now: NOW, minMin: 8 * 60 });
check(!cf.find(r => r.key === d(18)).all, 'a whole day is never offered the day after my night');
check(F.freeWith(s, new Date(2026, 10, 20), { now: NOW }).some(x => x.f.id === 'fz'), 'free with you on a day');

console.log('contact cards and birthdays');
s = F.setContact(s, 'id:3', { phone: '+971 50 123 4567', snap: 'https://snapchat.com/add/bo.b', insta: '@bo_b', note: 'FSED', birthday: '20/11' });
check(s.contacts['id:3'].snap === 'bo.b' && s.contacts['id:3'].insta === 'bo_b', 'handles are cleaned from links and @names');
check(F.reachLinks(s, 'id:3').tel === 'tel:+971501234567', 'a + number keeps its own country code');
check(F.normPhone('٠٥٥٥١٢٣٤٥٦') === '966555123456', 'Arabic digits dial');
s = F.setContact(s, 'id:2', { phone: '0500000000', note: 'x' });
check(!s.contacts['id:2'] && s.friends.fa.phone === '0500000000', "a friend's card is their friend record (one source)");
s = F.friendFromPerson(s, R.person('id:3'));
const fb = F.friendList(s).find(f => f.rotaKey === 'id:3');
check(fb && fb.snap === 'bo.b' && fb.birthday === '11-20' && !s.contacts['id:3'] && s.deleted['contact:id:3'], 'making a colleague a friend moves the card over');
s = F.deleteFriend(s, fb.id);
check(s.contacts['id:3']?.phone && !s.friends[fb.id], 'removing a colleague friend keeps their numbers as a card');
const bd = F.birthdays(s, NOW, 14);
check(bd[0].name === 'Zed' && bd[0].inDays === 0 && bd[0].age === 36, 'birthday today first, with the age when the year is known');
check(bd.some(b => b.name === 'Annie' && b.inDays === 2) && bd.some(b => b.key === 'id:3' && b.name === 'Bo Bright'), "friends' and colleagues' birthdays");
check(F.parseBirthday('31/02') === '' && F.parseBirthday('--0314') === '03-14' && F.fmtBirthday('1990-03-14') === '14/03/1990', 'birthday parsing');

console.log('outings, polls, groups');
s = F.logOuting(s, { date: d(10), who: ['fa'], what: 'Dinner', where: 'Somewhere', rating: 4 }, NOW);
s = F.logOuting(s, { id: 'op', date: d(20), who: ['fz'], what: 'Brunch', start: 11 * 60 }, NOW);
check(F.lastSeen(s, 'fa', NOW) === d(10) && F.overdue(s, s.friends.fa, NOW) === 0, 'last seen and on time');
check(s.outings.op.planned && !F.outingDue(s.outings.op, NOW) && F.outingDue(s.outings.op, new Date(2026, 10, 20, 14)), 'a planned outing asks "did it happen?" two hours after it starts');
s = X.savePoll(s, { title: 'Padel', slots: [{ date: d(20), start: 1200, end: 1320 }, { date: d(21), start: 1200, end: 1320 }], who: ['fa', 'fz'] });
const pid = Object.keys(s.polls)[0]; s = X.setVote(s, pid, 'fa', [1]); s = X.setVote(s, pid, 'fz', [1]);
check(X.pollResult(s.polls[pid]).everyone && X.pollResult(s.polls[pid]).best === 1, 'a poll finds the slot everyone can do');
s = F.saveGroup(s, { name: 'Work friends', members: ['fa', 'fn', 'gone'] });
check(F.groupList(s)[0].members.length === 2, 'a group lists only people who are still friends');

console.log('hub files');
const st = HUB.buildStatus(s, NOW);
check(st.app === 'clementine' && st.contract === 2 && /Zed's birthday today/.test(st.summary), `summary: ${st.summary}`);
check(st.pending.some(p => /birthday/.test(p)) && st.inbox.length >= 1 && st.inbox.every(i => i.type === 'task' && /^bday-/.test(i.id)), 'birthdays become pending lines and tasks offered to Citrus');
check(st.actions.length === 6 && st.actions.every(a => a.url.startsWith(HUB.SITE_URL)), 'six deep links');
check(st.metrics.length <= 12 && st.metrics.every(x => Number.isFinite(x.value)), 'metrics are numbers');
check(!JSON.stringify(st).includes('FSED') && !JSON.stringify(st).includes('Somewhere'), 'no notes or places in status.json');
const ct = HUB.buildContacts(s);
check(ct.contacts['id:2']?.friend && ct.contacts['id:2'].nick === 'Annie' && ct.contacts['id:3']?.phone && !JSON.stringify(ct).includes('FSED'), 'contacts.json: handles by rota key, no notes');
check(!JSON.stringify(ct).includes('birthday'), 'contacts.json has no birthdays');

console.log('migration from Citrus');
const citrus = { updatedAt: 1, rotas: { x: { people: [] } }, tasks: { t: { title: 'not social' } }, friends: { f1: { id: 'f1', name: 'Old Friend', rotaKey: 'id:2', phone: '0555', at: 5 } }, contacts: { 'id:3': { phone: '0566', note: 'n' } }, outings: { o1: { id: 'o1', date: d(1), who: ['f1'], at: 3 } }, wishlist: { w: { id: 'w', name: 'Café', kind: 'food', at: 2 } }, deleted: { 'friend:gone': Date.now() - 5000, 'rota:x': Date.now() - 5000 }, settings: { custom: { social: { wake: 600, late: 1440, minMeet: 120 } } } };
const before = { ...s };
const r = MIG.applyMigration(sanitize({ friends: {}, settings: {} }), citrus);
check(r.changed && r.state.friends.f1 && r.state.contacts['id:3'].key === 'id:3' && r.state.outings.o1 && r.state.wishlist.w, 'friends, cards, outings and wishlist come over');
check(!r.state.tasks && !r.state.rotas || Object.keys(r.state.rotas || {}).length === 0, "tasks and rotas stay Citrus's");
check(r.state.deleted['friend:gone'] && !r.state.deleted['rota:x'], 'only social tombstones come over');
check(CZ.custom(r.state).social.wake === 600, 'the Social timing comes over');
check(MIG.describe(r.counts) === '1 friend · 1 contact card · 1 outing · 1 wishlist item', `describe: ${MIG.describe(r.counts)}`);
const twice = MIG.applyMigration(r.state, citrus);
check(Object.keys(twice.state.friends).length === 1, 'running it twice does not duplicate');
const mine = MIG.applyMigration({ ...before, friends: { ...before.friends, f1: { ...citrus.friends.f1, name: 'Renamed', at: Date.now() } } }, citrus);
check(mine.state.friends.f1.name === 'Renamed', 'a newer local edit wins over the Citrus copy');
check(MIG.looksLikeCitrus(citrus) && !MIG.looksLikeCitrus({ app: 'clementine', friends: {} }), 'a Citrus backup is told apart');

console.log('merging two devices');
const A = sanitize({ updatedAt: 10, friends: { a: { id: 'a', name: 'A', at: 10 }, b: { id: 'b', name: 'B', at: 5 } }, deleted: {} });
const B = sanitize({ updatedAt: 12, friends: { b: { id: 'b', name: 'B2', at: 11 }, c: { id: 'c', name: 'C', at: 12 } }, deleted: { 'friend:a': 11 } });
const M = mergeStates(A, B);
check(!M.friends.a && M.friends.b.name === 'B2' && M.friends.c, 'newest edit wins per friend; a deletion holds');
check(Object.keys(sanitize({ friends: { x: 'no', y: { id: 'y', name: 'Y', sched: 'bad' } } }).friends).length === 1, 'a damaged friend is dropped, a bad schedule repaired');
const bk = checkBackup({ app: 'clementine', friends: { a: { name: 'A' }, b: 7 }, rotas: {} });
check(bk.ok && bk.dropped.some(x => /unreadable friends/.test(x)) && bk.dropped.some(x => /not Clementine's: rotas/.test(x)), 'a backup is checked before a restore');
check(!checkBackup({ app: 'mandarin', rotas: {} }).ok, "another app's backup is refused");

if (bad()) { console.log(`${bad()} check(s) FAILED`); process.exit(1); }
console.log('all good');
