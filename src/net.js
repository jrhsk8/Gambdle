// ─── SUPABASE ADAPTER ─────────────────────────────────────────────────────────
// The single place that talks to the backend. Every Supabase call (Edge Functions, RPCs, REST
// tables) goes through here, so URL building, the default headers, the optional request timeout,
// and the try/catch live in ONE place instead of being re-derived at every call site. Pure I/O: it
// never reads or writes S, touches the DOM, or makes policy decisions. Per-site policy (the dev/test/
// backlog skips, the localStorage dedup, the local-draw fallbacks, which failure means what) stays
// at the call site; this only answers "is the backend configured?" and "here's the Response, or
// null if the request never completed."
//
//   sbConfigured()       → false when SUPABASE_URL is the unset placeholder (the universal gate)
//   sbFetch(path, opts)  → the Response, or null on network error / abort / timeout / unconfigured
//   sbJson(path, opts)   → parsed JSON, or null on any failure / non-2xx / parse error
//
// opts: { method='GET', body (auto-JSON.stringified unless already a string), headers (merged OVER
// SUPABASE_HEADERS), timeout=0 (ms; >0 arms an AbortController, matching the old per-site 5s timer),
// keepalive }. `path` is appended to SUPABASE_URL, e.g. sbFetch('/functions/v1/spin', {...}).
// fetch is invoked synchronously (no await precedes it) so the fetch-spy tests still capture it.

function sbConfigured(){ return SUPABASE_URL !== 'YOUR_SUPABASE_URL'; }

async function sbFetch(path, opts = {}){
  if(!sbConfigured()) return null;
  const { method = 'GET', body, headers, timeout = 0, keepalive } = opts;
  const init = { method, headers: headers ? { ...SUPABASE_HEADERS, ...headers } : SUPABASE_HEADERS };
  if(body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  if(keepalive) init.keepalive = true;
  let timer;
  if(timeout > 0 && typeof AbortController !== 'undefined'){
    const ctrl = new AbortController();
    init.signal = ctrl.signal;
    timer = setTimeout(() => ctrl.abort(), timeout);
  }
  try {
    return await fetch(SUPABASE_URL + path, init);
  } catch(e) {
    return null;
  } finally {
    if(timer) clearTimeout(timer);
  }
}

async function sbJson(path, opts = {}){
  const res = await sbFetch(path, opts);
  if(!res || !res.ok) return null;
  try { return await res.json(); } catch(e){ return null; }
}
