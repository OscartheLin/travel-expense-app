import React, { useState, useRef } from 'react';
import Avatar, { getPersonColor } from './Avatar';

const CATEGORIES = ['餐飲', '購物', '交通', '住宿', '娛樂', '其他'];
const CARDS = ['台新', '富邦', '元大', '中信', '星展', '其他'];
const METHODS = ['信用卡', '現金', '西瓜卡'];
const CURRENCIES = [
  { code: 'JPY', symbol: '¥',   name: '日圓' },
  { code: 'TWD', symbol: 'NT$', name: '台幣' },
  { code: 'KRW', symbol: '₩',   name: '韓圓' },
  { code: 'THB', symbol: '฿',   name: '泰銖' },
  { code: 'HKD', symbol: 'HK$', name: '港幣' },
  { code: 'SGD', symbol: 'S$',  name: '新幣' },
  { code: 'USD', symbol: '$',   name: '美元' },
  { code: 'EUR', symbol: '€',   name: '歐元' },
  { code: 'GBP', symbol: '£',   name: '英鎊' },
  { code: 'AUD', symbol: 'A$',  name: '澳幣' },
  { code: 'MYR', symbol: 'RM',  name: '馬幣' },
  { code: 'VND', symbol: '₫',   name: '越盾' },
  { code: 'CNY', symbol: 'CN¥', name: '人民幣' },
  { code: 'IDR', symbol: 'Rp',  name: '印尼盾' },
];

