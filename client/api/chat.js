// /api/chat.js
// Vercel serverless endpoint. Uses Google Generative API if GEN_API_KEY is set.
// Otherwise (or on model error) uses a deterministic product-aware FAQ using local products.json

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
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

function simpleFaq(message) {
  const m = (message || "").toLowerCase();
  if (m.includes("warranty")) return "Most items include a 6-12 months warranty depending on the brand. Ask about a specific product to get exact warranty.";
  if (m.includes("delivery") || m.includes("shipping")) return "Delivery time is typically 3–7 business days depending on location.";
  if (m.includes("return")) return "Returns accepted within 7 days if unused and sealed. Some products have different return policies.";
  if (m.includes("price") || m.includes("cost")) return "Ask for a brand or product name and I can give current prices.";
  return "I can help with products, warranty, delivery and prices. Ask for a brand (e.g., 'show me Samsung') or a product name.";
}

// load products.json once (synchronous read is fine for serverless cold start)
let PRODUCTS = [];
try {
  const p = path.join(process.cwd(), "products.json");
  const raw = fs.readFileSync(p, "utf8");
  PRODUCTS = JSON.parse(raw);
} catch (e) {
  console.warn("Could not load products.json:", e.message);
  PRODUCTS = [];
}

// product search helpers
function findByBrandOrName(q) {
  const s = (q || "").toLowerCase();
  // match brand exactly or substring in name
  const byBrand = PRODUCTS.filter((p) => (p.brand || "").toLowerCase().includes(s));
  const byName = PRODUCTS.filter((p) => (p.name || "").toLowerCase().includes(s));
  // merge unique
  const ids = new Set();
  const res = [];
  for (const item of [...byBrand, ...byName]) {
    if (!ids.has(item.id)) { ids.add(item.id); res.push(item); }
  }
  return res;
}

function findByIds(ids = []) {
  const set = new Set(ids);
  return PRODUCTS.filter((p) => set.has(p.id));
}

function productSummaryList(items, max = 6) {
  if (!items || items.length === 0) return "No products found.";
  const slice = items.slice(0, max);
  const lines = slice.map((p) => `${p.name} (id: ${p.id}) — ₹${p.price} • ${p.warranty || p.specs?.warranty || "warranty N/A"}`);
  const more = items.length > max ? `\nAnd ${items.length - max} more...` : "";
  return `Found ${items.length} product(s):\n` + lines.join("\n") + more;
}

