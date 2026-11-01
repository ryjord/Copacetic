import type { EnginePage } from '../engine/views';
import type { WebRtcPolicy } from '../../shared/types';

/** Chromium's names for each choice. */
const CHROMIUM_POLICIES = {
  publicOnly: 'default_public_interface_only',
  default: 'default',
  proxiedOnly: 'disable_non_proxied_udp',
} as const satisfies Record<WebRtcPolicy, Parameters<EnginePage['setWebRTCIPHandlingPolicy']>[0]>;

export function applyWebRtcPolicy(contents: EnginePage, policy: WebRtcPolicy): void {
  if (!contents.isDestroyed()) {
    contents.setWebRTCIPHandlingPolicy(CHROMIUM_POLICIES[policy]);
  }
}
