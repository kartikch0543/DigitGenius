// src/main.jsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Link,
  useSearchParams,
  useParams,
  useNavigate,
} from 'react-router-dom'
import './index.css'
import { api } from './lib/api.js'
import data from './products.json'
import AnalyticsTracker from './AnalyticsTracker' // ✅ GA4 route tracking

/* =========================================================
   Lightweight SEO helper (no deps)
========================================================= */
function SEO({ title, description, keywords = [], canonical, jsonLd }) {
  React.useEffect(() => {
    if (title) document.title = title;

    const setMeta = (name, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('description', description);
    if (Array.isArray(keywords) ? keywords.length : keywords)
      setMeta('keywords', Array.isArray(keywords) ? keywords.join(', ') : keywords);
    setMeta('robots', 'index, follow');

    if (canonical) {
      let link = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      link.setAttribute('href', canonical);
    }

    // JSON-LD
    let jsonTag = document.getElementById('__jsonld');
    if (jsonTag) jsonTag.remove();
    if (jsonLd) {
      jsonTag = document.createElement('script');
      jsonTag.type = 'application/ld+json';
      jsonTag.id = '__jsonld';
      jsonTag.text = JSON.stringify(jsonLd);
      document.head.appendChild(jsonTag);
    }
  }, [title, description, JSON.stringify(keywords), canonical, JSON.stringify(jsonLd)]);

  return null;
}

/* =========================================================
   Firebase (Web) — optional (kept for login/profile)
========================================================= */
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth'

// Read from Vite env:
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const fbApp = initializeApp(firebaseConfig)
const auth = getAuth(fbApp)
const googleProvider = new GoogleAuthProvider()

/* =========================================================
   Address helpers (localStorage)
========================================================= */
function loadAddresses() {
  try {
    return JSON.parse(localStorage.getItem('dg_addresses') || '[]')
  } catch {
    return []
  }
}
function saveAddresses(addrs) {
  localStorage.setItem('dg_addresses', JSON.stringify(addrs))
}
function addAddress(a) {
  const arr = loadAddresses()
  const id = 'addr_' + Date.now()
  const rec = { id, ...a }
  if (arr.length === 0) rec.default = true
  arr.push(rec)
  saveAddresses(arr)
  return rec
}
function setDefaultAddress(id) {
  const arr = loadAddresses().map((a) => ({ ...a, default: a.id === id }))
  saveAddresses(arr)
  return arr
}

/* =========================================================
   Guest ID (for guest checkout & orders)
========================================================= */
function getGuestId() {
  let id = localStorage.getItem('dg_guest')
  if (!id) {
    id = 'guest_' + Math.random().toString(36).slice(2) + Date.now()
    localStorage.setItem('dg_guest', id)
  }
  return id
}

/* =========================================================
   Stores (Cart, Auth, Wishlist)
========================================================= */
const CartCtx = React.createContext(),
  AuthCtx = React.createContext(),
  WishCtx = React.createContext()

function CartProvider({ children }) {
  const [cart, setCart] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dg_cart') || '[]')
    } catch {
      return []
    }
  })
  React.useEffect(() => localStorage.setItem('dg_cart', JSON.stringify(cart)), [cart])
  const add = (p) =>
    setCart((x) => {
      const i = x.findIndex((e) => e.id === p.id)
      if (i > -1) {
        const c = [...x]
        c[i].qty++
        return c
      }
      return [...x, { ...p, qty: 1 }]
    })
  const inc = (id) => setCart((x) => x.map((i) => (i.id === id ? { ...i, qty: i.qty + 1 } : i)))
  const dec = (id) =>
    setCart((x) => x.map((i) => (i.id === id ? { ...i, qty: Math.max(1, i.qty - 1) } : i)))
  const remove = (id) => setCart((x) => x.filter((i) => i.id !== id))
  const clear = () => setCart([])
  const count = cart.reduce((a, b) => a + b.qty, 0),
    total = cart.reduce((a, b) => a + b.qty * b.price, 0)
  return (
    <CartCtx.Provider value={{ cart, add, inc, dec, remove, clear, count, total, setCart }}>
      {children}
    </CartCtx.Provider>
  )
}
function useCart() {
  return React.useContext(CartCtx)
}

