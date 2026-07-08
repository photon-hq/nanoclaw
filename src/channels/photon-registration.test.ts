/**
 * Integration test for the photon channel's barrel reach-in: the
 * self-registration import in `src/channels/index.ts`. Importing the barrel
 * runs photon.ts's top-level `registerChannelAdapter('photon', …)`; without
 * the import the channel is silently absent.
 *
 * Behavior, not structural: it imports the real barrel and asserts the
 * registry actually contains the channel. It goes red if the
 * `import './photon.js';` line is deleted or drifts, or if the barrel fails to
 * evaluate (so the channel genuinely would not register).
 *
 * photon is first-party and ships in trunk's barrel, so — unlike the
 * skill-installed channels — this test runs in CI. It requires NO npm
 * dependency: registration is a pure top-level call, and photon.ts loads
 * `spectrum-ts` only via a runtime dynamic import inside setup() (never at
 * module load). That's what lets the barrel evaluate before /add-photon has
 * installed the SDK.
 */
import { describe, it, expect } from 'vitest';

import { getRegisteredChannelNames } from './channel-registry.js';
import './index.js'; // the real barrel — triggers every channel's self-registration

describe('photon channel registration', () => {
  it('registers photon via the channel barrel', () => {
    expect(getRegisteredChannelNames()).toContain('photon');
  });
});
