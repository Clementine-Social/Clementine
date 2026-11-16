// Faces: initials, an emoji, a little character you build, or a photo. Characters are drawn as SVG from a handful of parts
// (body, eyes, mouth, something on top) in the person's hue, so they stay tiny in the synced file. Photos are cropped to a
// square and shrunk on this device (≈ 15–40 KB) before they are saved, and never leave Clementine's own state.json.
import { h, toast } from './util.js';
import { CHAR_PARTS, cleanAvatar } from './social.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); for (const c of kids) if (c) e.append(c); return e; };
export const HUES = [14, 30, 46, 96, 142, 176, 204, 228, 252, 276, 300, 330];
const LABEL = { body: { round: 'Round', bean: 'Bean', drop: 'Drop', citrus: 'Citrus', cloud: 'Cloud' }, eyes: { dot: 'Dots', happy: 'Happy', sleepy: 'Sleepy', wink: 'Wink', glasses: 'Glasses', sparkle: 'Sparkly' }, mouth: { smile: 'Smile', grin: 'Grin', o: 'Oh!', cat: 'Cat', flat: 'Calm', tongue: 'Cheeky' }, top: { none: 'Nothing', leaf: 'Leaf', bow: 'Bow', cap: 'Cap', ghutra: 'Ghutra', hijab: 'Hijab', crown: 'Crown', headphones: 'Headphones', curls: 'Curls' } };
export const partLabel = (k, v) => LABEL[k]?.[v] || v;

