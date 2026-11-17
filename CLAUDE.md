# Clementine — notes for Claude

- Owner's app: Social & People, split from Citrus Maxima (Amaerys/citrus-maxima) on 16/11/2026, after Mandarin. Plain English in the UI, dates dd/mm/yyyy, metric.
- One data owner per kind: every contact card (friends, family, colleagues, nurses), friends and groups, outings, polls, wishlist, treats, birthdays → Clementine. Shifts and rotas → Mandarin (read from `hub/mandarin/shifts.json` by `roster.js`). Goals → Citrus Plan. Never write into another app's Drive folder.
- Folders are found by tag (`claude/drive-layout.md`): `appProperties.citrusApp`, oldest if twins, old path `My Apps/hub/<id>` only as a fallback (google.js `appFolder`). Clementine tags only its own folder, never moves or renames it, never creates My Apps once a tag exists; status.json says `drive.byTag: true`.
- Drive contract: `HUB.md` in the Citrus repo. Clementine writes `My Apps/hub/clementine/{state,status,contacts}.json` and `backups/`. Mandarin reads Clementine's `state.json` (contacts + friends) for its Call/WhatsApp buttons; keep those two collections' shapes stable.
- Cards link to rota rows by rota key: `id:<staff id>` or `name:<lower-case name>`, the same keys Mandarin uses.
- Before every deploy: `bash test/all.sh` must pass, then `sh scripts-bump.sh` (service worker module list and cache name).
- Never commit real names, phone numbers, handles or staff IDs: tests use made-up people (`test/fixture.mjs`); real data stays out of the repo (`test/data/` is git-ignored).
- Browser tests pin the clock (`page.clock.install`) and run in Asia/Riyadh.
- Keep `tools/check-imports.mjs` green: every named import and `X.name` use must exist.
- Add seminal upgrades to the App Building Master Log (skill: app-master-log).
