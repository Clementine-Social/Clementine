// What Clementine tells the other apps (pure, no DOM). Two small files in My Apps/hub/clementine:
//  - status.json   (HUB.md contract v2): one-line summary, today, next, metrics, pending, birthday tasks offered to Citrus, deep links.
//  - contacts.json handles by rota key (phone, WhatsApp, Snapchat, Instagram, nickname) for Mandarin and Citrus to read.
//                  Never notes, never birthdays' years, never anything about outings.
import { keyOf, fromKey, addDays, startOfDay, DAY_SHORT } from './util.js';
import * as F from './social.js';
import * as X from './extras.js';
import * as CZ from './custom.js';
import * as R from './roster.js';
import * as L from './life.js';

export const SITE_URL = 'https://clementine-social.github.io/Clementine/';
export const CONTRACT = 2;
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const part = (m) => m < 12 * 60 ? 'morning' : m < 17 * 60 ? 'afternoon' : 'evening';
const dayWord = (d, now) => { const n = Math.round((startOfDay(d) - startOfDay(now)) / 864e5); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : DAY_SHORT[d.getDay()]; };
const bdayWords = (b) => `${F.occasionName(b)} ${b.inDays === 0 ? 'today' : b.inDays === 1 ? 'tomorrow' : `in ${days(b.inDays)}`}`;

/** The outings still to come (planned, not yet due), soonest first. */
export function upcoming(s, now = new Date()) { return F.outingList(s).filter(o => o.planned && !F.outingDue(o, now)).reverse(); }

