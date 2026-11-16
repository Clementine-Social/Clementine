# Clementine — Social & People

The people app of the citrus family, split out of Citrus Maxima on 16/11/2026. Clementine owns every contact card and everything social:

- **Today** — who is free with you today (around your shift and post-night sleep), meet-ups coming up, "did it happen?" for past plans, birthdays and friends you have not seen for a while, open polls, the best times this week.
- **Free** — the who-is-free grid for friends, family or colleagues, a day sheet with everyone on one timeline, and **Find a day** for any mix of friends, family, colleagues and nurses.
- **People** — friends and family (phone, WhatsApp, Snapchat, Instagram, birthday, notes, keep-in-touch gap, hand-entered shifts or weekly days off), every colleague in the roster with their contact card, birthdays, and saved groups.
- **Outings** — planned meet-ups and the last-seen log.
- **Plans** — time polls you send on WhatsApp, the wishlist (places, trips, things to try), and team treats.

## How it fits with the other apps

One Google Drive tree for every app (see `HUB.md` in Citrus). Clementine writes only `My Apps/hub/clementine/`:

| File | For | What is in it |
|---|---|---|
| `state.json` | Clementine on your other devices (and Mandarin's read-only contact buttons) | everything Clementine keeps (merged per record, newest edit wins) |
| `status.json` | Citrus (contract v2) | one-line summary, next meet-up, pending items (birthdays, outings to confirm, overdue friends, polls), birthday tasks offered to Citrus, metrics, deep links |
| `contacts.json` | Mandarin, Citrus | phone, WhatsApp, Snapchat, Instagram and nickname by rota key — never notes |
| `backups/state-YYYY-MM-DD.json` | you | one copy a day, newest 14, plus a copy before a migration or restore |

Clementine **reads** only `hub/mandarin/shifts.json` (your days, the roster by rota key, the GP legend) and, once, `hub/citrus/state.json` to bring friends, contact cards, outings, polls, the wishlist, treats and the Social timing over (with Undo).

Deep links: `…/Clementine/?from=citrus&do=today|free|find|invite|log|outings|birthdays|people|colleagues|groups|plans|poll|add`.

## Development

Vanilla ES modules in `docs/`, no build step; GitHub Pages serves `/docs` from `main`.

```
bash test/all.sh      # every test; deploy only when it passes
sh scripts-bump.sh    # before each deploy: module list and cache name in the service worker
```

Browser tests use Playwright and an in-memory Google (`test/fake-google.mjs`), with made-up people in `test/fixture.mjs`. No real names, phone numbers or handles in the repo.