/* ----------------------
   Firebase Auth Provider
----------------------- */
function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null)
  const [token, setToken] = React.useState('')

  React.useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const idToken = await u.getIdToken()
          setToken(idToken)
          localStorage.setItem('dg_token', idToken)
        } catch {
          setToken('')
          localStorage.removeItem('dg_token')
        }
      } else {
        setToken('')
        localStorage.removeItem('dg_token')
      }
    })
    return () => unsub()
  }, [])

  const login = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password)
  }
  const signup = async (name, email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    try {
      await cred.user.updateProfile?.({ displayName: name })
    } catch {}
  }
  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider)
  }
  const logout = async () => {
    await signOut(auth)
  }

  return (
    <AuthCtx.Provider value={{ token, user, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
function useAuth() {
  return React.useContext(AuthCtx)
}

/* ----------------------
   Wishlist
----------------------- */
function WishProvider({ children }) {
  const [items, set] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dg_wish') || '[]')
    } catch {
      return []
    }
  })
  React.useEffect(() => localStorage.setItem('dg_wish', JSON.stringify(items)), [items])
  const add = (p) => set((x) => (x.find((i) => i.id === p.id) ? x : [...x, p]))
  const remove = (id) => set((x) => x.filter((i) => i.id !== id))
  return <WishCtx.Provider value={{ items, add, remove, count: items.length }}>{children}</WishCtx.Provider>
}
function useWish() {
  return React.useContext(WishCtx)
}

