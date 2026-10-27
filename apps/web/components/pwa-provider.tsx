'use client';

import { useEffect } from 'react';

/**
 * 서비스워커 등록. 레이아웃에 한 번만 올린다.
 *
 * 개발 모드에서는 등록하지 않는다 — SW가 Next의 HMR 요청을 가로채
 * 수정이 반영되지 않는 것처럼 보이는 혼란을 막기 위해서다.
 */
export function PwaProvider() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // load 이후에 등록해 초기 렌더와 경쟁하지 않게 한다.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // 등록 실패는 앱 동작을 막지 않는다(PWA는 부가 기능).
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }, []);

  return null;
}
