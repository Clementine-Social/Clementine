// Clementine's main screens: Today, Free (who is free, find a day), Outings; and the sheets they share (friend card editor,
// day sheet, find a day, plan a meet-up, log an outing). Ported from Citrus Maxima's Social tab on 16/11/2026.
import { h, toast, keyOf, fromKey, addDays, startOfDay, relDay, fmtMin, DAY_SHORT, DAY_NAMES, MONTHS } from './util.js';
import * as F from './social.js';
import * as X from './extras.js';
import * as R from './roster.js';
import * as CZ from './custom.js';
import * as HUB from './hub.js';

let ctx = null, showAllFriends = false, gridAll = false, histN = 40, freeSeg = 'grid';
export function initSocial(c) { ctx = c; }
const S = () => ctx.S();
// busyOf reads the calendar for a day; one render asks for the same days hundreds of times, so remember them per render
let busyMemo = new Map();
export const busyOf = (d) => { const k = keyOf(d); if (!busyMemo.has(k)) busyMemo.set(k, ctx.busyOf(d)); return busyMemo.get(k); };
export const freshBusy = () => { busyMemo = new Map(); };
export const field = (label, ...inputs) => h('div', { class: 'field' }, label ? h('label', {}, label) : null, ...inputs);
const ini = (n) => String(n).replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export const av = (f) => h('span', { class: `av sc-av ${f.kind || ''}` }, ini(f.name));
export const dayLabel = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
export const win = (w) => `${F.hhmm(w[0])}–${F.hhmm(w[1])}`;
/** Relative day only when it adds something the date does not already say. */
export const rel = (d) => { const n = Math.round((startOfDay(d) - startOfDay(new Date())) / 864e5); return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n > 1 && n < 14 ? `in ${n} days` : ''; };
export const nameOf = (id) => { const f = S().friends?.[id]; return f ? F.shortName(f) : '?'; };
const closeSheets = () => document.querySelectorAll('.sheet-bg').forEach(e => e.remove());
const cc = () => S().settings?.cc || '966';
/** One failing card must never blank the whole tab. */
export const safe = (label, fn) => { try { return fn(); } catch (e) { console.error(`Clementine: ${label}`, e); return h('div', { class: 'card sc-broken' }, h('div', { class: 'small muted' }, `${label} could not be shown (${e.message}).`)); } };
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;

// ───────────── buttons for reaching someone
export function reach(f, size = 'sm') {
  const l = F.links(f, cc()), mk = (href, label, text, what) => href ? h('a', { class: `btn ${size} ghost sc-btn ${label}`, href, target: '_blank', rel: 'noopener', 'aria-label': `${what} ${f.name}` }, text) : h('span', { class: `btn ${size} ghost sc-btn off`, 'aria-hidden': 'true' }, text);
  return h('div', { class: 'sc-reach' }, mk(l.tel, 'call', '📞', 'Call'), mk(l.wa, 'wa', '💬', 'WhatsApp'), mk(l.snap, 'snap', '👻', 'Snapchat'), mk(l.insta, 'ig', '📸', 'Instagram'));
}

/** One button for a list row: WhatsApp if there is a number, else nothing (the full row of four lives on the card). */
export function reachMini(f) { const l = F.links(f, cc()); return l.wa ? h('a', { class: 'btn sm ghost sc-mini', href: l.wa, target: '_blank', rel: 'noopener', 'aria-label': `WhatsApp ${f.name}`, title: `WhatsApp ${f.name}` }, '💬') : null; }

// ───────────── picking someone's rota row: searchable, grouped, spelling-tolerant
export function rotaPicker(cur, onPick, q0 = '') {
  const s = S(), all = R.people();
  const taken = new Map(F.friendList(s).filter(f => f.rotaKey).map(f => [f.rotaKey, f])); let q = q0;
  const list = h('div', { class: 'rp-list' });
  const pick = (key) => { box.close(); onPick(key); };
  const row = (p) => h('button', { class: `item rp-item ${p.key === cur ? 'sel' : ''}`, onClick: () => pick(p.key) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 'meta' }, [R.UNIT_LABEL[p.unit] || p.unit, taken.get(p.key) && taken.get(p.key).rotaKey !== cur ? `already linked to ${F.shortName(taken.get(p.key))}` : ''].filter(Boolean).join(' · '))), p.key === cur ? h('span', { class: 'chip sel' }, 'linked') : null);
  const paint = () => {
    const qq = q.trim().toLowerCase(), fuzzy = qq ? new Set(R.match(q).map(p => p.key)) : null, hits = qq ? all.filter(p => p.name.toLowerCase().includes(qq) || fuzzy.has(p.key)) : all;
    list.replaceChildren(...(!all.length ? [h('div', { class: 'empty small' }, 'No roster yet. Open Mandarin and load your rotas: Clementine reads who works when from it.')] : !hits.length ? [h('div', { class: 'empty small' }, `Nobody called “${q}” in the roster.`)]
      : ['GPs', 'Specialists', 'Nurses'].map(g => [g, hits.filter(p => p.group === g)]).filter(([, l]) => l.length).map(([g, l]) => h('div', { class: 'rp-group' }, h('div', { class: 'tiny dim rp-head' }, `${g} (${l.length})`), l.slice(0, 120).map(row)))));
  };
  const search = h('input', { type: 'search', class: 'dir-search', placeholder: 'Search the roster (spelling can be rough)', value: q, onInput: (e) => { q = e.target.value; paint(); } });
  const box = ctx.sheet([h('h2', {}, 'Their rota row'), h('div', { class: 'small muted' }, 'Linking someone to their row makes their shifts and free days work by themselves (from Mandarin).'), search,
    h('button', { class: `item rp-item ${!cur ? 'sel' : ''}`, onClick: () => pick('') }, h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Not in a schedule'), h('div', { class: 'meta' }, 'I enter their shifts by hand'))), list]);
  paint(); setTimeout(() => search.focus(), 50);
}
const rotaName = (key) => R.person(key)?.name || '';

// ───────────── adding people from the phone's contacts
export function contactsButton(cls = 'btn grow') {
  const file = h('input', { type: 'file', accept: '.vcf,text/vcard,text/x-vcard', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files?.[0]; if (!f) return; const list = F.parseVCF(await f.text()); e.target.value = ''; chooseContacts(list); } });
  const direct = !!(navigator.contacts && navigator.contacts.select);
  return [file, h('button', { class: cls, onClick: async () => { if (direct) { try { const r = await navigator.contacts.select(['name', 'tel'], { multiple: true }); chooseContacts(r.map(c => ({ name: (c.name || [])[0] || '', phone: (c.tel || [])[0] || '' })).filter(c => c.name)); } catch { file.click(); } } else file.click(); } }, direct ? 'From contacts' : 'From .vcf file')];
}
function chooseContacts(list) {
  if (!list.length) return toast('No contacts found in that file', 'err');
  const have = new Set(F.friendList(S()).map(f => f.name.toLowerCase())), ticks = list.slice(0, 300).map(c => ({ c, on: false, dupe: have.has(c.name.toLowerCase()) }));
  let kind = 'other';
  const box = ctx.sheet([h('h2', {}, 'Pick people'), h('div', { class: 'small muted' }, `${list.length} contacts. Only the ones you tick are added.`),
    h('div', { class: 'chips', style: { margin: '8px 0' } }, [['other', 'Friends'], ['family', 'Family']].map(([k, l]) => h('button', { class: `chip ${kind === k ? 'sel' : ''}`, onClick: (e) => { kind = k; e.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => c.classList.toggle('sel', c === e.currentTarget)); } }, `Add as ${l.toLowerCase()}`))),
    h('div', { class: 'list', style: { maxHeight: '50vh', overflow: 'auto', margin: '10px 0' } }, ticks.map(t => h('label', { class: 'item' }, h('input', { type: 'checkbox', disabled: t.dupe, onChange: (e) => { t.on = e.target.checked; } }), h('div', { class: 'grow' }, h('div', { class: 'name' }, t.c.name), h('div', { class: 'meta' }, t.dupe ? 'already added' : [t.c.phone, t.c.birthday ? `🎂 ${F.fmtBirthday(t.c.birthday)}` : ''].filter(Boolean).join(' · ')))))),
    h('button', { class: 'btn primary', onClick: () => { const add = ticks.filter(t => t.on).map(t => t.c); if (!add.length) return toast('Tick at least one', 'err'); ctx.update(s => add.reduce((x, c) => F.addFriend(x, { ...c, kind }), s)); box.close(); toast(`${add.length} added`); } }, 'Add ticked')]);
}

