// A person, up close: the avatar ring every list uses, the profile sheet (reach, free together, dates, gift ideas, money,
// everything you did together), logging a call or message, settling up, and sharing your free time with a group.
import { h, toast, keyOf, fromKey, addDays, startOfDay, relDay, DAY_SHORT, MONTHS } from './util.js';
import * as F from './social.js';
import * as R from './roster.js';
import * as SU from './social-ui.js';

let ctx = null;
export function initPerson(c) { ctx = c; }
const S = () => ctx.S();
const cc = () => S().settings?.cc || '966';
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const money = (n) => `${Math.round(Math.abs(n) * 100) / 100} SAR`;

// ───────────── avatar rings: initials in a ring of ten segments, like a clementine cut across.
// Each person keeps one hue (from their name), so the same face reads the same in every list. When `frac` is given the lit
// segments show it (on Today: how much of the day you are both free); without it the ring is a quiet outline in their hue.
const HUES = [14, 36, 142, 176, 204, 252, 292, 338];
export const hueOf = (name) => { let x = 0; for (const c of String(name || '?')) x = (x * 31 + c.charCodeAt(0)) >>> 0; return HUES[x % HUES.length]; };
const ini = (n) => String(n || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs) => { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
function arc(cx, cy, r, a0, a1) { const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; }
export function ring(f, { size = 40, frac = null, label = '' } = {}) {
  const name = f?.nick || f?.name || '?', hue = hueOf(f?.name || name), r = size / 2 - 2.5, seg = 10, gap = 0.16, lit = frac == null ? -1 : Math.max(0, Math.min(seg, Math.round(frac * seg)));
  const box = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', class: 'ring-svg' });
  for (let i = 0; i < seg; i++) { const a0 = i / seg * Math.PI * 2 + gap / 2, a1 = (i + 1) / seg * Math.PI * 2 - gap / 2; box.append(svg('path', { d: arc(size / 2, size / 2, r, a0, a1), class: lit < 0 ? 'rs' : i < lit ? 'rs on' : 'rs off' })); }
  return h('span', { class: `ring ${f?.kind || ''}`, style: { '--h': hue, '--s': `${size}px` }, ...(label ? { role: 'img', 'aria-label': label } : {}) }, box, h('b', {}, ini(f?.name || name)));
}

// ───────────── the profile: one sheet for everything about a friend
export function profileSheet(f) {
  f = S().friends?.[f.id] || f;
  const s = S(), now = new Date(), st = F.friendStats(s, f, now), od = F.overdue(s, f, now), bal = F.balances(s)[f.id] || 0;
  const free = F.meetups(s, { ids: [f.id], busyOf: SU.busyOf, days: 21 }).slice(0, 3).sort((a, b) => a.date - b.date || a.window[0] - b.window[0]);
  const occ = F.birthdays({ friends: { [f.id]: f } }, now, 366).slice(0, 4);
  const kind = F.FRIEND_KINDS.find(k => k.id === f.kind)?.label, unit = f.rotaKey ? R.UNIT_LABEL[R.unitOf(f.rotaKey)] : '';
  const today = f.rotaKey ? R.shiftOf(f.rotaKey, now) : null;
  const tl = F.timeline(s, f.id, now, 12);
  const gifts = f.gifts || [];
  const close = () => box.close();
  const giftAdd = h('input', { 'data-nofocus': '', placeholder: 'A gift idea (book, perfume they mentioned…)', 'aria-label': 'Gift idea', onKeydown: (e) => { if (e.key === 'Enter') addGift(); } });
  const addGift = () => { const t = giftAdd.value.trim(); if (!t) return; ctx.update(x => F.updateFriend(x, f.id, { gifts: [...(x.friends[f.id].gifts || []), { text: t, done: '' }] })); giftAdd.value = ''; refresh(); };
  const refresh = () => { close(); profileSheet(f); };
  const lastLine = st.lastContact ? `in touch ${relDay(fromKey(st.lastContact))}` : 'not in touch yet';
  const box = ctx.sheet([
    h('div', { class: 'pf-head' }, ring(f, { size: 64 }), h('div', { class: 'grow' }, h('h2', {}, f.nick || F.shortName(f)), h('div', { class: 'small muted' }, [f.nick && f.nick !== f.name ? f.name : '', kind, unit && unit !== kind ? `${unit} rota` : ''].filter(Boolean).join(', ')),
      h('div', { class: `small ${od ? 'late' : 'muted'}` }, `${lastLine}${od ? ` · ${od > 60 ? 'long overdue' : `${days(od)} overdue`}` : ''}`))),
    SU.reach(f, ''),
    h('div', { class: 'pf-acts' },
      h('button', { class: 'btn primary', onClick: () => { close(); SU.inviteSheet([f.id]); } }, 'Invite'),
      h('button', { class: 'btn', onClick: () => { ctx.update(x => F.logTouch(x, { who: [f.id], kind: 'call' })); toast(`Logged: talked with ${F.shortName(f)} today`, 'ok', { action: { label: 'Details', run: () => touchSheet([f.id]) } }); refresh(); } }, 'Talked today'),
      h('button', { class: 'btn', onClick: () => { close(); SU.outingSheet(null, { who: [f.id] }); } }, 'Log outing'),
      h('button', { class: 'btn ghost', onClick: () => { close(); SU.friendSheet(f); } }, 'Edit')),
    today ? h('div', { class: 'small pf-today' }, `Today: ${today.kind === 'work' ? `working ${today.code}${today.start != null ? ` ${F.hhmm(today.start)}–${F.hhmm(today.end)}` : ''}` : today.kind === 'off' ? 'off' : today.kind === 'leave' ? 'on leave' : String(today.label || today.code).toLowerCase()}`) : null,
    h('section', { class: 'pf-sec' }, h('h3', {}, 'Free together'), free.length ? free.map(m => h('button', { class: 'pf-slot', onClick: () => { close(); SU.inviteSheet([f.id], m); } }, h('b', {}, SU.dayLabel(m.date)), h('span', {}, SU.win(m.window)), m.dayLong ? h('span', { class: 'chip sel' }, 'all day') : null))
      : h('div', { class: 'small muted' }, f.rotaKey || Object.keys(f.sched || {}).length || (f.weeklyOff || []).length ? 'No shared free time in the next 3 weeks.' : 'Link them to their rota row or add their days off to see this.')),
    occ.length ? h('section', { class: 'pf-sec' }, h('h3', {}, 'Dates'), occ.map(b => h('div', { class: 'pf-row' }, h('span', { class: 'grow' }, `${b.label}${b.age ? ` (${b.birthday ? `turns ${b.age}` : `${b.age} years`})` : ''}`), h('span', { class: 'dim small' }, `${DAY_SHORT[b.date.getDay()]} ${b.date.getDate()} ${MONTHS[b.date.getMonth()].slice(0, 3)} · ${b.inDays === 0 ? 'today' : `in ${days(b.inDays)}`}`)))) : null,
    h('section', { class: 'pf-sec' }, h('h3', {}, 'Gift ideas'),
      gifts.filter(g => !g.done).map(g => h('div', { class: 'pf-row' }, h('span', { class: 'grow' }, g.text), h('button', { class: 'btn sm ghost', title: 'Mark as given', onClick: () => { ctx.update(x => F.logTouch(F.updateFriend(x, f.id, { gifts: (x.friends[f.id].gifts || []).map(y => y.id === g.id ? { ...y, done: keyOf(new Date()) } : y) }), { who: [f.id], kind: 'gift', note: g.text })); toast('Marked as given', 'ok'); refresh(); } }, 'Given'), h('button', { class: 'btn sm ghost', 'aria-label': `Remove ${g.text}`, onClick: () => { ctx.update(x => F.updateFriend(x, f.id, { gifts: (x.friends[f.id].gifts || []).filter(y => y.id !== g.id) })); refresh(); } }, '✕'))),
      h('div', { class: 'row pf-add' }, giftAdd, h('button', { class: 'btn sm', onClick: addGift }, 'Add')),
      gifts.some(g => g.done) ? h('div', { class: 'tiny dim' }, `Given before: ${gifts.filter(g => g.done).map(g => g.text).join(', ')}`) : null),
    bal ? h('section', { class: 'pf-sec' }, h('h3', {}, 'Money'), h('div', { class: 'pf-row' }, h('span', { class: `grow ${bal > 0 ? 'ok' : 'late'}` }, bal > 0 ? `${F.shortName(f)} owes you ${money(bal)}` : `You owe ${F.shortName(f)} ${money(bal)}`), h('button', { class: 'btn sm', onClick: () => settleSheet(f) }, 'Settle up'))) : null,
    f.notes ? h('section', { class: 'pf-sec' }, h('h3', {}, 'Notes'), h('div', { class: 'small fr-note' }, f.notes)) : null,
    h('section', { class: 'pf-sec' }, h('h3', {}, 'Together'), h('div', { class: 'tiny dim', style: { marginBottom: '6px' } }, `${st.total} meet-up${st.total === 1 ? '' : 's'}${st.thisYear ? ` (${st.thisYear} this year)` : ''} · ${st.touches} call${st.touches === 1 ? '' : 's'} and messages${st.favPlace ? ` · usually ${st.favPlace}` : ''}`),
      tl.length ? h('ol', { class: 'pf-tl' }, tl.map(e => h('li', { class: e.kind }, h('span', { class: 'pf-d' }, relDay(fromKey(e.date))), h('span', { class: 'grow' }, e.kind === 'touch' ? `${F.TOUCH_KINDS.find(k => k[0] === e.rec.kind)?.[2] || 'Touch'}${e.rec.note ? `: ${e.rec.note}` : ''}` : `${e.kind === 'plan' ? 'Planned: ' : ''}${e.rec.what || 'Meet-up'}${e.rec.where ? `, ${e.rec.where}` : ''}${e.rec.rating ? ' ' + '★'.repeat(e.rec.rating) : ''}`)))) : h('div', { class: 'small muted' }, 'Nothing yet. Log a meet-up or a call and it shows here.')),
  ]);
}

// ───────────── a call, a message, a visit
export function touchSheet(preset = [], t = null) {
  const s = S(), fr = F.friendList(s), who = new Set(t?.who || preset); let kind = t?.kind || 'call';
  const date = h('input', { type: 'date', value: t?.date || keyOf(new Date()), max: keyOf(new Date()) }), note = h('input', { value: t?.note || '', placeholder: 'What about? (their exam, the new baby…)' });
  const kinds = h('div', { class: 'chips' }, F.TOUCH_KINDS.map(([k, ic, l]) => h('button', { class: `chip ${kind === k ? 'sel' : ''}`, 'aria-pressed': String(kind === k), onClick: (e) => { kind = k; kinds.querySelectorAll('.chip').forEach(c => { c.classList.toggle('sel', c === e.currentTarget); c.setAttribute('aria-pressed', String(c === e.currentTarget)); }); } }, `${ic} ${l}`)));
  const box = ctx.sheet([h('h2', {}, t ? 'Edit' : 'Kept in touch'), h('div', { class: 'small muted' }, 'A call, a message or a visit counts as being in touch, so the keep-in-touch reminders stay honest.'),
    h('div', { class: 'chips', style: { margin: '10px 0' } }, fr.map(f => h('button', { class: `chip ${who.has(f.id) ? 'sel' : ''}`, 'aria-pressed': String(who.has(f.id)), onClick: (e) => { who.has(f.id) ? who.delete(f.id) : who.add(f.id); e.currentTarget.classList.toggle('sel', who.has(f.id)); e.currentTarget.setAttribute('aria-pressed', String(who.has(f.id))); } }, F.shortName(f)))),
    kinds, h('div', { class: 'grid2', style: { marginTop: '10px' } }, SU.field('When', date), SU.field('Note', note)),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: () => { if (!who.size) return toast('Pick who', 'err'); ctx.update(x => F.logTouch(x, { id: t?.id, who: [...who], kind, date: date.value, note: note.value })); box.close(); toast(t ? 'Saved' : 'Logged', 'ok'); } }, 'Save'),
      t ? h('button', { class: 'btn danger', onClick: () => { const prev = S().touches[t.id]; ctx.update(x => F.deleteTouch(x, t.id)); box.close(); toast('Deleted', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'touches', 'touch', t.id, prev)) } }); } }, 'Delete') : null)]);
}

