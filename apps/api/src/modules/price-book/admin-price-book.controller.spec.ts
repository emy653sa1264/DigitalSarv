import { ForbiddenException } from '@nestjs/common';
import { AdminPriceBookController } from './admin-price-book.controller.js';

describe('AdminPriceBookController.preview', () => {
  const user = { id: 'u1' } as never;
  function setup(allowed: string[]) {
    const book = {
      assertCan: vi.fn(async (_id: string, p: string) => { if (!allowed.includes(p)) throw new ForbiddenException(); }),
      preview: vi.fn(async () => ({ unitPrice: 1 })),
    };
    return { book, ctl: new AdminPriceBookController(book as never) };
  }
  it('a provider-based preview requires provider_price_view (403 otherwise)', async () => {
    const { ctl, book } = setup(['customer_price_view']);
    await expect(ctl.preview({ comboKey: 'bw|A4|single', mode: 'fixed_markup', baseProviderId: 'p1' } as never, user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(book.preview).not.toHaveBeenCalled();
  });
  it('allows it with provider_price_view, and a plain preview needs only the layer view', async () => {
    const full = setup(['customer_price_view', 'provider_price_view']);
    await expect(full.ctl.preview({ comboKey: 'bw|A4|single', mode: 'fixed_markup', baseProviderId: 'p1' } as never, user)).resolves.toEqual({ unitPrice: 1 });
    const plain = setup(['customer_price_view']);
    await expect(plain.ctl.preview({ comboKey: 'bw|A4|single', mode: 'manual', price: 1 } as never, user)).resolves.toEqual({ unitPrice: 1 });
  });
});
