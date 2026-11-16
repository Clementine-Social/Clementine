# Clementine — Social & People

The people app of the citrus family, split out of Citrus Maxima on 16/11/2026. Clementine owns every contact card and everything social:

- **Today**: the faces free with you today, each in a ring that lights up for how much of the day you are both free. This week at a glance: your shift each day and who is free with you. Plans coming up, "did it happen?", reminders (birthdays and other dates, money owed, friends you have not been in touch with), open polls, the best times. One tap to plan a meet-up, log a call, log an outing, share your free time, or find a day.
- **Free**: the who-is-free grid for friends, family or colleagues, a day sheet with everyone on one timeline, and **Find a day** for any mix of friends, family, colleagues and nurses.
- **People**: friends and family as rows. Tap one for their **profile**: reach them, when you are free together, their dates, gift ideas, money between you, notes, and everything you did together. Also: every colleague in the roster with their contact card, a birthdays-and-dates calendar, and saved groups.
- **Outings**: plans coming up, money (who owes whom from shared bills, settle up), your year (meet-ups per month, who you saw most, favourite spots), the history, and calls and messages.
- **Plans**: time polls (picking a time creates the plan and the calendar event), the wishlist, and team treats.
- **Sheets that do the work**: plan a meet-up (one time → a plan on your calendar; several → a poll); an outing with who brings what and the bill split; a share card picture for WhatsApp; share my free time as text; log a call or message (it counts as being in touch).

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

Design: the citrus family's Manrope and Arcade / Clean / Paper interfaces, in Clementine's own palette (plum-ink, clementine, pith, leaf), Bricolage Grotesque for headings, and the segmented avatar ring (one hue per person).

## Development

Vanilla ES modules in `docs/`, no build step; GitHub Pages serves `/docs` from `main`.

```
bash test/all.sh      # every test; deploy only when it passes
sh scripts-bump.sh    # before each deploy: module list and cache name in the service worker
```

Browser tests use Playwright and an in-memory Google (`test/fake-google.mjs`), with made-up people in `test/fixture.mjs`. No real names, phone numbers or handles in the repo.
