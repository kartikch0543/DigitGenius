// Serverless function: POST /api/chat
// Uses Gemini + Product Catalog search for real product-based responses.

import products from "./products.json" assert { type: "json" };

// ---------------------- HELPERS -------------------------

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
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

// search products by keywords or brand
function searchProducts(query) {
  const q = query.toLowerCase();
  return products.filter(
    (p) =>
      p.brand.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.keywords && p.keywords.some((k) => k.toLowerCase().includes(q)))
  );
}

// Convert product list → readable text for Gemini
function buildProductContext(query) {
  const matched = searchProducts(query);

  if (matched.length === 0) return "No matching products found in catalog.";

  return (
    "Matching Products:\n" +
    matched
      .map(
        (p) =>
          `• ${p.brand} ${p.name} — Price: ${p.price}, RAM: ${p.ram || "N/A"}, Storage: ${
            p.storage || "N/A"
          }, GPU: ${p.gpu || "N/A"}, Battery: ${p.battery || "N/A"}, Warranty: ${
            p.warranty || "N/A"
          }`
      )
      .join("\n")
  );
}

// FAQ fallback
function faqReply(message) {
  const q = (message || "").toLowerCase();

  if (q.includes("warranty")) return "Most items include a 1-year warranty.";
  if (q.includes("delivery")) return "Delivery takes 3–5 days with tracking.";
  if (q.includes("return")) return "Returns accepted within 7 days if unopened.";
  if (q.includes("earbud")) return "Top earbuds: boAt Airdopes, Noise Buds, Realme Buds.";
  if (q.includes("phone")) return "Popular phones: iPhone, Samsung Galaxy, Realme.";

  return "I can help with products, pricing, specs, delivery, warranty, and more.";
}

// Extract text from Gemini response
function extractReply(data) {
  try {
    if (data?.candidates?.[0]?.content)
      return data.candidates[0].content.map((c) => c.text || "").join(" ");
    if (data?.output_text) return data.output_text;
    if (data?.candidates?.[0]?.text) return data.candidates[0].text;
    return JSON.stringify(data).slice(0, 500);
  } catch {
    return "Sorry, I could not generate a reply.";
  }
}

// ---------------------- MAIN HANDLER -------------------------

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const { message = "", history = [] } = body || {};

    if (!message.trim()) return send(res, 400, { error: "Message required" });

    const KEY = process.env.GEN_API_KEY;
    const MODEL = "models/gemini-1.5";

    // If API key missing → fallback
    if (!KEY) {
      return send(res, 200, { reply: faqReply(message), source: "faq_no_key" });
    }

    // build product context FOR THIS MESSAGE
    const productContext = buildProductContext(message);

    // SYSTEM PROMPT + PRODUCTS
    const systemPrompt = {
      author: "system",
      content: [
        {
          type: "text",
          text:
            "You are DigitGenius AI, an expert product assistant. " +
            "Use ONLY the product catalog provided below when giving product details.\n\n" +
            productContext
        }
      ]
    };

    // Build conversation
    const convo = [
      systemPrompt,
      ...history.map((m) => ({
        author: m.role,
        content: [{ type: "text", text: m.text }]
      })),
      {
        author: "user",
        content: [{ type: "text", text: message }]
      }
    ];

    const payload = {
      messages: convo,
      temperature: 0.2,
      maxOutputTokens: 300
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta2/${MODEL}:generateMessage?key=${KEY}`;

    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    if (!r.ok) {
      console.error("Gemini API error:", r.status, text);
      return send(res, 200, { reply: faqReply(message), source: "fallback_error" });
    }

    const data = JSON.parse(text);
    const reply = extractReply(data);

    return send(res, 200, { reply, source: "gemini", products: productContext });
  } catch (err) {
    console.error("Chat error:", err);
    return send(res, 200, {
      reply: faqReply(""),
      source: "server_error",
      error: err.message
    });
  }
}