// ───────────── the friend card editor
const PAINT_DAYS = 35, CYCLE = ['', 'D', 'E', 'N', 'off', 'leave'];
const tIn = (m) => h('input', { type: 'time', class: 'sc-time', value: F.hhmm(m % 1440), step: 900 });
const tVal = (el) => { const [a, b] = String(el.value || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; };
/** A small "→ @name" under a handle field, so you see what will be saved (or that nothing usable was found). */
export const handleHint = (input) => { const hint = h('div', { class: 'tiny sc-hint' }); const upd = () => { const v = input.value.trim(), c = F.cleanHandle(v); hint.textContent = !v ? '' : c ? (c === v.replace(/^@/, '') ? '' : `→ saves as @${c}`) : 'No username found in that'; hint.classList.toggle('bad', !!v && !c); }; input.addEventListener('input', upd); upd(); return hint; };
export const phoneHint = (input) => { const hint = h('div', { class: 'tiny sc-hint' }); const upd = () => { const v = input.value.trim(), n = F.normPhone(v, cc()); hint.textContent = !v ? '' : n ? (/[٠-٩۰-۹]/.test(v) || !v.startsWith('+') ? `→ +${n}` : '') : 'Not a phone number — no call or WhatsApp button'; hint.classList.toggle('bad', !!v && !n); }; input.addEventListener('input', upd); upd(); return hint; };
export function friendSheet(f, preset = {}) {
  const s0 = S(), v = f || { kind: 'other', every: 21, sched: {}, weeklyOff: [], ...preset }, sched = { ...(v.sched || {}) }, weekly = new Set(v.weeklyOff || []); let rotaKey = v.rotaKey || '';
  const inp = (k, ph = '', type = 'text') => h('input', { type, value: k === 'birthday' ? F.fmtBirthday(v[k]) : (v[k] || ''), placeholder: ph });
  const name = inp('name', 'Name'), nick = inp('nick', 'What you call them'), phone = inp('phone', '05… or +966…', 'tel'), wa = inp('whatsapp', 'if different from phone', 'tel'), snap = inp('snap', 'username or link'), ig = inp('insta', '@username or link'), place = inp('place', 'Area / where they live (for picking spots)'), bd = inp('birthday', '14/03 or 14/03/1990');
  const kind = h('select', {}, F.FRIEND_KINDS.map(k => h('option', { value: k.id, selected: k.id === v.kind }, k.label))), every = h('input', { type: 'number', min: 0, max: 365, value: v.every ?? 21 }), notes = h('textarea', { rows: 2, placeholder: 'Food they like, allergies, what to avoid…' }, v.notes || '');
  const fav = h('input', { type: 'checkbox', checked: !!v.fav });
  const rotaBtn = h('button', { type: 'button', class: 'btn sc-rota', onClick: () => rotaPicker(rotaKey, (key) => { rotaKey = key; const p = R.person(key); if (p?.name && !name.value) name.value = R.bare(p.name); if (p && !f) kind.value = p.unit === 'nurse' ? 'nurse' : p.unit === 'gp' ? 'gp' : 'colleague'; paintRota(); paintHours(); }, name.value.split(' ')[0] || '') });
  const paintRota = () => { const n = rotaKey ? rotaName(rotaKey) : ''; rotaBtn.replaceChildren(h('span', { class: 'grow' }, rotaKey ? (n || 'Linked (not in the current roster)') : 'Not in a schedule — tap to link'), h('span', { class: 'dim' }, '›')); rotaBtn.classList.toggle('linked', !!rotaKey); };
  // shift hours for hand-entered days: defaults come from their roster (nurses D 08–20); change only if theirs differ
  const hrsRow = h('div', { class: 'sc-hours' }), hrsIn = {};
  const paintHours = () => { const rec = { ...v, rotaKey, kind: kind.value, hours: v.hours || {} }; hrsRow.replaceChildren(...['D', 'E', 'N'].map(c => { const hr = F.shiftHours(S(), rec, c) || [480, 1200]; hrsIn[c] = [tIn(hr[0]), tIn(hr[1])]; return h('label', { class: 'sc-hr' }, h('b', {}, c), hrsIn[c][0], '–', hrsIn[c][1]); })); };
  kind.addEventListener('change', paintHours);
  const start = startOfDay(new Date()), dayList = Array.from({ length: PAINT_DAYS }, (_, i) => addDays(start, i));
  const cellOf = new Map(), setCell = (k, n) => { if (n) sched[k] = n; else delete sched[k]; const b = cellOf.get(k); if (b) { b.className = `sc-paint c-${n || 'none'}`; b.lastChild.textContent = n || '·'; b.setAttribute('aria-label', `${dayLabel(fromKey(k))}: ${n || 'unknown'}`); } };
  const cells = dayList.map(d => { const k = keyOf(d), b = h('button', { type: 'button', class: `sc-paint c-${sched[k] || 'none'}`, 'aria-label': `${dayLabel(d)}: ${sched[k] || 'unknown'}`, onClick: () => setCell(k, CYCLE[(CYCLE.indexOf(sched[k] || '') + 1) % CYCLE.length]) }, h('small', {}, `${DAY_SHORT[d.getDay()][0]}${d.getDate()}`), h('b', {}, sched[k] || '·')); cellOf.set(k, b); return b; });
  const repeat = h('button', { type: 'button', class: 'btn sm', onClick: () => { const wk = dayList.slice(0, 7).map(d => sched[keyOf(d)] || ''); if (!wk.some(Boolean)) return toast('Fill the first week, then repeat it', 'err'); dayList.slice(7).forEach((d, i) => setCell(keyOf(d), wk[i % 7])); toast('First week repeated for 5 weeks'); } }, '↻ Repeat week 1');
  const clear = h('button', { type: 'button', class: 'btn sm ghost', onClick: () => dayList.forEach(d => setCell(keyOf(d), '')) }, 'Clear');
  const wk = DAY_SHORT.map((n, i) => h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: weekly.has(i), onChange: (e) => e.target.checked ? weekly.add(i) : weekly.delete(i) }), ' ' + n));
  const why = v.rotaKey ? F.dayState(s0, v, new Date()).why : '';
  const paint = h('details', { class: 'sc-paintbox', open: (!v.rotaKey && v.kind !== 'family' && v.kind !== 'other') || Object.keys(sched).length > 0 || !!why }, h('summary', {}, v.rotaKey ? 'Shifts I enter by hand' : 'Their shifts / days off', h('span', { class: 'tiny dim' }, v.rotaKey ? (why ? ` · ${why}: the schedule says nothing` : ' · used when the schedule has nothing') : ` · next ${PAINT_DAYS} days`)),
    h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Tap a day to cycle: D day · E evening · N night · off · leave. Blank = unknown.'), h('div', { class: 'sc-paints' }, cells), h('div', { class: 'row wrap', style: { gap: '6px', marginTop: '6px' } }, repeat, clear),
    h('div', { class: 'tiny dim', style: { margin: '10px 0 4px' } }, 'Shift hours'), hrsRow, h('div', { class: 'tiny dim', style: { margin: '10px 0 4px' } }, 'Always off on (weekends for most people):'), h('div', { class: 'chips' }, wk));
  const save = () => {
    if (!name.value.trim()) return toast('Give them a name', 'err');
    const b = bd.value.trim(), bp = F.parseBirthday(b); if (b && !bp) return toast('Birthday not understood — try 14/03 or 14/03/1990', 'err');
    const hours = {}; for (const c of ['D', 'E', 'N']) { const [a, z] = (hrsIn[c] || []).map(tVal), def = F.shiftHours(S(), { ...v, rotaKey, kind: kind.value, hours: {} }, c) || []; if (a != null && z != null && a !== z && (a !== def[0] || (z || 1440) % 1440 !== (def[1] || 0) % 1440)) hours[c] = [a, z === 0 ? 1440 : z]; }
    const data = { name: name.value, nick: nick.value, kind: kind.value, phone: phone.value, whatsapp: wa.value, snap: snap.value, insta: ig.value, place: place.value, birthday: bp, every: +every.value || 0, notes: notes.value, rotaKey, sched, weeklyOff: [...weekly], hours, fav: fav.checked };
    const clash = rotaKey && F.friendList(S()).find(x => x.rotaKey === rotaKey && x.id !== f?.id); if (clash) return toast(`That rota row is already ${F.shortName(clash)}'s`, 'err');
    const dropped = [[snap, 'Snapchat'], [ig, 'Instagram']].filter(([el]) => el.value.trim() && !F.cleanHandle(el.value)).map(([, l]) => l);
    ctx.update(s => f ? F.updateFriend(s, f.id, data) : F.addFriend(s, data)); box.close(); if (dropped.length) toast(`${dropped.join(' and ')}: no username found, left empty`, 'err'); else if (!f) toast(`${data.nick || data.name} added`, 'ok'); };
  const remove = () => { if (!confirm(`Remove ${f.name}?${f.rotaKey ? ' Their numbers stay on their colleague card.' : ''}`)) return; const prev = S().friends[f.id], prevC = S().contacts?.[f.rotaKey]; ctx.update(s => F.deleteFriend(s, f.id)); box.close(); toast(`${F.shortName(f)} removed`, '', { action: { label: 'Undo', run: () => ctx.update(s => { let x = ctx.revert(s, 'friends', 'friend', f.id, prev); if (f.rotaKey) x = ctx.revert(x, 'contacts', 'contact', f.rotaKey, prevC); return x; }) } }); };
  const box = ctx.sheet([h('h2', {}, f ? f.name : (v.kind === 'family' ? 'New family member' : 'New friend')), h('div', { class: 'grid2' }, field('Name', name), field('Nickname', nick)), h('div', { class: 'grid2' }, field('Type', kind), field('', h('label', { class: 'chip', style: { marginTop: '22px' } }, fav, ' ⭐ Favourite'))),
    h('div', { class: 'grid2' }, field('Phone', phone, phoneHint(phone)), field('WhatsApp', wa, phoneHint(wa))), h('div', { class: 'grid2' }, field('Snapchat', snap, handleHint(snap)), field('Instagram', ig, handleHint(ig))),
    field('Their rota row', rotaBtn), paint, field('Area', place), h('div', { class: 'grid2' }, field('Birthday', bd), field('See them every (days, 0 = off)', every)), field('Notes (only on this card, never shared)', notes),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: save }, 'Save'), f ? h('button', { class: 'btn danger', onClick: remove }, 'Remove') : null)]);
  paintRota(); paintHours();
}

