import { IsString, Matches } from 'class-validator';

export class OtpRequestDto {
  @IsString({ message: 'شماره موبایل را وارد کنید' })
  phone: string;
}

export class OtpVerifyDto {
  @IsString({ message: 'شماره موبایل را وارد کنید' })
  phone: string;

  @IsString({ message: 'کد تأیید را وارد کنید' })
  @Matches(/^[0-9۰-۹٠-٩]{4}$/, { message: 'کد تأیید باید ۴ رقم باشد' })
  code: string;
}
