// Serverless function: POST /api/chat
// - Answers product/brand/price/warranty queries using local products.json
// - Optional: proxies to Google Generative API (Gemini) if GEN_API_KEY is set
// - Simple multi-turn: remembers last matched product ids in `history` / last reply context

const path = require('path');
const fs = require('fs');

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}
function send(res, status, data) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

// Load products.json once (synchronous on cold start)
let PRODUCTS = [];
try {
  PRODUCTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf8'));
} catch (e) {
  // Try parent folder (depending on deployment)
  try {
    PRODUCTS = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'products.json'), 'utf8'));
  } catch (e2) {
    console.error('Could not load products.json:', e2.message);
    PRODUCTS = [];
  }
}

// Simple FAQ fallback
function faqReply(message) {
  const m = (message || '').toLowerCase();
  let reply = 'I can help with products, warranty, delivery and payments.';
  if (m.includes('warranty')) reply = 'Most items include a 6-month to 1-year warranty (see product details).';
  else if (m.includes('delivery') || m.includes('shipping')) reply = 'Delivery is 3–5 days with tracking.';
  else if (m.includes('return')) reply = 'Returns accepted within 7 days if unused and sealed.';
  else if (m.includes('earbud') || m.includes('tws')) reply = 'Popular: boAt Airdopes, Noise Buds, realme Buds.';
  else if (m.includes('phone')) reply = 'Check the Phones collection for the latest phones and prices.';
  return reply;
}

// Helpers to search products
function findByBrand(query) {
  const q = query.trim().toLowerCase();
  const matches = PRODUCTS.filter(p => (p.brand || '').toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q));
  return matches;
}

function matchAnyBrandInText(text) {
  const t = (text || '').toLowerCase();
  const brands = [...new Set(PRODUCTS.map(p => (p.brand || '').toLowerCase()))].filter(Boolean);
  // try exact brand tokens first
  for (const b of brands) {
    if (t.includes(b)) return b;
  }
  // fallback: check product names
  for (const p of PRODUCTS) {
    if ((p.name || '').toLowerCase() && t.includes((p.name || '').toLowerCase())) return p.brand.toLowerCase();
  }
  return null;
}

// Builds a deterministic product-list reply (short)
function productListReply(list) {
  if (!list || list.length === 0) return 'No products found.';
  const summary = list.slice(0, 10).map(p => `• ${p.name.trim()} — ₹${p.price} (${p.warranty || p.specs?.warranty || 'warranty info not available'})`).join('\n');
  const more = list.length > 10 ? `\nAnd ${list.length - 10} more...` : '';
  return `Found ${list.length} product(s):\n${summary}${more}\n\nYou can ask "price of <product name>" or "warranty for <product name>" or ask for details of any item.`;
}

// Extract product by name (loose)
function findByName(text) {
  const t = (text || '').toLowerCase();
  // exact contains
  let p = PRODUCTS.find(x => (x.name || '').toLowerCase() === t);
  if (p) return [p];
  // contains
  const hits = PRODUCTS.filter(x => (x.name || '').toLowerCase().includes(t));
  if (hits.length) return hits;
  // token match — try each product
  for (const prod of PRODUCTS) {
    if ((prod.name || '').toLowerCase().split(/\s+/).some(tok => tok && t.includes(tok))) return [prod];
  }
  return [];
}

