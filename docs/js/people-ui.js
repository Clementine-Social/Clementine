// People: friends and family, every colleague in the roster with their contact card, birthdays, and saved groups.
// Clementine owns every contact card (phone, WhatsApp, Snapchat, Instagram, birthday, notes); Mandarin and Citrus read the
// handles from hub/clementine. A colleague's card is linked to their rota row by rota key; a friend's card is their friend record.
import { h, toast, keyOf, fromKey, addDays, startOfDay, relDay, DAY_SHORT, MONTHS } from './util.js';
import * as F from './social.js';
import * as R from './roster.js';
import * as SU from './social-ui.js';

let ctx = null, seg = 'friends', query = '', unit = 'all', showN = 60;
export function initPeople(c) { ctx = c; }
const S = () => ctx.S();
const { field } = SU;
export const peoplePart = (p) => { if (['friends', 'colleagues', 'birthdays', 'groups'].includes(p)) seg = p; };
const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
const shiftWords = (sh) => !sh ? 'no rota' : sh.kind === 'work' ? `${sh.code}${sh.start != null ? ` ${F.hhmm(sh.start)}–${F.hhmm(sh.end)}` : ''}` : sh.kind === 'off' ? 'off' : sh.kind === 'leave' ? 'leave' : String(sh.label || sh.code || 'away').toLowerCase();
const has = (v, q) => String(v || '').toLowerCase().includes(q);

// ───────────── a colleague's card (anyone in the roster)
/** The card for a rota key (a colleague) or a friend id. Friends open their own editor. */
export function personSheet(key) {
  const s = S(), fr = s.friends?.[key] || F.friendList(s).find(f => f.rotaKey === key);
  if (fr) return SU.friendSheet(fr);
  const p = R.person(key) || { key, name: s.contacts?.[key]?.name || key.replace(/^(id|name):/, ''), unit: '' }, c = F.contactOf(s, key), now = startOfDay(new Date());
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i)).map(d => ({ d, sh: R.shiftOf(key, d) }));
  const box = ctx.sheet([h('h2', {}, R.bare(p.name)), h('div', { class: 'small muted' }, [R.UNIT_LABEL[p.unit] || 'Not in the current roster', c.nick ? `you call them ${c.nick}` : ''].filter(Boolean).join(' · ')),
    SU.reach({ name: p.name, phone: c.phone, whatsapp: c.whatsapp, snap: c.snap, insta: c.insta }, ''),
    !F.hasCard(c) ? h('div', { class: 'tiny dim' }, 'No numbers or socials saved yet.') : null,
    c.birthday ? h('div', { class: 'small' }, `🎂 ${F.fmtBirthday(c.birthday)}`) : null, c.note ? h('div', { class: 'small fr-note' }, c.note) : null,
    R.has() ? h('div', { class: 'pc-week' }, week.map(({ d, sh }) => h('div', { class: `pc-d ${sh?.kind || 'unknown'}` }, h('small', {}, `${DAY_SHORT[d.getDay()]} ${d.getDate()}`), h('b', {}, sh ? (sh.kind === 'work' ? sh.code : sh.kind === 'off' ? 'off' : sh.kind === 'leave' ? 'L' : '·') : '?')))) : null,
    h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary grow', onClick: () => { box.close(); contactSheet(p); } }, F.hasCard(c) ? '✎ Edit card' : '＋ Numbers & socials'),
      h('button', { class: 'btn grow', onClick: () => { const before = S(); ctx.update(x => F.friendFromPerson(x, p)); box.close(); const f = F.friendList(S()).find(x => x.rotaKey === key); toast(`${R.bare(p.name)} is now a friend: their shifts feed Who is free`, 'ok', { action: { label: 'Undo', run: () => ctx.update(x => { let y = ctx.revert(x, 'friends', 'friend', f.id, undefined); return ctx.revert(y, 'contacts', 'contact', key, before.contacts?.[key]); }) } }); } }, '⭐ Make a friend'),
      R.has() ? h('button', { class: 'btn grow', onClick: () => { box.close(); SU.findSheet([key]); } }, '🔎 Find a day') : null)]);
}
/** Edit a colleague's numbers, socials, nickname, birthday and note. */
export function contactSheet(p) {
  const key = p.key, c = F.contactOf(S(), key), inp = (k, ph = '', type = 'text') => h('input', { type, value: k === 'birthday' ? F.fmtBirthday(c[k]) : (c[k] || ''), placeholder: ph });
  const phone = inp('phone', '05… or +966…', 'tel'), wa = inp('whatsapp', 'if different from phone', 'tel'), snap = inp('snap', 'username or link'), ig = inp('insta', '@username or link'), nick = inp('nick', 'What you call them'), bd = inp('birthday', '14/03 or 14/03/1990'), note = h('textarea', { rows: 2, placeholder: 'Only on this card, never shared' }, c.note || '');
  const save = () => {
    const b = bd.value.trim(), bp = F.parseBirthday(b); if (b && !bp) return toast('Birthday not understood — try 14/03 or 14/03/1990', 'err');
    const dropped = [[snap, 'Snapchat'], [ig, 'Instagram']].filter(([el]) => el.value.trim() && !F.cleanHandle(el.value)).map(([, l]) => l);
    const prev = S().contacts?.[key];
    ctx.update(s => F.setContact(s, key, { phone: phone.value, whatsapp: wa.value, snap: snap.value, insta: ig.value, nick: nick.value, birthday: bp, note: note.value, name: p.name })); box.close();
    toast(dropped.length ? `${dropped.join(' and ')}: no username found, left empty` : 'Card saved', dropped.length ? 'err' : 'ok', dropped.length ? {} : { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'contacts', 'contact', key, prev)) } });
  };
  const box = ctx.sheet([h('h2', {}, R.bare(p.name)), h('div', { class: 'tiny dim' }, 'Mandarin and Citrus show the phone, WhatsApp, Snapchat and Instagram buttons from this card. The note stays here.'),
    h('div', { class: 'grid2' }, field('Phone', phone, SU.phoneHint(phone)), field('WhatsApp', wa, SU.phoneHint(wa))), h('div', { class: 'grid2' }, field('Snapchat', snap, SU.handleHint(snap)), field('Instagram', ig, SU.handleHint(ig))),
    h('div', { class: 'grid2' }, field('Nickname', nick), field('Birthday', bd)), field('Note', note),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: save }, 'Save'), F.hasCard(c) || c.nick ? h('button', { class: 'btn danger', onClick: () => { const prev = S().contacts?.[key]; ctx.update(s => F.setContact(s, key, {})); box.close(); toast('Card cleared', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'contacts', 'contact', key, prev)) } }); } }, 'Clear card') : null)]);
}