// ───────────── free-days grid
const T0 = 8 * 60, T1 = 24 * 60, pct = (m) => Math.max(0, Math.min(100, (m - T0) / (T1 - T0) * 100));
/** Thin timeline at the bottom of a cell: green where they are free (08:00 → 24:00). */
const tl = (wins) => h('span', { class: 'sg-tl' }, wins.map(([a, b]) => h('i', { style: { left: `${pct(a)}%`, width: `${Math.max(4, pct(b) - pct(a))}%` } })));
const isBday = (f, d) => !!f.birthday && f.birthday.slice(-5) === keyOf(d).slice(5);
const outingOn = (s, f, d) => F.outingList(s).some(o => o.date === keyOf(d) && (!f || o.who.includes(f.id)));
const mark = (x) => x.status === 'work' ? String(x.type || 'W')[0].toUpperCase() : x.status === 'leave' ? 'L' : x.afterNight && x.status !== 'unknown' ? 'z' : '';
const stateText = (x, wins) => { const free = wins.map(win).join(', '), tm = (m) => F.hhmm(m > 1440 ? m - 1440 : m); if (x.status === 'work') return `working${x.start != null ? ` ${tm(x.start)}–${tm(x.end)}` : ''}${x.type === 'N' || x.end > 1440 ? ' (night)' : ''}${free ? `, free ${free}` : ', no free time'}`; if (x.status === 'leave') return `on leave${free ? `, free ${free}` : ''}`; if (x.status === 'off') return `${x.afterNight ? 'off after a night (sleeping first)' : 'day off'}${free ? `, free ${free}` : ''}`; return free || (x.status === 'unknown' ? (x.why ? `${x.why}: no shift info` : 'no shift info') : 'busy'); };
const freeOf = (x, wins) => wins.length ? (!x.afterNight && wins.some(w => w[1] - w[0] >= 480) ? 'all' : 'part') : x.status === 'unknown' ? 'unknown' : 'busy';
const gridDays = () => { const d = CZ.custom(S()).social.days; if (d) return d; const w = window.innerWidth; return w < 360 ? 7 : w < 520 ? 10 : w < 1000 ? 14 : 21; };   // Settings › Customise can fix it
const GRID_MAX = 25;

function gridCard(list = null) {
  const s = S(), all = list || F.friendList(s), fr = gridAll ? all : all.slice(0, GRID_MAX), start = startOfDay(new Date()), N = gridDays(), dl = Array.from({ length: N }, (_, i) => addDays(start, i));
  const me = dl.map(d => F.meState(s, d, busyOf(d))), st = fr.map(f => dl.map(d => F.dayState(s, f, d))), ost = all.slice(fr.length).map(f => dl.map(d => F.dayState(s, f, d)));
  const minMeet = F.timing().minMeet, can = (i, row) => me[i].windows.some(a => row[i].windows.some(b => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) >= minMeet));
  const meets = dl.map((d, i) => [...st, ...ost].filter(row => can(i, row)).length);
  const allFree = dl.map((_, i) => all.length && meets[i] === all.length);
  const cell = (x, wins, label, d, extra = {}) => h('button', { class: `sg-cell ${freeOf(x, wins)} ${x.status === 'work' ? 'wk' : ''} ${+d === +start ? 'today' : ''}`, title: label, 'aria-label': label, onClick: () => daySheet(d, list) }, h('b', {}, mark(x)), extra.bday ? h('em', { class: 'sg-badge' }, '🎂') : extra.outing ? h('em', { class: 'sg-badge dot' }) : null, wins.length ? tl(wins) : null);
  return h('div', { class: 'card sg' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Who is free', h('span', { class: 'tiny dim sg-span' }, ` · next ${N} days`)), h('button', { class: 'btn sm', onClick: () => findSheet() }, '🔎 Find a day')),
    !R.has() ? h('div', { class: 'tiny dim' }, 'No roster from Mandarin yet: your own shifts and your colleagues’ come from there. Friends with days off entered by hand still show.') : null,
    h('div', { class: 'sg-wrap', style: { '--n': N } },
      h('div', { class: 'sg-row sg-head' }, h('span', { class: 'sg-name' }), dl.map((d, i) => h('button', { class: `sg-day ${[5, 6].includes(d.getDay()) ? 'we' : ''} ${allFree[i] ? 'best' : ''} ${i === 0 ? 'today' : ''}`, 'aria-label': `${dayLabel(d)}${i === 0 ? ' (today)' : ''}: ${meets[i]} of ${all.length} can meet you`, onClick: () => daySheet(d, list) }, h('small', {}, DAY_SHORT[d.getDay()][0]), h('span', { class: 'sg-dn' }, d.getDate()), h('i', { class: `sg-n ${meets[i] ? '' : 'zero'}` }, meets[i])))),
      h('div', { class: 'sg-row me' }, h('span', { class: 'sg-name' }, 'You'), dl.map((d, i) => cell(me[i], me[i].windows, `You, ${dayLabel(d)}: ${stateText(me[i], me[i].windows)}`, d, { outing: outingOn(s, null, d) }))),
      ...fr.map((f, r) => { const off = st[r].filter(x => x.free === 'all').length; return h('div', { class: 'sg-row' }, h('button', { class: 'sg-name', title: `${f.name}: ${off} whole days off in the next ${N} days`, onClick: () => friendSheet(f) }, F.shortName(f), h('small', {}, off ? `${off} off` : st[r].every(x => x.free === 'unknown') ? (f.rotaKey ? 'no info' : 'not linked') : '')),
        dl.map((d, i) => cell(st[r][i], st[r][i].windows, `${F.shortName(f)}, ${dayLabel(d)}: ${stateText(st[r][i], st[r][i].windows)}${isBday(f, d) ? ' · birthday' : ''}`, d, { bday: isBday(f, d), outing: outingOn(s, f, d) }))); })),
    all.length > GRID_MAX ? h('button', { class: 'btn sm ghost', style: { marginTop: '4px' }, onClick: () => { gridAll = !gridAll; ctx.render(); } }, gridAll ? 'Show fewer' : `Show all ${all.length}`) : null,
    h('div', { class: 'sg-key' }, [['all', '', 'day off'], ['part', '', 'partly free'], ['part wk', 'D', 'working · letter = shift'], ['busy wk', 'N', 'working, no gap'], ['unknown', '', 'no info']].map(([c, t, l]) => h('span', { class: 'sg-k' }, h('i', { class: `sg-cell ${c}` }, h('b', {}, t)), l)),
      h('span', { class: 'sg-k' }, h('i', { class: 'sg-cell part' }, h('b', {}, 'z')), 'sleeping after a night'), h('span', { class: 'sg-k' }, h('i', { class: 'sg-cell part' }, h('span', { class: 'sg-tl' }, h('i', { style: { left: '60%', width: '40%' } }))), 'green line = free hours 08–24'), h('span', { class: 'sg-k' }, h('i', { class: 'sg-n' }, '3'), 'can meet you that day')));
}

