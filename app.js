// ============================================================
// app.js — Cricket Turf Booking App v2
// V1 preserved exactly. Login page added with Customer/Admin tabs.
// No bcrypt — simple password stored in env/config for admin,
// customers just need name + mobile (no password needed).
// ============================================================

const express = require('express');
const session = require('express-session');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── File paths ──────────────────────────────────────────────
const BOOKINGS_FILE = path.join(__dirname, 'data', 'bookings.json');
const SLOTS_FILE    = path.join(__dirname, 'data', 'slots.json');
const GROUNDS_FILE  = path.join(__dirname, 'data', 'grounds.json');

// ── Admin credentials (simple, no bcrypt needed) ───────────
const ADMIN_EMAIL    = 'admin@turf.com';
const ADMIN_PASSWORD = 'admin123';

// ── Helper: read / write JSON files ────────────────────────
function readJSON(filePath, defaultVal = []) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return defaultVal; }
}
function writeJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Seed default time slots ─────────────────────────────────
if (!fs.existsSync(SLOTS_FILE)) {
  writeJSON(SLOTS_FILE, [
    '06:00 AM – 07:00 AM',
    '07:00 AM – 08:00 AM',
    '08:00 AM – 09:00 AM',
    '04:00 PM – 05:00 PM',
    '05:00 PM – 06:00 PM',
    '06:00 PM – 07:00 PM',
    '07:00 PM – 08:00 PM',
    '08:00 PM – 09:00 PM',
    '09:00 PM – 10:00 PM',
  ]);
}
if (!fs.existsSync(BOOKINGS_FILE)) writeJSON(BOOKINGS_FILE, []);

// ── Seed default grounds (two separate locations) ───────────
if (!fs.existsSync(GROUNDS_FILE)) {
  writeJSON(GROUNDS_FILE, [
    {
      id: 'mens',
      name: "Men's Turf Ground",
      address: 'MG Road, Vijayawada',
      icon: '🏏',
      color: '#1B4332',
      description: 'Full-size turf with professional pitch and floodlights.'
    },
    {
      id: 'womens',
      name: "Women's Turf Ground",
      address: 'Riverside Road, Vijayawada',
      icon: '🏟️',
      color: '#7b1d6b',
      description: 'Dedicated turf ground with changing rooms and floodlights.'
    }
  ]);
}

// ── Middleware ──────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'cricket-turf-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// Make user available in all views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// ── Auth guards ─────────────────────────────────────────────
function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.redirect('/login?tab=admin');
  next();
}
function requireCustomer(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
  next();
}

// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// Show login page (single page, two tabs: customer / admin)
app.get('/login', (req, res) => {
  if (req.session.user) {
    return req.session.user.role === 'admin'
      ? res.redirect('/admin/dashboard')
      : res.redirect('/');
  }
  res.render('login', {
    error: null,
    tab: req.query.tab || 'customer'   // which tab to show by default
  });
});

// Customer login (just name + mobile, no password)
app.post('/login/customer', (req, res) => {
  const { name, mobile } = req.body;
  const mobileRx = /^[6-9]\d{9}$/;
  if (!name || !name.trim()) {
    return res.render('login', { error: 'Please enter your name.', tab: 'customer' });
  }
  if (!mobileRx.test(mobile)) {
    return res.render('login', { error: 'Enter a valid 10-digit Indian mobile number.', tab: 'customer' });
  }
  req.session.user = {
    id: 'cust-' + mobile,
    name: name.trim(),
    mobile,
    role: 'customer'
  };
  res.redirect('/');
});

