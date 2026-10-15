import { Types, model } from 'mongoose';
import { CenterSchema } from './center.schema.js';
import { centerListJson, providerAdminJson, providerSelfJson, type CenterRow } from './provider-json.js';
import { toJSONPlugin } from '../../common/mongo/to-json.plugin.js';

const SHEBA = 'IR062960000000100324200001';

describe('Center.bankAccount (v4.3 R7) is hidden by default', () => {
  const row = {
    _id: new Types.ObjectId(), name: 'چاپ نگین', status: 'active',
    bankAccount: { sheba: SHEBA, holder: 'علی رضایی', bankName: 'ملی', updatedAt: new Date() },
  } as unknown as CenterRow;

  it('the default query excludes it', () => {
    expect(CenterSchema.path('bankAccount').options.select).toBe(false);
    const M = model('CenterBankSpec', CenterSchema);
    const q = M.find({}) as unknown as { _applyPaths: () => void; _fields?: Record<string, number> };
    q._applyPaths();
    expect(q._fields).toMatchObject({ bankAccount: 0 });
  });

  it('the global toJSON plugin strips it even from a loaded document', () => {
    const schema = CenterSchema.clone();
    toJSONPlugin(schema);
    const M = model('CenterBankJsonSpec', schema);
    const json = new M({ name: 'x', bankAccount: { sheba: SHEBA, holder: 'h', bankName: 'b', updatedAt: new Date() } }).toJSON() as Record<string, unknown>;
    expect(json).not.toHaveProperty('bankAccount');
    expect(JSON.stringify(json)).not.toContain(SHEBA);
  });

  it('admin, self and list serializers never carry it', () => {
    const zones = new Map<string, string>();
    for (const out of [providerAdminJson(row, zones, null), providerSelfJson(row, zones), centerListJson(row)]) {
      const s = JSON.stringify(out);
      expect(s).not.toContain('bankAccount');
      expect(s).not.toContain(SHEBA);
    }
  });
});
