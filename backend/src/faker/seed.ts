import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { FakerData } from './faker-data';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const fakerData = app.get(FakerData);
    const count = parseInt(process.env.FAKER_COUNT || '100', 10);
    const force = process.argv.includes('--force');

    if (force) {
      console.log(`[FakerData Script] Force mode: Generating ${count} fake users...`);
      await fakerData.generateUsers(count);
      await fakerData.ensureTestUsers();
    } else {
      console.log(`[FakerData Script] Checking if database is empty; if so, generating ${count} fake users...`);
      await fakerData.seedUsersIfEmpty(count);
      await fakerData.ensureTestUsers();
    }
  } catch (error) {
    console.error('[FakerData Script] Execution error:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
