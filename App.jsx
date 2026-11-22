import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const PREFIX = 'finDuo:';
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const isInMonth = (s, k) => (s || '').startsWith(k);
const sumBy = (tx, t) => tx.filter(x => x.type === t).reduce((s, x) => s + Number(x.amount || 0), 0);
const fmt = n => Number(n || 0).toLocaleString('ru-RU') + ' ₽';
const daysLeft = () => {
  const n = new Date(), l = new Date(n.getFullYear(), n.getMonth() + 1, 0);
  return l.getDate() - n.getDate() + 1;
};

const loadLS = (k, v) => {
  try { const r = localStorage.getItem(PREFIX + k); if (!r) return null;
    const p = JSON.parse(r); return p.version === v ? p.data : null; } catch { return null; }
};
const saveLS = (k, d, v) => {
  try { localStorage.setItem(PREFIX + k, JSON.stringify({ version: v, data: d })); } catch {}
};

function parseInput(raw, cats) {
  const text = (raw || '').trim();
  if (!text) return null;
  const m = text.match(/([+-])?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const amt = parseFloat(m[2].replace(',', '.'));
  if (!amt) return null;
  let type = m[1] === '+' ? 'income' : 'expense';
  const lower = text.toLowerCase();
  const hit = cats.filter(c => lower.includes(c.name.toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  let categoryId = null;
  if (hit) { categoryId = hit.id; type = hit.type; }
  let note = text;
  if (hit) note = note.replace(new RegExp(hit.name, 'i'), '');
  note = note.replace(/([+-])?\s*\d+(?:[.,]\d{1,2})?/, '').trim();
  return { type, amount: amt, categoryId, note };
}

function confetti() {
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
  c.width = innerWidth; c.height = innerHeight;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const P = Array.from({ length: 120 }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .4,
    vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 3,
    s: 4 + Math.random() * 6, c: ['#34F5C5', '#7FFFE3', '#ECFDF5'][Math.floor(Math.random() * 3)],
    r: Math.random() * 6.28, vr: (Math.random() - .5) * .3, l: 1
  }));
  const tick = () => {
    ctx.clearRect(0, 0, c.width, c.height); let a = 0;
    for (const p of P) {
      p.vy += .35; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.l -= .008;
      if (p.l > 0) { a++; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.globalAlpha = Math.max(p.l, 0); ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); }
    }
    if (a) requestAnimationFrame(tick); else c.remove();
  };
  tick();
}

const DEFAULT_CATS = [
  { id: 'food', name: 'Еда', type: 'expense', icon: '🍜', quick: true },
  { id: 'coffee', name: 'Кофе', type: 'expense', icon: '☕', quick: true },
  { id: 'transport', name: 'Транспорт', type: 'expense', icon: '🚌', quick: true },
  { id: 'fun', name: 'Развлечения', type: 'expense', icon: '🎬' },
  { id: 'health', name: 'Здоровье', type: 'expense', icon: '💊' },
  { id: 'home', name: 'Дом', type: 'expense', icon: '🏠' },
  { id: 'salary', name: 'Зарплата', type: 'income', icon: '💼' },
  { id: 'gift', name: 'Подарки', type: 'income', icon: '🎁' }
];

const INITIAL = {
  transactions: [], categories: DEFAULT_CATS, goals: {}, recurring: [],
  settings: { startingSavings: 0, users: ['Я', 'Партнёр'], currentUser: 'Я', lastCelebrated: null }
};

const Ctx = createContext(null);

