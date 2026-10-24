# Agent notes · cursor-zh-offline

This is an independent integration derived from the projects credited in LICENSE and NOTICE. The upstream marketplace identity is reference material only. Its public source repository is <https://github.com/Txk1001/cursor-zh-offline>. Marketplace publication remains disabled.

## Scope and source of truth

- Preserve `scripts/translate-install.mjs` as the hardcoded UI installer, with its locale dictionaries. Do not replace the engine wholesale.
- Keep `config.json`, `package.json` and the lockfile root versions equal.
- Current full patch targets Windows x64 and the explicit `runtimeVerifiedCursorVersions`. Metadata coverage is not runtime acceptance. Never add a version merely to bypass rejection.
- Keep originals, placeholders, code, commands and paths intact. Machine translations must remain identified as unreviewed.
- New implementation or fixture evidence is not proof of a successful native UI test. Record untested environments explicitly.

## Repository hygiene

- Commit `metadata/community-sources.json`: it is public provenance. Do not commit other locally extracted metadata.
- Never commit tokens, `connection.json`, chat databases, personal translation catalogs, user paths, installation ledgers, backups, logs or runtime caches.
- Keep `upstream/`, `dist/`, `offline/assets/`, `node_modules/` and `reports/` out of git. The release builder explicitly selects redistributable files.
- Use artificial public fixtures, not a user's conversation history.
- Preserve third-party attribution and licenses. Do not distribute original Cursor program files.

## Checks and delivery

Run relevant tests, `npm run check:repo`, the build/validation checks and package validation before delivery. Follow [contribution guidance](CONTRIBUTING.md) and [release documentation](docs/publishing.zh-CN.md).

The source ZIP must build from a clean checkout using the pinned upstream and lockfile; it must not depend on local reports or extracted metadata. Full offline ZIP and VSIX are release assets, not source commits.

Do not push, tag, create a public repository or publish extensions without the user's authorization. Local source delivery does not imply permission to publish. `release.marketplaceEnabled` remains false. No `OVSX_PAT` or `VSCE_PAT` is required by this project's GitHub release workflow; never reuse upstream credentials.

## After a Cursor update

Extract new local metadata, inspect resource and key changes, update translations and stable anchors, exercise failure recovery and check real UI. Only after acceptance should a new runtime version be admitted. Keep rollback scoped to the installation and commit. Update the compatibility table and validation evidence.

Use concise Chinese commit descriptions explaining the behavior changed and why.
