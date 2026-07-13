'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, Calendar, Loader2, MapPin, Search } from 'lucide-react';
import { api } from '../../../lib/api';
import { PolicyListCard } from '../../../components/policy/policy-list-card';
import { TagPill } from '../../../components/ui/tag-pill';
import {
  type Policy,
  categoryLabel,
  deadlineTag,
  formatAmount,
} from '../../../lib/policy';
import { useUserStore } from '../../../store/user.store';

interface PolicyPage {
  items: Policy[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Bookmark {
  id: string;
  policyId: string;
  status: string;
}

type CategoryGroup = 'HOUSING' | 'JOB' | 'CARE' | 'HEALTH' | 'FINANCE' | 'EDUCATION';
type PolicySort = 'recent' | 'deadline';

const CATEGORY_FILTERS: Array<{ key: CategoryGroup | null; label: string }> = [
  { key: null, label: '전체' },
  { key: 'HOUSING', label: '주거' },
  { key: 'JOB', label: '일자리' },
  { key: 'CARE', label: '돌봄' },
  { key: 'HEALTH', label: '건강' },
  { key: 'FINANCE', label: '금융' },
  { key: 'EDUCATION', label: '교육' },
];

const SIDO_LIST = [
  { code: '', name: '전체 지역' },
  { code: '11', name: '서울특별시' },
  { code: '26', name: '부산광역시' },
  { code: '27', name: '대구광역시' },
  { code: '28', name: '인천광역시' },
  { code: '29', name: '광주광역시' },
  { code: '30', name: '대전광역시' },
  { code: '31', name: '울산광역시' },
  { code: '36', name: '세종특별자치시' },
  { code: '41', name: '경기도' },
  { code: '43', name: '충청북도' },
  { code: '44', name: '충청남도' },
  { code: '45', name: '전북특별자치도' },
  { code: '46', name: '전라남도' },
  { code: '47', name: '경상북도' },
  { code: '48', name: '경상남도' },
  { code: '50', name: '제주특별자치도' },
];

const PAGE_SIZE = 60;

export default function PoliciesListPage() {
  const router = useRouter();
  const profile = useUserStore((s) => s.profile);

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeCategory, setActiveCategory] = useState<CategoryGroup | null>(null);
  const [query, setQuery] = useState('');
  const [selectedSidoCode, setSelectedSidoCode] = useState(profile?.sidoCode ?? '');
  const [sort, setSort] = useState<PolicySort>('recent');
  const [bookmarkMap, setBookmarkMap] = useState<Map<string, string>>(new Map());
  const deferredQuery = useDeferredValue(query.trim());
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const requestSeqRef = useRef(0);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    setSelectedSidoCode(profile?.sidoCode ?? '');
  }, [profile?.sidoCode]);

  const hasMore = page < totalPages;

  const fetchPoliciesPage = useCallback(
    async (nextPage: number, mode: 'replace' | 'append') => {
      const requestSeq = ++requestSeqRef.current;
      if (mode === 'replace') {
        loadingMoreRef.current = false;
        setLoadingMore(false);
        setLoading(true);
        setLoadError(false);
      } else {
        loadingMoreRef.current = true;
        setLoadingMore(true);
      }

      const params = new URLSearchParams();
      if (activeCategory) params.set('categoryGroup', activeCategory);
      if (selectedSidoCode) params.set('sidoCode', selectedSidoCode);
      if (deferredQuery) params.set('q', deferredQuery);
      if (sort !== 'recent') params.set('sort', sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('page', String(nextPage));

      try {
        const res = await api<PolicyPage>(`/policies?${params.toString()}`);
        if (requestSeq !== requestSeqRef.current) return;

        setPolicies((prev) => {
          if (mode === 'replace') return res.items;
          const seen = new Set(prev.map((item) => item.id));
          return [...prev, ...res.items.filter((item) => !seen.has(item.id))];
        });
        setTotal(res.total);
        setPage(res.page);
        setTotalPages(res.totalPages);
      } catch {
        if (requestSeq !== requestSeqRef.current) return;
        if (mode === 'replace') {
          setPolicies([]);
          setTotal(0);
          setPage(1);
          setTotalPages(1);
          setLoadError(true);
        }
      } finally {
        if (requestSeq !== requestSeqRef.current) return;
        if (mode === 'replace') {
          setLoading(false);
        } else {
          loadingMoreRef.current = false;
          setLoadingMore(false);
        }
      }
    },
    [activeCategory, deferredQuery, selectedSidoCode, sort],
  );

  useEffect(() => {
    loadingMoreRef.current = false;
    setLoadingMore(false);
    void fetchPoliciesPage(1, 'replace');
  }, [fetchPoliciesPage]);

  useEffect(() => {
    if (loading || loadingMore || !hasMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting || loadingMoreRef.current) return;
        void fetchPoliciesPage(page + 1, 'append');
      },
      { rootMargin: '220px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchPoliciesPage, hasMore, loading, loadingMore, page]);

  useEffect(() => {
    api<Array<Bookmark & { policy: Policy | null }>>('/bookmarks')
      .then((bms) => {
        const map = new Map<string, string>();
        bms.forEach((b) => map.set(b.policyId, b.id));
        setBookmarkMap(map);
      })
      .catch(() => setBookmarkMap(new Map()));
  }, []);

  const selectedRegionLabel = useMemo(
    () => SIDO_LIST.find((item) => item.code === selectedSidoCode)?.name ?? '전체 지역',
    [selectedSidoCode],
  );

  const visibleCount = policies.length;

  const toggleBookmark = async (policyId: string) => {
    const existingId = bookmarkMap.get(policyId);
    if (existingId) {
      try {
        await api(`/bookmarks/${existingId}`, { method: 'DELETE' });
        setBookmarkMap((prev) => {
          const next = new Map(prev);
          next.delete(policyId);
          return next;
        });
      } catch {
        // ignore
      }
    } else {
      try {
        const bm = await api<Bookmark>('/bookmarks', {
          method: 'POST',
          body: { policyId },
        });
        setBookmarkMap((prev) => {
          const next = new Map(prev);
          next.set(policyId, bm.id);
          return next;
        });
      } catch {
        // ignore
      }
    }
  };

  return (
    <>
      <header
        className="page-header-responsive"
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-canvas)',
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            복지 정책
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              margin: '4px 0 0',
            }}
          >
            {loading ? '불러오는 중...' : `총 ${total.toLocaleString()}건`}
          </p>
        </div>
        <div
          className="page-actions-responsive policy-filter-actions-responsive"
          style={{ display: 'flex', gap: 8 }}
        >
          <label
            className="btn-secondary policy-filter-button-responsive"
            style={{
              height: 36,
              minWidth: 156,
              position: 'relative',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <MapPin
              size={14}
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
            <select
              value={selectedSidoCode}
              onChange={(e) => setSelectedSidoCode(e.target.value)}
              aria-label="지역 필터"
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                width: '100%',
                height: '100%',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font)',
                padding: '0 34px 0 34px',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {SIDO_LIST.map((item) => (
                <option key={item.code || 'all'} value={item.code}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary policy-filter-button-responsive"
            style={{
              height: 36,
              borderColor: sort === 'deadline' ? 'var(--accent)' : undefined,
              color: sort === 'deadline' ? 'var(--accent-text)' : undefined,
              background: sort === 'deadline' ? 'var(--accent-soft)' : undefined,
            }}
            onClick={() => setSort((prev) => (prev === 'deadline' ? 'recent' : 'deadline'))}
          >
            {sort === 'deadline' ? <Calendar size={14} /> : <ArrowDownUp size={14} />}
            {sort === 'deadline' ? '기한순 적용' : '기한순'}
          </button>
        </div>
      </header>

      <div
        className="page-content-responsive"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 28px 28px',
          background: 'var(--bg-canvas)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 18,
          }}
        >
          {CATEGORY_FILTERS.map((f) => {
            const active = activeCategory === f.key;
            return (
              <button
                key={f.label}
                onClick={() => setActiveCategory(f.key)}
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  padding: '7px 14px',
                  borderRadius: 999,
                  background: active ? 'var(--accent)' : 'var(--bg-surface)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                  cursor: 'pointer',
                  letterSpacing: '-0.01em',
                  fontFamily: 'var(--font)',
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            placeholder="정책명, 지원내용 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ paddingLeft: 34, height: 40 }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              padding: '6px 10px',
              borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            지역: {selectedRegionLabel}
          </span>
          <span
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              padding: '6px 10px',
              borderRadius: 999,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
            }}
          >
            정렬: {sort === 'deadline' ? '기한 임박순' : '최신순'}
          </span>
          {!loading && (
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                padding: '6px 10px',
                borderRadius: 999,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
              }}
            >
              표시 중: {visibleCount.toLocaleString()} / {total.toLocaleString()}
            </span>
          )}
        </div>

        {loading ? (
          <div
            className="two-col-grid-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                style={{
                  height: 170,
                  borderRadius: 12,
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  opacity: 0.6,
                }}
              />
            ))}
          </div>
        ) : policies.length === 0 ? (
          <div
            style={{
              padding: '64px 0',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: 14,
            }}
          >
            조건에 맞는 정책이 없습니다.
          </div>
        ) : (
          <div
            className="two-col-grid-responsive"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12,
            }}
          >
            {policies.map((p) => {
              const deadline = deadlineTag(p.applicationEnd);
              return (
                <PolicyListCard
                  key={p.id}
                  title={p.name}
                  tag={categoryLabel(p.category)}
                  agency={p.provider ?? p.source}
                  deadline={deadline.label}
                  urgent={deadline.kind === 'danger'}
                  amount={formatAmount(p.benefitAmount, p.benefitType)}
                  desc={p.summary ?? p.targetSummary}
                  bookmarked={bookmarkMap.has(p.id)}
                  onClick={() => router.push(`/policies/${p.id}`)}
                  onBookmark={() => void toggleBookmark(p.id)}
                />
              );
            })}
          </div>
        )}

        {!loading && policies.length > 0 && (
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            {hasMore ? (
              <>
                <div ref={loadMoreRef} style={{ width: '100%', height: 1 }} />
                <button
                  className="btn-secondary"
                  onClick={() => void fetchPoliciesPage(page + 1, 'append')}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> 더 불러오는 중...
                    </>
                  ) : (
                    '정책 더 보기'
                  )}
                </button>
              </>
            ) : (
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'var(--text-muted)',
                }}
              >
                모든 정책을 불러왔습니다.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
