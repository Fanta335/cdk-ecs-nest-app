import { Controller, Get } from '@nestjs/common';

@Controller('messages')
export class MessagesController {
  // constructor() {}

  @Get()
  sayMessage() {
    return {
      message: 'test message!',
    };
  }
}
