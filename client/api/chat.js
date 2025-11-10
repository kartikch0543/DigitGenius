// Serverless function: POST /api/chat
// Simple FAQ-style replies (no external APIs)

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const { message = "" } = await readJsonBody(req);
    const m = (message || "").toLowerCase();

    let reply = "I can help with products, warranty, delivery and payments.";
    if (m.includes("warranty")) reply = "Most items include a 1-year warranty.";
    else if (m.includes("delivery") || m.includes("shipping")) reply = "Delivery is 3–5 days with tracking.";
    else if (m.includes("return")) reply = "Returns accepted within 7 days if unused and sealed.";
    else if (m.includes("earbud") || m.includes("tws")) reply = "Popular: boAt Airdopes, Noise Buds, realme Buds.";
    else if (m.includes("phone")) reply = "Check Apple, Samsung, realme in the Phones collection.";

    return send(res, 200, { reply });
  } catch (e) {
    console.error("chat error", e);
    return send(res, 500, { error: "Server error" });
  }
}
