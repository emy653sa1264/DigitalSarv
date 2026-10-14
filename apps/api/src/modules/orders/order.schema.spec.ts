import { model } from 'mongoose';
import { OrderSchema } from './order.schema.js';

describe('Order v4.2 schema', () => {
  it('the provider-price snapshot is never selected by a default (customer) query', () => {
    expect(OrderSchema.path('providerPricing').options.select).toBe(false);
    const M = model('OrderSchemaSpec', OrderSchema);
    const q = M.find({}) as unknown as { _applyPaths: () => void; _fields?: Record<string, number> };
    q._applyPaths();
    expect(q._fields).toMatchObject({ providerPricing: 0 });
  });

  it('delivery is optional (pre-v4.2 orders have none) and a pickup slot is optional', () => {
    expect(OrderSchema.path('delivery').isRequired).toBeFalsy();
    expect(OrderSchema.path('pickup.date').isRequired).toBeFalsy();
    expect(OrderSchema.path('pickup.slot').isRequired).toBeFalsy();
  });
});