// Determine if text asks for price/warranty/details
function intentFromText(text) {
  const t = (text || '').toLowerCase();
  if (t.match(/\b(price|cost|how much|rate)\b/)) return 'price';
  if (t.match(/\b(warranty|guarantee|warrant)\b/)) return 'warranty';
  if (t.match(/\b(details|specs|specification|information|about)\b/)) return 'details';
  if (t.match(/\b(show|list|find|show me|display)\b/)) return 'list';
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });

  try {
    const body = await readJsonBody(req);
    const { message = '', history = [] } = body || {};
    const text = (message || '').trim();
    if (!text && (!Array.isArray(history) || history.length === 0)) {
      return send(res, 400, { error: 'Missing message' });
    }

    // 1) Try to detect brand/product queries using local product DB and conversation context
    const lastUser = (history && history.slice().reverse().find(h => h.role === 'user')) || null;
    const lastAssistant = (history && history.slice().reverse().find(h => h.role === 'assistant')) || null;

    const intent = intentFromText(text) || (lastUser ? intentFromText(lastUser.text) : null);

    // If user explicitly mentions a brand or product in this message, use that
    const explicitBrand = matchAnyBrandInText(text);
    let matchedProducts = [];

    if (explicitBrand) {
      matchedProducts = findByBrand(explicitBrand);
    }

    // If user mentions a product name
    if (matchedProducts.length === 0) {
      const byName = findByName(text);
      if (byName.length) matchedProducts = byName;
    }

    // If still nothing matched, but last assistant reply contained a product list, try to recover IDs from history
    if (matchedProducts.length === 0 && lastAssistant && lastAssistant.context?.lastProductIds) {
      matchedProducts = PRODUCTS.filter(p => lastAssistant.context.lastProductIds.includes(p.id));
    }

    // If user asked "price" / "warranty" and there is a matched product or context, answer specifically
    if (intent === 'price' || intent === 'warranty' || intent === 'details') {
      // If no explicit matched products, try to use last product mentioned in user messages
      if (matchedProducts.length === 0 && lastUser) {
        const byName2 = findByName(lastUser.text || '');
        if (byName2.length) matchedProducts = byName2;
      }

      if (matchedProducts.length === 0) {
        // If still none, ask a clarifying question
        const q = 'Which product are you asking about? Tell me the product name or brand and I will show price and warranty.';
        return send(res, 200, { reply: q, source: 'clarify' });
      }

      // Build response for matchedProducts (if many, summarise)
      const p = matchedProducts[0];
      if (intent === 'price') {
        return send(res, 200, { reply: `${p.name} — Price: ₹${p.price} (MRP ₹${p.mrp}).`, source: 'products' });
      }
      if (intent === 'warranty') {
        const warr = p.specs?.warranty || p.warranty || 'Warranty information not available.';
        return send(res, 200, { reply: `${p.name} — Warranty: ${warr}`, source: 'products' });
      }
      if (intent === 'details') {
        const specs = p.specs || {};
        const specText = Object.entries(specs).map(([k,v])=> `${k}: ${v || '-'}`).join(' • ');
        return send(res, 200, { reply: `${p.name} — ₹${p.price}\n${specText}\n\n${p.desc || ''}`, source: 'products' });
      }
    }

    // If user asks to "show/list <brand>"
    if (text.match(/\b(show|list|find|show me|display)\b/) || explicitBrand) {
      // If matchedProducts found by brand or name
      if (matchedProducts.length) {
        // Attach lastProductIds to assistant context so follow-ups can use it
        const productIds = matchedProducts.map(p=>p.id);
        const reply = productListReply(matchedProducts);
        return send(res, 200, { reply, source: 'products', context: { lastProductIds: productIds }});
      }

      // Try a broad brand match from text tokens
      const brandToken = matchAnyBrandInText(text);
      if (brandToken) {
        const list = findByBrand(brandToken);
        const productIds = list.map(p=>p.id);
        const reply = productListReply(list);
        return send(res, 200, { reply, source: 'products', context: { lastProductIds: productIds }});
      }

      return send(res, 200, { reply: "I didn't find any product matching that brand/name. Try 'show me Samsung' or 'show me Apple', or ask about a product name.", source: 'products' });
    }

    // If message is short like "Samsung" or just brand token, treat as list request
    if (text.split(/\s+/).length <= 3 && matchAnyBrandInText(text)) {
      const b = matchAnyBrandInText(text);
      const list = findByBrand(b);
      const productIds = list.map(p=>p.id);
      const reply = productListReply(list);
      return send(res, 200, { reply, source: 'products', context: { lastProductIds: productIds }});
    }

    // At this point: no product-specific intent matched. Optionally proxy to Gemini (if key present)
    const KEY = process.env.GEN_API_KEY;
    const MODEL = process.env.GEN_API_MODEL || 'models/gemini-1.5';
    if (!KEY) {
      // fallback to FAQ if no key and no product match
      const reply = faqReply(text || (history.slice(-1)[0]?.text || ''));
      return send(res, 200, { reply, source: 'faq' });
    }

    // Proxy to Google Generative API - but still include a hint that product facts are authoritative from local DB
    // Build a small system prompt and pass last few turns
    const MAX_TURNS = 6;
    const systemPrompt = {
      author: 'system',
      content: [{ type: 'text', text: 'You are a helpful assistant for DigitGenius (electronics store). Prefer facts from the site product database when answering product, price or warranty queries.' }]
    };

    const convo = (history || []).slice(-MAX_TURNS).map(m => ({
      author: m.role === 'user' ? 'user' : 'assistant',
      content: [{ type: 'text', text: m.text || m }]
    }));
    convo.push({ author: 'user', content: [{ type: 'text', text }] });

    const payload = {
      messages: [systemPrompt, ...convo],
      temperature: 0.2,
      maxOutputTokens: 512
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${MODEL}:generateMessage?key=${encodeURIComponent(KEY)}`;
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const textRaw = await r.text();
      if (!r.ok) {
        console.error('Generative API error', r.status, textRaw);
        const fallback = faqReply(text);
        return send(res, 200, { reply: fallback, source: 'fallback' });
      }
      const data = JSON.parse(textRaw);
      // extract reply robustly
      let replyText = '';
      if (data?.candidates?.[0]?.content) {
        replyText = data.candidates[0].content.map(c => c.text || '').join(' ');
      } else if (data?.output?.[0]?.content) {
        replyText = data.output[0].content.map(c => c.text || '').join(' ');
      } else if (data?.candidates?.[0]?.text) {
        replyText = data.candidates[0].text;
      } else if (data?.output_text) {
        replyText = data.output_text;
      } else {
        replyText = (JSON.stringify(data).slice(0, 2000)) || 'Sorry, I could not parse the model response.';
      }
      return send(res, 200, { reply: replyText, raw: data, source: 'gemini' });
    } catch (err) {
      console.error('Generative API request failed', err);
      const fallback = faqReply(text);
      return send(res, 200, { reply: fallback, source: 'error_fallback', error: err.message });
    }
  } catch (e) {
    console.error('chat handler error', e);
    return send(res, 500, { error: 'Server error' });
  }
}
