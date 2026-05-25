import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 100 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(50)<800', 'p(95)<2000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE = __ENV.API_URL || 'http://localhost:3000';

export default function () {
  const r = Math.random();
  if (r < 0.4) {
    http.get(`${BASE}/dashboard`);
  } else if (r < 0.65) {
    http.get(`${BASE}/health`);
  } else if (r < 0.85) {
    http.get(`${BASE}/auth/me`);
  } else {
    http.get(`${BASE}/health`);
  }
  sleep(1);
}
