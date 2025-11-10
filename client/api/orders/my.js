// Serverless function: GET /api/orders/my
// Reads orders for a guest from Vercel KV (Upstash Redis)

import { kv } from "@vercel/kv";

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  // Simple CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Guest-Id");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  try {
    const guestId = req.headers["guest-id"];
    if (!guestId) return send(res, 400, { error: "Missing Guest-Id header" });

    const ids = await kv.lrange(`orders:${guestId}`, 0, -1);
    const orders = [];
    for (const id of ids) {
      const o = await kv.hgetall(`order:${id}`);
      if (o) orders.push(o);
    }
    orders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return send(res, 200, { orders });
  } catch (e) {
    console.error("orders/my error", e);
    return send(res, 500, { error: "Server error" });
  }
}
