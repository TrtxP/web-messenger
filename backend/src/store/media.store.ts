import { Pool } from 'pg';

export class MediaStore {
  constructor(private readonly pool: Pool) {}

  async saveMediaRecord(
    mediaId: string,
    uploaderId: string,
    filePath: string,
    iv: string,
    tag: string,
    mimeType: string,
    sizeBytes: number,
  ) {
    await this.pool.query(
      `INSERT INTO media_records (id, uploader_id, file_path, iv, tag, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mediaId, uploaderId, filePath, iv, tag, mimeType, sizeBytes],
    );
  }

  async getMediaRecord(mediaId: string) {
    const res = await this.pool.query(`SELECT * FROM media_records WHERE id = $1`, [mediaId]);
    return res.rows[0];
  }
}