export default function AddEntry({ book, onSave, onCancel, initialEntry, onOcr }) {
  const today = new Date().toLocaleDateString('en-CA');
  const [form, setForm] = useState(() => initialEntry ? {
    date: initialEntry.date || today,
    item: initialEntry.item || '',
    currency: initialEntry.currency || 'JPY',
    amount: initialEntry.amount || '',
    method: initialEntry.method || '信用卡',
    card: initialEntry.card || '',
    payer: initialEntry.payer || '',
    category: initialEntry.category || '餐飲',
    note: initialEntry.note || '',
    splitType: initialEntry.splitType || '團體'
  } : {
    date: today, item: '', currency: 'JPY', amount: '',
    method: '信用卡', card: '', payer: '', category: '餐飲', note: '', splitType: '團體'
  });
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrDone, setOcrDone] = useState(false);
  const fileRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleScan = async (e) => {
    const file = e.target.files[0];
    if (!file || !onOcr) return;
    setOcrLoading(true);
    try {
      const result = await onOcr(file);
      if (result && (result.item || result.amount)) {
        if (result.item) set('item', result.item);
        if (result.amount) set('amount', result.amount);
        if (result.currency) set('currency', result.currency);
        if (result.category) set('category', result.category);
        if (result.note) set('note', result.note);
        if (result.date) set('date', result.date);
        setOcrDone(true);
      } else {
        alert('辨識不到文字，請手動輸入，或嘗試更清晰的圖片');
      }
    } catch (err) {
      alert('掃描失敗：' + (err.message || '請確認已登入並重試'));
    }
    setOcrLoading(false);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (!form.item.trim() || !form.amount || saving) return;
    setSaving(true);
    await onSave({
      date: form.date, item: form.item, amount: form.amount, currency: form.currency,
      method: form.method, card: form.method === '信用卡' ? form.card : '',
      payer: form.payer, category: form.category, note: form.note, splitType: form.splitType
    });
    setSaving(false);
  };

  const people = book.people
    ? book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
    : ['婷', '珽'];

  const selectedCurrency = CURRENCIES.find(c => c.code === form.currency) || CURRENCIES[0];

  return (
    <div className="add-form">
      {/* OCR Scan Button */}
      <div className="form-section" style={{ paddingBottom: 0 }}>
        <input
          type="file" accept="image/*" capture="environment"
          ref={fileRef} style={{ display:'none' }}
          onChange={handleScan}
        />
        <button
          className="scan-btn"
          onClick={() => fileRef.current?.click()}
          disabled={ocrLoading}
        >
          {ocrLoading ? '⏳ 辨識中…' : '📷 掃描收據'}
        </button>
        {ocrDone && (
          <div className="ocr-hint">
            ✅ 辨識完成，請確認並修改下方內容
            <button className="ocr-hint-close" onClick={() => setOcrDone(false)}>✕</button>
          </div>
        )}
      </div>

      <div className="form-section">
        <div className="form-group">
          <label className="form-label">項目名稱</label>
          <input className="form-input" placeholder="例：便利商店" value={form.item}
            onChange={e => set('item', e.target.value)} autoFocus />
        </div>
      </div>

      <div className="form-section">
        <label className="form-label">幣別</label>
        <div className="currency-scroll" style={{ marginTop: 6 }}>
          {CURRENCIES.map(c => (
            <button key={c.code} className={`currency-chip ${form.currency === c.code ? 'active' : ''}`}
              onClick={() => set('currency', c.code)}>
              <span className="currency-chip-code">{c.code}</span>
              <span className="currency-chip-name">{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-section" style={{ marginTop: 12 }}>
        <label className="form-label">金額（{selectedCurrency.symbol}）</label>
        <input className="form-input" type="number" placeholder="0" value={form.amount}
          onChange={e => set('amount', e.target.value)} style={{ marginTop: 6 }} />
      </div>

      <div className="form-section">
        <label className="form-label">支出類型</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className={`payer-btn ${form.splitType === '團體' ? 'active-d' : ''}`}
            onClick={() => set('splitType', '團體')}>👥 團體分帳</button>
          <button className={`payer-btn ${form.splitType === '個人' ? 'active-t' : ''}`}
            onClick={() => set('splitType', '個人')}>👤 個人支出</button>
        </div>
      </div>

      <div className="form-section">
        <label className="form-label">消費方式</label>
        <div className="seg-group" style={{ marginTop: 6 }}>
          {METHODS.map(m => (
            <button key={m} className={`seg-btn ${form.method === m ? 'active' : ''}`}
              onClick={() => set('method', m)}>{m}</button>
          ))}
        </div>
      </div>

      {form.method === '信用卡' && (
        <div className="form-section" style={{ marginTop: 12 }}>
          <label className="form-label">信用卡別</label>
          <div className="seg-group" style={{ marginTop: 6 }}>
            {CARDS.map(c => (
              <button key={c} className={`seg-btn ${form.card === c ? 'active' : ''}`}
                onClick={() => set('card', c)}>{c}</button>
            ))}
          </div>
        </div>
      )}

      <div className="form-section" style={{ marginTop: 12 }}>
        <label className="form-label">由誰付</label>
        <div className="payer-avatar-row" style={{ marginTop: 6 }}>
          {people.map((person, i) => (
            <button
              key={person}
              className={`payer-avatar-btn ${form.payer === person ? 'payer-avatar-active' : ''}`}
              style={form.payer === person ? {
                borderColor: getPersonColor(i),
                background: getPersonColor(i) + '18'
              } : {}}
              onClick={() => set('payer', person)}
            >
              <Avatar name={person} index={i} size={28} />
              <span className="payer-avatar-name">{person}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-section" style={{ marginTop: 12 }}>
        <label className="form-label">分類</label>
        <div className="seg-group" style={{ marginTop: 6 }}>
          {CATEGORIES.map(c => (
            <button key={c} className={`seg-btn ${form.category === c ? 'active' : ''}`}
              onClick={() => set('category', c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="form-section" style={{ marginTop: 12 }}>
        <label className="form-label">日期</label>
        <input className="form-input" type="date" value={form.date}
          onChange={e => set('date', e.target.value)} />
      </div>

      <div className="form-section" style={{ marginTop: 12 }}>
        <label className="form-label">備注（選填）</label>
        <input className="form-input" placeholder="任何補充說明" value={form.note}
          onChange={e => set('note', e.target.value)} />
      </div>

      <div style={{ padding: '16px 14px 0' }}>
        <button className="btn-primary" onClick={handleSave}
          disabled={!form.item.trim() || !form.amount || saving}>
          {saving ? '儲存中...' : initialEntry ? '確認更新' : '確認新增'}
        </button>
        <button className="btn-cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
