import React, { useMemo } from 'react';
import Avatar from './Avatar';

const CAT_ICON = { 餐飲:'🍜', 購物:'🛍', 交通:'🚗', 住宿:'🏨', 娛樂:'🎡', 其他:'📌' };
const CAT_ORDER = ['餐飲','購物','交通','住宿','娛樂','其他'];
const METHOD_ICON = { 信用卡:'💳', 現金:'💴', 西瓜卡:'🚇' };

export default function DashboardView({ book, entries, rates }) {
  const today = new Date().toLocaleDateString('en-CA');
  const toTwd = e => (parseFloat(e.amount) || 0) * (rates[e.currency] || 1);
  const fmt = n => Math.round(n).toLocaleString();

  const people = useMemo(() => {
    if (book.people) return book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean);
    return [...new Set(entries.map(e => e.payer).filter(Boolean))];
  }, [book, entries]);

  const todayEntries = entries.filter(e => e.date === today);
  const todayTotal = todayEntries.reduce((s, e) => s + toTwd(e), 0);
  const tripTotal = entries.reduce((s, e) => s + toTwd(e), 0);
  const budget = parseFloat(book.budget) || 0;
  const budgetPct = budget > 0 ? Math.min(100, (tripTotal / budget) * 100) : 0;

  // Category breakdown
  const catStats = {};
  entries.forEach(e => { const c = e.category || '其他'; catStats[c] = (catStats[c] || 0) + toTwd(e); });
  const maxCat = Math.max(...Object.values(catStats), 1);

  // Per person
  const perPerson = Object.fromEntries(people.map(p => [p, 0]));
  entries.forEach(e => { if (e.payer && perPerson[e.payer] !== undefined) perPerson[e.payer] += toTwd(e); });

  // Daily trend
  const dailyMap = useMemo(() => {
    const m = {};
    entries.forEach(e => {
      if (e.date) {
        const val = (parseFloat(e.amount) || 0) * (rates[e.currency] || 1);
        m[e.date] = (m[e.date] || 0) + val;
      }
    });
    return m;
  }, [entries, rates]);
  const sortedDays = Object.keys(dailyMap).sort();
  const maxDay = Math.max(...Object.values(dailyMap), 1);

  // Payment method breakdown
  const methodMap = {};
  entries.forEach(e => { const m = e.method || '其他'; methodMap[m] = (methodMap[m] || 0) + toTwd(e); });
  const maxMethod = Math.max(...Object.values(methodMap), 1);

  // TOP 10
  const top10 = [...entries].sort((a, b) => toTwd(b) - toTwd(a)).slice(0, 10);

  if (entries.length === 0) {
    return (
      <div className="dashboard-view">
        <div className="dash-row">
          <div className="dash-card dash-card-blue">
            <div className="dash-card-label">今日花費</div>
            <div className="dash-card-num">NT$0</div>
            <div className="dash-card-sub">0 筆</div>
          </div>
          <div className="dash-card dash-card-green">
            <div className="dash-card-label">旅程累計</div>
            <div className="dash-card-num">NT$0</div>
            <div className="dash-card-sub">0 筆</div>
          </div>
        </div>
        <div className="empty-state"><div className="empty-icon">📊</div><div>還沒有記帳，去記第一筆吧！</div></div>
      </div>
    );
  }

  return (
    <div className="dashboard-view">
      {/* Today + Trip total */}
      <div className="dash-row">
        <div className="dash-card dash-card-blue">
          <div className="dash-card-label">今日花費</div>
          <div className="dash-card-num">NT${fmt(todayTotal)}</div>
          <div className="dash-card-sub">{todayEntries.length} 筆</div>
        </div>
        <div className="dash-card dash-card-green">
          <div className="dash-card-label">旅程累計</div>
          <div className="dash-card-num">NT${fmt(tripTotal)}</div>
          <div className="dash-card-sub">{entries.length} 筆</div>
        </div>
      </div>

      {/* Budget progress */}
      {budget > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">現金預算進度</div>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:14, fontWeight:500 }}>NT${fmt(tripTotal)}</span>
            <span style={{ fontSize:12, color: budgetPct > 90 ? '#A32D2D' : '#888' }}>
              / NT${fmt(budget)} ({Math.round(budgetPct)}%)
            </span>
          </div>
          <div className="budget-bar-bg">
            <div className="budget-bar-fill" style={{
              width:`${budgetPct}%`,
              background: budgetPct > 90 ? '#A32D2D' : budgetPct > 70 ? '#C55A1B' : '#0F6E56'
            }} />
          </div>
          <div style={{ fontSize:11, color:'#aaa', marginTop:5 }}>剩餘預算 NT${fmt(Math.max(0, budget - tripTotal))}</div>
        </div>
      )}

      {/* Daily trend */}
      {sortedDays.length > 1 && (
        <div className="dash-section">
          <div className="dash-section-title">每日花費趨勢</div>
          <div className="daily-chart">
            {sortedDays.map(date => (
              <div key={date} className="daily-bar-col">
                <div className="daily-bar-amt">
                  {dailyMap[date] >= 10000 ? `${Math.round(dailyMap[date]/1000)}k` : fmt(dailyMap[date])}
                </div>
                <div className="daily-bar-wrap">
                  <div
                    className="daily-bar"
                    style={{
                      height:`${Math.max(4, (dailyMap[date]/maxDay)*80)}px`,
                      background: date === today ? '#C55A1B' : '#185FA5'
                    }}
                  />
                </div>
                <div className="daily-bar-date">{date.slice(5)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {Object.keys(catStats).length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">分類支出</div>
          {CAT_ORDER.filter(c => catStats[c]).map(cat => (
            <div key={cat} className="cat-bar-row">
              <span className="cat-bar-icon">{CAT_ICON[cat]}</span>
              <span className="cat-bar-name">{cat}</span>
              <div className="cat-bar-track">
                <div className="cat-bar-fill" style={{ width:`${(catStats[cat]/maxCat)*100}%` }} />
              </div>
              <span className="cat-bar-amt">NT${fmt(catStats[cat])}</span>
            </div>
          ))}
        </div>
      )}

      {/* Region stats */}
      {/* Payment method breakdown */}
      {Object.keys(methodMap).length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">支付方式</div>
          {Object.entries(methodMap).sort((a,b) => b[1]-a[1]).map(([m, amt]) => (
            <div key={m} className="cat-bar-row">
              <span className="cat-bar-icon">{METHOD_ICON[m] || '💰'}</span>
              <span className="cat-bar-name">{m}</span>
              <div className="cat-bar-track">
                <div className="cat-bar-fill" style={{ width:`${(amt/maxMethod)*100}%`, background:'#8B44B8' }} />
              </div>
              <span className="cat-bar-amt">NT${fmt(amt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Per person */}
      {people.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">各人代付</div>
          <div className="person-stats-row">
            {people.map((p, i) => (
              <div key={p} className="person-stat-card">
                <Avatar name={p} index={i} size={40} />
                <div className="person-stat-name">{p}</div>
                <div className="person-stat-amt">NT${fmt(perPerson[p] || 0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOP 10 */}
      {top10.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">TOP 10 單筆消費</div>
          {top10.map((e, i) => (
            <div key={e.id} className="top10-row">
              <span className="top10-rank">{i + 1}</span>
              <span className="top10-icon">{CAT_ICON[e.category] || '📌'}</span>
              <div className="top10-info">
                <div className="top10-name">{e.item || '（未命名）'}</div>
                <div className="top10-date">{e.date || ''}</div>
              </div>
              <div className="top10-amt">NT${fmt(toTwd(e))}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
