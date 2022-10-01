import { Module } from '@nestjs/common';
import { CatsController } from './cats.controller';
import { CatsService } from './cats.service';
import { ConfigModule } from '@nestjs/config';
import { Cat } from './cat.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Cat]), ConfigModule],
  controllers: [CatsController],
  providers: [CatsService],
})
export class CatsModule {}
