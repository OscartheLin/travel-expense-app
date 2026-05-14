import React, { useState } from 'react';

const getDayCount = (start, end) => {
  if (!start || !end) return null;
  const diff = (new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000;
  return Math.floor(diff) + 1;
};

const getTripStatus = (start, end) => {
  const today = new Date().toLocaleDateString('en-CA');
  if (!start) return null;
  if (today < start) return 'upcoming';
  if (!end || today <= end) return 'ongoing';
  return 'past';
};

const STATUS_LABEL = { upcoming: '即將出發', ongoing: '旅途中', past: '已結束' };
const STATUS_COLOR = { upcoming: '#185FA5', ongoing: '#0F6E56', past: '#aaa' };
const STATUS_BG    = { upcoming: '#EAF4FF', ongoing: '#E6F5EC', past: '#f5f5f5' };

export default function BookList({ books, onOpen, onCreate, onJoin, onDelete, loading }) {
  const [showModal, setShowModal] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', people: '', budget: '' });
  const [joinUrl, setJoinUrl] = useState('');

  const handleCreate = () => {
    if (!form.name.trim()) return;
    onCreate(form.name, form.startDate, form.endDate, form.people, form.budget);
    setShowModal(false);
    setForm({ name: '', startDate: '', endDate: '', people: '', budget: '' });
  };

  const handleJoin = () => {
    if (!joinUrl.trim()) return;
    onJoin(joinUrl.trim());
    setShowJoin(false);
    setJoinUrl('');
  };

  const previewDays = getDayCount(form.startDate, form.endDate);

  return (
    <div className="book-list">
      <div className="trip-list-header">
        <button className="new-trip-btn" onClick={() => setShowModal(true)}>＋ 新增旅程</button>
        <button className="join-trip-btn" onClick={() => setShowJoin(true)}>🔗 加入旅程</button>
      </div>

      {books.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✈️</div>
          <div>還沒有旅程，點上方新增第一趟旅行吧！</div>
        </div>
      )}

      {[...books].sort((a, b) => {
        if (!a.startDate && !b.startDate) return 0;
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return b.startDate.localeCompare(a.startDate);
      }).map(book => {
        const dayCount = getDayCount(book.startDate, book.endDate);
        const status = getTripStatus(book.startDate, book.endDate);
        const people = book.people ? book.people.split(/[,，、]/).map(s => s.trim()).filter(Boolean) : [];

        return (
          <div
            key={book.id}
            className="trip-card"
            onClick={() => confirmDeleteId !== book.id && onOpen(book)}
          >
            <div className="trip-card-top">
              <div className="trip-card-name">{book.name}</div>
              {confirmDeleteId === book.id ? (
                <div className="book-delete-confirm">
                  <button className="book-del-yes" onClick={e => { e.stopPropagation(); onDelete(book.id); setConfirmDeleteId(null); }}>移除</button>
                  <button className="book-del-no"  onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}>取消</button>
                </div>
              ) : (
                <button className="book-del-btn" onClick={e => { e.stopPropagation(); setConfirmDeleteId(book.id); }}>✕</button>
              )}
            </div>

            <div className="trip-card-meta">
              {book.startDate ? (
                <>
                  <span className="trip-meta-dates">
                    {book.startDate}{book.endDate && book.endDate !== book.startDate ? ` – ${book.endDate}` : ''}
                  </span>
                  {dayCount && (
                    <span className="trip-meta-days">{dayCount} 天</span>
                  )}
                </>
              ) : (
                <span className="trip-meta-nodate">日期未設定</span>
              )}
            </div>

            <div className="trip-card-bottom">
              <div className="trip-meta-people">
                {people.length > 0
                  ? people.map((p, i) => (
                      <span key={i} className="trip-person-chip">{p}</span>
                    ))
                  : <span className="trip-meta-nodate">未設定旅伴</span>
                }
              </div>
              {status ? (
                <span className="trip-status-pill" style={{
                  color: STATUS_COLOR[status],
                  background: STATUS_BG[status],
                }}>
                  {STATUS_LABEL[status]}
                </span>
              ) : (
                <span className="trip-status-pill" style={{ color:'#aaa', background:'#f5f5f5' }}>
                  {book.joined ? '共用' : '進行中'}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Create trip modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>✈️ 新增旅程</h2>
            <div className="form-group">
              <label className="form-label">旅程名稱</label>
              <input className="form-input" placeholder="例：東京・富士山五日遊" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">
                出發 → 回程日期
                {previewDays && (
                  <span style={{ marginLeft:8, color:'#185FA5', fontWeight:700 }}>共 {previewDays} 天</span>
                )}
              </label>
              <div className="date-row">
                <input className="form-input" type="date" value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })} />
                <input className="form-input" type="date" value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">旅伴（選填，逗號分隔）</label>
              <input className="form-input" placeholder="例：珽、婷、阿偉" value={form.people}
                onChange={e => setForm({ ...form, people: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">現金預算 TWD（選填）</label>
              <input className="form-input" type="number" placeholder="例：30000" value={form.budget}
                onChange={e => setForm({ ...form, budget: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleCreate} disabled={!form.name.trim() || loading}>
              {loading ? '建立中...' : '建立旅程'}
            </button>
            <button className="btn-cancel" onClick={() => setShowModal(false)}>取消</button>
          </div>
        </div>
      )}

      {/* Join trip modal */}
      {showJoin && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowJoin(false)}>
          <div className="modal">
            <h2>🔗 加入旅程</h2>
            <p style={{ fontSize:13, color:'var(--color-text-secondary)', marginBottom:16 }}>
              請對方把 Google Sheets 網址傳給你，貼在下方
            </p>
            <div className="form-group">
              <label className="form-label">Google Sheets 網址</label>
              <input className="form-input" placeholder="https://docs.google.com/spreadsheets/d/..." value={joinUrl}
                onChange={e => setJoinUrl(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={handleJoin} disabled={!joinUrl.trim() || loading}>
              {loading ? '加入中...' : '加入旅程'}
            </button>
            <button className="btn-cancel" onClick={() => setShowJoin(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
