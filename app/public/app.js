/* MediCore HMS – single-page front-end (vanilla JS, no build step) */
'use strict';

// ---------------------------------------------------------------- utilities
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
const fmtDate = d => d ? new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const time12 = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
const fmtDT = s => s ? `${fmtDate(s)}, ${time12(s.slice(11, 16))}` : '';
const age = dob => { if (!dob) return ''; const b = new Date(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };
const initials = n => String(n || '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const badge = s => `<span class="badge b-${esc(String(s).toLowerCase())}">${esc(s)}</span>`;
const monthLabel = m => new Date(m + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  bill: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  staff: '<path d="M5 3v6a5 5 0 0 0 10 0V3"/><path d="M10 14v2a5 5 0 0 0 10 0v-3"/><circle cx="20" cy="11" r="2"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-6M13 17V7M18 17v-4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  rupee: '<path d="M6 4h12M6 9h12M9 4c6 0 6 10 0 10H6l8 7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4v-7h16v7h-2M7 14h10v7H7z"/>',
  alert: '<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  heart: '<path d="M20.8 5.6a5.5 5.5 0 0 0-8.8-1.3 5.5 5.5 0 0 0-8.8 6.5L12 21l8.8-10.2a5.5 5.5 0 0 0 0-5.2z"/>',
};
const icon = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;
const brandMark = '<span class="brand-mark"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z" fill="#fff"/></svg></span>';

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && path !== '/login') { state.user = null; renderLogin(); throw new Error(data.error || 'Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type === 'err' ? 'err' : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

const state = { user: null, unread: 0, doctors: null, departments: null, cache: {} };
const cacheRows = (kind, rows) => { const m = (state.cache[kind] ||= {}); rows.forEach(r => { m[r.id] = r; }); return rows; };
const role = () => state.user?.role;
const is = (...roles) => roles.includes(role());

async function doctors(force) { if (!state.doctors || force) state.doctors = await api('/doctors'); return state.doctors; }
async function departments(force) { if (!state.departments || force) state.departments = await api('/departments'); return state.departments; }

// ---------------------------------------------------------------- form helpers
function options(list, value) {
  return list.map(op => {
    const [v, l] = Array.isArray(op) ? op : [op, op];
    return `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(l)}</option>`;
  }).join('');
}
function fld(label, name, o = {}) {
  const id = 'f_' + name;
  const val = o.value ?? '';
  let input;
  if (o.options) input = `<select class="input" name="${name}" id="${id}" ${o.attrs || ''}>${options(o.options, val)}</select>`;
  else if (o.type === 'textarea') input = `<textarea class="input" name="${name}" id="${id}" rows="${o.rows || 2}" placeholder="${esc(o.ph || '')}" ${o.attrs || ''}>${esc(val)}</textarea>`;
  else input = `<input class="input" type="${o.type || 'text'}" name="${name}" id="${id}" value="${esc(val)}" placeholder="${esc(o.ph || '')}" ${o.attrs || ''}>`;
  return `<div class="field ${o.full ? 'full' : ''}" ${o.wrap || ''}><label class="f ${o.req ? 'req' : ''}" for="${id}">${esc(label)}</label>${input}</div>`;
}
function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return o;
}

function openModal({ title, body, submitText = 'Save', onSubmit, wide, onOpen, footer }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  const foot = footer ?? (onSubmit
    ? `<button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary">${esc(submitText)}</button>`
    : '<button type="button" class="btn" data-close>Close</button>');
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <form class="modal-body" novalidate><div class="form-error"></div>${body}<div class="modal-foot">${foot}</div></form></div>`;
  document.body.appendChild(wrap);
  const form = $('form', wrap);
  const errBox = $('.form-error', wrap);
  const onKey = e => { if (e.key === 'Escape') close(); };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = $('[type=submit]', form);
    btn.disabled = true;
    errBox.classList.remove('show');
    try { await onSubmit(formData(form), form); close(); }
    catch (err) { errBox.textContent = err.message; errBox.classList.add('show'); wrap.scrollTop = 0; }
    finally { btn.disabled = false; }
  });
  onOpen && onOpen(form, wrap);
  setTimeout(() => $('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea', form)?.focus(), 60);
  return { wrap, form, close };
}

function confirmBox(title, message, okText = 'Confirm', danger = false) {
  return new Promise(resolve => {
    let ok = false;
    const m = openModal({
      title, body: `<p style="margin:0 0 18px;line-height:1.5">${esc(message)}</p>`,
      footer: `<button type="button" class="btn" data-close>Back</button><button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(okText)}</button>`,
      onSubmit: async () => { ok = true; },
    });
    new MutationObserver((_, obs) => { if (!document.body.contains(m.wrap)) { obs.disconnect(); resolve(ok); } }).observe(document.body, { childList: true });
  });
}

const btn = (label, act, id, cls = '') => `<button type="button" class="btn sm ${cls}" data-act="${act}" data-id="${esc(id)}">${esc(label)}</button>`;
const statCard = (ic, tone, val, lbl) => `<div class="card stat"><div class="ic t-${tone}">${icon(ic)}</div><div><div class="val">${val}</div><div class="lbl">${esc(lbl)}</div></div></div>`;
const empty = msg => `<div class="empty">${esc(msg)}</div>`;

function barList(rows, fmt = x => x) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return empty('No data');
  return `<div class="bars">${rows.map(r => `<div class="bar-row"><span class="nowrap" title="${esc(r.label)}">${esc(r.label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${(r.value / max) * 100}%"></div></div><span class="num strong">${esc(fmt(r.value))}</span></div>`).join('')}</div>`;
}
function colChart(rows, fmt = x => x) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return empty('No data for this period');
  return `<div class="cols">${rows.map(r => `<div class="col" title="${esc(r.label)}: ${esc(fmt(r.value))}">
    <div class="bar" style="height:${Math.max(1, (r.value / max) * 82)}%"><span>${rows.length <= 8 ? esc(fmt(r.value)) : ''}</span></div><div class="lab">${esc(r.label)}</div></div>`).join('')}</div>`;
}

// ---------------------------------------------------------------- navigation
const NAV = {
  admin: [['dashboard', 'Dashboard', 'home'], ['patients', 'Patients', 'users'], ['appointments', 'Appointments', 'calendar'], ['records', 'Medical Records', 'file'], ['billing', 'Billing', 'bill'], ['staff', 'Staff & Doctors', 'staff'], ['reports', 'Reports', 'chart'], ['notifications', 'Notifications', 'bell']],
  receptionist: [['dashboard', 'Dashboard', 'home'], ['patients', 'Patients', 'users'], ['appointments', 'Appointments', 'calendar'], ['billing', 'Billing', 'bill'], ['notifications', 'Notifications', 'bell']],
  doctor: [['dashboard', 'Dashboard', 'home'], ['appointments', 'My Appointments', 'calendar'], ['patients', 'Patients', 'users'], ['records', 'Medical Records', 'file'], ['notifications', 'Notifications', 'bell']],
  accountant: [['dashboard', 'Dashboard', 'home'], ['billing', 'Billing', 'bill'], ['patients', 'Patients', 'users'], ['reports', 'Reports', 'chart'], ['notifications', 'Notifications', 'bell']],
  patient: [['dashboard', 'Dashboard', 'home'], ['appointments', 'My Appointments', 'calendar'], ['records', 'My Records', 'file'], ['billing', 'My Bills', 'bill'], ['profile', 'My Profile', 'user'], ['notifications', 'Notifications', 'bell']],
};
const PAGES = {
  dashboard: pageDashboard, patients: pagePatients, appointments: pageAppointments, records: pageRecords, billing: pageBilling,
  staff: pageStaff, reports: pageReports, notifications: pageNotifications, account: pageAccount, profile: () => pagePatient(state.user.patient_id),
};

function setTitle(t) { $('#pageTitle').textContent = t; document.title = `${t} · MediCore HMS`; }
const content = html => { $('#content').innerHTML = html; };
const refresh = () => route();

async function route() {
  if (!state.user) return;
  const [page = 'dashboard', arg] = location.hash.replace(/^#\/?/, '').split('/');
  const allowed = NAV[role()].map(n => n[0]).concat('account');
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page || (page === 'patients' && arg && a.dataset.page === 'profile' && role() === 'patient')));
  $('#sidebar').classList.remove('open');
  const ownProfile = page === 'patients' && role() === 'patient' && Number(arg) === state.user.patient_id;
  if (!allowed.includes(page) && !ownProfile) {
    setTitle('Access denied');
    return content(`<div class="card"><div class="empty">${icon('alert')}<h3 style="margin:8px 0">You don't have permission to view this page</h3><p>Your role (<b>${esc(role())}</b>) is not authorised for this module.</p><a class="btn" href="#/dashboard">Back to dashboard</a></div></div>`);
  }
  content('<div class="loading">Loading…</div>');
  try {
    if (page === 'patients' && arg) await pagePatient(Number(arg));
    else await (PAGES[page] || pageDashboard)();
  } catch (err) {
    if (state.user) content(`<div class="card">${empty('Error: ' + err.message)}</div>`);
  }
}

