// api/chat.js
// Defensive serverless handler — returns JSON on errors and supports local products.json

import fs from "fs";
import path from "path";

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); }
    });
  });
}

function send(res, status, data) {
  try {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end(JSON.stringify(data));
  } catch (e) {
    console.error("[chat] send error", e);
  }
}

function faqReply(message) {
  const q = (message || "").toLowerCase();
  if (q.includes("warranty")) return "Most items include a 1-year warranty.";
  if (q.includes("delivery") || q.includes("shipping")) return "Delivery is 3–5 days with tracking.";
  if (q.includes("return")) return "Returns accepted within 7 days if unopened.";
  if (q.includes("earbud") || q.includes("tws")) return "Top earbuds: boAt Airdopes, Noise Buds, Realme Buds.";
  if (q.includes("phone")) return "Popular phones: iPhone, Samsung Galaxy, Realme.";
  return "I can help with products, warranty, delivery and payments.";
}

function loadProductsSafe() {
  try {
    const candidates = [
      path.join(process.cwd(), "products.json"),
      path.join(process.cwd(), "public", "products.json"),
      path.join(process.cwd(), "api", "products.json"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.error("[chat] loadProducts error", e);
  }
  return [];
}

function searchProducts(products, query) {
  const q = (query || "").toLowerCase();
  if (!q) return [];
  return products.filter((p) => ((p.name || "") + " " + (p.brand || "") + " " + (p.keywords || []).join(" ")).toLowerCase().includes(q));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const { message = "", history = [] } = body || {};
    if (!message && (!Array.isArray(history) || history.length === 0)) {
      return send(res, 400, { error: "Missing message" });
    }

    const products = loadProductsSafe();
    const matched = searchProducts(products, message);

    // If no key -> fallback to FAQ/local products
    const KEY = process.env.GEN_API_KEY || "";
    if (!KEY) {
      const reply = matched.length
        ? `Found ${matched.length} product(s):\n` + matched.slice(0,6).map(p => `${p.brand} ${p.name} — ₹${p.price}. Warranty: ${p.warranty || '1 year'}`).join("\n")
        : faqReply(message);
      return send(res, 200, { reply, source: "faq_no_key", products: matched.slice(0,6) });
    }

    // Otherwise call Gemini
    const MODEL = process.env.GEN_API_MODEL || "models/gemini-1.5";
    const productContext = matched.length ? matched.slice(0,6).map(p => `${p.brand} ${p.name} — Price: ${p.price}, Warranty: ${p.warranty || 'N/A'}`).join("\n") : "No matching products found in catalog.";

    const systemPrompt = {
      author: "system",
      content: [{ type: "text", text: "You are DigitGenius assistant. Use ONLY the product info below when giving product details.\n\n" + productContext }]
    };

    const convo = (history || []).slice(-6).map(m => ({ author: m.role === 'user' ? 'user' : 'assistant', content: [{ type: "text", text: m.text }] }));
    convo.push({ author: "user", content: [{ type: "text", text: message }] });

    const payload = { messages: [systemPrompt, ...convo], temperature: 0.2, maxOutputTokens: 300 };
    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${MODEL}:generateMessage?key=${encodeURIComponent(KEY)}`;

    const r = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const text = await r.text();
    if (!r.ok) {
      console.error("[chat] generative API error", r.status, text && text.slice(0, 1000));
      return send(res, 200, { reply: faqReply(message), source: "fallback_error", error: { status: r.status, body: text && text.slice(0,1000) } });
    }
    let dataModel;
    try { dataModel = text ? JSON.parse(text) : null; } catch (e) { console.error("[chat] parse model JSON", e); return send(res, 200, { reply: faqReply(message), source: "fallback_error", error: "invalid_json_from_model" }); }

    // extract reply
    let reply = "";
    if (dataModel?.candidates?.[0]?.content) reply = dataModel.candidates[0].content.map(c => c.text || "").join(" ");
    else if (dataModel?.output_text) reply = dataModel.output_text;
    else if (dataModel?.candidates?.[0]?.text) reply = dataModel.candidates[0].text;
    else reply = JSON.stringify(dataModel).slice(0,1000);

    return send(res, 200, { reply, source: "gemini", products: matched.slice(0,6) });
  } catch (err) {
    console.error("[chat] handler error", err);
    return send(res, 500, { error: "internal_server_error", message: String(err && err.message || err) });
  }
}
