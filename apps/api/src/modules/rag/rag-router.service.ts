import { Injectable } from '@nestjs/common';

export type RagRouteType = 'SEARCH' | 'ELIGIBILITY' | 'APPLICATION_ASSIST';

export type RagRouteDecision = {
  routeType: RagRouteType;
  detail: string;
};

const ELIGIBILITY_INTENT =
  /받을 수 있|받을수있|자격(이|은|을)?|조건(이|은|을)?\s*(뭐|무엇|어떻|되는|맞|해당)|대상인지|해당되|가능한지|eligible/i;
const APPLICATION_ASSIST_INTENT =
  /신청\s*(방법|절차|순서|링크|페이지)|어떻게\s*신청|신청하려면|준비\s*서류|필요\s*서류|준비물|제출\s*서류|다음\s*단계|뭐부터\s*해야/i;

@Injectable()
export class RagRouterService {
  resolve(question: string): RagRouteDecision {
    if (ELIGIBILITY_INTENT.test(question)) {
      return {
        routeType: 'ELIGIBILITY',
        detail: '질문에 자격·조건·대상 판별 의도가 있어 자격확인 workflow로 라우팅했습니다.',
      };
    }

    if (APPLICATION_ASSIST_INTENT.test(question)) {
      return {
        routeType: 'APPLICATION_ASSIST',
        detail: '질문에 신청 절차·서류·실행 단계 의도가 있어 신청도움 workflow로 라우팅했습니다.',
      };
    }

    return {
      routeType: 'SEARCH',
      detail: '기본 검색형 질문으로 판단해 검색 ReAct 그래프로 라우팅했습니다.',
    };
  }
}