/** status.json for Citrus (HUB.md v2). `busyOf(date)` → [[start, end]] minutes you are busy (calendar), optional. */
export function buildStatus(s, now = new Date(), { busyOf = () => [] } = {}) {
  const c = CZ.custom(s); F.setTiming(c.social);
  const names = (ids) => ids.map(id => s.friends?.[id]).filter(Boolean).map(F.shortName);
  const bd = F.birthdays(s, now, 14), soonB = bd.filter(b => b.inDays <= c.remind.birthdays);
  const up = upcoming(s, now), due = F.outingList(s).filter(o => F.outingDue(o, now));
  const friends = F.friendList(s), od = friends.map(f => ({ f, d: F.overdue(s, f, now) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d);
  const best = friends.length ? F.meetups(s, { busyOf, days: 7, now })[0] || null : null;
  const polls = X.pollList(s).filter(p => p.status === 'open'), waiting = polls.map(p => ({ p, r: X.pollResult(p) })).filter(x => x.r.waiting.length);
  const bits = [];
  if (soonB[0]) bits.push(bdayWords(soonB[0]));
  if (up[0]) { const o = up[0], d = fromKey(o.date); bits.push(`${o.what || 'meet-up'} with ${names(o.who).join(', ') || 'friends'} ${dayWord(d, now)}${o.start != null ? ` ${F.hhmm(o.start)}` : ''}`); }
  else if (best) bits.push(`free with ${names(best.who).slice(0, 3).join(', ')} ${dayWord(best.date, now)} ${part(best.window[0])}`);
  if (!bits.length && od[0]) bits.push(`${F.shortName(od[0].f)} not seen for a while`);
  if (!bits.length) bits.push(friends.length ? `${friends.length} friends · nothing planned` : 'add your friends in Clementine');
  const pending = [];
  for (const b of soonB) pending.push(bdayWords(b));
  if (due.length) pending.push(`${due.length} outing${due.length > 1 ? 's' : ''} to confirm`);
  if (od.length) pending.push(`${od.length} friend${od.length > 1 ? 's' : ''} overdue for a meet-up`);
  for (const { p, r } of waiting.slice(0, 2)) pending.push(`Poll “${p.title}”: waiting on ${r.waiting.length}`);
  const asks = L.asksNow(s, now); for (const x of asks.slice(0, 3)) pending.push(`Ask ${F.shortName(x.f)}: ${x.a.text}`);
  const tn = X.treatNudge(s, now); if (tn?.due) pending.push(`Team treat: ${days(tn.since)} since the last one`);
  // a birthday a few days ahead becomes a task Citrus can offer (stable id per person and year: never offered twice)
  const inbox = soonB.slice(0, 6).map(b => ({ id: `bday-${String(b.key).replace(/[^\w:-]/g, '').slice(0, 40)}-${b.date.getFullYear()}`, type: 'task', title: b.birthday ? `Wish ${b.name} a happy birthday${b.age ? ` (${b.age})` : ''}` : `${b.name}: ${b.label}${b.age ? ` (${b.age} years)` : ''}`, date: keyOf(b.date), minutes: 5, pri: 2, url: `${SITE_URL}?do=birthdays`, expires: keyOf(addDays(b.date, 1)) }));
  for (const x of asks.filter(x => x.why === 'due').slice(0, 4)) inbox.push({ id: `ask-${x.a.id}`, type: 'task', title: `Ask ${F.shortName(x.f)}: ${x.a.text}`.slice(0, 120), date: x.a.due, minutes: 5, pri: 3, url: SITE_URL });
  const y = String(now.getFullYear()), m = keyOf(now).slice(0, 7), t = keyOf(now), seen = F.outingList(s).filter(o => !o.planned && o.date <= t);
  const touched = F.touchList(s).filter(x => x.date.startsWith(m)).length;
  const metrics = [
    { key: 'touches-month', label: 'Calls and messages logged this month', value: touched, unit: 'touches', date: t },
    { key: 'outings-month', label: 'Meet-ups this month', value: seen.filter(o => o.date.startsWith(m)).length, unit: 'meet-ups', date: t },
    { key: 'outings-year', label: 'Meet-ups this year', value: seen.filter(o => o.date.startsWith(y)).length, unit: 'meet-ups', date: t },
    { key: 'friends-overdue', label: 'Friends overdue', value: od.length, goal: 0, unit: 'friends', date: t },
    { key: 'friends', label: 'Friends', value: friends.length, unit: 'people', date: t },
  ];
  metrics.push({ key: 'week-streak', label: 'Weeks in a row in touch with someone', value: L.weekStreak(s, now), unit: 'weeks', date: t });
  if (polls.length) metrics.push({ key: 'polls-open', label: 'Open polls', value: polls.length, unit: 'polls', date: t });
  const next = up[0] ? { title: `${up[0].what || 'Meet-up'} with ${names(up[0].who).join(', ') || 'friends'}`, minutes: 120, ...(up[0].start != null ? { at: new Date(+fromKey(up[0].date) + up[0].start * 60000).toISOString() } : {}) }
    : best ? { title: `Invite ${names(best.who).slice(0, 3).join(', ')} (${dayWord(best.date, now)} ${F.hhmm(best.window[0])})`, minutes: 5 } : null;
  const base = SITE_URL;
  const actions = [
    { id: 'free', label: 'Who is free', url: `${base}#free`, icon: '🍊' },
    { id: 'find', label: 'Find a day', url: `${base}?do=find`, icon: '🔎', minutes: 2 },
    { id: 'invite', label: 'Plan a meet-up', url: `${base}?do=invite`, icon: '💬', minutes: 5 },
    { id: 'log', label: 'Log an outing', url: `${base}?do=log`, icon: '📝', minutes: 2 },
    { id: 'birthdays', label: 'Birthdays', url: `${base}?do=birthdays`, icon: '🎂' },
    { id: 'call', label: 'Log a call', url: `${base}?do=call`, icon: '📞', minutes: 1 },
  ];
  return {
    app: 'clementine', title: 'Clementine', icon: '🍊', color: '#ff6a3d', url: base, contract: CONTRACT,
    updatedAt: now.toISOString(),
    summary: bits.join(' · ').slice(0, 140),
    today: { date: t, done: !due.length },
    next, metrics, pending: pending.slice(0, 10), inbox, actions,
    extra: {
      birthdays: bd.map(b => ({ name: b.name, label: b.label, birthday: b.birthday, date: keyOf(b.date), inDays: b.inDays, ...(b.age ? { age: b.age } : {}) })).slice(0, 8),
      upcoming: up.slice(0, 5).map(o => ({ date: o.date, ...(o.start != null ? { start: F.hhmm(o.start) } : {}), what: o.what || 'Meet-up', who: names(o.who) })),
      freeTonight: F.freeWith(s, startOfDay(now), { busy: busyOf(startOfDay(now)), now }).slice(0, 6).map(x => ({ name: F.shortName(x.f), from: F.hhmm(x.window[0]), to: F.hhmm(x.window[1]) })),
      overdue: od.slice(0, 5).map(x => ({ name: F.shortName(x.f), days: x.d })),
      money: (() => { const b = F.balances(s); let owed = 0, owe = 0; for (const v of Object.values(b)) v > 0 ? owed += v : owe -= v; return { owedToYou: Math.round(owed), youOwe: Math.round(owe) }; })(),
      roster: R.has() ? R.updatedAt() : null,
    },
  };
}

/** contacts.json: the handles other apps may show, by rota key. Friends that are colleagues come from their friend record. */
export function buildContacts(s, now = new Date()) {
  const contacts = {}, friends = {};
  const pick = (c) => { const o = {}; for (const k of ['phone', 'whatsapp', 'snap', 'insta']) if (c[k]) o[k] = String(c[k]).slice(0, 40); return o; };
  for (const [k, c] of Object.entries(s.contacts || {})) { const o = pick(c); if (c.nick) o.nick = String(c.nick).slice(0, 30); if (Object.keys(o).length) contacts[k] = o; }
  for (const f of F.friendList(s)) {
    if (!f.rotaKey) continue;
    contacts[f.rotaKey] = { ...pick(f), ...(f.nick ? { nick: f.nick } : {}), friend: true };
    friends[f.id] = { rotaKey: f.rotaKey, ...(f.nick ? { nick: f.nick } : {}), name: f.name, ...pick(f) };
  }
  return { app: 'clementine', contract: CONTRACT, updatedAt: now.toISOString(), contacts, friends };
}
