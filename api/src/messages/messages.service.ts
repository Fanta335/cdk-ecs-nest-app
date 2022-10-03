import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Message } from './message.entity';
import { Repository } from 'typeorm';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message) private messagesRepository: Repository<Message>,
  ) {}

  async createMessage(content: string, roomId: number) {
    const newMessage = new Message();
    newMessage.content = content;
    newMessage.roomId = roomId;
    return this.messagesRepository.save(newMessage);
  }
}
