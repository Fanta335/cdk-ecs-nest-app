import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cat } from './cat.entity';
import { Repository } from 'typeorm';
import { S3 } from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CatsService {
  constructor(
    @InjectRepository(Cat)
    private catsRepository: Repository<Cat>,
    private configService: ConfigService,
  ) {}

  findAll() {
    return this.catsRepository.find();
  }

  findById(id: number) {
    return this.catsRepository.findOne({ where: { id: id } });
  }

  async updateCat(id: number, name: string) {
    const catToBeUpdated = await this.findById(id);
    catToBeUpdated.name = name;
    return this.catsRepository.save(catToBeUpdated);
  }

  createCat(name: string) {
    return this.catsRepository.save({ name });
  }

  async addAvatar(id: number, file: Express.Multer.File) {
    const { buffer, originalname, mimetype } = file;
    const s3 = new S3();
    const uploadResult = await s3
      .upload({
        Bucket: this.configService.get('S3_BUCKET_NAME'),
        Body: buffer,
        Key: `${uuid()}-${originalname}`,
        ContentType: `${mimetype}`,
      })
      .promise();

    // console.log('s3 upload result: ', uploadResult);

    const catToUpdate = await this.findById(id);
    catToUpdate.avatar = uploadResult.Location;

    return this.catsRepository.save(catToUpdate);
    // return { buffer, originalname, mimetype };
  }
}
