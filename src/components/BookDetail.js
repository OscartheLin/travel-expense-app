import React, { useState } from 'react';

const CAT_ICON = { 餐飲: '🍜', 購物: '🛍', 交通: '🚗', 住宿: '🏨', 娛樂: '🎡', 其他: '📌' };

export default function BookDetail({ book, entries, onAdd, onRefresh, onDelete }) {
  const [confirmId, setConfirmId] = useState(null);

  const totalTwd = entries.reduce((s, e) => s + (parseFloat(e.twd) || 0), 0);
  const totalJpy = entries.reduce((s, e) => s + (parseFloat(e.jpy) || 0), 0);

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
        [...entries].reverse().map((e, i) => (
          <div key={i} className="entry-row">
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
                  <button className="del-yes" onClick={() => { onDelete(entries.length - 1 - i); setConfirmId(null); }}>確認</button>
                  <button className="del-no" onClick={() => setConfirmId(null)}>取消</button>
                </div>
              ) : (
                <button className="del-btn" onClick={() => setConfirmId(e.id)}>✕</button>
              )}
            </div>
          </div>
        ))
      )}

      <button className="fab" onClick={onAdd}>＋ 新增一筆</button>
    </div>
  );
}
