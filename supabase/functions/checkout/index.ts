// Patterns by Rish: website checkout (PayPal) and a few admin actions.
// Runs on Supabase Edge Functions. Prices are always worked out here, on the server, from the website's catalog,
// so nobody can change a price in their browser.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   PAYPAL_CLIENT_ID, PAYPAL_SECRET, PAYPAL_MODE (sandbox | live), SITE_URL
//   optional: GH_TOKEN + GITHUB_REPO (the "Update the website now" button)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const SITE = env("SITE_URL", "https://rupply1214-a11y.github.io/patternsbyrish-site").replace(/\/$/, "");
const PP_BASE = env("PAYPAL_MODE", "sandbox") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
class Oops extends Error { constructor(msg: string, public status = 400) { super(msg); } }
const cents = (v: number) => Math.round(v * 100);
const usd = (c: number) => (c / 100).toFixed(2);

// ---------- PayPal ----------
let ppTok = { v: "", until: 0 };
async function pp(path: string, init: RequestInit = {}) {
  if (Date.now() > ppTok.until) {
    const id = env("PAYPAL_CLIENT_ID"), secret = env("PAYPAL_SECRET");
    if (!id || !secret) throw new Oops("Payments aren't switched on yet. Please try again later.", 503);
    const r = await fetch(PP_BASE + "/v1/oauth2/token", {
      method: "POST", body: "grant_type=client_credentials",
      headers: { Authorization: "Basic " + btoa(id + ":" + secret), "Content-Type": "application/x-www-form-urlencoded" },
    });
    const t = await r.json();
    if (!r.ok) throw new Oops("PayPal sign-in failed. Check the PayPal keys in Supabase.", 502);
    ppTok = { v: t.access_token, until: Date.now() + (t.expires_in - 60) * 1000 };
  }
  const r = await fetch(PP_BASE + path, { ...init, headers: { Authorization: "Bearer " + ppTok.v, "Content-Type": "application/json", ...(init.headers || {}) } });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

// ---------- catalog, coupons, people ----------
type Item = { id: string | number; n: string; d?: string; sp: number; b?: number };
let cat = { at: 0, items: [] as Item[] };
async function catalog() {
  if (Date.now() - cat.at < 120_000 && cat.items.length) return cat.items;
  const r = await fetch(SITE + "/static/catalog.json?t=" + Date.now());
  if (!r.ok) throw new Oops("Couldn't read the pattern list. Please try again.", 502);
  cat = { at: Date.now(), items: await r.json() };
  return cat.items;
}
async function coupon(code: string) {
  code = (code || "").trim().toUpperCase();
  if (!code) return null;
  const { data: c } = await db.from("coupons").select("*").eq("code", code).maybeSingle();
  if (!c || !c.active) throw new Oops("That code isn't valid.");
  if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Oops("That code has expired.");
  if (c.max_uses && c.used >= c.max_uses) throw new Oops("That code has been used up.");
  return c;
}
async function who(req: Request) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t || t.startsWith("sb_")) return null;
  const { data } = await db.auth.getUser(t);
  return data.user || null;
}
async function isAdmin(email?: string) {
  if (!email) return false;
  const { data } = await db.from("admins").select("email").ilike("email", email).maybeSingle();
  return !!data;
}
async function downloads(items: { id: string; name: string }[]) {
  const ids = items.map((i) => String(i.id));
  const { data: files } = await db.from("pattern_files").select("listing_id, drive_url").in("listing_id", ids);
  return items.map((i) => ({ id: i.id, name: i.name, url: (files || []).find((f) => f.listing_id === String(i.id))?.drive_url || "" }));
}

