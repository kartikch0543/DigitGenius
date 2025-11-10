// Serverless function: POST /api/orders/checkout
// Stores an order in Vercel KV (Upstash Redis)

import { kv } from "@vercel/kv";

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
  // Simple CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const { items, address, paymentMethod, upiReference, guestId } = await readJsonBody(req);

    if (!guestId) return send(res, 400, { error: "Missing guestId" });
    if (!Array.isArray(items) || !items.length) return send(res, 400, { error: "Empty cart" });

    // Keep minimal order item shape
    const cleanItems = items.map(({ id, name, qty, price }) => ({ id, name, qty, price }));

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const order = {
      id: orderId,
      guestId,
      items: cleanItems,
      address: address || null,
      paymentMethod: paymentMethod || "cod",
      payment: {
        method: paymentMethod || "cod",
        status: paymentMethod === "online" ? "paid" : "pending",
        upiReference: upiReference || null
      },
      status: "PLACED",
      createdAt: Date.now()
    };

    // Save
    await kv.hset(`order:${orderId}`, order);
    await kv.lpush(`orders:${guestId}`, orderId);

    return send(res, 200, { ok: true, orderId });
  } catch (e) {
    console.error("checkout error", e);
    return send(res, 500, { error: "Server error" });
  }
}
