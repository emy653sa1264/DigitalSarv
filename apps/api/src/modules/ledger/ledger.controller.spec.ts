import { PERMISSIONS_KEY, ROLES_KEY } from '../../common/auth/decorators.js';
import { PermissionsGuard } from '../../common/auth/permissions.guard.js';
import { AdminLedgerController } from './ledger.controller.js';

/** D33: every admin ledger route names its permission (grows with Tasks 10–12). */
export const ADMIN_LEDGER_PERMISSIONS: Record<string, string[]> = {
  balances: ['ledger_view'], provider: ['ledger_view'], entries: ['ledger_view'], statement: ['ledger_view'], pending: ['ledger_view'],
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
