import React, { useState, useMemo, useRef } from 'react';

// Image helpers
const resizeImage = (file, maxW = 1000) => new Promise(resolve => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    const scale = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.toBlob(resolve, 'image/jpeg', 0.78);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
  img.src = url;
});
const toBase64 = blob => new Promise(resolve => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.readAsDataURL(blob);
});

// ── Document type config ──────────────────────────────────────────────────────
const DOC_TYPE_CONFIG = {
  flight: {
    label: '機票', icon: '✈️',
    fields: [
      { key: 'airline',       label: '航空公司',    placeholder: '例：日本航空 JAL',    required: true },
      { key: 'flightNo',      label: '航班號',      placeholder: '例：JL809' },
      { key: 'bookingRef',    label: '訂票代號',    placeholder: '例：XYZABC' },
      { key: 'departAirport', label: '出發機場',    placeholder: '例：桃園 TPE' },
      { key: 'arriveAirport', label: '抵達機場',    placeholder: '例：成田 NRT' },
      { key: 'departTime',    label: '登機時間',    placeholder: '例：08:30' },
      { key: 'arriveTime',    label: '抵達時間',    placeholder: '例：12:45' },
      { key: 'seat',          label: '座位',        placeholder: '例：23A' },
      { key: 'terminal',      label: '航廈',        placeholder: '例：第二航廈' },
      { key: 'baggage',       label: '行李限額',    placeholder: '例：23kg' },
    ]
  },
  hotel: {
    label: '住宿', icon: '🏨',
    fields: [
      { key: 'hotelName',  label: '飯店名稱',   placeholder: '例：東京新宿格蘭貝爾',   required: true },
      { key: 'checkIn',    label: '入住日期',   placeholder: '例：2025-05-01' },
      { key: 'checkOut',   label: '退房日期',   placeholder: '例：2025-05-05' },
      { key: 'roomType',   label: '房型',       placeholder: '例：雙人房' },
      { key: 'bookedBy',   label: '訂房人',     placeholder: '例：珽' },
      { key: 'confirmNo',  label: '確認號碼',   placeholder: '例：HTL-12345678' },
      { key: 'breakfast',  label: '早餐',       placeholder: '例：含早餐 / 不含' },
      { key: 'facilities', label: '特別設施',   placeholder: '例：溫泉、游泳池' },
      { key: 'address',    label: '地址',       placeholder: '例：東京都新宿區...' },
    ]
  },
  ticket: {
    label: '門票', icon: '🎫',
    fields: [
      { key: 'venueName',  label: '地點名稱',    placeholder: '例：東京迪士尼',    required: true },
      { key: 'ticketName', label: '票種名稱',    placeholder: '例：一日護照 大人' },
      { key: 'price',      label: '票價',        placeholder: '例：¥9400' },
      { key: 'validDate',  label: '有效日期',    placeholder: '例：2025-05-02' },
      { key: 'openTime',   label: '開放時間',    placeholder: '例：08:00–22:00' },
      { key: 'ticketNo',   label: '票號/條碼',   placeholder: '例：1234567890' },
    ]
  },
  transport: {
    label: '交通', icon: '🚄',
    fields: [
      { key: 'name',       label: '交通名稱',    placeholder: '例：新幹線のぞみ',   required: true },
      { key: 'from',       label: '出發地',      placeholder: '例：東京站' },
      { key: 'to',         label: '目的地',      placeholder: '例：大阪站' },
      { key: 'departTime', label: '出發時間',    placeholder: '例：09:00' },
      { key: 'arriveTime', label: '抵達時間',    placeholder: '例：11:30' },
      { key: 'vehicleNo',  label: '車次/班次',   placeholder: '例：15號' },
      { key: 'carNo',      label: '車廂',        placeholder: '例：7號車' },
      { key: 'seat',       label: '座位',        placeholder: '例：12C' },
      { key: 'class',      label: '艙等',        placeholder: '例：指定席' },
      { key: 'bookingRef', label: '訂位代號',    placeholder: '例：ABCDEF' },
    ]
  },
  other: {
    label: '其他', icon: '📄',
    fields: [
      { key: 'name',   label: '名稱',    placeholder: '例：旅遊保險',   required: true },
      { key: 'amount', label: '金額',    placeholder: '例：NT$500' },
      { key: 'note',   label: '備注',    placeholder: '任何補充說明' },
    ]
  }
};

