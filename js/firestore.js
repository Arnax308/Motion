/* ==========================================================================
   MOTION FIRESTORE TRANSPORT — Firebase REST calls, no SDK.
   push(records) writes records with a server timestamp; pull(cursor) reads
   everything written after the cursor, in server-time order.
   ========================================================================== */

(function (root) {
  const PAGE = 500;

  // kv: { get(key) -> Promise<string|null>, set(key, value) -> Promise } for the auth tokens
  function createFirestoreTransport(config, kv, fetchImpl) {
    const doFetch = fetchImpl || ((...args) => fetch(...args));
    const docsRoot = `projects/${config.projectId}/databases/(default)/documents`;
    const apiBase = `https://firestore.googleapis.com/v1/${docsRoot}`;
    const spacePath = `spaces/${config.syncKey}`;
    const tokenKey = `motion-auth-${config.projectId}`;
    let auth = null;

    async function request(url, body, form) {
      const res = await doFetch(url, {
        method: 'POST',
        headers: form
          ? { 'Content-Type': 'application/x-www-form-urlencoded' }
          : Object.assign({ 'Content-Type': 'application/json' }, auth ? { Authorization: `Bearer ${auth.idToken}` } : {}),
        body: form ? body : JSON.stringify(body)
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error page */ }
      if (!res.ok) {
        const err = new Error((json && json.error && (json.error.message || json.error.status)) || `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return json;
    }

    // Anonymous sign-in, kept alive with the refresh token
    async function ensureAuth() {
      if (!auth) {
        const saved = await kv.get(tokenKey);
        if (saved) { try { auth = JSON.parse(saved); } catch (e) { auth = null; } }
      }
      if (auth && auth.expiresAt - Date.now() > 60 * 1000) return;

      const prev = auth;
      auth = null; // auth endpoints must not get the old bearer header
      if (prev && prev.refreshToken) {
        try {
          const r = await request(`https://securetoken.googleapis.com/v1/token?key=${config.apiKey}`,
            `grant_type=refresh_token&refresh_token=${encodeURIComponent(prev.refreshToken)}`, true);
          auth = { idToken: r.id_token, refreshToken: r.refresh_token, expiresAt: Date.now() + Number(r.expires_in) * 1000 };
        } catch (e) {
          if (!e.status) throw e; // offline: try again later
        }
      }
      if (!auth) {
        const r = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`, { returnSecureToken: true });
        auth = { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn) * 1000 };
      }
      await kv.set(tokenKey, JSON.stringify(auth));
    }

    function docId(key) {
      return key.replace(/\//g, '_');
    }

    async function push(records) {
      if (!records.length) return;
      await ensureAuth();
      const writes = records.map(r => ({
        update: {
          name: `${docsRoot}/${spacePath}/records/${docId(r.key)}`,
          fields: {
            key: { stringValue: r.key },
            json: { stringValue: r.json || '' },
            updated_at: { integerValue: String(r.updated_at) },
            deleted: { booleanValue: !!r.deleted },
            device: { stringValue: r.device || '' }
          }
        },
        updateTransforms: [{ fieldPath: 'synced_at', setToServerValue: 'REQUEST_TIME' }]
      }));
      await request(`${apiBase}:commit`, { writes });
    }

    // cursor: { t: server timestamp, name: document name } of the last record seen, or null
    async function pull(cursor) {
      await ensureAuth();
      const structuredQuery = {
        from: [{ collectionId: 'records' }],
        orderBy: [
          { field: { fieldPath: 'synced_at' }, direction: 'ASCENDING' },
          { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }
        ],
        limit: PAGE
      };
      if (cursor) {
        structuredQuery.startAt = {
          values: [{ timestampValue: cursor.t }, { referenceValue: cursor.name }],
          before: false
        };
      }
      const rows = await request(`${apiBase}/${spacePath}:runQuery`, { structuredQuery });
      const docs = (rows || []).filter(r => r.document).map(r => r.document);
      const records = docs.map(d => ({
        key: d.fields.key.stringValue,
        json: d.fields.json ? d.fields.json.stringValue : '',
        updated_at: Number(d.fields.updated_at.integerValue),
        deleted: !!(d.fields.deleted && d.fields.deleted.booleanValue)
      }));
      const last = docs[docs.length - 1];
      return {
        records,
        cursor: last ? { t: last.fields.synced_at.timestampValue, name: last.name } : cursor,
        more: docs.length === PAGE
      };
    }

    return { push, pull };
  }

  root.Motion = root.Motion || {};
  root.Motion.createFirestoreTransport = createFirestoreTransport;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createFirestoreTransport };
})(typeof window !== 'undefined' ? window : globalThis);
