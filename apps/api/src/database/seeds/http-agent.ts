/**
 * 시드 공통 HTTP keepAlive 설정.
 * 시드 스크립트 상단에서 import만 하면 글로벌 axios 호출 전체가 connection을 재사용한다.
 *
 * 효과: 공공데이터포털 detail/list API 수천 건 호출 시 매번 발생하던
 * TLS 핸드셰이크 비용을 제거 (건당 ~100ms × 수천 건 → 수분 절감).
 */
import axios from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16 });

axios.defaults.httpAgent = httpAgent;
axios.defaults.httpsAgent = httpsAgent;

export { httpAgent, httpsAgent };