// ───────────── segments
function friendsSeg() {
  const s = S(), all = F.friendList(s), q = query.trim().toLowerCase();
  const list = q ? all.filter(f => has(f.name, q) || has(f.nick, q) || has(f.place, q) || has(f.notes, q)) : all, fam = list.filter(f => f.kind === 'family'), rest = list.filter(f => f.kind !== 'family');
  return [h('input', { type: 'search', class: 'dir-search', placeholder: `Search ${all.length} friends and family`, value: query, 'data-nodirty': '', onInput: (e) => { query = e.target.value; ctx.render(); const i = document.querySelector('#view-people .dir-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }),
    h('div', { class: 'row wrap pp-add' }, h('button', { class: 'btn sm primary', onClick: () => SU.friendSheet(null) }, '+ Friend'), h('button', { class: 'btn sm', onClick: () => SU.friendSheet(null, { kind: 'family', every: 7 }) }, '+ Family'), R.has() ? h('button', { class: 'btn sm', onClick: () => { seg = 'colleagues'; ctx.render(); } }, '+ Colleague') : null, SU.contactsButton('btn sm')),
    !all.length ? h('div', { class: 'card small muted' }, 'Nobody yet. Add friends and family here, or open Colleagues and make someone from the roster a friend: their shifts then come from Mandarin by themselves.') : null,
    rest.length ? [h('div', { class: 'tiny dim pp-head' }, `Friends (${rest.length})`), SU.friendsList(rest)] : null,
    fam.length ? [h('div', { class: 'tiny dim pp-head' }, `Family (${fam.length})`), SU.friendsList(fam)] : null,
    q && !list.length ? h('div', { class: 'empty small' }, `Nobody called “${query}”.`) : null];
}
function colleaguesSeg() {
  const s = S(), ppl = R.people(), q = query.trim().toLowerCase(), today = startOfDay(new Date()), friendKeys = new Map(F.friendList(s).filter(f => f.rotaKey).map(f => [f.rotaKey, f]));
  const fuzzy = q ? new Set(R.match(query).map(p => p.key)) : null;
  // colleagues with a card but no longer in the roster (left, or a month not loaded) stay findable
  const gone = Object.values(s.contacts || {}).filter(c => !R.person(c.key)).map(c => ({ key: c.key, name: c.name || c.key.replace(/^(id|name):/, ''), unit: '', group: 'Not in the roster' }));
  const rows = [...ppl, ...gone].filter(p => (unit === 'all' || p.group === unit) && (!q || has(p.name, q) || fuzzy.has(p.key) || has(F.contactOf(s, p.key).nick, q)));
  const counts = { all: ppl.length + gone.length }; for (const p of [...ppl, ...gone]) counts[p.group] = (counts[p.group] || 0) + 1;
  const row = (p) => { const c = F.contactOf(s, p.key), sh = R.shiftOf(p.key, today), fr = friendKeys.get(p.key), l = F.reachLinks(s, p.key, s.settings?.cc);
    return h('div', { class: 'item clickable pp-row', onClick: () => personSheet(p.key) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, R.bare(p.name), fr ? ' ⭐' : '', c.nick && !fr ? h('span', { class: 'dim small' }, ` · ${c.nick}`) : null), h('div', { class: 'meta' }, [R.UNIT_LABEL[p.unit] || p.group, R.has() && R.person(p.key) ? `today ${shiftWords(sh)}` : ''].filter(Boolean).join(' · '))),
      h('span', { class: 'pp-ic' }, l.tel ? '📞' : '', l.wa ? '💬' : '', l.snap ? '👻' : '', l.insta ? '📸' : '', c.birthday ? '🎂' : '')); };
  return [h('input', { type: 'search', class: 'dir-search', placeholder: `Search ${counts.all} colleagues (spelling can be rough)`, value: query, 'data-nodirty': '', onInput: (e) => { query = e.target.value; showN = 60; ctx.render(); const i = document.querySelector('#view-people .dir-search'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } }),
    h('div', { class: 'chips', style: { margin: '6px 0' } }, [['all', 'All'], ['GPs', 'GPs'], ['Specialists', 'Specialists'], ['Nurses', 'Nurses'], ...(gone.length ? [['Not in the roster', 'Not in the roster']] : [])].filter(([k]) => k === 'all' || counts[k]).map(([k, l]) => h('button', { class: `chip ${unit === k ? 'sel' : ''}`, onClick: () => { unit = k; showN = 60; ctx.render(); } }, `${l} ${counts[k] || 0}`))),
    !R.has() ? h('div', { class: 'card small muted' }, 'No roster from Mandarin yet. Once Mandarin has your rotas (and you are signed in to the same Google account), everyone you work with appears here with their shifts.') : null,
    h('div', { class: 'list' }, rows.slice(0, showN).map(row)), rows.length > showN ? h('button', { class: 'btn ghost', onClick: () => { showN += 200; ctx.render(); } }, `Show ${rows.length - showN} more`) : null,
    q && !rows.length ? h('div', { class: 'empty small' }, `Nobody called “${query}” in the roster.`) : null];
}
function birthdaysSeg() {
  const s = S(), list = F.birthdays(s, new Date(), 366), missing = F.friendList(s).filter(f => !f.birthday);
  const byMonth = new Map(); for (const b of list) { const k = `${b.date.getFullYear()}-${b.date.getMonth()}`; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(b); }
  const when = (b) => `${DAY_SHORT[b.date.getDay()]} ${b.date.getDate()} ${MONTHS[b.date.getMonth()].slice(0, 3)} · ${b.inDays === 0 ? 'today' : b.inDays === 1 ? 'tomorrow' : `in ${days(b.inDays)}`}${b.friend ? '' : ' · colleague'}`;
  const plan = (b) => b.friend && b.inDays <= 21 ? h('button', { class: 'btn sm', onClick: (e) => { e.stopPropagation(); SU.inviteSheet([b.friend.id], null, `Surprise for ${b.name}’s birthday`); } }, 'Plan') : null;
  const row = (b) => h('div', { class: 'row nudge clickable', onClick: () => b.friend ? SU.friendSheet(b.friend) : personSheet(b.key) }, h('span', { class: 'ch-ic sm' }, b.inDays <= 7 ? '🎂' : '🎈'),
    h('div', { class: 'grow' }, h('div', { class: 'name' }, b.name, b.age ? h('span', { class: 'dim' }, ` · ${b.age}`) : null), h('div', { class: 'tiny dim' }, when(b))), plan(b));
  const months = [...byMonth.values()].map(l => h('div', { class: 'card' }, h('div', { class: 'title' }, `${MONTHS[l[0].date.getMonth()]} ${l[0].date.getFullYear()}`), l.map(row)));
  return [list.length ? months : h('div', { class: 'card small muted' }, 'No birthdays saved yet. Add them on friends’ and colleagues’ cards (14/03, or 14/03/1990 to see their age).'),
    missing.length ? h('details', { class: 'card' }, h('summary', { class: 'small' }, `No birthday saved for ${missing.length} friend${missing.length > 1 ? 's' : ''}`), h('div', { class: 'chips', style: { marginTop: '8px' } }, missing.map(f => h('button', { class: 'chip', onClick: () => SU.friendSheet(f) }, F.shortName(f))))) : null];
}
function groupSheet(g) {
  const s = S(), fr = F.friendList(s), v = { name: g?.name || '', icon: g?.icon || '👥', members: new Set(g?.members || []) };
  const name = h('input', { value: v.name, placeholder: 'Work friends, the padel lot…' }), icon = h('input', { value: v.icon, maxlength: 4, style: { width: '64px' } });
  const box = ctx.sheet([h('h2', {}, g ? 'Edit group' : 'New group'), h('div', { class: 'row', style: { gap: '8px' } }, field('Icon', icon), h('div', { class: 'grow' }, field('Name', name))),
    h('div', { class: 'chips' }, fr.map(f => h('button', { class: `chip ${v.members.has(f.id) ? 'sel' : ''}`, 'aria-pressed': String(v.members.has(f.id)), onClick: (e) => { v.members.has(f.id) ? v.members.delete(f.id) : v.members.add(f.id); e.currentTarget.classList.toggle('sel', v.members.has(f.id)); e.currentTarget.setAttribute('aria-pressed', String(v.members.has(f.id))); } }, F.shortName(f)))),
    h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary grow', onClick: () => { if (!name.value.trim()) return toast('Give the group a name', 'err'); if (!v.members.size) return toast('Pick at least one friend', 'err'); ctx.update(x => F.saveGroup(x, { id: g?.id, name: name.value, icon: icon.value, members: [...v.members] })); box.close(); } }, 'Save'),
      g ? h('button', { class: 'btn danger', onClick: () => { const prev = S().groups[g.id]; ctx.update(x => F.deleteGroup(x, g.id)); box.close(); toast('Group deleted', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'groups', 'group', g.id, prev)) } }); } }, 'Delete') : null)]);
}
function groupsSeg() {
  const s = S(), list = F.groupList(s);
  return [h('div', { class: 'small muted', style: { marginBottom: '8px' } }, 'Groups are shortcuts for Find a day and Plan a meet-up: tap one and everyone in it is picked.'),
    list.map(g => h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ch-ic sm' }, g.icon || '👥'), h('div', { class: 'grow' }, h('div', { class: 'name' }, g.name), h('div', { class: 'tiny dim' }, g.members.map(id => F.shortName(s.friends[id])).join(', ') || 'nobody left')), h('button', { class: 'btn sm ghost', 'aria-label': `Edit ${g.name}`, onClick: () => groupSheet(g) }, '⋯')),
      h('div', { class: 'row wrap', style: { marginTop: '6px' } }, h('button', { class: 'btn sm grow', onClick: () => SU.findSheet(g.members) }, '🔎 Find a day'), h('button', { class: 'btn sm grow', onClick: () => SU.inviteSheet(g.members) }, '💬 Invite all'), h('button', { class: 'btn sm grow', onClick: () => { ctx.freePart('grid'); ctx.go('free'); } }, 'Who is free')))),
    h('button', { class: 'btn', onClick: () => F.friendList(s).length ? groupSheet(null) : toast('Add some friends first', 'err') }, '+ New group')];
}
export function renderPeople() {
  const SEGS = [['friends', 'Friends'], ['colleagues', 'Colleagues'], ['birthdays', 'Birthdays'], ['groups', 'Groups']];
  const body = SU.safe(SEGS.find(x => x[0] === seg)?.[1] || 'People', () => seg === 'colleagues' ? colleaguesSeg() : seg === 'birthdays' ? birthdaysSeg() : seg === 'groups' ? groupsSeg() : friendsSeg());
  return [h('h1', {}, 'People'), h('div', { class: 'seg', role: 'tablist' }, SEGS.map(([id, l]) => h('button', { class: seg === id ? 'active' : '', role: 'tab', 'aria-selected': seg === id ? 'true' : 'false', onClick: () => { if (seg !== id) { seg = id; query = ''; showN = 60; } ctx.render(); } }, l))), ...[body].flat(Infinity)];
}
