import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { fakeModel } from '../../../../test/fake-model.js';
import { FakeRedis, fakeRedisService } from '../../../../test/fake-redis.js';
import { CatalogService } from '../catalog.service.js';
import { UpdateSettingsDto } from './settings.dto.js';

describe('PickupPointDto id (ruling Q1)', () => {
  const body = { pickupPoints: [{ id: '', name: 'دفتر', address: 'تهران', phone: '۰۲۱۹۱۰۰۲۲۳۳', hours: '', on: true }] };

  it('an empty id validates and is treated as new', async () => {
    const dto = plainToInstance(UpdateSettingsDto, body);
    expect(await validate(dto, { whitelist: true })).toEqual([]);
    expect(dto.pickupPoints![0].id).toBeUndefined();

    const svc = new CatalogService(
      fakeModel() as never, fakeModel() as never, fakeModel() as never, fakeModel() as never, fakeModel() as never,
      fakeModel() as never, fakeModel([{ _id: 'main', prices: {} }]) as never, fakeModel() as never, fakeModel() as never, fakeModel() as never,
      fakeRedisService(new FakeRedis()),
    );
    const res = await svc.updateSettings(dto);
    expect(res.pickupPoints[0].id).toMatch(/^pp/);
  });

  it('a malformed id is still refused', async () => {
    const dto = plainToInstance(UpdateSettingsDto, { pickupPoints: [{ ...body.pickupPoints[0], id: 'x' }] });
    expect(await validate(dto)).not.toEqual([]);
  });
});