function Provider({ children }) {
  const [state, setState] = useState(() => loadLS('state', 1) ?? INITIAL);
  const month = monthKey();
  const once = useRef(false);

  useEffect(() => { saveLS('state', state, 1); }, [state]);

  const derived = useMemo(() => {
    const tx = state.transactions.filter(t => isInMonth(t.date, month));
    const income = sumBy(tx, 'income');
    const expense = sumBy(tx, 'expense');
    return { tx, income, expense, balance: income - expense,
      savings: (state.settings.startingSavings || 0) + income - expense };
  }, [state.transactions, state.settings.startingSavings, month]);

  useEffect(() => {
    const th = derived.expense > derived.income ? 'loss' : 'profit';
    document.documentElement.setAttribute('data-theme', th);
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', th === 'loss' ? '#110909' : '#061316');
  }, [derived.income, derived.expense]);

  useEffect(() => {
    if (once.current) return; once.current = true;
    const last = state.settings.lastCelebrated;
    if (last && last !== month) {
      const [y, m] = month.split('-').map(Number);
      const prev = monthKey(new Date(y, m - 2, 1));
      const ptx = state.transactions.filter(t => isInMonth(t.date, prev));
      if (sumBy(ptx, 'income') > sumBy(ptx, 'expense') && sumBy(ptx, 'income') > 0) confetti();
    }
    setState(s => ({ ...s, settings: { ...s.settings, lastCelebrated: month } }));
  }, []);

  const api = {
    state, month, ...derived,
    addTx: tx => setState(s => ({ ...s, transactions: [{ id: crypto.randomUUID(), ...tx }, ...s.transactions] })),
    delTx: id => setState(s => ({ ...s, transactions: s.transactions.filter(t => t.id !== id) })),
    setCats: fn => setState(s => ({ ...s, categories: fn(s.categories) })),
    setGoals: fn => setState(s => ({ ...s, goals: fn(s.goals) })),
    setRec: fn => setState(s => ({ ...s, recurring: fn(s.recurring) })),
    setSet: fn => setState(s => ({ ...s, settings: fn(s.settings) })),
    payRec: id => setState(s => {
      const r = s.recurring.find(x => x.id === id); if (!r) return s;
      return { ...s,
        transactions: [{ id: crypto.randomUUID(), type: r.type, amount: r.amount,
          date: new Date().toISOString().slice(0, 10), categoryId: r.categoryId,
          note: r.title, paidBy: s.settings.currentUser }, ...s.transactions],
        recurring: s.recurring.map(x => x.id === id ? { ...x, lastPaid: month } : x) };
    })
  };

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

const useFin = () => { const c = useContext(Ctx); if (!c) throw new Error('no ctx'); return c; };

function Card({ children, className = '' }) { return <div className={`card ${className}`}>{children}</div>; }

function Dashboard({ setTab }) {
  const { income, expense, balance, savings, tx, state, month } = useFin();
  const days = daysLeft();
  const safe = Math.floor(Math.max(income - expense, 0) / days);

  const top = useMemo(() => tx.filter(t => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 3), [tx]);

  const prog = useMemo(() => state.categories.filter(c => c.type === 'expense').map(c => {
    const spent = tx.filter(t => t.categoryId === c.id && t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0);
    const lim = state.goals[c.id] || 0;
    const pct = lim > 0 ? spent / lim : 0;
    return { ...c, spent, lim, pct, status: pct >= 1 ? 'danger' : pct >= .8 ? 'warn' : 'ok' };
  }).filter(r => r.lim || r.spent > 0).sort((a, b) => b.pct - a.pct), [state.categories, state.goals, tx]);

  const due = state.recurring.filter(r => r.lastPaid !== month);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Бюджет двоих</h1>
        <span className="text-xs uppercase tracking-wider text-muted">
          {new Date().toLocaleDateString('ru-RU', { month: 'long' })}
        </span>
      </div>

      <Card className="mb-4">
        <div className="mb-3 flex justify-between text-sm text-muted"><span>Доходы</span><span>Расходы</span></div>
        <div className="relative h-3 w-full overflow-hidden rounded-full bg-black/30">
          {(() => {
            const total = income + expense || 1;
            const win = income >= expense;
            return <>
              <div className="absolute inset-y-0 left-0 rounded-full" style={{
                width: `${(income / total) * 100}%`,
                background: win ? 'linear-gradient(90deg,#34F5C5,#7FFFE3)' : 'linear-gradient(90deg,#1f6b5a,#34F5C5)',
                boxShadow: win ? '0 0 18px rgba(52,245,197,.45)' : 'none'
              }} />
              <div className="absolute inset-y-0 right-0 rounded-full" style={{
                width: `${(expense / total) * 100}%`,
                background: win ? 'linear-gradient(90deg,#6b2622,#ff4d2d)' : 'linear-gradient(90deg,#ff8a75,#ff4d2d)',
                boxShadow: !win ? '0 0 22px rgba(255,77,45,.55)' : 'none'
              }} />
            </>;
          })()}
        </div>
        <div className="mt-3 flex justify-between">
          <span className="num text-lg text-accent">{fmt(income)}</span>
          <span className="num text-lg" style={{ color: income >= expense ? 'rgb(var(--c-muted))' : 'rgb(var(--c-accent))' }}>{fmt(expense)}</span>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Card><p className="text-xs text-muted">Накопления</p><p className="num mt-1 text-lg text-ink">{fmt(savings)}</p></Card>
        <Card><p className="text-xs text-muted">Баланс</p><p className="num mt-1 text-lg text-accent">{balance >= 0 ? '+' : ''}{fmt(balance)}</p></Card>
        <Card><p className="text-xs text-muted">Расход</p><p className="num mt-1 text-lg text-ink">{fmt(expense)}</p></Card>
      </div>

      <Card className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Безопасно сегодня</p>
          <p className="num mt-1 text-2xl">{fmt(safe)}</p>
        </div>
        <div className="text-right text-xs text-muted"><p>дней</p><p className="num text-lg text-accent">{days}</p></div>
      </Card>

      {due.length > 0 && (
        <Card className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Регулярные платежи</p>
          <ul className="space-y-2">
            {due.map(r => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span>{r.title}</span>
                <div className="flex items-center gap-2">
                  <span className="num text-accent">{fmt(r.amount)}</span>
                  <PayBtn id={r.id} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">На что обратить внимание</p>
        {top.length === 0 ? <p className="text-sm text-muted">Пока пусто 🌱</p> : (
          <ul className="space-y-2">
            {top.map(t => {
              const c = state.categories.find(x => x.id === t.categoryId);
              return (
                <li key={t.id} className="flex justify-between text-sm">
                  <span className="truncate">{c?.icon} {c?.name || t.note || '—'}</span>
                  <span className="num text-accent">−{fmt(t.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {prog.length > 0 && (
        <Card className="mb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Прогресс по лимитам</p>
          <ul className="space-y-2">
            {prog.map(r => {
              const color = { ok: 'rgb(var(--c-accent))', warn: '#F5C84C', danger: '#FF4D2D' }[r.status];
              return (
                <li key={r.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{r.icon} {r.name}</span>
                    <span className="num text-muted">{r.spent.toLocaleString('ru-RU')}{r.lim ? `/${r.lim.toLocaleString('ru-RU')}` : ''}₽</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(r.pct * 100, 100)}%`, background: color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <button onClick={() => setTab('tx')} className="btn-primary w-full py-3">+ Новая операция</button>
    </div>
  );
}

function PayBtn({ id }) {
  const { payRec } = useFin();
  return <button onClick={() => payRec(id)} className="btn-ghost !px-2 !py-1 text-xs">✓</button>;
}

function Transactions() {
  const { state, addTx, delTx, month } = useFin();
  const [smart, setSmart] = useState('');
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [catId, setCatId] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [by, setBy] = useState(state.settings.currentUser);

  const list = useMemo(() => state.transactions.filter(t => isInMonth(t.date, month)).sort((a, b) => b.date.localeCompare(a.date)), [state.transactions, month]);
  const quick = state.categories.filter(c => c.quick && c.type === 'expense');

  function smartSubmit(e) {
    e.preventDefault();
    const p = parseInput(smart, state.categories);
    if (!p) return;
    addTx({ ...p, date, paidBy: by });
    setSmart('');
  }

  function manual(e) {
    e.preventDefault();
    const a = parseFloat(amount);
    if (!a) return;
    addTx({ type, amount: a, categoryId: catId || null, note: note.trim(), date, paidBy: by });
    setAmount(''); setNote('');
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Операции</h1>

      <form onSubmit={smartSubmit} className="card mb-3">
        <label className="label">Умный ввод</label>
        <div className="flex gap-2">
          <input className="input" placeholder="Кофе 300" value={smart} onChange={e => setSmart(e.target.value)} />
          <button className="btn-primary shrink-0">→</button>
        </div>
        <p className="mt-1 text-xs text-muted">«Кофе 300» → расход. «Зарплата +50000» → доход.</p>
      </form>

      {quick.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {quick.map(c => (
            <button key={c.id} onClick={() => { setType('expense'); setCatId(c.id); }}
              className={catId === c.id ? 'btn-primary !px-3 !py-1 text-sm' : 'btn-ghost !px-3 !py-1 text-sm'}>
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={manual} className="card mb-4 space-y-2">
        <div className="flex gap-2">
          <button type="button" onClick={() => setType('expense')} className={type === 'expense' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}>Расход</button>
          <button type="button" onClick={() => setType('income')} className={type === 'income' ? 'btn-primary flex-1' : 'btn-ghost flex-1'}>Доход</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input num" type="number" inputMode="decimal" placeholder="Сумма" value={amount} onChange={e => setAmount(e.target.value)} required />
          <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={catId} onChange={e => setCatId(e.target.value)}>
            <option value="">— категория —</option>
            {state.categories.filter(c => c.type === type).map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
          <select className="input" value={by} onChange={e => setBy(e.target.value)}>
            {state.settings.users.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <input className="input" placeholder="комментарий" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn-primary w-full">Сохранить</button>
      </form>

      <div className="card">
        {list.length === 0 && <p className="text-sm text-muted">Пока нет операций</p>}
        <ul className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
          {list.map(t => {
            const c = state.categories.find(x => x.id === t.categoryId);
            return (
              <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{c?.icon || '•'} {c?.name || t.note || 'Операция'}</p>
                  <p className="truncate text-xs text-muted">{t.date} · {t.paidBy}{t.note ? ' · ' + t.note : ''}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`num text-sm ${t.type === 'income' ? 'text-accent' : 'text-ink'}`}>{t.type === 'income' ? '+' : '−'}{fmt(t.amount)}</span>
                  <button onClick={() => delTx(t.id)} className="text-xs text-muted">✕</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Categories() {
  const { state, setCats, setGoals } = useFin();
  const [name, setName] = useState(''); const [icon, setIcon] = useState(''); const [type, setType] = useState('expense');

  function add(e) {
    e.preventDefault(); if (!name.trim()) return;
    const id = name.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString(36);
    setCats(l => [...l, { id, name: name.trim(), type, icon: icon || (type === 'income' ? '💰' : '🛒') }]);
    setName(''); setIcon('');
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Категории и лимиты</h1>
      <form onSubmit={add} className="card mb-4 space-y-2">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input className="input" placeholder="Название" value={name} onChange={e => setName(e.target.value)} required />
          <input className="input w-14 text-center" placeholder="🍜" value={icon} onChange={e => setIcon(e.target.value)} />
          <select className="input w-24" value={type} onChange={e => setType(e.target.value)}>
            <option value="expense">Расход</option><option value="income">Доход</option>
          </select>
        </div>
        <button className="btn-primary w-full">+ Добавить</button>
      </form>

      {['expense', 'income'].map(t => (
        <div key={t} className="card mb-3">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">{t === 'expense' ? 'Расходы' : 'Доходы'}</p>
          <ul className="space-y-2">
            {state.categories.filter(c => c.type === t).map(c => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="w-6 text-center">{c.icon}</span>
                <span className="flex-1 truncate text-sm">{c.name}</span>
                {t === 'expense' && (
                  <input className="input num w-24 !py-1 text-right text-sm" type="number" placeholder="лимит"
                    value={state.goals[c.id] || ''} onChange={e => setGoals(g => ({ ...g, [c.id]: Number(e.target.value) || 0 }))} />
                )}
                <button onClick={() => setCats(l => l.filter(x => x.id !== c.id))} className="text-xs text-muted">✕</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Analytics() {
  const { state, month } = useFin();
  const data = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const prev = monthKey(new Date(y, m - 2, 1));
    const cur = state.transactions.filter(t => isInMonth(t.date, month));
    const p = state.transactions.filter(t => isInMonth(t.date, prev));
    const curI = sumBy(cur, 'income'), curE = sumBy(cur, 'expense');
    const preI = sumBy(p, 'income'), preE = sumBy(p, 'expense');
    const byCat = {}, byUser = {};
    cur.filter(t => t.type === 'expense').forEach(t => {
      byCat[t.categoryId || 'none'] = (byCat[t.categoryId || 'none'] || 0) + Number(t.amount);
      byUser[t.paidBy || '—'] = (byUser[t.paidBy || '—'] || 0) + Number(t.amount);
    });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([id, amt]) => {
      const c = state.categories.find(x => x.id === id);
      return { id, amt, name: c?.name || '—', icon: c?.icon || '•' };
    });
    const diff = preE > 0 ? Math.round(((curE - preE) / preE) * 100) : null;
    return { curI, curE, preI, preE, top, byUser, diff };
  }, [state.transactions, state.categories, month]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Аналитика</h1>

      <div className="card mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Инсайты</p>
        <ul className="space-y-2 text-sm">
          {data.diff !== null && (
            <li>{data.diff <= 0 ? `🎉 Потратили на ${Math.abs(data.diff)}% меньше прошлого месяца` : `⚠️ Расходы выросли на ${data.diff}%`}</li>
          )}
          {data.top[0] && <li>💸 Больше всего: {data.top[0].icon} {data.top[0].name} — {fmt(data.top[0].amt)}</li>}
          {data.curI > data.curE && <li>💚 В плюсе на {fmt(data.curI - data.curE)}</li>}
        </ul>
      </div>

      {data.top.length > 0 && (
        <div className="card mb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">По категориям</p>
          <ul className="space-y-2">
            {data.top.slice(0, 6).map(c => {
              const pct = Math.round((c.amt / (data.curE || 1)) * 100);
              return (
                <li key={c.id}>
                  <div className="mb-1 flex justify-between text-sm"><span>{c.icon} {c.name}</span>
                    <span className="num text-muted">{fmt(c.amt)} · {pct}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full" style={{ width: `${pct}%`, background: 'rgb(var(--c-accent))' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {Object.keys(data.byUser).length > 1 && (
        <div className="card mb-4">
          <p className="mb-2 text-xs uppercase tracking-wider text-muted">Кто больше тратит</p>
          <ul className="space-y-2">
            {Object.entries(data.byUser).sort((a, b) => b[1] - a[1]).map(([u, a]) => {
              const pct = Math.round((a / (Object.values(data.byUser).reduce((s, v) => s + v, 0) || 1)) * 100);
              return (
                <li key={u}>
                  <div className="mb-1 flex justify-between text-sm"><span>{u}</span>
                    <span className="num text-muted">{fmt(a)} · {pct}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                    <div className="h-full" style={{ width: `${pct}%`, background: 'rgb(var(--c-accent))' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Settings() {
  const { state, setSet, setRec } = useFin();
  const [start, setStart] = useState(String(state.settings.startingSavings || 0));
  const [rT, setRT] = useState(''); const [rA, setRA] = useState(''); const [rD, setRD] = useState('1');
  const [msg, setMsg] = useState('');
  const fileRef = useRef();

  function exportAll() {
    const dump = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) dump[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
    }
    const blob = new Blob([JSON.stringify({ app: 'finance-duo', data: dump }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  async function importAll(e) {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      Object.entries(j.data || {}).forEach(([k, v]) => localStorage.setItem(PREFIX + k, JSON.stringify(v)));
      setMsg('Импортировано. Перезагрузка...');
      setTimeout(() => location.reload(), 800);
    } catch (err) { setMsg('Ошибка: ' + err.message); }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Настройки</h1>
      {msg && <div className="card mb-3 text-sm text-accent">{msg}</div>}

      <div className="card mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Стартовые накопления</p>
        <div className="flex gap-2">
          <input className="input num" type="number" value={start} onChange={e => setStart(e.target.value)} />
          <button onClick={() => { setSet(s => ({ ...s, startingSavings: Number(start) || 0 })); setMsg('✓'); setTimeout(() => setMsg(''), 1500); }}
            className="btn-primary shrink-0">OK</button>
        </div>
      </div>

      <div className="card mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Регулярные платежи</p>
        {state.recurring.length > 0 && (
          <ul className="mb-3 space-y-1">
            {state.recurring.map(r => (
              <li key={r.id} className="flex justify-between text-sm">
                <span>{r.title} · {r.day}-го</span>
                <div className="flex gap-2"><span className="num text-muted">{fmt(r.amount)}</span>
                  <button onClick={() => setRec(l => l.filter(x => x.id !== r.id))} className="text-xs text-muted">✕</button></div>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={e => { e.preventDefault(); if (!rT.trim() || !Number(rA)) return;
          setRec(l => [...l, { id: crypto.randomUUID(), title: rT.trim(), amount: Number(rA), day: Number(rD) || 1, type: 'expense', lastPaid: null }]);
          setRT(''); setRA(''); }} className="space-y-2">
          <input className="input" placeholder="Netflix" value={rT} onChange={e => setRT(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input num" type="number" placeholder="Сумма" value={rA} onChange={e => setRA(e.target.value)} />
            <input className="input num" type="number" placeholder="День" value={rD} onChange={e => setRD(e.target.value)} />
          </div>
          <button className="btn-ghost w-full">+ Добавить</button>
        </form>
      </div>

      <div className="card mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Участники</p>
        {state.settings.users.map((u, i) => (
          <input key={i} className="input mb-2" value={u}
            onChange={e => setSet(s => ({ ...s, users: s.users.map((x, j) => j === i ? e.target.value : x) }))} />
        ))}
      </div>

      <div className="card mb-4">
        <p className="mb-2 text-xs uppercase tracking-wider text-muted">Бэкап</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={exportAll} className="btn-ghost">⬇ Скачать</button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost">⬆ Загрузить</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={importAll} />
        </div>
      </div>

      <button onClick={() => { if (confirm('Удалить все данные?')) {
        Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
        location.reload();
      }}} className="w-full rounded-xl2 border border-red-500/40 py-2 text-sm text-red-400">
        Удалить все данные
      </button>
    </div>
  );
}

const TABS = [
  { id: 'dashboard', label: 'Битва', icon: '⚔️' },
  { id: 'tx', label: 'Операции', icon: '💸' },
  { id: 'cats', label: 'Категории', icon: '🏷️' },
  { id: 'an', label: 'Аналитика', icon: '📊' },
  { id: 'set', label: 'Настройки', icon: '⚙️' }
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  return (
    <Provider>
      <div className="min-h-screen bg-surface text-ink">
        <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
          {tab === 'dashboard' && <Dashboard setTab={setTab} />}
          {tab === 'tx' && <Transactions />}
          {tab === 'cats' && <Categories />}
          {tab === 'an' && <Analytics />}
          {tab === 'set' && <Settings />}
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md"
          style={{ background: 'rgba(var(--c-surface),.85)', borderColor: 'var(--c-border)' }}>
          <div className="mx-auto flex max-w-3xl justify-around pb-[env(safe-area-inset-bottom)] pt-2">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
                style={{ color: tab === t.id ? 'rgb(var(--c-accent))' : 'rgb(var(--c-muted))' }}>
                <span className="text-lg">{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </Provider>
  );
}
