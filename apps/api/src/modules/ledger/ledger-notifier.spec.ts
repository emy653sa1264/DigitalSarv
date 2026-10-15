import { Types } from 'mongoose';
import { fakeModel } from '../../../test/fake-model.js';
import { LedgerNotifier } from './ledger-notifier.js';

const P = new Types.ObjectId();
const U = new Types.ObjectId();

function setup(center: object | null = { _id: P, userId: U }) {
  const centers = fakeModel(center ? [center as never] : []);
  const notifications = { notify: vi.fn(async () => undefined) };
  return { n: new LedgerNotifier(notifications as never, centers as never), notifications };
}

describe('LedgerNotifier (D19, R12)', () => {
  it('sends the event to the linked user with the url, a tag and the amount suffix', async () => {
    const { n, notifications } = setup();
    await n.payout('payout_recorded', String(P), 1200000, 'e1');
    expect(notifications.notify).toHaveBeenCalledWith('payout_recorded', [U], { url: '/provider/settlement', tag: 'payout-e1' }, ` — ${(1200000).toLocaleString('fa-IR')} تومان`);
    await n.bankChanged(String(P), 'c1');
    expect(notifications.notify).toHaveBeenLastCalledWith('bank_account_changed', [U], { url: '/provider/settlement', tag: 'bank-c1' }, '');
  });
  it('does nothing without a linked user', async () => {
    const { n, notifications } = setup({ _id: P });
    await n.payout('payout_voided', String(P), 5, 'e1');
    expect(notifications.notify).not.toHaveBeenCalled();
  });
  it('swallows errors', async () => {
    const { n, notifications } = setup();
    notifications.notify.mockRejectedValueOnce(new Error('boom'));
    await expect(n.payout('payout_recorded', String(P), 5, 'e1')).resolves.toBeUndefined();
    await expect(setup(null).n.payout('payout_recorded', 'not-an-id', 5, 'e1')).resolves.toBeUndefined();
  });
});
