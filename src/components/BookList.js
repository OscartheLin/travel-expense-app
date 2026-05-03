import React, { useState } from 'react';

export default function BookList({ books, onOpen, onCreate, loading }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', people: '' });

  const handleCreate = () => {
    if (!form.name.trim()) return;
    onCreate(form.name, form.startDate, form.endDate, form.people);
    setShowModal(false);
    setForm({ name: '', startDate: '', endDate: '', people: '' });
  };

  return (
    <div className="book-list">
      <button className="new-book-card" onClick={() => setShowModal(true)}>＋ 新增帳本</button>

      {books.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">✈</div>
          <div>還沒有帳本，點上方新增第一趟旅行吧！</div>
        </div>
      )}

      {books.map(book => (
        <div key={book.id} className="book-card" onClick={() => onOpen(book)}>
          <div className="book-card-title">{book.name}</div>
          <div className="book-card-meta">
            {book.startDate && book.endDate ? `${book.startDate} – ${book.endDate}` : '日期未設定'}
            {book.people && ` ・ ${book.people}`}
          </div>
          <div className="book-card-footer">
            <span>點擊進入記帳</span>
            <span className="status-pill status-active">進行中</span>
          </div>
        </div>
      ))}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>新增帳本</h2>
            <div className="form-group">
              <label className="form-label">旅行名稱</label>
              <input className="form-input" placeholder="例：東京・富士山 2026" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">旅行日期</label>
              <div className="date-row">
                <input className="form-input" type="date" value={form.startDate}
                  onChange={e => setForm({ ...form, startDate: e.target.value })} />
                <input className="form-input" type="date" value={form.endDate}
                  onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">旅伴（選填）</label>
              <input className="form-input" placeholder="例：珽、小美" value={form.people}
                onChange={e => setForm({ ...form, people: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleCreate} disabled={!form.name.trim() || loading}>
              {loading ? '建立中...' : '建立帳本'}
            </button>
            <button className="btn-cancel" onClick={() => setShowModal(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}
