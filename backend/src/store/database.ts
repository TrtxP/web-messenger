import { Pool } from 'pg';

export function createDatabasePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  return new Pool(
    connectionString
      ? { connectionString }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          user: process.env.DB_USERNAME || 'postgres',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'mobile_messenger_db',
        },
  );
}

export async function initDatabaseSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      email_verified BOOLEAN DEFAULT FALSE,
      verification_code_hash VARCHAR(255),
      reset_code_hash VARCHAR(255),
      avatar_path VARCHAR(255),
      about_encrypted TEXT DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_code_hash VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code_hash VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_path VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS about_encrypted TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS fcm_token VARCHAR(512);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS invitations (
      id VARCHAR(64) PRIMARY KEY,
      from_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chats (
      id VARCHAR(64) PRIMARY KEY,
      title VARCHAR(255) DEFAULT '',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chat_id VARCHAR(64) NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      is_archived BOOLEAN DEFAULT FALSE,
      is_muted BOOLEAN DEFAULT FALSE,
      last_read_at TIMESTAMP WITH TIME ZONE,
      PRIMARY KEY (chat_id, user_id)
    );

    ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
    ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT FALSE;
    ALTER TABLE chat_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMP WITH TIME ZONE;

    CREATE TABLE IF NOT EXISTS messages (
      id VARCHAR(64) PRIMARY KEY,
      chat_id VARCHAR(64) NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      sender_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(16) NOT NULL DEFAULT 'TEXT',
      text TEXT NOT NULL DEFAULT '',
      content_encrypted TEXT NOT NULL DEFAULT '',
      media_id VARCHAR(64),
      status VARCHAR(32) DEFAULT 'sent',
      is_edited BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE messages ALTER COLUMN text DROP NOT NULL;
    ALTER TABLE messages ALTER COLUMN text SET DEFAULT '';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS type VARCHAR(16) NOT NULL DEFAULT 'TEXT';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS content_encrypted TEXT NOT NULL DEFAULT '';
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_id VARCHAR(64);
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

    CREATE TABLE IF NOT EXISTS media_records (
      id VARCHAR(64) PRIMARY KEY,
      uploader_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
      file_path VARCHAR(255) NOT NULL,
      iv VARCHAR(64) NOT NULL,
      tag VARCHAR(64) NOT NULL,
      mime_type VARCHAR(64) NOT NULL,
      size_bytes BIGINT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS blocked_users (
      id VARCHAR(64) PRIMARY KEY,
      blocker_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(blocker_id, blocked_id)
    );
  `);
}