const TYPE_KEYS = ['flight', 'hotel', 'ticket', 'transport', 'other'];

// Legacy Chinese type name → new key
const LEGACY_TYPE_MAP = { '機票':'flight', '住宿':'hotel', '門票':'ticket', '交通':'transport', '其他':'other' };

// ── Doc display helpers ───────────────────────────────────────────────────────
const getDocPrimary = doc => {
  if (!doc.fields) return doc.title || '文件';
  const f = doc.fields;
  switch (doc.type) {
    case 'flight':    return f.airline ? `${f.airline}${f.flightNo ? ' · ' + f.flightNo : ''}` : '機票';
    case 'hotel':     return f.hotelName || '住宿';
    case 'ticket':    return f.venueName || '門票';
    case 'transport': return f.name || '交通';
    default:          return f.name || '文件';
  }
};

const getDocSecondary = doc => {
  if (!doc.fields) return doc.code ? `確認碼：${doc.code}` : '';
  const f = doc.fields;
  switch (doc.type) {
    case 'flight': {
      const route = [f.departAirport, f.arriveAirport].filter(Boolean).join(' → ');
      const time  = f.departTime ? `${f.departTime}${f.arriveTime ? ' → ' + f.arriveTime : ''}` : '';
      return [route, time].filter(Boolean).join('  ·  ');
    }
    case 'hotel': {
      const dates = [f.checkIn, f.checkOut].filter(Boolean).join(' → ');
      return [dates, f.roomType].filter(Boolean).join('  ·  ');
    }
    case 'ticket':    return [f.ticketName, f.price].filter(Boolean).join('  ·  ');
    case 'transport': {
      const route = [f.from, f.to].filter(Boolean).join(' → ');
      const time  = f.departTime ? `${f.departTime}${f.arriveTime ? ' → ' + f.arriveTime : ''}` : '';
      return [route, time].filter(Boolean).join('  ·  ');
    }
    default: return f.amount || '';
  }
};

const getDocTertiary = doc => {
  if (!doc.fields) return doc.note || '';
  const f = doc.fields;
  switch (doc.type) {
    case 'flight':    return [f.bookingRef && `代號：${f.bookingRef}`, f.seat && `座位：${f.seat}`].filter(Boolean).join('  ·  ');
    case 'hotel':     return [f.confirmNo && `確認號：${f.confirmNo}`, f.bookedBy && `訂房：${f.bookedBy}`].filter(Boolean).join('  ·  ');
    case 'ticket':    return [f.validDate && `有效：${f.validDate}`, f.ticketNo && `票號：${f.ticketNo}`].filter(Boolean).join('  ·  ');
    case 'transport': return [f.carNo, f.seat].filter(Boolean).join(' ') || (f.bookingRef ? `代號：${f.bookingRef}` : '');
    default:          return f.note || '';
  }
};

// ── Misc ──────────────────────────────────────────────────────────────────────
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

const getDaysInRange = (startDate, endDate) => {
  if (!startDate) return [];
  const days = [];
  const end = new Date((endDate || startDate) + 'T00:00:00');
  for (let d = new Date(startDate + 'T00:00:00'); d <= end; d.setDate(d.getDate() + 1))
    days.push(d.toLocaleDateString('en-CA'));
  return days;
};

const norm = s => typeof s === 'string' ? { text: s, mapUrl: '', note: '' } : s;

const WMO_ICON = code => {
  if (code === 0) return '☀️';
  if (code <= 2)  return '🌤️';
  if (code === 3)  return '☁️';
  if (code <= 48) return '🌫️';
  if (code <= 55) return '🌦️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code <= 99) return '⛈️';
  return '🌡️';
};

