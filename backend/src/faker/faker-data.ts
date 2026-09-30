import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import { StoreService } from '../store/store.service';
import { CryptoService } from '../crypto/crypto.service';

@Injectable()
export class FakerData implements OnModuleInit {
  private readonly logger = new Logger(FakerData.name);

  constructor(
    private readonly storeService: StoreService,
    private readonly cryptoService: CryptoService,
  ) {}

  static readonly testUsers = [
    { email: 'test.user1@example.com', username: 'test_user_1' },
    { email: 'test.user2@example.com', username: 'test_user_2' },
    { email: 'test.user3@example.com', username: 'test_user_3' },
    { email: 'test.user4@example.com', username: 'test_user_4' },
    { email: 'test.user5@example.com', username: 'test_user_5' },
  ];

  static readonly testUserPassword = 'Password123!';

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    await this.seedUsersIfEmpty(100);
    await this.ensureTestUsers();
  }

  async ensureTestUsers(
    defaultPassword = FakerData.testUserPassword,
  ): Promise<number> {
    const pool = this.storeService.getPool();
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);
    let created = 0;
    for (const entry of FakerData.testUsers) {
      const existing = await pool.query(
        `SELECT 1 FROM users WHERE email = $1`,
        [entry.email],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }
      const encryptedAbout = this.cryptoService.encryptText(
        `Test account ${entry.username} for project testing`,
      );
      await pool.query(
        `INSERT INTO users (
          id, email, username, password_hash, email_verified, verification_code_hash, about_encrypted, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, TRUE, NULL, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT DO NOTHING`,
        [randomUUID(), entry.email, entry.username, passwordHash, encryptedAbout],
      );
      created++;
    }
    if (created > 0) {
      this.logger.log(`FakerData: ensured ${created} test users.`);
    }
    return created;
  }

  async seedUsersIfEmpty(
    count = 100,
    defaultPassword = 'Password123!',
  ): Promise<number> {
    const pool = this.storeService.getPool();
    const countRes = await pool.query('SELECT COUNT(*) FROM users');
    const userCount = parseInt(countRes.rows[0].count, 10);

    if (userCount > 0) {
      this.logger.log(
        `Database already has ${userCount} user(s). Skipping FakerData generation.`,
      );
      return 0;
    }

    this.logger.log(
      `Database has 0 users. Generating ${count} fake users via FakerData...`,
    );
    const created = await this.generateUsers(count, defaultPassword);
    await this.ensureTestUsers(defaultPassword);
    return created;
  }

  async generateUsers(
    count = 100,
    defaultPassword = 'Password123!',
  ): Promise<number> {
    const pool = this.storeService.getPool();
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const passwordHash = await bcrypt.hash(defaultPassword, saltRounds);

    let createdCount = 0;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const usedEmails = new Set<string>();
      const usedUsernames = new Set<string>();

      for (let i = 0; i < count; i++) {
        const id = randomUUID();

        let email: string;
        do {
          const rawEmail = faker.internet.email().toLowerCase();
          email = rawEmail.replace(/[^a-zA-Z0-9@._+-]/g, '');
        } while (usedEmails.has(email));
        usedEmails.add(email);

        let username: string;
        do {
          const raw = faker.internet.username().replace(/[^a-zA-Z0-9_]/g, '_');
          const prefix = raw.length < 3 ? `user_${raw}` : raw.slice(0, 20);
          username = `${prefix}_${i + 1}`.slice(0, 30);
        } while (usedUsernames.has(username.toLowerCase()));
        usedUsernames.add(username.toLowerCase());

        const bio = faker.person.bio();
        const encryptedAbout = this.cryptoService.encryptText(bio);

        await client.query(
          `INSERT INTO users (
            id, email, username, password_hash, email_verified, verification_code_hash, about_encrypted, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, TRUE, NULL, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [id, email, username, passwordHash, encryptedAbout],
        );

        createdCount++;
      }

      await client.query('COMMIT');
      this.logger.log(`FakerData: successfully created ${createdCount} users.`);
      return createdCount;
    } catch (err: any) {
      await client.query('ROLLBACK');
      this.logger.error(`FakerData failed: ${err.message}`, err.stack);
      throw err;
    } finally {
      client.release();
    }
  }
}
