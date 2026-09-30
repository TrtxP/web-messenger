import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MediaService } from './media.service';
import { StoreService } from '../store/store.service';
import { GlobalExceptionFilter } from '../common/http-exception.filter';

@Controller('media')
@UseFilters(GlobalExceptionFilter)
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly store: StoreService,
  ) {}

  @Post(['upload', ''])
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadMedia(
    @Req() req: any,
    @UploadedFiles() files: any[],
  ) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const token = authHeader.split(' ')[1];
    if (!token || token.trim() === '') {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const decoded = this.store.verifyAccessToken(token);
    const userId = decoded.sub;

    const file = (files && files.length > 0) ? files[0] : req.file;
    if (!file) {
      throw new HttpException('Media file is required', HttpStatus.BAD_REQUEST);
    }

    return this.mediaService.uploadMedia(userId, file);
  }

  @Get('stream/:id')
  async streamMedia(
    @Req() req: any,
    @Res() res: Response,
    @Param('id') id: string,
  ) {
    const authHeader = req.headers['authorization'];
    const token = (authHeader && authHeader.startsWith('Bearer '))
      ? authHeader.split(' ')[1]
      : (req.query?.token as string);

    if (!token || token.trim() === '') {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }
    const decoded = this.store.verifyAccessToken(token);
    const userId = decoded.sub;

    const { buffer, mimeType } = await this.mediaService.getMediaStream(id, userId);
    const rangeHeader = req.headers.range as string | undefined;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (!rangeHeader) {
      res.setHeader('Content-Length', buffer.length);
      res.status(HttpStatus.OK).end(buffer);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    if (!match || buffer.length === 0) {
      res.setHeader('Content-Range', `bytes */${buffer.length}`);
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
      return;
    }

    const size = buffer.length;
    let start: number;
    let end: number;
    if (match[1] === '') {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.setHeader('Content-Range', `bytes */${size}`);
        res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
        return;
      }
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === '' ? size - 1 : Number(match[2]);
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= size ||
      end < start
    ) {
      res.setHeader('Content-Range', `bytes */${size}`);
      res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE).end();
      return;
    }

    end = Math.min(end, size - 1);
    const partial = buffer.subarray(start, end + 1);
    res.status(HttpStatus.PARTIAL_CONTENT);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', partial.length);
    res.end(partial);
  }
}
