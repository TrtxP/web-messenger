import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { FakerData } from '../src/faker/faker-data';
import { StoreService } from '../src/store/store.service';
import * as bcrypt from 'bcrypt';

describe('FakerData - User Generator', () => {
  let fakerData: FakerData;
  let storeService: StoreService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    fakerData = moduleFixture.get<FakerData>(FakerData);
    storeService = moduleFixture.get<StoreService>(StoreService);
  });

  it('should be defined', () => {
    expect(fakerData).toBeDefined();
  });

  it('skips generation if users already exist', async () => {
    const pool = storeService.getPool();
    const countRes = await pool.query('SELECT COUNT(*) FROM users');
    const currentCount = parseInt(countRes.rows[0].count, 10);

    if (currentCount > 0) {
      const generated = await fakerData.seedUsersIfEmpty(100);
      expect(generated).toBe(0);
    }
  });

  it('generates users with valid fields, hashes, and encryption when requested', async () => {
    const pool = storeService.getPool();
    const generated = await fakerData.generateUsers(5, 'Test@Pass123');
    expect(generated).toBe(5);

    const res = await pool.query(
      `SELECT * FROM users ORDER BY created_at DESC LIMIT 5`,
    );
    expect(res.rows.length).toBe(5);

    for (const row of res.rows) {
      expect(row.id).toBeDefined();
      expect(row.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(row.username).toMatch(/^[a-zA-Z0-9_]{3,30}$/);
      expect(row.email_verified).toBe(true);
      expect(row.password_hash).toBeDefined();

      const passMatches = await bcrypt.compare('Test@Pass123', row.password_hash);
      expect(passMatches).toBe(true);

      if (row.about_encrypted) {
        expect(row.about_encrypted).toContain('ciphertext');
      }
    }

    const ids = res.rows.map((r: any) => r.id);
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]);
  });
});
