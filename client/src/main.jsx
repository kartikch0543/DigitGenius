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
  useLocation, // <-- 1. IMPORT IS HERE
} from 'react-router-dom'
import './index.css'
import { api } from './lib/api.js'
import data from './products.json'

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
    Google Analytics Tracker (NEW)
========================================================= */
function AnalyticsTracker() {
  const location = useLocation();
  
  // Your Google Analytics Measurement ID
  const GA_MEASUREMENT_ID = 'G-DBQ6C8X7VX';

  React.useEffect(() => {
    // Check if the gtag function is available
    if (typeof window.gtag === 'function') {
      window.gtag('config', GA_MEASUREMENT_ID, {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]); // This effect runs every time the 'location' changes

  return null; // This component doesn't render any visible UI
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
function Home() {
  return (
    <>
      <SEO
        title="DigitGenius — Buy Electronics & Gadgets Online in India"
        description="Shop mobiles, earbuds, power banks, smartwatches and more at DigitGenius. Fast checkout, secure payments and speedy delivery across India."
        keywords={[
          'electronics online','buy gadgets india','smartphones',
          'earbuds','power bank','smartwatch','best prices','DigitGenius'
        ]}
        canonical={location.origin + '/'}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'DigitGenius',
          url: location.origin,
          logo: location.origin + '/logo192.png'
        }}
      />
      <main className="container py-8">
        <section className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Discover your next favorite gadget with <span className="text-brand">DigiGenius</span>
            </h1>
          </div>
        </section>
        <hr className="div" />
        <section>
          <h2 className="text-2xl font-bold mb-3">New Arrivals</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.slice(-6).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
        <hr className="div" />
        <section>
          <h2 className="text-2xl font-bold mb-3">Bestsellers</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...data].sort((a, b) => b.rating - a.rating).slice(0, 6).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
        <hr className="div" />
        <section>
          <h2 className="text-2xl font-bold mb-3">All Products</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.slice(0, 6).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </section>
      </main>
    </>
  )
}

function Products() {
  const [params, setParams] = useSearchParams()
  const q = (params.get('q') || '').toLowerCase()
  const brand = params.get('brand') || 'all'
  const rating = Number(params.get('rating') || 0)
  const min = Number(params.get('min') || 0),
    max = Number(params.get('max') || 999999)
  const sort = params.get('sort') || 'relevance'
  const brands = [...new Set(data.map((p) => p.brand))].sort()
  const list = data
    .filter((p) => (p.name + ' ' + p.brand).toLowerCase().includes(q))
    .filter((p) => brand === 'all' || p.brand === brand)
    .filter((p) => p.rating >= rating)
    .filter((p) => p.price >= min && p.price <= max)
    .sort((a, b) =>
      sort === 'price-asc'
        ? a.price - b.price
        : sort === 'price-desc'
        ? b.price - a.price
        : sort === 'newest'
        ? b.id.localeCompare(a.id)
        : 0
    )

  function update(k, v) {
    const p = new URLSearchParams(params)
    if (v === '' || v === 'all') p.delete(k)
    else p.set(k, v)
    setParams(p, { replace: true })
  }

  const pageTitle = (q ? `Search "${q}" — ` : '') + 'Products | DigitGenius'
  const desc = q
    ? `Results for "${q}" at DigitGenius. Compare prices, ratings and specs.`
    : 'Browse all electronics at DigitGenius. Filter by brand, rating and price.'

  return (
    <>
      <SEO
        title={pageTitle}
        description={desc}
        keywords={['electronics','mobiles','earbuds','smartwatch','online store','DigitGenius']}
        canonical={location.origin + '/products' + (q ? `?q=${encodeURIComponent(q)}` : '')}
      />
      <main className="container py-8 grid md:grid-cols-4 gap-6">
        <aside className="card p-4 md:sticky md:top-20 h-fit">
          <div className="font-semibold mb-2">Filters</div>
          <label className="block mb-2">
            Search
            <input defaultValue={params.get('q') || ''} onChange={(e) => update('q', e.target.value)} className="w-full" />
          </label>
          <label className="block mb-2">
            Brand
            <select defaultValue={brand} onChange={(e) => update('brand', e.target.value)} className="w-full">
              <option value="all">All</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <label>
              Min
              <input type="number" defaultValue={params.get('min') || ''} onChange={(e) => update('min', e.target.value)} className="w-full" />
            </label>
            <label>
              Max
              <input type="number" defaultValue={params.get('max') || ''} onChange={(e) => update('max', e.target.value)} className="w-full" />
            </label>
          </div>
          <label className="block mb-2">
            Rating ≥
            <input type="number" step="0.1" defaultValue={params.get('rating') || ''} onChange={(e) => update('rating', e.target.value)} className="w-full" />
          </label>
          <label className="block">
            Sort
            <select defaultValue={sort} onChange={(e) => update('sort', e.target.value)} className="w-full">
button>
              <option value="relevance">Relevance</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="newest">Newest</option>
            </select>
          </label>
        </aside>
        <section className="md:col-span-3">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </section>
      </main>
    </>
  )
}

function Collections() {
  const cols = [...new Set(data.map((p) => p.collection))]
  return (
    <>
      <SEO
        title="Collections | DigitGenius"
        description="Explore curated collections of electronics at DigitGenius."
        keywords={['collections','electronics collections','DigitGenius']}
        canonical={location.origin + '/collections'}
  _    />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3">Collections</h1>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {cols.map((c) => (
            <Link key={c} to={`/collections/${c}`} className="card p-6">
              <div className="text-lg font-semibold capitalize">{c}</div>
              <div className="text-sm text-slate-600">{data.filter((p) => p.collection === c).length} items</div>
            </Link>
          ))}
        </div>
      </main>
    </>
  )
}

