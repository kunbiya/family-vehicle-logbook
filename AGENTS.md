# Family vehicle logbook

- The live app remains hosted by OpenAI Sites, project `appgprj_6acc46d603888191b969ed8dda1b4de3`. GitHub is its public source backup; do not deploy GitHub changes to another host.
- For work that edits and publishes this Site, finish the normal Sites save/deploy workflow first. Then export the exact successfully published source commit and version with `.github/scripts/sites_sync.py` from GitHub `main`, and write the resulting snapshot to this repository's `sites-sync` branch. See `docs/sites-sync.md` for the full procedure.
- Preserve `.github`, README.md, AGENTS.md, `.gitignore`, `.env.example`, and docs when creating incoming snapshots. Use a single normal commit, preserve the incoming branch workflow, and do not force-push.
- Check the `Sync Sites source` Actions result and main's `.sites-sync/state.json` before reporting synchronization complete. Report any GitHub access or pipeline failure without claiming success.
- Never send runtime environment values, family password/session secrets, Sites source credentials, actual records or database dumps to this public repository. The exporter validates tracked committed source; inspect new files before transmission.
- This pipeline cannot independently watch Sites. It runs after the authoring session delivers a source snapshot, or on manual dispatch against the latest already-delivered snapshot.
