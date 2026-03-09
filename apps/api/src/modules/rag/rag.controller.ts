import { Controller, Get, Query, UseGuards, Request, Sse, HttpCode, HttpStatus } from '@nestjs/common';
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
        for await (const token of generator) {
          subscriber.next({ data: token });
        }
        subscriber.next({ data: '[DONE]' });
        subscriber.complete();
      })().catch((err) => subscriber.error(err));
    });
  }
}