// ───────────── money from shared bills
export function settleSheet(f) {
  const s = S(), list = F.openShares(s, f.id), bal = F.balances(s)[f.id] || 0;
  const box = ctx.sheet([h('h2', {}, `Settle up with ${F.shortName(f)}`), h('div', { class: `small ${bal > 0 ? 'ok' : bal < 0 ? 'late' : 'muted'}` }, bal > 0 ? `${F.shortName(f)} owes you ${money(bal)} in total.` : bal < 0 ? `You owe ${F.shortName(f)} ${money(bal)} in total.` : 'All square.'),
    h('div', { class: 'list', style: { margin: '10px 0' } }, list.map(x => h('label', { class: 'item' }, h('input', { type: 'checkbox', onChange: (e) => { ctx.update(st => F.settle(st, x.outing.id, x.mine ? 'me' : f.id, e.target.checked)); } }), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${x.outing.what || 'Meet-up'} · ${money(x.amount)}`), h('div', { class: 'meta' }, `${relDay(fromKey(x.outing.date))} · ${x.mine ? 'you owe this' : 'they owe this'}`))))),
    list.length ? h('div', { class: 'tiny dim' }, 'Tick what has been paid back.') : null,
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, list.length ? h('button', { class: 'btn primary grow', onClick: () => { ctx.update(st => list.reduce((y, x) => F.settle(y, x.outing.id, x.mine ? 'me' : f.id, true), st)); box.close(); toast('All settled', 'ok'); } }, 'Mark all paid') : null,
      bal > 0 ? (() => { const u = F.waWith(f, `Hey ${F.shortName(f)}! Just a reminder: ${money(bal)} from ${list.filter(x => !x.mine).map(x => x.outing.what || 'our meet-up').join(', ')} 🙂`, cc()); return u ? h('a', { class: 'btn', href: u, target: '_blank', rel: 'noopener' }, 'Remind on WhatsApp') : null; })() : null)]);
}

// ───────────── your free time, as text for a group chat
export function availabilitySheet() {
  let n = 14, min = 120;
  const fmtDay = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  const ta = h('textarea', { rows: 9, class: 'inp', 'aria-label': 'Your free time' }), wrap = h('div');
  const paint = () => { ta.value = F.availabilityText(S(), { days: n, busyOf: SU.busyOf, fmtDay, minMin: min }) || 'No free time in that range.'; };
  const box = ctx.sheet([h('h2', {}, 'Share my free time'), h('div', { class: 'small muted' }, 'Built from your shifts (and sleep after nights) and your calendar. Edit it before you send.'),
    h('div', { class: 'row wrap', style: { gap: '6px', margin: '10px 0' } }, h('div', { class: 'chips' }, [[7, '1 week'], [14, '2 weeks'], [28, '4 weeks']].map(([v, l]) => h('button', { class: `chip ${n === v ? 'sel' : ''}`, onClick: (e) => { n = v; e.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === e.currentTarget)); paint(); } }, l))),
      h('div', { class: 'chips' }, [[120, '2h+'], [240, '4h+'], [480, 'whole days']].map(([v, l]) => h('button', { class: `chip ${min === v ? 'sel' : ''}`, onClick: (e) => { min = v; e.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === e.currentTarget)); paint(); } }, l)))),
    ta, wrap,
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('a', { class: 'btn primary grow', href: '#', target: '_blank', rel: 'noopener', onClick: (e) => { e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(ta.value)}`; } }, 'Send on WhatsApp'),
      h('button', { class: 'btn', onClick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { ta.select(); toast('Select and copy the text', 'err'); } } }, 'Copy'),
      navigator.share ? h('button', { class: 'btn', onClick: () => navigator.share({ text: ta.value }).catch(() => {}) }, 'Share…') : null)]);
  paint();
}