// ---------- actions ----------
async function create(user: any, body: any) {
  const ids = [...new Set((body.items || []).map(String))].slice(0, 60) as string[];
  const all = await catalog();
  const items = ids.map((id) => all.find((c) => String(c.id) === id && c.b)).filter(Boolean) as Item[];
  if (!items.length) throw new Oops("Your cart is empty.");
  const c = await coupon(body.coupon || "");
  const sub = items.reduce((t, i) => t + cents(i.sp), 0);
  const disc = c ? Math.round(sub * c.percent / 100) : 0;
  const total = sub - disc;
  if (total < 1) throw new Oops("The total is too low to pay.");
  const order = {
    intent: "CAPTURE",
    purchase_units: [{
      description: "Patterns by Rish PDF sewing patterns",
      amount: { currency_code: "USD", value: usd(total), breakdown: { item_total: { currency_code: "USD", value: usd(sub) }, ...(disc ? { discount: { currency_code: "USD", value: usd(disc) } } : {}) } },
      items: items.map((i) => ({ name: (i.n + (i.d ? ": " + i.d : "")).slice(0, 127), sku: String(i.id), quantity: "1", category: "DIGITAL_GOODS", unit_amount: { currency_code: "USD", value: usd(cents(i.sp)) } })),
    }],
    application_context: { brand_name: "Patterns by Rish", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW" },
  };
  const r = await pp("/v2/checkout/orders", { method: "POST", body: JSON.stringify(order) });
  if (!r.ok) throw new Oops("PayPal couldn't start the payment. Please try again.", 502);
  const { error } = await db.from("orders").insert({
    user_id: user.id, email: user.email, items: items.map((i) => ({ id: String(i.id), name: i.n + (i.d ? ": " + i.d : ""), price: Number(usd(cents(i.sp))) })),
    amount: Number(usd(total)), currency: "USD", paypal_order_id: r.body.id, status: "created", coupon: c ? c.code : null, discount: Number(usd(disc)),
  });
  if (error) throw new Oops("Couldn't save your order. Please try again.", 500);
  return { paypal_id: r.body.id, total: usd(total) };
}

async function capture(user: any, body: any) {
  const id = String(body.paypal_id || "");
  const { data: row } = await db.from("orders").select("*").eq("paypal_order_id", id).eq("user_id", user.id).maybeSingle();
  if (!row) throw new Oops("We couldn't find this order.", 404);
  if (row.status !== "paid") {
    let r = await pp(`/v2/checkout/orders/${id}/capture`, { method: "POST", headers: { "PayPal-Request-Id": "cap-" + row.id } });
    if (!r.ok && r.body?.details?.[0]?.issue === "ORDER_ALREADY_CAPTURED") r = await pp(`/v2/checkout/orders/${id}`);
    const cap = r.body?.purchase_units?.[0]?.payments?.captures?.[0];
    if (!r.ok || r.body.status !== "COMPLETED" || !cap || cap.status === "DECLINED") {
      await db.from("orders").update({ status: "failed" }).eq("id", row.id);
      throw new Oops("The payment didn't go through. No money was taken; please try again.", 402);
    }
    if (cap.amount?.currency_code !== "USD" || cents(Number(cap.amount.value)) !== cents(Number(row.amount))) {
      await db.from("orders").update({ status: "failed", note: "Amount mismatch: " + JSON.stringify(cap.amount) }).eq("id", row.id);
      throw new Oops("The payment amount didn't match. Please contact us.", 409);
    }
    await db.from("orders").update({ status: "paid", paid_at: new Date().toISOString(), paypal_capture_id: cap.id }).eq("id", row.id);
    if (row.coupon) {
      const { data: c } = await db.from("coupons").select("used").eq("code", row.coupon).maybeSingle();
      if (c) await db.from("coupons").update({ used: (c.used || 0) + 1 }).eq("code", row.coupon);
    }
  }
  return { ok: true, downloads: await downloads(row.items) };
}

async function refund(body: any) {
  const { data: row } = await db.from("orders").select("*").eq("id", body.order_id).maybeSingle();
  if (!row || row.status !== "paid" || !row.paypal_capture_id) throw new Oops("Only paid orders can be refunded.");
  const r = await pp(`/v2/payments/captures/${row.paypal_capture_id}/refund`, { method: "POST", body: "{}", headers: { "PayPal-Request-Id": "ref-" + row.id } });
  if (!r.ok) throw new Oops("PayPal refused the refund: " + (r.body?.details?.[0]?.description || r.body?.message || r.status), 502);
  await db.from("orders").update({ status: "refunded", note: ((row.note || "") + " Refunded in PayPal " + new Date().toISOString().slice(0, 10)).trim() }).eq("id", row.id);
  return { ok: true };
}

async function publish() {
  const token = env("GH_TOKEN"), repo = env("GITHUB_REPO", "rupply1214-a11y/patternsbyrish-site");
  if (!token) throw new Oops("The update button isn't connected yet (GH_TOKEN secret missing).", 503);
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/sync-and-deploy.yml/dispatches`, {
    method: "POST", body: JSON.stringify({ ref: "main" }),
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "patternsbyrish-admin" },
  });
  if (r.status !== 204) throw new Oops("GitHub didn't start the update (" + r.status + ").", 502);
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "coupon") { const c = await coupon(body.code); if (!c) throw new Oops("Type a code first."); return json({ percent: c.percent }); }
    if (body.action === "status") return json({ ok: true, paypal: !!env("PAYPAL_SECRET"), mode: env("PAYPAL_MODE", "sandbox"), publish: !!env("GH_TOKEN") });
    const user = await who(req);
    if (!user) throw new Oops("Please sign in first.", 401);
    if (body.action === "create") return json(await create(user, body));
    if (body.action === "capture") return json(await capture(user, body));
    if (["refund", "publish", "resend"].includes(body.action)) {
      if (!(await isAdmin(user.email))) throw new Oops("Only the shop owner can do that.", 403);
      if (body.action === "refund") return json(await refund(body));
      if (body.action === "publish") return json(await publish());
    }
    throw new Oops("Unknown request.");
  } catch (e) {
    const err = e as Oops;
    return json({ error: err.message || "Something went wrong." }, err.status || 500);
  }
});
