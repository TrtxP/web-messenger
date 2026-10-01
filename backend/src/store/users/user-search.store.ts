import { Pool } from 'pg';

export class UserSearchStore {
  constructor(private readonly pool: Pool) {}

  async searchUsers(currentUserId: string, query = '') {
    const q = `%${query.trim().toLowerCase()}%`;
    const res = await this.pool.query(
      `SELECT u.id, u.email, u.username, u.avatar_path,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM chat_members cm1
                  JOIN chat_members cm2 ON cm1.chat_id = cm2.chat_id
                  WHERE cm1.user_id = $1 AND cm2.user_id = u.id
                ) THEN 'contact'
                WHEN EXISTS (
                  SELECT 1 FROM invitations
                  WHERE from_id = $1 AND to_id = u.id AND status = 'pending'
                ) THEN 'pending'
                ELSE 'none'
              END AS relationship
       FROM users u
       WHERE u.id != $1 AND (LOWER(u.email) LIKE $2 OR LOWER(u.username) LIKE $2)
         AND u.id NOT IN (SELECT blocked_id FROM blocked_users WHERE blocker_id = $1)
         AND u.id NOT IN (SELECT blocker_id FROM blocked_users WHERE blocked_id = $1)
       ORDER BY u.username ASC`,
      [currentUserId, q],
    );

    return res.rows.map((r) => ({
      id: r.id,
      email: r.email,
      username: r.username,
      avatarUrl: r.avatar_path ? `/api/media/stream/${r.id}` : null,
      relationship: r.relationship,
    }));
  }

  async users(query = '') {
    return this.searchUsers('', query);
  }
}

