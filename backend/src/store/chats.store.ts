import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { CryptoService } from '../crypto/crypto.service';

export class ChatsStore {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) { }

  async getChats(userId: string, archived = false) {
    await this.pool.query(
      `UPDATE messages SET status = 'delivered'
       WHERE chat_id IN (SELECT chat_id FROM chat_members WHERE user_id = $1)
         AND sender_id != $1
         AND status = 'sent'
         AND COALESCE(is_deleted, FALSE) = FALSE`,
      [userId],
    );

    const res = await this.pool.query(
      `SELECT c.id, cm.is_archived AS "isArchived", cm.is_muted AS "isMuted",
              (
                SELECT json_build_object(
                  'id', u.id,
                  'username', u.username,
                  'avatarUrl', CASE WHEN u.avatar_path IS NOT NULL
                    THEN '/api/media/stream/' || u.id::text ELSE NULL END
                )
                FROM chat_members cm2
                JOIN users u ON u.id = cm2.user_id
                WHERE cm2.chat_id = c.id AND cm2.user_id != $1
                LIMIT 1
              ) AS partner,
              (
                SELECT json_build_object(
                  'id', m.id,
                  'text', m.text,
                  'content_encrypted', m.content_encrypted,
                  'type', m.type,
                  'createdAt', m.created_at,
                  'status', m.status,
                  'senderId', m.sender_id
                )
                FROM messages m
                WHERE m.chat_id = c.id
                ORDER BY m.created_at DESC
                LIMIT 1
              ) AS "lastMessageRaw",
              (
                SELECT COUNT(*)::int FROM messages m
                WHERE m.chat_id = c.id AND m.sender_id != $1
                  AND m.status != 'read' AND COALESCE(m.is_deleted, FALSE) = FALSE
              ) AS "unreadCount",
              COALESCE(
                (SELECT m.created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.created_at DESC LIMIT 1),
                c.created_at
              ) AS sort_time
       FROM chat_members cm
       JOIN chats c ON c.id = cm.chat_id
       WHERE cm.user_id = $1 AND cm.is_archived = $2
       ORDER BY sort_time DESC`,
      [userId, archived],
    );

    return res.rows.map(row => {
      let lastMessage = null;
      if (row.lastMessageRaw) {
        let content = '';
        if (row.lastMessageRaw.content_encrypted) {
          content = this.crypto.decryptText(row.lastMessageRaw.content_encrypted);
        } else {
          content = row.lastMessageRaw.text || '';
        }
        lastMessage = {
          id: row.lastMessageRaw.id,
          text: content,
          content,
          type: row.lastMessageRaw.type,
          createdAt: row.lastMessageRaw.createdAt,
          status: row.lastMessageRaw.status,
          senderId: row.lastMessageRaw.senderId,
        };
      }
      return {
        id: row.id,
        partner: row.partner || { id: '', username: 'Unknown' },
        lastMessage,
        unreadCount: row.unreadCount || 0,
        isArchived: row.isArchived || false,
        isMuted: row.isMuted || false,
      };
    });
  }

  async setChatArchive(chatId: string, userId: string, archived: boolean) {
    const check = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId]);
    if (!check.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    await this.pool.query(`UPDATE chat_members SET is_archived = $1 WHERE chat_id = $2 AND user_id = $3`, [archived, chatId, userId]);
    return { isArchived: archived };
  }

  async deleteChat(chatId: string, userId: string) {
    const members = await this.pool.query(
      `SELECT user_id FROM chat_members
       WHERE chat_id = $1 AND EXISTS (
         SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2
       )`,
      [chatId, userId],
    );
    if (!members.rowCount) {
      throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    }

    await this.pool.query(`DELETE FROM chats WHERE id = $1`, [chatId]);
    return {
      chatId,
      participantIds: members.rows.map((row: any) => row.user_id as string),
    };
  }

  async setChatMute(chatId: string, userId: string, muted: boolean) {
    const check = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId]);
    if (!check.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    await this.pool.query(`UPDATE chat_members SET is_muted = $1 WHERE chat_id = $2 AND user_id = $3`, [muted, chatId, userId]);
    return { isMuted: muted };
  }

  async getMessages(chatId: string, userId: string, limit = 50) {
    const member = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, userId]);
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

    return res.rows.map(m => ({
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

    return { chatId, readMessageIds: result.rows.map(row => row.id) };
  }

  async sendMessage(chatId: string, senderId: string, content: string, type = 'TEXT', mediaId?: string) {
    if (!content && !mediaId) {
      if (type !== 'TEXT') {
        content = type === 'AUDIO' ? 'Voice message' : (type === 'IMAGE' ? 'Image' : 'Video');
      } else {
        throw new HttpException('Content cannot be empty', HttpStatus.BAD_REQUEST);
      }
    }
    if (content && content.length > 4000) {
      throw new HttpException('Message exceeds 4000 characters limit', HttpStatus.BAD_REQUEST);
    }

    const member = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, senderId]);
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

    return { chatId, deliveredMessageIds: result.rows.map(row => row.id) };
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

  async chats(userId: string) {
    return this.getChats(userId);
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

    return res.rows.map(m => ({
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
}