// global delegated actions (buttons with data-act, rows with data-href)
const ACTIONS = {
  'appt-reschedule': id => rescheduleModal(state.cache.appt[id]),
  'appt-cancel': async id => {
    const a = state.cache.appt[id];
    if (!await confirmBox('Cancel appointment', `Cancel ${a.patient_name}'s appointment with ${a.doctor_name} on ${fmtDate(a.date)} at ${time12(a.time)}?`, 'Cancel appointment', true)) return;
    try { await api(`/appointments/${id}`, { method: 'PUT', body: { action: 'cancel' } }); toast('Appointment cancelled'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'appt-complete': async id => {
    try { await api(`/appointments/${id}`, { method: 'PUT', body: { action: 'complete' } }); toast('Marked as completed'); refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'appt-consult': id => { const a = state.cache.appt[id]; recordForm({ patientId: a.patient_id, appointmentId: a.id }); },
  'appt-book': id => bookAppointment({ patientId: id ? Number(id) : null }),
  'rec-view': id => viewRecord(state.cache.rec[id]),
  'rec-view-id': async id => { try { viewRecord(await api(`/records/${id}`)); } catch (e) { toast(e.message, 'err'); } },
  'rec-edit': id => recordForm({ record: state.cache.rec[id] }),
  'rec-add': id => recordForm({ patientId: id ? Number(id) : null }),
  'bill-view': id => invoiceModal(id),
  'bill-pay': id => payModal(state.cache.bill[id]),
  'bill-new': id => billForm({ patientId: id ? Number(id) : null }),
  'bill-from-appt': id => { const a = state.cache.appt[id]; billForm({ patientId: a.patient_id, appointmentId: a.id }); },
  'patient-new': () => patientForm(),
  'patient-edit': id => patientForm(state.cache.patient[id]),
  'staff-new': () => staffForm(),
  'staff-edit': id => staffForm(state.cache.staff[id]),
  'staff-toggle': async id => {
    const s = state.cache.staff[id];
    if (!await confirmBox(s.active ? 'Deactivate account' : 'Activate account', `${s.active ? 'Deactivate' : 'Activate'} ${s.name}'s account?${s.active ? ' They will be logged out and unable to sign in.' : ''}`, s.active ? 'Deactivate' : 'Activate', !!s.active)) return;
    try { await api(`/staff/${id}`, { method: 'PUT', body: { active: !s.active } }); toast('Account updated'); state.doctors = null; refresh(); } catch (e) { toast(e.message, 'err'); }
  },
  'dept-new': () => deptForm(),
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (b) { e.preventDefault(); return ACTIONS[b.dataset.act]?.(b.dataset.id, b); }
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a,button,input,select')) location.hash = row.dataset.href;
});

// ---------------------------------------------------------------- login & shell
const DEMO = [
  ['admin', 'admin123', 'Administrator', 'Anita Verma'],
  ['reception', 'reception123', 'Receptionist', 'Rohit Mehra'],
  ['doctor', 'doctor123', 'Doctor', 'Dr. Arjun Sharma'],
  ['accounts', 'accounts123', 'Accountant', 'Vikram Bansal'],
  ['patient', 'patient123', 'Patient', 'Rahul Gupta'],
];

function renderLogin() {
  clearInterval(state.poll);
  document.title = 'Sign in · MediCore HMS';
  $('#app').innerHTML = `<div class="login">
    <section class="login-hero">
      <div class="brand">${brandMark} MediCore HMS</div>
      <div>
        <h1>Hospital Management,<br>in one place.</h1>
        <p>A centralised platform for patient registration, appointments, medical records, billing, notifications and reports — with role-based access for every member of the hospital team.</p>
        <ul class="hero-list"><li>Patient registration</li><li>Appointment scheduling</li><li>Electronic medical records</li><li>Billing & payments</li><li>Role-based access</li><li>Reports & notifications</li></ul>
      </div>
      <small style="color:#9fc3ca">Software Engineering Lab Project · Hospital Management System</small>
    </section>
    <section class="login-form-wrap"><div class="login-card">
      <h2>Welcome back</h2><div class="sub">Sign in to continue to your workspace</div>
      <form id="loginForm" novalidate>
        <div class="form-error" id="loginErr"></div>
        ${fld('Username', 'username', { attrs: 'autocomplete="username" autofocus' })}
        ${fld('Password', 'password', { type: 'password', attrs: 'autocomplete="current-password"' })}
        <button class="btn primary block" type="submit">Sign in</button>
      </form>
      <div class="demo"><h4>Demo accounts — click to sign in</h4><div class="demo-grid">
        ${DEMO.map(([u, , r, n]) => `<button class="demo-btn" type="button" data-user="${u}"><b>${esc(r)}</b><span>${esc(n)}</span></button>`).join('')}
      </div></div>
    </div></section></div>`;
  const form = $('#loginForm');
  const doLogin = async (username, password) => {
    const err = $('#loginErr');
    err.classList.remove('show');
    try {
      const { user } = await api('/login', { method: 'POST', body: { username, password } });
      state.user = user;
      if (!location.hash || location.hash === '#/') location.hash = '#/dashboard';
      renderShell();
    } catch (e) { err.textContent = e.message; err.classList.add('show'); }
  };
  form.addEventListener('submit', e => { e.preventDefault(); const d = formData(form); doLogin(d.username, d.password); });
  document.querySelectorAll('.demo-btn').forEach(b => b.addEventListener('click', () => {
    const [u, p] = DEMO.find(d => d[0] === b.dataset.user);
    form.username.value = u; form.password.value = p;
    doLogin(u, p);
  }));
}

function renderShell() {
  const u = state.user;
  state.cache = {}; state.doctors = null; state.departments = null;
  $('#app').innerHTML = `<div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="brand">${brandMark} MediCore HMS</div>
      <nav class="nav" id="nav">${NAV[u.role].map(([p, l, i]) => `<a href="#/${p}" data-page="${p}">${icon(i)}<span>${esc(l)}</span>${p === 'notifications' ? '<span class="count" id="navCount" hidden></span>' : ''}</a>`).join('')}</nav>
      <div class="side-foot">Signed in as <b style="color:#fff;text-transform:capitalize">${esc(u.role)}</b><br>MediCore HMS v1.0</div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${icon('menu')}</button>
        <h1 id="pageTitle"></h1><div class="spacer"></div>
        <div style="position:relative"><button class="icon-btn" id="bellBtn" aria-label="Notifications">${icon('bell')}<span class="dot" id="bellDot" hidden></span></button><div id="bellDrop"></div></div>
        <a class="user-chip" href="#/account" title="My account"><div class="avatar">${esc(initials(u.name))}</div><div class="meta"><b style="color:var(--text)">${esc(u.name)}</b><br><small>${esc(u.role === 'doctor' ? u.specialization || 'doctor' : u.role)}</small></div></a>
        <button class="icon-btn" id="logoutBtn" title="Log out" aria-label="Log out">${icon('logout')}</button>
      </header>
      <main class="content" id="content"></main>
    </div></div>`;
  $('#menuBtn').onclick = () => $('#sidebar').classList.toggle('open');
  $('#logoutBtn').onclick = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); state.user = null; location.hash = ''; renderLogin(); };
  $('#bellBtn').onclick = toggleBell;
  document.addEventListener('click', e => { if (!e.target.closest('#bellDrop') && !e.target.closest('#bellBtn')) $('#bellDrop') && ($('#bellDrop').innerHTML = ''); });
  pollNotifications();
  clearInterval(state.poll);
  state.poll = setInterval(pollNotifications, 15000);
  route();
}

async function pollNotifications() {
  if (!state.user) return;
  try {
    const { unread, items } = await api('/notifications');
    if (unread > state.unread && state.notifSeen !== undefined) toast(`🔔 ${items[0]?.title}: ${items[0]?.message}`);
    state.unread = unread; state.notifSeen = true; state.notifItems = items;
    const dot = $('#bellDot'), nc = $('#navCount');
    if (dot) { dot.hidden = !unread; dot.textContent = unread > 9 ? '9+' : unread; }
    if (nc) { nc.hidden = !unread; nc.textContent = unread; }
  } catch { /* ignore */ }
}

function notifHtml(n) {
  return `<div class="notif ${n.is_read ? '' : 'unread'}"><div class="ic">${icon('bell')}</div><div style="flex:1"><div class="strong">${esc(n.title)}</div>
    <div style="margin:2px 0 4px">${esc(n.message)}</div><div class="small muted">${esc(fmtDT(n.created_at))}</div></div></div>`;
}
function toggleBell() {
  const d = $('#bellDrop');
  if (d.innerHTML) { d.innerHTML = ''; return; }
  const items = (state.notifItems || []).slice(0, 6);
  d.innerHTML = `<div class="card dropdown"><div class="card-head"><h3>Notifications</h3><button class="btn sm" id="markAll">Mark all read</button></div>
    ${items.length ? items.map(notifHtml).join('') : empty('No notifications')}<div style="padding:10px 18px;text-align:center"><a href="#/notifications">View all</a></div></div>`;
  $('#markAll').onclick = async () => { await api('/notifications/read', { method: 'POST', body: {} }); d.innerHTML = ''; await pollNotifications(); if (location.hash.includes('notifications')) refresh(); };
  d.querySelector('a').onclick = () => { d.innerHTML = ''; };
}

// ---------------------------------------------------------------- shared renderers
function apptActions(a) {
  let h = '';
  if (a.status === 'Scheduled') {
    if (is('doctor')) h += btn('Consult', 'appt-consult', a.id, 'primary');
    if (is('admin')) h += btn('Complete', 'appt-complete', a.id);
    if (is('admin', 'receptionist', 'patient')) h += btn('Reschedule', 'appt-reschedule', a.id);
    h += btn('Cancel', 'appt-cancel', a.id, 'danger');
  } else if (a.status === 'Completed') {
    if (a.record_id && is('admin', 'doctor', 'patient')) h += btn('Record', 'rec-view-id', a.record_id);
    if (a.bill_id && is('admin', 'accountant', 'receptionist', 'patient')) h += btn('Invoice', 'bill-view', a.bill_id);
    else if (!a.bill_id && is('admin', 'accountant')) h += btn('Create bill', 'bill-from-appt', a.id, 'primary');
  }
  return h;
}

function apptTable(list, { patient = true, doctor = true } = {}) {
  cacheRows('appt', list);
  if (!list.length) return empty('No appointments found');
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Date & time</th>${patient ? '<th>Patient</th>' : ''}${doctor ? '<th>Doctor</th>' : ''}<th>Reason</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(a => `<tr>
    <td class="nowrap"><div class="strong">${esc(fmtDate(a.date))}</div><div class="small muted">${esc(time12(a.time))}</div></td>
    ${patient ? `<td><a href="#/patients/${a.patient_id}" class="strong">${esc(a.patient_name)}</a><div class="small muted">${esc(a.patient_uid)} · ${esc(a.patient_phone)}</div></td>` : ''}
    ${doctor ? `<td>${esc(a.doctor_name)}<div class="small muted">${esc(a.department || '')}</div></td>` : ''}
    <td>${esc(a.reason || '—')}</td><td>${badge(a.status)}</td><td><div class="actions">${apptActions(a)}</div></td></tr>`).join('')}
  </tbody></table></div>`;
}

function apptListItems(list, { showDoctor = true } = {}) {
  cacheRows('appt', list);
  if (!list.length) return empty('No appointments');
  return list.map(a => `<div class="list-item"><div class="time-pill">${esc(time12(a.time))}</div>
    <div style="flex:1;min-width:0"><a class="strong" href="#/patients/${a.patient_id}">${esc(a.patient_name)}</a> <span class="small muted">${esc(a.patient_uid)}</span>
    <div class="small muted">${showDoctor ? esc(a.doctor_name) + ' · ' : ''}${esc(a.reason || a.department || '')}</div></div>
    ${badge(a.status)}<div class="actions" style="display:flex;gap:6px">${a.status === 'Scheduled' && is('doctor') ? btn('Consult', 'appt-consult', a.id, 'primary') : ''}</div></div>`).join('');
}

function billTable(list, { patient = true } = {}) {
  cacheRows('bill', list);
  if (!list.length) return empty('No bills found');
  return `<div class="table-wrap"><table class="tbl"><thead><tr><th>Bill no.</th><th>Date</th>${patient ? '<th>Patient</th>' : ''}<th>Doctor</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(b => `<tr><td class="strong nowrap">${esc(b.bill_no)}</td><td class="nowrap">${esc(fmtDate(b.created_at))}</td>
    ${patient ? `<td><a href="#/patients/${b.patient_id}">${esc(b.patient_name)}</a><div class="small muted">${esc(b.patient_uid)}</div></td>` : ''}
    <td>${esc(b.doctor_name || '—')}</td><td class="num strong">${money(b.total)}</td>
    <td>${badge(b.status)}${b.payment_method ? `<div class="small muted">${esc(b.payment_method)}</div>` : ''}</td>
    <td><div class="actions">${btn('View', 'bill-view', b.id)}${b.status === 'Unpaid' && is('admin', 'accountant') ? btn('Record payment', 'bill-pay', b.id, 'primary') : ''}</div></td></tr>`).join('')}
  </tbody></table></div>`;
}

function recordCard(r) {
  const canEdit = is('doctor') && r.doctor_id === state.user.id;
  return `<div class="record"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
    <div><h4>${esc(r.diagnosis)}</h4><div class="small muted">${esc(fmtDate(r.visit_date))} · ${esc(r.doctor_name)} · ${esc(r.department || '')}</div></div>
    <div style="display:flex;gap:6px">${canEdit ? btn('Edit', 'rec-edit', r.id) : ''}</div></div>
    <dl>${r.symptoms ? `<dt>Symptoms</dt><dd>${esc(r.symptoms)}</dd>` : ''}${r.treatment ? `<dt>Treatment</dt><dd>${esc(r.treatment)}</dd>` : ''}
    ${r.prescription ? `<dt>Prescription</dt><dd>${esc(r.prescription)}</dd>` : ''}${r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : ''}</dl></div>`;
}

// ---------------------------------------------------------------- dashboard
async function pageDashboard() {
  setTitle('Dashboard');
  const d = await api('/dashboard');
  const u = state.user;
  const greet = `<div style="margin-bottom:18px"><h2 style="font-size:21px">Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${esc(u.name.split(' ').slice(0, u.role === 'doctor' ? 2 : 1).join(' '))}</h2>
    <div class="muted">${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div></div>`;

  if (u.role === 'patient') {
    cacheRows('rec', d.records);
    return content(`${greet}
      <div class="stats">${statCard('calendar', 'blue', d.upcoming.length, 'Upcoming appointments')}${statCard('heart', 'green', d.visits, 'Completed visits')}
      ${statCard('rupee', d.dues.n ? 'amber' : 'teal', money0(d.dues.amount), `Outstanding (${d.dues.n} bill${d.dues.n === 1 ? '' : 's'})`)}</div>
      <div class="grid g2">
        <div class="card"><div class="card-head"><h3>Upcoming appointments</h3><button class="btn sm primary" data-act="appt-book">${icon('plus')} Book appointment</button></div>${apptTable(d.upcoming, { patient: false })}</div>
        <div class="card"><div class="card-head"><h3>Recent medical records</h3><a href="#/records" class="small">View all</a></div><div class="card-body">${d.records.length ? d.records.map(recordCard).join('') : empty('No records yet')}</div></div>
      </div>`);
  }

  const s = d.stats;
  let stats = '';
  if (u.role === 'admin') stats = statCard('users', 'teal', s.patients, `Patients (+${s.newPatients} in 30 days)`) + statCard('calendar', 'blue', s.todayTotal, `Today's appointments (${s.todayPending} pending)`) + statCard('staff', 'green', s.doctors, `Active doctors · ${s.staff} staff`) + statCard('rupee', 'green', money0(s.revenueMonth), 'Revenue (last 30 days)') + statCard('alert', 'amber', money0(s.pendingAmount), `Pending dues (${s.pendingBills} bills)`);
  if (u.role === 'receptionist') stats = statCard('users', 'teal', s.patients, 'Registered patients') + statCard('calendar', 'blue', s.todayTotal, "Today's appointments") + statCard('clock', 'amber', s.todayPending, 'Waiting / pending today') + statCard('calendar', 'green', s.upcoming, 'Upcoming (future days)');
  if (u.role === 'doctor') stats = statCard('calendar', 'blue', s.todayTotal, "Today's appointments") + statCard('clock', 'amber', s.todayPending, 'Pending consultations') + statCard('calendar', 'teal', s.upcoming, 'Upcoming appointments') + statCard('users', 'green', s.seen, 'Patients treated') + statCard('file', 'teal', s.recordsMonth, 'Records this month');
  if (u.role === 'accountant') stats = statCard('rupee', 'green', money0(s.revenueToday), 'Collected today') + statCard('chart', 'teal', money0(s.revenueMonth), 'Revenue (last 30 days)') + statCard('alert', 'amber', money0(s.pendingAmount), `Outstanding (${s.pendingBills} bills)`) + statCard('file', 'blue', s.unbilled, 'Consultations awaiting bill');

  const todayCard = `<div class="card"><div class="card-head"><h3>${u.role === 'doctor' ? 'My schedule today' : "Today's appointments"}</h3>
    ${is('admin', 'receptionist') ? `<button class="btn sm primary" data-act="appt-book">${icon('plus')} Book</button>` : `<a class="small" href="#/appointments">View all</a>`}</div>
    ${apptListItems(d.todayAppointments, { showDoctor: u.role !== 'doctor' })}</div>`;

  let revenue = '';
  if (d.revenueByDay) {
    const map = Object.fromEntries(d.revenueByDay.map(r => [r.day, r.amount]));
    const rows = [];
    for (let i = 13; i >= 0; i--) { const x = new Date(); x.setDate(x.getDate() - i); const k = `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; rows.push({ label: x.getDate() + '/' + (x.getMonth() + 1), value: map[k] || 0 }); }
    revenue = `<div class="card"><div class="card-head"><h3>Collections – last 14 days</h3><span class="small muted">${money0(rows.reduce((a, r) => a + r.value, 0))} total</span></div><div class="card-body">${colChart(rows, money0)}</div></div>`;
  }
  let side = '';
  if (u.role === 'admin') side = `<div class="card"><div class="card-head"><h3>Appointments by department</h3><span class="small muted">Last 30 days</span></div><div class="card-body">${barList(d.byDepartment)}</div></div>`;
  if (u.role === 'receptionist') side = `<div class="card"><div class="card-head"><h3>Recently registered</h3><button class="btn sm" data-act="patient-new">${icon('plus')} Register</button></div>
    ${d.recentPatients.map(p => `<div class="list-item" data-href="#/patients/${p.id}" style="cursor:pointer"><div class="avatar">${esc(initials(p.name))}</div><div style="flex:1"><div class="strong">${esc(p.name)}</div><div class="small muted">${esc(p.uid)} · ${esc(p.gender)}, ${age(p.dob)} yrs</div></div><span class="small muted">${esc(fmtDate(p.created_at))}</span></div>`).join('')}</div>`;
  if (u.role === 'doctor') side = `<div class="card"><div class="card-head"><h3>Upcoming</h3></div>${d.upcomingList.length ? d.upcomingList.map(a => `<div class="list-item"><div><div class="strong">${esc(a.patient_name)}</div><div class="small muted">${esc(fmtDate(a.date))} · ${esc(time12(a.time))}</div></div></div>`).join('') : empty('No upcoming appointments')}</div>`;
  if (u.role === 'accountant') side = `<div class="card"><div class="card-head"><h3>Recent bills</h3><a class="small" href="#/billing">View all</a></div>${cacheRows('bill', d.recentBills).map(b => `<div class="list-item"><div style="flex:1"><div class="strong">${esc(b.bill_no)}</div><div class="small muted">${esc(b.patient_name)}</div></div><div class="strong">${money(b.total)}</div>${badge(b.status)}</div>`).join('')}</div>`;

  content(`${greet}<div class="stats">${stats}</div>
    <div class="grid g3">${u.role === 'accountant' ? revenue : todayCard}<div class="grid" style="align-content:start">${side}</div></div>
    ${u.role === 'admin' ? `<div style="margin-top:18px">${revenue}</div>` : ''}`);
}

// ---------------------------------------------------------------- patients
async function pagePatients() {
  setTitle('Patients');
  content(`<div class="toolbar"><div class="search grow">${icon('search')}<input class="input" id="pq" placeholder="Search by name, patient ID or phone…"></div>
    ${is('admin', 'receptionist') ? `<button class="btn primary" data-act="patient-new">${icon('plus')} Register patient</button>` : ''}</div>
    <div class="card" id="plist"><div class="loading">Loading…</div></div>`);
  const load = async () => {
    const list = cacheRows('patient', await api('/patients?q=' + encodeURIComponent($('#pq').value)));
    $('#plist').innerHTML = !list.length ? empty('No patients match your search') : `<div class="card-head"><h3>${list.length} patient${list.length === 1 ? '' : 's'}</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Patient</th><th>ID</th><th>Gender / Age</th><th>Phone</th><th>Blood</th><th>Last visit</th><th></th></tr></thead><tbody>
      ${list.map(p => `<tr data-href="#/patients/${p.id}" style="cursor:pointer"><td><div style="display:flex;gap:10px;align-items:center"><div class="avatar">${esc(initials(p.name))}</div><span class="strong">${esc(p.name)}</span></div></td>
      <td>${esc(p.uid)}</td><td>${esc(p.gender)}, ${age(p.dob)}</td><td>${esc(p.phone)}</td><td>${esc(p.blood_group || '—')}</td><td>${p.last_visit ? esc(fmtDate(p.last_visit)) : '<span class="muted">—</span>'}</td>
      <td><div class="actions"><a class="btn sm" href="#/patients/${p.id}">View</a>${is('admin', 'receptionist') ? btn('Edit', 'patient-edit', p.id) : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#pq').addEventListener('input', debounce(load));
  await load();
}

async function pagePatient(id) {
  const d = await api('/patients/' + id);
  const p = d.patient;
  cacheRows('patient', [p]);
  setTitle(role() === 'patient' ? 'My Profile' : p.name);
  const tabs = [['appts', `Appointments (${d.appointments.length})`]];
  if (d.records) tabs.push(['records', `Medical history (${d.records.length})`]);
  if (d.bills) tabs.push(['bills', `Bills (${d.bills.length})`]);
  if (d.records) cacheRows('rec', d.records);
  const unpaid = (d.bills || []).filter(b => b.status === 'Unpaid').reduce((s, b) => s + b.total, 0);
  content(`${role() !== 'patient' ? '<a href="#/patients" class="small">← All patients</a>' : ''}
    <div class="card" style="margin:10px 0 18px"><div class="card-body">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div class="profile"><div class="avatar">${esc(initials(p.name))}</div><div><h2 style="font-size:21px">${esc(p.name)}</h2><div class="muted">${esc(p.uid)} · ${esc(p.gender)} · ${age(p.dob)} years · Registered ${esc(fmtDate(p.created_at))}</div></div></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start">
          ${is('admin', 'receptionist') ? btn('Edit details', 'patient-edit', p.id) : ''}
          ${is('admin', 'receptionist') ? `<button class="btn sm primary" data-act="appt-book" data-id="${p.id}">${icon('plus')} Book appointment</button>` : ''}
          ${is('patient') ? `<button class="btn sm primary" data-act="appt-book">${icon('plus')} Book appointment</button>` : ''}
          ${is('doctor') ? `<button class="btn sm primary" data-act="rec-add" data-id="${p.id}">${icon('plus')} Add medical record</button>` : ''}
          ${is('admin', 'accountant') ? `<button class="btn sm primary" data-act="bill-new" data-id="${p.id}">${icon('plus')} Create bill</button>` : ''}
        </div></div>
      <div class="kv">
        <div><small>Date of birth</small>${esc(fmtDate(p.dob))}</div><div><small>Blood group</small>${esc(p.blood_group || '—')}</div>
        <div><small>Phone</small>${esc(p.phone)}</div><div><small>Email</small>${esc(p.email || '—')}</div>
        <div><small>Emergency contact</small>${esc(p.emergency_contact || '—')}</div><div><small>Allergies</small>${p.allergies && p.allergies !== 'None' ? `<span class="badge b-cancelled">${esc(p.allergies)}</span>` : esc(p.allergies || '—')}</div>
        <div><small>Address</small>${esc(p.address || '—')}</div>${d.bills ? `<div><small>Outstanding</small><span class="${unpaid ? 'strong' : ''}" style="color:${unpaid ? 'var(--warn)' : 'inherit'}">${money(unpaid)}</span></div>` : ''}
      </div></div></div>
    <div class="card"><div class="tabs">${tabs.map(([k, l], i) => `<button type="button" data-tab="${k}" class="${i ? '' : 'active'}">${esc(l)}</button>`).join('')}</div><div id="tabBody"></div></div>`);
  const show = k => {
    document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === k));
    $('#tabBody').innerHTML = k === 'appts' ? apptTable(d.appointments, { patient: false })
      : k === 'records' ? `<div class="card-body">${d.records.length ? d.records.map(recordCard).join('') : empty('No medical records yet')}</div>`
        : billTable(d.bills, { patient: false });
  };
  document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
  show('appts');
}

function patientForm(p) {
  const isNew = !p;
  p = p || {};
  openModal({
    title: isNew ? 'Register new patient' : `Edit ${p.name}`,
    submitText: isNew ? 'Register patient' : 'Save changes',
    wide: true,
    body: `<div class="form-grid">
      ${fld('Full name', 'name', { value: p.name, req: true, ph: 'e.g. Rahul Gupta' })}
      ${fld('Gender', 'gender', { value: p.gender, req: true, options: [['', 'Select…'], 'Male', 'Female', 'Other'] })}
      ${fld('Date of birth', 'dob', { type: 'date', value: p.dob, req: true, attrs: `max="${todayStr()}"` })}
      ${fld('Blood group', 'blood_group', { value: p.blood_group, options: [['', 'Unknown'], 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] })}
      ${fld('Phone', 'phone', { value: p.phone, req: true, ph: '10-digit mobile number', attrs: 'inputmode="numeric" maxlength="10"' })}
      ${fld('Email', 'email', { type: 'email', value: p.email, ph: 'optional' })}
      ${fld('Emergency contact', 'emergency_contact', { value: p.emergency_contact, ph: '10-digit number', attrs: 'inputmode="numeric" maxlength="10"' })}
      ${fld('Known allergies', 'allergies', { value: p.allergies, ph: 'e.g. Penicillin, or None' })}
      ${fld('Address', 'address', { type: 'textarea', value: p.address, full: true })}</div>`,
    onSubmit: async data => {
      if (isNew) {
        const r = await api('/patients', { method: 'POST', body: data });
        toast(`Patient registered with ID ${r.uid}`);
        location.hash = `#/patients/${r.id}`;
      } else {
        await api(`/patients/${p.id}`, { method: 'PUT', body: data });
        toast('Patient details updated');
      }
      refresh();
    },
  });
}

// ---------------------------------------------------------------- appointments
async function pageAppointments() {
  setTitle(is('doctor', 'patient') ? 'My Appointments' : 'Appointments');
  const docs = is('admin', 'receptionist') ? await doctors() : [];
  content(`<div class="toolbar">
      ${!is('patient') ? `<div class="search">${icon('search')}<input class="input" id="aq" placeholder="Search patient or doctor…"></div>` : ''}
      <select class="input" id="aview">${options([['upcoming', 'Upcoming'], ['today', 'Today'], ['past', 'Past'], ['all', 'All dates'], ['date', 'Specific date…']], 'upcoming')}</select>
      <input class="input" type="date" id="adate" hidden>
      ${docs.length ? `<select class="input" id="adoc">${options([['', 'All doctors'], ...docs.map(d => [d.id, `${d.name} (${d.department})`])])}</select>` : ''}
      <select class="input" id="astatus">${options([['', 'Any status'], 'Scheduled', 'Completed', 'Cancelled'])}</select>
      <div class="grow"></div>
      ${is('admin', 'receptionist', 'patient') ? `<button class="btn primary" data-act="appt-book">${icon('plus')} Book appointment</button>` : ''}
    </div><div class="card" id="alist"><div class="loading">Loading…</div></div>`);
  const load = async () => {
    const view = $('#aview').value;
    $('#adate').hidden = view !== 'date';
    const p = new URLSearchParams();
    const t = todayStr();
    if (view === 'upcoming') { p.set('from', t); p.set('order', 'asc'); }
    if (view === 'today') { p.set('date', t); p.set('order', 'asc'); }
    if (view === 'past') { const y = new Date(); y.setDate(y.getDate() - 1); p.set('to', `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`); }
    if (view === 'date' && $('#adate').value) { p.set('date', $('#adate').value); p.set('order', 'asc'); }
    if ($('#aq')?.value) p.set('q', $('#aq').value);
    if ($('#adoc')?.value) p.set('doctor_id', $('#adoc').value);
    if ($('#astatus').value) p.set('status', $('#astatus').value);
    const list = await api('/appointments?' + p);
    $('#alist').innerHTML = `<div class="card-head"><h3>${list.length} appointment${list.length === 1 ? '' : 's'}</h3></div>${apptTable(list, { patient: !is('patient'), doctor: !is('doctor') })}`;
  };
  ['aview', 'adate', 'adoc', 'astatus'].forEach(id => $('#' + id)?.addEventListener('change', load));
  $('#aq')?.addEventListener('input', debounce(load));
  await load();
}

async function bookAppointment({ patientId } = {}) {
  const [docs, deps, patients] = await Promise.all([doctors(), departments(), is('patient') ? [] : api('/patients')]);
  const fixed = is('patient') || patientId;
  const pName = patientId ? patients.find(p => p.id === patientId)?.name : null;
  openModal({
    title: 'Book appointment',
    submitText: 'Confirm booking',
    body: `${is('patient') ? '' : patientId ? `<div class="field"><label class="f">Patient</label><div class="input" style="background:var(--surface-2)">${esc(pName)}</div><input type="hidden" name="patient_id" value="${patientId}"></div>`
      : fld('Patient', 'patient_id', { req: true, options: [['', 'Select patient…'], ...patients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, `${p.name} (${p.uid}) · ${p.phone}`])] })}
      <div class="form-grid">
        ${fld('Department', 'department', { options: [['', 'All departments'], ...deps.map(d => [d.id, d.name])] })}
        ${fld('Doctor', 'doctor_id', { req: true, options: [] })}
        ${fld('Date', 'date', { type: 'date', req: true, value: todayStr(), attrs: `min="${todayStr()}"` })}
        ${fld('Time slot', 'time', { req: true, options: [['', 'Select doctor & date first']] })}
      </div>
      <div class="small muted" id="feeHint" style="margin:-6px 0 12px"></div>
      ${fld('Reason for visit', 'reason', { type: 'textarea', ph: 'e.g. Fever for 3 days, follow-up, routine check-up' })}`,
    onOpen: form => {
      const fillDocs = () => {
        const dep = form.department.value;
        const list = docs.filter(d => !dep || String(d.department_id) === dep);
        form.doctor_id.innerHTML = options([['', 'Select doctor…'], ...list.map(d => [d.id, `${d.name} — ${d.specialization || d.department}`])]);
        loadSlots();
      };
      const loadSlots = async () => {
        const doc = docs.find(d => String(d.id) === form.doctor_id.value);
        $('#feeHint', form).textContent = doc ? `Consultation fee: ${money0(doc.consultation_fee)} · ${doc.department}` : '';
        if (!form.doctor_id.value || !form.date.value) { form.time.innerHTML = options([['', 'Select doctor & date first']]); return; }
        if (new Date(form.date.value + 'T00:00:00').getDay() === 0) { form.time.innerHTML = options([['', 'OPD closed on Sundays']]); return; }
        const { slots } = await api(`/appointments/slots?doctor_id=${form.doctor_id.value}&date=${form.date.value}`);
        form.time.innerHTML = slots.length ? options([['', `${slots.length} slots available…`], ...slots.map(s => [s, time12(s)])]) : options([['', 'No free slots on this date']]);
      };
      form.department.addEventListener('change', fillDocs);
      form.doctor_id.addEventListener('change', loadSlots);
      form.date.addEventListener('change', loadSlots);
      fillDocs();
    },
    onSubmit: async data => {
      if (!fixed && !data.patient_id) throw new Error('Please select a patient');
      if (!data.doctor_id) throw new Error('Please select a doctor');
      if (!data.time) throw new Error('Please choose an available time slot');
      await api('/appointments', { method: 'POST', body: data });
      toast(`Appointment booked for ${fmtDate(data.date)} at ${time12(data.time)}`);
      refresh();
      pollNotifications();
    },
  });
}

function rescheduleModal(a) {
  openModal({
    title: 'Reschedule appointment',
    submitText: 'Reschedule',
    body: `<p class="muted" style="margin-top:0">${esc(a.patient_name)} with <b>${esc(a.doctor_name)}</b> — currently ${esc(fmtDate(a.date))} at ${esc(time12(a.time))}</p>
      <div class="form-grid">${fld('New date', 'date', { type: 'date', req: true, value: a.date >= todayStr() ? a.date : todayStr(), attrs: `min="${todayStr()}"` })}
      ${fld('New time slot', 'time', { req: true, options: [] })}</div>`,
    onOpen: form => {
      const load = async () => {
        if (new Date(form.date.value + 'T00:00:00').getDay() === 0) { form.time.innerHTML = options([['', 'OPD closed on Sundays']]); return; }
        const { slots } = await api(`/appointments/slots?doctor_id=${a.doctor_id}&date=${form.date.value}&exclude=${a.id}`);
        form.time.innerHTML = slots.length ? options([['', 'Select…'], ...slots.map(s => [s, time12(s)])]) : options([['', 'No free slots']]);
      };
      form.date.addEventListener('change', load);
      load();
    },
    onSubmit: async data => {
      if (!data.time) throw new Error('Please choose a time slot');
      await api(`/appointments/${a.id}`, { method: 'PUT', body: { action: 'reschedule', ...data } });
      toast('Appointment rescheduled');
      refresh();
    },
  });
}

// ---------------------------------------------------------------- medical records
async function pageRecords() {
  setTitle(is('patient') ? 'My Medical Records' : 'Medical Records');
  if (is('patient')) {
    const list = cacheRows('rec', await api('/records'));
    return content(`<div class="card"><div class="card-head"><h3>Medical history (${list.length})</h3></div><div class="card-body">${list.length ? list.map(recordCard).join('') : empty('No records yet')}</div></div>`);
  }
  content(`<div class="toolbar"><div class="search grow">${icon('search')}<input class="input" id="rq" placeholder="Search by patient, ID or diagnosis…"></div>
    ${is('doctor') ? `<label class="check"><input type="checkbox" id="rmine"> Only my records</label><button class="btn primary" data-act="rec-add">${icon('plus')} New record</button>` : ''}</div>
    <div class="card" id="rlist"><div class="loading">Loading…</div></div>`);
  const load = async () => {
    const p = new URLSearchParams({ q: $('#rq').value });
    if ($('#rmine')?.checked) p.set('mine', '1');
    const list = cacheRows('rec', await api('/records?' + p));
    $('#rlist').innerHTML = !list.length ? empty('No records found') : `<div class="table-wrap"><table class="tbl"><thead><tr><th>Visit date</th><th>Patient</th><th>Diagnosis</th><th>Doctor</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td class="nowrap">${esc(fmtDate(r.visit_date))}</td><td><a class="strong" href="#/patients/${r.patient_id}">${esc(r.patient_name)}</a><div class="small muted">${esc(r.patient_uid)}</div></td>
      <td>${esc(r.diagnosis)}<div class="small muted">${esc((r.prescription || '').slice(0, 60))}</div></td><td>${esc(r.doctor_name)}<div class="small muted">${esc(r.department || '')}</div></td>
      <td><div class="actions">${btn('View', 'rec-view', r.id)}${is('doctor') && r.doctor_id === state.user.id ? btn('Edit', 'rec-edit', r.id) : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  };
  $('#rq').addEventListener('input', debounce(load));
  $('#rmine')?.addEventListener('change', load);
  await load();
}

function viewRecord(r) {
  openModal({ title: `Medical record — ${r.patient_name}`, body: `<div class="small muted" style="margin-bottom:12px">${esc(r.patient_uid)}</div>${recordCard({ ...r, doctor_id: -1 })}` });
}

async function recordForm({ patientId, appointmentId, record } = {}) {
  const editing = !!record;
  const patients = editing ? [] : await api('/patients');
  const r = record || {};
  openModal({
    title: editing ? 'Edit medical record' : 'New medical record',
    submitText: editing ? 'Save changes' : 'Save record',
    wide: true,
    body: `${editing ? `<p class="muted" style="margin-top:0">${esc(r.patient_name)} · ${esc(fmtDate(r.visit_date))}</p>` : `<div class="form-grid">
        ${fld('Patient', 'patient_id', { req: true, value: patientId, options: [['', 'Select patient…'], ...patients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, `${p.name} (${p.uid})`])], attrs: patientId ? 'disabled' : '' })}
        ${fld('Appointment', 'appointment_id', { options: [['', 'Walk-in / no appointment']] })}</div>
        <div id="allergyWarn"></div>`}
      <div class="form-grid">
        ${fld('Symptoms / complaints', 'symptoms', { type: 'textarea', value: r.symptoms })}
        ${fld('Diagnosis', 'diagnosis', { req: true, type: 'textarea', value: r.diagnosis })}
        ${fld('Treatment / advice', 'treatment', { type: 'textarea', value: r.treatment })}
        ${fld('Prescription', 'prescription', { type: 'textarea', value: r.prescription, ph: 'e.g. Paracetamol 650mg TDS x 3 days' })}
        ${fld('Notes', 'notes', { type: 'textarea', value: r.notes, full: true, ph: 'Follow-up instructions, tests ordered…' })}
      </div>
      ${editing ? '' : '<label class="check" id="completeWrap" style="margin-bottom:12px"><input type="checkbox" name="complete_appointment" checked> Mark the appointment as completed</label>'}`,
    onOpen: form => {
      if (editing) return;
      const load = async () => {
        const pid = form.patient_id.value;
        const p = patients.find(x => String(x.id) === pid);
        $('#allergyWarn', form).innerHTML = p && p.allergies && p.allergies !== 'None' ? `<div class="form-error show" style="display:block">⚠ Known allergy: <b>${esc(p.allergies)}</b></div>` : '';
        if (!pid) { form.appointment_id.innerHTML = options([['', 'Walk-in / no appointment']]); return; }
        const appts = await api(`/appointments?patient_id=${pid}&status=Scheduled&order=asc`);
        form.appointment_id.innerHTML = options([['', 'Walk-in / no appointment'], ...appts.map(a => [a.id, `${fmtDate(a.date)} ${time12(a.time)} — ${a.reason || 'Consultation'}`])], appointmentId);
        $('#completeWrap', form).style.display = form.appointment_id.value ? '' : 'none';
      };
      form.patient_id.addEventListener('change', load);
      form.appointment_id.addEventListener('change', () => { $('#completeWrap', form).style.display = form.appointment_id.value ? '' : 'none'; });
      load();
    },
    onSubmit: async (data, form) => {
      if (editing) {
        await api(`/records/${r.id}`, { method: 'PUT', body: data });
        toast('Record updated');
      } else {
        data.patient_id = form.patient_id.value;
        if (!data.patient_id) throw new Error('Please select a patient');
        await api('/records', { method: 'POST', body: data });
        toast('Medical record saved');
      }
      refresh();
    },
  });
}

// ---------------------------------------------------------------- billing
async function pageBilling() {
  setTitle(is('patient') ? 'My Bills' : 'Billing');
  const canCreate = is('admin', 'accountant');
  const unbilled = canCreate ? cacheRows('appt', await api('/bills/unbilled')) : [];
  content(`<div class="stats" id="bstats"></div>
    ${unbilled.length ? `<div class="card" style="margin-bottom:18px"><div class="card-head"><h3>Completed consultations awaiting a bill (${unbilled.length})</h3></div>
      ${unbilled.slice(0, 5).map(a => `<div class="list-item"><div style="flex:1"><span class="strong">${esc(a.patient_name)}</span> <span class="small muted">${esc(a.patient_uid)}</span>
      <div class="small muted">${esc(fmtDate(a.date))} · ${esc(a.doctor_name)} · fee ${money0(a.consultation_fee)}</div></div>${btn('Generate bill', 'bill-from-appt', a.id, 'primary')}</div>`).join('')}</div>` : ''}
    <div class="toolbar">${!is('patient') ? `<div class="search grow">${icon('search')}<input class="input" id="bq" placeholder="Search bill no., patient name or ID…"></div>` : '<div class="grow"></div>'}
      <select class="input" id="bstatus">${options([['', 'All bills'], ['Unpaid', 'Unpaid'], ['Paid', 'Paid']])}</select>
      ${canCreate ? `<button class="btn primary" data-act="bill-new">${icon('plus')} New bill</button>` : ''}</div>
    <div class="card" id="blist"><div class="loading">Loading…</div></div>`);
  const load = async () => {
    const p = new URLSearchParams({ status: $('#bstatus').value, q: $('#bq')?.value || '' });
    const list = await api('/bills?' + p);
    const sum = f => list.filter(f).reduce((s, b) => s + b.total, 0);
    $('#bstats').innerHTML = statCard('bill', 'teal', list.length, 'Bills listed') + statCard('rupee', 'blue', money0(sum(() => true)), 'Total billed')
      + statCard('check', 'green', money0(sum(b => b.status === 'Paid')), 'Collected') + statCard('alert', 'amber', money0(sum(b => b.status === 'Unpaid')), 'Outstanding');
    $('#blist').innerHTML = billTable(list, { patient: !is('patient') });
  };
  $('#bstatus').addEventListener('change', load);
  $('#bq')?.addEventListener('input', debounce(load));
  await load();
}

const SERVICES = [['Blood test (CBC)', 350], ['X-Ray', 600], ['ECG', 400], ['Ultrasound', 1200], ['Medicines', 0], ['Dressing', 150], ['Room charges (per day)', 1500], ['Injection', 100]];

async function billForm({ patientId, appointmentId } = {}) {
  const patients = await api('/patients');
  const itemRow = (d = '', q = 1, pr = '') => `<tr><td style="width:55%"><input class="input it-desc" value="${esc(d)}" placeholder="Service / item"></td>
    <td style="width:12%"><input class="input it-qty" type="number" min="1" value="${q}"></td><td style="width:22%"><input class="input it-price" type="number" min="0" step="0.01" value="${pr}" placeholder="0.00"></td>
    <td><button type="button" class="icon-btn it-del" title="Remove">${icon('x')}</button></td></tr>`;
  openModal({
    title: 'Create bill',
    submitText: 'Generate bill',
    wide: true,
    body: `<div class="form-grid">
        ${fld('Patient', 'patient_id', { req: true, value: patientId, options: [['', 'Select patient…'], ...patients.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => [p.id, `${p.name} (${p.uid})`])] })}
        ${fld('Link to completed consultation', 'appointment_id', { options: [['', 'None — other services']] })}</div>
      <label class="f">Bill items</label>
      <table class="tbl items-tbl"><thead><tr><th>Description</th><th>Qty</th><th>Unit price (₹)</th><th></th></tr></thead><tbody id="items">${itemRow()}</tbody></table>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 16px"><button type="button" class="btn sm" id="addItem">${icon('plus')} Add item</button>
        ${SERVICES.map(([n, p], i) => `<button type="button" class="btn sm" data-svc="${i}" style="color:var(--muted)">+ ${esc(n)}</button>`).join('')}</div>
      <div class="form-grid">${fld('Discount (₹)', 'discount', { type: 'number', value: 0, attrs: 'min="0" step="0.01"' })}${fld('Tax (%)', 'tax_percent', { type: 'number', value: 0, attrs: 'min="0" max="28" step="0.5"' })}</div>
      <div class="totals"><div><span>Subtotal</span><span id="tSub">₹0.00</span></div><div><span>Discount</span><span id="tDis">−₹0.00</span></div><div><span>Tax</span><span id="tTax">₹0.00</span></div><div class="grand"><span>Total</span><span id="tTot">₹0.00</span></div></div>`,
    onOpen: form => {
      const tbody = $('#items', form);
      let appts = [];
      const items = () => [...tbody.rows].map(tr => ({ description: $('.it-desc', tr).value.trim(), qty: Number($('.it-qty', tr).value), unit_price: Number($('.it-price', tr).value) }))
        .filter(i => i.description || i.unit_price);
      const recalc = () => {
        const sub = items().reduce((s, i) => s + (i.qty || 0) * (i.unit_price || 0), 0);
        const dis = Number(form.discount.value) || 0, tax = Number(form.tax_percent.value) || 0;
        const taxAmt = (sub - dis) * tax / 100;
        $('#tSub', form).textContent = money(sub); $('#tDis', form).textContent = '−' + money(dis);
        $('#tTax', form).textContent = money(taxAmt); $('#tTot', form).textContent = money(sub - dis + taxAmt);
      };
      const addRow = (d, q, p) => {
        const first = tbody.rows[0];
        if (tbody.rows.length === 1 && !$('.it-desc', first).value && !$('.it-price', first).value) first.remove();
        tbody.insertAdjacentHTML('beforeend', itemRow(d, q, p));
        recalc();
      };
      const loadAppts = async () => {
        appts = form.patient_id.value ? await api('/bills/unbilled?patient_id=' + form.patient_id.value) : [];
        form.appointment_id.innerHTML = options([['', 'None — other services'], ...appts.map(a => [a.id, `${fmtDate(a.date)} — ${a.doctor_name}`])], appointmentId);
        applyAppt();
      };
      const applyAppt = () => {
        [...tbody.rows].forEach(tr => { if ($('.it-desc', tr).value.startsWith('Consultation – ')) tr.remove(); });
        const a = appts.find(x => String(x.id) === form.appointment_id.value);
        if (a) { tbody.insertAdjacentHTML('afterbegin', itemRow(`Consultation – ${a.doctor_name}`, 1, a.consultation_fee)); const r = tbody.rows; if (r.length > 1 && !$('.it-desc', r[r.length - 1]).value) r[r.length - 1].remove(); }
        if (!tbody.rows.length) tbody.insertAdjacentHTML('beforeend', itemRow());
        recalc();
      };
      form.patient_id.addEventListener('change', () => { appointmentId = null; loadAppts(); });
      form.appointment_id.addEventListener('change', applyAppt);
      $('#addItem', form).onclick = () => { tbody.insertAdjacentHTML('beforeend', itemRow()); };
      form.querySelectorAll('[data-svc]').forEach(b => { b.onclick = () => { const [n, p] = SERVICES[b.dataset.svc]; addRow(n, 1, p || ''); }; });
      tbody.addEventListener('click', e => { if (e.target.closest('.it-del')) { e.target.closest('tr').remove(); if (!tbody.rows.length) tbody.insertAdjacentHTML('beforeend', itemRow()); recalc(); } });
      form.addEventListener('input', recalc);
      form._items = items;
      loadAppts();
    },
    onSubmit: async (data, form) => {
      if (!data.patient_id) throw new Error('Please select a patient');
      const r = await api('/bills', { method: 'POST', body: { ...data, items: form._items() } });
      toast(`Bill ${r.bill_no} generated`);
      refresh();
      setTimeout(() => invoiceModal(r.id), 150);
    },
  });
}

function payModal(b) {
  openModal({
    title: `Record payment — ${b.bill_no}`,
    submitText: 'Confirm payment',
    body: `<p style="margin-top:0">${esc(b.patient_name)} · Amount due <b>${money(b.total)}</b></p>
      ${fld('Payment method', 'payment_method', { req: true, options: [['', 'Select…'], 'Cash', 'UPI', 'Card', 'Insurance'] })}`,
    onSubmit: async data => {
      await api(`/bills/${b.id}/pay`, { method: 'PUT', body: data });
      toast(`Payment recorded for ${b.bill_no}`);
      refresh();
    },
  });
}

async function invoiceModal(id) {
  const { bill: b, items, patient: p } = await api('/bills/' + id);
  const taxAmt = (b.subtotal - b.discount) * b.tax_percent / 100;
  const m = openModal({
    title: `Invoice ${b.bill_no}`,
    wide: true,
    footer: `<button type="button" class="btn" data-close>Close</button>${b.status === 'Unpaid' && is('admin', 'accountant') ? `<button type="button" class="btn" id="invPay">Record payment</button>` : ''}<button type="button" class="btn primary" id="invPrint">${icon('printer')} Print</button>`,
    body: `<div class="invoice">
      <div class="inv-head"><div class="brand" style="color:var(--text)">${brandMark} <div>MediCore Hospital<div class="small muted" style="font-weight:400">12 Health Avenue, New Delhi · +91 11 4000 1234</div></div></div>
        <div style="text-align:right"><h2>INVOICE</h2><div class="strong">${esc(b.bill_no)}</div><div class="small muted">${esc(fmtDT(b.created_at))}</div></div></div>
      <div class="inv-meta"><div><div class="small muted">Billed to</div><div class="strong">${esc(p.name)}</div><div class="small">${esc(p.uid)} · ${esc(p.phone)}</div><div class="small">${esc(p.address || '')}</div></div>
        <div style="text-align:right"><div class="small muted">Status</div>${badge(b.status)}${b.paid_at ? `<div class="small" style="margin-top:4px">Paid via ${esc(b.payment_method)}<br>${esc(fmtDT(b.paid_at))}</div>` : ''}${b.doctor_name ? `<div class="small" style="margin-top:4px">Consultant: ${esc(b.doctor_name)}</div>` : ''}</div></div>
      <table class="tbl"><thead><tr><th>#</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th></tr></thead><tbody>
        ${items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.description)}</td><td class="num">${i.qty}</td><td class="num">${money(i.unit_price)}</td><td class="num">${money(i.qty * i.unit_price)}</td></tr>`).join('')}</tbody></table>
      <div class="totals"><div><span>Subtotal</span><span>${money(b.subtotal)}</span></div>${b.discount ? `<div><span>Discount</span><span>−${money(b.discount)}</span></div>` : ''}
        ${b.tax_percent ? `<div><span>Tax (${b.tax_percent}%)</span><span>${money(taxAmt)}</span></div>` : ''}<div class="grand"><span>Total</span><span>${money(b.total)}</span></div></div>
      <p class="small muted" style="margin-top:28px;text-align:center">Thank you for choosing MediCore Hospital. This is a computer-generated invoice.</p></div>`,
  });
  $('#invPrint', m.wrap).onclick = () => { document.body.classList.add('print-mode'); window.print(); document.body.classList.remove('print-mode'); };
  const pay = $('#invPay', m.wrap);
  if (pay) pay.onclick = () => { m.close(); payModal(b); };
}

