import React, { useState, useMemo } from 'react';

export default function SplitView({ book, entries }) {
  const [rate, setRate] = useState(20);
  const [copied, setCopied] = useState(false);

  const people = useMemo(() => {
    if (book.people) {
      return book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    }
    const payers = [...new Set(entries.map(e => e.payer).filter(Boolean))];
    return payers.length ? payers : ['婷', '珽'];
  }, [book, entries]);

  const stats = useMemo(() => {
    const r = rate / 100;
    const result = {};
    people.forEach(p => { result[p] = { twd: 0, jpy: 0, total: 0 }; });

    entries.forEach(e => {
      const payer = e.payer?.trim();
      if (!payer || !result[payer]) return;
      result[payer].twd += parseFloat(e.twd) || 0;
      result[payer].jpy += parseFloat(e.jpy) || 0;
    });
    Object.keys(result).forEach(p => {
      result[p].total = result[p].twd + result[p].jpy * r;
    });
    return result;
  }, [entries, people, rate]);

  const grandTotal = Object.values(stats).reduce((s, v) => s + v.total, 0);
  const perPerson = grandTotal / Math.max(people.length, 1);

  const shareUrl = window.location.href;
  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const fmt = (n) => Math.round(n).toLocaleString();

  return (
    <div className="split-view">
      <div className="split-card">
        <div className="split-card-title">各人花費</div>
        {people.map(p => (
          <div key={p} className="split-row">
            <div>
              <div className="split-label">{p}</div>
              <div className="split-sub">
                {stats[p]?.twd ? `NT$${fmt(stats[p].twd)}` : ''}
                {stats[p]?.twd && stats[p]?.jpy ? ' + ' : ''}
                {stats[p]?.jpy ? `¥${fmt(stats[p].jpy)}` : ''}
              </div>
            </div>
            <div className="split-amt">NT${fmt(stats[p]?.total || 0)}</div>
          </div>
        ))}
      </div>

      <div className="split-card">
        <div className="split-card-title">分帳結果</div>
        <div className="split-row">
          <div><div className="split-label">合計總花費</div></div>
          <div className="split-amt">NT${fmt(grandTotal)}</div>
        </div>
        <div className="split-row">
          <div><div className="split-label">每人應付</div><div className="split-sub">平均分攤</div></div>
          <div className="split-amt">NT${fmt(perPerson)}</div>
        </div>
        {people.map(p => {
          const diff = (stats[p]?.total || 0) - perPerson;
          if (Math.abs(diff) < 1) return null;
          return (
            <div key={p} className="split-row">
              <div>
                <div className="split-label">
                  {diff > 0 ? `其他人補給 ${p}` : `${p} 補給其他人`}
                </div>
                <div className="split-sub">{p} {diff > 0 ? '多付了' : '少付了'}</div>
              </div>
              <div className={`split-amt ${diff > 0 ? 'pos' : 'neg'}`}>
                NT${fmt(Math.abs(diff))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="split-card">
        <div className="split-card-title">日幣匯率調整</div>
        <div className="rate-control">
          <label>1 JPY =</label>
          <input type="range" min="15" max="30" step="1" value={rate}
            onChange={e => setRate(Number(e.target.value))} />
          <span className="rate-val">0.{rate}</span>
          <span style={{ fontSize: 12, color: '#888' }}>TWD</span>
        </div>
      </div>

      <div className="invite-box">
        <div className="invite-label">邀請旅伴共同記帳</div>
        <div className="invite-url">{shareUrl}</div>
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '✓ 已複製！' : '複製邀請連結'}
        </button>
      </div>
    </div>
  );
}