function CollectionView() {
  const { name } = useParams()
  const list = data.filter((p) => p.collection === name)
  return (
    <>
      <SEO
        title={`${name} Collection | DigitGenius`}
        description={`Explore ${name} collection: curated electronics with great prices at DigitGenius.`}
        keywords={[name, 'collection', 'electronics', 'DigitGenius']}
        canonical={location.origin + '/collections/' + name}
      />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3 capitalize">{name}</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </main>
    </>
  )
}

function Wishlist() {
  const { items } = useWish()
  return (
    <>
      <SEO
        title="Wishlist | DigitGenius"
        description="Your saved products at DigitGenius."
        canonical={location.origin + '/wishlist'}
      />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3">Wishlist</h1>
        {items.length === 0 ? 'No items' : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      </main>
    </>
  )
}

function Product() {
  const { id } = useParams()
  const p = data.find((x) => x.id === id)
  const { add } = useCart()
  if (!p) return <main className="container py-8">Not found</main>

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    brand: p.brand,
    image: p.img,
    description: p.desc || `${p.brand} ${p.name} at DigitGenius`,
    sku: p.id,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: p.price,
      availability: 'https://schema.org/InStock',
      url: location.origin + '/products/' + p.id,
    },
    aggregateRating: p.rating
      ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: Math.max(23, Math.floor(p.rating * 40)) }
      : undefined
  }

  return (
    <>
      <SEO
        title={`${p.name} Price in India | Buy ${p.name} Online — DigitGenius`}
        description={`${p.name} by ${p.brand}. Best price ₹${p.price}. Specs: RAM ${p.specs?.ram || '-'}, Storage ${p.specs?.storage || '-'}, Battery ${p.specs?.battery || '-'}.`}
        keywords={[p.name, p.brand, 'price in India', 'buy online', 'DigitGenius']}
        canonical={location.origin + '/products/' + p.id}
        jsonLd={ld}
      />
      <main className="container py-8 grid md:grid-cols-2 gap-6">
        <img src={p.img} className="rounded-xl" alt={p.name} />
        <div>
          <nav className="text-sm text-slate-500 mb-2">
            <Link to="/">Home</Link> / <Link to="/products">Products</Link> / <span>{p.brand}</span>
          </nav>
          <h1 className="text-3xl font-bold">{p.name}</h1>
          <div className="text-slate-600">Seller: DigitGenius Retail • ⭐ {p.rating}</div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-2xl font-extrabold">₹{p.price}</div>
            <div className="text-sm line-through text-slate-500">₹{p.mrp}</div>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn" onClick={() => add(p)}>Add to Cart</button>
            <Link to="/cart" className="btn-outline">Go to Cart</Link>
          </div>
          <hr className="div" />
          <h3 className="font-semibold mb-2">Key Specs</h3>
          <ul className="grid grid-cols-2 gap-1 text-sm text-slate-700">
            <li>RAM: {p.specs?.ram || '-'}</li>
            <li>Storage: {p.specs?.storage || '-'}</li>
            <li>Battery: {p.specs?.battery || '-'}</li>
            <li>Connectivity: {p.specs?.connectivity || '-'}</li>
            <li>Warranty: {p.specs?.warranty || '1 year'}</li>
          </ul>
          <hr className="div" />
          <h3 className="font-semibold mb-2">About this item</h3>
          <p className="text-slate-700 text-sm leading-6">{p.desc || 'High-quality electronics with reliable performance and warranty.'}</p>
        </div>
      </main>
    </>
  )
}

