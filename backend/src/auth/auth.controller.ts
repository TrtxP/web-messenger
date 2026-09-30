import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, UseGuards, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { StoreService } from '../store/store.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly store: StoreService,
  ) {}

  @Post('register')
  register(@Body() body: { email?: string; password?: string; username?: string }) {
    return this.authService.register(body);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() body: { email?: string; code?: string }) {
    return this.authService.verifyEmail(body.email ?? '', body.code ?? '');
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() body: { email?: string }) {
    return this.store.resendVerificationCode(body.email ?? '');
  }

  @Get('dev-verification-code')
  getDevVerificationCode(@Query('email') email: string) {
    return { code: this.store.getDevVerificationCode(email) };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: { email?: string; password?: string }) {
    return this.authService.login(body);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() body: { email?: string }) {
    return this.authService.forgotPassword(body.email ?? '');
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() body: { email?: string; code?: string; newPassword?: string }) {
    return this.authService.resetPassword(body.email ?? '', body.code ?? '', body.newPassword ?? '');
  }

  @Get('dev-reset-code')
  getDevResetCode(@Query('email') email: string) {
    return { code: this.store.getDevResetCode(email) };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@Req() req: any) {
    return this.store.getUserById(req.user.id);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() body: { refreshToken?: string }) {
    if (!body.refreshToken) {
      throw new HttpException('Refresh token is required', HttpStatus.UNAUTHORIZED);
    }
    const decoded = this.store.verifyRefreshToken(body.refreshToken);
    const tokens = this.store.generateTokens(decoded.sub, decoded.email);
    return { token: tokens.token };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard)
  logout(@Req() req: any) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      this.store.invalidateToken(token);
    }
    this.store.logoutUser(req.user.id);
    return { message: 'Logged out successfully' };
  }
}
