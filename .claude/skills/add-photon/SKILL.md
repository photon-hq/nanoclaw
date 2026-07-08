---
name: add-photon
description: Add iMessage support via Photon — a first-party native channel. Runs a zero-friction setup wizard (device login + auto-provisions project, secret, phone, and iMessage line). No Mac relay, no webhook, no dashboard clicking. Triggers on "add photon", "add imessage", "photon", "imessage via photon".
---

# Add Photon (iMessage) Channel

Connect NanoClaw to **iMessage** through [Photon](https://photon.codes) — a managed service that owns the iMessage line, so you don't run a Mac relay. Photon's free shared-line pool means anyone can get started without a paid plan.

Unlike the community `/add-imessage` skill (which drives Photon through the Chat SDK bridge in "remote mode"), this is a **first-party native adapter** (`src/channels/photon.ts`, already shipped in trunk) that speaks Photon's `spectrum-ts` gRPC stream directly on the host — both directions, no webhook, no public URL, no signing secret. It also comes with a **setup wizard** that does all the Photon account provisioning for you.

## How it works

- **Persistent connection.** `spectrum-ts` holds a long-lived gRPC stream to Photon. Inbound iMessages arrive on the SDK's `app.messages` stream; replies go out over the same connection. Like Discord/Slack, there's nothing to expose to the internet.
- **Host-side only.** Credentials (`PHOTON_PROJECT_ID`, `PHOTON_PROJECT_SECRET`) live in `.env` and are read on the host — they never enter an agent container.
- **First-party.** The adapter is in trunk and already wired into the channel barrel (`src/channels/index.ts`). It stays dormant until credentials exist, so this skill is mostly: install the SDK, run the wizard, wire an agent.

## Pre-flight (idempotent)

These already ship in trunk — verify, don't re-create:

- `src/channels/photon.ts` exists
- `src/channels/photon-registration.test.ts` exists
- `src/channels/index.ts` contains `import './photon.js';`
- `scripts/photon-setup.ts` exists (the setup wizard)

If `spectrum-ts` is already in `package.json` and `.env` has `PHOTON_PROJECT_ID` + `PHOTON_PROJECT_SECRET`, skip to **Wiring**. Every step below is safe to re-run.

## 1. Install the runtime SDK (pinned)

The adapter loads `spectrum-ts` at runtime; install it once:

```bash
pnpm install spectrum-ts@8.0.0
```

Pinned to an exact version — `spectrum-ts` ships breaking majors (v8 is what `src/channels/photon.ts` is written against). Don't `@latest`; bump deliberately.

> Supply-chain note: NanoClaw's pnpm gate (`minimumReleaseAge`) requires a version to be ≥3 days old. `8.0.0` clears it. If a newer pin is needed and it's too fresh, either wait or get human sign-off before adding a `minimumReleaseAgeExclude` entry (see CLAUDE.md → Supply Chain Security).

## 2. Build and validate

```bash
pnpm run build
pnpm exec vitest run src/channels/photon-registration.test.ts src/channels/photon.test.ts
```

Both must be clean before proceeding. `photon-registration.test.ts` imports the real channel barrel and asserts the registry contains `photon` — it goes red if the `import './photon.js';` line is deleted or the barrel fails to evaluate. `photon.test.ts` drives the adapter end-to-end against a mocked SDK (inbound routing, outbound delivery, ask_question, reactions, typing).

## 3. Run the setup wizard

This is the zero-friction part. The wizard runs Photon's device-login flow, then finds/creates your project, mints the project secret, registers your phone, and surfaces the iMessage number you'll text — writing `PHOTON_PROJECT_ID` + `PHOTON_PROJECT_SECRET` to `.env` for you.

```bash
pnpm exec tsx scripts/photon-setup.ts --phone +15551234567
```

Replace `+15551234567` with your own iMessage phone number in E.164 format. Omit `--phone` to be prompted (interactive terminals only).

The wizard prints a URL and a code:

> Tell the user:
> 1. Open the printed URL (`https://app.photon.codes/...`) in a browser
> 2. Approve the device and enter the code shown
> 3. The wizard finishes automatically once you approve

When it completes it prints **your agent's iMessage number** — the number to text from your phone to reach the agent. It's also saved to `data/photon-auth.json`.

Flags: `--project-name <name>` (default `NanoClaw`), `--no-browser` (print the URL instead of auto-opening), `--non-interactive` (fail instead of prompting), `--dashboard-host` / `--spectrum-host` (override the Photon API hosts).

Check state any time:

```bash
pnpm exec tsx scripts/photon-setup.ts status
```

## 4. Restart the service

So the adapter picks up the new credentials and connects:

```bash
source setup/lib/install-slug.sh
# macOS
launchctl kickstart -k gui/$(id -u)/$(launchd_label)
# Linux
systemctl --user restart $(systemd_unit)
```

Confirm it connected:

```bash
grep "Photon channel connected" logs/nanoclaw.log | tail -1
```

## Wiring

Text your agent's iMessage number once from your phone. The router auto-creates a `messaging_groups` row for the DM. Then wire it to an agent — the wizard prints a ready-to-run command using your phone number:

```bash
npx tsx scripts/init-first-agent.ts \
  --channel photon \
  --user-id photon:+15551234567 \
  --platform-id +15551234567 \
  --display-name "You"
```

For Photon, DMs are direct-addressable: the DM `platform_id` is your bare E.164 number (e.g. `+15551234567`), and your user id is `photon:+15551234567`. Or run `/init-first-agent` / `/manage-channels` interactively.

## Next Steps

If you're in the middle of `/setup`, return to the setup flow now. Otherwise, run `/init-first-agent` to stand up an agent on your Photon DM, or `/manage-channels` to wire it to an existing agent group.

## Channel Info

- **type**: `photon`
- **terminology**: iMessage has 1:1 "chats" (DMs) and group chats. Photon calls each conversation a "space".
- **platform-id-format**:
  - DM: your E.164 phone number (e.g. `+15551234567`) — direct-addressable, no channel prefix
  - Group: the opaque Spectrum space id
- **how-to-find-id**: DMs use the counterpart's phone number. Groups are discovered on first message — `pnpm exec tsx scripts/q.ts data/v2.db "SELECT platform_id, name FROM messaging_groups WHERE channel_type='photon'"`
- **supports-threads**: no
- **typical-use**: Personal assistant over iMessage DMs, or small group chats
- **default-isolation**: One agent per Photon project. Multiple DMs with the same operator can share an agent group; groups with other people should typically use `isolated` session mode.

### Features

- Markdown formatting — sent natively (`PHOTON_MARKDOWN=false` to strip to plain text)
- File attachments — send and receive images, video, audio, documents (inbound cached to `data/attachments/`, capped by `PHOTON_MAX_INLINE_ATTACHMENT_BYTES`, default 20 MB)
- Reactions (tapbacks) — `send_reaction` maps to an iMessage tapback; inbound tapbacks arrive as `reaction:added:<emoji>`
- Approval questions — `ask_user_question` renders as text with `/approve`, `/reject` slash-command replies (iMessage has no buttons)
- Typing indicators — sent while the agent works

### Optional `.env` settings

```bash
# Send replies as plain text instead of markdown
PHOTON_MARKDOWN=false
# Enable Spectrum SDK telemetry (default off)
PHOTON_TELEMETRY=false
# Max inbound attachment bytes the adapter reads + caches (default 20 MB)
PHOTON_MAX_INLINE_ATTACHMENT_BYTES=20971520
# Override Photon API hosts (rarely needed)
PHOTON_DASHBOARD_HOST=https://app.photon.codes
PHOTON_SPECTRUM_HOST=https://spectrum.photon.codes
```

## Troubleshooting

### `spectrum-ts` is not installed

The channel logs an error at setup and stays offline. Run step 1 (`pnpm install spectrum-ts@8.0.0`) and restart.

### Bot not responding

1. Adapter connected: `grep "Photon channel connected" logs/nanoclaw.log | tail -1`
2. Credentials present: `pnpm exec tsx scripts/photon-setup.ts status`
3. Channel wired: `pnpm exec tsx scripts/q.ts data/v2.db "SELECT mg.platform_id, mg.name FROM messaging_groups mg JOIN messaging_group_agents mga ON mg.id=mga.messaging_group_id WHERE mg.channel_type='photon'"`
4. Service running: `systemctl --user status "$(. setup/lib/install-slug.sh && systemd_unit)"` (Linux) / `launchctl print gui/$(id -u)/"$(. setup/lib/install-slug.sh && launchd_label)"` (macOS)

### Device login times out

The code expires after ~30 minutes. Re-run `pnpm exec tsx scripts/photon-setup.ts` — a stored, still-valid token is reused, so a partial setup finishes cleanly.

### No iMessage line assigned

On a fresh project the shared line can take a moment to attach. Re-run `pnpm exec tsx scripts/photon-setup.ts status`, or check the [Photon dashboard](https://app.photon.codes). Text the surfaced number once you have it.

### Inbound messages stop arriving

The adapter re-subscribes to the gRPC stream automatically with backoff. If it persists, it's usually upstream (Photon Spectrum) — restart the service to force a fresh stream, and check the Photon status page.

## Upgrading spectrum-ts

`spectrum-ts` is pinned exactly because it ships breaking majors. To upgrade: read the [SDK release notes](https://github.com/photon-hq/spectrum-ts/releases) for every version between the current pin and the target, bump the pin in `package.json`, reconcile `src/channels/photon.ts` against the new typings (the adapter uses `Spectrum`, `imessage`, `text`/`markdown`/`typing`/`attachment`/`voice`, and `space.send`/`space.getMessage`/`react`), then run `pnpm run build` and `pnpm exec vitest run src/channels/photon.test.ts`.
