import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { ChatSession } from './entities/chat-session.entity';

type WakeHandler = () => void;
type RuntimeSnapshot = {
  runtimeState: 'OPEN' | 'CLOSED';
  activeStreamToken: string | null;
  activeStreamClosed: boolean;
  activeStreamStartedAt: string | null;
  activeStreamClosedAt: string | null;
};
type WakeSignalReason = 'close' | 'activity' | 'finish';

const RUNTIME_TTL_SECONDS = 60 * 60 * 24;
const WAKE_CHANNEL = 'chat-runtime:wake';

@Injectable()
export class ChatRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatRuntimeService.name);
  private readonly wakeHandlers = new Map<string, WakeHandler>();
  private readonly redisPublisher: Redis;
  private readonly redisSubscriber: Redis;

  constructor(
    @InjectRepository(ChatSession)
    private readonly sessionRepo: Repository<ChatSession>,
    private readonly config: ConfigService,
  ) {
    const options = {
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: null as null,
    };

    this.redisPublisher = new Redis(options);
    this.redisSubscriber = new Redis(options);
    this.redisSubscriber.on('message', this.handleWakeMessage);
  }

  async onModuleInit() {
    try {
      await this.redisSubscriber.subscribe(WAKE_CHANNEL);
    } catch (error) {
      this.logger.warn(`Redis wake subscription unavailable: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([
      this.redisSubscriber.unsubscribe(WAKE_CHANNEL),
      this.redisSubscriber.quit(),
      this.redisPublisher.quit(),
    ]);
  }

  async openSession(sessionId: string) {
    await this.sessionRepo.update(sessionId, {
      runtimeState: 'OPEN',
    });
    await this.writeRuntime(sessionId, {
      runtimeState: 'OPEN',
    });

    return { id: sessionId, state: 'OPEN' as const };
  }

  async closeSession(sessionId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: ['id', 'activeStreamToken'],
    });

    await this.sessionRepo.update(sessionId, {
      runtimeState: 'CLOSED',
      activeStreamClosed: true,
      activeStreamClosedAt: new Date(),
    });
    await this.writeRuntime(sessionId, {
      runtimeState: 'CLOSED',
      activeStreamClosed: true,
      activeStreamClosedAt: new Date().toISOString(),
    });

    if (session?.activeStreamToken) {
      await this.broadcastWake(sessionId, session.activeStreamToken, 'close');
    }

    return { id: sessionId, state: 'CLOSED' as const };
  }

  async isSessionOpen(sessionId: string) {
    const runtime = await this.getRuntimeSnapshot(sessionId);
    return runtime?.runtimeState === 'OPEN';
  }

  async startStream(sessionId: string) {
    const token = randomUUID();
    const startedAt = new Date();
    await this.sessionRepo.update(sessionId, {
      runtimeState: 'OPEN',
      activeStreamToken: token,
      activeStreamClosed: false,
      activeStreamStartedAt: startedAt,
      activeStreamClosedAt: null,
    });
    await this.writeRuntime(sessionId, {
      runtimeState: 'OPEN',
      activeStreamToken: token,
      activeStreamClosed: false,
      activeStreamStartedAt: startedAt.toISOString(),
      activeStreamClosedAt: null,
    });

    return token;
  }

  notifyActivity(sessionId: string, token: string) {
    this.consumeWakeHandler(sessionId, token)?.();
  }

  async waitForWake(sessionId: string, token: string, timeoutMs = 1200) {
    if (await this.isStreamClosed(sessionId, token)) {
      return;
    }

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.setWakeHandler(sessionId, token);
        resolve();
      };

      const timer = setTimeout(finish, timeoutMs);
      this.setWakeHandler(sessionId, token, finish);
      void this.isStreamClosed(sessionId, token).then((closed) => {
        if (closed) {
          finish();
        }
      });
    });
  }

  private setWakeHandler(sessionId: string, token: string, wake?: WakeHandler) {
    const key = this.handlerKey(sessionId, token);
    if (!wake) {
      this.wakeHandlers.delete(key);
      return;
    }

    this.wakeHandlers.set(key, wake);
  }

  async isStreamClosed(sessionId: string, token: string) {
    const runtime = await this.getRuntimeSnapshot(sessionId);
    return !runtime || runtime.activeStreamToken !== token || runtime.activeStreamClosed;
  }

  async finishStream(sessionId: string, token: string) {
    this.consumeWakeHandler(sessionId, token);
    const runtime = await this.getRuntimeSnapshot(sessionId);

    if (!runtime || runtime.activeStreamToken !== token) {
      return;
    }

    await this.sessionRepo.update(sessionId, {
      activeStreamToken: null,
      activeStreamClosed: true,
      activeStreamClosedAt: new Date(),
      activeStreamStartedAt: null,
    });
    await this.writeRuntime(sessionId, {
      activeStreamToken: null,
      activeStreamClosed: true,
      activeStreamClosedAt: new Date().toISOString(),
      activeStreamStartedAt: null,
    });
  }

  private handlerKey(sessionId: string, token: string) {
    return `${sessionId}:${token}`;
  }

  private consumeWakeHandler(sessionId: string, token: string) {
    const key = this.handlerKey(sessionId, token);
    const handler = this.wakeHandlers.get(key);
    this.wakeHandlers.delete(key);
    return handler;
  }

  private async getRuntimeSnapshot(sessionId: string): Promise<RuntimeSnapshot | null> {
    const cached = await this.readRuntime(sessionId);
    if (cached) {
      return cached;
    }

    const session = await this.sessionRepo.findOne({
      where: { id: sessionId },
      select: [
        'id',
        'runtimeState',
        'activeStreamToken',
        'activeStreamClosed',
        'activeStreamStartedAt',
        'activeStreamClosedAt',
      ],
    });

    if (!session) {
      return null;
    }

    const snapshot: RuntimeSnapshot = {
      runtimeState: session.runtimeState,
      activeStreamToken: session.activeStreamToken ?? null,
      activeStreamClosed: session.activeStreamClosed,
      activeStreamStartedAt: session.activeStreamStartedAt?.toISOString() ?? null,
      activeStreamClosedAt: session.activeStreamClosedAt?.toISOString() ?? null,
    };

    await this.writeRuntime(sessionId, snapshot);
    return snapshot;
  }

  private async readRuntime(sessionId: string): Promise<RuntimeSnapshot | null> {
    try {
      const data = await this.redisPublisher.hgetall(this.runtimeKey(sessionId));
      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        runtimeState: data.runtime_state === 'OPEN' ? 'OPEN' : 'CLOSED',
        activeStreamToken: data.active_stream_token || null,
        activeStreamClosed: data.active_stream_closed ? data.active_stream_closed === 'true' : true,
        activeStreamStartedAt: data.active_stream_started_at || null,
        activeStreamClosedAt: data.active_stream_closed_at || null,
      };
    } catch (error) {
      this.logger.warn(`Redis runtime read failed: ${(error as Error).message}`);
      return null;
    }
  }

  private async writeRuntime(sessionId: string, patch: Partial<RuntimeSnapshot>) {
    try {
      const multi = this.redisPublisher.multi();
      const key = this.runtimeKey(sessionId);

      if (patch.runtimeState !== undefined) {
        multi.hset(key, 'runtime_state', patch.runtimeState);
      }
      if (patch.activeStreamToken !== undefined) {
        multi.hset(key, 'active_stream_token', patch.activeStreamToken ?? '');
      }
      if (patch.activeStreamClosed !== undefined) {
        multi.hset(key, 'active_stream_closed', String(patch.activeStreamClosed));
      }
      if (patch.activeStreamStartedAt !== undefined) {
        multi.hset(key, 'active_stream_started_at', patch.activeStreamStartedAt ?? '');
      }
      if (patch.activeStreamClosedAt !== undefined) {
        multi.hset(key, 'active_stream_closed_at', patch.activeStreamClosedAt ?? '');
      }

      multi.expire(key, RUNTIME_TTL_SECONDS);
      await multi.exec();
    } catch (error) {
      this.logger.warn(`Redis runtime write failed: ${(error as Error).message}`);
    }
  }

  private async broadcastWake(sessionId: string, token: string, reason: WakeSignalReason) {
    this.consumeWakeHandler(sessionId, token)?.();

    try {
      await this.redisPublisher.publish(
        WAKE_CHANNEL,
        JSON.stringify({ sessionId, token, reason }),
      );
    } catch (error) {
      this.logger.warn(`Redis wake publish failed: ${(error as Error).message}`);
    }
  }

  private readonly handleWakeMessage = (_channel: string, raw: string) => {
    try {
      const parsed = JSON.parse(raw) as { sessionId?: string; token?: string };
      if (!parsed.sessionId || !parsed.token) {
        return;
      }

      this.consumeWakeHandler(parsed.sessionId, parsed.token)?.();
    } catch (error) {
      this.logger.warn(`Redis wake message parse failed: ${(error as Error).message}`);
    }
  };

  private runtimeKey(sessionId: string) {
    return `chat:runtime:session:${sessionId}`;
  }
}
