// keep dotenv absolutely first
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from './firebase.js';
import chat from './routes/chat.js'; // optional (Gemini). Safe if GEMINI_API_KEY is blank.

const app = express();
const PORT = parseInt(process.env.PORT || '8080', 10);
const ORIGIN = process.env.APP_ORIGIN || 'http://localhost:5178';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

/* ============================
   AUTH (exactly as requested)
============================ */
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

  const users = await db.collection('users').where('email', '==', email).get();
  if (!users.empty) return res.status(400).json({ message: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 8);
  const docRef = await db.collection('users').add({ name, email, password: hash, createdAt: Date.now() });
  const token = jwt.sign({ id: docRef.id, name, email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const snap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) return res.status(400).json({ message: 'User not found' });

  const user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  if (!bcrypt.compareSync(password, user.password)) return res.status(400).json({ message: 'Invalid password' });

  const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

/* ============================
   ORDERS (exactly as requested)
============================ */
app.post('/api/orders/checkout', async (req, res) => {
  const { items, address, paymentMethod, upiReference } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'No items' });

  const order = {
    items,
    address,
    paymentMethod: paymentMethod || 'cod',
    upiReference: upiReference || null,
    status: 'Placed',
    createdAt: Date.now(),
  };
  const doc = await db.collection('orders').add(order);
  res.json({ orderId: doc.id });
});

// For demo: returns all orders (no auth filter)
app.get('/api/orders/my', async (req, res) => {
  const snap = await db.collection('orders').orderBy('createdAt', 'desc').get();
  const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  res.json({ orders });
});

/* Chatbot (optional) */
app.use('/api/chat', chat);

const srv = app.listen(PORT, () => {
  console.log('DigitGenius API ' + `http://localhost:${PORT}`);
});
srv.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    const p = PORT + 1;
    app.listen(p, () => console.log('Port busy, moved to http://localhost:' + p));
  } else throw e;
});
