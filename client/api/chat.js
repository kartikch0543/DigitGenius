// /api/chat.js
// Serverless function for Vercel: proxies to Google Generative Language (Gemini)
// Falls back to a small FAQ if GEN_API_KEY is not set or on model errors.

// NOTE: Vercel uses Node 18+ where fetch is available globally.
// Do NOT put your API key in source control. Set GEN_API_KEY in Vercel env vars.

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
  // simple CORS so local dev and deployed frontend can reach it
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data));
}

function faqReply(message) {
  const m = (message || "").toLowerCase();
  let reply = "I can help with products, warranty, delivery and payments.";
  if (m.includes("warranty")) reply = "Most items include a 1-year warranty.";
  else if (m.includes("delivery") || m.includes("shipping")) reply = "Delivery is 3–5 days with tracking.";
  else if (m.includes("return")) reply = "Returns accepted within 7 days if unused and sealed.";
  else if (m.includes("earbud") || m.includes("tws")) reply = "Popular: boAt Airdopes, Noise Buds, realme Buds.";
  else if (m.includes("phone")) reply = "Check Apple, Samsung, realme in the Phones collection.";
  return reply;
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

  try {
    const KEY = process.env.GEN_API_KEY || "";
    // default model (can override with GEN_API_MODEL env var)
    const MODEL = process.env.GEN_API_MODEL || "models/gemini-1.5";

    // If no key provided — respond with local FAQ fallback
    if (!KEY) {
      const reply = faqReply(message || (history.slice(-1)[0]?.text || ""));
      return send(res, 200, { reply, source: "faq" });
    }

    // Build system prompt + last N turns
    const MAX_TURNS = 8;
    const systemPrompt = {
      author: "system",
      content: [{ type: "text", text: "You are a helpful, friendly assistant for DigitGenius. Answer questions about products, orders, delivery, returns, and site navigation." }]
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
      // fallback to FAQ (so user's chat doesn't break)
      const fallback = faqReply(message);
      return send(res, 200, { reply: fallback, source: "fallback", error: text });
    }

    const data = JSON.parse(text);

    // Extract reply robustly from a few possible response shapes
    let replyText = "";
    if (data?.candidates?.[0]?.content) {
      replyText = data.candidates[0].content.map((c) => c.text || "").join(" ");
    } else if (data?.output?.[0]?.content) {
      replyText = data.output[0].content.map((c) => c.text || "").join(" ");
    } else if (data?.candidates?.[0]?.text) {
      replyText = data.candidates[0].text;
    } else if (data?.output_text) {
      replyText = data.output_text;
    } else {
      replyText = (JSON.stringify(data).slice(0, 2000)) || "Sorry, I couldn't parse the model response.";
    }

    return send(res, 200, { reply: replyText, raw: data, source: "gemini" });
  } catch (e) {
    console.error("chat handler error", e);
    // On error, fall back gracefully to FAQ
    const fallback = faqReply(message || "");
    return send(res, 200, { reply: fallback, source: "error_fallback", error: e.message });
  }
}
