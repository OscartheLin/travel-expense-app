import React, { useState, useEffect, useCallback, useRef } from 'react';
import BookList from './components/BookList';
import BookDetail from './components/BookDetail';
import AddEntry from './components/AddEntry';
import SplitView from './components/SplitView';
import DashboardView from './components/DashboardView';
import ItineraryView from './components/ItineraryView';
import './App.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const FOLDER_PATH = ['出遊記帳app'];
const CURRENCY_CODES = ['TWD','JPY','KRW','THB','HKD','SGD','USD','EUR','GBP','AUD','MYR','VND','CNY'];
const DEFAULT_RATES = { TWD:1, JPY:0.22, KRW:0.023, THB:0.90, HKD:4.10, SGD:24, USD:32, EUR:35, GBP:41, AUD:20, MYR:7, VND:0.0013, CNY:4.4 };

// ── OCR helpers ──────────────────────────────────────────────────────────────

const resizeImage = (file) => new Promise((resolve) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, 1200 / img.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});

const blobToBase64 = (blob) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.readAsDataURL(blob);
});

const GEMINI_PROMPT = `你是專業收據辨識助手，擅長日文和繁體中文收據辨識。
請仔細分析收據圖片，只回傳以下 JSON，不要任何其他文字：
{
  "storeName": "商店名稱（翻譯成繁體中文）",
  "storeNameOriginal": "商店名稱原文（日文假名漢字或簡體中文）",
  "items": "主要品項，翻譯成繁體中文，逗號分隔，最多6項",
  "amount": 實際付款合計金額（整數，不含符號和逗號）,
  "currency": "JPY 或 CNY 或 TWD",
  "taxType": "外税" 或 "内税" 或 "免税" 或 null,
  "category": "餐飲" 或 "購物" 或 "交通" 或 "住宿" 或 "娛樂" 或 "其他",
  "date": "YYYY-MM-DD 格式，看不到則填 null"
}
日本收據規則：金額取「合計」或「お会計」；外税=稅另計含稅後為總額；内税=已含稅（税込）；免税=免稅品。`;

const ocrWithGemini = async (blob, apiKey) => {
  const base64 = await blobToBase64(blob);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: GEMINI_PROMPT },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } }
        ]}],
        generationConfig: { response_mime_type: 'application/json' }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini API 錯誤 (${res.status})，請確認 API Key 是否正確`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const json = JSON.parse(text);
  return {
    item: (json.storeName || '').slice(0, 30),
    amount: json.amount ? String(Math.round(json.amount)) : '',
    currency: json.currency || 'JPY',
    category: json.category || '餐飲',
    date: json.date || null,
    note: [
      json.storeNameOriginal,
      json.items && `品項：${json.items}`,
      json.taxType && `稅別：${json.taxType}`,
    ].filter(Boolean).join('・').slice(0, 80),
  };
};

const parseOcrText = (text) => {
  if (!text || !text.trim()) return {};
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const storeName = lines.find(l => l.length > 1 && !/^[\d\s/\-.]+$/.test(l)) || '';
  const isJapanese = /[円税消費¥]/.test(text) && !/合计/.test(text);
  const isChinese = /(?:合计|总计|元|人民币)/.test(text);
  const currency = isJapanese ? 'JPY' : isChinese ? 'CNY' : 'TWD';
  let amount = '';
  if (isJapanese) {
    const total = text.match(/(?:合[計计]|小[計计]|お会計|会計)[^\d¥\n]*[¥]?\s*([\d,]+)/);
    if (total) { amount = total[1].replace(/,/g, ''); }
    else {
      const allY = [...text.matchAll(/¥([\d,]+)/g)].map(m => parseInt(m[1].replace(/,/g, '')));
      if (allY.length) amount = String(Math.max(...allY));
    }
  } else if (isChinese) {
    const total = text.match(/(?:合计|总计|应付|金额)[^\d\n]*([\d]+\.?\d*)/);
    if (total) amount = total[1];
  }
  let category = '餐飲';
  const t = text.toLowerCase();
  if (/hotel|ホテル|旅館|酒店/.test(t)) category = '住宿';
  else if (/電車|バス|タクシー|jr|地铁|公交|出租/.test(t)) category = '交通';
  else if (/スーパー|コンビニ|超市|百货|薬局/.test(t)) category = '購物';
  return { item: storeName.slice(0, 30), amount, currency, category, note: storeName ? `掃描：${storeName}`.slice(0, 40) : '' };
};

// 依 email 讀取帳本，自動把舊版 tripbooks 移轉到新 key
const loadUserBooks = (email) => {
  const key = `tripbooks_${email}`;
  const stored = localStorage.getItem(key);
  if (stored) return JSON.parse(stored);
  // 第一次用新版本：把舊 tripbooks 搬過來
  const legacy = localStorage.getItem('tripbooks');
  if (legacy) {
    localStorage.setItem(key, legacy);
    return JSON.parse(legacy);
  }
  return [];
};

// ── Document OCR helpers ──────────────────────────────────────────────────────

const DOC_GEMINI_PROMPTS = {
  flight: `請仔細分析這張機票或登機證，只回傳以下 JSON，不要任何其他文字。看不到的欄位填 null：
{"airline":"航空公司中文名稱","flightNo":"航班號","bookingRef":"訂票代號/PNR","departAirport":"出發機場（中文+代碼）","arriveAirport":"抵達機場（中文+代碼）","departTime":"登機時間 HH:MM","arriveTime":"抵達時間 HH:MM","seat":"座位號","terminal":"航廈","baggage":"行李限額（如23kg）"}`,
  hotel: `請仔細分析這份住宿確認單，只回傳以下 JSON，不要任何其他文字。看不到的欄位填 null：
{"hotelName":"飯店名稱（繁體中文）","checkIn":"入住日期 YYYY-MM-DD","checkOut":"退房日期 YYYY-MM-DD","roomType":"房型","confirmNo":"確認號碼/訂單號","breakfast":"含早餐/不含早餐","facilities":"特別設施","address":"飯店地址"}`,
  ticket: `請仔細分析這張門票，只回傳以下 JSON，不要任何其他文字。看不到的欄位填 null：
{"venueName":"場地名稱（繁體中文）","ticketName":"票種名稱","price":"票價（含幣別）","validDate":"有效日期 YYYY-MM-DD","openTime":"開放時間","ticketNo":"票號/條碼"}`,
  transport: `請仔細分析這張交通票券（火車/巴士/船票等），只回傳以下 JSON，不要任何其他文字。看不到的欄位填 null：
{"name":"交通名稱（例：のぞみ15號）","from":"出發站","to":"目的站","departTime":"出發時間 HH:MM","arriveTime":"抵達時間 HH:MM","vehicleNo":"車次/班次號","carNo":"車廂號","seat":"座位號","class":"艙等/席別","bookingRef":"訂位代號"}`,
  other: `請仔細分析這份文件，只回傳以下 JSON，不要任何其他文字。看不到的欄位填 null：
{"name":"文件名稱/標題","amount":"金額（含幣別）","note":"重要資訊摘要（30字內）"}`
};

const scanDocWithGemini = async (blob, apiKey, type) => {
  const base64 = await blobToBase64(blob);
  const mimeType = blob.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg';
  const prompt = DOC_GEMINI_PROMPTS[type] || DOC_GEMINI_PROMPTS.other;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]}],
        generationConfig: { response_mime_type: 'application/json' }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini API 錯誤 (${res.status})`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  const json = JSON.parse(text);
  return Object.fromEntries(Object.entries(json).filter(([, v]) => v !== null && v !== ''));
};

