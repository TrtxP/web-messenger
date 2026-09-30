import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  constructor(
    private readonly store: StoreService,
    private readonly crypto: CryptoService,
  ) {}

  async uploadMedia(uploaderId: string, file: any) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new HttpException('Media file is required', HttpStatus.BAD_REQUEST);
    }

    if (file.size > 20 * 1024 * 1024) {
      throw new HttpException('File size exceeds 20MB limit', HttpStatus.BAD_REQUEST);
    }

    const origName = (file.originalname || '').toLowerCase();
    if (
      origName.includes('.php') ||
      origName.includes('.exe') ||
      origName.includes('.sh') ||
      origName.includes('.bat') ||
      origName.includes('.cmd')
    ) {
      throw new HttpException('Invalid file extension', HttpStatus.BAD_REQUEST);
    }

    const buf = file.buffer;
    if (
      (buf.length >= 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) ||
      (buf.length >= 2 && buf[0] === 0x4d && buf[1] === 0x5a)
    ) {
      throw new HttpException('Executable binaries are not allowed', HttpStatus.BAD_REQUEST);
    }

    let detectedMime: string | null = null;

    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      detectedMime = 'image/jpeg';
    } else if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      detectedMime = 'image/png';
    } else if (
      buf.length >= 6 &&
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38 &&
      (buf[4] === 0x37 || buf[4] === 0x39) &&
      buf[5] === 0x61
    ) {
      detectedMime = 'image/gif';
    } else if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46
    ) {
      const typeStr = buf.subarray(8, 12).toString('ascii');
      if (typeStr === 'WEBP') {
        detectedMime = 'image/webp';
      } else if (typeStr === 'WAVE') {
        detectedMime = 'audio/wav';
      } else if (typeStr === 'AVI ') {
        detectedMime = 'video/x-msvideo';
      }
    } else if (
      buf.length >= 8 &&
      buf[4] === 0x66 &&
      buf[5] === 0x74 &&
      buf[6] === 0x79 &&
      buf[7] === 0x70
    ) {
      if (origName.endsWith('.m4a') || origName.endsWith('.aac')) {
        detectedMime = 'audio/mp4';
      } else {
        detectedMime = 'video/mp4';
      }
    } else if (
      buf.length >= 8 &&
      (buf.subarray(4, 8).toString('ascii') === 'moov' ||
       buf.subarray(4, 8).toString('ascii') === 'mdat' ||
       buf.subarray(4, 8).toString('ascii') === 'free' ||
       buf.subarray(4, 8).toString('ascii') === 'wide')
    ) {
      detectedMime = 'video/quicktime';
    } else if (
      buf.length >= 3 &&
      buf[0] === 0x49 &&
      buf[1] === 0x44 &&
      buf[2] === 0x33
    ) {
      detectedMime = 'audio/mpeg';
    } else if (
      buf.length >= 2 &&
      buf[0] === 0xff &&
      (buf[1] & 0xe0) === 0xe0
    ) {
      detectedMime = 'audio/mpeg';
    } else if (
      buf.length >= 4 &&
      buf[0] === 0x4f &&
      buf[1] === 0x47 &&
      buf[2] === 0x47 &&
      buf[3] === 0x53
    ) {
      detectedMime = 'audio/ogg';
    } else if (
      buf.length >= 4 &&
      buf[0] === 0x66 &&
      buf[1] === 0x4c &&
      buf[2] === 0x61 &&
      buf[3] === 0x43
    ) {
      detectedMime = 'audio/flac';
    } else if (
      buf.length >= 4 &&
      buf[0] === 0x1a &&
      buf[1] === 0x45 &&
      buf[2] === 0xdf &&
      buf[3] === 0xa3
    ) {
      if (origName.endsWith('.weba') || (file.mimetype && file.mimetype.startsWith('audio/'))) {
        detectedMime = 'audio/webm';
      } else {
        detectedMime = 'video/webm';
      }
    } else if (
      file.mimetype &&
      (file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) &&
      /\.(jpg|jpeg|png|webp|gif|mp4|mov|avi|webm|mkv|mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(origName)
    ) {
      detectedMime = file.mimetype;
    }

    if (!detectedMime) {
      throw new HttpException('Invalid file signature or unsupported media format', HttpStatus.BAD_REQUEST);
    }

    const uploadDir = path.resolve(process.env.UPLOAD_DIR || './uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const mediaId = randomUUID();
    const safeFilename = `media_${mediaId}.enc`;
    const filePath = path.join(uploadDir, safeFilename);

    if (!path.resolve(filePath).startsWith(uploadDir)) {
      throw new HttpException('Invalid file path', HttpStatus.BAD_REQUEST);
    }

    const { encrypted, iv, tag } = this.crypto.encryptBuffer(buf);
    fs.writeFileSync(filePath, encrypted);

    await this.store['pool'].query(
      `INSERT INTO media_records (id, uploader_id, file_path, iv, tag, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mediaId, uploaderId, filePath, iv, tag, detectedMime, file.size],
    );

    return {
      id: mediaId,
      mediaId,
      mediaUrl: `/api/media/stream/${mediaId}`,
      mimeType: detectedMime,
    };
  }

  async getMediaStream(mediaId: string, userId: string) {
    const res = await this.store['pool'].query(
      `SELECT * FROM media_records WHERE id = $1`,
      [mediaId],
    );

    if (!res.rows || res.rows.length === 0) {
      throw new HttpException('Media not found', HttpStatus.NOT_FOUND);
    }

    const record = res.rows[0];
    if (!fs.existsSync(record.file_path)) {
      throw new HttpException('Media file not found on disk', HttpStatus.NOT_FOUND);
    }

    const encryptedData = fs.readFileSync(record.file_path);
    const decrypted = this.crypto.decryptBuffer(encryptedData, record.iv, record.tag);

    return {
      buffer: decrypted,
      mimeType: record.mime_type,
    };
  }
}
