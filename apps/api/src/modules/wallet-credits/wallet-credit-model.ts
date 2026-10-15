/** v4.4 recoverable wallet credits (D34, S1) — pure: causes, states, keys and timings. No Mongo here. */

export const WALLET_CREDIT_CAUSES = ['gateway_mismatch', 'gateway_capture', 'cancel_refund', 'recount_refund', 'due_wallet', 'due_reversal'] as const;
export type WalletCreditCause = (typeof WALLET_CREDIT_CAUSES)[number];
export const WALLET_CREDIT_STATES = ['pending', 'done', 'void', 'reversed'] as const;
export type WalletCreditState = (typeof WALLET_CREDIT_STATES)[number];

/** The sweep leaves fresh intents to the request that wrote them. */
export const SWEEP_AFTER_MS = 60_000;
/** A gateway intent with no marker this old is finished by the sweep (it runs the deciding compare-and-set itself). */
export const GATEWAY_REPAIR_AFTER_MS = 5 * 60_000;
/** An intent whose order never took it (the deciding write lost or never ran) is void after this. */
export const MARKER_WAIT_MS = 24 * 3_600_000;
/** User keys of settled intents are kept this long (a stalled applier can never double-credit meanwhile). */
export const KEY_KEEP_MS = 7 * 86_400_000;
/** The sweep gives up on an intent after this many failed attempts (logged once; an admin settles it). */
export const MAX_ATTEMPTS = 20;
export const INSUFFICIENT_NOTE = 'insufficient wallet balance';

/** Contract v4.4 «Recoverable wallet credits»: one intent per key, ever. */
export const walletKey = {
  gateway: (orderId: string, authority: string) => `gw:${orderId}:${authority}`,
  cancel: (orderId: string) => `cancel:${orderId}`,
  recount: (orderId: string, n: number) => `recount:${orderId}:${n}`,
  due: (orderId: string, requestId: string) => `due:${orderId}:${requestId}`,
  dueBack: (dueKey: string) => `dueback:${dueKey}`,
};

/** Credits the deciding order write must confirm (its `creditKeys` holds the key) before the wallet moves. */
export const needsOrderMarker = (cause: WalletCreditCause): boolean => cause !== 'due_wallet' && cause !== 'due_reversal';

/** Transient errors back off exponentially, capped. `errors` = failures so far (0 -> first delay). */
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_MAX_MS = 30 * 60_000;
export const backoffMs = (errors: number): number => Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, errors));

/** The order id inside a key (every key type embeds it); null for a key that is not ours. */
export function orderIdOfKey(key: string): string | null {
  const parts = key.split(':');
  const id = parts[0] === 'dueback' ? parts[2] : parts[1];
  return id && /^[0-9a-f]{24}$/i.test(id) ? id : null;
}

/** The cause a revived (intent-less) credit had, from its key prefix. */
export function causeOfKey(key: string): WalletCreditCause {
  switch (key.split(':')[0]) {
    case 'cancel': return 'cancel_refund';
    case 'recount': return 'recount_refund';
    case 'due': return 'due_wallet';
    case 'dueback': return 'due_reversal';
    default: return 'gateway_capture';
  }
}

/** Retired key of a void intent: frees the real key for a later, legitimate credit. */
export const voidedKey = (key: string, id: unknown): string => `${key}~void~${String(id)}`;
