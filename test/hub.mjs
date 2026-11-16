// Clementine against an in-memory Google (Drive + Calendar + sign-in): the first sign-in offers to bring the friends over from
// Citrus's state.json (with Undo), the roster is read from Mandarin's shifts.json, the hub files are written to hub/clementine
// only, a planned meet-up lands in the calendar, and two devices converge. Made-up people only. Run: node test/hub.mjs
import { chromium, serve, sleep, checker } from './helpers.mjs';
import { createFakeGoogle } from './fake-google.mjs';
import { shifts } from './fixture.mjs';

const { server, url } = await serve(), browser = await chromium.launch(), { check, bad } = checker();
const at = Date.parse('2026-11-10T10:00:00Z');
const citrusState = { updatedAt: at, me: { id: '1', name: 'Dr Test Me' }, rotas: { r: { id: 'r', people: [], legend: {} } }, tasks: { t: { id: 't', title: 'not social' } },
  friends: { f1: { id: 'f1', name: 'Ann Able', nick: 'Annie', kind: 'gp', rotaKey: 'id:2', phone: '0555000111', birthday: '11-18', every: 14, at }, f2: { id: 'f2', name: 'Zed Zane', kind: 'other', weeklyOff: [5, 6], phone: '0555000999', at } },
  contacts: { 'id:3': { key: 'id:3', phone: '0566000333', snap: 'bo.b', note: 'private note', at } },
  outings: { o1: { id: 'o1', date: '2026-11-02', who: ['f1'], what: 'Dinner', at } }, polls: {}, wishlist: { w1: { id: 'w1', name: 'Rooftop café', kind: 'food', at } }, treats: {},
  settings: { custom: { social: { wake: 540, late: 1440, minMeet: 120 } } } };

const g = createFakeGoogle();
g.put('state.json', g.path(['My Apps', 'hub', 'citrus']), citrusState);
g.put('shifts.json', g.path(['My Apps', 'hub', 'mandarin']), shifts);
// birthdays Google Calendar made from (made-up) Google Contacts
const bday = (summary, date, type = 'birthday', extra = {}) => ({ summary, eventType: 'birthday', start: { date }, end: { date }, recurrence: ['RRULE:FREQ=YEARLY'], birthdayProperties: { type, contact: 'people/c1', ...extra } });
for (const [i, e] of [bday('Zed Zane', '1991-02-03'), bday('Bo Bright', '1970-07-09'), bday('Ann Able', '1988-11-18'), bday('Zed Zane', '2015-06-01', 'anniversary'), bday('Stranger Person', '1995-04-04')].entries()) g.calendars.get('primary').events.set(`bd${i}`, { id: `bd${i}`, status: 'confirmed', ...e });

async function device(label, { width = 390 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 700, hasTouch: width < 700, serviceWorkers: 'block', timezoneId: 'Asia/Riyadh' });
  await g.attach(ctx);
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  await p.clock.install({ time: new Date('2026-11-16T09:30:00+03:00') });
  await p.addInitScript(() => { if (!localStorage.getItem('clementine.google')) localStorage.setItem('clementine.google', JSON.stringify({ access_token: 'tok', exp: Date.now() + 3600e3, email: 'tester@example.com' })); });
  await p.goto(url); await p.waitForSelector('#view-today.active'); p.label = label;
  return { ctx, p };
}
const state = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('clementine.state.v1') || 'null'));
const until = async (p, fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await p.evaluate(fn).catch(() => false)) return true; await sleep(150); } return false; };
const sync = async (p) => { await until(p, () => !window.__clementine.rt.syncing); await p.evaluate(() => window.__clementine.refreshAll(true)); await until(p, () => !window.__clementine.rt.syncing); await sleep(300); };

