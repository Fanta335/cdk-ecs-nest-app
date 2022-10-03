import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  // ConnectedSocket,
} from '@nestjs/websockets';
import { MessagesService } from './messages.service';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class MessageGateway {
  @WebSocketServer()
  server;

  constructor(private messageService: MessagesService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async afterInit(server) {
    console.log('WebSocket server initialized.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleConnection(client) {
    console.log('client is connected!');
  }

  @SubscribeMessage('send_message')
  async listenForMessages(
    @MessageBody() body: { roomId: string; content: string },
    // @ConnectedSocket() client,
  ) {
    console.log('receive message from client.');
    const { roomId, content } = body;
    const message = await this.messageService.createMessage(
      content,
      Number(roomId),
    );
    this.server.to(roomId).emit('receive_message', message);
  }
}