// Determine user intent simply
function detectIntent(message) {
  const m = (message || "").toLowerCase();
  if (m.match(/\b(show|list|search|find|show me)\b/) || m.match(/\b(all|which)\b/)) {
    return "search";
  }
  if (m.includes("warranty")) return "warranty";
  if (m.includes("price") || m.includes("cost") || m.includes("how much")) return "price";
  return "general";
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return send(res, 400, { error: "Invalid JSON body" });
  }

  const { message = "", history = [] } = body || {};
  if (!message && (!Array.isArray(history) || history.length === 0)) {
    return send(res, 400, { error: "Missing message" });
  }

  // --- 1) Product-aware deterministic handler (fast, works without API key)
  try {
    const intent = detectIntent(message);
    // If user asked to show brand/product -> search
    if (intent === "search") {
      // try to find brand or product words from message
      const tokens = message.split(/[\s,?.!]+/).filter(Boolean);
      // try longest token and also full message
      const queryCandidates = [
        message,
        ...tokens.slice().reverse(), // check bigger tokens last
      ];

      let found = [];
      for (const q of queryCandidates) {
        found = findByBrandOrName(q);
        if (found.length) break;
      }

      // If nothing found, try using last assistant context for lastProductIds in history (if any)
      if (!found.length) {
        const last = (history || []).slice().reverse().find(h => h.context && h.context.lastProductIds);
        if (last) {
          found = findByIds(last.context.lastProductIds || []);
        }
      }

      if (found.length) {
        const reply = productSummaryList(found, 8);
        const lastProductIds = found.map(p => p.id);
        return send(res, 200, { reply, source: "products", context: { lastProductIds } });
      }

      // Nothing matched -> fallback FAQ message
      const fallback = `I couldn't find products matching "${message}". Try a brand name (Samsung, Apple) or a product model.`;
      return send(res, 200, { reply: fallback, source: "products_none" });
    }

    // If asking warranty or price and there's context (lastProductIds in client history)
    if (intent === "warranty" || intent === "price") {
      // Check lastProductIds from history context
      let lastProductIds = [];
      // 1) if user says "warranty of <brand>" - try that
      const brandMatches = findByBrandOrName(message);
      if (brandMatches.length) lastProductIds = brandMatches.map(p => p.id);

      // 2) else search for product ids in history context
      if (!lastProductIds.length) {
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          if (h.context && h.context.lastProductIds && h.context.lastProductIds.length) {
            lastProductIds = h.context.lastProductIds;
            break;
          }
        }
      }

      // 3) If still empty, try naive name search
      if (!lastProductIds.length) {
        const sres = findByBrandOrName(message);
        if (sres.length) lastProductIds = sres.map(p => p.id);
      }

      if (!lastProductIds.length) {
        return send(res, 200, { reply: "Which product/brand do you mean? For example: 'warranty for Samsung Galaxy Tab S10' or first ask 'show me Samsung'." });
      }

      const prods = findByIds(lastProductIds);
      if (!prods.length) return send(res, 200, { reply: "Couldn't find product details." });

      // Build reply
      if (intent === "warranty") {
        const lines = prods.map(p => `${p.name} (id:${p.id}) — warranty: ${p.specs?.warranty || p.warranty || "N/A"} · price: ₹${p.price}`);
        return send(res, 200, { reply: lines.join("\n"), source: "warranty", context: { lastProductIds } });
      } else {
        // price
        const lines = prods.map(p => `${p.name} (id:${p.id}) — ₹${p.price} (MRP ₹${p.mrp})`);
        return send(res, 200, { reply: lines.join("\n"), source: "price", context: { lastProductIds } });
      }
    }
  } catch (e) {
    console.error("product handler error", e);
    // continue to generative model path
  }

  // --- 2) If GEN_API_KEY set -> call Gemini (non-blocking fallback above)
  const KEY = process.env.GEN_API_KEY;
  const MODEL = process.env.GEN_API_MODEL || "models/gemini-1.5";

  if (!KEY) {
    // final fallback: simple faq
    return send(res, 200, { reply: simpleFaq(message), source: "faq_final" });
  }

  try {
    // Build system + convo from history
    const MAX_TURNS = 8;
    const systemPrompt = {
      author: "system",
      content: [{ type: "text", text: "You are a helpful assistant for DigitGenius ecommerce site. Answer short and actionable." }]
    };

    const convo = (history || [])
      .slice(-MAX_TURNS)
      .map((m) => ({
        author: m.role === "user" ? "user" : "assistant",
        content: [{ type: "text", text: m.text || (typeof m === "string" ? m : "") }]
      }));
    convo.push({ author: "user", content: [{ type: "text", text: message }] });

    const payload = {
      messages: [systemPrompt, ...convo],
      temperature: 0.2,
      maxOutputTokens: 512
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${MODEL}:generateMessage?key=${encodeURIComponent(KEY)}`;

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Generative API error", r.status, text);
      return send(res, 200, { reply: simpleFaq(message), source: "fallback_gemini_error", error: text });
    }
    const data = JSON.parse(text);

    // extract reply
    let replyText = "";
    if (data?.candidates?.[0]?.content) replyText = data.candidates[0].content.map(c => c.text || "").join(" ");
    else if (data?.output?.[0]?.content) replyText = data.output[0].content.map(c => c.text || "").join(" ");
    else if (data?.output_text) replyText = data.output_text;
    else replyText = (JSON.stringify(data).slice(0, 2000)) || "Sorry I couldn't parse the model response.";

    return send(res, 200, { reply: replyText, raw: data, source: "gemini" });
  } catch (e) {
    console.error("generative error", e);
    return send(res, 200, { reply: simpleFaq(message), source: "error_fallback", error: e.message });
  }
}