/* =========================================================
   UI
========================================================= */
function Nav() {
  const { count } = useCart()
  const { user, logout } = useAuth()
  const { count: wcount } = useWish()
  const [q, setQ] = React.useState('')
  const go = (e) => {
    e.preventDefault()
    window.location.href = `/products?q=${encodeURIComponent(q)}`
  }
  return (
    <header className="sticky top-0 bg-white/90 backdrop-blur border-b shadow-sm z-40">
      <div className="container h-16 flex items-center gap-3">
        <Link to="/" className="font-extrabold text-2xl">
          Digit<span className="text-brand">Genius</span>
        </Link>
        <form onSubmit={go} className="hidden md:flex flex-1">
          <input value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 border rounded-l-xl px-3" />
          <button className="btn rounded-l-none">Search</button>
        </form>
        <nav className="ml-auto flex items-center gap-2">
          <Link className="icon" to="/products">Products</Link>
          <Link className="icon" to="/collections">Collections</Link>
          <Link className="icon" to="/wishlist">Wishlist♡{wcount ? ` ${wcount}` : ''}</Link>
          <Link className="icon" to="/cart">🛒{count ? ` ${count}` : ''}</Link>
          {user ? (
            <>
              <Link className="icon" to="/orders">Orders</Link>
              <Link className="icon" to="/profile">Profile</Link>
              <button onClick={logout} className="icon">Logout</button>
            </>
          ) : (
            <>
              <Link className="icon" to="/orders">Orders</Link>
              <Link className="icon" to="/login">Login</Link>
              <Link className="icon" to="/signup">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t mt-10">
      <div className="container py-8 grid sm:grid-cols-3 gap-6">
        <div>
          <div className="font-bold">DigitGenius</div>
          <div className="text-sm text-slate-600">Reliable electronics, fast checkout.</div>
        </div>
        <div>
          <div className="font-semibold">Help</div>
          <div className="text-sm">Shipping • Payments • Warranty</div>
        </div>
        <div>
          <div className="font-semibold">Follow us</div>
          <div className="text-sm">
            <a className="text-brand" href="https://instagram.com" target="_blank">Instagram</a> ·{' '}
            <a className="text-brand" href="https://twitter.com" target="_blank">Twitter</a> ·{' '}
            <a className="text-brand" href="https://youtube.com" target="_blank">YouTube</a>
          </div>
        </div>
      </div>
      <div className="text-center text-xs text-slate-500 py-4 border-t">© {new Date().getFullYear()} DigitGenius</div>
    </footer>
  )
}

function ProductCard({ p }) {
  const { add } = useCart()
  const { add: wad } = useWish()
  return (
    <div className="card p-4 group">
      <div className="relative overflow-hidden rounded-xl">
        <img src={p.img} alt={p.name} className="w-full h-48 object-cover transition group-hover:scale-105" />
        <button
          title="Wishlist"
          onClick={() => wad(p)}
          className="absolute top-2 right-2 bg-white/90 rounded-xl px-3 py-2 shadow hover:scale-105"
        >
          ♡
        </button>
        <span className="badge absolute top-2 left-2">
          {Math.round((1 - p.price / p.mrp) * 100)}% OFF
        </span>
      </div>
      <Link to={'/products/' + p.id} className="block mt-3 font-semibold leading-snug hover:text-brand">
        {p.name}
      </Link>
      <div className="text-sm text-slate-600">
        {p.brand} • ⭐ {p.rating}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-lg font-extrabold">₹{p.price}</div>
        <div className="text-xs line-through text-slate-500">₹{p.mrp}</div>
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn flex-1" onClick={() => add(p)}>Add to Cart</button>
        <Link to={'/products/' + p.id} className="btn-outline">View</Link>
      </div>
    </div>
  )
}

/* =========================================================
   Pages with SEO
========================================================= */
// ... (kept exactly same as your original file until Chat section)
// For brevity I'm not repeating the unchanged page components here in this block;
// assume everything above ProductCard and everything below Chat is identical to your original file.
// The only replacement in your main file is the Chat modal & FloatingChat components which follow next.

/* =========================================================
   Chat (REPLACED) — product-aware chat and local fallback
========================================================= */
function ChatModal({ onClose }) {
  const [m, setM] = React.useState([{ role: 'assistant', text: 'Hi! Ask me about earbuds, phones, warranty or delivery.' }])
  const [t, setT] = React.useState('')
  const [lastResults, setLastResults] = React.useState([]) // store last product ids (context)

  // Local helpers (fallback)
  function findProductsLocal(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return data.filter(p =>
      (p.brand || '').toLowerCase().includes(q) ||
      (p.name || '').toLowerCase().includes(q)
    );
  }
  function summarizeProducts(list, max = 6) {
    if (!list || list.length === 0) return 'No products found.';
    const shown = list.slice(0, max)
      .map(p => `${p.brand} ${p.name} — ₹${p.price} (Warranty: ${p.specs?.warranty || 'N/A'})`)
      .join('\n');
    const more = list.length > max ? `\n...and ${list.length - max} more.` : '';
    return `Found ${list.length} product(s):\n${shown}${more}\n\nYou can ask "price", "warranty" or "description" about these items.`;
  }
  function answerFollowUpLocal(message, lastIds) {
    const mlow = (message || '').toLowerCase();
    const lastList = lastIds && lastIds.length ? data.filter(p => lastIds.includes(p.id)) : [];
    if (!lastList.length) return "I don't have a recent product in context. Try 'show me Samsung' or ask for a product name.";

    if (mlow.includes('warrant')) {
      return lastList.map(p => `${p.brand} ${p.name} — Warranty: ${p.specs?.warranty || 'N/A'}`).join('\n');
    }
    if (mlow.includes('price') || mlow.includes('how much') || mlow.includes('cost')) {
      return lastList.map(p => `${p.brand} ${p.name} — Price: ₹${p.price} (MRP ₹${p.mrp})`).join('\n');
    }
    if (mlow.includes('describe') || mlow.includes('description') || mlow.includes('about')) {
      return lastList.map(p => `${p.brand} ${p.name} — ${p.desc || 'No description available.'}`).join('\n\n');
    }
    return summarizeProducts(lastList);
  }

  const send = async () => {
    if (!t.trim()) return;
    const s = t.trim();
    setT('');
    setM((x) => [...x, { role: 'user', text: s }]);

    // Try server first
    try {
      const r = await fetch(api('/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: s,
          history: [{ role: 'user', text: s, context: { lastProductIds: lastResults } }]
        })
      });
      if (!r.ok) throw new Error('Server not OK');
      const d = await r.json();

      // If server returned product list, update last results
      if (Array.isArray(d.products) && d.products.length) {
        setLastResults(d.products.map(p => p.id));
      } else if (Array.isArray(d.lastProductIds) && d.lastProductIds.length) {
        setLastResults(d.lastProductIds);
      }

      setM((x) => [...x, { role: 'assistant', text: d.reply || 'Sorry, no reply.' }]);
      return;
    } catch (e) {
      // network/server error -> fallback to local logic
    }

    // Local fallback behavior
    const lower = s.toLowerCase();

    // "show/list/find" queries: list matching products
    if (lower.startsWith('show') || lower.startsWith('list') || lower.includes('show me') || lower.includes('find')) {
      let q = s.replace(/show me|show|list|find/ig, '').trim();
      if (!q) q = s;
      const found = findProductsLocal(q);
      setLastResults(found.map(p => p.id));
      const reply = summarizeProducts(found);
      setM(x => [...x, { role: 'assistant', text: reply }]);
      return;
    }

    // short single-word brand/product name quick lookup (e.g., "Samsung")
    if (!s.includes(' ') && s.length <= 40) {
      const found = findProductsLocal(s);
      if (found.length) {
        setLastResults(found.map(p => p.id));
        setM(x => [...x, { role: 'assistant', text: summarizeProducts(found) }]);
        return;
      }
    }

    // follow-ups referring to last results: warranty/price/description
    if (lower.includes('warrant') || lower.includes('price') || lower.includes('cost') || lower.includes('describe') || lower.includes('how much') || lower.includes('about')) {
      const reply = answerFollowUpLocal(s, lastResults);
      setM(x => [...x, { role: 'assistant', text: reply }]);
      return;
    }

    // direct product name lookup (multi-word)
    const direct = findProductsLocal(s);
    if (direct.length) {
      setLastResults(direct.map(p => p.id));
      setM(x => [...x, { role: 'assistant', text: summarizeProducts(direct) }]);
      return;
    }

    // fallback small FAQ
    const faq = (() => {
      if (lower.includes('warranty')) return 'Most items include 6 months – 1 year warranty depending on brand. Ask for a specific product for exact warranty.';
      if (lower.includes('delivery') || lower.includes('shipping')) return 'Delivery is usually 3–7 days depending on your location. Tracking provided post dispatch.';
      if (lower.includes('return')) return 'Returns accepted within 7 days if item is unused and in original packaging.';
      if (lower.includes('earbud') || lower.includes('tws')) return 'Popular earbud brands here: boAt, Noise, Tribit. Try "show me boAt".';
      return "Sorry, I didn't understand. Try 'show me Samsung', 'price of iPhone 17 Pro', or ask 'what's the warranty?' after showing products.";
    })();

    setM(x => [...x, { role: 'assistant', text: faq }]);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-3">
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold">DigitGenius AI Assistant</div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="h-72 overflow-auto space-y-2 bg-slate-50 p-2 rounded">
          {m.map((x, i) => (
            <div key={i} className={(x.role === 'user' ? 'ml-auto bg-brand text-white' : 'bg-white border') + ' px-3 py-2 rounded-xl max-w-[80%]'} style={{whiteSpace:'pre-wrap'}}>
              {x.text}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Type a message" className="flex-1 border rounded-xl px-3 py-2" />
          <button onClick={send} className="btn">Send</button>
        </div>
      </div>
    </div>
  )
}
function FloatingChat() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-6 right-6 btn rounded-full shadow-lg">💬</button>
      {open && <ChatModal onClose={() => setOpen(false)} />}
    </>
  )
}

/* App + mount (unchanged) - include your existing Routes/pages here exactly as before.
   For brevity: reuse all the page components (Home, Products, Product, Collections, etc.)
   as they were in your original file. The Chat injected above replaces the old one.
*/

/* ========== Recreate original App structure ========== */
/* (Below: include the rest of your unchanged components / pages and final mount) */

/* For brevity in this response the rest of the file (all pages, Checkout, Orders, etc.)
   remain identical to your original main file — only the ChatModal and FloatingChat
   were replaced. When you paste this file into your project, ensure the top-of-file
   page components and route definitions are present (they are identical to your original file). */

function App() {
  return (
    <AuthProvider>
      <WishProvider>
        <CartProvider>
          <Nav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/products" element={<Products />} />
            <Route path="/products/:id" element={<Product />} />
            <Route path="/collections" element={<Collections />} />
            <Route path="/collections/:name" element={<CollectionView />} />
            <Route path="/wishlist" element={<Wishlist />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/profile" element={<Private><Profile /></Private>} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/success" element={<Success />} />
            <Route path="/cancel" element={<Cancel />} />
          </Routes>
          <FloatingChat />
          <Footer />
        </CartProvider>
      </WishProvider>
    </AuthProvider>
  )
}

/* ========= Mount with Router + GA tracker ========= */
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AnalyticsTracker />
    <App />
  </BrowserRouter>
)
