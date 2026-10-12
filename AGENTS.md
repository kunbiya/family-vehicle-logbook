# Family vehicle logbook

- The live app remains hosted by OpenAI Sites, project `appgprj_6acc46d603888191b969ed8dda1b4de3`. This public GitHub repository is its source backup. Preserve Sites hosting, environment variables, and D1.
- The user chose manual, direct updates to `main`. Do not automatically synchronize after Site edits. When the user asks to push the updated code to this repository, inspect current main and commit the latest requested Sites source directly to main without force-pushing.
- Do not use the historical `sites-sync` branch or re-enable Actions synchronization unless explicitly requested. Its workflow has been removed from both branches. The export/validation helpers and historical state may remain as references.
- Preserve repository documentation and pipeline-independent metadata. Account for source file deletions when applying a requested snapshot; avoid deleting unrelated user files.
- Never publish runtime environment values, family password/session secrets, Sites credentials, actual records, or database dumps. Review committed source before transmitting it to this public repository.
- Verify the GitHub commit and files before reporting a requested push complete. Report access failures accurately.
