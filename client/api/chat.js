// api/chat.js
// Safer, robust serverless handler for Gemini + product catalog
import fs from "fs";
import path from "path";

// ---------- helpers ----------
async function loadProducts() {
  try {
    // Try to read products.json from common locations
    const candidates = [
      path.join(process.cwd(), "api", "products.json"),
      path.join(process.cwd(), "products.json"),
      path.join(process.cwd(), "public", "products.json"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const raw = await fs.promises.readFile(c, "utf8");
        return JSON.parse(raw);
      }
    }
    console.warn("[chat] products.json not found at expected locations:", candidates);
    return [];
  } catch (e) {
    console.error("[chat] failed to load products.json:", e);
    return [];
  }
}

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
    res.status(status);
    res.setHeader("Content-Type", "application/json");
    // set CORS so browsers can call this from any origin
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end(JSON.stringify(data));
  } catch (e) {
    // If response already broken, just log
    console.error("[chat] send failed", e);
  }
}

function faqReply(message) {
  const q = (message || "").toLowerCase();
  if (q.includes("warranty")) return "Most items include a 1-year warranty.";
  if (q.includes("delivery") || q.includes("shipping")) return "Delivery is 3–5 days with tracking.";
  if (q.includes("return")) return "Returns accepted within 7 days if unused and sealed.";
  if (q.includes("earbud") || q.includes("tws") || q.includes("earphone")) return "Popular: boAt Airdopes, Noise Buds, realme Buds.";
  if (q.includes("phone")) return "Check Apple, Samsung, realme in the Phones collection.";
  return "I can help with products, warranty, delivery and payments.";
}

function searchProducts(products, query) {
  const q = (query || "").toLowerCase();
  if (!q) return [];
  return products.filter((p) => {
    const hay = ((p.name || "") + " " + (p.brand || "") + " " + ((p.keywords || []).join(" "))).toLowerCase();
    return hay.includes(q) || (p.brand || "").toLowerCase().includes(q) || (p.name || "").toLowerCase().includes(q);
  });
}

// robust extractor for various Gemini response shapes
function extractReply(data) {
  try {
    if (!data) return null;
    if (Array.isArray(data?.candidates) && data.candidates[0]?.content) {
      return data.candidates[0].content.map((c) => c.text || c.output_text || "").join(" ").trim();
    }
    if (Array.isArray(data?.output) && data.output[0]?.content) {
      return data.output[0].content.map((c) => c.text || "").join(" ").trim();
    }
    if (Array.isArray(data?.outputs) && data.outputs[0]?.content) {
      return data.outputs[0].content.map((c) => c.text || c.output_text || "").join(" ").trim();
    }
    if (typeof data.output_text === "string") return data.output_text;
    if (typeof data?.text === "string") return data.text;
    if (typeof data?.candidates?.[0]?.text === "string") return data.candidates[0].text;
    // fallback small JSON view
    return JSON.stringify(data).slice(0, 1000);
  } catch (e) {
    return "Sorry, couldn't parse the model response.";
  }
}

export default async function handler(req, res) {
  // quick OPTIONS handling (CORS preflight)
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    const body = await readJsonBody(req);
    const { message = "", history = [] } = body || {};

    if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });
    if (!message && (!Array.isArray(history) || history.length === 0)) {
      return send(res, 400, { error: "Missing message" });
    }

    // load products (safe)
    const products = await loadProducts();

    // simple product context for this message
    const matched = searchProducts(products, message);
    const productContext = matched.length
      ? matched.slice(0, 8).map(p => `${p.brand || ''} ${p.name || ''} — Price: ${p.price || 'N/A'}, Warranty: ${p.warranty || 'N/A'}`).join("\n")
      : "No matching products found in catalog.";

    // If no API key present -> fallback
    const KEY = process.env.GEN_API_KEY || process.env.GEN_KEY || process.env.OPENAI_API_KEY || "";
    const MODEL = process.env.GEN_API_MODEL || "models/gemini-1.5";

    if (!KEY) {
      // return short reply + products (so frontend can still display helpful info)
      const reply = matched.length
        ? `Found ${matched.length} matching product(s):\n` + productContext
        : faqReply(message);
      return send(res, 200, { reply, source: "faq_no_key", products: matched.slice(0,6) });
    }

    // Build payload for Generative Language API
    const systemPrompt = {
      author: "system",
      content: [{ type: "text", text: `You are DigitGenius assistant. Use the product info below to answer user queries.\n\n${productContext}` }]
    };

    const convo = (history || []).slice(-8).map(m => ({
      author: m.role === "user" ? "user" : "assistant",
      content: [{ type: "text", text: m.text || m }]
    }));
    convo.push({ author: "user", content: [{ type: "text", text: message }] });

    const payload = { messages: [systemPrompt, ...convo], temperature: 0.2, maxOutputTokens: 300 };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${MODEL}:generateMessage?key=${encodeURIComponent(KEY)}`;

    console.log("[chat] calling generative endpoint:", endpoint, "messageLen:", message.length, "matchedProducts:", matched.length);

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      // timeout not available on fetch here; platform will handle
    });

    const text = await r.text().catch(() => null);
    if (!r.ok) {
      // log and return a safe fallback with server error data
      console.error("[chat] generative API returned non-OK:", r.status, text);
      return send(res, 200, { reply: faqReply(message), source: "fallback_error", error: { status: r.status, body: text && text.slice(0,1000) } });
    }

    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      console.error("[chat] failed to parse JSON from generative API:", e, "raw:", text && text.slice(0,1000));
      return send(res, 200, { reply: faqReply(message), source: "fallback_error", error: "invalid-json-from-model" });
    }

    const reply = extractReply(data) || faqReply(message);
    return send(res, 200, { reply, source: "gemini", products: matched.slice(0,6), raw: (data && typeof data === "object" ? { ok: true } : null) });

  } catch (err) {
    // Top-level server error: log everywhere and return a JSON error
    console.error("[chat] handler top-level error:", err && (err.stack || err.message || err));
    // Return JSON so frontend doesn't choke on non-JSON body
    return send(res, 500, { error: "internal_server_error", message: "Handler crashed — check server logs", details: String(err && err.message || err) });
  }
}
