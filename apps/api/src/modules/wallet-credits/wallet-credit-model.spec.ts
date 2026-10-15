import { backoffMs, causeOfKey, needsOrderMarker, orderIdOfKey, walletKey } from './wallet-credit-model.js';

describe('wallet credit keys (D34)', () => {
  it('one key per order + cause occurrence', () => {
    expect(walletKey.gateway('O1', 'A9')).toBe('gw:O1:A9');
    expect(walletKey.cancel('O1')).toBe('cancel:O1');
    expect(walletKey.recount('O1', 2)).toBe('recount:O1:2');
    expect(walletKey.due('O1', 'r-1')).toBe('due:O1:r-1');
    expect(walletKey.dueBack('due:O1:r-1')).toBe('dueback:due:O1:r-1');
  });
  it('every credit but the D35 debit and its reversal waits for its order marker', () => {
    for (const c of ['gateway_mismatch', 'gateway_capture', 'cancel_refund', 'recount_refund'] as const) expect(needsOrderMarker(c)).toBe(true);
    expect(needsOrderMarker('due_wallet')).toBe(false);
    expect(needsOrderMarker('due_reversal')).toBe(false);
  });
});

describe('wallet credit helpers', () => {
  it('backs off exponentially, capped at 30 minutes', () => {
    expect(backoffMs(0)).toBe(60_000);
    expect(backoffMs(2)).toBe(240_000);
    expect(backoffMs(10)).toBe(30 * 60_000);
  });
  it('reads the order id out of every key shape', () => {
    const id = 'a'.repeat(24);
    for (const k of [walletKey.gateway(id, 'A1'), walletKey.cancel(id), walletKey.recount(id, 1), walletKey.due(id, 'r'), walletKey.dueBack(walletKey.due(id, 'r'))]) expect(orderIdOfKey(k)).toBe(id);
    expect(orderIdOfKey('k1')).toBeNull();
    expect(causeOfKey(walletKey.cancel(id))).toBe('cancel_refund');
    expect(causeOfKey(walletKey.dueBack('due:x'))).toBe('due_reversal');
  });
});
