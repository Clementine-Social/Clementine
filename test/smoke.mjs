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
  for (const seg of ['Colleagues', 'Birthdays', 'Groups', 'Friends']) {
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
  await sheetCheck(() => p.click('#view-people .friend button[aria-label^="Edit"] >> nth=0'), 'friend editor');
  await p.click('#view-people .seg button:has-text("Colleagues")'); await sleep(200);
  await sheetCheck(() => p.click('#view-people .pp-row >> nth=0'), 'colleague card');
  await p.click('nav.tabs button[data-view=plans]'); await sleep(150);
  await sheetCheck(() => p.click('#view-plans button:has-text("New poll")'), 'new poll');
  await sheetCheck(() => p.click('#btnSearch'), 'search').catch(() => {});
  check(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
if (bad()) { console.log(`${bad()} smoke check(s) FAILED`); process.exit(1); }
