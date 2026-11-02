// Database layer: schema, password hashing and demo seed data (SQLite via node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DB_PATH = process.env.HMS_DB || path.join(__dirname, 'data', 'hms.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);
CREATE TABLE IF NOT EXISTS patients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT UNIQUE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male','Female','Other')),
  dob TEXT NOT NULL,
  blood_group TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  emergency_contact TEXT,
  allergies TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','receptionist','doctor','accountant','patient')),
  email TEXT,
  phone TEXT,
  department_id INTEGER REFERENCES departments(id),
  specialization TEXT,
  consultation_fee REAL DEFAULT 0,
  patient_id INTEGER REFERENCES patients(id),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'Scheduled' CHECK (status IN ('Scheduled','Completed','Cancelled')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS medical_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  doctor_id INTEGER NOT NULL REFERENCES users(id),
  appointment_id INTEGER REFERENCES appointments(id),
  visit_date TEXT NOT NULL,
  symptoms TEXT,
  diagnosis TEXT NOT NULL,
  treatment TEXT,
  prescription TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_no TEXT UNIQUE,
  patient_id INTEGER NOT NULL REFERENCES patients(id),
  appointment_id INTEGER REFERENCES appointments(id),
  subtotal REAL NOT NULL,
  discount REAL NOT NULL DEFAULT 0,
  tax_percent REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid','Paid')),
  payment_method TEXT,
  paid_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_date ON appointments(doctor_id, date, time);
CREATE INDEX IF NOT EXISTS idx_appt_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_records_patient ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read);
`);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(String(password), salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return stored.length === h.length && crypto.timingSafeEqual(h, stored);
}

const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const nowStr = () => { const d = new Date(); return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

// Appointment slots: 09:00 - 16:30 every 30 minutes, lunch break 13:00-14:00
const SLOTS = [];
for (let h = 9; h < 17; h++) for (const m of [0, 30]) if (h !== 13) SLOTS.push(`${pad(h)}:${pad(m)}`);

function seed() {
  let r = 42; // deterministic pseudo-random so the demo data is stable
  const rand = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = a => a[Math.floor(rand() * a.length)];

  db.exec('BEGIN');
  try {
    const depts = [
      ['General Medicine', 'Primary care and internal medicine'],
      ['Cardiology', 'Heart and blood vessel care'],
      ['Orthopedics', 'Bones, joints and muscles'],
      ['Pediatrics', 'Care for infants and children'],
      ['Neurology', 'Brain and nervous system'],
      ['Dermatology', 'Skin, hair and nails'],
    ];
    const insDept = db.prepare('INSERT INTO departments(name, description) VALUES (?, ?)');
    const deptId = {};
    for (const [n, d] of depts) deptId[n] = Number(insDept.run(n, d).lastInsertRowid);

    const insUser = db.prepare(`INSERT INTO users(username, password_hash, salt, name, role, email, phone, department_id, specialization, consultation_fee, patient_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addUser = (username, pw, name, role, phone, dept = null, spec = null, fee = 0, pid = null) => {
      const { salt, hash } = hashPassword(pw);
      return Number(insUser.run(username, hash, salt, name, role, `${username.replace(/\W/g, '')}@medicore.in`, phone, dept, spec, fee, pid).lastInsertRowid);
    };

    addUser('admin', 'admin123', 'Anita Verma', 'admin', '9810000001');
    addUser('reception', 'reception123', 'Rohit Mehra', 'receptionist', '9810000002');
    addUser('reception2', 'reception123', 'Pooja Nair', 'receptionist', '9810000003');
    addUser('accounts', 'accounts123', 'Vikram Bansal', 'accountant', '9810000004');

    const doctorDefs = [
      ['doctor', 'Dr. Arjun Sharma', 'General Medicine', 'General Physician', 500],
      ['dr.iyer', 'Dr. Meera Iyer', 'Cardiology', 'Cardiologist', 1200],
      ['dr.khan', 'Dr. Imran Khan', 'Orthopedics', 'Orthopedic Surgeon', 900],
      ['dr.das', 'Dr. Ritu Das', 'Pediatrics', 'Pediatrician', 700],
      ['dr.rao', 'Dr. Sanjay Rao', 'Neurology', 'Neurologist', 1100],
      ['dr.kapoor', 'Dr. Neha Kapoor', 'Dermatology', 'Dermatologist', 800],
    ];
    const doctors = doctorDefs.map(([u, n, dep, spec, fee], i) => ({
      id: addUser(u, 'doctor123', n, 'doctor', `98200000${pad(i + 1)}`, deptId[dep], spec, fee), dept: dep, fee, name: n,
    }));

    const people = [
      ['Rahul Gupta', 'Male', '1988-04-12', 'B+'], ['Priya Singh', 'Female', '1992-09-03', 'O+'],
      ['Amit Kumar', 'Male', '1975-01-25', 'A+'], ['Sneha Patel', 'Female', '2001-06-17', 'AB+'],
      ['Karan Malhotra', 'Male', '1966-11-30', 'O-'], ['Ananya Roy', 'Female', '2015-03-08', 'B+'],
      ['Suresh Reddy', 'Male', '1958-07-21', 'A-'], ['Kavya Menon', 'Female', '1995-12-02', 'O+'],
      ['Deepak Joshi', 'Male', '1983-02-14', 'B-'], ['Ishita Chatterjee', 'Female', '1990-08-29', 'A+'],
      ['Manoj Tiwari', 'Male', '1970-05-05', 'O+'], ['Riya Sen', 'Female', '2018-10-11', 'B+'],
      ['Arvind Pillai', 'Male', '1962-03-19', 'AB-'], ['Neelam Yadav', 'Female', '1986-01-07', 'A+'],
      ['Siddharth Bose', 'Male', '1999-09-23', 'O+'], ['Fatima Sheikh', 'Female', '1979-04-15', 'B+'],
      ['Harish Choudhary', 'Male', '1954-12-28', 'A+'], ['Tanvi Desai', 'Female', '2004-07-09', 'O-'],
      ['Gaurav Saxena', 'Male', '1993-11-16', 'B+'], ['Lakshmi Krishnan', 'Female', '1968-06-26', 'AB+'],
    ];
    const cities = ['Sector 14, Gurugram', 'Salt Lake, Kolkata', 'Andheri West, Mumbai', 'Koramangala, Bengaluru', 'Rajouri Garden, New Delhi', 'Anna Nagar, Chennai'];
    const allergies = ['None', 'None', 'None', 'Penicillin', 'Dust', 'Peanuts', 'Sulfa drugs', 'None'];
    const insPatient = db.prepare(`INSERT INTO patients(uid, name, gender, dob, blood_group, phone, email, address, emergency_contact, allergies, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const patientIds = [];
    people.forEach(([name, g, dob, bg], i) => {
      const reg = new Date(); reg.setDate(reg.getDate() - (60 - i * 2));
      const id = Number(insPatient.run(`P${String(i + 1).padStart(4, '0')}`, name, g, dob, bg, `9${String(700000000 + i * 1234567).slice(0, 9)}`,
        `${name.split(' ')[0].toLowerCase()}@example.com`, pick(cities), `9${String(600000000 + i * 7654321).slice(0, 9)}`, pick(allergies), `${ymd(reg)} 10:00:00`).lastInsertRowid);
      patientIds.push(id);
    });
    // Patient portal account linked to P0001
    addUser('patient', 'patient123', 'Rahul Gupta', 'patient', '9700000000', null, null, 0, patientIds[0]);

    const clinical = {
      'General Medicine': [['Fever, body ache', 'Viral fever', 'Rest, fluids', 'Paracetamol 650mg TDS x 3 days'], ['Cough, sore throat', 'Upper respiratory infection', 'Steam inhalation', 'Azithromycin 500mg OD x 3 days'], ['Fatigue, frequent urination', 'Type 2 Diabetes', 'Diet control, exercise', 'Metformin 500mg BD']],
      'Cardiology': [['Chest discomfort on exertion', 'Stable angina', 'ECG, lifestyle changes', 'Aspirin 75mg OD, Atorvastatin 20mg'], ['Headache, high BP readings', 'Hypertension', 'Low-salt diet, BP monitoring', 'Amlodipine 5mg OD'], ['Palpitations', 'Arrhythmia (benign)', 'Holter monitoring', 'Metoprolol 25mg OD']],
      'Orthopedics': [['Knee pain while walking', 'Osteoarthritis knee', 'Physiotherapy', 'Diclofenac gel, Calcium + D3'], ['Lower back pain', 'Lumbar strain', 'Rest, hot compress', 'Etoricoxib 60mg x 5 days'], ['Wrist swelling after fall', 'Wrist sprain', 'Crepe bandage, X-ray', 'Ibuprofen 400mg BD']],
      'Pediatrics': [['Fever, runny nose', 'Common cold', 'Fluids, rest', 'Paracetamol syrup 5ml SOS'], ['Loose stools', 'Acute gastroenteritis', 'ORS, light diet', 'Zinc syrup, ORS'], ['Routine check-up', 'Healthy child – vaccination due', 'Vaccination administered', 'None']],
      'Neurology': [['Recurrent headaches', 'Migraine', 'Avoid triggers, sleep hygiene', 'Naproxen 500mg SOS, Propranolol 20mg'], ['Tingling in hands', 'Peripheral neuropathy', 'Nerve conduction study', 'Methylcobalamin 1500mcg OD'], ['Dizziness', 'Vertigo (BPPV)', 'Epley manoeuvre', 'Betahistine 16mg TDS']],
      'Dermatology': [['Itchy rash', 'Allergic dermatitis', 'Avoid allergen', 'Cetirizine 10mg, Hydrocortisone cream'], ['Acne on face', 'Acne vulgaris', 'Skin care routine', 'Adapalene gel, Clindamycin gel'], ['Dry scaly patches', 'Eczema', 'Moisturise regularly', 'Emollient cream, Mometasone']],
    };
    const reasons = ['Follow-up visit', 'New consultation', 'Routine check-up', 'Review of reports', 'Persistent symptoms'];
    const extras = [['Blood test (CBC)', 350], ['X-Ray', 600], ['ECG', 400], ['Medicines', 450], ['Dressing', 150]];

    const insAppt = db.prepare('INSERT INTO appointments(patient_id, doctor_id, date, time, reason, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 2, ?)');
    const insRec = db.prepare('INSERT INTO medical_records(patient_id, doctor_id, appointment_id, visit_date, symptoms, diagnosis, treatment, prescription, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insBill = db.prepare('INSERT INTO bills(bill_no, patient_id, appointment_id, subtotal, discount, tax_percent, total, status, payment_method, paid_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 4, ?)');
    const insItem = db.prepare('INSERT INTO bill_items(bill_id, description, qty, unit_price) VALUES (?, ?, ?, ?)');
    const taken = new Set();
    let billSeq = 0;
    const tdy = today();
    const nowHM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;

    for (let off = -150; off <= 7; off++) {
      const d = new Date(); d.setDate(d.getDate() + off);
      if (d.getDay() === 0) continue; // closed on Sundays
      const date = ymd(d);
      const count = off === 0 ? 6 : off > 0 ? 3 : (off < -60 ? 2 : 3) + Math.floor(rand() * 2);
      for (let k = 0; k < count; k++) {
        // ensure P0001 (patient portal) has visible history and an upcoming visit
        const pid = (off === 2 && k === 0) || (off % 17 === 0 && k === 0) ? patientIds[0] : pick(patientIds);
        const doc = off === 0 && k < 3 ? doctors[0] : pick(doctors);
        let time, tries = 0;
        do { time = pick(SLOTS); tries++; } while ((taken.has(`${doc.id}|${date}|${time}`) || taken.has(`p${pid}|${date}|${time}`)) && tries < 30);
        if (tries >= 30) continue;
        taken.add(`${doc.id}|${date}|${time}`); taken.add(`p${pid}|${date}|${time}`);
        let status = 'Scheduled';
        if (date < tdy || (date === tdy && time < nowHM && rand() < 0.7)) status = rand() < 0.9 ? 'Completed' : 'Cancelled';
        const created = new Date(d); created.setDate(created.getDate() - 2);
        const apptId = Number(insAppt.run(pid, doc.id, date, time, pick(reasons), status, `${ymd(created)} 11:00:00`).lastInsertRowid);
        if (status !== 'Completed') continue;
        const [sym, dx, tr, rx] = pick(clinical[doc.dept]);
        insRec.run(pid, doc.id, apptId, date, sym, dx, tr, rx, rand() < 0.4 ? 'Review after 2 weeks' : null, `${date} ${time}:00`);
        const items = [[`Consultation – ${doc.name}`, 1, doc.fee]];
        if (rand() < 0.5) { const [desc, price] = pick(extras); items.push([desc, 1, price]); }
        const subtotal = items.reduce((s, [, q, p]) => s + q * p, 0);
        const discount = rand() < 0.15 ? 100 : 0;
        const paid = off < -2 ? rand() < 0.92 : rand() < 0.5;
        billSeq++;
        const billNo = `INV-${d.getFullYear()}-${String(billSeq).padStart(4, '0')}`;
        const billId = Number(insBill.run(billNo, pid, apptId, subtotal, discount, subtotal - discount, paid ? 'Paid' : 'Unpaid',
          paid ? pick(['Cash', 'UPI', 'Card', 'UPI']) : null, paid ? `${date} 18:00:00` : null, `${date} 17:00:00`).lastInsertRowid);
        for (const [desc, q, p] of items) insItem.run(billId, desc, q, p);
      }
    }

    const insN = db.prepare('INSERT INTO notifications(user_id, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?)');
    const n = nowStr();
    insN.run(1, 'Welcome to MediCore HMS', 'System initialised with demo data. Review staff accounts under Staff & Doctors.', 0, n);
    insN.run(2, 'Front desk', 'Today\'s appointment list is ready. Please confirm patient arrivals.', 0, n);
    insN.run(4, 'Pending dues', 'Some bills are still unpaid. Check the Billing module.', 0, n);
    insN.run(doctors[0].id, 'Today\'s schedule', 'You have appointments scheduled for today.', 0, n);
    const pu = db.prepare("SELECT id FROM users WHERE role='patient'").get().id;
    insN.run(pu, 'Upcoming appointment', 'You have an upcoming appointment. View it under My Appointments.', 0, n);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c === 0) {
  seed();
  console.log('Database created with demo data at', DB_PATH);
}

module.exports = { db, hashPassword, verifyPassword, today, nowStr, SLOTS };