// ---------------------------------------------------------------- staff
async function pageStaff() {
  setTitle('Staff & Doctors');
  const [staff, deps] = await Promise.all([api('/staff'), departments(true)]);
  cacheRows('staff', staff);
  const count = r => staff.filter(s => s.role === r && s.active).length;
  content(`<div class="stats">${statCard('staff', 'teal', count('doctor'), 'Doctors')}${statCard('users', 'blue', count('receptionist'), 'Receptionists')}
      ${statCard('rupee', 'green', count('accountant'), 'Accountants')}${statCard('user', 'amber', count('admin'), 'Administrators')}</div>
    <div class="grid g3">
      <div class="card"><div class="card-head"><h3>Staff accounts</h3><button class="btn sm primary" data-act="staff-new">${icon('plus')} Add staff</button></div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Contact</th><th>Status</th><th></th></tr></thead><tbody>
        ${staff.map(s => `<tr><td><div style="display:flex;gap:10px;align-items:center"><div class="avatar">${esc(initials(s.name))}</div><div><div class="strong">${esc(s.name)}</div><div class="small muted">@${esc(s.username)}</div></div></div></td>
          <td><span class="badge b-role">${esc(s.role)}</span>${s.specialization ? `<div class="small muted">${esc(s.specialization)}</div>` : ''}</td>
          <td>${esc(s.department || '—')}${s.role === 'doctor' ? `<div class="small muted">Fee ${money0(s.consultation_fee)}</div>` : ''}</td>
          <td class="small">${esc(s.phone || '')}<div class="muted">${esc(s.email || '')}</div></td>
          <td>${badge(s.active ? 'Active' : 'Inactive')}</td>
          <td><div class="actions">${btn('Edit', 'staff-edit', s.id)}${s.id !== state.user.id ? btn(s.active ? 'Deactivate' : 'Activate', 'staff-toggle', s.id, s.active ? 'danger' : '') : ''}</div></td></tr>`).join('')}
        </tbody></table></div></div>
      <div class="card" style="align-self:start"><div class="card-head"><h3>Departments</h3><button class="btn sm" data-act="dept-new">${icon('plus')} Add</button></div>
        ${deps.map(d => `<div class="list-item"><div style="flex:1"><div class="strong">${esc(d.name)}</div><div class="small muted">${esc(d.description || '')}</div></div><span class="badge b-role">${d.doctors} doctor${d.doctors === 1 ? '' : 's'}</span></div>`).join('')}</div>
    </div>`);
}

