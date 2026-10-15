import { PERMISSIONS_KEY, ROLES_KEY } from '../../common/auth/decorators.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { AdminLedgerController } from './ledger.controller.js';

/** D33: every admin ledger route names its permission (grows with Tasks 10–12). */
export const ADMIN_LEDGER_PERMISSIONS: Record<string, string[]> = {
  balances: ['ledger_view'], walletReport: ['ledger_view'], walletExport: ['ledger_view'], provider: ['ledger_view'], entries: ['ledger_view'], statement: ['ledger_view'], pending: ['ledger_view'],
  resolve: ['ledger_adjust'], compensation: ['ledger_view'], decideCompensation: ['ledger_adjust'], adjust: ['ledger_adjust'],
  recordPayout: ['payout_record'], voidPayout: ['payout_record'], setBank: ['payout_record'],
};

describe('AdminLedgerController (D33)', () => {
  it('is admin-only behind the PermissionsGuard, and every route names its permission', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminLedgerController)).toEqual(['admin']);
    expect(Reflect.getMetadata('__guards__', AdminLedgerController)).toContain(PermissionsGuard); // Nest's GUARDS_METADATA
    const proto = AdminLedgerController.prototype as unknown as Record<string, object>;
    for (const [m, p] of Object.entries(ADMIN_LEDGER_PERMISSIONS)) expect(Reflect.getMetadata(PERMISSIONS_KEY, proto[m]), m).toEqual(p);
    const routes = Object.getOwnPropertyNames(AdminLedgerController.prototype).filter((m) => m !== 'constructor');
    expect(routes.sort()).toEqual(Object.keys(ADMIN_LEDGER_PERMISSIONS).sort()); // no route without a permission
  });
});

describe('final wave — 403 behaviour and query bounds', () => {
  it('a dispatch_view-only admin is refused on every admin ledger route (Persian 403); ledger_view opens only the reads', async () => {
    const { Reflector } = await import('@nestjs/core');
    const { ForbiddenException } = await import('@nestjs/common');
    const { Types } = await import('mongoose');
    const { fakeModel } = await import('../../../test/fake-model.js');
    const [dispatchOnly, viewer] = [new Types.ObjectId(), new Types.ObjectId()];
    const users = fakeModel([{ _id: dispatchOnly, role: 'admin', permissions: ['dispatch_view'] }, { _id: viewer, role: 'admin', permissions: ['ledger_view'] }]);
    const guard = new PermissionsGuard(new Reflector(), users as never);
    const proto = AdminLedgerController.prototype as unknown as Record<string, () => void>;
    const ctx = (m: string, id: unknown) => ({
      getHandler: () => proto[m], getClass: () => AdminLedgerController,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: String(id), role: 'admin' } }) }),
    }) as never;
    for (const m of Object.keys(ADMIN_LEDGER_PERMISSIONS)) {
      await expect(guard.canActivate(ctx(m, dispatchOnly)), m).rejects.toThrow(new ForbiddenException('به این بخش دسترسی ندارید'));
      const reads = ADMIN_LEDGER_PERMISSIONS[m].includes('ledger_view');
      if (reads) await expect(guard.canActivate(ctx(m, viewer)), m).resolves.toBe(true);
      else await expect(guard.canActivate(ctx(m, viewer)), m).rejects.toThrow(ForbiddenException);
    }
  });
  it('the search term of the ledger lists is at most 100 characters', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { LedgerPageQueryDto, LedgerEntriesQueryDto } = await import('./dto/ledger.dto.js');
    for (const Dto of [LedgerPageQueryDto, LedgerEntriesQueryDto]) {
      expect(await validate(plainToInstance(Dto, { q: 'ن'.repeat(100) }))).toHaveLength(0);
      const errs = await validate(plainToInstance(Dto, { q: 'ن'.repeat(101) }));
      expect(errs[0].constraints).toEqual({ maxLength: 'عبارت جستجو حداکثر ۱۰۰ نویسه است' });
    }
  });
});
