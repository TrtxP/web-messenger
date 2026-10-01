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

  async createGroup(creatorId: string, name: string, memberIds: string[]) {
    if (!name || !name.trim()) throw new HttpException('Group name is required', HttpStatus.BAD_REQUEST);
    const uniqueMembers = [...new Set((memberIds || []).filter((id) => id && id !== creatorId))];
    if (uniqueMembers.length < 1) throw new HttpException('Select at least 1 contact', HttpStatus.BAD_REQUEST);
    const chatId = randomUUID();
    await this.pool.query(`INSERT INTO chats (id, title, type) VALUES ($1, $2, 'group')`, [chatId, name.trim()]);
    await this.pool.query(`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'owner')`, [chatId, creatorId]);
    const invitations: any[] = [];
    for (const toId of uniqueMembers) {
      const userCheck = await this.pool.query(`SELECT 1 FROM users WHERE id = $1`, [toId]);
      if (!userCheck.rowCount) continue;
      const alreadyMember = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, toId]);
      if (alreadyMember.rowCount) continue;
      await this.pool.query(
        `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [chatId, toId],
      );
      const invId = randomUUID();
      await this.pool.query(
        `INSERT INTO group_invitations (id, chat_id, from_id, to_id, status) VALUES ($1, $2, $3, $4, 'accepted')`,
        [invId, chatId, creatorId, toId],
      );
      invitations.push({ id: invId, toId });
    }
    return { id: chatId, name: name.trim(), type: 'group', invitations };
  }

  async getGroupInfo(groupId: string, userId: string) {
    const member = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, userId]);
    if (!member.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const chatRes = await this.pool.query(`SELECT id, title, type, avatar_path FROM chats WHERE id = $1`, [groupId]);
    if (!chatRes.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const membersRes = await this.pool.query(
      `SELECT cm.user_id AS "userId", cm.role, u.username, u.avatar_path
       FROM chat_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.chat_id = $1 ORDER BY cm.role, u.username`,
      [groupId],
    );
    const chat = chatRes.rows[0];
    return {
      id: chat.id,
      name: chat.title,
      type: chat.type,
      avatarUrl: chat.avatar_path ? `/api/media/stream/group/${chat.id}` : null,
      members: membersRes.rows.map((r: any) => ({
        userId: r.userId,
        username: r.username,
        role: r.role || 'member',
        avatarUrl: r.avatar_path ? `/api/media/stream/${r.userId}` : null,
      })),
      currentUserRole: member.rows[0].role || 'member',
    };
  }

  async updateGroup(groupId: string, userId: string, name?: string, avatarPath?: string) {
    const member = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, userId]);
    if (!member.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const role = member.rows[0].role;
    if (role !== 'owner' && role !== 'admin') throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (name && name.trim()) {
      await this.pool.query(`UPDATE chats SET title = $1 WHERE id = $2`, [name.trim(), groupId]);
    }
    if (avatarPath !== undefined) {
      await this.pool.query(`UPDATE chats SET avatar_path = $1 WHERE id = $2`, [avatarPath, groupId]);
    }
    return this.getGroupInfo(groupId, userId);
  }

  async inviteToGroup(groupId: string, fromId: string, userIds: string[]) {
    const member = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, fromId]);
    if (!member.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const role = member.rows[0].role;
    if (role !== 'owner' && role !== 'admin') throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const created: any[] = [];
    for (const toId of [...new Set(userIds || [])]) {
      if (!toId || toId === fromId) continue;
      const already = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, toId]);
      if (already.rowCount) continue;
      const pending = await this.pool.query(`SELECT 1 FROM group_invitations WHERE chat_id = $1 AND to_id = $2 AND status = 'pending'`, [groupId, toId]);
      if (pending.rowCount) continue;
      const invId = randomUUID();
      await this.pool.query(`INSERT INTO group_invitations (id, chat_id, from_id, to_id, status) VALUES ($1, $2, $3, $4, 'pending')`, [invId, groupId, fromId, toId]);
      created.push({ id: invId, toId });
    }
    return created;
  }

  async getPendingGroupInvitations(userId: string) {
    const res = await this.pool.query(
      `SELECT gi.id, gi.chat_id AS "chatId", gi.from_id AS "fromId", c.title AS "groupName", u.username AS "fromUsername"
       FROM group_invitations gi JOIN chats c ON c.id = gi.chat_id JOIN users u ON u.id = gi.from_id
       WHERE gi.to_id = $1 AND gi.status = 'pending' ORDER BY gi.created_at DESC`,
      [userId],
    );
    return res.rows;
  }

  async acceptGroupInvitation(invId: string, userId: string) {
    const inv = await this.pool.query(`SELECT * FROM group_invitations WHERE id = $1`, [invId]);
    if (!inv.rowCount) throw new HttpException('Invitation not found', HttpStatus.NOT_FOUND);
    const row = inv.rows[0];
    if (row.to_id !== userId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (row.status !== 'pending') throw new HttpException('Invitation already processed', HttpStatus.CONFLICT);
    await this.pool.query(`UPDATE group_invitations SET status = 'accepted' WHERE id = $1`, [invId]);
    await this.pool.query(`INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`, [row.chat_id, userId]);
    return { chatId: row.chat_id, invitationId: invId };
  }

  async declineGroupInvitation(invId: string, userId: string) {
    const inv = await this.pool.query(`SELECT * FROM group_invitations WHERE id = $1`, [invId]);
    if (!inv.rowCount) throw new HttpException('Invitation not found', HttpStatus.NOT_FOUND);
    const row = inv.rows[0];
    if (row.to_id !== userId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (row.status !== 'pending') throw new HttpException('Invitation already processed', HttpStatus.CONFLICT);
    await this.pool.query(`UPDATE group_invitations SET status = 'declined' WHERE id = $1`, [invId]);
    return { chatId: row.chat_id, invitationId: invId };
  }

  async removeGroupMember(groupId: string, requesterId: string, targetUserId: string) {
    let target = targetUserId;
    if (target === 'me') target = requesterId;
    const reqMember = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, requesterId]);
    if (!reqMember.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const reqRole = reqMember.rows[0].role || 'member';
    const tgtMember = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, target]);
    if (!tgtMember.rowCount) throw new HttpException('Member not found', HttpStatus.NOT_FOUND);
    const isSelfLeave = target === requesterId;
    if (!isSelfLeave && reqRole !== 'owner' && reqRole !== 'admin') throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (!isSelfLeave && tgtMember.rows[0].role === 'owner' && reqRole !== 'owner') throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);

    const allMembersRes = await this.pool.query(`SELECT user_id FROM chat_members WHERE chat_id = $1`, [groupId]);
    const participantIds: string[] = allMembersRes.rows.map((r: any) => r.user_id);

    if (tgtMember.rows[0].role === 'owner') {
      // If group owner leaves, completely delete the group
      await this.pool.query(`DELETE FROM chats WHERE id = $1`, [groupId]);
      return { chatId: groupId, removedUserId: target, groupDeleted: true, participantIds };
    }

    await this.pool.query(`DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, target]);
    const remaining = await this.pool.query(`SELECT COUNT(*)::int AS c FROM chat_members WHERE chat_id = $1`, [groupId]);
    if (remaining.rows[0].c === 0) {
      await this.pool.query(`DELETE FROM chats WHERE id = $1`, [groupId]);
      return { chatId: groupId, removedUserId: target, groupDeleted: true, participantIds };
    }
    return { chatId: groupId, removedUserId: target, groupDeleted: false, participantIds };
  }

  async createPoll(chatId: string, creatorId: string, question: string, options: string[], isAnonymous = false) {
    const member = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [chatId, creatorId]);
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    if (!question || !question.trim()) throw new HttpException('Question is required', HttpStatus.BAD_REQUEST);
    const cleanOptions = [...new Set((options || []).map((o) => (o || '').trim()).filter((o) => o.length > 0))];
    if (cleanOptions.length < 2) throw new HttpException('At least 2 options required', HttpStatus.BAD_REQUEST);
    const pollId = randomUUID();
    await this.pool.query(
      `INSERT INTO polls (id, chat_id, creator_id, question_encrypted, is_anonymous, is_closed) VALUES ($1, $2, $3, $4, $5, FALSE)`,
      [pollId, chatId, creatorId, this.crypto.encryptText(question.trim()), isAnonymous],
    );
    const createdOptions: any[] = [];
    for (let i = 0; i < cleanOptions.length; i++) {
      const optId = randomUUID();
      await this.pool.query(`INSERT INTO poll_options (id, poll_id, text_encrypted, sort_order) VALUES ($1, $2, $3, $4)`, [optId, pollId, this.crypto.encryptText(cleanOptions[i]), i]);
      createdOptions.push({ id: optId, text: cleanOptions[i] });
    }
    const msgId = randomUUID();
    const createdAt = new Date().toISOString();
    await this.pool.query(
      `INSERT INTO messages (id, chat_id, sender_id, type, text, content_encrypted, media_id, status, is_edited, created_at) VALUES ($1, $2, $3, 'POLL', '', $4, NULL, 'sent', FALSE, $5)`,
      [msgId, chatId, creatorId, this.crypto.encryptText(pollId), createdAt],
    );
    return { id: pollId, chatId, question: question.trim(), options: createdOptions, isAnonymous, isClosed: false, messageId: msgId };
  }

  async getPoll(pollId: string, userId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    const poll = pollRes.rows[0];
    const member = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [poll.chat_id, userId]);
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const optsRes = await this.pool.query(`SELECT id, text_encrypted, sort_order FROM poll_options WHERE poll_id = $1 ORDER BY sort_order`, [pollId]);
    const votesRes = await this.pool.query(
      `SELECT pv.option_id AS "optionId", pv.user_id AS "userId", u.username FROM poll_votes pv JOIN users u ON u.id = pv.user_id WHERE pv.poll_id = $1`,
      [pollId],
    );
    const counts: Record<string, number> = {};
    for (const o of optsRes.rows) counts[o.id] = 0;
    for (const v of votesRes.rows) counts[v.optionId] = (counts[v.optionId] || 0) + 1;
    const total = votesRes.rows.length;
    const myVote = votesRes.rows.find((v: any) => v.userId === userId);
    return {
      id: poll.id,
      chatId: poll.chat_id,
      creatorId: poll.creator_id,
      question: this.crypto.decryptText(poll.question_encrypted),
      isAnonymous: poll.is_anonymous,
      isClosed: poll.is_closed,
      totalVotes: total,
      myOptionId: myVote ? myVote.optionId : null,
      options: optsRes.rows.map((o: any) => ({
        id: o.id,
        text: this.crypto.decryptText(o.text_encrypted),
        votes: counts[o.id] || 0,
        percent: total === 0 ? 0 : Math.round(((counts[o.id] || 0) / total) * 100),
        voters: poll.is_anonymous ? [] : votesRes.rows.filter((v: any) => v.optionId === o.id).map((v: any) => ({ userId: v.userId, username: v.username })),
      })),
    };
  }

  async votePoll(pollId: string, userId: string, optionId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    const poll = pollRes.rows[0];
    if (poll.is_closed) throw new HttpException('Poll is closed', HttpStatus.BAD_REQUEST);
    const member = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [poll.chat_id, userId]);
    if (!member.rowCount) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    const optCheck = await this.pool.query(`SELECT 1 FROM poll_options WHERE id = $1 AND poll_id = $2`, [optionId, pollId]);
    if (!optCheck.rowCount) throw new HttpException('Option not found', HttpStatus.NOT_FOUND);
    await this.pool.query(
      `INSERT INTO poll_votes (id, poll_id, option_id, user_id) VALUES ($1, $2, $3, $4) ON CONFLICT (poll_id, user_id) DO UPDATE SET option_id = $3`,
      [randomUUID(), pollId, optionId, userId],
    );
    return this.getPoll(pollId, userId);
  }

  async retractPollVote(pollId: string, userId: string) {
    await this.pool.query(`DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2`, [pollId, userId]);
    return this.getPoll(pollId, userId);
  }

  async closePoll(pollId: string, userId: string) {
    const pollRes = await this.pool.query(`SELECT * FROM polls WHERE id = $1`, [pollId]);
    if (!pollRes.rowCount) throw new HttpException('Poll not found', HttpStatus.NOT_FOUND);
    if (pollRes.rows[0].creator_id !== userId) throw new HttpException('Unauthorized', HttpStatus.FORBIDDEN);
    await this.pool.query(`UPDATE polls SET is_closed = TRUE WHERE id = $1`, [pollId]);
    return this.getPoll(pollId, userId);
  }
}
