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

// ---------- order email (Brevo) ----------
const LOGO = SITE + "/static/img/logo-email.png";
const escH = (t: string) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
async function orderEmail(row: any, dl: { name: string; url: string }[]) {
  const key = env("BREVO_API_KEY");
  if (!key) return false;
  const rows = dl.map((d) => `<tr><td style="padding:12px 0;border-bottom:1px dashed #E4DACC;font-size:15px;color:#1A1717;">${escH(d.name)}</td>
    <td align="right" style="padding:12px 0;border-bottom:1px dashed #E4DACC;">${d.url
      ? `<a href="${escH(d.url)}" style="display:inline-block;padding:9px 18px;border-radius:999px;background:#1A1717;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;">Download</a>`
      : `<span style="font-size:13px;color:#7A736C;">Coming shortly in My purchases</span>`}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#F6F1E9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F1E9;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="height:8px;background:#F5D76E;border-radius:8px 8px 0 0;"></td></tr>
<tr><td style="background:#FFFDF9;border:1px solid #E4DACC;border-top:0;border-radius:0 0 18px 18px;padding:34px 32px 30px;font-family:Helvetica,Arial,sans-serif;color:#1A1717;">
<a href="${SITE}/"><img src="${LOGO}" width="220" alt="Patterns by Rish" style="display:block;border:0;width:220px;height:auto;margin:0 0 26px;"></a>
<h1 style="margin:0 0 10px;font-family:Georgia,serif;font-weight:normal;font-size:28px;line-height:1.2;">Thank you! Your patterns are ready</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#4A4542;">Here are your downloads. They're also saved in <a href="${SITE}/sewing-room/#purchases" style="color:#8A2822;">My purchases</a>, so you can come back any time.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:18px 0 0;font-size:15px;color:#1A1717;"><b>Total paid: $${Number(row.amount).toFixed(2)} USD</b>${row.coupon ? ` (coupon ${escH(row.coupon)})` : ""}</p>
<p style="margin:6px 0 0;font-size:13px;color:#7A736C;">PayPal order ${escH(row.paypal_order_id || "")}</p>
<p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#4A4542;">Printing tip: print the test square at 100% (actual size), never "fit to page". Need help? Just reply to this email.</p>
<p style="margin:26px 0 0;padding-top:18px;border-top:1px dashed #E4DACC;font-size:13px;line-height:1.6;color:#7A736C;">Happy sewing,<br><span style="color:#8A2822;font-family:Georgia,serif;font-style:italic;font-size:16px;">The Patterns by Rish studio</span></p>
</td></tr></table></td></tr></table></body></html>`;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: "Patterns by Rish", email: env("SENDER_EMAIL", "patternsbyrish@gmail.com") },
      replyTo: { email: env("SENDER_EMAIL", "patternsbyrish@gmail.com"), name: "Patterns by Rish" },
      to: [{ email: row.email }], subject: "Your Patterns by Rish order: download your patterns", htmlContent: html }),
  });
  if (!r.ok) { console.error("brevo", r.status, await r.text()); return false; }
  await db.from("orders").update({ emailed_at: new Date().toISOString() }).eq("id", row.id);
  return true;
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
  const dl = await downloads(row.items);
  if (!row.emailed_at) { try { await orderEmail(row, dl); } catch (e) { console.error("order email", e); } }
  return { ok: true, downloads: dl };
}

async function resend(body: any) {
  const { data: row } = await db.from("orders").select("*").eq("id", body.order_id).maybeSingle();
  if (!row || row.status !== "paid") throw new Oops("Only paid orders can be emailed.");
  if (!env("BREVO_API_KEY")) throw new Oops("Order emails aren't switched on yet (BREVO_API_KEY secret missing).", 503);
  if (!(await orderEmail(row, await downloads(row.items)))) throw new Oops("Brevo didn't send the email. Check the Brevo key.", 502);
  return { ok: true };
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
    if (body.action === "status") return json({ ok: true, paypal: !!env("PAYPAL_SECRET"), mode: env("PAYPAL_MODE", "sandbox"), publish: !!env("GH_TOKEN"), email: !!env("BREVO_API_KEY") });
    const user = await who(req);
    if (!user) throw new Oops("Please sign in first.", 401);
    if (body.action === "create") return json(await create(user, body));
    if (body.action === "capture") return json(await capture(user, body));
    if (["refund", "publish", "resend"].includes(body.action)) {
      if (!(await isAdmin(user.email))) throw new Oops("Only the shop owner can do that.", 403);
      if (body.action === "refund") return json(await refund(body));
      if (body.action === "publish") return json(await publish());
      if (body.action === "resend") return json(await resend(body));
    }
    throw new Oops("Unknown request.");
  } catch (e) {
    const err = e as Oops;
    return json({ error: err.message || "Something went wrong." }, err.status || 500);
  }
});