/** One day, everyone on a 08:00–24:00 line: red = working, green = free, orange band = when you are all free (only on the rows of those who are). */
export function daySheet(d, people = null) {
  const s = S(), list = people || F.friendList(s), me = F.meState(s, d, busyOf(d)), st = list.map(f => ({ f, x: F.dayState(s, f, d) }));
  const common = F.commonFree(s, list, { from: d, days: 1, busyOf, minMin: 60 })[0], sn = F.shortNames(list), names = new Map(list.map((f, i) => [f, sn[i]])), nm = (f) => names.get(f) || F.shortName(f);
  const band = common?.window ? () => h('i', { class: 'dl-common', style: { left: `${pct(common.window[0])}%`, width: `${pct(common.window[1]) - pct(common.window[0])}%` } }) : null;
  // today's shift up to midnight, plus last night's shift still running this morning (never tomorrow morning's)
  const work = (x) => { const out = []; if (x.prevTail) out.push([0, x.prevTail]); if (x.status === 'work' && x.start != null) out.push([x.start, Math.min(x.end, 1440)]); return out.filter(([a, b]) => pct(b) > pct(a)); };
  const line = (label, x, sub, inBand) => h('div', { class: `dl-row ${inBand ? 'in' : ''}` }, h('div', { class: 'dl-name' }, h('b', {}, label), h('small', {}, sub)), h('div', { class: 'dl-bar' }, band && inBand ? band() : null, ...work(x).map(([a, b]) => h('i', { class: 'dl-work', style: { left: `${pct(a)}%`, width: `${Math.max(1, pct(b) - pct(a))}%` } })), ...x.windows.map(([a, b]) => h('i', { class: 'dl-free', style: { left: `${pct(a)}%`, width: `${pct(b) - pct(a)}%` } }))));
  const r = rel(d), past = common && !common.window && +startOfDay(d) === +startOfDay(new Date());
  const ev = (busyOf(d) || []).length, outs = F.outingList(s).filter(o => o.date === keyOf(d));
  ctx.sheet([h('h2', {}, `${dayLabel(d)}${r ? ` · ${r}` : ''}`),
    common?.window ? h('div', { class: 'cr-key soon' }, h('div', { class: 'grow' }, h('b', {}, common.all ? `Everyone free ${win(common.window)}` : `${common.free.length} of ${list.length} free with you ${win(common.window)}`), common.missing.length || common.unknown.length ? h('div', { class: 'tiny dim' }, [common.missing.length ? `not free: ${common.missing.map(nm).join(', ')}` : '', common.unknown.length ? `no info: ${common.unknown.map(nm).join(', ')}` : ''].filter(Boolean).join(' · ')) : null), list.length && common.free.length ? h('button', { class: 'btn sm', onClick: () => { closeSheets(); inviteSheet(common.free.filter(f => S().friends?.[f.id]).map(f => f.id), { date: d, key: keyOf(d), window: common.window, who: common.free.map(f => f.id) }); } }, 'Invite') : null)
      : h('div', { class: 'small muted' }, past ? 'Nothing left today that suits you all.' : 'No time when you are all free that day.'),
    outs.length ? h('div', { class: 'list', style: { margin: '8px 0' } }, outs.map(o => h('div', { class: 'item clickable', onClick: () => { closeSheets(); outingSheet(o); } }, h('div', { class: 'grow' }, h('div', { class: 'name' }, `${o.planned ? '📅' : '✓'} ${o.what || 'Meet-up'}${o.start != null ? ` · ${F.hhmm(o.start)}` : ''}`), h('div', { class: 'meta' }, o.who.map(nameOf).join(', ')))))) : null,
    ev ? h('div', { class: 'tiny dim' }, `${ev} event${ev > 1 ? 's' : ''} in your calendar already taken out of your free time.`) : null,
    h('div', { class: 'dl' }, h('div', { class: 'dl-axis' }, h('span', {}), h('div', {}, ['08', '12', '16', '20', '24'].map(t => h('small', {}, t)))), line('You', me, stateText(me, me.windows), !!common?.me && !!common?.window), st.map(({ f, x }) => line(nm(f), x, stateText(x, x.windows), !!common?.free.includes(f))))]);
}

