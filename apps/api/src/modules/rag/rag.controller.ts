import { Controller, Get, Query, UseGuards, Request, Sse } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RagService } from './rag.service';

interface MessageEvent {
  data: string;
}

@ApiTags('RAG')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Sse('stream')
  @ApiOperation({ summary: 'AI 맞춤 복지 답변 스트리밍 (SSE)' })
  streamChat(
    @Request() req: { user: { id: string } },
    @Query('sessionId') sessionId: string,
    @Query('q') question: string,
  ): Observable<MessageEvent> {
    const generator = this.ragService.streamAnswer(req.user.id, sessionId, question);
    return new Observable((subscriber) => {
      (async () => {
        for await (const token of generator) {
          subscriber.next({ data: token });
        }
        subscriber.next({ data: '[DONE]' });
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }
}
