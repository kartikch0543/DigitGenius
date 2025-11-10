// client/src/lib/analytics.js
export const GA_ID = import.meta.env.VITE_GA_ID;

let loaded = false;

export function initGA() {
  if (loaded || !GA_ID || typeof window === 'undefined') return;
  loaded = true;

  // Load gtag.js
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);

  // dataLayer + base config (no auto page_view; we'll send manually on route changes)
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());

  // (Optional) Consent Mode default – tweak to your needs
  // window.gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'granted' });

  window.gtag('config', GA_ID, { send_page_view: false, anonymize_ip: true });
}

export function trackPage(path) {
  if (!GA_ID || typeof window === 'undefined' || !window.gtag) return;
  // GA4 recommended page_view event
  window.gtag('event', 'page_view', {
    page_location: window.location.origin + path,
    page_path: path,
    send_to: GA_ID,
  });
}

export function trackEvent(name, params = {}) {
  if (!GA_ID || typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', name, params);
}
