import { JwtService } from '@nestjs/jwt';
import { fakeRedisService } from '../../../test/fake-redis.js';
import { TokenVerifier } from './token-verifier.service.js';

const jwt = new JwtService({ secret: 'test-secret' });
const sign = (jti: string, iatOffset = 0) =>
  jwt.signAsync({ sub: 'u1', role: 'provider', phone: '09122222222', iat: Math.floor(Date.now() / 1000) + iatOffset }, { jwtid: jti });

describe('TokenVerifier — revoked tokens', () => {
  it('rejects tokens issued before revokeUser and accepts later ones', async () => {
    const verifier = new TokenVerifier(jwt, fakeRedisService());
    const old = await sign('j1', -10);
    expect(await verifier.verify(old)).toMatchObject({ id: 'u1', role: 'provider' });
    await verifier.revokeUser('u1');
    expect(await verifier.verify(old)).toBeNull();
    expect(await verifier.verify(await sign('j2b', 2))).toMatchObject({ id: 'u1' });
  });
  it('only affects the revoked user and expires with the TTL', async () => {
    const redis = fakeRedisService();
    const verifier = new TokenVerifier(jwt, redis);
    await verifier.revokeUser('someone-else');
    expect(await verifier.verify(await sign('j3', -10))).toMatchObject({ id: 'u1' });
    expect(redis.client.ttl('user:revoked:someone-else')).toBe(2_592_000);
  });
});
