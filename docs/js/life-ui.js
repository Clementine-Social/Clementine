// The views for life around your people (logic in life.js): your circles of closeness, the family tree and "how are we
// related?", life events, things to ask about, places, memories, stickers, RSVPs and the extra parts of a profile.
import { h, toast, keyOf, fromKey, relDay, DAY_SHORT, MONTHS } from './util.js';
import * as F from './social.js';
import * as L from './life.js';
import * as SU from './social-ui.js';
import * as PE from './person-ui.js';

let ctx = null;
export function initLife(c) { ctx = c; }
const S = () => ctx.S();
const av = (f, o) => PE.ring(f, o);
const rel = (k) => { const t = relDay(fromKey(k)); return /^(Today|Tomorrow|Yesterday)$/.test(t) ? t.toLowerCase() : t; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const day = (k) => { const d = fromKey(k); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`; };
const nodeFace = (s, n, size = 46) => n === 'me' ? PE.meFace(s, size) : s.friends?.[n] ? av(s.friends[n], { size }) : av({ name: n.slice(2), kind: 'family' }, { size });
const chipsOne = (opts, cur, onPick) => { const box = h('div', { class: 'chips' }); const paint = (v) => box.replaceChildren(...opts.map(([id, l]) => h('button', { type: 'button', class: `chip ${v === id ? 'sel' : ''}`, 'aria-pressed': String(v === id), onClick: () => { onPick(id); paint(id); } }, l))); paint(cur); return box; };

// ════════════════════════════════════════ circles of closeness
/** Put someone in a circle (or take them out). */
export function circleSheet(f, after = () => {}) {
  const box = ctx.sheet([h('h2', {}, `${F.shortName(f)}’s circle`), h('div', { class: 'small muted' }, 'Circles set how often Clementine nudges you to get in touch. Picking one here sets their reminder to the circle’s; you can still set your own gap on their card.'),
    h('div', { class: 'ci-pick' }, [...L.CIRCLES, ['', 'No circle', '⚪', 0, 'Only their own reminder, if any']].map(([id, label, icon, days, hint]) => h('button', { class: `ci-opt ${(f.circle || '') === id ? 'sel' : ''}`, onClick: () => { ctx.update(x => F.updateFriend(x, f.id, id ? { circle: id, every: 0 } : { circle: '' })); box.close(); toast(id ? `${F.shortName(f)}: ${label}` : 'Circle cleared', 'ok'); after(); } },
      h('span', { class: 'ci-ic' }, icon), h('span', { class: 'grow' }, h('b', {}, label), h('small', {}, `${hint}${days ? `. Nudge after ${days} days` : ''}`)))))]);
}
/** People › Circles: your people as rings around you, closest in the middle. */
export function circlesView() {
  const s = S(), now = new Date(), cs = L.circles(s, now), placed = cs.filter(c => c.id), loose = cs.find(c => !c.id);
  if (!F.friendList(s).length) return h('div', { class: 'card' }, h('div', { class: 'small muted' }, 'Add some friends first, then place them in circles.'));
  // the map: four rings, faces spread round each one, a little dimmer when they are overdue
  const R0 = [38, 84, 122, 160, 196], size = 400, cx = size / 2;
  const map = h('div', { class: 'ci-map', role: 'img', 'aria-label': 'Your circles of closeness' },
    placed.map((c, i) => h('div', { class: `ci-ring r${i}`, style: { width: `${R0[i + 1] * 2 / size * 100}%`, height: `${R0[i + 1] * 2 / size * 100}%` } })),
    h('div', { class: 'ci-me' }, PE.meFace(s, 52)),
    placed.flatMap((c, i) => { const r = (R0[i] + R0[i + 1]) / 2, n = c.people.length, cap = Math.max(6, Math.floor(2 * Math.PI * r / 40)), shown = c.people.slice(0, cap);
      return shown.map((p, j) => { const a = (j / Math.max(1, shown.length)) * Math.PI * 2 - Math.PI / 2 + i * 0.6, x = cx + r * Math.cos(a), y = cx + r * Math.sin(a);
        return h('button', { class: `ci-dot ${p.late ? 'late' : ''}`, style: { left: `${x / size * 100}%`, top: `${y / size * 100}%` }, title: `${p.f.name}: ${c.label}${p.late ? `, ${p.late} days overdue` : ''}`, 'aria-label': `${p.f.name}, ${c.label}`, onClick: () => PE.profileSheet(p.f) }, av(p.f, { size: 34, dim: !!p.late })); }).concat(n > cap ? [h('span', { class: 'ci-more', style: { left: '50%', top: `${(cx - r) / size * 100}%` } }, `+${n - cap}`)] : []); }));
  return [h('div', { class: 'card ci-card' }, h('div', { class: 'ci-scale' }, map), h('div', { class: 'tiny dim', style: { textAlign: 'center' } }, 'Faces that look faded are overdue for a catch-up. Tap one to open them.')),
    ...placed.map(c => h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'ci-ic' }, c.icon), h('div', { class: 'grow' }, h('div', { class: 'title' }, c.label), h('div', { class: 'tiny dim' }, `${c.hint}. Nudge after ${c.days} days unless you set their own.`)),
      c.people.length ? h('span', { class: `chip ${c.ok === c.people.length ? 'sel' : 'warn'}` }, `${c.ok}/${c.people.length} in touch`) : null),
      c.people.length ? h('div', { class: 'ci-row' }, c.people.map(p => h('button', { class: 'ci-person', onClick: () => circleSheet(p.f, () => ctx.render()), title: 'Change circle' }, av(p.f, { size: 40, dim: !!p.late }), h('b', {}, F.shortName(p.f)), h('small', { class: p.late ? 'late' : '' }, p.since == null ? 'not yet' : p.late ? `${p.late}d late` : relDay(addDaysBack(p.since)))))) : h('div', { class: 'small muted ci-empty' }, c.id === 'inner' ? 'Most people have about five here.' : 'Nobody here yet. Place people from their profile or below.'))),
    loose.people.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, `Not placed yet (${loose.people.length})`), h('div', { class: 'tiny dim' }, 'Tap someone to choose their circle.'), h('div', { class: 'ci-row' }, loose.people.map(p => h('button', { class: 'ci-person', onClick: () => circleSheet(p.f, () => ctx.render()) }, av(p.f, { size: 40 }), h('b', {}, F.shortName(p.f)))))) : null];
}
const addDaysBack = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d; };

// ════════════════════════════════════════ family tree
/** Pick a person for a link: you, a friend, or someone only in the tree (by name). */
function nodePicker(cur, onPick, { allowNew = true, label = 'Who' } = {}) {
  const s = S(), opts = [['me', 'You'], ...F.friendList(s).map(f => [f.id, F.shortName(f)]), ...L.treeNodes(s).filter(n => n.startsWith('p:')).map(n => [n, n.slice(2)])];
  const sel = h('select', { 'aria-label': label, onChange: () => { nw.hidden = sel.value !== '+'; if (sel.value !== '+') onPick(sel.value); else nw.focus(); } }, opts.map(([v, l]) => h('option', { value: v, selected: v === cur }, l)), allowNew ? h('option', { value: '+' }, '＋ Someone new (name only)') : null);
  const nw = h('input', { placeholder: 'Their name (Grandma, Uncle Sami…)', hidden: cur !== '+', 'aria-label': 'New person’s name', onInput: () => onPick(nw.value.trim() ? `p:${nw.value.trim()}` : '') });
  return h('div', { class: 'ft-pick' }, sel, nw);
}
/** Link two people: "Mum is the parent of you". */
export function tieSheet(preset = {}, after = () => ctx.render()) {
  const fam = preset.kind !== 'friends';
  let a = preset.a === '+' ? '' : preset.a || 'me', b = preset.b === '+' ? '' : preset.b || (fam ? 'me' : F.friendList(S()).find(f => f.id !== a)?.id || 'me'), rel = preset.rel || (fam ? 'parent' : 'introduced');
  const box = ctx.sheet([h('h2', {}, fam ? 'Add a family link' : 'Add to your friend tree'), h('div', { class: 'small muted' }, fam ? 'Links build the tree. Clementine works out the rest: a parent’s sibling is an aunt or uncle, their child a cousin. People who are not your friends here can be added by name only.' : 'Who introduced you to whom, and who already knows each other. “You introduced Sam” puts Sam under you; “Sam introduced Lina” puts Lina under Sam.'),
    h('div', { class: 'ft-form' }, nodePicker(preset.a || 'me', v => { a = v; }, { label: 'First person', allowNew: fam }), chipsOne(fam ? L.TIE_RELS : L.FRIEND_RELS, rel, v => { rel = v; }), nodePicker(b, v => { b = v; }, { label: 'Second person', allowNew: fam })),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: () => { if (!a || !b || a === '+' || b === '+') return toast('Pick both people (type a name for someone new)', 'err'); if (a === b) return toast('Pick two different people', 'err'); const before = Object.keys(S().ties || {}).length; ctx.update(x => L.addTie(x, { a, b, rel })); if (Object.keys(S().ties || {}).length === before) return toast('That link is already there', 'err'); box.close(); const r = fam && L.relation(S(), 'me', a === 'me' ? b : a); toast(r && a !== 'me' && b !== 'me' ? `${L.nodeName(S(), a === 'me' ? b : a)} is ${r.label}` : 'Linked', 'ok'); after(); } }, 'Add link'))]);
}
/** People › Family: the tree, row by row from the oldest generation, with how each person is related to you. */
/** People › Trees: the family tree or the friend tree. */
let treeKind = 'family';
export function treesView() {
  const seg = h('div', { class: 'seg tr-seg', role: 'tablist' }, [['family', '🌳 Family tree'], ['friends', '🫂 Friend tree']].map(([id, l]) => h('button', { class: treeKind === id ? 'active' : '', role: 'tab', 'aria-selected': String(treeKind === id), onClick: () => { treeKind = id; ctx.render(); } }, l)));
  return [seg, ...[treeKind === 'friends' ? friendTreeView() : familyView()].flat()];
}
/** The friend tree: you at the top, the people you met yourself under you, and whoever they introduced under them. */
function friendTreeView() {
  const s = S(), fr = F.friendList(s); if (!fr.length) return h('div', { class: 'card' }, h('div', { class: 'small muted' }, 'Add some friends first, then show who introduced who.'));
  const { root, knows } = L.friendTree(s), links = L.tieList(s).filter(t => !L.isFamily(t));
  const node = (n, depth) => { const f = s.friends?.[n.id], me = n.id === 'me', kn = (knows.get(n.id) || []).filter(x => x !== 'me'), circle = f && L.CIRCLES.find(c => c[0] === f.circle);
    return h('li', { class: `fx-li ${depth ? '' : 'root'}` }, h('button', { class: `fx-node ${me ? 'me' : ''}`, onClick: () => me ? ctx.editMe() : f && PE.profileSheet(f) }, nodeFace(s, n.id, me ? 46 : 38),
      h('span', { class: 'fx-txt' }, h('b', {}, L.nodeName(s, n.id)), h('small', {}, me ? `${plural(fr.length, 'friend')}, ${n.kids.length} ${n.kids.length === 1 ? 'branch' : 'branches'}` : [circle ? `${circle[2]} ${circle[1]}` : '', f?.met ? `met: ${f.met}` : '', n.kids.length ? `introduced ${n.kids.length}` : ''].filter(Boolean).join(' · ') || null),
        kn.length ? h('span', { class: 'fx-knows' }, 'knows ', kn.map(x => h('i', {}, L.nodeName(s, x)))) : null)),
      n.kids.length ? h('ul', { class: 'fx-ul' }, n.kids.map(k => node(k, depth + 1))) : null); };
  const linkRows = links.map(t => h('div', { class: 'pf-row small' }, h('span', { class: 'grow' }, `${L.nodeName(s, t.a)} ${L.relWords(t.rel)} ${L.nodeName(s, t.b)}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Remove link', onClick: () => { const prev = S().ties[t.id]; ctx.update(x => L.deleteTie(x, t.id)); toast('Link removed', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'ties', 'tie', t.id, prev)) } }); ctx.render(); } }, '✕')));
  return [h('div', { class: 'row wrap pp-add' }, h('button', { class: 'btn sm primary', onClick: () => tieSheet({ kind: 'friends', a: 'me' }) }, '＋ Who introduced who'), h('button', { class: 'btn sm', onClick: () => tieSheet({ kind: 'friends', rel: 'knows', a: fr[0].id }) }, '＋ Who knows who')),
    h('div', { class: 'card fx-card' }, h('ul', { class: 'fx-ul top' }, node(root, 0)), links.length ? null : h('div', { class: 'tiny dim', style: { marginTop: '8px' } }, 'Everyone hangs off you until you say who introduced them.')),
    links.length ? h('details', { class: 'card' }, h('summary', { class: 'title' }, `Links (${links.length})`), linkRows) : null];
}
function familyView() {
  const s = S(), gen = L.generations(s), nodes = L.treeNodes(s), ties = L.tieList(s).filter(L.isFamily);
  const linked = nodes.filter(n => gen.has(n)), apart = nodes.filter(n => !gen.has(n));
  const rows = [...new Set(linked.map(n => gen.get(n)))].sort((a, b) => a - b);
  const partnerOf = (n) => ties.filter(t => t.rel === 'partner' && (t.a === n || t.b === n)).map(t => t.a === n ? t.b : t.a);
  const order = (list) => { const out = []; for (const n of list.sort((a, b) => (a === 'me' ? -1 : b === 'me' ? 1 : 0) || L.nodeName(s, a).localeCompare(L.nodeName(s, b)))) if (!out.includes(n)) { out.push(n); for (const p of partnerOf(n)) if (list.includes(p) && !out.includes(p)) out.push(p); } return out; };
  const genName = (g) => ({ '-3': 'Great-grandparents', '-2': 'Grandparents', '-1': 'Parents and their generation', 0: 'Your generation', 1: 'Children and their generation', 2: 'Grandchildren' })[g] || (g < 0 ? `${-g} generations up` : `${g} generations down`);
  const person = (n) => { const r = n === 'me' ? null : L.relation(s, 'me', n), f = s.friends?.[n];
    return h('button', { class: `ft-node ${n === 'me' ? 'me' : ''}`, onClick: () => f ? PE.profileSheet(f) : n === 'me' ? ctx.editMe() : nodeSheet(n) }, nodeFace(s, n, 50), h('b', {}, L.nodeName(s, n)), r ? h('small', {}, r.short) : n === 'me' ? h('small', {}, 'you') : null); };
  const calc = (() => { let x = 'me', y = linked.find(n => n !== 'me') || 'me'; const out = h('div', { class: 'ft-answer' });
    const paint = () => { if (x === y) return out.replaceChildren('Pick two different people.'); const r = L.relation(s, x, y); out.replaceChildren(r ? h('span', {}, h('b', {}, L.nodeName(s, y)), ` is ${x === 'me' ? r.label : r.label.replace(/^your /, `${L.nodeName(s, x)}’s `)}`) : 'No link between them yet.'); };
    const pick = (cur, set) => h('select', { onChange: (e) => { set(e.target.value); paint(); } }, nodes.map(n => h('option', { value: n, selected: n === cur }, L.nodeName(s, n))));
    const el = h('div', { class: 'card' }, h('div', { class: 'title' }, 'How are they related?'), h('div', { class: 'row wrap ft-calc' }, pick(x, v => { x = v; }), h('span', { class: 'dim' }, 'and'), pick(y, v => { y = v; })), out); paint(); return el; })();
  return [h('div', { class: 'row wrap pp-add' }, h('button', { class: 'btn sm primary', onClick: () => tieSheet() }, '＋ Add a link'), h('span', { class: 'tiny dim grow' }, ties.length ? plural(ties.length, 'link') : '')),
    ties.length ? h('div', { class: 'card ft-tree' }, rows.map(g => h('div', { class: 'ft-gen' }, h('div', { class: 'tiny dim ft-gl' }, genName(g)), h('div', { class: 'ft-row' }, order(linked.filter(n => gen.get(n) === g)).map(person))))) :
      h('div', { class: 'card' }, h('div', { class: 'title' }, 'Start your family tree'), h('p', { class: 'small muted' }, 'Add a link, like “Mum is the parent of you”, and keep going: siblings, partners, children. Anyone in the tree can be a friend here or just a name.'), h('button', { class: 'btn primary', onClick: () => tieSheet({ a: '+', b: 'me', rel: 'parent' }) }, 'Add your first link')),
    apart.length ? h('div', { class: 'card' }, h('div', { class: 'title' }, 'Not linked to you yet'), h('div', { class: 'tiny dim' }, 'Linked to each other but not to you. Add one link to bring them into your tree.'), h('div', { class: 'ft-row' }, apart.map(person))) : null,
    nodes.length > 2 ? calc : null];
}
/** A tree-only person: their links, rename, make them a friend, remove. */
function nodeSheet(n) {
  const s = S(), ties = L.tieList(s, n), r = L.relation(s, 'me', n);
  const box = ctx.sheet([h('div', { class: 'pf-head' }, nodeFace(s, n, 64), h('div', { class: 'grow' }, h('h2', {}, n.slice(2)), h('div', { class: 'small muted' }, r ? r.label : 'Not linked to you yet'))),
    h('section', { class: 'pf-sec' }, h('h3', {}, 'Links'), ties.map(t => h('div', { class: 'pf-row' }, h('span', { class: 'grow' }, `${L.nodeName(s, t.a)} ${L.relWords(t.rel)} ${L.nodeName(s, t.b)}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Remove link', onClick: () => { const prev = S().ties[t.id]; ctx.update(x => L.deleteTie(x, t.id)); box.close(); toast('Link removed', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'ties', 'tie', t.id, prev)) } }); ctx.render(); } }, '✕')))),
    h('div', { class: 'row wrap' }, h('button', { class: 'btn primary grow', onClick: () => { box.close(); tieSheet({ a: n }); } }, 'Add a link'),
      h('button', { class: 'btn', title: 'Add them as a friend and keep their place in the tree', onClick: () => { box.close(); const name = n.slice(2); let id = ''; ctx.update(x => { const y = F.addFriend(x, { name, kind: 'family' }); id = Object.keys(y.friends).find(k => !x.friends?.[k]) || ''; if (!id) return y; const ties = Object.fromEntries(Object.entries(y.ties || {}).map(([k, t]) => [k, t.a === n || t.b === n ? { ...t, a: t.a === n ? id : t.a, b: t.b === n ? id : t.b, at: Date.now() } : t])); return { ...y, ties }; }); toast(`${name} added to your people`, 'ok'); ctx.render(); } }, 'Make them a friend'))]);
}

// ════════════════════════════════════════ life events
export function lifeSheet(who, l = null, after = () => {}) {
  const s = S(), f = s.friends?.[who]; if (!f) return; let kind = l?.kind || 'job'; let follow = !l;
  const date = h('input', { type: 'date', value: l?.date || keyOf(new Date()) }), note = h('input', { value: l?.note || '', placeholder: 'A few words (the job, the city, the baby’s name…)' });
  const followBox = h('label', { class: 'chip sel', hidden: !!l }, h('input', { type: 'checkbox', checked: true, style: { display: 'none' }, onChange: (e) => { follow = e.target.checked; e.target.parentElement.classList.toggle('sel', follow); } }), ' Remind me to ask how it went');
  const box = ctx.sheet([h('h2', {}, l ? 'Life event' : `What’s new with ${F.shortName(f)}?`), h('div', { class: 'small muted' }, 'Big moments in their life. They show on their profile, come back as memories, and the big ones are remembered each year.'),
    h('div', { class: 'chips', style: { margin: '10px 0' } }, L.LIFE_KINDS.map(([k, ic, lb]) => h('button', { type: 'button', class: `chip ${kind === k ? 'sel' : ''}`, 'aria-pressed': String(kind === k), onClick: (e) => { kind = k; e.currentTarget.parentElement.querySelectorAll('.chip').forEach(c => { c.classList.toggle('sel', c === e.currentTarget); c.setAttribute('aria-pressed', String(c === e.currentTarget)); }); } }, `${ic} ${lb}`))),
    h('div', { class: 'grid2' }, SU.field('When', date), SU.field('Note', note)), followBox,
    h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary grow', onClick: (e) => { ctx.update(x => L.addLife(x, { id: l?.id, who, kind, date: date.value, note: note.value }, { follow: l ? false : follow })); if (['married', 'engaged', 'baby', 'grad', 'win'].includes(kind) && !l) ctx.cheer(e.currentTarget); box.close(); toast(l ? 'Saved' : 'Added to their story', 'ok'); after(); } }, 'Save'),
      l ? h('button', { class: 'btn danger', onClick: () => { const prev = S().life[l.id]; ctx.update(x => L.deleteLife(x, l.id)); box.close(); toast('Deleted', '', { action: { label: 'Undo', run: () => ctx.update(x => ctx.revert(x, 'life', 'life', l.id, prev)) } }); after(); } }, 'Delete') : null)]);
}

// ════════════════════════════════════════ the extra parts of a profile
/** Circle, things to ask, life events, family, how you met and food notes — slotted into the profile sheet. */
export function profileParts(f, refresh, close = () => {}) {
  const away = (open) => () => { close(); open(() => PE.profileSheet(S().friends?.[f.id] || f)); };
  const s = S(), asks = L.askList(s, f.id), life = L.lifeList(s, f.id).slice(0, 8), r = L.relation(s, 'me', f.id), ties = L.tieList(s, f.id);
  const circle = L.CIRCLES.find(c => c[0] === f.circle);
  const askIn = h('input', { 'data-nofocus': '', placeholder: 'Ask about next time (her exam, the new flat…)', 'aria-label': 'Something to ask about', onKeydown: (e) => { if (e.key === 'Enter') addAsk(); } });
  const addAsk = () => { const t = askIn.value.trim(); if (!t) return; ctx.update(x => L.addAsk(x, { who: f.id, text: t })); refresh(); };
  return {
    circle: h('button', { class: `chip pf-circle ${circle ? 'sel' : ''}`, onClick: away(back => circleSheet(f, back)), title: 'Change circle' }, circle ? `${circle[2]} ${circle[1]}` : '⚪ Pick a circle'),
    sections: [
      h('section', { class: 'pf-sec' }, h('h3', {}, 'Ask about next time'),
        asks.map(a => h('div', { class: 'pf-row' }, h('button', { class: 'pf-tick', 'aria-label': `Done: ${a.text}`, onClick: (e) => { ctx.cheer(e.currentTarget); ctx.update(x => L.doneAsk(x, a.id, true)); toast('Asked', 'ok', { action: { label: 'Undo', run: () => ctx.update(x => L.doneAsk(x, a.id, false)) } }); refresh(); } }, '○'), h('span', { class: 'grow' }, a.text), a.due ? h('span', { class: 'tiny dim' }, relDay(fromKey(a.due))) : null, h('button', { class: 'btn sm ghost', 'aria-label': `Remove ${a.text}`, onClick: () => { ctx.update(x => L.deleteAsk(x, a.id)); refresh(); } }, '✕'))),
        h('div', { class: 'row pf-add' }, askIn, h('button', { class: 'btn sm', onClick: addAsk }, 'Add'))),
      h('section', { class: 'pf-sec' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Life events'), h('button', { class: 'btn sm ghost', onClick: away(back => lifeSheet(f.id, null, back)) }, '＋ Add')),
        life.length ? h('ol', { class: 'pf-tl lf' }, life.map(l => h('li', { class: 'life clickable', onClick: away(back => lifeSheet(f.id, l, back)) }, h('span', { class: 'pf-d' }, day(l.date)), h('span', { class: 'grow' }, `${L.lifeIcon(l.kind)} ${L.lifeLabel(l)}`)))) : h('div', { class: 'small muted' }, 'New job, a move, a baby, an exam… note it and Clementine reminds you to ask how it went.')),
      h('section', { class: 'pf-sec' }, h('div', { class: 'row' }, h('h3', { class: 'grow' }, 'Family and friends'), h('button', { class: 'btn sm ghost', onClick: away(back => tieSheet({ a: f.id }, back)) }, '＋ Family'), h('button', { class: 'btn sm ghost', onClick: away(back => tieSheet({ kind: 'friends', a: 'me', b: f.id }, back)) }, '＋ Friend link')),
        r ? h('div', { class: 'small' }, `${F.shortName(f)} is ${r.label}.`) : null,
        ties.length ? ties.map(t => h('div', { class: 'pf-row small' }, h('span', { class: 'grow' }, `${L.nodeName(s, t.a)} ${L.relWords(t.rel)} ${L.nodeName(s, t.b)}`), h('button', { class: 'btn sm ghost', 'aria-label': 'Remove link', onClick: () => { ctx.update(x => L.deleteTie(x, t.id)); refresh(); } }, '✕'))) : h('div', { class: 'small muted' }, 'Link their family, or say who introduced you, to see them in your trees.')),
      f.met || f.food ? h('section', { class: 'pf-sec' }, h('h3', {}, 'Good to know'), f.met ? h('div', { class: 'small' }, `🤝 Met: ${f.met}`) : null, f.food ? h('div', { class: 'small' }, `🍽 Food: ${f.food}`) : null) : null,
    ],
  };
}

// ════════════════════════════════════════ Today cards
/** Things to ask about: due ones, and the people you are seeing in the next two days. */
export function asksCard() {
  const s = S(), list = L.asksNow(s); if (!list.length) return null;
  return h('div', { class: 'card td-asks' }, h('div', { class: 'title' }, 'Ask about'), list.slice(0, 5).map(({ a, f, why, date }) => h('div', { class: 'row nudge' }, av(f, { size: 34 }), h('div', { class: 'grow' }, h('div', { class: 'name' }, a.text), h('div', { class: 'tiny dim' }, why === 'seeing' ? `${F.shortName(f)}, you see them ${rel(date)}` : `${F.shortName(f)}, ${rel(date)}`)),
    h('button', { class: 'btn sm primary', onClick: (e) => { ctx.cheer(e.currentTarget); ctx.update(x => L.doneAsk(x, a.id, true)); toast('Asked', 'ok', { action: { label: 'Log a call', run: () => PE.touchSheet([f.id]) } }); } }, 'Asked'))));
}
/** This week in other years: outings and life events. */
export function memoriesCard() {
  const s = S(), list = L.memories(s), ann = L.lifeAnniversaries(s, new Date(), 7); if (!list.length && !ann.length) return null;
  return h('div', { class: 'card td-mem' }, h('div', { class: 'title' }, '📸 This week, years ago'),
    ann.map(x => h('div', { class: 'row nudge' }, av(x.friend, { size: 34 }), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${F.shortName(x.friend)}: ${x.years} year${x.years === 1 ? '' : 's'} since ${L.lifeLabel(x.l).toLowerCase()}`), h('div', { class: 'tiny dim' }, x.inDays === 0 ? 'today' : `in ${plural(x.inDays, 'day')}`)), h('button', { class: 'btn sm', onClick: () => PE.touchSheet([x.friend.id]) }, 'Say something'))),
    list.slice(0, 4).map(m => h('div', { class: 'item clickable', onClick: () => m.kind === 'outing' ? SU.outingSheet(m.rec) : s.friends?.[m.rec.who] && lifeSheet(m.rec.who, m.rec) }, h('div', { class: 'td-date mem' }, h('b', {}, m.years), h('small', {}, m.years === 1 ? 'year' : 'years')),
      h('div', { class: 'grow' }, h('div', { class: 'name' }, m.kind === 'outing' ? `${m.rec.what || 'Meet-up'}${m.rec.where ? `, ${m.rec.where}` : ''}` : `${L.lifeIcon(m.rec.kind)} ${F.nameOn(s, m.rec, m.rec.who)}: ${L.lifeLabel(m.rec)}`), h('div', { class: 'meta' }, [day(m.date), m.kind === 'outing' ? m.rec.who.map(w => F.nameOn(s, m.rec, w)).join(', ') : '', m.rec.rating ? '★'.repeat(m.rec.rating) : ''].filter(Boolean).join(', '))))));
}

// ════════════════════════════════════════ Outings: places, streak, stickers
export function placesCard() {
  const s = S(), list = L.places(s), top = L.topPlaces(s); if (!list.length) return null;
  return h('div', { class: 'card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, '📍 Your places'), h('span', { class: 'tiny dim' }, plural(list.length, 'place'))),
    top.length ? h('div', { class: 'pl-top' }, top.slice(0, 3).map((p, i) => h('button', { class: 'pl-medal', onClick: () => placeSheet(p.key) }, h('span', { class: 'pl-rank' }, ['🥇', '🥈', '🥉'][i]), h('b', {}, p.name), h('small', {}, `${p.rating}★ · ${plural(p.visits, 'visit')}`)))) : null,
    h('div', { class: 'list' }, list.slice(0, 8).map(p => h('div', { class: 'item clickable', onClick: () => placeSheet(p.key) }, h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 'meta' }, [plural(p.visits, 'visit'), `last ${rel(p.last)}`, p.people[0] ? `mostly with ${F.shortName(s.friends[p.people[0][0]])}` : ''].filter(Boolean).join(', '))), p.rating ? h('span', { class: 'chip' }, `${p.rating}★`) : null))));
}
function placeSheet(key) {
  const s = S(), p = L.places(s).find(x => x.key === key); if (!p) return;
  const box = ctx.sheet([h('h2', {}, `📍 ${p.name}`), h('div', { class: 'small muted' }, `${plural(p.visits, 'visit')} since ${day(p.first)}${p.rating ? `, ${p.rating}★ on average` : ''}${p.whats.length ? `. Usually ${p.whats.slice(0, 2).join(' or ').toLowerCase()}` : ''}.`),
    p.people.length ? h('div', { class: 'ci-row', style: { margin: '10px 0' } }, p.people.slice(0, 8).map(([id, n]) => h('div', { class: 'ci-person' }, av(s.friends[id], { size: 40 }), h('b', {}, F.shortName(s.friends[id])), h('small', {}, `${n}×`)))) : null,
    h('div', { class: 'list' }, p.outings.slice(0, 20).map(o => h('div', { class: 'item clickable', onClick: () => { box.close(); SU.outingSheet(o); } }, h('div', { class: 'grow' }, h('div', { class: 'name' }, o.what || 'Meet-up'), h('div', { class: 'meta' }, [relDay(fromKey(o.date)), o.who.map(w => F.nameOn(s, o, w)).join(', '), o.rating ? '★'.repeat(o.rating) : ''].filter(Boolean).join(', ')))))),
    h('div', { class: 'row wrap', style: { marginTop: '8px' } }, h('button', { class: 'btn primary grow', onClick: () => { box.close(); SU.inviteSheet(p.people.slice(0, 3).map(x => x[0]), null, `${p.whats[0] || 'Meet-up'} at ${p.name}`); } }, 'Plan another one here'), h('button', { class: 'btn', onClick: () => { box.close(); SU.outingSheet(null, { where: p.name }); } }, 'Log a visit'))]);
}
const SEEN = 'clementine.stickers.seen';
export function stickersCard() {
  const s = S(), list = L.stickers(s), got = list.filter(x => x.got), streak = L.weekStreak(s);
  // stickers earned since you last looked pop and get a toast; the very first look just takes note (no toast for old history)
  let seen = null; try { seen = JSON.parse(localStorage.getItem(SEEN) || 'null'); } catch { /* private mode */ }
  const fresh = seen ? got.filter(x => !seen.includes(x.id)) : [];
  if (!seen || fresh.length) { try { localStorage.setItem(SEEN, JSON.stringify(got.map(x => x.id))); } catch { /* fine */ } if (fresh.length) setTimeout(() => toast(`New sticker: ${fresh[0].icon} ${fresh[0].name}`, 'ok'), 300); }
  return h('div', { class: 'card st-card' }, h('div', { class: 'row' }, h('div', { class: 'title grow' }, 'Stickers'), h('span', { class: 'chip sel' }, `${got.length}/${list.length}`)),
    streak ? h('div', { class: 'st-streak' }, h('span', { class: 'st-flame' }, '🔥'), h('b', {}, plural(streak, 'week')), h('span', { class: 'small muted' }, ' in a row in touch with someone')) : h('div', { class: 'small muted' }, 'Meet up or call someone each week to start a streak.'),
    h('div', { class: 'st-grid' }, list.map(x => h('div', { class: `st ${x.got ? 'got' : ''} ${fresh.some(y => y.id === x.id) ? 'new' : ''}`, title: `${x.name}: ${x.how}${x.got ? '' : ` (${x.have}/${x.need})`}`, tabindex: '0', role: 'img', 'aria-label': `${x.name}${x.got ? ', collected' : `, ${x.have} of ${x.need}`}` },
      h('span', { class: 'st-ic' }, x.icon), h('b', {}, x.name), x.got ? null : h('i', { class: 'st-bar' }, h('i', { style: { width: `${Math.round(x.have / x.need * 100)}%` } }))))));
}

