// netlify/functions/sync.mjs
// Global Cloud State Sync for Rentmaster via Netlify Blobs
// Enables cross-device real-time sync for landlords, tenants, and super admin

import { getStore } from "@netlify/blobs";

// In-process fallback cache
let memoryState = null;

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

  // --- GET: Fetch global platform state ---
  if (req.method === "GET") {
    try {
      if (store) {
        const data = await store.get("platform_state", { type: "json" });
        if (data) {
          return new Response(JSON.stringify({ success: true, state: data, source: "blobs" }), {
            status: 200,
            headers
          });
        }
      }
    } catch (e) {
      console.warn("Blobs read fallback:", e.message);
    }

    return new Response(JSON.stringify({ success: true, state: memoryState, source: "memory" }), {
      status: 200,
      headers
    });
  }

  // --- POST: Save global platform state ---
  if (req.method === "POST") {
    try {
      const body = await req.json();
      if (!body || !body.state) {
        return new Response(JSON.stringify({ success: false, error: "Missing state payload" }), {
          status: 400,
          headers
        });
      }

      memoryState = body.state;

      if (store) {
        try {
          await store.setJSON("platform_state", body.state);
        } catch (blobErr) {
          console.warn("Blobs write warning:", blobErr.message);
        }
      }

      return new Response(JSON.stringify({ success: true, timestamp: Date.now() }), {
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
