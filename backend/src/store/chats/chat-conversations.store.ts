import { HttpException, HttpStatus } from '@nestjs/common';
import { Pool } from 'pg';
import { CryptoService } from '../../crypto/crypto.service';

export class ChatConversationsStore {
  constructor(
    private readonly pool: Pool,
    private readonly crypto: CryptoService,
  ) {}

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
      `SELECT c.id, c.type, c.title AS "groupName", c.avatar_path AS "groupAvatarPath",
              (SELECT COUNT(*)::int FROM chat_members WHERE chat_id = c.id) AS "memberCount",
              cm.is_archived AS "isArchived", cm.is_muted AS "isMuted",
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

    return res.rows.map((row) => {
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
      if (row.type === 'group') {
        return {
          id: row.id,
          type: 'group',
          groupName: row.groupName || 'Group',
          groupAvatarUrl: row.groupAvatarPath ? `/api/media/stream/group/${row.id}` : null,
          memberCount: row.memberCount || 0,
          partner: row.partner || { id: '', username: row.groupName || 'Group' },
          title: row.groupName || 'Group',
          lastMessage,
          unreadCount: row.unreadCount || 0,
          isArchived: row.isArchived || false,
          isMuted: row.isMuted || false,
        };
      }
      return {
        id: row.id,
        type: row.type || 'direct',
        partner: row.partner || { id: '', username: 'Unknown' },
        lastMessage,
        unreadCount: row.unreadCount || 0,
        isArchived: row.isArchived || false,
        isMuted: row.isMuted || false,
      };
    });
  }

  async setChatArchive(chatId: string, userId: string, archived: boolean) {
    const check = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!check.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    await this.pool.query(
      `UPDATE chat_members SET is_archived = $1 WHERE chat_id = $2 AND user_id = $3`,
      [archived, chatId, userId],
    );
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
    const check = await this.pool.query(
      `SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`,
      [chatId, userId],
    );
    if (!check.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    await this.pool.query(
      `UPDATE chat_members SET is_muted = $1 WHERE chat_id = $2 AND user_id = $3`,
      [muted, chatId, userId],
    );
    return { isMuted: muted };
  }

  async chats(userId: string) {
    return this.getChats(userId);
  }
}
