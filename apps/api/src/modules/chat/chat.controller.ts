import { Controller, Get, Post, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatService } from './chat.service';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  getSessions(@Request() req: { user: { id: string } }) {
    return this.chatService.getSessions(req.user.id);
  }

  @Post('sessions')
  createSession(
    @Request() req: { user: { id: string } },
    @Body('title') title?: string,
  ) {
    return this.chatService.createSession(req.user.id, title);
  }

  @Get('sessions/:id/messages')
  getMessages(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chatService.getMessages(req.user.id, id);
  }

  @Post('sessions/:id/open')
  openSession(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chatService.openSession(req.user.id, id);
  }

  @Post('sessions/:id/close')
  closeSession(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chatService.closeSession(req.user.id, id);
  }

  @Delete('sessions/:id')
  deleteSession(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    return this.chatService.deleteSession(req.user.id, id);
  }
}