async function staffForm(s) {
  const isNew = !s;
  s = s || { role: 'doctor' };
  const deps = await departments();
  openModal({
    title: isNew ? 'Add staff member' : `Edit ${s.name}`,
    submitText: isNew ? 'Create account' : 'Save changes',
    wide: true,
    body: `<div class="form-grid">
      ${fld('Full name', 'name', { req: true, value: s.name, ph: 'e.g. Dr. Kavita Rao' })}
      ${fld('Role', 'role', { req: true, value: s.role, options: [['doctor', 'Doctor'], ['receptionist', 'Receptionist'], ['accountant', 'Accountant'], ['admin', 'Administrator']] })}
      ${isNew ? fld('Username', 'username', { req: true, ph: 'used to sign in' }) : `<div class="field"><label class="f">Username</label><div class="input" style="background:var(--surface-2)">@${esc(s.username)}</div></div>`}
      ${fld(isNew ? 'Password' : 'Reset password', 'password', { type: 'password', req: isNew, ph: isNew ? 'min. 6 characters' : 'leave blank to keep current' })}
      ${fld('Phone', 'phone', { value: s.phone, ph: '10-digit number', attrs: 'maxlength="10"' })}
      ${fld('Email', 'email', { type: 'email', value: s.email })}
      ${fld('Department', 'department_id', { value: s.department_id, options: [['', '—'], ...deps.map(d => [d.id, d.name])], wrap: 'data-doc' })}
      ${fld('Specialization', 'specialization', { value: s.specialization, ph: 'e.g. Cardiologist', wrap: 'data-doc' })}
      ${fld('Consultation fee (₹)', 'consultation_fee', { type: 'number', value: s.consultation_fee || '', attrs: 'min="0"', wrap: 'data-doc' })}
    </div>`,
    onOpen: form => {
      const toggle = () => form.querySelectorAll('[data-doc]').forEach(el => { el.style.display = form.role.value === 'doctor' ? '' : 'none'; });
      form.role.addEventListener('change', toggle);
      toggle();
    },
    onSubmit: async data => {
      if (isNew) await api('/staff', { method: 'POST', body: data });
      else await api(`/staff/${s.id}`, { method: 'PUT', body: data });
      toast(isNew ? `Account created for ${data.name}` : 'Staff details updated');
      state.doctors = null;
      refresh();
    },
  });
}

