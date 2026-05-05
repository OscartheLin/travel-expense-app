import React, { useState } from 'react';

const CAT_ICON = { 餐飲: '🍜', 購物: '🛍', 交通: '🚗', 住宿: '🏨', 娛樂: '🎡', 其他: '📌' };
const CAT_ORDER = ['餐飲', '購物', '交通', '住宿', '娛樂', '其他'];

export default function BookDetail({ book, entries, onAdd, onRefresh, onDelete, onEdit }) {
  const [confirmId, setConfirmId] = useState(null);

  const totalTwd = entries.reduce((s, e) => s + (parseFloat(e.twd) || 0), 0);
  const totalJpy = entries.reduce((s, e) => s + (parseFloat(e.jpy) || 0), 0);

  const catStats = {};
  entries.forEach(e => {
    const cat = e.category || '其他';
    if (!catStats[cat]) catStats[cat] = { twd: 0, jpy: 0 };
    catStats[cat].twd += parseFloat(e.twd) || 0;
    catStats[cat].jpy += parseFloat(e.jpy) || 0;
  });

  const sortedEntries = [...entries].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const payerColor = (payer) => {
    if (!payer) return '';
    const p = payer.trim();
    if (p === '婷' || p === '美眉') return 'pill-ting';
    if (p === '珽') return 'pill-ding';
    return 'pill-cash';
  };

  const methodPill = (method) => {
    if (!method) return '';
    if (method.includes('現金')) return 'pill-cash';
    if (method.includes('西瓜') || method.includes('交通')) return 'pill-ic';
    return 'pill-card';
  };

  return (
    <div>
      <div className="summary-grid">
        <div className="stat-card">
          <div className="stat-label">台幣總支出</div>
          <div className="stat-num">{totalTwd.toLocaleString()}</div>
          <div className="stat-sub">TWD</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">日幣總支出</div>
          <div className="stat-num">{totalJpy.toLocaleString()}</div>
          <div className="stat-sub">JPY</div>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="cat-stats">
          {CAT_ORDER.filter(cat => catStats[cat]).map(cat => (
            <div key={cat} className="cat-stat-chip">
              <span className="cat-stat-icon">{CAT_ICON[cat]}</span>
              <span className="cat-stat-name">{cat}</span>
              <span className="cat-stat-amt">
                {catStats[cat].twd ? `NT$${Math.round(catStats[cat].twd).toLocaleString()}` : ''}
                {catStats[cat].twd && catStats[cat].jpy ? <br /> : ''}
                {catStats[cat].jpy ? `¥${Math.round(catStats[cat].jpy).toLocaleString()}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="entries-header">
        <span className="entries-title">消費明細（{entries.length} 筆）</span>
        <button className="refresh-btn" onClick={onRefresh}>重新整理</button>
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
                {(e.method || e.card) && (
                  <span className={`pill ${methodPill(e.method)}`}>
                    {e.card || e.method}
                  </span>
                )}
              </div>
              {e.note && <div className="entry-note">{e.note}</div>}
            </div>
            <div className="entry-right">
              <div className="entry-amount">
                {e.jpy ? `¥${parseFloat(e.jpy).toLocaleString()}` : e.twd ? `NT$${parseFloat(e.twd).toLocaleString()}` : '-'}
              </div>
              <div className="entry-payer">
                {e.payer && <span className={`pill ${payerColor(e.payer)}`}>{e.payer}</span>}
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
    </div>
  );
}
