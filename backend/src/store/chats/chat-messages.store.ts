import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CryptoService } from '../../crypto/crypto.service';

export class ChatMessagesStore {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {}

  async getMessages(chatId: string, userId: string, limit = 50) {
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);

    const res = await this.pool.query(
      `SELECT id, chat_id AS "chatId", sender_id AS "senderId", type, content_encrypted,
              media_id AS "mediaId", status, is_edited AS "isEdited", is_deleted AS "isDeleted", created_at AS "createdAt"
       FROM messages
       WHERE chat_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [chatId, limit],
    );

    return res.rows.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      type: m.type,
      content: this.crypto.decryptText(m.content_encrypted),
      mediaId: m.mediaId || null,
      mediaUrl: m.mediaId ? `/api/media/stream/${m.mediaId}` : null,
      status: m.status,
      isEdited: m.isEdited,
      isDeleted: m.isDeleted,
      createdAt: m.createdAt,
    }));
  }

  async markChatRead(chatId: string, userId: string) {
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!member.rowCount) {
      throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    }

    const result = await this.pool.query(
      `UPDATE messages SET status = 'read'
       WHERE chat_id = $1 AND sender_id != $2
         AND status != 'read' AND COALESCE(is_deleted, FALSE) = FALSE
       RETURNING id`,
      [chatId, userId],
    );
    await this.pool.query(
      `UPDATE chat_members SET last_read_at = NOW()
       WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );

    return { chatId, readMessageIds: result.rows.map((row) => row.id) };
  }

  async sendMessage(
    chatId: string,
    senderId: string,
    content: string,
    type = 'TEXT',
    mediaId?: string,
  ) {
    if (!content && !mediaId) {
      if (type !== 'TEXT') {
        content = type === 'AUDIO' ? 'Voice message' : type === 'IMAGE' ? 'Image' : 'Video';
      } else {
        throw new HttpException('Content cannot be empty', HttpStatus.BAD_REQUEST);
      }
    }
    if (content && content.length > 4000) {
      throw new HttpException('Message exceeds 4000 characters limit', HttpStatus.BAD_REQUEST);
    }

    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, senderId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);

    const blockedCheck = await this.pool.query(
      `SELECT 1 FROM blocked_users b
       JOIN chat_members cm ON cm.user_id = b.blocker_id
       WHERE cm.chat_id = $1 AND cm.user_id != $2 AND b.blocked_id = $2`,
      [chatId, senderId],
    );
    if (blockedCheck.rowCount && blockedCheck.rowCount > 0) {
      throw new HttpException('Cannot send message to this chat', HttpStatus.FORBIDDEN);
    }

    const id = randomUUID();
    const encrypted = this.crypto.encryptText(content);
    const createdAt = new Date().toISOString();

    await this.pool.query(
      `INSERT INTO messages (id, chat_id, sender_id, type, text, content_encrypted, media_id, status, is_edited, created_at)
       VALUES ($1, $2, $3, $4, '', $5, $6, 'sent', FALSE, $7)`,
      [id, chatId, senderId, type, encrypted, mediaId || null, createdAt],
    );

    return {
      id,
      chatId,
      senderId,
      type,
      content,
      mediaId: mediaId || null,
      mediaUrl: mediaId ? `/api/media/stream/${mediaId}` : null,
      status: 'sent',
      isEdited: false,
      createdAt,
    };
  }

  async markMessagesDelivered(chatId: string, userId: string) {
    const result = await this.pool.query(
      `UPDATE messages set status = 'delivered'
      WHERE chat_id = $1 AND sender_id != $2
      AND status = 'sent' AND COALESCE(is_deleted, FALSE) = FALSE
      RETURNING id`,
      [chatId, userId],
    );

    return { chatId, deliveredMessageIds: result.rows.map((row) => row.id) };
  }

  async editMessage(messageId: string, senderId: string, newContent: string) {
    if (!newContent || newContent.trim().length === 0) {
      throw new HttpException('Content cannot be empty', HttpStatus.BAD_REQUEST);
    }
    if (newContent.length > 4000) {
      throw new HttpException('Message exceeds 4000 characters', HttpStatus.BAD_REQUEST);
    }

    const msg = await this.pool.query(`SELECT sender_id FROM messages WHERE id = $1`, [messageId]);
    if (!msg.rowCount) throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
    if (msg.rows[0].sender_id !== senderId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);

    const encrypted = this.crypto.encryptText(newContent);
    await this.pool.query(
      `UPDATE messages SET content_encrypted = $1, is_edited = TRUE, updated_at = NOW() WHERE id = $2`,
      [encrypted, messageId],
    );

    return {
      id: messageId,
      content: newContent,
      isEdited: true,
    };
  }

  async deleteMessage(messageId: string, senderId: string) {
    const msg = await this.pool.query(`SELECT sender_id FROM messages WHERE id = $1`, [messageId]);
    if (!msg.rowCount) throw new HttpException('Message not found', HttpStatus.NOT_FOUND);
    if (msg.rows[0].sender_id !== senderId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);

    await this.pool.query(
      `UPDATE messages SET is_deleted = TRUE, content_encrypted = '', media_id = NULL WHERE id = $1`,
      [messageId],
    );

    return { id: messageId, isDeleted: true };
  }

  async messages(chatId: string) {
    const res = await this.pool.query(
      `SELECT id, chat_id AS "chatId", sender_id AS "senderId", type, content_encrypted,
              status, is_edited AS "isEdited", is_deleted AS "isDeleted", created_at AS "createdAt"
       FROM messages
       WHERE chat_id = $1
       ORDER BY created_at ASC`,
      [chatId],
    );

    return res.rows.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      senderId: m.senderId,
      text: this.crypto.decryptText(m.content_encrypted),
      content: this.crypto.decryptText(m.content_encrypted),
      status: m.status,
      isDeleted: m.isDeleted,
      createdAt: m.createdAt,
    }));
  }

  async message(chatId: string, senderId: string, text: string) {
    return this.sendMessage(chatId, senderId, text);
  }

  async searchMessages(chatId: string, userId: string, query: string, limit = 50) {
    const member = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const res = await this.pool.query(
      `SELECT id, sender_id AS "senderId", content_encrypted, type, created_at AS "createdAt"
       FROM messages
       WHERE chat_id = $1 AND COALESCE(is_deleted, FALSE) = FALSE AND type = 'TEXT'
       ORDER BY created_at DESC`,
      [chatId],
    );
    const lowerQuery = query.toLowerCase();
    const matches: any[] = [];
    for (const row of res.rows) {
      try {
        const decrypted = this.crypto.decryptText(row.content_encrypted);
        if (decrypted.toLowerCase().includes(lowerQuery)) {
          matches.push({
            id: row.id,
            senderId: row.senderId,
            content: decrypted,
            createdAt: row.createdAt,
          });
        }
      } catch {}
      if (matches.length >= limit) break;
    }
    return matches;
  }
}