// ── Sheets journal & metadata helpers ────────────────────────────────────────

const ensureExtraSheets = async (token, sheetId) => {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  const titles = (data.sheets || []).map(s => s.properties.title);
  const requests = [];
  if (!titles.includes('日誌')) requests.push({ addSheet: { properties: { title: '日誌' } } });
  if (!titles.includes('設定')) requests.push({ addSheet: { properties: { title: '設定' } } });
  if (requests.length === 0) return;
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests })
  });
  const headerData = [];
  if (!titles.includes('日誌')) headerData.push({ range: '日誌!A1:D1', values: [['日期', '行程', '日記', '文件']] });
  if (!titles.includes('設定')) headerData.push({ range: '設定!A1:B1', values: [['欄位', '值']] });
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data: headerData })
  });
};

const loadJournalSheet = async (token, sheetId) => {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/日誌!A2:D`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.values || [];
    if (rows.length === 0) return { journal: {}, docs: [] };
    const journal = {};
    const docs = [];
    for (const [date, stopsJSON, text, docsJSON] of rows) {
      if (!date) continue;
      journal[date] = {
        stops: stopsJSON ? (() => { try { return JSON.parse(stopsJSON); } catch { return []; } })() : [],
        text: text || ''
      };
      if (docsJSON) {
        try { docs.push(...JSON.parse(docsJSON)); } catch {}
      }
    }
    return { journal, docs };
  } catch { return null; }
};

const writeJournalSheet = async (token, sheetId, journal, docs) => {
  const dateSet = new Set([
    ...Object.keys(journal),
    ...docs.map(d => d.date).filter(Boolean)
  ]);
  const rows = [...dateSet].sort().map(date => {
    const day = journal[date] || {};
    // eslint-disable-next-line no-unused-vars
    const dayDocs = docs.filter(d => d.date === date).map(({ imageBase64, ...rest }) => rest);
    return [date, JSON.stringify(day.stops || []), day.text || '', JSON.stringify(dayDocs)];
  });
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchClear`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ranges: ['日誌!A2:D1000'] })
  });
  if (rows.length === 0) return;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/日誌!A2:D?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    }
  );
};

const loadMetaSheet = async (token, sheetId) => {
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/設定!A2:B10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const meta = {};
    for (const [k, v] of (data.values || [])) { if (k) meta[k] = v || ''; }
    return Object.keys(meta).length > 0 ? meta : null;
  } catch { return null; }
};

const writeMetaSheet = async (token, sheetId, book) => {
  const rows = [
    ['name', book.name || ''],
    ['startDate', book.startDate || ''],
    ['endDate', book.endDate || ''],
    ['people', book.people || ''],
    ['budget', book.budget || ''],
    ['createdAt', String(book.createdAt || Date.now())],
  ];
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/設定!A2:B7?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows })
    }
  );
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

