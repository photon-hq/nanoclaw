# Remove Photon (iMessage)

Photon is a **first-party** channel: the adapter (`src/channels/photon.ts`), its barrel import, tests, and the setup wizard (`scripts/photon-setup.ts`) ship in trunk and are NOT deleted here — removing them would diverge from upstream. Instead, this reverses what `/add-photon` added (the runtime SDK + credentials), which returns the channel to its dormant, shipped-but-inactive state.

Every step is idempotent — safe to re-run.

## 1. Remove credentials

Delete the `PHOTON_*` lines from `.env` (skip any not present):

```bash
PHOTON_PROJECT_ID
PHOTON_PROJECT_SECRET
PHOTON_MARKDOWN
PHOTON_TELEMETRY
PHOTON_MAX_INLINE_ATTACHMENT_BYTES
PHOTON_DASHBOARD_HOST
PHOTON_SPECTRUM_HOST
```

Without `PHOTON_PROJECT_ID` + `PHOTON_PROJECT_SECRET`, the adapter's factory returns null at startup and the channel stays offline — the trunk code remains but does nothing.

## 2. Remove the cached device token (optional)

```bash
rm -f data/photon-auth.json
```

## 3. Uninstall the runtime SDK (optional)

```bash
pnpm remove spectrum-ts
```

Leaving it installed is harmless — the adapter only loads it when credentials exist.

## 4. Rebuild and restart

Run from your NanoClaw project root:

```bash
pnpm run build
source setup/lib/install-slug.sh

# Linux
systemctl --user restart $(systemd_unit)

# macOS
launchctl kickstart -k gui/$(id -u)/$(launchd_label)
```

## 5. Unwire and delete the messaging group (optional)

If you wired a Photon DM/group to an agent, remove the join row and the messaging group:

```bash
pnpm exec tsx scripts/q.ts data/v2.db "
DELETE FROM messaging_group_agents WHERE messaging_group_id IN
  (SELECT id FROM messaging_groups WHERE channel_type='photon');
DELETE FROM messaging_groups WHERE channel_type='photon';
"
```

## 6. Delete the Photon project (optional)

To fully deprovision, delete the `NanoClaw` project from the [Photon dashboard](https://app.photon.codes). This releases the iMessage line.
