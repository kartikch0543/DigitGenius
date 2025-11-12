// Serverless function: POST /api/chat
// Proxies chat to Google Generative Language (Gemini) when GEN_API_KEY is present.
// Falls back to a small FAQ if no key or on errors.

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
  // Simple CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const body = await readJsonBody(req);
    const { message = "", history = [] } = body || {};

    if (!message && (!Array.isArray(history) || history.length === 0)) {
      return send(res, 400, { error: "Missing message" });
    }

    // Use Google Generative API only if key available
    const KEY = process.env.GEN_API_KEY;
    const MODEL = process.env.GEN_API_MODEL || "models/gemini-1.5"; // change if needed

    if (!KEY) {
      // No key set -> fallback to simple FAQ
      const reply = faqReply(message || (history.slice(-1)[0]?.text || ""));
      return send(res, 200, { reply, source: "faq" });
    }

    // Build messages for Gemini: system prompt + last N turns + current user message
    const MAX_TURNS = 8;
    const systemPrompt = {
      author: "system",
      content: [{ type: "text", text: "You are a helpful, friendly assistant for DigitGenius. Answer questions about products, orders, delivery, returns, and site navigation." }]
    };

    const convo = (history || [])
      .slice(-MAX_TURNS)
      .map((m) => ({
        author: m.role === "user" ? "user" : "assistant",
        content: [{ type: "text", text: m.text || m }]
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
      // return fallback faq if model fails
      const fallback = faqReply(message);
      return send(res, 200, { reply: fallback, source: "fallback", error: text });
    }

    const data = JSON.parse(text);

    // Extract reply robustly from known shapes
    let replyText = "";
    if (data?.candidates?.[0]?.content) {
      // content is array of {type: 'text', text: '...'}
      replyText = data.candidates[0].content.map((c) => c.text || "").join(" ");
    } else if (data?.output?.[0]?.content) {
      replyText = data.output[0].content.map((c) => c.text || "").join(" ");
    } else if (data?.candidates?.[0]?.text) {
      replyText = data.candidates[0].text;
    } else if (data?.output_text) {
      replyText = data.output_text;
    } else {
      // last-resort: stringify small portion of raw
      replyText = (JSON.stringify(data).slice(0, 2000)) || "Sorry, I couldn't parse the model response.";
    }

    return send(res, 200, { reply: replyText, raw: data, source: "gemini" });
  } catch (e) {
    console.error("chat handler error", e);
    // On error return FAQ so chat doesn't break completely
    const fallback = faqReply((await readJsonBody(req)).message || "");
    return send(res, 200, { reply: fallback, source: "error_fallback", error: e.message });
  }
}
