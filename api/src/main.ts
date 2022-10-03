import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { config } from 'aws-sdk';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

  const configService = app.get(ConfigService);
  config.update({
    credentials: {
      accessKeyId: configService.get('S3_IAM_ACCESS_KEY_ID'),
      secretAccessKey: configService.get('S3_IAM_SECRET_ACCESS_KEY'),
    },
    region: configService.get('AWS_REGION'),
  });

  await app.listen(3000);
}
bootstrap();
