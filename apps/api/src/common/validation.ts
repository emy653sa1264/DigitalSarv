import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

const PERSIAN = /[؀-ۿ]/;

function collect(errors: ValidationError[], prefix = ''): { path: string; messages: string[] }[] {
  const out: { path: string; messages: string[] }[] = [];
  for (const e of errors) {
    const path = prefix ? `${prefix}.${e.property}` : e.property;
    if (e.constraints) out.push({ path, messages: Object.values(e.constraints) });
    if (e.children?.length) out.push(...collect(e.children, path));
  }
  return out;
}

/** Turns class-validator errors into one Persian, user-presentable message. */
export function persianExceptionFactory(errors: ValidationError[]): BadRequestException {
  const flat = collect(errors);
  const persian = flat.flatMap((f) => f.messages).find((m) => PERSIAN.test(m));
  if (persian) return new BadRequestException(persian);
  const fields = flat.map((f) => f.path);
  const unknown = flat.some((f) => f.messages.some((m) => m.includes('should not exist')));
  const message = unknown
    ? `فیلد نامعتبر ارسال شده است: ${fields.join('، ')}`
    : `اطلاعات ارسالی معتبر نیست: ${fields.join('، ')}`;
  return new BadRequestException(message);
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: persianExceptionFactory,
  });
}
