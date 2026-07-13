import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';
import { Bookmark } from '../bookmarks/entities/bookmark.entity';
import { Policy } from '../policies/entities/policy.entity';
import { PolicyRequirement } from '../policies/entities/policy-requirement.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import {
  DEADLINE_THRESHOLDS,
  NotificationDraft,
  buildDeadlineDraft,
  buildMatchDigestDraft,
  calcAgeFromBirthDate,
  daysUntil,
  kstDateKey,
  policyMatchesProfile,
} from './notification-rules';

const MATCH_SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
const MATCH_SCAN_POLICY_LIMIT = 500;

@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(Bookmark) private readonly bookmarks: Repository<Bookmark>,
    @InjectRepository(Policy) private readonly policies: Repository<Policy>,
    @InjectRepository(PolicyRequirement)
    private readonly requirements: Repository<PolicyRequirement>,
    @InjectRepository(UserProfile) private readonly profiles: Repository<UserProfile>,
  ) {}

  /** 저장(SAVED) 정책 중 마감 D-7/D-3/D-1 도달분에 deadline 알림 생성 */
  @Cron('0 9 * * *', { name: 'deadline-notifications', timeZone: 'Asia/Seoul' })
  async runDeadlineScan(now: Date = new Date()): Promise<{ created: number }> {
    const rows: Array<{
      userId: string;
      policyId: string;
      policyName: string;
      applicationEnd: string | Date;
    }> = await this.bookmarks
      .createQueryBuilder('b')
      .innerJoin(Policy, 'p', 'p.id::text = b."policyId"')
      .select('b."userId"', 'userId')
      .addSelect('b."policyId"', 'policyId')
      .addSelect('p.name', 'policyName')
      .addSelect('p."applicationEnd"', 'applicationEnd')
      .where('b.status = :status', { status: 'SAVED' })
      .andWhere('p."applicationEnd" IS NOT NULL')
      .andWhere(`p."applicationEnd" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 day'`)
      .getRawMany();

    const drafts: NotificationDraft[] = [];
    for (const row of rows) {
      const endStr = normalizeDateString(row.applicationEnd);
      if (!endStr) continue;
      const dDay = daysUntil(endStr, now);
      if (dDay === null || !(DEADLINE_THRESHOLDS as readonly number[]).includes(dDay)) continue;
      drafts.push(
        buildDeadlineDraft({
          userId: row.userId,
          policyId: row.policyId,
          policyName: row.policyName,
          applicationEnd: endStr,
          dDay,
        }),
      );
    }

    const created = await this.insertDrafts(drafts, now);
    if (created > 0) this.logger.log(`마감 임박 알림 ${created}건 생성`);
    return { created };
  }

  /** 최근 24시간 내 등록된 정책 중 프로필 매칭분을 사용자별 하루 1건 다이제스트로 알림 */
  @Cron('30 9 * * *', { name: 'match-notifications', timeZone: 'Asia/Seoul' })
  async runMatchScan(now: Date = new Date()): Promise<{ created: number }> {
    const since = new Date(now.getTime() - MATCH_SCAN_WINDOW_MS);
    const newPolicies = await this.policies.find({
      where: { status: 'ACTIVE', createdAt: MoreThanOrEqual(since) },
      take: MATCH_SCAN_POLICY_LIMIT,
      order: { createdAt: 'DESC' },
    });
    if (newPolicies.length === 0) return { created: 0 };

    const ageReqs = await this.requirements.find({
      where: { policyId: In(newPolicies.map((p) => p.id)), reqType: 'AGE' },
    });
    const ageByPolicy = new Map<string, { min: number | null; max: number | null }>();
    for (const req of ageReqs) {
      ageByPolicy.set(req.policyId, {
        min: req.minValue !== null && req.minValue !== undefined ? Number(req.minValue) : null,
        max: req.maxValue !== null && req.maxValue !== undefined ? Number(req.maxValue) : null,
      });
    }

    const matchables = newPolicies.map((p) => ({
      id: p.id,
      name: p.name,
      sidoCodes: p.sidoCodes ?? null,
      minAge: ageByPolicy.get(p.id)?.min ?? null,
      maxAge: ageByPolicy.get(p.id)?.max ?? null,
    }));

    const profiles = await this.profiles.find();
    const dateKey = kstDateKey(now);
    const drafts: NotificationDraft[] = [];
    for (const profile of profiles) {
      const matched = matchables.filter((policy) =>
        policyMatchesProfile(policy, {
          userId: profile.userId,
          sidoCode: profile.sidoCode ?? null,
          age: calcAgeFromBirthDate(profile.birthDate, now),
        }),
      );
      const draft = buildMatchDigestDraft({ userId: profile.userId, policies: matched, dateKey });
      if (draft) drafts.push(draft);
    }

    const created = await this.insertDrafts(drafts, now);
    if (created > 0) this.logger.log(`신규 정책 매칭 알림 ${created}건 생성`);
    return { created };
  }

  /** 관리자 수동 트리거용 */
  async runAll(now: Date = new Date()) {
    const deadline = await this.runDeadlineScan(now);
    const match = await this.runMatchScan(now);
    return { deadline, match };
  }

  /** dedupeKey 유니크 인덱스 + ON CONFLICT DO NOTHING으로 중복 발송을 원천 차단 */
  private async insertDrafts(drafts: NotificationDraft[], now: Date): Promise<number> {
    if (drafts.length === 0) return 0;
    const result = await this.notifications
      .createQueryBuilder()
      .insert()
      .values(drafts.map((d) => ({ ...d, policyId: d.policyId ?? undefined, sentAt: now })))
      .orIgnore()
      .execute();
    return result.identifiers.filter(Boolean).length;
  }
}

function normalizeDateString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(value);
  }
  return String(value).slice(0, 10);
}
