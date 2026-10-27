import { api } from './api';

/**
 * 웹푸시 구독 헬퍼.
 *
 * 권한 요청은 반드시 사용자의 클릭에서 출발해야 한다. 페이지 로드 직후
 * 자동으로 requestPermission을 부르면 브라우저가 차단하고, 한 번 거부되면
 * 사용자가 설정에서 직접 풀기 전까지 되돌릴 수 없다.
 */

/** base64url VAPID 공개키를 Push API가 요구하는 Uint8Array로 변환. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function pushPermission(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function getSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/** 권한 요청 → 구독 생성 → 서버 등록. 실패 사유를 문자열로 돌려준다. */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: '이 브라우저는 웹 알림을 지원하지 않습니다.' };

  const { enabled, publicKey } = await api<{ enabled: boolean; publicKey: string | null }>(
    '/notifications/push/key',
  );
  if (!enabled || !publicKey) {
    return { ok: false, reason: '서버에 알림이 설정되어 있지 않습니다.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      reason:
        permission === 'denied'
          ? '알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 아이콘에서 허용으로 바꿔주세요.'
          : '알림 권한이 필요합니다.',
    };
  }

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true, // 표준 요구사항: 모든 푸시는 사용자에게 보여야 한다
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    }));

  await api('/notifications/push/subscribe', { method: 'POST', body: sub.toJSON() });
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  const sub = await getSubscription();
  if (!sub) return;
  await api('/notifications/push/subscribe', {
    method: 'DELETE',
    body: { endpoint: sub.endpoint },
  }).catch(() => undefined);
  await sub.unsubscribe();
}
