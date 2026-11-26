interface ApiRequest {
  method?: string;
  body?: { code?: string } | string;
  query?: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

const RELEASE_BASE = 'https://github.com/GLOBAL134/snowflake-app/releases/download/v2.4.0';

const DOWNLOAD_URLS = {
  macPkg: `${RELEASE_BASE}/SnowFlake-2.4.0-arm64.pkg`,
  macDmg: `${RELEASE_BASE}/SnowFlake-2.4.0-arm64.dmg`,
  winExe: `${RELEASE_BASE}/SnowFlake-Setup-2.4.0-x64.exe`,
  linuxDeb: `${RELEASE_BASE}/snowflake-crossplatform_2.4.0_amd64.deb`,
  linuxAppImage: `${RELEASE_BASE}/SnowFlake-2.4.0.AppImage`,
  androidApk: `${RELEASE_BASE}/SnowFlake-Android.apk`,
  iosIpa: `${RELEASE_BASE}/SnowFlake-iOS-unsigned.ipa`
};

export default function handler(req: ApiRequest, res: ApiResponse): void {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  let rawCode = '';
  if (req.method === 'GET') {
    const q = req.query?.code;
    rawCode = Array.isArray(q) ? q[0] || '' : q || '';
  } else {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as { code?: string };
      } catch {
        body = {};
      }
    }
    rawCode = (body && typeof body === 'object' ? body.code : '') || '';
  }

  const expected = (process.env.SNOWFLAKE_ACCESS_CODE || 'SNOWFLAKE-2026').trim().toUpperCase();
  const provided = rawCode.trim().toUpperCase();

  if (!provided || provided !== expected) {
    res.status(403).json({ ok: false, error: 'Invalid access code' });
    return;
  }

  res.status(200).json({ ok: true, downloads: DOWNLOAD_URLS });
}
