import { Controller, Get, Query, UseGuards, Request, Sse } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RagService, RagStreamEvent } from './rag.service';

interface MessageEvent {
  data: string;
}

type StreamPayload =
  | { eventType: 'SESSION_CREATED'; sessionId: string }
  | { eventType: 'THINK' }
  | { eventType: 'TOKEN'; content: string }
  | { eventType: 'DONE' };

function toStreamPayload(event: RagStreamEvent): StreamPayload {
  if (event.type === 'session_created') {
    return { eventType: 'SESSION_CREATED', sessionId: event.data };
  }

  if (event.type === 'think') {
    return { eventType: 'THINK' };
  }

  if (event.type === 'text') {
    return { eventType: 'TOKEN', content: event.data };
  }

  return { eventType: 'DONE' };
}

@ApiTags('RAG')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rag')
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Get('suggestions')
  @ApiOperation({ summary: '유저 프로필 기반 추천 질문 (Neo4j + Qdrant, AI 없음)' })
  getSuggestions(@Request() req: { user: { id: string } }) {
    return this.ragService.getSuggestions(req.user.id);
  }

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
        for await (const event of generator) {
          subscriber.next({ data: JSON.stringify(toStreamPayload(event)) });
        }
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }
}
