import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';
import { MessengerGateway } from '../gateway/messenger.gateway';
import * as fs from 'fs';
import * as path from 'path';

@Controller('users')
@UseFilters(GlobalExceptionFilter)
export class UsersController {
  constructor(
    private readonly store: StoreService,
    private readonly crypto: CryptoService,
    private readonly messengerGateway: MessengerGateway,
  ) {}

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@Req() req: any) {
    return this.store.getUserById(req.user.id);
  }

  @Post('presence')
  @UseGuards(AuthGuard)
  markPresence(@Req() req: any) {
    this.messengerGateway.markUserOnline(req.user.id);
    return { ok: true };
  }

  @Post('fcm-token')
  @UseGuards(AuthGuard)
  async updateFcmToken(@Req() req: any, @Body() body: { token?: string }) {
    if (body.token) {
      await this.store.saveFcmToken(req.user.id, body.token);
    }
    return { ok: true };
  }

  @Delete('fcm-token')
  @UseGuards(AuthGuard)
  async clearFcmToken(@Req() req: any) {
    await this.store.saveFcmToken(req.user.id, '');
    return { ok: true };
  }

  @Put('me')
  @UseGuards(AuthGuard)
  updateMe(@Req() req: any, @Body() body: { username?: string; about?: string }) {
    return this.store.updateProfile(req.user.id, body.username, body.about);
  }

  @Post('me/avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
        const mime = (file.mimetype || '').toLowerCase();
        const origName = (file.originalname || '').toLowerCase();
        const isOctetStream = mime === 'application/octet-stream';
        const hasImageExt = /\.(jpe?g|png)$/i.test(origName);

        if (!allowed.includes(mime) && !(isOctetStream && hasImageExt)) {
          return cb(null, false);
        }
        cb(null, true);
      },
    }),
  )
  async uploadAvatar(@Req() req: any, @UploadedFile() file: any) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const token = authHeader.split(' ')[1];
    const decoded = this.store.verifyAccessToken(token);
    req.user = { id: decoded.sub, email: decoded.email };

    if (!file) {
      throw new HttpException('Avatar file is required or unsupported format', HttpStatus.BAD_REQUEST);
    }

    if (file.size > 5 * 1024 * 1024) {
      throw new HttpException('File size exceeds 5MB limit', HttpStatus.BAD_REQUEST);
    }

    const buf = file.buffer;
    if (!buf || buf.length < 4) {
      throw new HttpException('Invalid file buffer', HttpStatus.BAD_REQUEST);
    }
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    if (!isJpeg && !isPng) {
      throw new HttpException('Invalid image content', HttpStatus.BAD_REQUEST);
    }

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const { encrypted, iv, tag } = this.crypto.encryptBuffer(buf);
    const safeBaseName = path.basename(`avatar_${req.user.id}_${Date.now()}.enc`);
    const safePath = path.join(uploadDir, safeBaseName);

    fs.writeFileSync(safePath, encrypted);

    const detectedMime = isJpeg ? 'image/jpeg' : 'image/png';
    await this.store['pool'].query(
      `INSERT INTO media_records (id, uploader_id, file_path, iv, tag, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         iv = EXCLUDED.iv,
         tag = EXCLUDED.tag,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes`,
      [req.user.id, req.user.id, safePath, iv, tag, detectedMime, file.size],
    );

    await this.store.updateAvatar(req.user.id, safePath);
    return { avatarUrl: `/api/media/stream/${req.user.id}` };
  }

  @Get('search')
  @UseGuards(AuthGuard)
  async search(@Req() req: any, @Query('query') query: string) {
    const users = await this.store.searchUsers(req.user.id, query || '');
    return users.map((user: any) => ({
      ...user,
      isOnline: this.messengerGateway.isUserOnline(user.id),
    }));
  }

  @Get('blocked')
  @UseGuards(AuthGuard)
  getBlockedUsers(@Req() req: any) {
    return this.store.getBlockedUserIds(req.user.id);
  }

  @Get('blocked-list')
  @UseGuards(AuthGuard)
  getBlockedUsersList(@Req() req: any) {
    return this.store.getBlockedUsers(req.user.id);
  }

  @Post(':id/block')
  @UseGuards(AuthGuard)
  blockUser(@Req() req: any, @Param('id') id: string) {
    return this.store.blockUser(req.user.id, id);
  }

  @Delete(':id/block')
  @UseGuards(AuthGuard)
  unblockUser(@Req() req: any, @Param('id') id: string) {
    return this.store.unblockUser(req.user.id, id);
  }

  @Get()
  users(@Query('query') query: string) {
    return this.store.users(query || '');
  }
}
