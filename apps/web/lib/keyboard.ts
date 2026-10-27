import type { KeyboardEvent } from 'react';

/**
 * IME 조합 중인 Enter인지 판별한다.
 *
 * 한글·일본어·중국어 입력은 조합(composition) 단계를 거친다. "정책"을 치는 중
 * 마지막 글자가 아직 조합 상태일 때 Enter를 누르면, 브라우저는 그 Enter를
 * "조합 확정"으로 쓰고 keydown도 함께 발생시킨다. 이때 전송하면서 입력값을
 * 비우면, 조합이 끝난 뒤 확정된 글자가 빈 입력창에 다시 들어가 한 글자가
 * 남는다("내가 넣을 정책" 전송 후 "책"이 남는 증상).
 *
 * 표준은 `isComposing`이지만 일부 브라우저·IME는 이 플래그 없이 keyCode 229만
 * 보내므로 둘 다 본다.
 */
export function isComposingEnter(event: KeyboardEvent<HTMLElement>): boolean {
  const native = event.nativeEvent as KeyboardEvent<HTMLElement>['nativeEvent'] & {
    isComposing?: boolean;
    keyCode?: number;
  };
  return Boolean(native.isComposing) || native.keyCode === 229;
}

/**
 * "Enter로 전송, Shift+Enter로 줄바꿈" 입력창의 keydown 핸들러.
 * 조합 중 Enter는 흘려보내 IME가 글자를 확정하게 둔다.
 */
export function onEnterSubmit(submit: () => void) {
  return (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    if (isComposingEnter(event)) return;
    event.preventDefault();
    submit();
  };
}
