
import axios from 'axios';
 
function resolvePath(obj, path) {
  return path.split('.').reduce((acc, key) => {
    if (acc && typeof acc === 'object') return acc[key];
    return undefined;
  }, obj);
}
 
function applyResponseMap(data, map) {
  const result = {};
  for (const [sourcePath, targetField] of Object.entries(map)) {
    result[targetField] = resolvePath(data, sourcePath);
  }
  return result;
}
 
async function fetchOAuthToken(c) {
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: c.oauthClientId ?? '',
    client_secret: c.oauthClientSecret ?? '',
    ...(c.oauthScope ? { scope: c.oauthScope } : {}),
  });
  const res = await axios.post(c.oauthTokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  });
  return String(res.data.access_token ?? '');
}
 
export class RestAdapter {
  type = 'REST';
 
  async test(config) {
    const c = config;
    if (!c.url) return { success: false, message: 'url required' };
    try {
      await axios.get(c.url, { timeout: 5000, validateStatus: () => true });
      return { success: true };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'failed' };
    }
  }
 
  async execute(config, payload) {
    const c = config;
 
    if (!c.url) return { success: false, error: 'url is required in connection config' };
 
    // Validate URL format
    try { new URL(c.url); } catch {
      return { success: false, error: `Invalid URL: "${c.url}" — must start with https:// or http://` };
    }
 
    const authHeaders = {};
    if (c.authType === 'apiKey' && c.apiKey) {
      authHeaders[c.apiKeyHeader ?? 'X-API-Key'] = c.apiKey;
    } else if (c.authType === 'oauth2' && c.oauthTokenUrl) {
      try {
        const token = await fetchOAuthToken(c);
        authHeaders['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        return { success: false, error: `OAuth token fetch failed: ${e instanceof Error ? e.message : 'unknown'}` };
      }
    }
 
    let lastError;
    const attempts = c.retryAttempts ?? 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await axios({
          url: c.url,
          method: c.method ?? 'POST',
          headers: { ...c.headers, ...authHeaders },
          data: payload,
          timeout: 10000,
        });
        const mapped = c.responseMap && Object.keys(c.responseMap).length > 0
          ? applyResponseMap(res.data, c.responseMap)
          : res.data;
        return { success: true, data: mapped };
      } catch (e) {
        lastError = e instanceof Error ? e.message : 'request failed';
        if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
      }
    }
    return { success: false, error: lastError };
  }
}
