// client/api/chat.js
// Serverless / API handler — product-aware chat (reads src/products.json)

import fs from 'fs'
import path from 'path'

function send(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  // allow CORS for dev
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(JSON.stringify(data))
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  return await new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) }
    })
  })
}

function loadProducts() {
  try {
    // Adjust path if your products.json is not at src/products.json
    const p = path.resolve(process.cwd(), 'src', 'products.json')
    const raw = fs.readFileSync(p, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    console.error('Failed to load products.json', e)
    return []
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {})
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' })

  try {
    const body = await readJsonBody(req)
    const { message = '', history = [] } = body || {}
    const msg = (message || '').toLowerCase().trim()
    const products = loadProducts()

    if (!msg && (!Array.isArray(history) || history.length === 0)) {
      return send(res, 400, { error: 'Missing message' })
    }

    // simple finder
    const find = (q) => {
      const qq = (q || '').toLowerCase().trim()
      if (!qq) return []
      return products.filter(p =>
        (p.brand || '').toLowerCase().includes(qq) ||
        (p.name || '').toLowerCase().includes(qq)
      )
    }

    // "show/list/find" queries
    if (msg.startsWith('show') || msg.startsWith('list') || msg.includes('show me') || msg.includes('find')) {
      let q = message.replace(/show me|show|list|find/ig, '').trim()
      if (!q) q = message
      const found = find(q)
      return send(res, 200, {
        reply: found.length ? `Found ${found.length} product(s).` : 'No products found.',
        products: found.map(p => ({ id: p.id, brand: p.brand, name: p.name, price: p.price, warranty: p.specs?.warranty })),
        source: 'products'
      })
    }

    // get lastProductIds from history context if sent
    const lastProductIds =
      (history?.slice(-1)[0]?.context?.lastProductIds) ||
      (history?.find(h => h.context?.lastProductIds)?.context?.lastProductIds) ||
      []

    // If user asks about warranty / price / description
    if (msg.includes('warrant') || msg.includes('price') || msg.includes('describe') || msg.includes('how much') || msg.includes('about') || msg.includes('cost')) {
      // try direct find by name in message first
      const direct = find(message)
      const target = direct.length ? direct : (lastProductIds.length ? products.filter(p => lastProductIds.includes(p.id)) : [])
      if (!target.length) {
        return send(res, 200, { reply: "I couldn't find a product in context. Try 'show me Samsung' or give a product name." })
      }
      if (msg.includes('warrant')) {
        const r = target.map(p => `${p.brand} ${p.name} — Warranty: ${p.specs?.warranty || 'N/A'}`).join('\n')
        return send(res, 200, { reply: r, products: target })
      }
      if (msg.includes('price') || msg.includes('how much') || msg.includes('cost')) {
        const r = target.map(p => `${p.brand} ${p.name} — Price: ₹${p.price} (MRP ₹${p.mrp})`).join('\n')
        return send(res, 200, { reply: r, products: target })
      }
      if (msg.includes('describe') || msg.includes('description') || msg.includes('about')) {
        const r = target.map(p => `${p.brand} ${p.name} — ${p.desc || 'No description available.'}`).join('\n\n')
        return send(res, 200, { reply: r, products: target })
      }
    }

    // direct product lookup
    const direct = find(message)
    if (direct.length) {
      return send(res, 200, { reply: `Found ${direct.length} product(s).`, products: direct })
    }

    // fallback FAQ
    const faq = (() => {
      if (msg.includes('warranty')) return 'Most items include 6 months – 1 year warranty depending on brand. Ask for a specific product for exact warranty.'
      if (msg.includes('delivery') || msg.includes('shipping')) return 'Delivery is usually 3–7 days depending on location.'
      if (msg.includes('return')) return 'Returns accepted within 7 days if unused and sealed.'
      if (msg.includes('earbud') || msg.includes('tws')) return 'Popular earbud brands here: boAt, Noise, Tribit. Try "show me boAt".'
      return "Sorry, I didn't understand. Try 'show me Samsung', 'price of iPhone 17 Pro', or 'what's the warranty?' after showing products."
    })()
    return send(res, 200, { reply: faq })
  } catch (e) {
    console.error('chat api error', e)
    return send(res, 500, { reply: 'Server error: ' + e.message })
  }
}
