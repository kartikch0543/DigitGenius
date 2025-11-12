import express from 'express';
import fetch from 'node-fetch';

const router = express.Router();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

router.post('/', async (req, res) => {
  try {
    const userMessage = (req.body?.message || '').toString().slice(0, 1000);
    if (!GEMINI_API_KEY) {
      return res.status(200).json({ reply: 'Chatbot not configured (set GEMINI_API_KEY in server/.env)' });
    }
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: userMessage }] }] }),
      }
    );
    const data = await r.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      data?.candidates?.[0]?.content?.parts?.[0]?.string_value ||
      'Sorry, I didn’t catch that.';
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ reply: 'Error: ' + e.message });
  }
});

export default router;