// Parse access_token from URL hash (returned by Google redirect flow)
const parseHashToken = () => {
  const hash = window.location.hash.slice(1);
  if (!hash || !hash.includes('access_token')) return null;
  return Object.fromEntries(hash.split('&').map(p => { const [k,v]=p.split('='); return [k, decodeURIComponent(v||'')]; }));
};

// iOS Safari and standalone PWA cannot open popups → must use redirect flow
const needsRedirectAuth = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  window.matchMedia('(display-mode: standalone)').matches ||
  !!window.navigator.standalone;

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [view, setView] = useState('books');
  const [activeBook, setActiveBook] = useState(null);
  const [books, setBooks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [journal, setJournal] = useState({});
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gapiReady, setGapiReady] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [rates, setRates] = useState(() => {
    const stored = localStorage.getItem('triprates');
    return stored ? { ...DEFAULT_RATES, ...JSON.parse(stored) } : DEFAULT_RATES;
  });
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('tripgeminikey') || '');

  const updateRates = (newRates) => {
    setRates(newRates);
    localStorage.setItem('triprates', JSON.stringify(newRates));
  };
  const [metaLoading, setMetaLoading] = useState(false);
  const [needsRelogin, setNeedsRelogin] = useState(false);
  const tokenClientRef = useRef(null);
  const tokenExpiryRef = useRef(null);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => setGapiReady(true);
    document.body.appendChild(script);

    // Check if returning from Google redirect-based OAuth
    const hashParams = parseHashToken();
    if (hashParams?.access_token) {
      window.history.replaceState(null, '', window.location.pathname);
      const expiry = Date.now() + (parseInt(hashParams.expires_in) || 3300) * 1000;
      const accessToken = hashParams.access_token;
      setToken(accessToken);
      localStorage.setItem('triptoken', accessToken);
      localStorage.setItem('triptokenexpiry', String(expiry));
      tokenExpiryRef.current = expiry;
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      }).then(r => r.json()).then(info => {
        const u = { name: info.name, email: info.email, picture: info.picture };
        setUser(u);
        localStorage.setItem('tripuser', JSON.stringify(u));
        setBooks(loadUserBooks(u.email));
      }).catch(() => {});
      return;
    }

    const storedUser = localStorage.getItem('tripuser');
    const storedToken = localStorage.getItem('triptoken');
    const storedExpiry = localStorage.getItem('triptokenexpiry');
    if (storedUser && storedToken && storedExpiry && Date.now() < parseInt(storedExpiry)) {
      const u = JSON.parse(storedUser);
      setUser(u);
      setToken(storedToken);
      tokenExpiryRef.current = parseInt(storedExpiry);
      setBooks(loadUserBooks(u.email));
    }
  }, []);

  const refreshToken = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!tokenClientRef.current) {
        // Mobile redirect flow: no GIS client available, prompt re-login
        setNeedsRelogin(true);
        reject('no client');
        return;
      }
      tokenClientRef.current.callback = (resp) => {
        if (resp.error) {
          setNeedsRelogin(true);
          reject(resp.error);
          return;
        }
        setNeedsRelogin(false);
        const expiry = Date.now() + 55 * 60 * 1000;
        setToken(resp.access_token);
        localStorage.setItem('triptoken', resp.access_token);
        localStorage.setItem('triptokenexpiry', expiry.toString());
        tokenExpiryRef.current = expiry;
        resolve(resp.access_token);
      };
      tokenClientRef.current.requestAccessToken({ prompt: '' });
    });
  }, []);

  const getValidToken = useCallback(async () => {
    if (tokenExpiryRef.current && Date.now() < tokenExpiryRef.current - 60000) return token;
    try { return await refreshToken(); } catch { return token; }
  }, [token, refreshToken]);

  const scheduleJournalSync = useCallback((bookId, j, d) => {
    clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(async () => {
      try {
        const t = await getValidToken();
        await ensureExtraSheets(t, bookId);
        await writeJournalSheet(t, bookId, j, d);
      } catch (err) { console.warn('日誌同步失敗', err); }
    }, 2500);
  }, [getValidToken]);

  const handleLogin = () => {
    // iOS Safari and standalone PWA block popups → use redirect OAuth flow
    if (needsRedirectAuth()) {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: window.location.origin + '/',
        response_type: 'token',
        scope: SCOPES,
        include_granted_scopes: 'true',
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
      return;
    }

    // Desktop: use GIS popup
    if (!window.google) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) return;
        const expiry = Date.now() + 55 * 60 * 1000;
        setToken(resp.access_token);
        localStorage.setItem('triptoken', resp.access_token);
        localStorage.setItem('triptokenexpiry', expiry.toString());
        tokenExpiryRef.current = expiry;
        tokenClientRef.current = client;
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${resp.access_token}` }
        });
        const info = await res.json();
        const u = { name: info.name, email: info.email, picture: info.picture };
        setUser(u);
        localStorage.setItem('tripuser', JSON.stringify(u));
        const localBooks = loadUserBooks(u.email);
        setBooks(localBooks);
        // Scan Drive to recover any books not in localStorage
        try {
          const driveRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and name contains '出遊記帳' and trashed=false")}&fields=files(id,name,createdTime)`,
            { headers: { Authorization: `Bearer ${resp.access_token}` } }
          );
          const driveData = await driveRes.json();
          const localIds = new Set(localBooks.map(b => b.id));
          const recovered = [];
          for (const file of (driveData.files || [])) {
            if (localIds.has(file.id)) continue;
            try {
              const meta = await loadMetaSheet(resp.access_token, file.id);
              recovered.push({
                id: file.id,
                name: (meta && meta.name) || file.name.replace('出遊記帳 - ', '') || '旅程',
                startDate: meta?.startDate || '',
                endDate: meta?.endDate || '',
                people: meta?.people || '',
                budget: meta?.budget || '',
                createdAt: meta?.createdAt ? parseInt(meta.createdAt) : Date.parse(file.createdTime),
              });
            } catch {
              recovered.push({
                id: file.id,
                name: file.name.replace('出遊記帳 - ', '') || '旅程',
                startDate: '', endDate: '', people: '', budget: '',
                createdAt: Date.parse(file.createdTime),
              });
            }
          }
          if (recovered.length > 0) {
            const merged = [...recovered, ...localBooks].sort((a, b) => b.createdAt - a.createdAt);
            localStorage.setItem(`tripbooks_${u.email}`, JSON.stringify(merged));
            setBooks(merged);
          }
        } catch (err) { console.warn('Drive 掃描失敗', err); }
      }
    });
    tokenClientRef.current = client;
    client.requestAccessToken();
  };

  const handleLogout = () => {
    setUser(null); setToken(null); tokenExpiryRef.current = null;
    setBooks([]); setActiveBook(null); setEntries([]); setJournal({}); setDocs([]);
    localStorage.removeItem('tripuser');
    localStorage.removeItem('triptoken');
    localStorage.removeItem('triptokenexpiry');
    setView('books');
  };

  const saveBooks = (b) => {
    setBooks(b);
    if (user?.email) localStorage.setItem(`tripbooks_${user.email}`, JSON.stringify(b));
  };

  const getOrCreateFolder = async (t) => {
    let parentId = 'root';
    for (const folderName of FOLDER_PATH) {
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        parentId = searchData.files[0].id;
      } else {
        const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
        });
        const folder = await createRes.json();
        parentId = folder.id;
      }
    }
    return parentId;
  };

  const createBook = async (name, startDate, endDate, people, budget) => {
    setLoading(true);
    try {
      const t = await getValidToken();
      const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: `出遊記帳 - ${name}` },
          sheets: [
            {
              properties: { title: '記帳' },
              data: [{ rowData: [{ values: [
                { userEnteredValue: { stringValue: '日期' } },
                { userEnteredValue: { stringValue: '項目' } },
                { userEnteredValue: { stringValue: '金額' } },
                { userEnteredValue: { stringValue: '幣別' } },
                { userEnteredValue: { stringValue: '消費方式' } },
                { userEnteredValue: { stringValue: '信用卡' } },
                { userEnteredValue: { stringValue: '由誰付' } },
                { userEnteredValue: { stringValue: '分類' } },
                { userEnteredValue: { stringValue: '備注' } },
                { userEnteredValue: { stringValue: '支出類型' } },
              ]}] }]
            },
            {
              properties: { title: '行程' },
              data: [{ rowData: [{ values: [
                { userEnteredValue: { stringValue: '起始日期' } },
                { userEnteredValue: { stringValue: '結束日期' } },
                { userEnteredValue: { stringValue: '城市' } },
                { userEnteredValue: { stringValue: '國家' } },
                { userEnteredValue: { stringValue: '幣別' } },
              ]}] }]
            }
          ]
        })
      });
      const sheet = await res.json();
      const sheetId = sheet.spreadsheetId;
      try {
        const folderId = await getOrCreateFolder(t);
        await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}?addParents=${folderId}&removeParents=root`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${t}` }
        });
      } catch (e) { console.warn('移動資料夾失敗'); }
      try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}/permissions`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'writer', type: 'anyone' })
        });
      } catch (e) { console.warn('設定共用權限失敗'); }
      const book = { id: sheetId, name, startDate, endDate, people, budget: budget || '', createdAt: Date.now() };
      saveBooks([book, ...books]);
      setActiveBook(book);
      setEntries([]);
      setJournal({});
      setDocs([]);
      try {
        await ensureExtraSheets(t, sheetId);
        await writeMetaSheet(t, sheetId, book);
      } catch (e) { console.warn('設定 sheet 初始化失敗', e); }
      setView('itinerary');
    } catch (e) { alert('建立失敗，請重新登入'); }
    setLoading(false);
  };

  const joinBookByUrl = async (url) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) { alert('連結格式不正確，請貼上完整的 Google Sheets 網址'); return; }
    const sheetId = match[1];
    if (books.find(b => b.id === sheetId)) { alert('這個帳本已經在清單裡了'); return; }
    setLoading(true);
    try {
      const t = await getValidToken();
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const data = await res.json();
      const rawTitle = data.properties?.title || '';
      const title = rawTitle.replace('出遊記帳 - ', '') || '共用帳本';
      let book = { id: sheetId, name: title, startDate: '', endDate: '', people: '', budget: '', createdAt: Date.now(), joined: true };
      // Load metadata from 設定 sheet
      try {
        await ensureExtraSheets(t, sheetId);
        const meta = await loadMetaSheet(t, sheetId);
        if (meta && meta.name) {
          book = { ...book, name: meta.name, startDate: meta.startDate || '', endDate: meta.endDate || '', people: meta.people || '', budget: meta.budget || '' };
        }
      } catch {}
      saveBooks([book, ...books]);
      setActiveBook(book);
      setJournal({});
      setDocs([]);
      await loadEntries(book);
      // Load journal from Sheets
      try {
        const sheetData = await loadJournalSheet(t, sheetId);
        if (sheetData) {
          setJournal(sheetData.journal);
          setDocs(sheetData.docs);
          localStorage.setItem(`tripjournal_${sheetId}`, JSON.stringify(sheetData.journal));
          localStorage.setItem(`tripdocs_${sheetId}`, JSON.stringify(sheetData.docs));
        }
      } catch {}
      setView('itinerary');
    } catch (e) { alert('加入失敗，請確認你有這個試算表的存取權限'); }
    setLoading(false);
  };

  const loadEntries = useCallback(async (book) => {
    if (!book) return;
    setLoading(true);
    try {
      const t = await getValidToken();
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${book.id}/values/記帳!A2:J`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const data = await res.json();
      const rows = (data.values || []).map((r, i) => {
        const isOldFormat = r[3] && !CURRENCY_CODES.includes(r[3]);
        let amount, currency;
        if (isOldFormat) {
          if (parseFloat(r[3])) { amount = r[3]; currency = 'JPY'; }
          else { amount = r[2]; currency = 'TWD'; }
        } else {
          amount = r[2] || ''; currency = r[3] || 'TWD';
        }
        return {
          id: i, date: r[0]||'', item: r[1]||'', amount, currency,
          method: r[4]||'', card: r[5]||'', payer: r[6]||'', category: r[7]||'',
          note: r[8]||'', splitType: r[9]||'團體'
        };
      });
      setEntries(rows);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [getValidToken]);

  const addEntry = async (entry) => {
    if (!activeBook) return;
    setLoading(true);
    try {
      const t = await getValidToken();
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}/values/記帳!A:J:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[
            entry.date, entry.item, entry.amount||'', entry.currency||'TWD',
            entry.method, entry.card, entry.payer, entry.category, entry.note, entry.splitType||'團體'
          ]] })
        }
      );
      await loadEntries(activeBook);
      setView('detail');
    } catch (e) { alert('新增失敗，請重新登入後再試'); }
    setLoading(false);
  };

  const deleteEntry = async (rowIndex) => {
    if (!activeBook) return;
    setLoading(true);
    try {
      const t = await getValidToken();
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${t}` } }
      );
      const sheetData = await sheetRes.json();
      const sheetId = sheetData.sheets[0].properties.sheetId;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ deleteDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: rowIndex + 1, endIndex: rowIndex + 2 }
          }}]
        })
      });
      await loadEntries(activeBook);
    } catch (e) { alert('刪除失敗'); }
    setLoading(false);
  };

  const updateEntry = async (rowIndex, entry) => {
    if (!activeBook) return;
    setLoading(true);
    try {
      const t = await getValidToken();
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}/values/記帳!A${rowIndex + 2}:J${rowIndex + 2}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[
            entry.date, entry.item, entry.amount||'', entry.currency||'TWD',
            entry.method, entry.card, entry.payer, entry.category, entry.note, entry.splitType||'團體'
          ]] })
        }
      );
      await loadEntries(activeBook);
      setEditingEntry(null);
      setView('detail');
    } catch (e) { alert('更新失敗，請重新登入後再試'); }
    setLoading(false);
  };

  const setBookPublic = async () => {
    if (!activeBook) return;
    setLoading(true);
    try {
      const t = await getValidToken();
      await fetch(`https://www.googleapis.com/drive/v3/files/${activeBook.id}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'writer', type: 'anyone' })
      });
      alert('已設定：任何人有連結即可編輯');
    } catch (e) { alert('設定失敗，請確認你是這個帳本的建立者'); }
    setLoading(false);
  };

  const deleteBook = (bookId) => saveBooks(books.filter(b => b.id !== bookId));

  const renamePersonInEntries = async (oldName, newName) => {
    if (!activeBook || !newName.trim() || oldName === newName.trim()) return;
    const trimmed = newName.trim();
    const toUpdate = entries.filter(e => e.payer === oldName);
    setLoading(true);
    try {
      const t = await getValidToken();
      if (toUpdate.length > 0) {
        const data = toUpdate.map(e => ({
          range: `記帳!G${e.id + 2}`,
          values: [[trimmed]]
        }));
        await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}/values:batchUpdate`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data })
          }
        );
      }
      // Update book.people list too
      if (activeBook.people) {
        const newPeople = activeBook.people
          .split(/[,，、]/)
          .map(p => p.trim() === oldName ? trimmed : p.trim())
          .join('、');
        const updated = { ...activeBook, people: newPeople };
        setActiveBook(updated);
        saveBooks(books.map(b => b.id === activeBook.id ? updated : b));
      }
      await loadEntries(activeBook);
    } catch (e) { alert('改名失敗，請重試'); }
    setLoading(false);
  };

  const openBook = async (book) => {
    setActiveBook(book);
    loadEntries(book);
    // Show local data immediately (instant)
    const storedJournal = localStorage.getItem(`tripjournal_${book.id}`);
    const localJournal = storedJournal ? JSON.parse(storedJournal) : {};
    const storedDocs = localStorage.getItem(`tripdocs_${book.id}`);
    const localDocs = storedDocs ? JSON.parse(storedDocs) : [];
    setJournal(localJournal);
    setDocs(localDocs);
    // Show spinner in ItineraryView instead of blank "no dates" screen
    if (!book.startDate || !book.endDate) setMetaLoading(true);
    setView('itinerary');
    try {
      const t = await getValidToken();
      await ensureExtraSheets(t, book.id);

      // ── Metadata sync ─────────────────────────────────────────────────────
      let activeB = book;
      if (!book.startDate || !book.endDate) {
        // Dates missing: try to recover from 設定 sheet
        const meta = await loadMetaSheet(t, book.id);
        if (meta && meta.startDate) {
          activeB = {
            ...book,
            name: meta.name || book.name,
            startDate: meta.startDate || '',
            endDate: meta.endDate || '',
            people: meta.people || book.people,
            budget: meta.budget || book.budget,
          };
          setActiveBook(activeB);
          saveBooks(books.map(b => b.id === book.id ? activeB : b));
        }
        setMetaLoading(false);
      }
      // Always write metadata to 設定 sheet (migrates old books; ensures next recovery works)
      if (activeB.name || activeB.startDate) {
        writeMetaSheet(t, book.id, activeB).catch(() => {});
      }

      // ── Journal sync ──────────────────────────────────────────────────────
      const sheetData = await loadJournalSheet(t, book.id);
      if (sheetData) {
        // Per-date merge: Sheets wins for dates it has content; local fills the rest
        const finalJournal = { ...localJournal };
        for (const [date, dayData] of Object.entries(sheetData.journal)) {
          if ((dayData.stops && dayData.stops.length > 0) || dayData.text) {
            finalJournal[date] = { ...dayData, weather: localJournal[date]?.weather };
          }
        }
        // Docs: re-attach local imageBase64; keep local-only docs too
        const sheetIds = new Set(sheetData.docs.map(d => d.id));
        const mergedDocs = sheetData.docs.map(sd => {
          const ld = localDocs.find(d => d.id === sd.id);
          return (ld && ld.imageBase64) ? { ...sd, imageBase64: ld.imageBase64 } : sd;
        });
        const extraDocs = localDocs.filter(d => !sheetIds.has(d.id));
        const finalDocs = [...mergedDocs, ...extraDocs];
        setJournal(finalJournal);
        setDocs(finalDocs);
        localStorage.setItem(`tripjournal_${book.id}`, JSON.stringify(finalJournal));
        localStorage.setItem(`tripdocs_${book.id}`, JSON.stringify(finalDocs));
      }
    } catch { setMetaLoading(false); /* silent — local data already displayed */ }
  };

  const handleSaveJournal = (j) => {
    if (!activeBook) return;
    localStorage.setItem(`tripjournal_${activeBook.id}`, JSON.stringify(j));
    setJournal(j);
    scheduleJournalSync(activeBook.id, j, docs);
  };

  const handleSaveDocs = (d) => {
    if (!activeBook) return;
    localStorage.setItem(`tripdocs_${activeBook.id}`, JSON.stringify(d));
    setDocs(d);
    scheduleJournalSync(activeBook.id, journal, d);
  };

  // ── OCR ─────────────────────────────────────────────────────────────────────
  const ocrReceipt = async (imageFile) => {
    const resized = await resizeImage(imageFile);

    // Gemini Vision API（有設定 Key 優先用，品質較好）
    if (geminiKey) {
      return await ocrWithGemini(resized, geminiKey);
    }

    // 備援：Google Drive OCR（不需要額外 Key，但準確率較低）
    const t = await getValidToken();
    const metadata = { name: `ocr_${Date.now()}`, mimeType: 'application/vnd.google-apps.document' };
    const fd = new FormData();
    fd.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    fd.append('file', resized);
    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: fd }
    );
    if (!uploadRes.ok) throw new Error(`上傳失敗 (${uploadRes.status})`);
    const { id } = await uploadRes.json();
    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${t}` } }
    );
    const text = exportRes.ok ? await exportRes.text() : '';
    fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${t}` }
    }).catch(() => {});
    return parseOcrText(text);
  };
  const scanDocument = useCallback(async (imageFile, type) => {
    if (!geminiKey) throw new Error('請先在 ⚙ AI 掃描設定中配置 Gemini Key 以啟用文件辨識');
    if (imageFile.type === 'application/pdf') {
      return await scanDocWithGemini(imageFile, geminiKey, type);
    }
    const resized = await resizeImage(imageFile);
    return await scanDocWithGemini(resized, geminiKey, type);
  }, [geminiKey]);

  // ────────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeBook || view !== 'detail') return;
    const timer = setInterval(() => { loadEntries(activeBook); }, 30000);
    return () => clearInterval(timer);
  }, [activeBook, view, loadEntries]);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showEditTrip, setShowEditTrip] = useState(false);
  const [editTripForm, setEditTripForm] = useState({ name:'', startDate:'', endDate:'', people:'', budget:'' });

  const openEditTrip = () => {
    if (!activeBook) return;
    setEditTripForm({
      name: activeBook.name || '',
      startDate: activeBook.startDate || '',
      endDate: activeBook.endDate || '',
      people: activeBook.people || '',
      budget: activeBook.budget || '',
    });
    setShowEditTrip(true);
  };

  const handleSaveTrip = async () => {
    if (!activeBook || !editTripForm.name.trim()) return;
    const updated = { ...activeBook, ...editTripForm, name: editTripForm.name.trim() };
    setActiveBook(updated);
    saveBooks(books.map(b => b.id === activeBook.id ? updated : b));
    setShowEditTrip(false);
    try {
      const t = await getValidToken();
      await ensureExtraSheets(t, updated.id);
      await writeMetaSheet(t, updated.id, updated);
    } catch { /* silent */ }
  };

  const BOOK_VIEWS = ['itinerary', 'detail', 'dashboard', 'split'];

  const getTitle = () => {
    if (view === 'books') return '我的旅程';
    if (view === 'add') return editingEntry ? '編輯記錄' : '新增一筆';
    if (view === 'dashboard') return '總覽';
    if (view === 'split') return '分帳結果';
    return activeBook?.name || '旅程';
  };

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="app-icon">📒</div>
          <h1>出遊記帳</h1>
          <p>多人即時同步，旅行記帳不漏接</p>
          <button className="btn-google" onClick={handleLogin} disabled={!gapiReady}>
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
            使用 Google 帳號登入
          </button>
          {!gapiReady && <p className="hint">載入中...</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="topbar">
        {view !== 'books' && (
          <button className="back-btn" onClick={() => {
            if (view === 'add') { setEditingEntry(null); setView('detail'); }
            else { setView('books'); }
          }}>‹</button>
        )}
        <span className="topbar-title">{getTitle()}</span>
        <div className="topbar-right" style={{ position: 'relative' }}>
          {BOOK_VIEWS.includes(view) && (
            <button className="topbar-edit-btn" onClick={openEditTrip} title="編輯旅程">✎</button>
          )}
          <img
            src={user.picture} alt={user.name} className="avatar"
            onClick={() => setShowUserMenu(v => !v)}
            style={{ cursor: 'pointer' }}
          />
          {showUserMenu && (
            <>
              <div className="user-menu-backdrop" onClick={() => setShowUserMenu(false)} />
              <div className="user-menu">
                <div className="user-menu-name">{user.name}</div>
                <div className="user-menu-email">{user.email}</div>
                <button className="user-menu-settings" onClick={() => { setShowUserMenu(false); setGeminiKeyInput(geminiKey); setShowSettings(true); }}>
                  ⚙ AI 掃描設定
                  {geminiKey && <span className="user-menu-badge">已啟用</span>}
                </button>
                <button className="user-menu-logout" onClick={() => { setShowUserMenu(false); handleLogout(); }}>
                  登出
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="content">
        {needsRelogin && (
          <div style={{ background:'#FFF3CD', borderBottom:'1px solid #FFD700', padding:'10px 16px', fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>登入已過期，請重新登入</span>
            <button onClick={handleLogin}
              style={{ background:'#185FA5', color:'#fff', border:'none', borderRadius:8, padding:'5px 14px', fontSize:13, cursor:'pointer' }}>
              重新登入
            </button>
          </div>
        )}
        {loading && <div className="loading-bar" />}
        {view === 'books' && (
          <BookList books={books} onOpen={openBook} onCreate={createBook} onJoin={joinBookByUrl} onDelete={deleteBook} loading={loading} />
        )}
        {view === 'dashboard' && activeBook && (
          <DashboardView book={activeBook} entries={entries} rates={rates} />
        )}
        {view === 'detail' && activeBook && (
          <BookDetail book={activeBook} entries={entries} rates={rates} onAdd={() => setView('add')} onRefresh={() => loadEntries(activeBook)} onDelete={deleteEntry} onEdit={(entry) => { setEditingEntry(entry); setView('add'); }} />
        )}
        {view === 'itinerary' && activeBook && (
          <ItineraryView
            book={activeBook}
            journal={journal}
            onSaveJournal={handleSaveJournal}
            docs={docs}
            onSaveDocs={handleSaveDocs}
            entries={entries}
            rates={rates}
            onScanDoc={scanDocument}
            isLoadingMeta={metaLoading}
          />
        )}
        {view === 'add' && activeBook && (
          <AddEntry
            book={activeBook}
            onSave={editingEntry ? (entry) => updateEntry(editingEntry.id, entry) : addEntry}
            onCancel={() => { setEditingEntry(null); setView('detail'); }}
            initialEntry={editingEntry}
            onOcr={ocrReceipt}
          />
        )}
        {view === 'split' && activeBook && (
          <SplitView book={activeBook} entries={entries} rates={rates} updateRates={updateRates} onSetPublic={setBookPublic} onRename={renamePersonInEntries} />
        )}
      </div>

      {showSettings && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal">
            <h2>⚙ AI 掃描設定</h2>
            <div style={{ fontSize:13, color:'#555', marginBottom:16, lineHeight:1.8, background:'#f5f7ff', borderRadius:10, padding:'10px 12px' }}>
              <strong>Gemini AI</strong> 辨識日文收據準確率遠高於預設方式，且完全免費。<br/>
              前往 <strong>aistudio.google.com</strong> → 建立 API Key（每天 1,500 次免費）。<br/>
              Key 存在本機，不會上傳任何伺服器。
            </div>
            <div className="form-group">
              <label className="form-label">Gemini API Key</label>
              <input
                className="form-input"
                type="password"
                placeholder="AIzaSy..."
                value={geminiKeyInput}
                onChange={e => setGeminiKeyInput(e.target.value)}
              />
            </div>
            {geminiKey && (
              <div style={{ fontSize:12, color:'#0F6E56', marginBottom:8 }}>
                ✅ 目前已啟用 Gemini AI 辨識
              </div>
            )}
            <button className="btn-primary" onClick={() => {
              const key = geminiKeyInput.trim();
              localStorage.setItem('tripgeminikey', key);
              setGeminiKey(key);
              setShowSettings(false);
            }}>儲存</button>
            {geminiKey && (
              <button className="btn-cancel" style={{ color:'#A32D2D' }} onClick={() => {
                localStorage.removeItem('tripgeminikey');
                setGeminiKey('');
                setGeminiKeyInput('');
                setShowSettings(false);
              }}>清除 Key（改回預設辨識）</button>
            )}
            <button className="btn-cancel" onClick={() => setShowSettings(false)}>關閉</button>
          </div>
        </div>
      )}

      {showEditTrip && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowEditTrip(false)}>
          <div className="modal">
            <h2>✎ 編輯旅程</h2>
            <div className="form-group">
              <label className="form-label">旅程名稱</label>
              <input className="form-input" value={editTripForm.name}
                onChange={e => setEditTripForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例：東京・富士山五日遊" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">
                出發 → 回程日期
                {editTripForm.startDate && editTripForm.endDate && (() => {
                  const diff = Math.floor((new Date(editTripForm.endDate + 'T00:00:00') - new Date(editTripForm.startDate + 'T00:00:00')) / 86400000) + 1;
                  return diff > 0 ? <span style={{ marginLeft:8, color:'#185FA5', fontWeight:700 }}>共 {diff} 天</span> : null;
                })()}
              </label>
              <div className="date-row">
                <input className="form-input" type="date" value={editTripForm.startDate}
                  onChange={e => setEditTripForm(f => ({ ...f, startDate: e.target.value }))} />
                <input className="form-input" type="date" value={editTripForm.endDate}
                  onChange={e => setEditTripForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">旅伴（逗號分隔）</label>
              <input className="form-input" value={editTripForm.people}
                onChange={e => setEditTripForm(f => ({ ...f, people: e.target.value }))}
                placeholder="例：珽、婷、阿偉" />
            </div>
            <div className="form-group">
              <label className="form-label">現金預算 TWD（選填）</label>
              <input className="form-input" type="number" value={editTripForm.budget}
                onChange={e => setEditTripForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="例：30000" />
            </div>
            <button className="btn-primary" onClick={handleSaveTrip}
              disabled={!editTripForm.name.trim()}>儲存</button>
            <button className="btn-cancel" onClick={() => setShowEditTrip(false)}>取消</button>
          </div>
        </div>
      )}

      {BOOK_VIEWS.includes(view) && (
        <div className="bottom-nav">
          <button className={`nav-item ${view==='itinerary'?'active':''}`} onClick={() => setView('itinerary')}>
            <span className="nav-icon">🗺</span><span>行程</span>
          </button>
          <button className={`nav-item ${view==='detail'?'active':''}`} onClick={() => setView('detail')}>
            <span className="nav-icon">📋</span><span>記帳</span>
          </button>
          <button className={`nav-item ${view==='dashboard'?'active':''}`} onClick={() => setView('dashboard')}>
            <span className="nav-icon">📊</span><span>總覽</span>
          </button>
          <button className={`nav-item ${view==='split'?'active':''}`} onClick={() => setView('split')}>
            <span className="nav-icon">⚖</span><span>分帳</span>
          </button>
        </div>
      )}

      {view === 'books' && (
        <div style={{ textAlign:'center', padding:'16px 0 24px' }}>
          <button onClick={handleLogout} style={{ background:'none', border:'none', color:'#aaa', fontSize:13, cursor:'pointer' }}>登出</button>
        </div>
      )}
    </div>
  );
}
