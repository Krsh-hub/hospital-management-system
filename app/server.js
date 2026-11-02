// MediCore Hospital Management System – REST API + static front-end
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { db, hashPassword, verifyPassword, today, nowStr, SLOTS } = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const STAFF = ['admin', 'receptionist', 'doctor', 'accountant'];
const v = x => (x === undefined || x === '' ? null : typeof x === 'string' ? x.trim() : x);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// ---------- Authentication & role-based access (FR-01, FR-10) ----------
function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const USER_SQL = `SELECT u.id, u.username, u.name, u.role, u.email, u.phone, u.department_id, d.name AS department,
  u.specialization, u.consultation_fee, u.patient_id, u.active, u.created_at
  FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

function auth(...roles) {
  return (req, res, next) => {
    const token = cookies(req).hms_session;
    const s = token && db.prepare("SELECT user_id FROM sessions WHERE token = ? AND created_at > datetime('now','localtime','-12 hours')").get(token);
    if (!s) return bad(res, 'Please log in to continue', 401);
    const u = db.prepare(`${USER_SQL} WHERE u.id = ? AND u.active = 1`).get(s.user_id);
    if (!u) return bad(res, 'Account not available', 401);
    if (roles.length && !roles.includes(u.role)) return bad(res, `Access denied: the ${u.role} role cannot perform this action`, 403);
    req.user = u;
    next();
  };
}

function notify(userId, title, message) {
  if (userId) db.prepare('INSERT INTO notifications(user_id, title, message) VALUES (?, ?, ?)').run(userId, title, message);
}
const patientUserId = pid => db.prepare("SELECT id FROM users WHERE patient_id = ? AND role = 'patient'").get(pid)?.id;

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return bad(res, 'Username and password are required');
  const u = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim().toLowerCase());
  if (!u || !verifyPassword(password, u.salt, u.password_hash)) return bad(res, 'Invalid username or password', 401);
  if (!u.active) return bad(res, 'This account is deactivated. Contact the administrator.', 403);
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token, user_id) VALUES (?, ?)').run(token, u.id);
  res.setHeader('Set-Cookie', `hms_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${12 * 3600}`);
  res.json({ user: db.prepare(`${USER_SQL} WHERE u.id = ?`).get(u.id) });
});

app.post('/api/logout', (req, res) => {
  const token = cookies(req).hms_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'hms_session=; HttpOnly; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/me', auth(), (req, res) => res.json({ user: req.user }));

app.post('/api/me/password', auth(), (req, res) => {
  const { current, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current || '', u.salt, u.password_hash)) return bad(res, 'Current password is incorrect');
  if (!password || password.length < 6) return bad(res, 'New password must be at least 6 characters');
  const { salt, hash } = hashPassword(password);
  db.prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, u.id);
  res.json({ ok: true });
});

// ---------- Departments ----------
app.get('/api/departments', auth(), (req, res) => {
  res.json(db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM users u WHERE u.department_id = d.id AND u.role = 'doctor' AND u.active = 1) AS doctors
    FROM departments d ORDER BY d.name`).all());
});
app.post('/api/departments', auth('admin'), (req, res) => {
  const name = v(req.body.name);
  if (!name) return bad(res, 'Department name is required');
  if (db.prepare('SELECT 1 FROM departments WHERE name = ? COLLATE NOCASE').get(name)) return bad(res, 'Department already exists');
  const id = db.prepare('INSERT INTO departments(name, description) VALUES (?, ?)').run(name, v(req.body.description)).lastInsertRowid;
  res.json({ id: Number(id) });
});

// ---------- Doctor & staff management (FR-03) ----------
app.get('/api/doctors', auth(), (req, res) => {
  const dep = req.query.department_id;
  res.json(db.prepare(`${USER_SQL} WHERE u.role = 'doctor' AND u.active = 1 ${dep ? 'AND u.department_id = ?' : ''} ORDER BY d.name, u.name`)
    .all(...(dep ? [dep] : [])));
});

app.get('/api/staff', auth('admin'), (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare(`${USER_SQL} WHERE u.role != 'patient' AND (u.name LIKE ? OR u.username LIKE ? OR u.role LIKE ?) ORDER BY u.role, u.name`).all(q, q, q));
});

