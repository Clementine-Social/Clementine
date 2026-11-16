// Every tab and the main sheets render at phone and desktop sizes with made-up people, with no page errors and no stray
// "undefined" / "NaN" / "null" on screen, and no sideways scroll. Run: node test/smoke.mjs
import { chromium, serve, page, sleep, checker } from './helpers.mjs';
import { shifts, state } from './fixture.mjs';
import fs from 'node:fs'; import path from 'node:path';
const shots = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'shots/smoke'); fs.rmSync(shots, { recursive: true, force: true }); fs.mkdirSync(shots, { recursive: true });
const { server, url } = await serve(), browser = await chromium.launch(), { check, bad } = checker();
const TABS = ['today', 'free', 'people', 'outings', 'plans', 'more'];
const clean = async (p, sel, what) => {
  const txt = await p.locator(sel).innerText();
  check(txt.length > 30, `${what} renders (${txt.length} chars)`);
  check(!/\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/.test(txt), `${what}: no undefined / NaN / null`);
  check(!/hit a problem|could not be shown/.test(txt), `${what}: no crash card`);
  return txt;
};
for (const [w, hgt, time] of [[390, 844, '2026-11-16T09:30:00+03:00'], [320, 640, '2026-11-18T02:30:00+03:00'], [1500, 900, '2026-11-16T19:30:00+03:00']]) {
  console.log(`${w}px at ${time.slice(5, 16)}`);
  const { p, ctx, errors } = await page(browser, { width: w, height: hgt, time, seed: state, shifts });
  await p.goto(url); await sleep(500);
  for (const t of TABS) {
    if (t === 'more') await p.click('#btnMore'); else await p.click(`nav.tabs button[data-view=${t}]`);
    await sleep(300);
    await clean(p, `#view-${t}`, t);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); check(over <= 1, `${t}: no sideways scroll (${over}px)`);
    await p.screenshot({ path: `${shots}/${w}-${t}.png`, fullPage: true });
  }
  for (const seg of ['Circles', 'Trees', 'Colleagues', 'Birthdays', 'Groups', 'Friends']) {
    await p.click('nav.tabs button[data-view=people]'); await sleep(100); await p.click(`#view-people .seg button:has-text("${seg}")`); await sleep(250);
    await clean(p, '#view-people', `People › ${seg}`); await p.screenshot({ path: `${shots}/${w}-people-${seg}.png`, fullPage: true });
  }
  for (const seg of ['Family', 'Colleagues', 'Friends']) { await p.click('nav.tabs button[data-view=free]'); await sleep(100); await p.click(`#view-free .seg button:has-text("${seg}")`); await sleep(250); await clean(p, '#view-free', `Free › ${seg}`); }
  // sheets
  const sheetCheck = async (open, what) => { await open(); await sleep(400); const t = await clean(p, '.sheet', what); await p.screenshot({ path: `${shots}/${w}-${what.replace(/\W+/g, '-')}.png` }); await p.keyboard.press('Escape'); await sleep(350); if (await p.locator('.sheet').count()) { await p.keyboard.press('Escape'); await sleep(350); } return t; };
  await p.click('nav.tabs button[data-view=free]'); await sleep(200);
  await sheetCheck(() => p.click('#view-free .sg-day >> nth=4'), 'day sheet');
  await sheetCheck(() => p.click('#view-free button:has-text("Find a day")'), 'find a day');
  await sheetCheck(() => p.click('#view-free .meet button:has-text("Invite") >> nth=0'), 'invite');
  await p.click('nav.tabs button[data-view=people]'); await sleep(150);
  await sheetCheck(() => p.click('#view-people .fr-row >> nth=0'), 'profile');
  await p.click('#view-people .fr-row >> nth=0'); await sleep(400); await p.click('.sheet .pf-acts button:has-text("Edit")'); await sleep(400);
  await clean(p, '.sheet', 'friend editor'); await p.screenshot({ path: `${shots}/${w}-friend-editor.png` }); await p.keyboard.press('Escape'); await sleep(350);
  await sheetCheck(async () => { await p.click('#view-people .fr-row >> nth=0'); await sleep(400); await p.click('.sheet .pf-face'); }, 'face editor');
  for (const t of ['Character', 'Emoji', 'Photo']) { await p.click('#view-people .fr-row >> nth=0'); await sleep(400); await p.click('.sheet .pf-face'); await sleep(400); await p.click(`.sheet .av-tabs button:has-text("${t}")`); await sleep(250); await clean(p, '.sheet', `face editor › ${t}`); await p.screenshot({ path: `${shots}/${w}-face-${t}.png` }); await p.keyboard.press('Escape'); await sleep(350); }
  await p.click('#view-people .seg button:has-text("Circles")'); await sleep(250);
  await sheetCheck(() => p.click('#view-people .ci-person >> nth=0'), 'circle picker');
  await p.click('#view-people .seg button:has-text("Trees")'); await sleep(250);
  check((await p.locator('#view-people .ft-tree').innerText()).includes('first cousin'), 'family tree works out a cousin');
  await sheetCheck(() => p.click('#view-people button:has-text("Add a link")'), 'add a family link');
  await sheetCheck(() => p.click('#view-people .ft-node:has-text("Mum")'), 'tree-only person');
  await p.click('#view-people .tr-seg button:has-text("Friend tree")'); await sleep(250);
  const ftx = await clean(p, '#view-people', 'friend tree'); check(/Nina[\s\S]*knows/.test(ftx), 'friend tree shows who introduced and who knows');
  await p.screenshot({ path: `${shots}/${w}-friend-tree.png`, fullPage: true });
  await sheetCheck(() => p.click('#view-people button:has-text("Who introduced who")'), 'friend link');
  await p.click('#view-people .tr-seg button:has-text("Family tree")'); await sleep(200);
  await p.click('#view-people .seg button:has-text("Friends")'); await sleep(250);
  await p.click('#view-people .fr-row >> nth=0'); await sleep(400);
  check(/Ask about next time[\s\S]*board exam/i.test(await p.locator('.sheet').innerText()), 'profile shows what to ask');
  await p.click('.sheet button:has-text("＋ Add") >> nth=0'); await sleep(400); await clean(p, '.sheet', 'life event'); await p.keyboard.press('Escape'); await sleep(350);
  await p.click('nav.tabs button[data-view=today]'); await sleep(200);
  check(/Ask about/.test(await p.locator('#view-today').innerText()), 'Today shows what to ask');
  await sheetCheck(() => p.click('#view-today .td-face >> nth=0'), 'face menu');
  await sheetCheck(() => p.click('#view-today .td-hero-top button:has-text("Edit")'), 'faces on Today');
  await sheetCheck(() => p.click('#view-today .td-acts button:has-text("Log a call")'), 'log a call');
  await sheetCheck(() => p.click('#view-today .td-acts button:has-text("Share my free time")'), 'share free time');
  await p.click('nav.tabs button[data-view=outings]'); await sleep(200);
  await sheetCheck(() => p.click('#view-outings .item.clickable >> nth=0'), 'outing sheet');
  await sheetCheck(() => p.click('#view-outings button:has-text("Settle up") >> nth=0'), 'settle up');
  await sheetCheck(() => p.click('#view-outings .card:has-text("Your places") .item >> nth=0'), 'place');
  check(/Stickers/.test(await p.locator('#view-outings').innerText()), 'stickers on Outings');
  await p.click('#view-outings .item:has-text("Padel") >> nth=0'); await sleep(400);
  if (await p.locator('.sheet .ob-rsvp').count()) { await p.click('.sheet .ob-rsvp'); await sleep(400); await clean(p, '.sheet', 'who is coming'); check(/No seafood/.test(await p.locator('.sheet').innerText()), 'food notes show for the host'); }
  await p.keyboard.press('Escape'); await sleep(350);
  await p.click('nav.tabs button[data-view=people]'); await sleep(200);
  await p.click('#view-people .seg button:has-text("Colleagues")'); await sleep(200);
  await sheetCheck(() => p.click('#view-people .pp-row >> nth=0'), 'colleague card');
  await p.click('nav.tabs button[data-view=plans]'); await sleep(150);
  await sheetCheck(() => p.click('#view-plans button:has-text("New poll")'), 'new poll');
  await sheetCheck(() => p.click('#btnSearch'), 'search').catch(() => {});
  await p.keyboard.press('Escape'); await sleep(350);
  // the Today face rules hold on screen: Q is set to Never, Nina to Always
  await p.click('nav.tabs button[data-view=today]'); await sleep(250);
  const facesTxt = await p.locator('#view-today .td-faces').innerText().catch(() => '');
  check(!/\bQ\b/.test(facesTxt) && /Nina/.test(facesTxt), `Today faces follow Always / Never (${facesTxt.replace(/\n/g, ' ').slice(0, 60)})`);
  check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
if (bad()) { console.log(`${bad()} smoke check(s) FAILED`); process.exit(1); }
