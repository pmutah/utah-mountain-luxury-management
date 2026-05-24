import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/seed/seed.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const seed = app.get(SeedService);
  const counts = await seed.seed();
  console.log('Seed complete:', counts);
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