// ───────────── find a day for any group of people in the app
let pick = new Set(), pickMin = 120, pickDays = 21, pickMe = true;
export function findSheet(preset) {
  if (preset) pick = new Set(preset);
  const wrap = h('div', {}); ctx.sheet([wrap]); let q = '';
  const everyone = () => { const s = S(), seen = new Set(), out = []; for (const f of F.friendList(s)) { out.push({ key: f.id, name: F.shortName(f), full: f.name, group: f.kind === 'family' ? 'Family' : 'Friends', rec: f }); if (f.rotaKey) seen.add(f.rotaKey); }
    for (const p of R.people()) { if (seen.has(p.key)) continue; out.push({ key: p.key, name: R.bare(p.name), full: p.name, group: p.group, rec: null }); } return out; };
  const paint = () => {
    const all = everyone(), byKey = new Map(all.map(x => [x.key, x])), chosen = [...pick].map(k => byKey.get(k)).filter(Boolean), s = S();
    const people = chosen.map(c => c.rec || F.personRecord(s, c.key, c.full)), labels = F.shortNames(people), lbl = (p) => labels[people.indexOf(p)] || F.shortName(p);
    const res = people.length ? F.commonFree(s, people, { days: pickDays, withMe: pickMe, minMin: pickMin, busyOf }) : [];
    const good = res.filter(r => r.all), near = res.filter(r => !r.all && r.window && r.missing.length + r.unknown.length === 1 && people.length > 1).slice(0, 5), unknownAll = chosen.filter((c, i) => res.length && res.every(r => r.unknown.includes(people[i])));
    const matches = q ? all.filter(x => !pick.has(x.key) && x.full.toLowerCase().includes(q.toLowerCase())).slice(0, 12) : [];
    const groups = ['Friends', 'Family', 'GPs', 'Specialists', 'Nurses'].map(g => [g, all.filter(x => x.group === g && !pick.has(x.key))]).filter(([, l]) => l.length);
    const saved = F.groupList(s).filter(g => g.members.length);
    const search = h('input', { type: 'search', class: 'dir-search', placeholder: 'Search anyone: friends, family, colleagues', value: q, onInput: (e) => { q = e.target.value; paint(); const i = wrap.querySelector('.dir-search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); } });
    const chip = (x, on) => h('button', { class: `chip ${on ? 'sel' : ''}`, 'aria-pressed': on ? 'true' : 'false', onClick: () => { on ? pick.delete(x.key) : pick.add(x.key); paint(); } }, on ? `${x.name} ✕` : x.name);
    const dayRow = (r) => h('button', { class: `fd-day ${r.all ? 'all' : ''} ${r.weekend ? 'we' : ''}`, onClick: () => daySheet(r.date, people) }, h('div', { class: 'fd-date' }, h('b', {}, `${DAY_SHORT[r.date.getDay()]} ${r.date.getDate()}`), h('small', {}, rel(r.date) || MONTHS[r.date.getMonth()].slice(0, 3))),
      h('div', { class: 'grow' }, h('div', {}, win(r.window), r.dayLong ? h('span', { class: 'chip sel fd-allday' }, 'all day') : null), !r.all ? h('div', { class: 'tiny dim' }, [r.missing.length ? `not free: ${r.missing.map(lbl).join(', ')}` : '', r.unknown.length ? `no info: ${r.unknown.map(lbl).join(', ')}` : ''].filter(Boolean).join(' · ')) : null), h('span', { class: 'fd-go' }, '›'));
    const end = F.scheduleEnd(), last = addDays(startOfDay(new Date()), pickDays - 1), short = end && end < last;
    const nonFriends = chosen.filter(c => !c.rec);
    wrap.replaceChildren(h('h2', {}, 'Find a day'), h('div', { class: 'small muted' }, 'Pick anyone: friends, family, colleagues, nurses. You get the days you are all free.'),
      saved.length ? h('div', { class: 'chips', style: { margin: '8px 0' } }, h('span', { class: 'tiny dim' }, 'Groups:'), saved.map(g => h('button', { class: 'chip', onClick: () => { for (const m of g.members) pick.add(m); paint(); } }, `${g.icon || '👥'} ${g.name}`))) : null,
      chosen.length ? h('div', { class: 'chips', style: { margin: '8px 0' } }, chosen.map(x => chip(x, true)), h('button', { class: 'chip ghost', onClick: () => { pick.clear(); paint(); } }, 'Clear')) : null,
      search, matches.length ? h('div', { class: 'chips', style: { margin: '6px 0' } }, matches.map(x => chip(x, false))) : null,
      !q ? groups.map(([g, l]) => h('details', { class: 'fd-group', open: g === 'Friends' ? '' : null }, h('summary', { class: 'tiny dim' }, `${g} (${l.length})`), h('div', { class: 'chips' }, l.slice(0, 80).map(x => chip(x, false))))) : null,
      h('div', { class: 'row wrap', style: { margin: '10px 0 4px', gap: '6px' } }, h('div', { class: 'chips' }, [[90, '1½h'], [120, '2h'], [240, '4h'], [480, 'all day']].map(([m, l]) => h('button', { class: `chip ${pickMin === m ? 'sel' : ''}`, onClick: () => { pickMin = m; paint(); } }, l))), h('div', { class: 'chips' }, [[14, '2 wks'], [21, '3 wks'], [42, '6 wks']].map(([n, l]) => h('button', { class: `chip ${pickDays === n ? 'sel' : ''}`, onClick: () => { pickDays = n; paint(); } }, l))),
        h('label', { class: 'chip' }, h('input', { type: 'checkbox', checked: pickMe, onChange: (e) => { pickMe = e.target.checked; paint(); } }), ' include me')),
      short ? h('div', { class: 'tiny dim fd-note' }, `The roster only goes to ${dayLabel(end)} — later days are unknown, so they cannot show up here.`) : null,
      !chosen.length ? h('div', { class: 'empty small' }, 'Pick at least one person.') : h('div', { class: 'fd-res' },
        unknownAll.length ? h('div', { class: 'lw-flag warn' }, `No schedule for ${unknownAll.map(x => x.name).join(', ')}: add their shifts or days off on their card, or they can never count as free.`) : null,
        h('div', { class: 'title' }, good.length ? `${good.length} day${good.length > 1 ? 's' : ''} you are all free` : 'No day where everyone is free'),
        (() => { const whole = good.filter(r => r.dayLong), part = good.filter(r => !r.dayLong); return [whole.length && part.length ? h('div', { class: 'tiny dim', style: { margin: '6px 0 2px' } }, `Whole day (${whole.length})`) : null, whole.map(dayRow), whole.length && part.length ? h('div', { class: 'tiny dim', style: { margin: '8px 0 2px' } }, `Part of the day (${part.length})`) : null, part.map(dayRow)]; })(),
        near.length ? [h('div', { class: 'title', style: { marginTop: '10px' } }, 'All but one'), near.map(dayRow)] : null,
        good.length ? (nonFriends.length ? h('div', { class: 'fd-poll-off' }, h('button', { class: 'btn', disabled: true }, 'Make a poll from the best days'), h('div', { class: 'tiny dim' }, `Polls are for friends — add ${nonFriends.map(x => x.name.split(' ')[0]).join(', ')} as a friend first (People › their card › Make a friend).`))
          : h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary grow', onClick: () => { closeSheets(); ctx.update(st => X.savePoll(st, { title: 'Meet up', who: chosen.map(c => c.key), slots: good.slice(0, 4).map(r => ({ date: r.key, start: r.window[0], end: Math.min(r.window[1], r.window[0] + 180) })) })); toast('Poll created in Plans', 'ok'); ctx.go('plans'); } }, 'Make a poll from the best days'),
            chosen.length > 1 ? h('button', { class: 'btn', onClick: () => { const n = prompt('Name this group', 'Work friends'); if (n) { ctx.update(st => F.saveGroup(st, { name: n, members: chosen.map(c => c.key) })); toast(`Group “${n}” saved`, 'ok'); paint(); } } }, 'Save as a group') : null)) : null));
  };
  paint();
}

// ───────────── best times and invitations
export function meetCard(m) {
  const names = m.who.map(nameOf), busy = m.busy || m.missing, unk = m.unknown || [], r = rel(m.date);
  return h('div', { class: 'meet' }, h('div', { class: 'meet-when' }, h('b', {}, dayLabel(m.date)), r ? h('span', { class: 'dim tiny' }, r) : null), h('div', { class: 'grow' }, h('div', { class: 'name' }, win(m.window), m.dayLong ? ' · all day' : ''),
    h('div', { class: 'tiny dim' }, names.join(', ')), busy.length || unk.length ? h('div', { class: 'tiny dim meet-miss' }, [busy.length ? `not free: ${busy.map(nameOf).join(', ')}` : '', unk.length ? `no info: ${unk.map(nameOf).join(', ')}` : ''].filter(Boolean).join(' · ')) : null), h('button', { class: 'btn sm primary', onClick: () => inviteSheet(m.who, m) }, 'Invite'));
}
function bestCard(n = 5, daysAhead = 21) {
  const s = S(), list = F.meetups(s, { busyOf, days: daysAhead }).slice(0, n);
  return h('div', { class: 'card' }, h('div', { class: 'title' }, 'Best times to meet'), list.length ? list.map(m => meetCard(m)) : h('div', { class: 'small muted' }, 'No overlap yet. Link friends to their rota row, or enter their days off, and the best slots appear here.'));
}
function nudgeCard() {
  const s = S(), od = F.friendList(s).map(f => ({ f, d: F.overdue(s, f) })).filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 4), bd = F.birthdays(s, new Date(), 21).slice(0, 4), tn = X.treatNudge(s);
  if (!od.length && !bd.length && !tn?.due) return null;
  return h('div', { class: 'card' }, h('div', { class: 'title' }, 'Don’t let it slip'),
    bd.map(b => h('div', { class: 'row nudge' }, h('span', { class: 'ch-ic sm' }, '🎂'), h('div', { class: 'grow' }, h('div', { class: 'name' }, b.name, b.age ? h('span', { class: 'dim' }, ` turns ${b.age}`) : null), h('div', { class: 'tiny dim' }, b.inDays === 0 ? 'Birthday today' : `Birthday ${dayLabel(b.date)} · in ${days(b.inDays)}`)),
      b.friend ? reachMini(b.friend) : null, b.friend ? h('button', { class: 'btn sm', onClick: () => inviteSheet([b.friend.id], null, `Surprise for ${b.name}’s birthday`) }, 'Plan') : h('button', { class: 'btn sm ghost', onClick: () => ctx.personSheet(b.key) }, 'Card'))),
    od.map(({ f, d }) => h('div', { class: 'row nudge' }, av(f), h('div', { class: 'grow' }, h('div', { class: 'name' }, F.shortName(f)), h('div', { class: 'tiny dim' }, `${F.lastSeen(s, f.id) ? `last seen ${relDay(fromKey(F.lastSeen(s, f.id)))}` : 'not seen yet'} · ${d > 60 ? 'long overdue' : `${days(d)} overdue`} (every ${f.every}d)`)), reachMini(f), h('button', { class: 'btn sm', onClick: () => inviteSheet([f.id]) }, 'Invite'))),
    tn?.due ? h('div', { class: 'row nudge' }, h('span', { class: 'ch-ic sm' }, '🍰'), h('div', { class: 'grow' }, h('div', { class: 'name' }, 'Treat for the team?'), h('div', { class: 'tiny dim' }, `${days(tn.since)} since the last one (usually every ${tn.usual})`)), h('button', { class: 'btn sm', onClick: () => ctx.go('plans') }, 'Log')) : null);
}

export function inviteSheet(ids, meet = null, what = '') {
  const s = S(), fr = F.friendList(s), sel = new Set(ids || []); let choice = meet ? [meet] : [], idea = what, touched = false;
  const body = h('div'), msgBox = h('textarea', { rows: 5, class: 'inp', 'aria-label': 'Message', onInput: () => { touched = true; } }), calc = () => (meet ? [] : F.meetups(S(), { ids: [...sel], busyOf, days: 21 }).filter(m => m.all || sel.size === 1).slice(0, 4));
  const ideasFor = () => { const c = choice[0]; const wish = X.wishList(S()).filter(w => !w.with?.length || w.with.some(id => sel.has(id))).map(w => ({ name: w.name, icon: X.wishIcon(w.kind) })); return F.ideas({ window: c?.window, size: sel.size + 1, date: c?.date, wish, birthday: F.birthdays(S(), new Date(), 14).find(b => b.friend && sel.has(b.friend.id))?.name }); };
  // your own wording is never thrown away: once you have typed, only “Fresh text” rewrites it
  const fmtDay = (d) => `${DAY_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
  const rebuildMsg = (force = false) => { if (touched && !force) return; touched = false; msgBox.value = choice.length ? F.inviteText({ names: [...sel].map(nameOf), choices: choice, what: idea, fmtDay, fmtT: F.hhmm }) : `Hey ${[...sel].map(nameOf).join(', ') || 'everyone'}! ${idea ? idea + '? ' : ''}When are you free?`; };
  const saveBtn = h('button', { class: 'btn primary grow', onClick: async () => {
    const c = choice[0]; if (!c || !sel.size) return toast(sel.size ? 'Tick a time first' : 'Pick at least one friend', 'err');
    const who = [...sel], k = c.key || keyOf(c.date), title = `${idea || 'Meet up'} with ${who.map(nameOf).join(', ')}`;
    ctx.update(x => F.logOuting(x, { date: k, who, what: idea, planned: true, start: c.window[0] })); box.close();
    try { const r = await ctx.addEvent({ title, date: k, start: c.window[0], minutes: Math.min(120, c.window[1] - c.window[0]) });
      toast(r === 'queued' ? 'Planned: it goes into your calendar when you are back online' : r === 'cal' ? 'Planned and added to your calendar' : 'Planned (sign in to Google to put it on your calendar)', 'ok'); }
    catch { toast('Planned in Clementine (it could not be added to your calendar)', 'err'); } } }, 'Save as planned');
  const syncSave = () => { saveBtn.disabled = !choice.length || !sel.size; };
  const paint = () => {
    const opts = meet ? [meet] : calc(); if (!meet && !choice.length) choice = opts.slice(0, 1);
    const ideas = ideasFor(), groups = F.groupList(S()).filter(g => g.members.length);
    body.replaceChildren(
      groups.length ? h('div', { class: 'chips', style: { marginBottom: '6px' } }, h('span', { class: 'tiny dim' }, 'Groups:'), groups.map(g => h('button', { class: 'chip', onClick: () => { for (const m of g.members) sel.add(m); if (!meet) choice = []; paint(); } }, `${g.icon || '👥'} ${g.name}`))) : null,
      fr.length ? h('div', { class: 'chips' }, fr.map(f => h('label', { class: `chip ${sel.has(f.id) ? 'sel' : ''}` }, h('input', { type: 'checkbox', checked: sel.has(f.id), style: { display: 'none' }, onChange: (e) => { e.target.checked ? sel.add(f.id) : sel.delete(f.id); if (!meet) choice = []; paint(); } }), F.shortName(f)))) : h('div', { class: 'small muted' }, 'Add some friends first (People tab).'),
      meet ? h('div', { class: 'small', style: { margin: '10px 0' } }, `${dayLabel(meet.date)} · ${win(meet.window)}`) : [h('div', { class: 'tiny dim', style: { margin: '10px 0 4px' } }, 'Times that suit everyone selected (tick the ones to offer)'),
        opts.length ? opts.map(o => h('label', { class: 'item' }, h('input', { type: 'checkbox', checked: choice.some(c => c.key === o.key && c.window[0] === o.window[0]), onChange: (e) => { choice = e.target.checked ? [...choice, o] : choice.filter(c => c !== o && !(c.key === o.key && c.window[0] === o.window[0])); rebuildMsg(); syncSave(); } }), h('div', { class: 'grow' }, h('div', { class: 'name' }, dayLabel(o.date), ' · ', win(o.window)), h('div', { class: 'tiny dim' }, o.who.map(nameOf).join(', '))))) : h('div', { class: 'small muted' }, sel.size ? 'No time when you are all free in the next 3 weeks. Try Find a day, or a poll.' : 'Pick at least one friend.')],
      h('div', { class: 'tiny dim', style: { margin: '10px 0 4px' } }, 'What to do'), h('div', { class: 'chips' }, ideas.map(i => h('button', { class: `chip ${idea === i.title ? 'sel' : ''}`, title: i.why, onClick: () => { idea = idea === i.title ? '' : i.title; paint(); if (touched) toast('Your own text is kept — tap “Fresh text” to rewrite it'); } }, `${i.icon} ${i.title}`))), idea ? h('div', { class: 'tiny dim' }, ideas.find(i => i.title === idea)?.why || '') : null,
      h('div', { style: { height: '10px' } }), msgBox,
      h('div', { class: 'row wrap', style: { marginTop: '6px', gap: '6px' } }, h('button', { class: 'btn sm ghost', onClick: () => rebuildMsg(true) }, '↺ Fresh text'), h('span', { class: 'grow' }), h('button', { class: 'btn sm', onClick: async () => { try { await navigator.clipboard.writeText(msgBox.value); toast('Message copied'); } catch { msgBox.select(); toast('Select and copy the message', 'err'); } } }, 'Copy')),
      sel.size ? h('div', { class: 'sc-walist' }, [...sel].map(id => { const f = S().friends[id]; if (!f) return null; const u = F.waWith(f, msgBox.value, cc()); return u ? h('a', { class: 'btn sc-wa', href: u, target: '_blank', rel: 'noopener', title: `WhatsApp ${f.name}`, onClick: (e) => { e.currentTarget.href = F.waWith(f, msgBox.value, cc()); } }, h('span', {}, '💬'), h('span', { class: 'sc-wa-n' }, F.shortName(f))) : h('span', { class: 'btn sc-wa off', title: 'No usable number saved' }, h('span', { class: 'sc-wa-n' }, F.shortName(f)), h('small', {}, 'no number')); })) : null,
      h('div', { class: 'row wrap', style: { marginTop: '8px' } }, saveBtn));
    rebuildMsg(); syncSave();
  };
  const box = ctx.sheet([h('h2', {}, 'Plan a meet-up'), body]); paint();
}

// ───────────── logging
export function outingSheet(o, preset = {}) {
  const s = S(), fr = F.friendList(s), who = new Set(o?.who || preset.who || []), date = h('input', { type: 'date', value: o?.date || keyOf(new Date()) }), what = h('input', { value: o?.what || preset.what || '', placeholder: 'Dinner, padel, coffee…' }), where = h('input', { value: o?.where || preset.where || '', placeholder: 'Where' }), rating = h('select', {}, [0, 1, 2, 3, 4, 5].map(n => h('option', { value: n, selected: n === (o?.rating || 0) }, n ? '★'.repeat(n) : 'No rating'))), notes = h('textarea', { rows: 2 }, o?.notes || '');
  const time = h('input', { type: 'time', value: o?.start != null ? F.hhmm(o.start) : '' });
  const save = (asHappened = false) => {
    if (!who.size && !what.value.trim()) return toast('Pick who was there or say what you did', 'err');
    const t = new Date(), future = date.value > keyOf(t), [hh, mm] = time.value.split(':').map(Number), start = time.value ? hh * 60 + mm : null;
    const stillAhead = !asHappened && !!o?.planned && date.value === o.date && !F.outingDue({ ...o, start }, t);   // editing a plan for later today keeps it a plan
    ctx.update(x => F.logOuting(x, { id: o?.id, date: date.value, who: [...who], what: what.value, where: where.value, rating: future ? 0 : +rating.value, notes: notes.value, planned: future || stillAhead, start, eventId: o?.eventId }, t)); box.close();
    if (future) toast('That date is ahead, so it is saved as planned'); else if (o?.planned && !stillAhead) toast('Logged — last-seen dates updated', 'ok');
  };
  const del = () => { const prev = S().outings[o.id]; ctx.update(x => F.deleteOuting(x, o.id)); box.close(); toast('Outing deleted', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'outings', 'outing', o.id, prev)) } }); };
  const box = ctx.sheet([h('h2', {}, o ? (o.planned ? 'Planned meet-up' : 'Edit outing') : 'Log an outing'), fr.length ? h('div', { class: 'chips' }, fr.map(f => h('label', { class: `chip ${who.has(f.id) ? 'sel' : ''}` }, h('input', { type: 'checkbox', checked: who.has(f.id), style: { display: 'none' }, onChange: (e) => { e.target.checked ? who.add(f.id) : who.delete(f.id); e.target.parentElement.classList.toggle('sel', e.target.checked); } }), F.shortName(f)))) : h('div', { class: 'small muted' }, 'No friends yet — you can still log what you did.'),
    h('div', { class: 'grid2' }, field('Date', date), field('Time (optional)', time)), field('What', what), field('Where', where), field('How was it', rating), field('Notes', notes),
    h('div', { class: 'row wrap' }, o?.planned && F.outingDue(o) ? h('button', { class: 'btn primary grow', onClick: () => save(true) }, 'Yes, it happened') : h('button', { class: 'btn primary grow', onClick: () => save() }, 'Save'), o ? h('button', { class: 'btn danger', onClick: del }, o.planned && F.outingDue(o) ? 'It didn’t happen' : 'Delete') : null)]);
}

// ───────────── screens
export function friendCard(f) {
  const s = S(), next = F.meetups(s, { ids: [f.id], busyOf, days: 21 })[0], ls = F.lastSeen(s, f.id), od = F.overdue(s, f), kindLabel = F.FRIEND_KINDS.find(k => k.id === f.kind)?.label;
  const st = F.dayState(s, f, new Date()), relink = () => rotaPicker(f.rotaKey, (key) => { const clash = key && F.friendList(S()).find(x => x.rotaKey === key && x.id !== f.id); if (clash) return toast(`That rota row is already ${F.shortName(clash)}'s`, 'err'); ctx.update(x => F.updateFriend(x, f.id, { rotaKey: key })); toast(key ? `${F.shortName(f)} linked to ${rotaName(key)}` : `${F.shortName(f)} unlinked`); }, f.name.split(' ')[0]);
  const manual = Object.keys(f.sched || {}).length > 0 || (f.weeklyOff || []).length > 0, b = f.birthday ? F.birthdays({ friends: { [f.id]: f } }, new Date(), 400)[0] : null;
  return h('div', { class: 'card friend' }, h('div', { class: 'row' }, av(f), h('div', { class: 'grow' }, h('div', { class: 'name' }, f.nick && f.nick !== f.name ? `${f.nick} ` : '', f.nick && f.nick !== f.name ? h('span', { class: 'dim small' }, f.name) : f.name, f.fav ? ' ⭐' : ''), h('div', { class: 'tiny dim' }, [kindLabel, f.place, f.rotaKey ? `${R.UNIT_LABEL[R.unitOf(f.rotaKey)] || 'linked'} rota` : '', ls ? `seen ${relDay(fromKey(ls))}` : '', b ? `🎂 ${F.fmtBirthday(f.birthday)}${b.inDays === 0 ? ' (today!)' : b.inDays === 1 ? ' (tomorrow)' : b.inDays <= 30 ? ` (in ${days(b.inDays)})` : ''}` : ''].filter(Boolean).join(' · ')), f.notes ? h('div', { class: 'tiny fr-note' }, f.notes) : null), h('button', { class: 'btn sm ghost', 'aria-label': `Edit ${f.name}`, onClick: () => friendSheet(f) }, '⋯')),
    reach(f, ''),
    st.why && st.free === 'unknown' ? h('button', { class: 'chip pull', onClick: () => friendSheet(f) }, `${st.why}: not in the schedule — enter shifts`) : null,
    !f.rotaKey && R.has() && ['gp', 'nurse', 'colleague'].includes(f.kind) && !manual ? h('button', { class: 'chip warn sc-link', onClick: relink }, 'Not linked to the roster — link') : null,
    h('div', { class: 'row wrap fr-foot' }, next ? h('span', { class: 'chip sel' }, `Free together: ${dayLabel(next.date)} ${win(next.window)}`) : h('span', { class: 'chip' }, f.rotaKey || manual ? 'No shared time found' : 'No shift info yet'), od ? h('span', { class: 'chip late' }, od > 60 ? 'long overdue' : `${od}d overdue`) : null, h('button', { class: 'btn sm grow', onClick: () => inviteSheet([f.id]) }, 'Invite')));
}
const FRIENDS_PAGE = 40;
export function friendsList(list) {
  const shown = showAllFriends ? list : list.slice(0, FRIENDS_PAGE);
  return [...shown.map(f => safe(f.name, () => friendCard(f))), list.length > shown.length ? h('button', { class: 'btn ghost', onClick: () => { showAllFriends = true; ctx.render(); } }, `Show all ${list.length}`) : null];
}

/** Today: what is coming, who you could see, what is waiting on you. */
export function renderToday() {
  freshBusy();
  const s = S(), now = new Date(), fr = F.friendList(s), up = HUB.upcoming(s, now), due = F.outingList(s).filter(o => F.outingDue(o, now));
  const out = [h('h1', {}, 'Today')];
  if (!fr.length && !Object.keys(s.contacts || {}).length) out.push(h('div', { class: 'card hero' }, h('div', { class: 'eyebrow' }, 'Welcome to Clementine'), h('div', { class: 'title' }, 'Your people, and when you can see them'),
    h('p', { class: 'small muted' }, 'Clementine keeps every contact card (friends, family, colleagues, nurses) and works out who is free around your shifts. Who works when comes from Mandarin; your friends come over from Citrus the first time you sign in.'),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: () => friendSheet(null) }, '+ Add a friend'), h('button', { class: 'btn grow', onClick: () => friendSheet(null, { kind: 'family', every: 7 }) }, '+ Family'), contactsButton(), ctx.signedIn() ? null : h('button', { class: 'btn grow', onClick: () => ctx.go('more') }, 'Sign in with Google'))));
  if (due.length) out.push(h('div', { class: 'card warn' }, h('div', { class: 'title' }, 'Did these happen?'), due.slice(0, 4).map(o => h('div', { class: 'row nudge' }, h('span', { class: 'ch-ic sm' }, '📅'), h('div', { class: 'grow' }, h('div', { class: 'name' }, o.what || 'Meet-up'), h('div', { class: 'tiny dim' }, `${relDay(fromKey(o.date))}${o.start != null ? ` ${F.hhmm(o.start)}` : ''} · ${o.who.map(nameOf).join(', ') || 'solo'}`)),
    h('button', { class: 'btn sm primary', onClick: () => { ctx.update(x => F.logOuting(x, { ...o, planned: false })); toast('Logged — last-seen dates updated', 'ok'); } }, 'Yes'), h('button', { class: 'btn sm ghost', onClick: () => outingSheet(o) }, 'Edit')))));
  // tonight / today: who is free with you
  const today = startOfDay(now), tw = F.freeWith(s, today, { busy: busyOf(today), now }), me = F.meState(s, today, busyOf(today)), mineLeft = F.clipToNow(me.windows, today, now);
  if (fr.length) out.push(h('div', { class: 'card hero' }, h('div', { class: 'eyebrow' }, `${DAY_NAMES[now.getDay()]} · ${me.status === 'work' ? `you work ${F.hhmm(me.start % 1440)}–${F.hhmm(me.end % 1440)}` : me.status === 'off' ? (me.afterNight ? 'off after a night' : 'your day off') : me.status === 'leave' ? 'on leave' : 'no rota for today'}`),
    h('div', { class: 'title' }, !mineLeft.length ? 'No free time left today' : tw.length ? `Free with you today: ${tw.slice(0, 4).map(x => F.shortName(x.f)).join(', ')}${tw.length > 4 ? ` +${tw.length - 4}` : ''}` : `You are free ${mineLeft.map(win).join(', ')}`),
    tw.length ? h('div', { class: 'list' }, tw.slice(0, 5).map(x => h('div', { class: 'row nudge' }, av(x.f), h('div', { class: 'grow' }, h('div', { class: 'name' }, F.shortName(x.f)), h('div', { class: 'tiny dim' }, `${win(x.window)}${x.overdue ? ` · ${x.overdue}d overdue` : ''}`)), reachMini(x.f), h('button', { class: 'btn sm', onClick: () => inviteSheet([x.f.id], { date: today, key: keyOf(today), window: x.window, who: [x.f.id] }) }, 'Invite')))) : mineLeft.length ? h('div', { class: 'small muted' }, 'None of your friends is free at the same time today.') : null));
  if (up.length) out.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Coming up'), h('button', { class: 'btn sm ghost', onClick: () => ctx.go('outings') }, 'All')), up.slice(0, 4).map(o => h('div', { class: 'item clickable', onClick: () => outingSheet(o) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, o.what || 'Meet-up'), h('div', { class: 'meta' }, `${relDay(fromKey(o.date))}${o.start != null ? ` ${F.hhmm(o.start)}` : ''} · ${o.who.map(nameOf).join(', ')}`))))));
  out.push(safe('Reminders', nudgeCard));
  const open = X.pollList(s).filter(p => p.status === 'open');
  if (open.length) out.push(h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Open polls'), h('button', { class: 'btn sm ghost', onClick: () => ctx.go('plans') }, 'Plans')), open.slice(0, 3).map(p => { const r = X.pollResult(p); return h('div', { class: 'row small', style: { padding: '4px 0' } }, h('b', { class: 'grow' }, p.title), h('span', { class: `chip ${r.everyone ? 'sel' : ''}` }, r.everyone ? 'everyone can' : `${r.answered.length}/${p.who.length} answered`)); })));
  if (fr.length) out.push(safe('Best times', () => bestCard(3, 10)));
  out.push(h('div', { class: 'row wrap' }, h('button', { class: 'btn grow', onClick: () => inviteSheet([]) }, '💬 Plan a meet-up'), h('button', { class: 'btn grow', onClick: () => outingSheet(null) }, '📝 Log an outing'), h('button', { class: 'btn grow', onClick: () => findSheet() }, '🔎 Find a day')));
  return out;
}

