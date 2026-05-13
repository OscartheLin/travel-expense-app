import React, { useState, useMemo } from 'react';
import Avatar from './Avatar';

const CURRENCY_NAME = { JPY:'日圓', KRW:'韓圓', THB:'泰銖', HKD:'港幣', SGD:'新幣', USD:'美元', EUR:'歐元', GBP:'英鎊', AUD:'澳幣', MYR:'馬幣', VND:'越盾', CNY:'人民幣', TWD:'台幣' };

export default function SplitView({ book, entries, rates, updateRates, onSetPublic, onRename }) {
  const [copied, setCopied] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [rateLoading, setRateLoading] = useState(false);
  const [rateUpdatedAt, setRateUpdatedAt] = useState(() => localStorage.getItem('triprates_updated') || '');

  const people = useMemo(() => {
    if (book.people) {
      return book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    }
    const payers = [...new Set(entries.map(e => e.payer).filter(Boolean))];
    return payers.length ? payers : ['婷', '珽'];
  }, [book, entries]);

  const groupEntries = entries.filter(e => e.splitType !== '個人');
  const personalEntries = entries.filter(e => e.splitType === '個人');

  const toTwd = (e) => (parseFloat(e.amount) || 0) * (rates[e.currency] || 1);

  const stats = useMemo(() => {
    const result = {};
    people.forEach(p => { result[p] = { groupTotal: 0, personalTotal: 0 }; });
    groupEntries.forEach(e => {
      const payer = e.payer?.trim();
      if (!payer || !result[payer]) return;
      result[payer].groupTotal += toTwd(e);
    });
    personalEntries.forEach(e => {
      const payer = e.payer?.trim();
      if (!payer || !result[payer]) return;
      result[payer].personalTotal += toTwd(e);
    });
    return result;
  }, [groupEntries, personalEntries, people, rates]);

  const grandTotal = Object.values(stats).reduce((s, v) => s + v.groupTotal, 0);
  const perPerson = grandTotal / Math.max(people.length, 1);
  const fmt = (n) => Math.round(n).toLocaleString();

  const settlements = (() => {
    const payers = people.map(p => ({ person: p, balance: (stats[p]?.groupTotal || 0) - perPerson }));
    const debtors = payers.filter(b => b.balance < -0.5).map(b => ({ ...b }));
    const creditors = payers.filter(b => b.balance > 0.5).map(b => ({ ...b }));
    const result = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const amount = Math.min(Math.abs(debtors[i].balance), creditors[j].balance);
      result.push({ from: debtors[i].person, to: creditors[j].person, amount });
      debtors[i].balance += amount;
      creditors[j].balance -= amount;
      if (Math.abs(debtors[i].balance) < 0.5) i++;
      if (Math.abs(creditors[j].balance) < 0.5) j++;
    }
    return result;
  })();

  const usedCurrencies = [...new Set(entries.map(e => e.currency || 'TWD'))].filter(c => c !== 'TWD');

  const fetchAutoRates = async () => {
    setRateLoading(true);
    try {
      const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/twd.json');
      if (!res.ok) throw new Error('網路錯誤');
      const data = await res.json();
      const twd = data.twd;
      const newRates = { ...rates };
      usedCurrencies.forEach(code => {
        const key = code.toLowerCase();
        if (twd[key]) newRates[code] = Math.round((1 / twd[key]) * 10000) / 10000;
      });
      updateRates(newRates);
      const dateStr = data.date || new Date().toLocaleDateString('en-CA');
      setRateUpdatedAt(dateStr);
      localStorage.setItem('triprates_updated', dateStr);
    } catch {
      alert('匯率更新失敗，請確認網路連線後再試');
    }
    setRateLoading(false);
  };

  const shareUrl = `https://docs.google.com/spreadsheets/d/${book.id}`;
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="split-view">
      <div className="split-card">
        <div className="split-card-title">團體分帳（{groupEntries.length} 筆）</div>
        {people.map((p, i) => (
          <div key={p} className="split-row">
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <Avatar name={p} index={i} size={28} />
              <div>
                <div className="split-label">{p} 代付</div>
                <div className="split-sub">換算 NT${fmt(stats[p]?.groupTotal || 0)}</div>
              </div>
            </div>
            <div className="split-amt">NT${fmt(stats[p]?.groupTotal || 0)}</div>
          </div>
        ))}
      </div>

      {personalEntries.length > 0 && (
        <div className="split-card">
          <div className="split-card-title">個人支出（{personalEntries.length} 筆，不列入分帳）</div>
          {people.map(p => {
            const total = stats[p]?.personalTotal || 0;
            if (!total) return null;
            return (
              <div key={p} className="split-row">
                <div><div className="split-label">{p} 個人</div></div>
                <div className="split-amt" style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  NT${fmt(total)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="split-card">
        <div className="split-card-title">個人總支出（團體代付 + 個人）</div>
        {people.map((p, i) => {
          const total = (stats[p]?.groupTotal || 0) + (stats[p]?.personalTotal || 0);
          return (
            <div key={p} className="split-row">
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Avatar name={p} index={i} size={28} />
                <div>
                  <div className="split-label">{p}</div>
                  <div className="split-sub">
                    {stats[p]?.groupTotal ? `團體 NT$${fmt(stats[p].groupTotal)}` : ''}
                    {stats[p]?.groupTotal && stats[p]?.personalTotal ? '　' : ''}
                    {stats[p]?.personalTotal ? `個人 NT$${fmt(stats[p].personalTotal)}` : ''}
                  </div>
                </div>
              </div>
              <div className="split-amt">NT${fmt(total)}</div>
            </div>
          );
        })}
      </div>

      <div className="split-card">
        <div className="split-card-title">分帳結果</div>
        <div className="split-row">
          <div><div className="split-label">團體總花費</div></div>
          <div className="split-amt">NT${fmt(grandTotal)}</div>
        </div>
        <div className="split-row">
          <div><div className="split-label">每人應付</div><div className="split-sub">平均分攤</div></div>
          <div className="split-amt">NT${fmt(perPerson)}</div>
        </div>
        {settlements.length === 0 ? (
          <div className="split-row">
            <div className="split-label" style={{ color: '#0F6E56' }}>已平帳，無需轉帳</div>
          </div>
        ) : settlements.map((s, idx) => (
          <div key={idx} className="split-row">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <Avatar name={s.from} index={people.indexOf(s.from)} size={24} />
              <span style={{ fontSize:11, color:'#aaa' }}>→</span>
              <Avatar name={s.to} index={people.indexOf(s.to)} size={24} />
              <div className="split-label">
                <span style={{ color:'#A32D2D' }}>{s.from}</span> 付給 <span style={{ color:'#0F6E56' }}>{s.to}</span>
              </div>
            </div>
            <div className="split-amt">NT${fmt(s.amount)}</div>
          </div>
        ))}
      </div>

      <div className="split-card">
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div>
            <div className="split-card-title" style={{ marginBottom:0 }}>匯率設定（對台幣）</div>
            {rateUpdatedAt && (
              <div style={{ fontSize:11, color:'#aaa', marginTop:2 }}>資料日期：{rateUpdatedAt}</div>
            )}
          </div>
          {usedCurrencies.length > 0 && (
            <button onClick={fetchAutoRates} disabled={rateLoading}
              style={{ fontSize:12, color: rateLoading ? '#aaa' : '#185FA5', background:'none',
                border:`1px solid ${rateLoading ? '#ddd' : '#185FA5'}`, borderRadius:8,
                padding:'4px 12px', cursor: rateLoading ? 'not-allowed' : 'pointer', flexShrink:0 }}>
              {rateLoading ? '更新中...' : '🔄 自動更新'}
            </button>
          )}
        </div>
        {usedCurrencies.length === 0 ? (
          <div className="split-sub" style={{ padding: '8px 0' }}>目前所有記錄皆為台幣</div>
        ) : usedCurrencies.map(c => (
          <div key={c} className="rate-row">
            <span className="rate-label">1 {c} <span style={{ color: '#aaa', fontSize: 11 }}>（{CURRENCY_NAME[c] || c}）</span></span>
            <input
              className="rate-input"
              type="number"
              step="0.001"
              min="0"
              value={rates[c] ?? ''}
              onChange={e => updateRates({ ...rates, [c]: parseFloat(e.target.value) || 0 })}
            />
            <span className="rate-unit">TWD</span>
          </div>
        ))}
      </div>

      {people.length > 0 && onRename && (
        <div className="split-card">
          <div className="split-card-title">人員管理・批次改名</div>
          {people.map((p, i) => (
            <div key={p} className="split-row">
              {renameTarget === p ? (
                <div style={{ display:'flex', gap:6, flex:1, alignItems:'center' }}>
                  <Avatar name={renameInput || p} index={i} size={24} />
                  <input
                    className="rate-input"
                    style={{ flex:1, width:'auto' }}
                    value={renameInput}
                    onChange={e => setRenameInput(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') { onRename(p, renameInput); setRenameTarget(null); }
                      if (e.key === 'Escape') setRenameTarget(null);
                    }}
                  />
                  <button className="del-yes" onClick={() => { onRename(p, renameInput); setRenameTarget(null); }}>確認</button>
                  <button className="del-no" onClick={() => setRenameTarget(null)}>取消</button>
                </div>
              ) : (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <Avatar name={p} index={i} size={28} />
                    <span className="split-label">{p}</span>
                  </div>
                  <button className="edit-btn" style={{ fontSize:12 }}
                    onClick={() => { setRenameTarget(p); setRenameInput(p); }}>
                    ✎ 改名
                  </button>
                </>
              )}
            </div>
          ))}
          <div style={{ fontSize:11, color:'#aaa', marginTop:8 }}>
            改名後會同步更新所有歷史記錄的付款人
          </div>
        </div>
      )}

      <div className="invite-box">
        <div className="invite-label">邀請旅伴共同記帳</div>
        <div className="invite-url">{shareUrl}</div>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '✓ 已複製！' : '複製邀請連結'}
        </button>
        <button className="copy-btn" style={{ marginTop: 8, color: '#185FA5', borderColor: '#85B7EB' }} onClick={onSetPublic}>
          開啟共用編輯（任何人有連結可改）
        </button>
      </div>
    </div>
  );
}
