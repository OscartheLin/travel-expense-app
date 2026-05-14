import React, { useState, useMemo } from 'react';
import Avatar from './Avatar';
import { IMPORT_SETS } from '../data/importData';

const CAT_ICON = { 餐飲: '🍜', 購物: '🛍', 交通: '🚗', 住宿: '🏨', 娛樂: '🎡', 其他: '📌' };
const CAT_ORDER = ['餐飲', '購物', '交通', '住宿', '娛樂', '其他'];
const CURRENCY_SYMBOL = { JPY:'¥', KRW:'₩', THB:'฿', HKD:'HK$', SGD:'S$', USD:'$', EUR:'€', GBP:'£', AUD:'A$', MYR:'RM', VND:'₫', CNY:'CN¥', TWD:'NT$', IDR:'Rp' };

export default function BookDetail({ book, entries, rates, onAdd, onRefresh, onDelete, onEdit, onImport }) {
  const [confirmId, setConfirmId] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedKey, setSelectedKey] = useState(null);

  const people = useMemo(() => {
    if (book.people) return book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    return [...new Set(entries.map(e => e.payer).filter(Boolean))];
  }, [book, entries]);

  const toTwd = (e) => (parseFloat(e.amount) || 0) * (rates[e.currency] || 1);
  const totalTwd = entries.reduce((s, e) => s + toTwd(e), 0);

  const catStats = {};
  entries.forEach(e => {
    const cat = e.category || '其他';
    if (!catStats[cat]) catStats[cat] = 0;
    catStats[cat] += toTwd(e);
  });

  const sortedEntries = [...entries].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const getPayerIndex = (payer) => {
    if (!payer) return 0;
    const idx = people.indexOf(payer.trim());
    return idx >= 0 ? idx : people.length % 6;
  };

  const methodPill = (method) => {
    if (!method) return '';
    if (method.includes('現金')) return 'pill-cash';
    if (method.includes('西瓜') || method.includes('交通')) return 'pill-ic';
    return 'pill-card';
  };

  const fmtAmount = (e) => {
    const amt = parseFloat(e.amount);
    if (!amt) return '-';
    const sym = CURRENCY_SYMBOL[e.currency] || e.currency;
    return `${sym}${amt.toLocaleString()}`;
  };

  return (
    <div>
      <div className="summary-grid">
        <div className="stat-card">
          <div className="stat-label">台幣換算總支出</div>
          <div className="stat-num">{Math.round(totalTwd).toLocaleString()}</div>
          <div className="stat-sub">TWD</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">總筆數</div>
          <div className="stat-num">{entries.length}</div>
          <div className="stat-sub">筆</div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="cat-stats">
          {CAT_ORDER.filter(cat => catStats[cat]).map(cat => (
            <div key={cat} className="cat-stat-chip">
              <span className="cat-stat-icon">{CAT_ICON[cat]}</span>
              <span className="cat-stat-name">{cat}</span>
              <span className="cat-stat-amt">NT${Math.round(catStats[cat]).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      <div className="entries-header">
        <span className="entries-title">消費明細（{entries.length} 筆）</span>
        <div style={{ display:'flex', gap:6 }}>
          {onImport && (
            <button className="refresh-btn" onClick={() => { setSelectedKey(null); setShowImportModal(true); }}
              style={{ background:'#E8F4FD', color:'#185FA5' }}>
              匯入舊資料
            </button>
          )}
          <button className="refresh-btn" onClick={onRefresh}>重新整理</button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div>還沒有記帳，點下方「新增一筆」開始記帳！</div>
        </div>
      ) : (
        sortedEntries.map((e) => (
          <div key={e.id} className="entry-row">
            <div className={`entry-icon cat-${e.category || '其他'}`}>
              {CAT_ICON[e.category] || '📌'}
            </div>
            <div className="entry-main">
              <div className="entry-name">{e.item || '（未命名）'}</div>
              <div className="entry-meta">
                {e.date && <span>{e.date}</span>}
                {e.currency && e.currency !== 'TWD' && (
                  <span className="pill pill-ic">{e.currency}</span>
                )}
                {(e.method || e.card) && (
                  <span className={`pill ${methodPill(e.method)}`}>
                    {e.card || e.method}
                  </span>
                )}
              </div>
              {e.note && <div className="entry-note">{e.note}</div>}
            </div>
            <div className="entry-right">
              <div className="entry-amount">{fmtAmount(e)}</div>
              <div className="entry-payer" style={{ display:'flex', justifyContent:'flex-end', marginTop:4 }}>
                {e.payer && <Avatar name={e.payer} index={getPayerIndex(e.payer)} size={20} />}
              </div>
            </div>
            <div className="entry-delete">
              {confirmId === e.id ? (
                <div className="delete-confirm">
                  <button className="del-yes" onClick={() => { onDelete(e.id); setConfirmId(null); }}>確認</button>
                  <button className="del-no" onClick={() => setConfirmId(null)}>取消</button>
                </div>
              ) : (
                <>
                  <button className="edit-btn" onClick={() => onEdit(e)}>✎</button>
                  <button className="del-btn" onClick={() => setConfirmId(e.id)}>✕</button>
                </>
              )}
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={onAdd}>＋ 新增一筆</button>

      {showImportModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowImportModal(false)}>
          <div className="modal">
            <h2>📥 匯入舊資料</h2>
            <p style={{ fontSize:13, color:'#666', marginBottom:12 }}>選擇要匯入的旅程記帳，資料將附加到目前帳本</p>
            {IMPORT_SETS.map(s => (
              <div key={s.key}
                onClick={() => setSelectedKey(s.key)}
                style={{
                  padding: '10px 14px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${selectedKey === s.key ? '#185FA5' : '#e0e0e0'}`,
                  background: selectedKey === s.key ? '#EAF4FF' : '#fafafa',
                }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                  {s.startDate} – {s.endDate} ・ {s.entries.length} 筆
                </div>
              </div>
            ))}
            <button className="btn-primary" style={{ marginTop: 8 }}
              disabled={!selectedKey}
              onClick={() => {
                const set = IMPORT_SETS.find(s => s.key === selectedKey);
                if (!set) return;
                if (!window.confirm(`確定匯入「${set.name}」共 ${set.entries.length} 筆記錄？\n（附加在現有記帳後面，不覆蓋）`)) return;
                setShowImportModal(false);
                onImport(set.entries);
              }}>
              確認匯入
            </button>
            <button className="btn-cancel" onClick={() => setShowImportModal(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