/** Free: the grid of who is free when, and the best times. */
export function renderFree() {
  freshBusy();
  const s = S(), fr = F.friendList(s), segs = [['grid', 'Friends'], ['family', 'Family'], ['work', 'Colleagues']];
  const list = freeSeg === 'family' ? fr.filter(f => f.kind === 'family') : freeSeg === 'work' ? fr.filter(f => ['gp', 'nurse', 'colleague'].includes(f.kind)) : fr;
  return [h('h1', {}, 'Who is free'), h('div', { class: 'seg', role: 'tablist' }, segs.map(([id, l]) => h('button', { class: freeSeg === id ? 'active' : '', role: 'tab', 'aria-selected': freeSeg === id ? 'true' : 'false', onClick: () => { freeSeg = id; ctx.render(); } }, l))),
    !fr.length ? h('div', { class: 'card' }, h('div', { class: 'small muted' }, 'Add friends in People first: colleagues linked to their rota row show their shifts by themselves.'), h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn primary grow', onClick: () => ctx.go('people') }, 'Open People'), h('button', { class: 'btn grow', onClick: () => findSheet() }, '🔎 Find a day with colleagues')))
      : [list.length ? safe('Who is free', () => gridCard(freeSeg === 'grid' ? null : list)) : h('div', { class: 'card small muted' }, freeSeg === 'family' ? 'No family members yet. Add them in People (type “Family”).' : 'No colleagues among your friends yet.'), safe('Best times', () => bestCard())]];
}
export const freePart = (p) => { if (p === 'family' || p === 'work' || p === 'grid') freeSeg = p; };

/** Outings: coming up and the history (the last-seen log). */
export function renderOutings() {
  const s = S(), list = F.outingList(s), now = new Date(), y = String(now.getFullYear()), today = keyOf(now);
  const up = list.filter(o => o.planned && !F.outingDue(o, now)).reverse(), past = list.filter(o => !(o.planned && !F.outingDue(o, now)));
  const row = (o) => h('div', { class: 'item clickable', onClick: () => outingSheet(o) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, o.what || 'Meet-up', o.where ? ` · ${o.where}` : ''), h('div', { class: 'meta' }, `${relDay(fromKey(o.date))}${o.start != null ? ` ${F.hhmm(o.start)}` : ''} · ${o.who.map(nameOf).join(', ') || 'solo'}${o.rating ? ' · ' + '★'.repeat(o.rating) : ''}`)), o.planned ? h('span', { class: `chip ${F.outingDue(o, now) ? 'warn' : 'sel'}` }, F.outingDue(o, now) ? 'did it happen?' : 'planned') : null);
  const yr = past.filter(o => !o.planned && o.date.startsWith(y) && o.date <= today);
  const tops = (() => { const c = {}; for (const o of yr) for (const id of o.who) c[id] = (c[id] || 0) + 1; return Object.entries(c).filter(([id]) => s.friends?.[id]).sort((a, b) => b[1] - a[1]).slice(0, 5); })();
  return [h('h1', {}, 'Outings'), h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: () => outingSheet(null) }, 'Log an outing'), h('button', { class: 'btn grow', onClick: () => inviteSheet([]) }, 'Plan one')),
    up.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Coming up'), h('div', { class: 'list' }, up.map(row))) : null,
    yr.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, `${y} so far`), h('div', { class: 'small' }, `${yr.length} meet-up${yr.length === 1 ? '' : 's'}`, tops.length ? ` · most with ${tops.map(([id, n]) => `${nameOf(id)} (${n})`).join(', ')}` : '')) : null,
    h('div', { class: 'card' }, h('div', { class: 'title' }, 'History'), past.length ? [h('div', { class: 'list' }, past.slice(0, histN).map(row)), past.length > histN ? h('button', { class: 'btn sm ghost', onClick: () => { histN += 80; ctx.render(); } }, `Show more (${past.length - histN} older)`) : null] : h('div', { class: 'small muted' }, 'Nothing logged yet. Log a meet-up and the last-seen dates and keep-in-touch nudges work by themselves.'))];
}