console.log('first sign-in on the phone');
const A = await device('phone');
check(await until(A.p, () => !!document.querySelector('.sheet h2')?.textContent.includes('Bring your friends over')), 'offers to bring the friends over from Citrus');
const sheetTxt = await A.p.locator('.sheet').innerText();
check(/2 friends/.test(sheetTxt) && /1 contact card/.test(sheetTxt) && /1 outing/.test(sheetTxt) && /timing/.test(sheetTxt), `says what it found: ${sheetTxt.split('\n').find(l => /Found/.test(l))}`);
await A.p.click('.sheet button:has-text("Bring them over")'); await sleep(700);
let s = await state(A.p);
check(s.friends.f1 && s.friends.f2 && s.contacts['id:3'] && s.outings.o1 && s.wishlist.w1, 'friends, the colleague card, the outing and the wishlist came over');
check(!s.tasks && !s.rotas && !s.me, 'Citrus-only data (tasks, rotas, me) did not');
check(s.settings.custom?.social?.wake === 540, 'the Social timing came over');
check(s.migrated?.from === 'citrus', 'migration recorded');
check(await A.p.locator('.toast button:has-text("Undo")').count() === 1, 'an Undo is offered');
check(await until(A.p, () => window.__clementine.R.has() && window.__clementine.R.people().length > 30), 'the roster was read from Mandarin');
await sync(A.p);
const files = g.tree().join('\n');
check(!!g.readJsonAt(['My Apps', 'hub', 'clementine'], 'state.json'), 'state.json in hub/clementine');
const st = g.readJsonAt(['My Apps', 'hub', 'clementine'], 'status.json');
check(st?.app === 'clementine' && st.contract === 2 && /Annie/.test(st.summary), `status.json for Citrus: "${st?.summary}"`);
check(st.pending.some(x => /Annie's birthday in 2 days/.test(x)) && st.inbox.some(i => /Wish Annie/.test(i.title)), 'a birthday in 2 days waits on you and is offered to Citrus as a task');
const ct = g.readJsonAt(['My Apps', 'hub', 'clementine'], 'contacts.json');
check(ct?.contacts?.['id:2']?.friend && ct.contacts['id:2'].phone === '0555000111' && ct.contacts['id:3']?.snap === 'bo.b', 'contacts.json: handles by rota key');
check(!JSON.stringify(ct).includes('private note') && !JSON.stringify(st).includes('private note'), 'notes never leave state.json');
check(JSON.stringify(g.readJsonAt(['My Apps', 'hub', 'citrus'], 'state.json')) === JSON.stringify(citrusState), "Citrus's own file is untouched");
check(JSON.stringify(g.readJsonAt(['My Apps', 'hub', 'mandarin'], 'shifts.json')) === JSON.stringify(shifts), "Mandarin's shifts.json is untouched");
check(!files.includes('Citrus Maxima') && !/Rotas/.test(files), 'nothing written outside hub/clementine');

console.log('who is free, and a meet-up on the calendar');
await A.p.click('nav.tabs button[data-view=free]'); await sleep(300);
const free = await A.p.locator('#view-free').innerText();
check(/Annie/.test(free) && /Zed/.test(free) && /Best times/.test(free), 'the grid shows friends with their shifts');
await A.p.click('#view-free .meet button:has-text("Invite") >> nth=0'); await sleep(400);
await A.p.click('.sheet button:has-text("Save as planned")'); await sleep(800);
s = await state(A.p);
const planned = Object.values(s.outings).filter(o => o.planned);
check(planned.length === 1 && planned[0].start != null, 'saved as a planned outing with its time');
check(await until(A.p, () => true) && [...g.calendars.get('primary').events.values()].some(e => /with/.test(e.summary) && e.extendedProperties?.private?.clementine === 'outing'), 'and put on the calendar');

check(await until(A.p, () => Object.values(JSON.parse(localStorage.getItem('clementine.state.v1')).outings).some(o => o.planned && /\|/.test(o.eventId || ''))), 'the plan remembers its calendar event');
console.log('cancelling a plan');
await A.p.click('nav.tabs button[data-view=outings]'); await sleep(300);
await A.p.click('#view-outings .item.clickable:has(.chip.sel) >> nth=0'); await sleep(400);
await A.p.click('.sheet button:has-text("Cancel plan")'); await sleep(900);
check(!Object.values((await state(A.p)).outings).some(o => o.planned), 'the plan is gone');
check(![...g.calendars.get('primary').events.values()].some(e => e.status !== 'cancelled' && e.extendedProperties?.private?.clementine === 'outing'), 'and its calendar event with it');
await sync(A.p);
console.log('birthdays from Google');
await A.p.click('nav.tabs button[data-view=people]'); await sleep(200); await A.p.click('#view-people .seg button:has-text("Birthdays")'); await sleep(200);
await A.p.click('#view-people button:has-text("Get birthdays from Google")');
check(await until(A.p, () => !!document.querySelector('.sheet .gb-list')), 'Google’s birthdays are read and matched');
const gbTxt = await A.p.locator('.sheet').innerText();
check(/Zed Zane → Zed/.test(gbTxt) && /Bo Bright → Bo Bright \(colleague\)/.test(gbTxt) && /already saved/.test(gbTxt) && /1 not in Clementine/.test(gbTxt), 'matched to a friend, a colleague’s card, and Annie’s is already saved');
await A.p.click('.sheet .gb-loose summary'); await A.p.click('.sheet .gb-loose .chip'); await A.p.click('.sheet button:has-text("Save ticked")'); await sleep(600);
const sg = await state(A.p);
check(sg.friends.f2.birthday === '1991-02-03' && sg.friends.f2.dates.some(d => d.label === 'Anniversary' && d.date === '2015-06-01'), 'a friend’s birthday (with the year) and anniversary are saved');
check(sg.contacts['id:3'].birthday === '07-09' && sg.contacts['id:3'].phone === '0566000333', 'a colleague’s card gets the birthday (a 1970 year is dropped) and keeps its numbers');
check(Object.values(sg.friends).some(f => f.name === 'Stranger Person' && f.birthday === '1995-04-04'), 'someone not in Clementine can be added as a friend');
await sync(A.p);
console.log('a second device');
const B = await device('desktop', { width: 1400 });
await sleep(500);
check(!(await B.p.locator('.sheet h2:has-text("Bring your friends over")').count()), 'the second device does not ask again (it reads Clementine’s own state)');
await sync(B.p);
const sb = await state(B.p); check(sb.friends.f1 && sb.outings.o1 && sb.wishlist.w1, 'the desktop has the phone’s data');
await B.p.evaluate(() => window.__clementine.store.update(s => ({ ...s, contacts: { ...s.contacts, 'id:4': { key: 'id:4', phone: '0577000444', at: Date.now() } } }))); await sleep(300);
await A.p.evaluate(() => window.__clementine.store.update(s => { const f = { ...s.friends }; delete f.f2; return { ...s, friends: f, deleted: { ...s.deleted, 'friend:f2': Date.now() } }; })); await sleep(300);
await sync(B.p); await sync(A.p); await sync(B.p);
const [ea, eb] = [await state(A.p), await state(B.p)];
check(ea.contacts['id:4'] && eb.contacts['id:4'], 'a card added on the desktop reaches the phone');
check(!ea.friends.f2 && !eb.friends.f2, 'a friend removed on the phone stays removed on both');
const twins = g.tree().filter(l => /(status|state|contacts)\.json/.test(l) && !/backups|citrus|mandarin/.test(l));
check(twins.length === new Set(twins).size, `no duplicate files (${twins.length})`);
check(!A.p.errors.length && !B.p.errors.length, `no page errors${[...A.p.errors, ...B.p.errors].slice(0, 2).join(' | ')}`);
await browser.close(); server.close();
if (bad()) { console.log(`${bad()} hub check(s) FAILED`); process.exit(1); }
