'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { SwapText } from '@/components/motion/enter';
import {
  disablePush,
  enablePush,
  getSubscription,
  pushPermission,
  pushSupported,
} from '@/lib/push';

type State = 'loading' | 'unsupported' | 'off' | 'on' | 'blocked';

/**
 * 브라우저 알림 켜기/끄기.
 *
 * 권한 요청은 이 버튼 클릭에서만 출발한다. 자동 요청은 브라우저가 막고,
 * 한 번 거부되면 사용자가 설정에서 직접 풀기 전까지 되돌릴 수 없다.
 */
export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(async () => {
    if (!pushSupported()) return setState('unsupported');
    if (pushPermission() === 'denied') return setState('blocked');
    setState((await getSubscription()) ? 'on' : 'off');
  }, []);

  useEffect(() => {
    void sync();
  }, [sync]);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (state === 'on') {
        await disablePush();
        setState('off');
      } else {
        const result = await enablePush();
        if (!result.ok) {
          setMessage(result.reason ?? '알림을 켜지 못했습니다.');
          await sync();
        } else {
          setState('on');
          setMessage('알림이 켜졌습니다.');
        }
      }
    } catch (error) {
      setMessage((error as Error).message || '알림 설정 중 문제가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { sent } = await api<{ sent: number }>('/notifications/push/test', {
        method: 'POST',
      });
      setMessage(sent > 0 ? '테스트 알림을 보냈습니다.' : '등록된 기기가 없습니다.');
    } catch {
      setMessage('테스트 발송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading' || state === 'unsupported') return null;

  const on = state === 'on';
  const blocked = state === 'blocked';
  const Icon = blocked ? BellOff : on ? BellRing : Bell;

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
    >
      <div
        aria-hidden
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 38,
          height: 38,
          borderRadius: 10,
          flexShrink: 0,
          background: on ? 'var(--accent-soft)' : 'var(--bg-hover)',
          color: on ? 'var(--accent-text)' : 'var(--text-muted)',
        }}
      >
        <Icon size={18} strokeWidth={1.8} />
      </div>

      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
          브라우저 알림
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
          <SwapText token={state}>
          {blocked
            ? '브라우저에서 차단되어 있습니다. 주소창의 자물쇠 아이콘에서 허용으로 바꿔주세요.'
            : on
              ? '마감 임박·신규 매칭 알림을 기기로 받습니다.'
              : '앱을 열지 않아도 마감 임박 정책을 알려드립니다.'}
          </SwapText>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {on ? (
          <button type="button" className="btn-ghost" onClick={sendTest} disabled={busy}>
            테스트
          </button>
        ) : null}
        <button
          type="button"
          className={on ? 'btn-secondary' : 'btn-primary'}
          onClick={toggle}
          disabled={busy || blocked}
        >
          <SwapText token={busy ? 'busy' : state}>
            {busy ? '처리 중…' : on ? '끄기' : '알림 켜기'}
          </SwapText>
        </button>
      </div>

      {message ? (
        <div
          role="status"
          style={{
            width: '100%',
            fontSize: 13,
            color: 'var(--text-secondary)',
            borderTop: '1px solid var(--border)',
            paddingTop: 10,
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}
