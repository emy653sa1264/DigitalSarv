/** v4.4 recoverable wallet credits (D34, S1) — pure: causes, states, keys and timings. No Mongo here. */

export const WALLET_CREDIT_CAUSES = ['gateway_mismatch', 'gateway_capture', 'cancel_refund', 'recount_refund', 'due_wallet', 'due_reversal'] as const;
export type WalletCreditCause = (typeof WALLET_CREDIT_CAUSES)[number];
export const WALLET_CREDIT_STATES = ['pending', 'done', 'void', 'reversed'] as const;
export type WalletCreditState = (typeof WALLET_CREDIT_STATES)[number];

/** The sweep leaves fresh intents to the request that wrote them. */
export const SWEEP_AFTER_MS = 60_000;
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
