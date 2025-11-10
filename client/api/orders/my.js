// client/api/orders/my.js
import { db, verifyIdTokenFromAuthHeader } from "../_firebaseAdmin";

function send(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });

  try {
    const uid = await verifyIdTokenFromAuthHeader(req);
    if (!uid) return send(res, 401, { error: "Unauthorized" });

    const snap = await db()
      .collection("users").doc(uid)
      .collection("orders")
      .orderBy("createdAt", "desc")
      .get();

    const orders = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() ?? null }));
    return send(res, 200, { orders });
  } catch (e) {
    console.error("orders/my error", e);
    return send(res, 500, { error: "Server error" });
  }
}
