(() => {
  const C = window.PBR || {};
  if (!C.sell) return;
  const KEY = "pbr_cart";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (v) => "$" + (Math.round(v * 100) / 100).toFixed(2);
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} paintCount(); };
  let cart = read();

  function paintCount() {
    document.querySelectorAll("[data-cart-count]").forEach((n) => { n.textContent = cart.length || ""; n.hidden = !cart.length; });
    document.querySelectorAll("[data-add-cart]").forEach((b) => {
      const id = JSON.parse(b.dataset.addCart).id, inCart = cart.some((x) => x.id === id);
      const l = b.querySelector("[data-cart-label]"); if (l) l.textContent = inCart ? "In your cart: view cart" : "Add to cart";
      b.classList.toggle("in-cart", inCart);
    });
  }
  const add = (item) => { if (!cart.some((x) => x.id === item.id)) { cart.push(item); write(cart); } };
  paintCount();

  // product pages: Add to cart / Buy now
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add-cart]"), b = e.target.closest("[data-buy-now]");
    if (!a && !b) return;
    e.preventDefault();
    const item = JSON.parse((a || b).dataset.addCart || (a || b).dataset.buyNow);
    if (a && a.classList.contains("in-cart")) return (location.href = C.base + "cart/");
    add(item);
    if (b) location.href = C.base + "cart/";
  });

  /* ---------- the cart page ---------- */
  const page = document.querySelector("[data-cart-page]");
  if (!page) return;
  const $ = (s) => page.querySelector(s);
  const home = new URL(page.dataset.home, location.href).href;
  let catalog = [], coupon = null, token = null, buttonsShown = false;

  async function call(body) {
    const h = { "Content-Type": "application/json", apikey: C.key };
    if (token) h.Authorization = "Bearer " + token;
    const r = await fetch(C.sb + "/functions/v1/checkout", { method: "POST", headers: h, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "Something went wrong. Please try again.");
    return j;
  }

  const lines = () => cart.map((x) => ({ x, p: catalog.find((c) => String(c.id) === String(x.id) && c.b) })).filter((l) => l.p);
  function totals() {
    const sub = lines().reduce((t, l) => t + l.p.sp, 0);
    const disc = coupon ? Math.round(sub * coupon.percent) / 100 : 0;
    return { sub, disc, total: Math.max(0, Math.round((sub - disc) * 100) / 100) };
  }
  function draw() {
    const ls = lines();
    $("[data-cart-empty]").hidden = ls.length > 0;
    $("[data-cart-sum]").hidden = !ls.length;
    $("[data-cart-items]").innerHTML = ls.map(({ p }) => `
      <li><a href="${home}pattern/${esc(p.s)}/"><img src="${esc(p.i)}" alt="" loading="lazy"></a>
        <span><a href="${home}pattern/${esc(p.s)}/"><b>${esc(p.n)}</b></a>${p.d ? `<small>${esc(p.d)}</small>` : ""}<small>PDF sewing pattern, instant download</small></span>
        <span class="cart-price">${esc(p.spr)}${!p.o && p.pr !== p.spr ? `<s>${esc(p.pr)} on Etsy</s>` : ""}</span>
        <button type="button" class="icon-x" data-rm="${esc(p.id)}" aria-label="Remove ${esc(p.n)}">×</button></li>`).join("");
    page.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { cart = cart.filter((x) => String(x.id) !== b.dataset.rm); write(cart); draw(); }));
    const t = totals();
    $("[data-sub]").textContent = money(t.sub);
    $("[data-disc-row]").hidden = !coupon;
    if (coupon) { $("[data-disc-code]").textContent = coupon.code + " (" + coupon.percent + "% off)"; $("[data-disc]").textContent = "-" + money(t.disc); }
    $("[data-total]").textContent = money(t.total);
    $("[data-cart-lede]").textContent = ls.length ? `${ls.length} pattern${ls.length === 1 ? "" : "s"}, ready to download the moment you pay.` : "PDF patterns, ready to download the moment you pay.";
  }

  $("[data-coupon-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = e.target.code.value.trim().toUpperCase(), msg = $("[data-coupon-msg]");
    if (!code) { coupon = null; draw(); return (msg.textContent = ""); }
    msg.className = "form-msg"; msg.textContent = "Checking…";
    try {
      const r = await call({ action: "coupon", code });
      coupon = { code, percent: r.percent }; msg.className = "form-msg ok"; msg.textContent = `${r.percent}% off applied.`;
    } catch (err) { coupon = null; msg.textContent = err.message; }
    draw();
  });

  // sign-in state, then PayPal
  const sbClient = () => new Promise((res, rej) => {
    if (window.supabase) return res(window.supabase.createClient(C.sb, C.key));
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
    s.onload = () => res(window.supabase.createClient(C.sb, C.key)); s.onerror = rej; document.head.appendChild(s);
  });
  const loadPayPal = () => new Promise((res, rej) => {
    if (window.paypal) return res();
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(C.pp)}&currency=USD&intent=capture&components=buttons`;
    s.onload = res; s.onerror = () => rej(new Error("PayPal didn't load. Check your connection and refresh the page.")); document.head.appendChild(s);
  });

  function done(downloads) {
    cart = []; write(cart);
    $("[data-cart-main]").hidden = true; $("[data-cart-done]").hidden = false;
    $("[data-cart-title]").innerHTML = 'Thank <em class="acc">you!</em>';
    $("[data-cart-lede]").textContent = "Your payment went through.";
    $("[data-done-list]").innerHTML = downloads.map((d) => `<li><span><b>${esc(d.name)}</b></span>${d.url
      ? `<a class="btn btn-small" href="${esc(d.url)}" target="_blank" rel="noopener">Download</a>`
      : `<span class="dl-wait">We're preparing this file. It will appear in My purchases shortly.</span>`}</li>`).join("");
    scrollTo(0, 0);
  }

  async function showPay(db) {
    const { data } = await db.auth.getSession();
    token = data.session ? data.session.access_token : null;
    $("[data-pay-signin]").hidden = !!token; $("[data-pay]").hidden = !token;
    if (!token || buttonsShown || !lines().length) return;
    const msg = $("[data-pay-msg]");
    try { await loadPayPal(); } catch (err) { return (msg.textContent = err.message); }
    buttonsShown = true;
    window.paypal.Buttons({
      style: { layout: "vertical", shape: "pill", label: "pay" },
      createOrder: async () => {
        msg.textContent = "";
        const { data: s } = await db.auth.getSession(); token = s.session && s.session.access_token;
        const r = await call({ action: "create", items: lines().map((l) => String(l.p.id)), coupon: coupon && coupon.code });
        return r.paypal_id;
      },
      onApprove: async (d) => {
        msg.className = "form-msg ok"; msg.textContent = "Payment received, getting your files…";
        try { const r = await call({ action: "capture", paypal_id: d.orderID }); done(r.downloads || []); }
        catch (err) { msg.className = "form-msg"; msg.textContent = err.message; }
      },
      onCancel: () => { msg.className = "form-msg"; msg.textContent = "Payment cancelled. Your cart is still here."; },
      onError: (err) => { msg.className = "form-msg"; msg.textContent = (err && err.message) || "PayPal couldn't finish the payment. Please try again."; },
    }).render("#paypal-buttons");
  }

  (async () => {
    catalog = await fetch(home + "static/catalog.json").then((r) => r.json()).catch(() => []);
    // keep only patterns that can still be bought here
    const before = cart.length; cart = cart.filter((x) => catalog.some((c) => String(c.id) === String(x.id) && c.b)); if (cart.length !== before) write(cart);
    draw();
    try { const db = await sbClient(); await showPay(db); db.auth.onAuthStateChange(() => showPay(db)); }
    catch { $("[data-pay-msg]").textContent = "Couldn't connect. Please refresh the page."; }
  })();
})();
