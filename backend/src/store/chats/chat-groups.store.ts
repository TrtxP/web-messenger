import { HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Pool } from 'pg';

export class ChatGroupsStore {
  constructor(private readonly pool: Pool) {}

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
      const invId = randomUUID();
      await this.pool.query(
        `INSERT INTO group_invitations (id, chat_id, from_id, to_id, status) VALUES ($1, $2, $3, $4, 'pending')`,
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
      const userCheck = await this.pool.query(`SELECT 1 FROM users WHERE id = $1`, [toId]);
      if (!userCheck.rowCount) continue;
      const already = await this.pool.query(`SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, toId]);
      if (already.rowCount) continue;
      const pending = await this.pool.query(
        `SELECT 1 FROM group_invitations WHERE chat_id = $1 AND to_id = $2 AND status = 'pending'`,
        [groupId, toId],
      );
      if (pending.rowCount) continue;
      const invId = randomUUID();
      await this.pool.query(
        `INSERT INTO group_invitations (id, chat_id, from_id, to_id, status) VALUES ($1, $2, $3, $4, 'pending')`,
        [invId, groupId, fromId, toId],
      );
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

  async getGroupPendingInvitations(groupId: string, userId: string) {
    const member = await this.pool.query(`SELECT role FROM chat_members WHERE chat_id = $1 AND user_id = $2`, [groupId, userId]);
    if (!member.rowCount) throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
    const res = await this.pool.query(
      `SELECT gi.id, gi.to_id AS "userId", u.username, gi.status, gi.created_at AS "createdAt"
       FROM group_invitations gi JOIN users u ON u.id = gi.to_id
       WHERE gi.chat_id = $1 AND gi.status = 'pending' ORDER BY gi.created_at DESC`,
      [groupId],
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
    await this.pool.query(
      `INSERT INTO chat_members (chat_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [row.chat_id, userId],
    );
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
}
