# Clementine — Social & People

The people app of the citrus family, split out of Citrus Maxima on 16/11/2026. Clementine owns every contact card and everything social:

- **Today**: the faces you choose (free with you today, favourites, or only people you pin; free soonest, most time together, most overdue, name, or your own order; Always / Auto / Never per person, and hide for today), each in a ring that lights up for how much of the day you are both free. The cards under it come in your order (Settings › Customise › Today). This week at a glance: your shift each day and who is free with you. Plans coming up, "did it happen?", things to **ask about** (due, or for people you see in the next two days), **this week years ago** (memories and yearly anniversaries), reminders (birthdays and other dates, money owed, friends you have not been in touch with), open polls, the best times. One tap to plan a meet-up, log a call, log an outing, share your free time, or find a day.
- **Free**: the who-is-free grid for friends, family or colleagues, a day sheet with everyone on one timeline, and **Find a day** for any mix of friends, family, colleagues and nurses.
- **People**: friends and family as rows. Tap one for their **profile**: reach them, when you are free together, their dates, gift ideas, money between you, notes, and everything you did together. Also: every colleague in the roster with their contact card, a birthdays-and-dates calendar (with **Get birthdays from Google**: reads the birthday and anniversary events Google Calendar makes from your Google Contacts, matches them to friends and colleagues, and saves what you tick), and saved groups. **Circles**: your people as rings of closeness (inner, close, friends, wider), each with its own keep-in-touch gap. **Trees**: a family tree that works out how anyone is related (aunt, first cousin once removed, sibling-in-law…), and a friend tree of who introduced whom and who knows whom. Profiles also hold their circle, life events (new job, a move, a baby, an exam… with a reminder to ask how it went), things to ask next time, how you met and food notes.
- **Outings**: plans coming up, money (who owes whom from shared bills, settle up), your year (meet-ups per month, who you saw most, favourite spots), **your places** (every place you met people, ranked by your ratings, with who you go with), **stickers** and your weeks-in-a-row streak, the history, and calls and messages.
- **Plans**: time polls (picking a time creates the plan and the calendar event), the wishlist, and team treats.
- **Sheets that do the work**: plan a meet-up (one time → a plan on your calendar; several → a poll); an outing with who brings what and the bill split; a share card picture for WhatsApp; who is coming (going / maybe / can’t, with the food notes of who is invited); share my free time as text; log a call or message (it counts as being in touch).

## How it fits with the other apps

One Google Drive tree for every app (see `HUB.md` in Citrus). Clementine writes only `My Apps/hub/clementine/`:

| File | For | What is in it |
|---|---|---|
| `state.json` | Clementine on your other devices (and Mandarin's read-only contact buttons) | everything Clementine keeps (merged per record, newest edit wins) |
| `status.json` | Citrus (contract v2) | one-line summary, next meet-up, pending items (birthdays, outings to confirm, overdue friends, polls), birthday tasks offered to Citrus, metrics, deep links |
| `contacts.json` | Mandarin, Citrus | phone, WhatsApp, Snapchat, Instagram and nickname by rota key — never notes |
| `backups/state-YYYY-MM-DD.json` | you | one copy a day, newest 14, plus a copy before a migration or restore |

Clementine **reads** only `hub/mandarin/shifts.json` (your days, the roster by rota key, the GP legend) and, once, `hub/citrus/state.json` to bring friends, contact cards, outings, polls, the wishlist, treats and the Social timing over (with Undo).

Deep links: `…/Clementine/?from=citrus&do=today|free|find|invite|log|call|share|outings|birthdays|people|colleagues|groups|plans|poll|add`.

Faces: initials, an emoji, a character you build (shape, eyes, mouth, something on top — leaf, bow, cap, ghutra, hijab, crown, headphones, curls), or a photo (cropped and shrunk on the device, kept only in Clementine's own state.json), with a ring colour of your choice. Your own face shows on Today.

Look (synced): accent (clementine, peach, berry, lime, sky, grape), bubbly or classic shapes, comfy or compact, celebrations on or off.

Design: the citrus family's Manrope and Arcade / Clean / Paper interfaces, in Clementine's own palette (plum-ink, clementine, pith, leaf), Bricolage Grotesque for headings, and the segmented avatar ring (one hue per person).

## Development

Vanilla ES modules in `docs/`, no build step; GitHub Pages serves `/docs` from `main`.

```
bash test/all.sh      # every test; deploy only when it passes
sh scripts-bump.sh    # before each deploy: module list and cache name in the service worker
```

Browser tests use Playwright and an in-memory Google (`test/fake-google.mjs`), with made-up people in `test/fixture.mjs`. No real names, phone numbers or handles in the repo.
