import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

const COOKIE = 'wpm_auth';

function tokenFor(password: string): string {
  return Buffer.from(`wpm:${password}`).toString('base64').replace(/=+$/, '');
}

@Controller('auth')
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  private password(): string | undefined {
    const p = this.config.get<string>('DASHBOARD_PASSWORD');
    return p && p.length > 0 ? p : undefined;
  }

  @Get('session')
  session(@Req() req: Request) {
    const password = this.password();
    if (!password) {
      return { authenticated: true, authRequired: false };
    }
    const cookies = req.headers.cookie ?? '';
    const authenticated = cookies.includes(`${COOKIE}=${tokenFor(password)}`);
    return { authenticated, authRequired: true };
  }

  @Post('login')
  login(@Body() body: { password?: string }, @Res({ passthrough: true }) res: Response) {
    const password = this.password();
    if (!password) {
      return { authenticated: true, authRequired: false };
    }
    if (body.password !== password) {
      throw new UnauthorizedException('Invalid password');
    }
    res.cookie(COOKIE, tokenFor(password), {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return { authenticated: true, authRequired: true };
  }
}