// Admin login (email + password)
app.post('/login/admin', (req, res) => {
  const { email, password } = req.body;
  if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.user = { id: 'admin-1', name: 'Admin', email: ADMIN_EMAIL, role: 'admin' };
    return res.redirect('/admin/dashboard');
  }
  res.render('login', { error: 'Invalid admin email or password.', tab: 'admin' });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ══════════════════════════════════════════════════════════════
//  PUBLIC / CUSTOMER ROUTES  (V1 — unchanged)
// ══════════════════════════════════════════════════════════════

// Home page
app.get('/', requireLogin, (req, res) => {
  if (req.session.user.role === 'admin') return res.redirect('/admin/dashboard');
  const slots   = readJSON(SLOTS_FILE);
  const grounds = readJSON(GROUNDS_FILE);
  res.render('home', { slots, grounds });
});

// Step 1: Choose a ground/location
app.get('/book', requireCustomer, (req, res) => {
  const grounds = readJSON(GROUNDS_FILE);
  res.render('choose-ground', { grounds });
});

// Step 2: Booking form for a specific ground
app.get('/book/:groundId', requireCustomer, (req, res) => {
  const grounds = readJSON(GROUNDS_FILE);
  const ground  = grounds.find(g => g.id === req.params.groundId);
  if (!ground) return res.redirect('/book');
  const slots = readJSON(SLOTS_FILE);
  res.render('booking', { slots, ground, error: null });
});

// Submit booking for a specific ground
app.post('/book/:groundId', requireCustomer, (req, res) => {
  const grounds = readJSON(GROUNDS_FILE);
  const ground  = grounds.find(g => g.id === req.params.groundId);
  if (!ground) return res.redirect('/book');

  const { customerName, mobile, bookingDate, timeSlot } = req.body;
  const slots    = readJSON(SLOTS_FILE);
  const bookings = readJSON(BOOKINGS_FILE);

  // Validations (same as v1)
  const mobileRx = /^[6-9]\d{9}$/;
  if (!mobileRx.test(mobile)) {
    return res.render('booking', { slots, ground, error: 'Enter a valid 10-digit Indian mobile number.' });
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (new Date(bookingDate) < today) {
    return res.render('booking', { slots, ground, error: 'Booking date cannot be in the past.' });
  }
  if (!slots.includes(timeSlot)) {
    return res.render('booking', { slots, ground, error: 'Invalid time slot selected.' });
  }
  // Clash check is scoped to this ground — same slot on a different ground is fine
  const clash = bookings.find(b =>
    b.groundId === ground.id && b.bookingDate === bookingDate &&
    b.timeSlot === timeSlot && b.status !== 'cancelled'
  );
  if (clash) {
    return res.render('booking', { slots, ground, error: 'This slot is already booked at this ground. Please choose another.' });
  }

  const booking = {
    id: 'BK-' + Date.now(),
    userId: req.session.user.id,
    customerName: customerName.trim(),
    mobile,
    groundId: ground.id,
    groundName: ground.name,
    bookingDate,
    timeSlot,
    payment: 'Pay at Venue',
    paymentStatus: 'Pending',
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  bookings.push(booking);
  writeJSON(BOOKINGS_FILE, bookings);
  res.redirect('/confirmation/' + booking.id);
});

// Confirmation page
app.get('/confirmation/:id', requireCustomer, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const booking  = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.redirect('/book');
  // Ownership check — a customer should only see their own booking
  if (booking.userId !== req.session.user.id) return res.status(403).render('403');
  res.render('confirmation', { booking, paid: req.query.paid === '1' });
});

// ── Mock payment ────────────────────────────────────────────
// Show fake payment page
app.get('/pay/:id', requireCustomer, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const booking  = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.redirect('/bookings');
  if (booking.userId !== req.session.user.id) return res.status(403).render('403');
  if (booking.paymentStatus === 'Received') return res.redirect('/confirmation/' + booking.id);
  res.render('pay', { booking, error: null });
});

// "Process" the fake payment — always succeeds
app.post('/pay/:id', requireCustomer, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.redirect('/bookings');
  if (bookings[idx].userId !== req.session.user.id) return res.status(403).render('403');
  bookings[idx].payment       = 'Online (Mock)';
  bookings[idx].paymentStatus = 'Received';
  writeJSON(BOOKINGS_FILE, bookings);
  res.redirect('/confirmation/' + bookings[idx].id + '?paid=1');
});

// All bookings (customer view — v1 page)
app.get('/bookings', requireCustomer, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE)
    .filter(b => b.userId === req.session.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('bookings-list', { bookings });
});

// ══════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ══════════════════════════════════════════════════════════════

// Dashboard
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const stats = {
    total:     bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };
  const recent = [...bookings]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
  res.render('admin/dashboard', { stats, recent });
});

// All bookings
app.get('/admin/bookings', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/bookings', { bookings });
});

// Cancel booking
app.post('/admin/bookings/:id/cancel', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx !== -1) { bookings[idx].status = 'cancelled'; writeJSON(BOOKINGS_FILE, bookings); }
  res.redirect('/admin/bookings');
});

// Delete booking
app.post('/admin/bookings/:id/delete', requireAdmin, (req, res) => {
  let bookings = readJSON(BOOKINGS_FILE).filter(b => b.id !== req.params.id);
  writeJSON(BOOKINGS_FILE, bookings);
  res.redirect('/admin/bookings');
});

// Payments
app.get('/admin/payments', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.render('admin/payments', { bookings });
});

app.post('/admin/payments/:id/mark-paid', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  const idx = bookings.findIndex(b => b.id === req.params.id);
  if (idx !== -1) { bookings[idx].paymentStatus = 'Received'; writeJSON(BOOKINGS_FILE, bookings); }
  res.redirect('/admin/payments');
});

// Customers
app.get('/admin/customers', requireAdmin, (req, res) => {
  const bookings = readJSON(BOOKINGS_FILE);
  // Derive unique customers from bookings
  const map = {};
  bookings.forEach(b => {
    if (!map[b.userId]) {
      map[b.userId] = {
        name: b.customerName,
        mobile: b.mobile,
        bookingCount: 0,
        userId: b.userId,
        firstBookingAt: b.createdAt
      };
    }
    map[b.userId].bookingCount++;
    if (new Date(b.createdAt) < new Date(map[b.userId].firstBookingAt)) {
      map[b.userId].firstBookingAt = b.createdAt;
    }
  });
  const customers = Object.values(map);
  res.render('admin/customers', { customers });
});

// Manage slots
app.get('/admin/slots', requireAdmin, (req, res) => {
  res.render('admin/slots', { slots: readJSON(SLOTS_FILE) });
});
app.post('/admin/slots/add', requireAdmin, (req, res) => {
  const slots = readJSON(SLOTS_FILE);
  const slot  = req.body.slot.trim();
  if (slot && !slots.includes(slot)) { slots.push(slot); writeJSON(SLOTS_FILE, slots); }
  res.redirect('/admin/slots');
});
app.post('/admin/slots/delete', requireAdmin, (req, res) => {
  writeJSON(SLOTS_FILE, readJSON(SLOTS_FILE).filter(s => s !== req.body.slot));
  res.redirect('/admin/slots');
});

// ── 404 ────────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('404'));

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🏏 Cricket Turf Booking → http://localhost:${PORT}`);
  console.log(`   Admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log(`   Customer: just enter your name + mobile number`);
});