function Cart() {
  const { cart, inc, dec, remove, total } = useCart()
  const nav = useNavigate()
  return (
    <>
      <SEO
        title="Cart | DigitGenius"
        description="Review items in your cart and proceed to checkout."
        canonical={location.origin + '/cart'}
      />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3">Cart</h1>
        {cart.length === 0 ? (
          'Empty cart'
        ) : (
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-3">
              {cart.map((i) => (
                <div key={i.id} className="card p-4 flex items-center gap-3">
                  <img src={i.img} className="w-24 h-16 rounded" alt={i.name} />
                  <div className="flex-1">
                    <div className="font-medium">{i.name}</div>
                    <div className="text-sm">₹{i.price}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => dec(i.id)} className="px-2 border rounded">-</button>
                      <span>{i.qty}</span>
                      <button onClick={() => inc(i.id)} className="px-2 border rounded">+</button>
                    </div>
                  </div>
                  <button onClick={() => remove(i.id)} className="btn-outline">Remove</button>
                </div>
              ))}
            </div>
            <div className="card p-4 h-fit">
              <div className="font-semibold">Total ₹{total}</div>
              <button onClick={() => nav('/checkout')} className="btn mt-2 w-full">Checkout</button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}

/* =============================== */
/* Checkout with COD / Online(UPI) */
/* =============================== */
function Checkout() {
  const { cart, total, setCart } = useCart()
  const { token } = useAuth()
  const nav = useNavigate()
  const [addresses, setAddresses] = React.useState(loadAddresses())
  const [selected, setSelected] = React.useState(() => addresses.find((a) => a.default)?.id || '')
  const [adding, setAdding] = React.useState(false)

  // payment method + UPI flow
  const [payment, setPayment] = React.useState('cod') // 'cod' | 'online'
  const [paidConfirm, setPaidConfirm] = React.useState(false)
  const [upiRef, setUpiRef] = React.useState('')

  function submit(e) {
    e.preventDefault()
    const address = adding
      ? Object.fromEntries(new FormData(e.target).entries())
      : addresses.find((a) => a.id === selected) || {}

    if (adding) {
      const rec = addAddress({ label: 'New', ...address })
      setAddresses(loadAddresses())
      setSelected(rec.id)
      setAdding(false)
    }

    if (payment === 'online' && !paidConfirm) {
      alert('Please confirm your online payment before placing the order.')
      return
    }

    ;(async () => {
      const r = await fetch(api('/orders/checkout'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          items: cart,
          address,
          paymentMethod: payment,
          upiReference: upiRef || null,
          guestId: getGuestId(),
        }),
      })

      const text = await r.text()
      let d = null
      try { d = text ? JSON.parse(text) : null } catch {}
      if (r.ok) {
        setCart([])
        nav('/success?order=' + (d?.orderId || ''))
      } else {
        alert((d && (d.message || d.error)) || text || 'Payment failed')
      }
    })()
  }

  if (cart.length === 0) return <main className="container py-8">Cart empty</main>

  return (
    <>
      <SEO
        title="Checkout | DigitGenius"
        description="Secure checkout — pay online via UPI or Cash on Delivery."
        canonical={location.origin + '/checkout'}
      />
      <main className="container py-8 grid md:grid-cols-3 gap-4">
        <form onSubmit={submit} className="md:col-span-2 space-y-4">
          {/* Address card */}
          <div className="card p-4 space-y-3">
            <div className="font-semibold">Select delivery address</div>

            {addresses.length > 0 ? (
              <div className="space-y-2">
                {addresses.map((a) => (
                  <label key={a.id} className="flex items-start gap-2 border rounded-xl p-3">
                    <input type="radio" name="addr" checked={selected === a.id} onChange={() => setSelected(a.id)} />
                    <div>
                      <div className="font-medium">
                        {a.label} {a.default && <span className="badge ml-2">Default</span>}
                      </div>
                      <div className="text-sm text-slate-600">{a.name}, {a.phone}</div>
                      <div className="text-sm text-slate-600">{a.line1}, {a.city} - {a.pin}</div>
                    </div>
        _         </label>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-600">No saved address yet. Add one below.</div>
            )}

            <button type="button" onClick={() => setAdding((x) => !x)} className="btn-outline">
              {adding ? 'Cancel' : 'Add new address'}
            </button>

            {adding && (
              <div className="grid sm:grid-cols-2 gap-2">
                <input name="name" placeholder="Name" required />
                <input name="phone" placeholder="Phone" required />
                <input name="line1" placeholder="House/Street" className="sm:col-span-2" required />
                <input name="city" placeholder="City" required />
                <input name="pin" placeholder="PIN" required />
              </div>
            )}
          </div>

          {/* Payment method */}
        _ <div className="card p-4 space-y-3">
            <div className="font-semibold">Payment method</div>

            <label className="flex items-center gap-2">
              <input type="radio" name="pay" value="cod" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
              <span>Cash on Delivery (COD)</span>
            </label>

            <label className="flex items-center gap-2">
              <input type="radio" name="pay" value="online" checked={payment === 'online'} onChange={() => setPayment('online')} />
              <span>Online (UPI)</span>
            </label>

            {payment === 'online' && (
              <div className="border rounded-xl p-3">
                <div className="text-sm text-slate-600 mb-2">Scan & pay using any UPI app</div>
                <img src="/QR.jpeg" alt="UPI QR" className="w-full max-w-sm rounded-lg border" />
                <div className="mt-3 flex flex-col gap-2">
                  <input value={upiRef} onChange={(e) => setUpiRef(e.target.value)} placeholder="UPI reference / transaction ID (optional)" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={paidConfirm} onChange={(e) => setPaidConfirm(e.target.checked)} />
                    <span>I have completed the online payment</span>
                  </label>
                </div>
      _       </div>
            )}

            <div className="pt-1">
              <button className="btn">Place Order</button>
            </div>
          </div>
        </form>

        {/* Summary */}
        <div className="card h-fit p-4">
          <div className="font-semibold">Total ₹{total}</div>
          <div className="text-sm text-slate-600 mt-1">
            {payment === 'cod' ? 'Pay on delivery' : 'Pay now via UPI'}
          </div>
        </div>
      </main>
    </>
  )
}

function Orders() {
  const { token } = useAuth()
  const [orders, setOrders] = React.useState([])
  React.useEffect(() => {
    ;(async () => {
      const r = await fetch(api('/orders/my'), {
        headers: {
          'Guest-Id': getGuestId(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
      const txt = await r.text()
      let d = null
      try { d = txt ? JSON.parse(txt) : null } catch {}
      if (r.ok) setOrders(d?.orders || [])
    })()
  }, [token])
  return (
    <>
      <SEO
        title="My Orders | DigitGenius"
s       description="Track your DigitGenius orders, status and details."
        canonical={location.origin + '/orders'}
      />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3">Orders</h1>
        {orders.length === 0
          ? 'No orders'
          : orders.map((o) => (
              <div key={o.id} className="card p-4 mb-3">
                <div className="flex justify-between">
                  <div className="font-semibold">Order #{o.id}</div>
                  <div className="text-sm">{o.createdAt ? new Date(o.createdAt).toLocaleString() : ''}</div>
                </div>
                <div className="text-sm mb-2">Status: {o.status} • Payment: {(o.paymentMethod || 'cod').toUpperCase()}</div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {o.items.map((it) => (
                    <Link key={it.id} to={'/products/' + it.id} className="border rounded-xl p-2 hover:shadow">
                      <div className="font-medium">{it.name}</div>
                      <div className="text-sm text-slate-600">Qty: {it.qty}</div>
a                 </Link>
                  ))}
                </div>
        _     </div>
            ))}
      </main>
    </>
  )
}

/* =============================== */
/* Auth pages (Login, Signup, Profile)
/* =============================== */
function Login() {
  const { login, loginWithGoogle } = useAuth()
  const nav = useNavigate()
  const [err, setErr] = React.useState('')
  const submit = async (e) => {
    e.preventDefault()
    const { email, pass } = Object.fromEntries(new FormData(e.target))
    try {
      await login(email, pass)
      nav('/profile')
    } catch (e) {
      setErr(e.message)
    }
  }
  const submitGoogle = async () => {
    try {
      await loginWithGoogle()
      nav('/profile')
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <>
      <SEO title="Login | DigitGenius" canonical={location.origin + '/login'} />
      <main className="container py-8 max-w-sm">
        <h1 className="text-2xl font-bold mb-3">Login</h1>
        <form onSubmit={submit} className="card p-4 space-y-3">
          <input name="email" type="email" placeholder="Email" required />
          <input name="pass" type="password" placeholder="Password" required />
          <button className="btn w-full">Login</button>
          <button type="button" onClick={submitGoogle} className="btn-outline w-full">Sign in with Google</button>
          {err && <div className="text-red-500 text-sm">{err}</div>}
          <div className="text-sm">Don't have an account? <Link to="/signup" className="text-brand">Sign up</Link></div>
        </form>
      </main>
    </>
  )
}

function Signup() {
  const { signup } = useAuth()
  const nav = useNavigate()
  const [err, setErr] = React.useState('')
  const submit = async (e) => {
    e.preventDefault()
    const { name, email, pass } = Object.fromEntries(new FormData(e.target))
    try {
      await signup(name, email, pass)
      nav('/profile')
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <>
      <SEO title="Sign Up | DigitGenius" canonical={location.origin + '/signup'} />
      <main className="container py-8 max-w-sm">
        <h1 className="text-2xl font-bold mb-3">Sign Up</h1>
        <form onSubmit={submit} className="card p-4 space-y-3">
          <input name="name" placeholder="Name" required />
          <input name="email" type="email" placeholder="Email" required />
          <input name="pass" type="password" placeholder="Password" required />
          <button className="btn w-full">Create Account</button>
          {err && <div className="text-red-500 text-sm">{err}</div>}
          <div className="text-sm">Already have an account? <Link to="/login" className="text-brand">Login</Link></div>
        </form>
      </main>
    </>
  )
}

function Profile() {
  const { user } = useAuth()
  const [addrs, setAddrs] = React.useState(loadAddresses())
  const makeDefault = (id) => setAddrs(setDefaultAddress(id))
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <SEO title="Profile | DigitGenius" canonical={location.origin + '/profile'} />
      <main className="container py-8">
        <h1 className="text-2xl font-bold mb-3">Profile</h1>
        <div className="card p-4">
          <div>Name: {user.displayName}</div>
          <div>Email: {user.email}</div>
          <hr className="div" />
          <h2 className="font-semibold mt-2">Addresses</h2>
          {addrs.map(a => (
            <div key={a.id} className="border p-2 rounded">
              {a.name}, {a.line1}, {a.city} {a.pin}
              {!a.default && <button onClick={() => makeDefault(a.id)} className="btn-outline ml-2">Make Default</button>}
            </div>
          ))}
        </div>
      </main>
    </>
  )
}

/* =============================== */
/* Static pages (Success, 404)
/* =============================== */
function Success() {
  const [p] = useSearchParams()
  return (
    <>
      <SEO title="Order Successful | DigitGenius" />
      <main className="container py-8 text-center">
        <h1 className="text-2xl font-bold mb-3">Order Successful!</h1>
        {p.get('order') && <div className="text-slate-600">Order ID: {p.get('order')}</div>}
        <Link to="/orders" className="btn mt-4">View Orders</Link>
      </main>
    </>
  )
}

function NotFound() {
  return (
    <>
      <SEO title="404 Not Found | DigitGenius" />
      <main className="container py-8 text-center">
        <h1 className="text-2xl font-bold mb-3">404 - Not Found</h1>
        <p>The page you are looking for does not exist.</p>
        <Link to="/" className="btn mt-4">Go Home</Link>
      </main>
    </>
  )
}


/* =============================== */
/* App (Layout & Router)
/* =============================== */
function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <WishProvider>
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
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/success" element={<Success />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
        </WishProvider>
      </CartProvider>
    </AuthProvider>
  )
}

/* =============================== */
/* Root
/* =============================== */
const container = document.getElementById('root')
const root = createRoot(container)
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AnalyticsTracker /> {/* <-- 3. TRACKER COMPONENT IS HERE */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
)