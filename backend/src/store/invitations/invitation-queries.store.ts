import { Pool } from 'pg';

export class InvitationQueriesStore {
  constructor(private readonly pool: Pool) {}

  async getPendingInvitations(userId: string) {
    const received = await this.pool.query(
      `SELECT i.id, i.from_id AS "fromId", i.to_id AS "toId", i.status, i.created_at AS "createdAt",
              json_build_object(
                'id', u.id,
                'username', u.username,
                'avatarUrl', CASE WHEN u.avatar_path IS NOT NULL THEN '/api/media/stream/' || u.id::text ELSE NULL END
              ) AS "from"
       FROM invitations i
       JOIN users u ON u.id = i.from_id
       WHERE i.to_id = $1 AND i.status = 'pending'`,
      [userId],
    );

    const sent = await this.pool.query(
      `SELECT i.id, i.from_id AS "fromId", i.to_id AS "toId", i.status, i.created_at AS "createdAt",
              json_build_object(
                'id', u.id,
                'username', u.username,
                'avatarUrl', CASE WHEN u.avatar_path IS NOT NULL THEN '/api/media/stream/' || u.id::text ELSE NULL END
              ) AS "to"
       FROM invitations i
       JOIN users u ON u.id = i.to_id
       WHERE i.from_id = $1 AND i.status = 'pending'`,
      [userId],
    );

    return {
      received: received.rows,
      sent: sent.rows,
    };
  }
}
