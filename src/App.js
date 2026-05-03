import React, { useState, useEffect, useCallback } from 'react';
import BookList from './components/BookList';
import BookDetail from './components/BookDetail';
import AddEntry from './components/AddEntry';
import SplitView from './components/SplitView';
import './App.css';

const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID';
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file';
const FOLDER_PATH = ['企投', '出遊記帳'];

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [view, setView] = useState('books');
  const [activeBook, setActiveBook] = useState(null);
  const [books, setBooks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [gapiReady, setGapiReady] = useState(false);

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = () => setGapiReady(true);
    document.body.appendChild(script);
    const stored = localStorage.getItem('tripbooks');
    if (stored) setBooks(JSON.parse(stored));
    const storedUser = localStorage.getItem('tripuser');
    const storedToken = localStorage.getItem('triptoken');
    if (storedUser && storedToken) {
      setUser(JSON.parse(storedUser));
      setToken(storedToken);
    }
  }, []);

  const handleLogin = () => {
    if (!window.google) return;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error) return;
        setToken(resp.access_token);
        localStorage.setItem('triptoken', resp.access_token);
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${resp.access_token}` }
        });
        const info = await res.json();
        const u = { name: info.name, email: info.email, picture: info.picture };
        setUser(u);
        localStorage.setItem('tripuser', JSON.stringify(u));
      }
    });
    client.requestAccessToken();
  };

  const handleLogout = () => {
    setUser(null); setToken(null);
    localStorage.removeItem('tripuser');
    localStorage.removeItem('triptoken');
  };

  const saveBooks = (b) => {
    setBooks(b);
    localStorage.setItem('tripbooks', JSON.stringify(b));
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
          body: JSON.stringify({
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
          })
        });
        const folder = await createRes.json();
        parentId = folder.id;
      }
    }
    return parentId;
  };

  const createBook = async (name, startDate, endDate, people) => {
    setLoading(true);
    try {
      const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: `出遊記帳 - ${name}` },
          sheets: [{
            properties: { title: '記帳' },
            data: [{ rowData: [{ values: [
              { userEnteredValue: { stringValue: '日期' } },
              { userEnteredValue: { stringValue: '項目' } },
              { userEnteredValue: { stringValue: '台幣' } },
              { userEnteredValue: { stringValue: '日幣' } },
              { userEnteredValue: { stringValue: '消費方式' } },
              { userEnteredValue: { stringValue: '信用卡' } },
              { userEnteredValue: { stringValue: '由誰付' } },
              { userEnteredValue: { stringValue: '分類' } },
              { userEnteredValue: { stringValue: '備注' } },
            ]}]}]
          }]
        })
      });
      const sheet = await res.json();
      const sheetId = sheet.spreadsheetId;
      try {
        const folderId = await getOrCreateFolder(token);
        await fetch(`https://www.googleapis.com/drive/v3/files/${sheetId}?addParents=${folderId}&removeParents=root`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (e) { console.warn('移動資料夾失敗'); }
      const book = { id: sheetId, name, startDate, endDate, people, createdAt: Date.now() };
      saveBooks([book, ...books]);
      setActiveBook(book);
      setEntries([]);
      setView('detail');
    } catch (e) { alert('建立失敗，請檢查授權'); }
    setLoading(false);
  };

  const joinBookByUrl = async (url) => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) { alert('連結格式不正確，請貼上完整的 Google Sheets 網址'); return; }
    const sheetId = match[1];
    if (books.find(b => b.id === sheetId)) { alert('這個帳本已經在清單裡了'); return; }
    setLoading(true);
    try {
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const title = data.properties?.title?.replace('出遊記帳 - ', '') || '共用帳本';
      const book = { id: sheetId, name: title, startDate: '', endDate: '', people: '', createdAt: Date.now(), joined: true };
      saveBooks([book, ...books]);
      setActiveBook(book);
      await loadEntries(book);
      setView('detail');
    } catch (e) { alert('加入失敗，請確認你有這個試算表的存取權限'); }
    setLoading(false);
  };

  const loadEntries = useCallback(async (book) => {
    if (!token || !book) return;
    setLoading(true);
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${book.id}/values/記帳!A2:I`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      const rows = (data.values || []).map((r, i) => ({
        id: i, date: r[0]||'', item: r[1]||'', twd: r[2]||'', jpy: r[3]||'',
        method: r[4]||'', card: r[5]||'', payer: r[6]||'', category: r[7]||'', note: r[8]||''
      }));
      setEntries(rows);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [token]);

  const addEntry = async (entry) => {
    if (!token || !activeBook) return;
    setLoading(true);
    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}/values/記帳!A:I:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[
            entry.date, entry.item, entry.twd||'', entry.jpy||'',
            entry.method, entry.card, entry.payer, entry.category, entry.note
          ]] })
        }
      );
      await loadEntries(activeBook);
      setView('detail');
    } catch (e) { alert('新增失敗'); }
    setLoading(false);
  };

  const deleteEntry = async (rowIndex) => {
    if (!token || !activeBook) return;
    setLoading(true);
    try {
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}?fields=sheets.properties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const sheetData = await sheetRes.json();
      const sheetId = sheetData.sheets[0].properties.sheetId;
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${activeBook.id}:batchUpdate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2
              }
            }
          }]
        })
      });
      await loadEntries(activeBook);
    } catch (e) { alert('刪除失敗'); }
    setLoading(false);
  };

  const openBook = (book) => {
    setActiveBook(book);
    loadEntries(book);
    setView('detail');
  };

  useEffect(() => {
    if (!activeBook || view !== 'detail') return;
    const timer = setInterval(() => {
      loadEntries(activeBook);
    }, 30000);
    return () => clearInterval(timer);
  }, [activeBook, view, loadEntries]);

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
          <button className="back-btn" onClick={() => setView(view === 'add' || view === 'split' ? 'detail' : 'books')}>‹</button>
        )}
        <span className="topbar-title">
          {view === 'books' ? '我的帳本' : view === 'add' ? '新增一筆' : view === 'split' ? '分帳結果' : activeBook?.name || '帳本'}
        </span>
        <div className="topbar-right">
          {view === 'detail' && (
            <button className="icon-btn" onClick={() => setView('split')} title="分帳">⚖</button>
          )}
          <img src={user.picture} alt={user.name} className="avatar" onClick={handleLogout} title="登出" />
        </div>
      </div>

      <div className="content">
        {loading && <div className="loading-bar" />}

        {view === 'books' && (
          <BookList books={books} onOpen={openBook} onCreate={createBook} onJoin={joinBookByUrl} loading={loading} />
        )}
        {view === 'detail' && activeBook && (
          <BookDetail book={activeBook} entries={entries} onAdd={() => setView('add')} onRefresh={() => loadEntries(activeBook)} onDelete={deleteEntry} />
        )}
        {view === 'add' && activeBook && (
          <AddEntry book={activeBook} onSave={addEntry} onCancel={() => setView('detail')} />
        )}
        {view === 'split' && activeBook && (
          <SplitView book={activeBook} entries={entries} />
        )}
      </div>

      {(view === 'detail' || view === 'split') && (
        <div className="bottom-nav">
          <button className={`nav-item ${view === 'detail' ? 'active' : ''}`} onClick={() => setView('detail')}>
            <span className="nav-icon">📋</span><span>記帳</span>
          </button>
          <button className={`nav-item ${view === 'split' ? 'active' : ''}`} onClick={() => setView('split')}>
            <span className="nav-icon">⚖</span><span>分帳</span>
          </button>
        </div>
      )}
    </div>
  );
}
