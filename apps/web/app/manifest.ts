import type { MetadataRoute } from 'next';

/**
 * PWA 매니페스트. Next의 파일 규약이라 /manifest.webmanifest로 자동 서빙된다.
 *
 * 아이콘은 app/icons/[size]/route.tsx가 그려서 돌려준다. any와 maskable을
 * 나눠 선언하는 이유: maskable은 안드로이드가 원형 등으로 잘라내므로 여백이
 * 필요하고, any는 잘리지 않아 여백이 있으면 작아 보인다. 우리는 한 장으로
 * 둘 다 쓰되 purpose를 명시해 런처가 알아서 고르게 한다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'WelfareAI — 내 조건에 맞는 복지와 지원금 찾기',
    short_name: 'WelfareAI',
    description:
      '복지, 주거, 청년정책, 공공임대, 시설 정보를 한곳에서 찾는 AI 복지 컨시어지',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f2f8fe',
    theme_color: '#f2f8fe',
    lang: 'ko',
    categories: ['government', 'lifestyle', 'utilities'],
    icons: [
      { src: '/icons/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: '새 대화', short_name: '대화', url: '/chat' },
      { name: '정책 찾기', short_name: '정책', url: '/policies' },
      { name: '알림', short_name: '알림', url: '/notifications' },
    ],
  };
}
