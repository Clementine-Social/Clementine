// Made-up people and a shifts.json shaped like Mandarin's, for the browser tests. Never real names, numbers or IDs.
const d = (n) => `2026-11-${String(n).padStart(2, '0')}`, dec = (n) => `2026-12-${String(n).padStart(2, '0')}`;
const myDays = [];
for (let n = 9; n <= 30; n++) {
  const dow = new Date(2026, 10, n).getDay();
  if (n === 17 || n === 24) myDays.push({ date: d(n), kind: 'work', code: 'N1', type: 'N', site: 'Upper Village', start: '20:00', end: '08:00', overnight: true });
  else if (dow === 5 || dow === 6 || n === 18 || n === 25) myDays.push({ date: d(n), kind: 'off', code: '' });
  else myDays.push({ date: d(n), kind: 'work', code: 'D1', type: 'D', site: 'Upper Village', start: '08:00', end: '20:00' });
}
const row = (fn) => { const o = {}; for (let n = 9; n <= 30; n++) { const c = fn(n); if (c) o[d(n)] = c; } return o; };
const roster = {
  'id:1': { name: 'Dr Test Me', unit: 'gp', days: row(() => 'D1') },
  'id:2': { name: 'Dr Ann Able', unit: 'gp', days: row(n => [16, 20, 21, 27, 28].includes(n) ? '' : 'D2') },
  'id:3': { name: 'Dr Bo Bright', unit: 'fsed', days: row(n => n % 3 === 0 ? 'N' : n % 3 === 1 ? 'D' : '') },
  'id:4': { name: 'Dr Cy Cole', unit: 'gp', days: row(n => n % 4 ? 'D3' : '') },
  'name:nina nurse': { name: 'Nina Nurse', unit: 'nurse', days: row(n => n === 19 ? 'PULL OUT' : n % 2 ? 'D' : 'N') },
  'name:omar orderly': { name: 'Omar Orderly', unit: 'nurse', days: row(n => n % 5 === 0 ? 'VL' : 'D') },
};
for (let i = 0; i < 30; i++) roster[`id:${100 + i}`] = { name: `Dr Extra Person${i}`, unit: i % 3 ? 'gp' : 'uv', days: row(n => (n + i) % 3 ? 'D1' : '') };
export const shifts = { app: 'mandarin', contract: 2, updatedAt: '2026-11-16T05:00:00Z', me: { name: 'Dr Test Me', key: 'id:1' }, days: myDays, roster,
  legend: { D1: { label: 'Day · Upper Village', site: 'Upper Village', type: 'D', start: '08:00', end: '20:00' }, D2: { label: 'Day · Lower Village', site: 'Lower Village', type: 'D', start: '08:00', end: '20:00' }, D3: { label: 'Day · FSED', site: 'FSED', type: 'D', start: '08:00', end: '20:00' }, N1: { label: 'Night · Upper Village', site: 'Upper Village', type: 'N', start: '20:00', end: '08:00' } } };
const at = Date.parse('2026-11-10T10:00:00Z');
export const state = {
  app: 'clementine', version: 1, updatedAt: at,
  friends: {
    fa: { id: 'fa', name: 'Ann Able', nick: 'Annie', kind: 'gp', rotaKey: 'id:2', phone: '0555000111', whatsapp: '', snap: 'ann.a', insta: 'ann_a', birthday: '11-18', every: 14, notes: 'Likes ramen', sched: {}, weeklyOff: [], hours: {}, fav: true, createdAt: at - 9e9, at },
    fn: { id: 'fn', name: 'Nina Nurse', nick: '', kind: 'nurse', rotaKey: 'name:nina nurse', phone: '0555000222', whatsapp: '', snap: '', insta: '', birthday: '', every: 30, notes: '', sched: { [d(19)]: 'off' }, weeklyOff: [], hours: {}, fav: false, createdAt: at - 9e9, at },
    fz: { id: 'fz', name: 'Zed Zane', nick: '', kind: 'family', rotaKey: '', phone: '+971501234567', whatsapp: '', snap: '', insta: '', birthday: '1990-11-16', every: 7, notes: '', sched: {}, weeklyOff: [5, 6], hours: {}, fav: false, createdAt: at - 9e9, at },
    fq: { id: 'fq', name: 'Quinn Quiet', nick: 'Q', kind: 'other', rotaKey: '', phone: '', whatsapp: '', snap: '', insta: '', birthday: '', every: 21, notes: '', sched: {}, weeklyOff: [], hours: {}, fav: false, createdAt: at - 9e9, at },
  },
  contacts: { 'id:3': { key: 'id:3', name: 'Dr Bo Bright', phone: '0566000333', snap: 'bo.b', note: 'FSED lead', birthday: '11-20', at } },
  groups: { g1: { id: 'g1', name: 'Work friends', icon: '🩺', members: ['fa', 'fn'], at } },
  outings: { o1: { id: 'o1', date: d(2), who: ['fa'], what: 'Dinner', where: 'Somewhere', rating: 4, notes: '', planned: false, at }, o2: { id: 'o2', date: d(15), who: ['fz'], what: 'Brunch', where: '', rating: 0, notes: '', planned: true, start: 660, at }, o3: { id: 'o3', date: d(21), who: ['fa', 'fn'], what: 'Padel', where: '', rating: 0, notes: '', planned: true, start: 1200, at } },
  polls: { p1: { id: 'p1', title: 'Dinner', slots: [{ date: d(20), start: 1200, end: 1320 }, { date: d(21), start: 1230, end: 1350 }], who: ['fa', 'fq'], votes: { fa: [0] }, status: 'open', chosen: -1, at } },
  wishlist: { w1: { id: 'w1', name: 'Rooftop café', kind: 'food', city: 'Riyadh', note: '', url: '', with: ['fa'], done: '', at } },
  treats: { t1: { id: 't1', date: d(1), what: 'Kunafa', for: 'The team', cost: 80, at } },
  deleted: {}, stamps: {}, migrated: { from: 'citrus', at, counts: { friends: 4 } }, settings: {},
};