/** A character as an SVG element (viewBox 100×100). */
export function charSvg(ch, hue, size = 40) {
  const c = { ...Object.fromEntries(Object.entries(CHAR_PARTS).map(([k, l]) => [k, l[0]])), ...(ch || {}) };
  const skin = `hsl(${hue} 78% 66%)`, edge = `hsl(${hue} 50% 34%)`, ink = '#2b1a24', blush = 'rgba(255,120,140,.45)';
  const g = el('svg', { viewBox: '0 0 100 100', width: size, height: size, class: 'char', 'aria-hidden': 'true' });
  const back = [], front = [];
  // things behind the head
  if (c.top === 'hijab') back.push(el('path', { d: 'M50 10C24 10 12 32 12 56c0 20 8 34 14 40h48c6-6 14-20 14-40C88 32 76 10 50 10z', fill: `hsl(${(hue + 200) % 360} 28% 46%)`, stroke: `hsl(${(hue + 200) % 360} 30% 32%)`, 'stroke-width': 2.5 }));
  if (c.top === 'ghutra') back.push(el('path', { d: 'M50 12C26 12 14 30 13 54c-1 16 2 30 6 40h62c4-10 7-24 6-40-1-24-13-42-37-42z', fill: '#fbf7f4', stroke: '#c8b9b4', 'stroke-width': 2.5 }), ...[[24, 70], [76, 70], [20, 84], [80, 84], [28, 56], [72, 56]].map(([x, y]) => el('circle', { cx: x, cy: y, r: 2.2, fill: '#d6455a' })));
  if (c.top === 'curls') back.push(...[[30, 26], [44, 18], [58, 18], [72, 26], [80, 40], [20, 40]].map(([x, y]) => el('circle', { cx: x, cy: y, r: 11, fill: '#5a3726' })));
  // the body / face
  const hijabOrGhutra = c.top === 'hijab' || c.top === 'ghutra', face = hijabOrGhutra ? { cx: 50, cy: 58, r: 27 } : null;
  const body = face ? el('ellipse', { cx: 50, cy: 59, rx: 26, ry: 28, fill: skin, stroke: edge, 'stroke-width': 3 })
    : c.body === 'bean' ? el('path', { d: 'M50 16c22 0 36 16 36 40 0 22-16 36-36 36S14 80 14 58c0-26 14-42 36-42z', fill: skin, stroke: edge, 'stroke-width': 3 })
    : c.body === 'drop' ? el('path', { d: 'M50 10C40 30 16 44 16 64c0 18 15 30 34 30s34-12 34-30C84 44 60 30 50 10z', fill: skin, stroke: edge, 'stroke-width': 3 })
    : c.body === 'cloud' ? el('path', { d: 'M30 90c-12 0-18-9-18-18 0-8 5-14 11-16-1-14 9-26 22-26 6-10 22-12 31-2 13 0 20 12 18 24 7 3 10 10 10 17 0 12-8 21-20 21H30z', fill: skin, stroke: edge, 'stroke-width': 3 })
    : el('circle', { cx: 50, cy: 56, r: 37, fill: skin, stroke: edge, 'stroke-width': 3 });
  if (c.body === 'citrus' && !face) front.push(...[[34, 40], [62, 36], [70, 70], [30, 74], [48, 84]].map(([x, y]) => el('circle', { cx: x, cy: y, r: 1.8, fill: edge, opacity: .35 })));
  // cheeks, eyes, mouth
  const ey = face ? 56 : 54, my = face ? 70 : 69, ex = face ? 10 : 12;
  front.push(el('ellipse', { cx: 50 - ex - 9, cy: ey + 9, rx: 6, ry: 3.5, fill: blush }), el('ellipse', { cx: 50 + ex + 9, cy: ey + 9, rx: 6, ry: 3.5, fill: blush }));
  const eye = (x, kind) => kind === 'happy' ? el('path', { d: `M${x - 5} ${ey + 2}q5-7 10 0`, stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' })
    : kind === 'sleepy' ? el('path', { d: `M${x - 5} ${ey}q5 5 10 0`, stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' })
    : kind === 'sparkle' ? el('g', {}, el('circle', { cx: x, cy: ey, r: 6, fill: ink }), el('circle', { cx: x + 2, cy: ey - 2, r: 2.2, fill: '#fff' }), el('circle', { cx: x - 2, cy: ey + 2.5, r: 1, fill: '#fff' }))
    : el('circle', { cx: x, cy: ey, r: 4.5, fill: ink });
  if (c.eyes === 'wink') front.push(eye(50 - ex, 'dot'), eye(50 + ex, 'happy'));
  else if (c.eyes === 'glasses') front.push(el('circle', { cx: 50 - ex, cy: ey, r: 8, fill: 'rgba(255,255,255,.35)', stroke: ink, 'stroke-width': 2.5 }), el('circle', { cx: 50 + ex, cy: ey, r: 8, fill: 'rgba(255,255,255,.35)', stroke: ink, 'stroke-width': 2.5 }), el('path', { d: `M${50 - ex + 8} ${ey}h${2 * ex - 16}`, stroke: ink, 'stroke-width': 2.5 }), eye(50 - ex, 'dot'), eye(50 + ex, 'dot'));
  else front.push(eye(50 - ex, c.eyes), eye(50 + ex, c.eyes));
  const mouth = { smile: el('path', { d: `M42 ${my}q8 7 16 0`, stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }),
    grin: el('path', { d: `M40 ${my - 2}h20q-2 11-10 11t-10-11z`, fill: ink }), o: el('ellipse', { cx: 50, cy: my + 1, rx: 4, ry: 5, fill: ink }),
    cat: el('path', { d: `M41 ${my}q4.5 5 9 0q4.5 5 9 0`, stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), flat: el('path', { d: `M44 ${my + 1}h12`, stroke: ink, 'stroke-width': 3, 'stroke-linecap': 'round' }),
    tongue: el('g', {}, el('path', { d: `M41 ${my - 1}q9 9 18 0`, stroke: ink, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), el('path', { d: `M50 ${my + 3}q0 6 5 6t4-7`, fill: '#ff7a92' })) }[c.mouth];
  front.push(mouth);
  // things on top
  if (c.top === 'leaf' || c.body === 'citrus' && c.top === 'none') front.push(el('path', { d: 'M50 22c-1-7 1-12 6-15', stroke: '#5a3a1c', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), el('path', { d: 'M54 14c8-9 22-9 28-3-7 8-21 9-28 3z', fill: '#3fbf6a' }));
  if (c.top === 'bow') front.push(el('path', { d: 'M62 22l-12-9v18zM62 22l12-9v18z', fill: '#ff6b9a', stroke: '#c43c6c', 'stroke-width': 2 }), el('circle', { cx: 62, cy: 22, r: 4, fill: '#ff8fb3' }));
  if (c.top === 'cap') front.push(el('path', { d: 'M18 40c2-18 16-26 32-26s30 8 32 26z', fill: `hsl(${(hue + 190) % 360} 60% 48%)` }), el('path', { d: 'M50 40h40c2 0 2 6-2 6H50z', fill: `hsl(${(hue + 190) % 360} 55% 38%)` }));
  if (c.top === 'ghutra') front.push(el('ellipse', { cx: 50, cy: 32, rx: 25, ry: 5, fill: 'none', stroke: '#1d1a1c', 'stroke-width': 4 }), el('path', { d: 'M24 34c8-6 44-6 52 0', stroke: '#fbf7f4', 'stroke-width': 4, fill: 'none' }));
  if (c.top === 'hijab') front.push(el('path', { d: 'M24 46c6-14 46-14 52 0-8-6-44-6-52 0z', fill: `hsl(${(hue + 200) % 360} 28% 40%)` }));
  if (c.top === 'crown') front.push(el('path', { d: 'M28 26l6-16 9 10 7-14 7 14 9-10 6 16z', fill: '#ffcf3f', stroke: '#c79312', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  if (c.top === 'headphones') front.push(el('path', { d: 'M16 56c0-26 15-40 34-40s34 14 34 40', stroke: '#2b2430', 'stroke-width': 6, fill: 'none' }), el('rect', { x: 9, y: 50, width: 12, height: 20, rx: 6, fill: `hsl(${(hue + 200) % 360} 60% 55%)` }), el('rect', { x: 79, y: 50, width: 12, height: 20, rx: 6, fill: `hsl(${(hue + 200) % 360} 60% 55%)` }));
  g.append(...back, body, ...front);
  return g;
}

/** What goes inside a ring: the photo, emoji, character or initials. */
export function face(av, name, hue, size) {
  const a = cleanAvatar(av);
  if (a?.type === 'photo') return h('img', { class: 'av-photo', src: a.photo, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
  if (a?.type === 'emoji') return h('b', { class: 'av-emoji', style: { fontSize: `${Math.round(size * .46)}px` } }, a.emoji);
  if (a?.type === 'char') { const w = h('b', { class: 'av-char' }); w.append(charSvg(a.char, hue, Math.round(size - 10))); return w; }
  const ini = String(name || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?';
  return h('b', {}, ini);
}

/** A photo from a file: centre square, 192 px, WebP (JPEG where WebP can't be written), under ~55 KB. */
export async function photoFromFile(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('That is not a picture');
  let src; try { src = await createImageBitmap(file); } catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be opened')); i.src = URL.createObjectURL(file); }); }
  const w = src.width, ht = src.height, side = Math.min(w, ht), S = 192, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, (w - side) / 2, (ht - side) / 3, side, side, 0, 0, S, S);   // a bit above centre: faces sit high in most photos
  for (const q of [0.82, 0.7, 0.55, 0.4]) { let d = c.toDataURL('image/webp', q); if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/jpeg', q); if (d.length <= 55000) return d; }
  throw new Error('That picture is too detailed to keep small — try another');
}

/** The avatar editor. `cur` = the current avatar, `name` and `hue0` for the preview; onSave(avatar | null). */
export function avatarSheet({ cur, name, hue0, sheet, onSave, title = 'Face' }) {
  let a = cleanAvatar(cur) || { type: 'initials' }, tab = a.type;
  if (a.type !== 'char') a.char = { body: 'round', eyes: 'happy', mouth: 'smile', top: 'none' };
  const hueNow = () => a.hue ?? hue0;
  const preview = h('div', { class: 'av-preview' }), body = h('div', { class: 'av-body' });
  const ringOf = (av, size) => { const r = h('span', { class: 'ring', style: { '--h': hueNow(), '--s': `${size}px` } }); r.append(face(av, name, hueNow(), size)); return r; };
  const paintPreview = () => preview.replaceChildren(ringOf(a.type === 'char' ? { type: 'char', char: a.char } : a, 104));
  const pickTab = (t) => { tab = t; if (t === 'initials') a = { type: 'initials', hue: a.hue, char: a.char }; if (t === 'char') a = { type: 'char', char: a.char, hue: a.hue }; paint(); };
  const swatches = () => h('div', { class: 'av-hues', role: 'radiogroup', 'aria-label': 'Colour' }, [null, ...HUES].map(hh => h('button', { class: `av-hue ${(a.hue ?? null) === hh ? 'sel' : ''}`, role: 'radio', 'aria-checked': String((a.hue ?? null) === hh), 'aria-label': hh == null ? 'Colour from their name' : `Colour ${hh}`, style: { '--h': hh ?? hue0 }, onClick: () => { a.hue = hh; paint(); } }, hh == null ? 'A' : '')));
  const EMO = ['😀', '😎', '🥳', '🤓', '😇', '🤠', '🧕', '🧔', '👩‍⚕️', '👨‍⚕️', '🦁', '🐱', '🐶', '🦊', '🐼', '🐸', '🦄', '🐝', '🍊', '🌸', '⭐', '🔥', '🎮', '⚽'];
  const paint = () => {
    paintPreview();
    const tabs = h('div', { class: 'seg av-tabs', role: 'tablist' }, [['initials', 'Initials'], ['char', 'Character'], ['emoji', 'Emoji'], ['photo', 'Photo']].map(([t, l]) => h('button', { class: tab === t ? 'active' : '', role: 'tab', 'aria-selected': String(tab === t), onClick: () => pickTab(t) }, l)));
    let part = null;
    if (tab === 'char') part = h('div', { class: 'av-parts' }, Object.entries(CHAR_PARTS).map(([k, opts]) => h('div', { class: 'av-part' }, h('div', { class: 'tiny dim' }, { body: 'Shape', eyes: 'Eyes', mouth: 'Mouth', top: 'On top' }[k], k === 'body' && ['hijab', 'ghutra'].includes(a.char.top) ? ' (the face shape shows without a hijab or ghutra)' : ''),
      h('div', { class: 'av-opts' }, opts.map(v => { const ch = { ...a.char, [k]: v }, b = h('button', { class: `av-opt ${a.char[k] === v ? 'sel' : ''}`, 'aria-pressed': String(a.char[k] === v), title: partLabel(k, v), 'aria-label': partLabel(k, v), onClick: () => { a.char = ch; a.type = 'char'; paint(); } }); b.append(charSvg(ch, hueNow(), 46)); return b; })))),
      h('button', { class: 'btn sm ghost', onClick: () => { for (const [k, l] of Object.entries(CHAR_PARTS)) a.char[k] = l[Math.floor(Math.random() * l.length)]; a.hue = HUES[Math.floor(Math.random() * HUES.length)]; a.type = 'char'; paint(); } }, '🎲 Surprise me'));
    if (tab === 'emoji') { const inp = h('input', { value: a.type === 'emoji' ? a.emoji : '', placeholder: 'Type or pick an emoji', 'aria-label': 'Emoji', maxlength: 8, onInput: (e) => { const v = e.target.value.trim(); if (v) { a = { type: 'emoji', emoji: v, hue: a.hue, char: a.char }; paintPreview(); } } });
      part = h('div', {}, inp, h('div', { class: 'av-emojis' }, EMO.map(e => h('button', { class: `av-emo ${a.emoji === e ? 'sel' : ''}`, 'aria-label': e, onClick: () => { a = { type: 'emoji', emoji: e, hue: a.hue, char: a.char }; paint(); } }, e)))); }
    if (tab === 'photo') { const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { a = { type: 'photo', photo: await photoFromFile(f), hue: a.hue, char: a.char }; paint(); } catch (err) { toast(err.message, 'err'); } } });
      part = h('div', { class: 'av-photo-pick' }, file, h('button', { class: 'btn primary', onClick: () => file.click() }, a.type === 'photo' ? 'Choose another photo' : 'Choose a photo'), h('div', { class: 'tiny dim' }, 'Cropped to a square and made small on this phone. Kept in Clementine’s own file on your Drive, never in the files other apps read.')); }
    body.replaceChildren(tabs, part, h('div', { class: 'tiny dim', style: { margin: '12px 0 6px' } }, 'Ring colour'), swatches());
  };
  const box = sheet([h('h2', {}, title), preview, body, h('div', { class: 'row wrap', style: { marginTop: '12px' } },
    h('button', { class: 'btn primary grow', onClick: () => { const out = cleanAvatar(a.type === 'char' ? { type: 'char', char: a.char, hue: a.hue } : a); if (tab === 'photo' && out?.type !== 'photo') return toast('Choose a photo first', 'err'); box.close(); onSave(out); } }, 'Use this face'),
    h('button', { class: 'btn ghost', onClick: () => { box.close(); onSave(null); } }, 'Reset'))]);
  paint();
}