// ─────────────────────────────────────────────────────────────────────────────

export default function ItineraryView({ book, journal, onSaveJournal, docs, onSaveDocs, entries, rates, onScanDoc, isLoadingMeta }) {
  const [expandedDay, setExpandedDay]   = useState(null);
  const [showDocModal, setShowDocModal] = useState(null); // date string when open
  const [editDocId, setEditDocId]       = useState(null);
  const [docForm, setDocForm]           = useState({ type: 'flight', fields: {}, imageBase64: '', pdfName: '' });
  const [docScanning, setDocScanning]   = useState(false);
  const [ocrDone, setOcrDone]           = useState(false);
  const [viewImage, setViewImage]       = useState(null);
  const [localJournal, setLocalJournal] = useState(journal || {});

  const [editStop, setEditStop]           = useState(null);
  const [editStopText, setEditStopText]   = useState('');
  const [editStopMap, setEditStopMap]     = useState('');
  const [newStopInputs, setNewStopInputs] = useState({});
  const [dragInfo, setDragInfo]           = useState(null); // { date, idx }
  const [dragOverIdx, setDragOverIdx]     = useState(null);
  const [editStopNote, setEditStopNote]   = useState('');
  const [weatherCities, setWeatherCities]     = useState({});
  const [weatherLoadingDay, setWeatherLoadingDay] = useState(null);

  const timers   = useRef({});
  const docFileRef = useRef(null);

  React.useEffect(() => {
    const j = journal || {};
    setLocalJournal(j);
    const cities = {};
    Object.entries(j).forEach(([date, day]) => { if (day.city) cities[date] = day.city; });
    setWeatherCities(cities);
  }, [journal]);

  const setField = (key, val) => setDocForm(f => ({ ...f, fields: { ...f.fields, [key]: val } }));
  const days = useMemo(() => getDaysInRange(book?.startDate, book?.endDate), [book]);
  const getStops = date => (localJournal[date]?.stops || []).map(norm);

  const persist = updated => {
    setLocalJournal(updated);
    clearTimeout(timers.current.save);
    timers.current.save = setTimeout(() => onSaveJournal(updated), 300);
  };

  // ── Stops ──────────────────────────────────────────────────────────────────
  const handleAddStop = date => {
    const text = (newStopInputs[date] || '').trim();
    if (!text) return;
    const stops = [...getStops(date), { text, mapUrl: '' }];
    persist({ ...localJournal, [date]: { ...localJournal[date], stops } });
    setNewStopInputs(n => ({ ...n, [date]: '' }));
  };

  const handleDeleteStop = (date, idx) => {
    const stops = getStops(date).filter((_, i) => i !== idx);
    persist({ ...localJournal, [date]: { ...localJournal[date], stops } });
    if (editStop?.date === date && editStop?.idx === idx) setEditStop(null);
  };

  const handleDragStart = (date, idx) => setDragInfo({ date, idx });
  const handleDragEnd   = () => { setDragInfo(null); setDragOverIdx(null); };
  const handleDragOver  = (e, idx) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (e, date, idx) => {
    e.preventDefault();
    if (!dragInfo || dragInfo.date !== date || dragInfo.idx === idx) { handleDragEnd(); return; }
    const stops = [...getStops(date)];
    const [moved] = stops.splice(dragInfo.idx, 1);
    stops.splice(idx, 0, moved);
    persist({ ...localJournal, [date]: { ...localJournal[date], stops } });
    handleDragEnd();
  };

  const fetchWeatherForDay = async (date) => {
    const city = (weatherCities[date] || '').trim();
    if (!city) return;
    setWeatherLoadingDay(date);
    try {
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&format=json`
      );
      const geoData = await geoRes.json();
      if (!geoData.results?.length) {
        alert('找不到城市，請改用英文輸入（例：Shanghai、Suzhou、Hangzhou、Tokyo）');
        setWeatherLoadingDay(null); return;
      }
      const { latitude, longitude } = geoData.results[0];

      const today = new Date().toLocaleDateString('en-CA');
      const maxDay = new Date(); maxDay.setDate(maxDay.getDate() + 15);
      const maxForecast = maxDay.toLocaleDateString('en-CA');

      if (date > maxForecast) {
        alert(`此日期距今超過 16 天，天氣預報尚未產生。\n請在出發前兩週再回來查詢。`);
        setWeatherLoadingDay(null); return;
      }

      const isPast = date < today;
      const baseUrl = isPast
        ? 'https://archive-api.open-meteo.com/v1/archive'
        : 'https://api.open-meteo.com/v1/forecast';

      const wRes = await fetch(
        `${baseUrl}?latitude=${latitude}&longitude=${longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`
      );
      const wData = await wRes.json();
      if (!wData.daily) throw new Error(wData.reason || '查無天氣資料');

      const updated = { ...localJournal };
      updated[date] = {
        ...(updated[date] || {}),
        city,
        weather: {
          code: wData.daily.weather_code[0],
          maxTemp: Math.round(wData.daily.temperature_2m_max[0]),
          minTemp: Math.round(wData.daily.temperature_2m_min[0]),
        }
      };
      persist(updated);
    } catch (e) { alert('天氣查詢失敗：' + e.message); }
    setWeatherLoadingDay(null);
  };

  const startEditStop = (date, idx) => {
    const s = getStops(date)[idx];
    setEditStop({ date, idx });
    setEditStopText(s.text || '');
    setEditStopMap(s.mapUrl || '');
    setEditStopNote(s.note || '');
  };

  const confirmEditStop = () => {
    if (!editStop || !editStopText.trim()) { setEditStop(null); return; }
    const { date, idx } = editStop;
    const stops = getStops(date).map((s, i) =>
      i === idx ? { text: editStopText.trim(), mapUrl: editStopMap.trim(), note: editStopNote.trim() } : s
    );
    persist({ ...localJournal, [date]: { ...localJournal[date], stops } });
    setEditStop(null);
  };

  // ── Docs ───────────────────────────────────────────────────────────────────
  const dayDocs = date => (docs || []).filter(d => d.date === date);

  const openAddDoc = date => {
    setEditDocId(null);
    setDocForm({ type: 'flight', fields: {}, imageBase64: '', pdfName: '' });
    setOcrDone(false);
    setShowDocModal(date);
  };

  const openEditDoc = doc => {
    setEditDocId(doc.id);
    if (doc.fields) {
      setDocForm({ type: doc.type || 'other', fields: doc.fields || {}, imageBase64: doc.imageBase64 || '', pdfName: doc.pdfName || '' });
    } else {
      // Legacy doc format: map Chinese type to new key
      const typeKey = LEGACY_TYPE_MAP[doc.type] || 'other';
      const cfg = DOC_TYPE_CONFIG[typeKey];
      const reqKey = cfg?.fields.find(f => f.required)?.key || 'name';
      setDocForm({
        type: typeKey,
        fields: { [reqKey]: doc.title || '', note: doc.note || '' },
        imageBase64: doc.imageBase64 || '',
        pdfName: doc.pdfName || ''
      });
    }
    setOcrDone(false);
    setShowDocModal(doc.date);
  };

  const handleSaveDoc = () => {
    const cfg = DOC_TYPE_CONFIG[docForm.type];
    const reqField = cfg?.fields.find(f => f.required);
    if (reqField && !(docForm.fields[reqField.key] || '').trim()) return;
    const updated = editDocId
      ? (docs || []).map(d => d.id === editDocId
          ? { ...d, type: docForm.type, fields: docForm.fields, imageBase64: docForm.imageBase64, pdfName: docForm.pdfName || '' }
          : d)
      : [...(docs || []), {
          id: `doc_${Date.now()}`,
          date: showDocModal,
          type: docForm.type,
          fields: docForm.fields,
          imageBase64: docForm.imageBase64,
          pdfName: docForm.pdfName || '',
        }];
    onSaveDocs(updated);
    setShowDocModal(null);
    setEditDocId(null);
  };

  const handleDeleteDoc = id => onSaveDocs((docs || []).filter(d => d.id !== id));

  const handleDocScan = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setDocScanning(true);
    const isPdf = file.type === 'application/pdf';
    try {
      if (isPdf) {
        setDocForm(f => ({ ...f, pdfName: file.name, imageBase64: '' }));
      } else {
        const resized = await resizeImage(file);
        const b64 = await toBase64(resized);
        setDocForm(f => ({ ...f, imageBase64: b64, pdfName: '' }));
      }
      if (onScanDoc) {
        try {
          const scannedFields = await onScanDoc(file, docForm.type);
          if (scannedFields && Object.keys(scannedFields).length > 0) {
            // eslint-disable-next-line no-unused-vars
            const { date: _date, ...rest } = scannedFields;
            setDocForm(f => ({ ...f, fields: { ...f.fields, ...rest } }));
            setOcrDone(true);
          }
        } catch (err) {
          alert(err.message || 'AI 辨識失敗，請手動填寫');
        }
      }
    } catch { /* ignore */ }
    setDocScanning(false);
    e.target.value = '';
  };

  // ── Daily expense ──────────────────────────────────────────────────────────
  const dailyExpenses = useMemo(() => {
    if (!entries || !rates) return {};
    const m = {};
    entries.forEach(e => {
      if (!e.date) return;
      const val = (parseFloat(e.amount) || 0) * (rates[e.currency] || 1);
      if (!m[e.date]) m[e.date] = { total: 0, count: 0 };
      m[e.date].total += val;
      m[e.date].count += 1;
    });
    return m;
  }, [entries, rates]);

  const fmt = n => Math.round(n).toLocaleString();
  const today = new Date().toLocaleDateString('en-CA');

  // Derive disabled state for Save button
  const canSaveDoc = (() => {
    const cfg = DOC_TYPE_CONFIG[docForm.type];
    const req = cfg?.fields.find(f => f.required);
    return !req || (docForm.fields[req.key] || '').trim().length > 0;
  })();

  if (!book?.startDate || !book?.endDate) {
    if (isLoadingMeta) {
      return (
        <div style={{ padding:'0 14px 20px' }}>
          <div className="empty-state">
            <div className="empty-icon" style={{ fontSize:32 }}>⏳</div>
            <div>載入行程資料中...</div>
          </div>
        </div>
      );
    }
    return (
      <div style={{ padding:'0 14px 20px' }}>
        <div className="empty-state">
          <div className="empty-icon">🗓</div>
          <div>請點右上角 ✎ 設定旅程起訖日期，即可產生每日行程格</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 14px 20px' }}>
      <p style={{ fontSize:12, color:'#888', padding:'12px 0 6px', lineHeight:1.7 }}>
        共 {days.length} 天 · 點開每天新增地點、貼地圖連結、掃描文件
      </p>
      {days.map((date, dayIdx) => {
        const wd      = WEEKDAY[new Date(date + 'T00:00:00').getDay()];
        const isExp   = expandedDay === date;
        const exp     = dailyExpenses[date];
        const stops   = getStops(date);
        const dd      = dayDocs(date);
        const isToday = date === today;
        const dayWeather = localJournal[date]?.weather;
        const preview = stops.length > 0
          ? stops.slice(0, 3).map(s => s.text).join(' → ') + (stops.length > 3 ? '...' : '')
          : null;

        return (
          <div key={date} className={`itinerary-card itinerary-card-col${isToday ? ' itinerary-day-today' : ''}`}>
            {/* Header */}
            <div className="itinerary-seg-header" onClick={() => setExpandedDay(isExp ? null : date)}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div className="journal-day-badge" style={{ minWidth:52, textAlign:'center' }}>Day {dayIdx + 1}</div>
                <div>
                  <div style={{ fontSize:14, fontWeight:500, color:'#1a1a1a', display:'flex', alignItems:'center', flexWrap:'wrap', gap:4 }}>
                    {date.slice(5)}（週{wd}）
                    {isToday && <span style={{ fontSize:11, color:'#C55A1B', fontWeight:700 }}>今天</span>}
                    {dayWeather && (
                      <span style={{ fontSize:13, color:'#444', fontWeight:400 }}>
                        {localJournal[date]?.city && <span style={{ color:'#888', marginRight:2 }}>{localJournal[date].city} · </span>}
                        {WMO_ICON(dayWeather.code)} {dayWeather.maxTemp}°/{dayWeather.minTemp}°
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:11, color: preview ? '#555' : '#ccc', marginTop:1, maxWidth:200, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {preview || (localJournal[date]?.text ? `📓 ${localJournal[date].text}` : '點擊展開，輸入今天行程...')}
                  </div>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {exp && <span className="journal-day-expense">NT${fmt(exp.total)}</span>}
                {(stops.length > 0 || dd.length > 0) && (
                  <span style={{ fontSize:11, color:'#888', background:'#f0f0f0', borderRadius:99, padding:'1px 7px' }}>
                    {[stops.length > 0 && `${stops.length}站`, dd.length > 0 && `${dd.length}件`].filter(Boolean).join('·')}
                  </span>
                )}
                <span className="seg-chevron">{isExp ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expanded */}
            {isExp && (
              <div className="seg-expand">
                {/* Stops list */}
                <div className="stops-list">
                  {stops.map((stop, idx) => {
                    const isEditing = editStop?.date === date && editStop?.idx === idx;
                    const isDragging = dragInfo?.date === date && dragInfo?.idx === idx;
                    const isDropTarget = dragInfo?.date === date && dragOverIdx === idx && dragInfo?.idx !== idx;
                    return (
                      <div key={idx}
                        className={`stop-row${isDropTarget ? ' stop-drop-target' : ''}`}
                        draggable={!isEditing}
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; handleDragStart(date, idx); }}
                        onDragOver={e => handleDragOver(e, idx)}
                        onDrop={e => handleDrop(e, date, idx)}
                        onDragEnd={handleDragEnd}
                        style={isDragging ? { opacity: 0.4 } : {}}
                      >
                        {isEditing ? (
                          <div className="stop-edit-form">
                            <div className="stop-edit-top">
                              <span className="stop-bullet">📍</span>
                              <input className="stop-edit-input" value={editStopText} autoFocus
                                placeholder="地點名稱"
                                onChange={e => setEditStopText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmEditStop(); if (e.key === 'Escape') setEditStop(null); }} />
                              <button className="stop-confirm-btn" onClick={confirmEditStop}>✓</button>
                              <button className="del-btn" onClick={() => setEditStop(null)}>✕</button>
                            </div>
                            <div className="stop-edit-map">
                              <span style={{ fontSize:15 }}>🗺</span>
                              <input className="stop-edit-input" value={editStopMap}
                                placeholder="貼上 Google Maps / 高德地圖連結（選填）"
                                onChange={e => setEditStopMap(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmEditStop(); if (e.key === 'Escape') setEditStop(null); }} />
                            </div>
                            <div className="stop-edit-map">
                              <span style={{ fontSize:15 }}>📝</span>
                              <input className="stop-edit-input" value={editStopNote}
                                placeholder="備注（選填）"
                                onChange={e => setEditStopNote(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) confirmEditStop(); if (e.key === 'Escape') setEditStop(null); }} />
                            </div>
                          </div>
                        ) : (
                          <>
                            <span className="stop-drag-handle">⠿</span>
                            <span className="stop-bullet">📍</span>
                            <div className="stop-content">
                              <span className="stop-text">{stop.text}</span>
                              {stop.note && <div className="stop-note">{stop.note}</div>}
                            </div>
                            {stop.mapUrl && (
                              <a href={stop.mapUrl} target="_blank" rel="noopener noreferrer"
                                className="stop-map-btn" onClick={e => e.stopPropagation()} title="開啟地圖">🗺</a>
                            )}
                            <div className="stop-actions">
                              <button className="edit-btn" onClick={e => { e.stopPropagation(); startEditStop(date, idx); }}>✎</button>
                              <button className="del-btn" onClick={e => { e.stopPropagation(); handleDeleteStop(date, idx); }}>✕</button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                  <div className="stop-add-row">
                    <span style={{ fontSize:16, flexShrink:0, opacity:0.3 }}>📍</span>
                    <input className="stop-add-input"
                      placeholder="新增地點或行程（按 Enter 送出）"
                      value={newStopInputs[date] || ''}
                      onChange={e => setNewStopInputs(n => ({ ...n, [date]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) handleAddStop(date); }} />
                    <button className="stop-add-btn" onClick={() => handleAddStop(date)}
                      disabled={!(newStopInputs[date] || '').trim()}>＋</button>
                  </div>
                </div>

                {/* Per-day weather */}
                <div className="weather-row" style={{ margin:'8px 0 4px' }}>
                  <span style={{ fontSize:14 }}>🌤</span>
                  <input className="weather-city-input"
                    placeholder="輸入城市查當天天氣（英文，例：Shanghai）"
                    value={weatherCities[date] || ''}
                    onChange={e => setWeatherCities(c => ({ ...c, [date]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) fetchWeatherForDay(date); }}
                  />
                  <button className="weather-fetch-btn"
                    onClick={() => fetchWeatherForDay(date)}
                    disabled={!(weatherCities[date] || '').trim() || weatherLoadingDay === date}>
                    {weatherLoadingDay === date ? '⏳' : '查天氣'}
                  </button>
                </div>

                {/* Daily diary */}
                <div className="diary-section">
                  <div className="diary-label">📓 今日日記</div>
                  <textarea
                    className="diary-textarea"
                    placeholder="記錄今天的心情、趣事、美食或小抱怨..."
                    value={localJournal[date]?.text || ''}
                    onChange={e => {
                      const updated = { ...localJournal, [date]: { ...localJournal[date], text: e.target.value } };
                      persist(updated);
                    }}
                  />
                </div>

                {/* Documents */}
                <div className="seg-docs">
                  <div className="seg-docs-title">文件附件</div>
                  {dd.length === 0 ? (
                    <div style={{ fontSize:12, color:'#bbb', padding:'4px 0 6px' }}>尚未新增文件</div>
                  ) : dd.map(doc => {
                    const cfg = DOC_TYPE_CONFIG[doc.type] || DOC_TYPE_CONFIG[LEGACY_TYPE_MAP[doc.type]] || DOC_TYPE_CONFIG.other;
                    const primary   = getDocPrimary(doc);
                    const secondary = getDocSecondary(doc);
                    const tertiary  = getDocTertiary(doc);
                    return (
                      <div key={doc.id} className="doc-card">
                        <span className="doc-icon">{cfg.icon}</span>
                        <div className="doc-info">
                          <div className="doc-primary">{primary}</div>
                          {secondary && <div className="doc-secondary">{secondary}</div>}
                          {tertiary  && <div className="doc-tertiary">{tertiary}</div>}
                        </div>
                        {doc.imageBase64 ? (
                          <img src={doc.imageBase64} alt="附件" className="doc-thumbnail"
                            onClick={e => { e.stopPropagation(); setViewImage(doc.imageBase64); }} />
                        ) : doc.pdfName ? (
                          <span style={{ fontSize:11, color:'#555', background:'#ececec', borderRadius:4, padding:'2px 6px', flexShrink:0 }}>📄 PDF</span>
                        ) : null}
                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                          <button className="edit-btn" onClick={() => openEditDoc(doc)}>✎</button>
                          <button className="del-btn" onClick={() => handleDeleteDoc(doc.id)}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                  <button className="add-doc-btn" onClick={() => openAddDoc(date)}>＋ 新增文件</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Document modal */}
      {showDocModal !== null && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDocModal(null)}>
          <div className="modal">
            <h2>{editDocId ? '編輯文件' : '新增文件'}</h2>

            {/* Type selector */}
            <div className="doc-type-tabs">
              {TYPE_KEYS.map(k => {
                const cfg = DOC_TYPE_CONFIG[k];
                return (
                  <button key={k}
                    className={`doc-type-tab ${docForm.type === k ? 'active' : ''}`}
                    onClick={() => {
                      setDocForm(f => ({ type: k, fields: {}, imageBase64: f.imageBase64, pdfName: f.pdfName || '' }));
                      setOcrDone(false);
                    }}>
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Image scan / preview */}
            <input type="file" accept="image/*,.pdf"
              ref={docFileRef} style={{ display:'none' }} onChange={handleDocScan} />
            {docForm.imageBase64 ? (
              <div style={{ position:'relative', marginBottom:12 }}>
                <img src={docForm.imageBase64} alt="doc preview"
                  style={{ width:'100%', maxHeight:140, objectFit:'cover', borderRadius:10 }} />
                <button onClick={() => setDocForm(f => ({ ...f, imageBase64: '' }))}
                  style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.55)',
                    color:'#fff', border:'none', borderRadius:99, width:26, height:26,
                    cursor:'pointer', fontSize:13, lineHeight:1 }}>✕</button>
                <button
                  className="scan-btn"
                  disabled={docScanning}
                  onClick={() => docFileRef.current?.click()}
                  style={{ marginTop:6, fontSize:12, padding:'8px' }}>
                  {docScanning ? '⏳ 辨識中…' : '🔄 重新掃描'}
                </button>
              </div>
            ) : docForm.pdfName ? (
              <div style={{ display:'flex', alignItems:'center', gap:8, background:'#f5f5f5', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
                <span style={{ fontSize:22, flexShrink:0 }}>📄</span>
                <span style={{ fontSize:12, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#333' }}>{docForm.pdfName}</span>
                <button onClick={() => setDocForm(f => ({ ...f, pdfName: '' }))}
                  style={{ background:'none', border:'none', color:'#aaa', cursor:'pointer', fontSize:16, flexShrink:0 }}>✕</button>
                <button className="scan-btn" disabled={docScanning}
                  onClick={() => docFileRef.current?.click()}
                  style={{ fontSize:11, padding:'6px 8px', margin:0, flexShrink:0 }}>
                  {docScanning ? '⏳ 辨識中…' : '🔄 重選'}
                </button>
              </div>
            ) : (
              <button className="scan-btn" disabled={docScanning}
                onClick={() => docFileRef.current?.click()}>
                {docScanning ? '⏳ 辨識中…' : `📎 拍攝或上傳${DOC_TYPE_CONFIG[docForm.type]?.label}（支援圖片／PDF）`}
                {!onScanDoc && <span style={{ fontSize:11, opacity:0.7 }}> （需設定 Gemini Key）</span>}
              </button>
            )}

            {ocrDone && (
              <div className="ocr-hint" style={{ marginTop:8, marginBottom:4 }}>
                ✅ 辨識完成，請確認以下內容
                <button className="ocr-hint-close" onClick={() => setOcrDone(false)}>✕</button>
              </div>
            )}

            {/* Fields */}
            <div style={{ marginTop:12 }}>
              {(DOC_TYPE_CONFIG[docForm.type]?.fields || []).map(({ key, label, placeholder, required }) => (
                <div key={key} className="form-group">
                  <label className="form-label">
                    {label}{required && <span className="doc-required-star"> *</span>}
                  </label>
                  <input className="form-input" placeholder={placeholder}
                    value={docForm.fields[key] || ''}
                    onChange={e => setField(key, e.target.value)} />
                </div>
              ))}
            </div>

            <button className="btn-primary" disabled={!canSaveDoc} onClick={handleSaveDoc}>
              {editDocId ? '確認更新' : '確認新增'}
            </button>
            <button className="btn-cancel" onClick={() => { setShowDocModal(null); setEditDocId(null); }}>取消</button>
          </div>
        </div>
      )}

      {/* Full-screen image viewer */}
      {viewImage && (
        <div className="img-viewer-backdrop" onClick={() => setViewImage(null)}>
          <img src={viewImage} alt="full" className="img-viewer-img" />
          <button className="img-viewer-close" onClick={() => setViewImage(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
