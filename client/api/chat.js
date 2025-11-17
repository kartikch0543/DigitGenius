/* ---------------------------
   CLEAN ChatModal (no alerts)
--------------------------- */

function ChatModal({ onClose }) {
  const [messages, setMessages] = React.useState([
    { role: 'assistant', text: 'Hi! Ask me about earbuds, phones, warranty or delivery.' }
  ]);
  const [text, setText] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const listRef = React.useRef(null);

  React.useEffect(() => {
    try { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; } catch {}
  }, [messages]);

  function findLocalProducts(q) {
    if (!q) return [];
    const qq = q.toLowerCase();
    return data.filter((p) =>
      ((p.name || '') + ' ' + (p.brand || '') + ' ' + (p.keywords || []).join(' '))
      .toLowerCase()
      .includes(qq)
    );
  }

  const send = async () => {
    if (!text.trim()) return;
    const userText = text.trim();
    setText('');
    setMessages(m => [...m, { role: 'user', text: userText }]);
    setLoading(true);

    const history = messages.slice(-8).map(m => ({ role: m.role, text: m.text }));

    try {
      const base = window.location.origin;
      const url = base + '/api/chat';

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText, history }),
      });

      let dataResp = null;
      try {
        dataResp = await res.json();
      } catch {
        // fallback: local products
        const local = findLocalProducts(userText);
        if (local.length) {
          const reply = local
            .slice(0, 6)
            .map(p => `${p.brand} ${p.name} — ₹${p.price}. Warranty: ${p.warranty || '1 year'}`)
            .join('\n');
          setMessages(m => [...m, { role: 'assistant', text: reply }]);
          return;
        }
        setMessages(m => [...m, { role: 'assistant', text: 'Sorry, something went wrong.' }]);
        return;
      }

      // reply text from server
      const reply = dataResp?.reply || dataResp?.text || dataResp?.message || '';

      const generic = "I can help with products, warranty, delivery and payments.";
      const fallback = (dataResp?.source === 'faq' || dataResp?.source === 'fallback');

      if (fallback || reply.trim().toLowerCase() === generic.toLowerCase()) {
        const local = findLocalProducts(userText);
        if (local.length) {
          const reply2 = local
            .slice(0, 6)
            .map(p => `${p.brand} ${p.name} — ₹${p.price}. Warranty: ${p.warranty || '1 year'}`)
            .join('\n');
          setMessages(m => [...m, { role: 'assistant', text: reply2 }]);
          return;
        }
      }

      setMessages(m => [...m, { role: 'assistant', text: reply || generic }]);

    } catch {
      const local = findLocalProducts(userText);
      if (local.length) {
        const reply2 = local
          .slice(0, 6)
          .map(p => `${p.brand} ${p.name} — ₹${p.price}. Warranty: ${p.warranty || '1 year'}`)
          .join('\n');
        setMessages(m => [...m, { role: 'assistant', text: reply2 }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', text: 'Network error. Try again.' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-full max-w-md p-3 shadow-lg">
        
        <div className="flex justify-between items-center mb-2">
          <div className="font-semibold">DigitGenius AI Assistant</div>
          <button onClick={onClose}>✕</button>
        </div>

        <div ref={listRef} className="h-72 overflow-auto space-y-2 bg-slate-50 p-2 rounded">
          {messages.map((m, i) => (
            <div key={i}
              className={(m.role === 'user'
                ? 'ml-auto bg-brand text-white'
                : 'bg-white border') +
                ' px-3 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap'}>
              {m.text}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type a message"
            className="flex-1 border rounded-xl px-3 py-2 resize-none"
            rows={1}
            disabled={loading}
          />
          <button onClick={send} className="btn" disabled={loading}>
            {loading ? '...' : 'Send'}
          </button>
        </div>

      </div>
    </div>
  );
}
