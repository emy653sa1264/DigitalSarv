import { tehranYmd } from '../../common/utils/dates.js';
import type { CampaignBlock } from '../pricing/pricing.types.js';

const ymdOf = (v: Date | string | undefined): string | null => {
  if (v === undefined) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : tehranYmd(d);
};

/**
 * Why a campaign's coupon cannot apply on `today` (a Tehran `yyyy-mm-dd`), v3.3: before `startsAt` or
 * after `endsAt` — compared as Tehran calendar days, both inclusive — or `dailyCapacity` (> 0) already
 * reached by `usedToday` orders. `undefined` = it applies.
 */
export function campaignBlock(
  c: { startsAt?: Date | string; endsAt?: Date | string; dailyCapacity?: number },
  today: string = tehranYmd(),
  usedToday = 0,
): CampaignBlock | undefined {
  const start = ymdOf(c.startsAt);
  const end = ymdOf(c.endsAt);
  if (start && today < start) return 'not_started';
  if (end && today > end) return 'expired';
  if ((c.dailyCapacity ?? 0) > 0 && usedToday >= (c.dailyCapacity ?? 0)) return 'full';
  return undefined;
}
