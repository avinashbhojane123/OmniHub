import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const PORT = process.env.PORT || 3030;
  await app.listen(PORT);
  console.log(`[LifePlanner Companion Server] listening on http://localhost:${PORT}`);
}

bootstrap();
