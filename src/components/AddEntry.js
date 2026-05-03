import React, { useState } from 'react';

const CATEGORIES = ['餐飲', '購物', '交通', '住宿', '娛樂', '其他'];
const CARDS = ['台新', '富邦', '元大', '中信', '星展', '其他'];
const METHODS = ['信用卡', '現金', '西瓜卡'];

export default function AddEntry({ book, onSave, onCancel }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    date: today, item: '', currency: 'JPY', amount: '',
    method: '信用卡', card: '', payer: '', category: '餐飲', note: '', splitType: '團體'
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.item.trim() || !form.amount || saving) return;
    setSaving(true);
    await onSave({
      date: form.date,
      item: form.item,
      twd: form.currency === 'TWD' ? form.amount : '',
      jpy: form.currency === 'JPY' ? form.amount : '',
      method: form.method,
      card: form.method === '信用卡' ? form.card : '',
      payer: form.payer,
      category: form.category,
      note: form.note,
      splitType: form.splitType
    });
    setSaving(false);
  };

  const people = book.people
    ? book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean)
    : ['婷', '珽'];

  return (
    <div className="add-form">
      <div className="form-section">
        <div className="form-group">
          <label className="form-label">項目名稱</label>
          <input className="form-input" placeholder="例：便利商店" value={form.item}
            onChange={e => set('item', e.target.value)} autoFocus />
        </div>
      </div>

      <div className="form-section">
        <div className="form-group">
          <label className="form-label">幣別與金額</label>
          <div className="amount-row">
            <div className="currency-toggle">
              <button className={`currency-btn ${form.currency === 'JPY' ? 'active' : ''}`}
                onClick={() => set('currency', 'JPY')}>JPY</button>
              <button className={`currency-btn ${form.currency === 'TWD' ? 'active' : ''}`}
                onClick={() => set('currency', 'TWD')}>TWD</button>
            </div>
            <input className="form-input" type="number" placeholder="0" value={form.amount}
              onChange={e => set('amount', e.target.value)} style={{ flex: 1 }} />
          </div>
        </div>
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
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          {people.map((person, i) => (
            <button key={person}
              className={`payer-btn ${form.payer === person ? (i === 0 ? 'active-t' : 'active-d') : ''}`}
              onClick={() => set('payer', person)}>{person}</button>
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
          {saving ? '儲存中...' : '確認新增'}
        </button>
        <button className="btn-cancel" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
