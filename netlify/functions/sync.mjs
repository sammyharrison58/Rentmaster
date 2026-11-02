import { getStore } from "@netlify/blobs";

let memoryState = null;

const SUPER_ADMIN_EMAIL = "sammyharrison58@gmail.com";

function mergeRecords(baseList, incomingList, key) {
  if (!Array.isArray(incomingList)) return Array.isArray(baseList) ? baseList : [];
  if (!Array.isArray(baseList) || baseList.length === 0) return incomingList;

  const map = new Map();
  baseList.forEach((item) => {
    if (item && item[key]) map.set(item[key], item);
  });
  incomingList.forEach((item) => {
    if (item && item[key]) {
      const existing = map.get(item[key]);
      if (!existing) {
        map.set(item[key], item);
      } else {
        map.set(item[key], { ...existing, ...item });
      }
    }
  });
  return Array.from(map.values());
}

function mergeAudit(baseAudit, incomingAudit) {
  if (!Array.isArray(incomingAudit)) return Array.isArray(baseAudit) ? baseAudit : [];
  if (!Array.isArray(baseAudit)) return incomingAudit;

  const seen = new Set();
  const merged = [];
  [...incomingAudit, ...baseAudit].forEach((a) => {
    if (a && a.id && !seen.has(a.id)) {
      seen.add(a.id);
      merged.push(a);
    }
  });
  return merged.slice(0, 300);
}

function mergeGlobalState(base, incoming) {
  if (!base) return incoming;
  if (!incoming) return base;

  return {
    landlords: mergeRecords(base.landlords, incoming.landlords, "id"),
    tenants: mergeRecords(base.tenants, incoming.tenants, "userId"),
    payments: mergeRecords(base.payments, incoming.payments, "id"),
    audit: mergeAudit(base.audit, incoming.audit),
    usedMpesaCodes: Array.from(new Set([...(base.usedMpesaCodes || []), ...(incoming.usedMpesaCodes || [])])),
    emailNotifications: mergeRecords(base.emailNotifications, incoming.emailNotifications, "id"),
    syncedAt: Date.now()
  };
}

export default async (req, context) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  let store = null;
  try {
    store = getStore("rentmaster_global");
  } catch (err) {
    console.warn("Netlify Blobs init notice:", err.message);
  }

  if (req.method === "GET") {
    let currentState = memoryState;
    let source = "memory";

    try {
      if (store) {
        const data = await store.get("platform_state", { type: "json" });
        if (data) {
          currentState = memoryState ? mergeGlobalState(data, memoryState) : data;
          source = "blobs";
        }
      }
    } catch (e) {
      console.warn("Blobs read fallback:", e.message);
    }

    if (!currentState) {
      return new Response(JSON.stringify({ success: true, state: null, source }), {
        status: 200,
        headers
      });
    }

    const url = new URL(req.url);
    const emailParam = (url.searchParams.get("email") || "").trim().toLowerCase();
    const scopeParam = url.searchParams.get("scope");

    if (scopeParam === "stats") {
      const totalLandlords = (currentState.landlords || []).length;
      const totalTenants = (currentState.tenants || []).length;
      const totalPayments = (currentState.payments || []).length;
      const totalVolume = (currentState.payments || [])
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      return new Response(JSON.stringify({
        success: true,
        stats: {
          totalLandlords,
          totalTenants,
          totalPayments,
          totalVolume,
          syncedAt: currentState.syncedAt || Date.now(),
          source
        }
      }), { status: 200, headers });
    }

    if (emailParam) {
      if (emailParam === SUPER_ADMIN_EMAIL.toLowerCase() || emailParam === "admin@rentmaster.co.ke") {
        return new Response(JSON.stringify({
          success: true,
          scope: "superadmin",
          source,
          state: currentState
        }), { status: 200, headers });
      }

      const landlord = (currentState.landlords || []).find((l) => l.email && l.email.toLowerCase() === emailParam);
      if (landlord) {
        const landlordTenants = (currentState.tenants || []).filter((t) => t.landlordId === landlord.id);
        const landlordPayments = (currentState.payments || []).filter((p) => p.landlordId === landlord.id);
        return new Response(JSON.stringify({
          success: true,
          scope: "landlord",
          source,
          data: {
            landlord,
            tenants: landlordTenants,
            payments: landlordPayments
          }
        }), { status: 200, headers });
      }

      const tenant = (currentState.tenants || []).find((t) => t.email && t.email.toLowerCase() === emailParam);
      if (tenant) {
        const tenantLandlord = (currentState.landlords || []).find((l) => l.id === tenant.landlordId);
        const tenantPayments = (currentState.payments || []).filter((p) => p.tenantId === tenant.userId || p.unit === tenant.unit);
        return new Response(JSON.stringify({
          success: true,
          scope: "tenant",
          source,
          data: {
            tenant,
            landlord: tenantLandlord || null,
            payments: tenantPayments
          }
        }), { status: 200, headers });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      state: currentState,
      source
    }), { status: 200, headers });
  }

  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (!body || !body.state) {
        return new Response(JSON.stringify({ success: false, error: "Missing state payload" }), {
          status: 400,
          headers
        });
      }

      let existing = memoryState;
      if (store) {
        try {
          const remoteData = await store.get("platform_state", { type: "json" });
          if (remoteData) {
            existing = existing ? mergeGlobalState(remoteData, existing) : remoteData;
          }
        } catch (e) {}
      }

      const merged = mergeGlobalState(existing, body.state);
      memoryState = merged;

      if (store) {
        try {
          await store.setJSON("platform_state", merged);
        } catch (blobErr) {
          console.warn("Blobs write warning:", blobErr.message);
        }
      }

      return new Response(JSON.stringify({
        success: true,
        timestamp: Date.now(),
        counts: {
          landlords: (merged.landlords || []).length,
          tenants: (merged.tenants || []).length,
          payments: (merged.payments || []).length
        }
      }), {
        status: 200,
        headers
      });
    } catch (err) {
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers
  });
};
