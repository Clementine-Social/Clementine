// A shareable picture of a planned meet-up (what, when, where, who, who brings what), drawn on a canvas in Clementine's
// colours and handed to the phone's Share sheet (WhatsApp, Snapchat…) or downloaded where sharing files is not supported.
import { fromKey, DAY_NAMES, MONTHS, toast } from './util.js';
import * as F from './social.js';
import { hueOf } from './person-ui.js';

const W = 1080, H = 1350;
function wrap(ctx, text, max) { const words = String(text).split(/\s+/), lines = []; let line = ''; for (const w of words) { const t = line ? `${line} ${w}` : w; if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t; } if (line) lines.push(line); return lines; }
/** Draw the card → a PNG Blob. */
export async function drawOuting(o, s) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  try { await document.fonts?.load?.('700 64px "Bricolage Grotesque"'); } catch {}
  const display = '"Bricolage Grotesque", Manrope, system-ui, sans-serif', body = 'Manrope, system-ui, sans-serif';
  // plum ground with a clementine cut across the corner: ten segments
  g.fillStyle = '#17121a'; g.fillRect(0, 0, W, H);
  const cx = W - 120, cy = 150, R1 = 300;
  for (let i = 0; i < 10; i++) { const a0 = i / 10 * Math.PI * 2 + 0.05, a1 = (i + 1) / 10 * Math.PI * 2 - 0.05; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R1, a0 - Math.PI / 2, a1 - Math.PI / 2); g.closePath(); g.fillStyle = i % 2 ? '#ff6a3d' : '#ff8459'; g.globalAlpha = 0.9; g.fill(); }
  g.globalAlpha = 1; g.beginPath(); g.arc(cx, cy, 46, 0, Math.PI * 2); g.fillStyle = '#ffd9c2'; g.fill();
  const d = fromKey(o.date), x0 = 90; let y = 520;
  g.fillStyle = '#ffd9c2'; g.font = `600 44px ${body}`; g.fillText(`${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${o.start != null ? `, ${F.hhmm(o.start)}` : ''}`, x0, y); y += 110;
  g.fillStyle = '#fff6f0'; g.font = `800 112px ${display}`; for (const l of wrap(g, o.what || 'Meet up', W - 2 * x0).slice(0, 2)) { g.fillText(l, x0, y); y += 120; }
  if (o.where) { g.fillStyle = '#c9b8c9'; g.font = `500 46px ${body}`; g.fillText(`at ${o.where}`, x0, y); y += 90; }
  // faces in their ring colours
  y += 30; const who = o.who.map(id => ({ id, name: F.nameOn(s, o, id), full: s.friends?.[id]?.name || F.nameOn(s, o, id) }));
  who.slice(0, 8).forEach((p, i) => { const px = x0 + 60 + i * 118, py = y; g.beginPath(); g.arc(px, py, 52, 0, Math.PI * 2); g.fillStyle = `hsl(${hueOf(p.full)} 45% 30%)`; g.fill(); g.lineWidth = 7; g.strokeStyle = `hsl(${hueOf(p.full)} 75% 62%)`; g.stroke(); g.fillStyle = '#fff6f0'; g.font = `700 40px ${body}`; g.textAlign = 'center'; g.fillText(p.name.slice(0, 1).toUpperCase(), px, py + 14); g.textAlign = 'left'; });
  y += 110; g.fillStyle = '#e9dbe6'; g.font = `500 40px ${body}`; for (const l of wrap(g, who.map(p => p.name).join(', ') || 'Everyone welcome', W - 2 * x0).slice(0, 2)) { g.fillText(l, x0, y); y += 54; }
  if (o.bring?.length) { y += 40; g.fillStyle = '#ffd9c2'; g.font = `700 40px ${body}`; g.fillText('Who brings what', x0, y); y += 60; g.font = `500 38px ${body}`; for (const b of o.bring.slice(0, 6)) { g.fillStyle = b.done ? '#7fd3a0' : '#e9dbe6'; g.fillText(`${b.done ? '✓' : '•'}  ${b.item}${b.who ? ` — ${b.who === 'me' ? 'me' : F.nameOn(s, o, b.who)}` : ''}`, x0, y); y += 52; } }
  g.fillStyle = '#8f7f90'; g.font = `600 30px ${body}`; g.fillText('Planned with Clementine', x0, H - 80);
  return new Promise(r => c.toBlob(r, 'image/png'));
}
/** Share the card (phone Share sheet) or download it. */
export async function shareOuting(o, s) {
  if (!o) return;
  try {
    const blob = await drawOuting(o, s), file = new File([blob], `clementine-${o.date}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: o.what || 'Meet up' }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); toast('Card saved as a picture');
  } catch (e) { if (e?.name !== 'AbortError') toast('The card could not be made', 'err'); }
}