function validateStaff(b, isNew) {
  if (!v(b.name)) return 'Name is required';
  if (!STAFF.includes(b.role)) return 'Select a valid role';
  if (b.phone && !/^\d{10}$/.test(b.phone)) return 'Phone must be a 10-digit number';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return 'Invalid email address';
  if (b.role === 'doctor' && !b.department_id) return 'A doctor must belong to a department';
  if (isNew) {
    if (!/^[a-z0-9._]{3,30}$/.test(String(b.username || '').toLowerCase())) return 'Username must be 3–30 characters (letters, digits, . or _)';
    if (!b.password || b.password.length < 6) return 'Password must be at least 6 characters';
  } else if (b.password && b.password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

app.post('/api/staff', auth('admin'), (req, res) => {
  const b = req.body || {};
  const err = validateStaff(b, true);
  if (err) return bad(res, err);
  const username = b.username.toLowerCase();
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return bad(res, 'Username is already taken');
  const { salt, hash } = hashPassword(b.password);
  const id = db.prepare(`INSERT INTO users(username, password_hash, salt, name, role, email, phone, department_id, specialization, consultation_fee)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, hash, salt, v(b.name), b.role, v(b.email), v(b.phone),
    b.role === 'doctor' ? Number(b.department_id) : v(b.department_id), v(b.specialization), Number(b.consultation_fee) || 0).lastInsertRowid;
  notify(Number(id), 'Welcome to MediCore HMS', `Your ${b.role} account has been created by ${req.user.name}.`);
  res.json({ id: Number(id) });
});

app.put('/api/staff/:id', auth('admin'), (req, res) => {
  const b = req.body || {};
  const u = db.prepare("SELECT * FROM users WHERE id = ? AND role != 'patient'").get(req.params.id);
  if (!u) return bad(res, 'Staff member not found', 404);
  if ('active' in b && Object.keys(b).length === 1) {
    if (u.id === req.user.id) return bad(res, 'You cannot deactivate your own account');
    db.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, u.id);
    if (!b.active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    return res.json({ ok: true });
  }
  const err = validateStaff(b, false);
  if (err) return bad(res, err);
  if (u.id === req.user.id && b.role !== 'admin') return bad(res, 'You cannot remove your own admin role');
  db.prepare(`UPDATE users SET name = ?, role = ?, email = ?, phone = ?, department_id = ?, specialization = ?, consultation_fee = ? WHERE id = ?`)
    .run(v(b.name), b.role, v(b.email), v(b.phone), v(b.department_id) && Number(b.department_id), v(b.specialization), Number(b.consultation_fee) || 0, u.id);
  if (b.password) {
    const { salt, hash } = hashPassword(b.password);
    db.prepare('UPDATE users SET salt = ?, password_hash = ? WHERE id = ?').run(salt, hash, u.id);
  }
  res.json({ ok: true });
});

// ---------- Patient management (FR-02, FR-09) ----------
function validatePatient(b) {
  if (!v(b.name)) return 'Patient name is required';
  if (!['Male', 'Female', 'Other'].includes(b.gender)) return 'Select a valid gender';
  if (!isDate(b.dob) || b.dob > today()) return 'Enter a valid date of birth (not in the future)';
  if (!/^\d{10}$/.test(b.phone || '')) return 'Phone must be a 10-digit number';
  if (b.emergency_contact && !/^\d{10}$/.test(b.emergency_contact)) return 'Emergency contact must be a 10-digit number';
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) return 'Invalid email address';
  return null;
}
const PATIENT_FIELDS = ['name', 'gender', 'dob', 'blood_group', 'phone', 'email', 'address', 'emergency_contact', 'allergies'];

app.get('/api/patients', auth(...STAFF), (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  res.json(db.prepare(`SELECT p.*, (SELECT MAX(date) FROM appointments a WHERE a.patient_id = p.id AND a.status = 'Completed') AS last_visit
    FROM patients p WHERE p.name LIKE ? OR p.uid LIKE ? OR p.phone LIKE ? ORDER BY p.id DESC`).all(q, q, q));
});

app.get('/api/patients/:id', auth(), (req, res) => {
  const id = Number(req.params.id);
  if (req.user.role === 'patient' && req.user.patient_id !== id) return bad(res, 'You can only view your own profile', 403);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  if (!patient) return bad(res, 'Patient not found', 404);
  const canRecords = ['admin', 'doctor', 'patient'].includes(req.user.role);
  const canBills = ['admin', 'accountant', 'receptionist', 'patient'].includes(req.user.role);
  res.json({
    patient,
    appointments: db.prepare(`${APPT_SQL} WHERE a.patient_id = ? ORDER BY a.date DESC, a.time DESC`).all(id),
    records: canRecords ? db.prepare(`${REC_SQL} WHERE r.patient_id = ? ORDER BY r.visit_date DESC, r.id DESC`).all(id) : null,
    bills: canBills ? db.prepare(`${BILL_SQL} WHERE b.patient_id = ? ORDER BY b.id DESC`).all(id) : null,
  });
});

app.post('/api/patients', auth('admin', 'receptionist'), (req, res) => {
  const b = req.body || {};
  const err = validatePatient(b);
  if (err) return bad(res, err);
  const dup = db.prepare('SELECT uid FROM patients WHERE phone = ? AND name = ? COLLATE NOCASE').get(b.phone, v(b.name));
  if (dup) return bad(res, `This patient is already registered as ${dup.uid}`);
  const id = tx(() => {
    const id = Number(db.prepare(`INSERT INTO patients(${PATIENT_FIELDS.join(',')}) VALUES (${PATIENT_FIELDS.map(() => '?').join(',')})`)
      .run(...PATIENT_FIELDS.map(f => v(b[f]))).lastInsertRowid);
    db.prepare('UPDATE patients SET uid = ? WHERE id = ?').run(`P${String(id).padStart(4, '0')}`, id);
    return id;
  });
  res.json({ id, uid: `P${String(id).padStart(4, '0')}` });
});

app.put('/api/patients/:id', auth('admin', 'receptionist'), (req, res) => {
  const b = req.body || {};
  if (!db.prepare('SELECT 1 FROM patients WHERE id = ?').get(req.params.id)) return bad(res, 'Patient not found', 404);
  const err = validatePatient(b);
  if (err) return bad(res, err);
  db.prepare(`UPDATE patients SET ${PATIENT_FIELDS.map(f => `${f} = ?`).join(', ')} WHERE id = ?`).run(...PATIENT_FIELDS.map(f => v(b[f])), req.params.id);
  res.json({ ok: true });
});

app.delete('/api/patients/:id', auth('admin'), (req, res) => {
  const id = req.params.id;
  const used = db.prepare('SELECT (SELECT COUNT(*) FROM appointments WHERE patient_id = ?) + (SELECT COUNT(*) FROM bills WHERE patient_id = ?) AS c').get(id, id).c;
  if (used) return bad(res, 'Cannot delete a patient who has appointments or bills (records are retained for integrity)');
  db.prepare('DELETE FROM patients WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------- Appointments (FR-04, FR-07) ----------
const APPT_SQL = `SELECT a.*, p.name AS patient_name, p.uid AS patient_uid, p.phone AS patient_phone,
  d.name AS doctor_name, d.specialization, dep.name AS department, d.consultation_fee,
  (SELECT id FROM medical_records r WHERE r.appointment_id = a.id LIMIT 1) AS record_id,
  (SELECT id FROM bills b WHERE b.appointment_id = a.id LIMIT 1) AS bill_id
  FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users d ON d.id = a.doctor_id
  LEFT JOIN departments dep ON dep.id = d.department_id`;

app.get('/api/appointments', auth(), (req, res) => {
  const where = [], params = [];
  const add = (sql, ...p) => { where.push(sql); params.push(...p); };
  const qy = req.query;
  if (req.user.role === 'doctor') add('a.doctor_id = ?', req.user.id);
  if (req.user.role === 'patient') add('a.patient_id = ?', req.user.patient_id);
  if (qy.date) add('a.date = ?', qy.date);
  if (qy.from) add('a.date >= ?', qy.from);
  if (qy.to) add('a.date <= ?', qy.to);
  if (qy.doctor_id) add('a.doctor_id = ?', qy.doctor_id);
  if (qy.patient_id) add('a.patient_id = ?', qy.patient_id);
  if (qy.status) add('a.status = ?', qy.status);
  if (qy.q) add('(p.name LIKE ? OR p.uid LIKE ? OR d.name LIKE ?)', `%${qy.q}%`, `%${qy.q}%`, `%${qy.q}%`);
  const order = qy.order === 'asc' ? 'a.date ASC, a.time ASC' : 'a.date DESC, a.time ASC';
  res.json(db.prepare(`${APPT_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order} LIMIT 500`).all(...params));
});

function freeSlots(doctorId, date, excludeId = 0) {
  const booked = new Set(db.prepare("SELECT time FROM appointments WHERE doctor_id = ? AND date = ? AND status != 'Cancelled' AND id != ?")
    .all(doctorId, date, excludeId).map(r => r.time));
  return SLOTS.filter(s => !booked.has(s) && !(date === today() && s <= nowHM()));
}

app.get('/api/appointments/slots', auth(), (req, res) => {
  const { doctor_id, date, exclude } = req.query;
  if (!doctor_id || !isDate(date)) return res.json({ slots: [], all: SLOTS });
  res.json({ slots: freeSlots(doctor_id, date, Number(exclude) || 0), all: SLOTS });
});

function checkSlot(doctorId, patientId, date, time, excludeId = 0) {
  if (!isDate(date)) return 'Select a valid date';
  if (date < today()) return 'Appointments cannot be booked in the past';
  if (new Date(date + 'T00:00:00').getDay() === 0) return 'The OPD is closed on Sundays';
  if (!SLOTS.includes(time)) return 'Select a valid time slot';
  if (date === today() && time <= nowHM()) return 'That time has already passed today';
  if (db.prepare("SELECT 1 FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status != 'Cancelled' AND id != ?").get(doctorId, date, time, excludeId))
    return 'The doctor already has an appointment in this slot';
  if (db.prepare("SELECT 1 FROM appointments WHERE patient_id = ? AND date = ? AND time = ? AND status != 'Cancelled' AND id != ?").get(patientId, date, time, excludeId))
    return 'The patient already has another appointment at this time';
  return null;
}

app.post('/api/appointments', auth('admin', 'receptionist', 'patient'), (req, res) => {
  const b = req.body || {};
  const patientId = req.user.role === 'patient' ? req.user.patient_id : Number(b.patient_id);
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return bad(res, 'Select a valid patient');
  const doctor = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'doctor' AND active = 1").get(b.doctor_id);
  if (!doctor) return bad(res, 'Select a valid doctor');
  const err = checkSlot(doctor.id, patientId, b.date, b.time);
  if (err) return bad(res, err);
  const id = Number(db.prepare('INSERT INTO appointments(patient_id, doctor_id, date, time, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(patientId, doctor.id, b.date, b.time, v(b.reason), req.user.id).lastInsertRowid);
  notify(doctor.id, 'New appointment', `${patient.name} (${patient.uid}) booked for ${b.date} at ${b.time}.`);
  notify(patientUserId(patientId), 'Appointment confirmed', `Your appointment with ${doctor.name} is on ${b.date} at ${b.time}.`);
  res.json({ id });
});

app.put('/api/appointments/:id', auth(), (req, res) => {
  const b = req.body || {};
  const a = db.prepare(`${APPT_SQL} WHERE a.id = ?`).get(req.params.id);
  if (!a) return bad(res, 'Appointment not found', 404);
  const role = req.user.role;
  const own = (role === 'patient' && a.patient_id === req.user.patient_id) || (role === 'doctor' && a.doctor_id === req.user.id);
  const allowed = {
    reschedule: role === 'admin' || role === 'receptionist' || (role === 'patient' && own),
    cancel: role === 'admin' || role === 'receptionist' || own,
    complete: role === 'admin' || (role === 'doctor' && own),
  };
  if (!(b.action in allowed)) return bad(res, 'Unknown action');
  if (!allowed[b.action]) return bad(res, `Access denied: you cannot ${b.action} this appointment`, 403);
  if (a.status !== 'Scheduled') return bad(res, `This appointment is already ${a.status.toLowerCase()}`);
  const pUser = patientUserId(a.patient_id);
  if (b.action === 'reschedule') {
    const err = checkSlot(a.doctor_id, a.patient_id, b.date, b.time, a.id);
    if (err) return bad(res, err);
    db.prepare('UPDATE appointments SET date = ?, time = ? WHERE id = ?').run(b.date, b.time, a.id);
    const msg = `Appointment of ${a.patient_name} with ${a.doctor_name} moved from ${a.date} ${a.time} to ${b.date} ${b.time}.`;
    notify(a.doctor_id, 'Appointment rescheduled', msg);
    notify(pUser, 'Appointment rescheduled', msg);
  } else if (b.action === 'cancel') {
    db.prepare("UPDATE appointments SET status = 'Cancelled' WHERE id = ?").run(a.id);
    const msg = `Appointment of ${a.patient_name} with ${a.doctor_name} on ${a.date} at ${a.time} was cancelled by ${req.user.name}.`;
    if (role !== 'doctor') notify(a.doctor_id, 'Appointment cancelled', msg);
    if (role !== 'patient') notify(pUser, 'Appointment cancelled', msg);
  } else {
    db.prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?").run(a.id);
  }
  res.json({ ok: true });
});

// ---------- Medical records (FR-05) ----------
const REC_SQL = `SELECT r.*, p.name AS patient_name, p.uid AS patient_uid, d.name AS doctor_name, dep.name AS department
  FROM medical_records r JOIN patients p ON p.id = r.patient_id JOIN users d ON d.id = r.doctor_id
  LEFT JOIN departments dep ON dep.id = d.department_id`;

app.get('/api/records', auth('admin', 'doctor', 'patient'), (req, res) => {
  const where = [], params = [];
  if (req.user.role === 'patient') { where.push('r.patient_id = ?'); params.push(req.user.patient_id); }
  if (req.query.patient_id) { where.push('r.patient_id = ?'); params.push(req.query.patient_id); }
  if (req.query.mine && req.user.role === 'doctor') { where.push('r.doctor_id = ?'); params.push(req.user.id); }
  if (req.query.q) { where.push('(p.name LIKE ? OR p.uid LIKE ? OR r.diagnosis LIKE ?)'); const q = `%${req.query.q}%`; params.push(q, q, q); }
  res.json(db.prepare(`${REC_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.visit_date DESC, r.id DESC LIMIT 300`).all(...params));
});

app.get('/api/records/:id', auth('admin', 'doctor', 'patient'), (req, res) => {
  const r = db.prepare(`${REC_SQL} WHERE r.id = ?`).get(req.params.id);
  if (!r) return bad(res, 'Record not found', 404);
  if (req.user.role === 'patient' && r.patient_id !== req.user.patient_id) return bad(res, 'Access denied', 403);
  res.json(r);
});

app.post('/api/records', auth('doctor'), (req, res) => {
  const b = req.body || {};
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(b.patient_id);
  if (!patient) return bad(res, 'Select a valid patient');
  if (!v(b.diagnosis)) return bad(res, 'Diagnosis is required');
  let appt = null;
  if (b.appointment_id) {
    appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(b.appointment_id);
    if (!appt || appt.patient_id !== patient.id || appt.doctor_id !== req.user.id) return bad(res, 'Appointment does not match this patient/doctor');
    if (appt.status === 'Cancelled') return bad(res, 'Cannot add a record to a cancelled appointment');
  }
  const id = tx(() => {
    const id = Number(db.prepare(`INSERT INTO medical_records(patient_id, doctor_id, appointment_id, visit_date, symptoms, diagnosis, treatment, prescription, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(patient.id, req.user.id, appt ? appt.id : null, appt ? appt.date : today(),
      v(b.symptoms), v(b.diagnosis), v(b.treatment), v(b.prescription), v(b.notes)).lastInsertRowid);
    if (appt && b.complete_appointment) db.prepare("UPDATE appointments SET status = 'Completed' WHERE id = ?").run(appt.id);
    return id;
  });
  notify(patientUserId(patient.id), 'Medical record updated', `${req.user.name} added a new record: ${v(b.diagnosis)}.`);
  if (appt && b.complete_appointment) {
    for (const u of db.prepare("SELECT id FROM users WHERE role = 'accountant' AND active = 1").all())
      notify(u.id, 'Ready for billing', `Consultation of ${patient.name} (${patient.uid}) with ${req.user.name} is completed.`);
  }
  res.json({ id });
});

app.put('/api/records/:id', auth('doctor'), (req, res) => {
  const b = req.body || {};
  const r = db.prepare('SELECT * FROM medical_records WHERE id = ?').get(req.params.id);
  if (!r) return bad(res, 'Record not found', 404);
  if (r.doctor_id !== req.user.id) return bad(res, 'Only the doctor who created this record can edit it', 403);
  if (!v(b.diagnosis)) return bad(res, 'Diagnosis is required');
  db.prepare('UPDATE medical_records SET symptoms = ?, diagnosis = ?, treatment = ?, prescription = ?, notes = ? WHERE id = ?')
    .run(v(b.symptoms), v(b.diagnosis), v(b.treatment), v(b.prescription), v(b.notes), r.id);
  res.json({ ok: true });
});

// ---------- Billing (FR-06) ----------
const BILL_SQL = `SELECT b.*, p.name AS patient_name, p.uid AS patient_uid, p.phone AS patient_phone,
  (SELECT d.name FROM appointments a JOIN users d ON d.id = a.doctor_id WHERE a.id = b.appointment_id) AS doctor_name
  FROM bills b JOIN patients p ON p.id = b.patient_id`;

app.get('/api/bills', auth('admin', 'accountant', 'receptionist', 'patient'), (req, res) => {
  const where = [], params = [];
  if (req.user.role === 'patient') { where.push('b.patient_id = ?'); params.push(req.user.patient_id); }
  if (req.query.status) { where.push('b.status = ?'); params.push(req.query.status); }
  if (req.query.patient_id) { where.push('b.patient_id = ?'); params.push(req.query.patient_id); }
  if (req.query.q) { where.push('(p.name LIKE ? OR p.uid LIKE ? OR b.bill_no LIKE ?)'); const q = `%${req.query.q}%`; params.push(q, q, q); }
  res.json(db.prepare(`${BILL_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.id DESC LIMIT 500`).all(...params));
});

app.get('/api/bills/unbilled', auth('admin', 'accountant'), (req, res) => {
  const params = [];
  let extra = '';
  if (req.query.patient_id) { extra = 'AND a.patient_id = ?'; params.push(req.query.patient_id); }
  res.json(db.prepare(`${APPT_SQL} WHERE a.status = 'Completed' AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.appointment_id = a.id) ${extra} ORDER BY a.date DESC`).all(...params));
});

app.get('/api/bills/:id', auth('admin', 'accountant', 'receptionist', 'patient'), (req, res) => {
  const bill = db.prepare(`${BILL_SQL} WHERE b.id = ?`).get(req.params.id);
  if (!bill) return bad(res, 'Bill not found', 404);
  if (req.user.role === 'patient' && bill.patient_id !== req.user.patient_id) return bad(res, 'Access denied', 403);
  res.json({
    bill,
    items: db.prepare('SELECT * FROM bill_items WHERE bill_id = ?').all(bill.id),
    patient: db.prepare('SELECT * FROM patients WHERE id = ?').get(bill.patient_id),
  });
});

app.post('/api/bills', auth('admin', 'accountant'), (req, res) => {
  const b = req.body || {};
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(b.patient_id);
  if (!patient) return bad(res, 'Select a valid patient');
  const items = (Array.isArray(b.items) ? b.items : []).map(i => ({ description: v(i.description), qty: Number(i.qty), unit_price: Number(i.unit_price) }));
  if (!items.length) return bad(res, 'Add at least one bill item');
  for (const i of items) {
    if (!i.description) return bad(res, 'Every item needs a description');
    if (!Number.isInteger(i.qty) || i.qty < 1) return bad(res, 'Quantity must be a whole number of at least 1');
    if (!(i.unit_price >= 0)) return bad(res, 'Price must be zero or more');
  }
  let appt = null;
  if (b.appointment_id) {
    appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND patient_id = ?').get(b.appointment_id, patient.id);
    if (!appt) return bad(res, 'Appointment does not belong to this patient');
    if (db.prepare('SELECT 1 FROM bills WHERE appointment_id = ?').get(appt.id)) return bad(res, 'A bill already exists for this appointment');
  }
  const subtotal = Math.round(items.reduce((s, i) => s + i.qty * i.unit_price, 0) * 100) / 100;
  const discount = Number(b.discount) || 0;
  const tax = Number(b.tax_percent) || 0;
  if (discount < 0 || discount > subtotal) return bad(res, 'Discount must be between 0 and the subtotal');
  if (tax < 0 || tax > 28) return bad(res, 'Tax must be between 0% and 28%');
  const total = Math.round((subtotal - discount) * (1 + tax / 100) * 100) / 100;
  const out = tx(() => {
    const id = Number(db.prepare('INSERT INTO bills(patient_id, appointment_id, subtotal, discount, tax_percent, total, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(patient.id, appt ? appt.id : null, subtotal, discount, tax, total, req.user.id).lastInsertRowid);
    const billNo = `INV-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
    db.prepare('UPDATE bills SET bill_no = ? WHERE id = ?').run(billNo, id);
    const ins = db.prepare('INSERT INTO bill_items(bill_id, description, qty, unit_price) VALUES (?, ?, ?, ?)');
    for (const i of items) ins.run(id, i.description, i.qty, i.unit_price);
    return { id, bill_no: billNo };
  });
  notify(patientUserId(patient.id), 'New bill generated', `Bill ${out.bill_no} for ₹${total.toFixed(2)} has been generated.`);
  res.json(out);
});

app.put('/api/bills/:id/pay', auth('admin', 'accountant'), (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return bad(res, 'Bill not found', 404);
  if (bill.status === 'Paid') return bad(res, 'This bill is already paid');
  const method = req.body?.payment_method;
  if (!['Cash', 'Card', 'UPI', 'Insurance'].includes(method)) return bad(res, 'Select a payment method');
  db.prepare("UPDATE bills SET status = 'Paid', payment_method = ?, paid_at = ? WHERE id = ?").run(method, nowStr(), bill.id);
  notify(patientUserId(bill.patient_id), 'Payment received', `Payment of ₹${bill.total.toFixed(2)} for ${bill.bill_no} received via ${method}. Thank you!`);
  res.json({ ok: true });
});

// ---------- Notifications (FR-07) ----------
app.get('/api/notifications', auth(), (req, res) => {
  res.json({
    items: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100').all(req.user.id),
    unread: db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id).c,
  });
});
app.post('/api/notifications/read', auth(), (req, res) => {
  if (req.body?.id) db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.body.id, req.user.id);
  else db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

// ---------- Dashboard & reports (FR-08) ----------
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);

app.get('/api/dashboard', auth(), (req, res) => {
  const t = today();
  const u = req.user;
  const out = { today: t };
  if (u.role === 'patient') {
    out.upcoming = all(`${APPT_SQL} WHERE a.patient_id = ? AND a.status = 'Scheduled' AND a.date >= ? ORDER BY a.date, a.time`, u.patient_id, t);
    out.records = all(`${REC_SQL} WHERE r.patient_id = ? ORDER BY r.visit_date DESC LIMIT 3`, u.patient_id);
    out.dues = one("SELECT COUNT(*) AS n, COALESCE(SUM(total),0) AS amount FROM bills WHERE patient_id = ? AND status = 'Unpaid'", u.patient_id);
    out.visits = one("SELECT COUNT(*) AS c FROM appointments WHERE patient_id = ? AND status = 'Completed'", u.patient_id).c;
    return res.json(out);
  }
  const docFilter = u.role === 'doctor' ? 'AND a.doctor_id = ' + Number(u.id) : '';
  out.todayAppointments = all(`${APPT_SQL} WHERE a.date = ? ${docFilter} ORDER BY a.time`, t);
  out.stats = {
    patients: one('SELECT COUNT(*) AS c FROM patients').c,
    newPatients: one("SELECT COUNT(*) AS c FROM patients WHERE created_at >= date('now','localtime','-30 days')").c,
    doctors: one("SELECT COUNT(*) AS c FROM users WHERE role = 'doctor' AND active = 1").c,
    staff: one("SELECT COUNT(*) AS c FROM users WHERE role != 'patient' AND active = 1").c,
    todayTotal: out.todayAppointments.length,
    todayPending: out.todayAppointments.filter(a => a.status === 'Scheduled').length,
    upcoming: one(`SELECT COUNT(*) AS c FROM appointments a WHERE a.date > ? AND a.status = 'Scheduled' ${docFilter}`, t).c,
    revenueToday: one("SELECT COALESCE(SUM(total),0) AS s FROM bills WHERE status = 'Paid' AND substr(paid_at,1,10) = ?", t).s,
    revenueMonth: one("SELECT COALESCE(SUM(total),0) AS s FROM bills WHERE status = 'Paid' AND paid_at >= date('now','localtime','-30 days')").s,
    pendingBills: one("SELECT COUNT(*) AS c FROM bills WHERE status = 'Unpaid'").c,
    pendingAmount: one("SELECT COALESCE(SUM(total),0) AS s FROM bills WHERE status = 'Unpaid'").s,
    unbilled: one("SELECT COUNT(*) AS c FROM appointments a WHERE a.status = 'Completed' AND NOT EXISTS (SELECT 1 FROM bills b WHERE b.appointment_id = a.id)").c,
  };
  if (u.role === 'doctor') {
    out.stats.seen = one("SELECT COUNT(DISTINCT patient_id) AS c FROM appointments WHERE doctor_id = ? AND status = 'Completed'", u.id).c;
    out.stats.recordsMonth = one('SELECT COUNT(*) AS c FROM medical_records WHERE doctor_id = ? AND substr(visit_date,1,7) = ?', u.id, t.slice(0, 7)).c;
    out.upcomingList = all(`${APPT_SQL} WHERE a.date > ? AND a.status = 'Scheduled' AND a.doctor_id = ? ORDER BY a.date, a.time LIMIT 8`, t, u.id);
  }
  if (u.role === 'admin' || u.role === 'accountant') {
    out.revenueByDay = all(`SELECT substr(paid_at,1,10) AS day, SUM(total) AS amount FROM bills WHERE status = 'Paid' AND paid_at >= date('now','localtime','-13 days') GROUP BY day ORDER BY day`);
    out.recentBills = all(`${BILL_SQL} ORDER BY b.id DESC LIMIT 6`);
  }
  if (u.role === 'admin' || u.role === 'receptionist') {
    out.recentPatients = all('SELECT * FROM patients ORDER BY id DESC LIMIT 5');
    out.byDepartment = all(`SELECT dep.name AS label, COUNT(a.id) AS value FROM departments dep LEFT JOIN users d ON d.department_id = dep.id
      LEFT JOIN appointments a ON a.doctor_id = d.id AND a.date >= date('now','localtime','-30 days') AND a.status != 'Cancelled' GROUP BY dep.id ORDER BY value DESC`);
  }
  res.json(out);
});

app.get('/api/reports', auth('admin', 'accountant'), (req, res) => {
  const from = isDate(req.query.from) ? req.query.from : (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
  const to = isDate(req.query.to) ? req.query.to : today();
  res.json({
    from, to,
    summary: one(`SELECT
      (SELECT COUNT(*) FROM appointments WHERE date BETWEEN $from AND $to) AS appointments,
      (SELECT COUNT(*) FROM appointments WHERE date BETWEEN $from AND $to AND status = 'Completed') AS completed,
      (SELECT COUNT(*) FROM appointments WHERE date BETWEEN $from AND $to AND status = 'Cancelled') AS cancelled,
      (SELECT COUNT(*) FROM patients WHERE substr(created_at,1,10) BETWEEN $from AND $to) AS new_patients,
      (SELECT COALESCE(SUM(total),0) FROM bills WHERE status = 'Paid' AND substr(paid_at,1,10) BETWEEN $from AND $to) AS revenue,
      (SELECT COALESCE(SUM(total),0) FROM bills WHERE status = 'Unpaid' AND substr(created_at,1,10) BETWEEN $from AND $to) AS outstanding,
      (SELECT COUNT(*) FROM bills WHERE substr(created_at,1,10) BETWEEN $from AND $to) AS bills`, { from, to }),
    revenueByMonth: all(`SELECT substr(paid_at,1,7) AS month, SUM(total) AS amount, COUNT(*) AS bills FROM bills
      WHERE status = 'Paid' AND substr(paid_at,1,10) BETWEEN $from AND $to GROUP BY month ORDER BY month`, { from, to }),
    byDepartment: all(`SELECT dep.name AS department, COUNT(a.id) AS appointments, SUM(a.status = 'Completed') AS completed,
      COALESCE((SELECT SUM(b.total) FROM bills b JOIN appointments a2 ON a2.id = b.appointment_id JOIN users d2 ON d2.id = a2.doctor_id
        WHERE d2.department_id = dep.id AND b.status = 'Paid' AND substr(b.paid_at,1,10) BETWEEN $from AND $to), 0) AS revenue
      FROM departments dep LEFT JOIN users d ON d.department_id = dep.id AND d.role = 'doctor'
      LEFT JOIN appointments a ON a.doctor_id = d.id AND a.date BETWEEN $from AND $to GROUP BY dep.id ORDER BY appointments DESC`, { from, to }),
    byDoctor: all(`SELECT d.name AS doctor, dep.name AS department, COUNT(a.id) AS appointments, SUM(a.status = 'Completed') AS completed,
      SUM(a.status = 'Cancelled') AS cancelled, COUNT(DISTINCT a.patient_id) AS patients
      FROM users d LEFT JOIN departments dep ON dep.id = d.department_id LEFT JOIN appointments a ON a.doctor_id = d.id AND a.date BETWEEN $from AND $to
      WHERE d.role = 'doctor' GROUP BY d.id ORDER BY appointments DESC`, { from, to }),
    paymentMethods: all(`SELECT payment_method AS method, COUNT(*) AS count, SUM(total) AS amount FROM bills
      WHERE status = 'Paid' AND substr(paid_at,1,10) BETWEEN $from AND $to GROUP BY payment_method ORDER BY amount DESC`, { from, to }),
    topDiagnoses: all(`SELECT diagnosis, COUNT(*) AS count FROM medical_records WHERE visit_date BETWEEN $from AND $to GROUP BY diagnosis ORDER BY count DESC LIMIT 8`, { from, to }),
  });
});

app.get('/api/reports/export/:type', auth('admin', 'accountant'), (req, res) => {
  const sets = {
    patients: () => all('SELECT uid, name, gender, dob, blood_group, phone, email, address, allergies, created_at FROM patients ORDER BY id'),
    appointments: () => all(`SELECT a.id, a.date, a.time, p.uid AS patient_id, p.name AS patient, d.name AS doctor, dep.name AS department, a.reason, a.status
      FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN users d ON d.id = a.doctor_id LEFT JOIN departments dep ON dep.id = d.department_id ORDER BY a.date, a.time`),
    bills: () => all(`SELECT b.bill_no, substr(b.created_at,1,10) AS date, p.uid AS patient_id, p.name AS patient, b.subtotal, b.discount, b.tax_percent, b.total, b.status, b.payment_method, b.paid_at
      FROM bills b JOIN patients p ON p.id = b.patient_id ORDER BY b.id`),
  };
  if (!sets[req.params.type]) return bad(res, 'Unknown report', 404);
  const rows = sets[req.params.type]();
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const cell = x => (x === null || x === undefined ? '' : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}-${today()}.csv"`);
  res.send('﻿' + csv);
});

app.use('/api', (req, res) => bad(res, 'Not found', 404));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`\n  MediCore HMS running at  http://localhost:${PORT}\n`));
