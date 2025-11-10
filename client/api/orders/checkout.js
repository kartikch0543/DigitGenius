// client/api/orders/checkout.js
import { db, verifyIdTokenFromAuthHeader } from "../_firebaseAdmin";

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  // optional CORS (harmless on same-origin)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  try {
    const uid = await verifyIdTokenFromAuthHeader(req);
    if (!uid) return send(res, 401, { error: "Unauthorized" });

    const { items, address, paymentMethod, upiReference } = req.body || {};
    if (!Array.isArray(items) || !items.length) return send(res, 400, { error: "Empty cart" });

    const cleanItems = items.map(({ id, name, qty, price }) => ({ id, name, qty, price }));

    const ref = await db()
      .collection("users").doc(uid)
      .collection("orders")
      .add({
        userId: uid,
        items: cleanItems,
        address: address || null,
        paymentMethod: paymentMethod || "cod",
        payment: { method: paymentMethod || "cod", status: "pending", upiReference: upiReference || null },
        status: "PLACED",
        createdAt: new Date()
      });

    return send(res, 200, { ok: true, orderId: ref.id });
  } catch (e) {
    console.error("checkout error", e);
    return send(res, 500, { error: "Server error" });
  }
}