function deptForm() {
  openModal({
    title: 'Add department', submitText: 'Add department',
    body: fld('Department name', 'name', { req: true, ph: 'e.g. ENT' }) + fld('Description', 'description', { type: 'textarea' }),
    onSubmit: async data => { await api('/departments', { method: 'POST', body: data }); toast('Department added'); state.departments = null; refresh(); },
  });
}

// ---------------------------------------------------------------- reports
async function pageReports() {
  setTitle('Reports');
  const from = state.repFrom || (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; })();
  const to = state.repTo || todayStr();
  const r = await api(`/reports?from=${from}&to=${to}`);
  const s = r.summary;
  const rate = s.appointments ? Math.round((s.completed / s.appointments) * 100) : 0;
  content(`<div class="toolbar">
      <label class="small strong">From</label><input class="input" type="date" id="rfrom" value="${from}" max="${todayStr()}">
      <label class="small strong">To</label><input class="input" type="date" id="rto" value="${to}">
      <button class="btn primary" id="rapply">Apply</button><div class="grow"></div>
      <span class="small muted">Export CSV:</span>
      <a class="btn sm" href="/api/reports/export/patients">${icon('download')} Patients</a>
      <a class="btn sm" href="/api/reports/export/appointments">${icon('download')} Appointments</a>
      <a class="btn sm" href="/api/reports/export/bills">${icon('download')} Bills</a>
    </div>
    <div class="stats">${statCard('rupee', 'green', money0(s.revenue), 'Revenue collected')}${statCard('alert', 'amber', money0(s.outstanding), 'Outstanding dues')}
      ${statCard('calendar', 'blue', s.appointments, `Appointments (${rate}% completed)`)}${statCard('x', 'red', s.cancelled, 'Cancelled')}${statCard('users', 'teal', s.new_patients, 'New patients')}</div>
    <div class="grid g2">
      <div class="card"><div class="card-head"><h3>Monthly revenue</h3></div><div class="card-body">${colChart(r.revenueByMonth.map(m => ({ label: monthLabel(m.month), value: m.amount })), money0)}</div></div>
      <div class="card"><div class="card-head"><h3>Appointments by department</h3></div><div class="card-body">${barList(r.byDepartment.map(d => ({ label: d.department, value: d.appointments })))}</div></div>
      <div class="card"><div class="card-head"><h3>Doctor performance</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Doctor</th><th class="num">Appts</th><th class="num">Done</th><th class="num">Cancelled</th><th class="num">Patients</th></tr></thead><tbody>
        ${r.byDoctor.map(d => `<tr><td><span class="strong">${esc(d.doctor)}</span><div class="small muted">${esc(d.department || '')}</div></td><td class="num">${d.appointments}</td><td class="num">${d.completed || 0}</td><td class="num">${d.cancelled || 0}</td><td class="num">${d.patients}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-head"><h3>Revenue by department</h3></div><div class="card-body">${barList(r.byDepartment.map(d => ({ label: d.department, value: d.revenue })), money0)}</div></div>
        <div class="card"><div class="card-head"><h3>Payment methods</h3></div><div class="card-body">${barList(r.paymentMethods.map(p => ({ label: `${p.method} (${p.count})`, value: p.amount })), money0)}</div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Most common diagnoses</h3></div><div class="card-body">${barList(r.topDiagnoses.map(d => ({ label: d.diagnosis, value: d.count })))}</div></div>
    </div>`);
  $('#rapply').onclick = () => {
    if ($('#rfrom').value > $('#rto').value) return toast('"From" date must be before "To" date', 'err');
    state.repFrom = $('#rfrom').value; state.repTo = $('#rto').value; refresh();
  };
}

// ---------------------------------------------------------------- notifications & account
async function pageNotifications() {
  setTitle('Notifications');
  const { items } = await api('/notifications');
  content(`<div class="card"><div class="card-head"><h3>All notifications</h3><button class="btn sm" id="readAll">${icon('check')} Mark all as read</button></div>
    ${items.length ? items.map(notifHtml).join('') : empty('You have no notifications')}</div>`);
  $('#readAll').onclick = async () => { await api('/notifications/read', { method: 'POST', body: {} }); await pollNotifications(); refresh(); };
}

async function pageAccount() {
  setTitle('My Account');
  const u = state.user;
  content(`<div class="grid g2"><div class="card"><div class="card-head"><h3>Profile</h3></div><div class="card-body">
      <div class="profile"><div class="avatar">${esc(initials(u.name))}</div><div><h2 style="font-size:19px">${esc(u.name)}</h2><span class="badge b-role">${esc(u.role)}</span></div></div>
      <div class="kv"><div><small>Username</small>@${esc(u.username)}</div><div><small>Email</small>${esc(u.email || '—')}</div><div><small>Phone</small>${esc(u.phone || '—')}</div>
      ${u.department ? `<div><small>Department</small>${esc(u.department)}</div>` : ''}${u.specialization ? `<div><small>Specialization</small>${esc(u.specialization)}</div>` : ''}</div>
      ${u.role === 'patient' ? `<a class="btn" style="margin-top:18px" href="#/profile">View my medical profile</a>` : ''}</div></div>
    <div class="card"><div class="card-head"><h3>Change password</h3></div><form class="card-body" id="pwForm" novalidate><div class="form-error" id="pwErr"></div>
      ${fld('Current password', 'current', { type: 'password' })}${fld('New password', 'password', { type: 'password', ph: 'min. 6 characters' })}${fld('Confirm new password', 'confirm', { type: 'password' })}
      <button class="btn primary">Update password</button></form></div></div>`);
  $('#pwForm').onsubmit = async e => {
    e.preventDefault();
    const d = formData(e.target), err = $('#pwErr');
    err.classList.remove('show');
    try {
      if (d.password !== d.confirm) throw new Error('New passwords do not match');
      await api('/me/password', { method: 'POST', body: d });
      toast('Password updated'); e.target.reset();
    } catch (x) { err.textContent = x.message; err.classList.add('show'); }
  };
}

// ---------------------------------------------------------------- boot
window.addEventListener('hashchange', route);
(async () => {
  try { const { user } = await api('/me'); state.user = user; renderShell(); }
  catch { renderLogin(); }
})();