// ════════════════════════════════════════ RSVPs
/** Who is coming to a planned outing, with the food notes of the people invited. */
export function rsvpSheet(o, after = () => {}) {
  const s = S(); o = s.outings?.[o.id] || o; if (!o.who.length) return toast('Nobody invited yet', 'err');
  const line = h('div', { class: 'small muted' }, L.rsvpLine(o));
  const rows = o.who.map(id => { const f = s.friends?.[id]; if (!f) return null; return h('div', { class: 'row nudge' }, av(f, { size: 34 }), h('b', { class: 'grow' }, F.shortName(f)), chipsOne(L.RSVP.map(([k, ic, l]) => [k, `${ic} ${l}`]), o.rsvp?.[id] || '', (v) => { ctx.update(x => L.setRsvp(x, o.id, id, v)); line.textContent = L.rsvpLine(S().outings[o.id]); })); });
  const food = L.foodNotes(s, o);
  ctx.sheet([h('h2', {}, `Who’s coming: ${o.what || 'meet-up'}`), line, h('div', { style: { margin: '10px 0' } }, rows),
    food.length ? h('div', { class: 'card warn' }, h('div', { class: 'title' }, '🍽 Food notes'), food.map(x => h('div', { class: 'small' }, `${F.shortName(x.f)}: ${x.food}`))) : null,
    h('div', { class: 'tiny dim' }, 'Mark what people told you in the group chat. Clementine never messages anyone for you.')]);
  after();
}
