import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
// web-push는 CommonJS 모듈이라 default export가 없다.
// esModuleInterop의 default import는 undefined가 되어 런타임에 터진다.
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';

export interface PushPayload {
  title: string;
  body: string;
  /** 클릭 시 이동할 경로. 서비스워커가 이미 열린 탭을 재사용한다. */
  url?: string;
  /** 같은 tag는 덮어쓴다 — 마감 알림이 매일 쌓이지 않게 dedupeKey를 넣는다. */
  tag?: string;
}

/**
 * 웹푸시 발송.
 *
 * FCM 대신 VAPID를 쓰는 이유: Firebase 프로젝트·SDK 없이 표준 Web Push만으로
 * 크롬·파이어폭스·사파리(16.4+)를 모두 덮을 수 있고, 외부 계정 의존이 없다.
 * (user.fcmToken 컬럼은 과거 FCM 전제의 잔재이며 현재 아무도 쓰지 않는다.)
 *
 * VAPID 키가 없으면 조용히 비활성화된다 — 푸시는 부가 기능이라
 * 키 미설정이 앱 부팅을 막으면 안 된다.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    const subject = config.get<string>('VAPID_SUBJECT', 'mailto:admin@welfare.local');

    this.enabled = Boolean(publicKey && privateKey);
    if (this.enabled) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn('VAPID 키 미설정 — 웹푸시 비활성화 (인앱 알림은 정상 동작)');
    }
  }

  isEnabled() {
    return this.enabled;
  }

  async subscribe(userId: string, sub: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }, userAgent?: string) {
    // 같은 브라우저가 재구독하면 endpoint가 같으므로 upsert로 소유자만 갱신한다.
    await this.repo.upsert(
      {
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
      },
      ['endpoint'],
    );
  }

  async unsubscribe(endpoint: string) {
    await this.repo.delete({ endpoint });
  }

  /** 한 사용자의 모든 기기로 발송. 만료된 구독은 지운다. */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.enabled) return 0;

    const subs = await this.repo.find({ where: { userId } });
    if (subs.length === 0) return 0;

    const body = JSON.stringify(payload);
    let sent = 0;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          sent += 1;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // 410 Gone / 404 Not Found = 구독 폐기됨. 재시도해도 영영 실패하므로 지운다.
          if (status === 410 || status === 404) {
            await this.repo.delete({ endpoint: sub.endpoint }).catch(() => undefined);
            return;
          }
          this.logger.warn(`웹푸시 발송 실패(${status ?? 'unknown'}): ${sub.endpoint.slice(0, 48)}…`);
        }
      }),
    );

    return sent;
  }
}
