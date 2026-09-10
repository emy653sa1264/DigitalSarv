import type { Role } from '../constants.js';

/** JWT payload as signed by AuthService. */
export interface JwtPayload {
  sub: string;
  role: Role;
  phone: string;
  jti: string;
  iat?: number;
  exp?: number;
}

/** What guards attach to `request.user`. */
export interface AuthUser {
  id: string;
  role: Role;
  phone: string;
  jti: string;
  exp?: number;
}
