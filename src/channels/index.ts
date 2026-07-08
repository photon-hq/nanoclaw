// Channel self-registration barrel.
// Each import triggers the channel module's registerChannelAdapter() call.
//
// Main ships two first-party channels — `cli`, the always-on local-terminal
// channel, and `photon`, the native iMessage channel (dormant until creds
// exist; enable with /add-photon). Other channel skills (/add-slack,
// /add-discord, /add-whatsapp, ...) copy their module from the `channels`
// branch and append a self-registration import below.

import './cli.js';
import './photon.js';
