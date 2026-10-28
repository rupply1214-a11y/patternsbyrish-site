// Shop side of the admin panel: sales overview, orders, customers, download links, coupons,
// selling settings, website-only patterns, studio & login media, FAQs.
(() => {
  document.addEventListener("adm:ready", init, { once: true });

  function init() {
    const A = window.ADM;
    const { db, $, $$, esc, toast, S } = A;
    const money = (v) => "$" + Number(v || 0).toFixed(2);
    const when = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "");
    const asset = (p) => (!p ? "" : /^https?:/.test(p) ? p : "../" + p);
    const LIMIT = 500 * 1024 * 1024;
    let orders = [], files = {}, coupons = [], own = [], csvDone = false;

    async function fn(body) {
      const { data: { session } } = await db.auth.getSession();
      const r = await fetch(S.url + "/functions/v1/checkout", {
        method: "POST", body: JSON.stringify(body),
        headers: { "Content-Type": "application/json", apikey: S.key, Authorization: "Bearer " + (session ? session.access_token : "") },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || (r.status === 404 ? "The checkout function isn't set up in Supabase yet." : "Error " + r.status));
      return j;
    }
    const csv = (rows, name) => {
      const out = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + out], { type: "text/csv" }));
      a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    // every pattern that can be sold: Etsy patterns from the last build, plus website-only ones from the database
    const allPatterns = () => {
      const list = A.listings.filter((p) => !p.o).map((p) => ({ id: String(p.id), n: p.n, d: p.d, i: p.i, h: p.h }));
      own.forEach((o) => list.push({ id: o.id, n: o.title, d: o.subtitle, i: (o.images[0] || {}).full || "", h: !o.published, own: true }));
      return list;
    };

    /* ================= overview ================= */
    async function overview() {
      const paid = orders.filter((o) => o.status === "paid");
      const day = new Date(); day.setHours(0, 0, 0, 0);
      const d30 = Date.now() - 30 * 864e5;
      const sum = (a) => a.reduce((t, o) => t + Number(o.amount), 0);
      const today = paid.filter((o) => new Date(o.paid_at || o.created_at) >= day), last30 = paid.filter((o) => new Date(o.paid_at || o.created_at) >= d30);
      $("#sales-stats").innerHTML = [
        [money(sum(today)), `today (${today.length} order${today.length === 1 ? "" : "s"})`],
        [money(sum(last30)), `last 30 days (${last30.length})`],
        [money(sum(paid)), `all time (${paid.length})`],
        [new Set(paid.map((o) => o.email.toLowerCase())).size, "customers"],
      ].map(([v, t]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join("");

      const missing = allPatterns().filter((p) => !p.h && !files[p.id]).length;
      $("#files-badge").textContent = missing; $("#files-badge").hidden = !missing;
      const fa = $("#files-alert");
      fa.hidden = !missing;
      fa.innerHTML = `<b>${missing} pattern${missing === 1 ? " has" : "s have"} no download link yet.</b> Buyers of ${missing === 1 ? "it" : "these"} will see "files being prepared" until you add one. <button type="button" class="link-btn" data-go="files">Add download links</button>`;

      const { data: bytes } = await db.rpc("db_usage");
      if (bytes) {
        const pct = Math.min(100, (bytes / LIMIT) * 100);
        $("#storage-bar").style.width = Math.max(1, pct) + "%";
        $("#storage-bar").className = pct >= 80 ? "warn" : "";
        $("#storage-text").textContent = `${(bytes / 1048576).toFixed(1)} MB of 500 MB used (${pct.toFixed(1)}%).`;
        const sa = $("#storage-alert");
        sa.hidden = pct < 80;
        sa.innerHTML = `<b>Storage is ${pct.toFixed(0)}% full.</b> Download a backup of your orders, then remove old orders to free up space. <button type="button" class="link-btn" data-go="orders">Go to Orders</button>`;
      } else $("#storage-text").textContent = "Couldn't read the storage size.";

      try {
        const st = await fn({ action: "status" });
        $("#pay-alert").hidden = st.paypal;
        $("#pay-alert").innerHTML = "<b>PayPal isn't connected yet.</b> Buyers can't pay on the website until the PayPal secret key is added in Supabase.";
        $("#sh-paypal").textContent = st.paypal ? `Connected (${st.mode === "live" ? "live: real payments" : "sandbox: test payments only"}).` : "Not connected yet: the PayPal secret key still needs adding in Supabase.";
        $("#publish-now").dataset.ok = st.publish ? "1" : "";
      } catch (e) {
        $("#pay-alert").hidden = false;
        $("#pay-alert").innerHTML = "<b>Checkout isn't set up yet.</b> " + esc(e.message);
        $("#sh-paypal").textContent = "Checkout isn't set up yet.";
      }
    }
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-go]");
      if (g) { const t = $(`.tabs [data-tab="${g.dataset.go}"]`); if (t) t.click(); }
    });
    $("#publish-now").addEventListener("click", async () => {
      const m = $("#publish-msg"); m.className = "form-msg"; m.textContent = "Starting the update…";
      try { await fn({ action: "publish" }); m.className = "form-msg ok"; m.textContent = "Update started. The website shows your changes in about 3 minutes."; }
      catch (err) { m.textContent = err.message + " Use the GitHub update page instead: click Run workflow there."; }
    });

    /* ================= orders ================= */
    let ordFilter = "paid";
    const badge = (s) => `<span class="badge st-${s}">${{ paid: "Paid", refunded: "Refunded", failed: "Failed", created: "Not paid" }[s] || s}</span>`;
    function drawOrders() {
      const counts = { paid: 0, refunded: 0, open: 0 };
      orders.forEach((o) => { if (o.status === "paid") counts.paid++; else if (o.status === "refunded") counts.refunded++; else counts.open++; });
      $("#ord-filter").innerHTML = [["paid", `Paid (${counts.paid})`], ["refunded", `Refunded (${counts.refunded})`], ["open", `Not finished (${counts.open})`], ["all", "All"]]
        .map(([v, t]) => `<button type="button" class="chip" aria-pressed="${ordFilter === v}" data-of="${v}">${t}</button>`).join("");
      $$("[data-of]").forEach((b) => b.addEventListener("click", () => { ordFilter = b.dataset.of; drawOrders(); }));
      const words = $("#ord-q").value.toLowerCase().split(/\s+/).filter(Boolean);
      const list = orders.filter((o) => (ordFilter === "all" || (ordFilter === "open" ? !["paid", "refunded"].includes(o.status) : o.status === ordFilter))
        && words.every((w) => (o.email + " " + o.paypal_order_id + " " + (o.items || []).map((i) => i.name).join(" ")).toLowerCase().includes(w))).slice(0, 300);
      $("#ord-list").innerHTML = list.map((o) => `<li>
        <div class="ord-top"><b>${money(o.amount)}</b>${badge(o.status)}<span class="muted small">${esc(when(o.paid_at || o.created_at))}</span></div>
        <div><a href="mailto:${esc(o.email)}">${esc(o.email)}</a></div>
        <ul class="ord-items">${(o.items || []).map((i) => `<li>${esc(i.name)} <span class="muted">${money(i.price)}</span></li>`).join("")}</ul>
        ${o.coupon ? `<p class="small muted">Coupon ${esc(o.coupon)}: -${money(o.discount)}</p>` : ""}
        <p class="small muted">PayPal order ${esc(o.paypal_order_id || "")}${o.note ? " · " + esc(o.note) : ""}</p>
        ${o.status === "paid" ? `<div class="btn-row"><button type="button" class="btn btn-ghost btn-small danger" data-refund="${o.id}">Refund in PayPal</button>
          <button type="button" class="btn btn-ghost btn-small" data-mark="${o.id}">Mark as refunded</button></div>` : ""}
      </li>`).join("") || '<li class="muted">No orders here yet.</li>';
      $$("[data-refund]").forEach((b) => b.addEventListener("click", async () => {
        if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to refund the money"; return; }
        b.disabled = true; b.textContent = "Refunding…";
        try { await fn({ action: "refund", order_id: b.dataset.refund }); toast("Refunded in PayPal."); await refreshOrders(); }
        catch (err) { toast(err.message); b.disabled = false; b.textContent = "Refund in PayPal"; }
      }));
      $$("[data-mark]").forEach((b) => b.addEventListener("click", async () => {
        const { error } = await db.from("orders").update({ status: "refunded", note: "Marked refunded in admin" }).eq("id", b.dataset.mark);
        if (error) return toast(error.message); toast("Marked as refunded."); refreshOrders();
      }));
    }
    async function refreshOrders() {
      const { data, error } = await db.from("orders").select("*").order("created_at", { ascending: false }).limit(10000);
      if (error) { toast("Couldn't load orders: " + error.message); return; }
      orders = data || []; drawOrders(); drawCustomers(); overview();
    }
    $("#ord-q").addEventListener("input", drawOrders);
    $("#orders-refresh").addEventListener("click", refreshOrders);
    $("#orders-csv").addEventListener("click", () => {
      csv([["Date", "Email", "Patterns", "Amount USD", "Discount", "Coupon", "Status", "PayPal order", "PayPal capture", "Note"],
        ...orders.map((o) => [o.paid_at || o.created_at, o.email, (o.items || []).map((i) => `${i.name} (${i.id})`).join("; "), o.amount, o.discount, o.coupon, o.status, o.paypal_order_id, o.paypal_capture_id, o.note])],
        `patternsbyrish-orders-${new Date().toISOString().slice(0, 10)}.csv`);
      csvDone = true; toast("Backup downloaded. Keep it safe, for example in your Google Drive.");
    });
    $("#ord-clean").addEventListener("click", async () => {
      const m = $("#ord-clean-msg"), btn = $("#ord-clean");
      if (!csvDone) { m.className = "form-msg"; return (m.textContent = "Download the backup first (button at the top), then remove old orders."); }
      const days = +$("#ord-age").value, cut = new Date(Date.now() - days * 864e5).toISOString();
      const n = orders.filter((o) => o.created_at < cut).length;
      if (!n) { m.className = "form-msg ok"; return (m.textContent = "No orders are that old. Nothing to remove."); }
      if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = `Click again to remove ${n} orders`; setTimeout(() => { btn.dataset.sure = ""; btn.textContent = "Remove old orders"; }, 5000); return; }
      const { error } = await db.from("orders").delete().lt("created_at", cut);
      btn.dataset.sure = ""; btn.textContent = "Remove old orders";
      if (error) { m.className = "form-msg"; return (m.textContent = error.message); }
      m.className = "form-msg ok"; m.textContent = `${n} old orders removed.`; refreshOrders();
    });

    /* ================= customers ================= */
    let custRows = [];
    function drawCustomers() {
      const by = {};
      orders.filter((o) => o.status === "paid").forEach((o) => {
        const k = o.email.toLowerCase(), c = by[k] = by[k] || { email: o.email, n: 0, total: 0, first: o.paid_at, last: o.paid_at, items: [] };
        c.n++; c.total += Number(o.amount); c.items.push(...(o.items || []).map((i) => i.name));
        if (o.paid_at < c.first) c.first = o.paid_at; if (o.paid_at > c.last) c.last = o.paid_at;
      });
      custRows = Object.values(by).sort((a, b) => b.total - a.total);
      $("#cust-list").innerHTML = custRows.map((c) => `<li><div class="ord-top"><b>${money(c.total)}</b><span>${c.n} order${c.n === 1 ? "" : "s"}</span><span class="muted small">last ${esc(when(c.last))}</span></div>
        <div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div><p class="small muted">${esc([...new Set(c.items)].join(", "))}</p></li>`).join("") || '<li class="muted">No customers yet.</li>';
    }
    $("#cust-csv").addEventListener("click", () => csv([["Email", "Orders", "Spent USD", "First order", "Last order", "Patterns"],
      ...custRows.map((c) => [c.email, c.n, c.total.toFixed(2), c.first, c.last, [...new Set(c.items)].join("; ")])], "patternsbyrish-customers.csv"));

    /* ================= download links ================= */
    let fileFilter = "missing";
    const driveOk = (v) => /^https:\/\/(drive|docs)\.google\.com\//.test(v) || /^https:\/\//.test(v);
    async function saveFile(id, url) {
      url = url.trim();
      if (url && !driveOk(url)) { toast("Paste a full link that starts with https://"); return false; }
      const q = url ? db.from("pattern_files").upsert({ listing_id: id, drive_url: url, updated_at: new Date().toISOString() }) : db.from("pattern_files").delete().eq("listing_id", id);
      const { error } = await q;
      if (error) { toast("Not saved: " + error.message); return false; }
      if (url) files[id] = url; else delete files[id];
      return true;
    }
    function drawFiles() {
      const all = allPatterns().filter((p) => !p.h);
      const miss = all.filter((p) => !files[p.id]).length;
      $("#file-filter").innerHTML = [["missing", `No link yet (${miss})`], ["done", `Added (${all.length - miss})`], ["all", `All (${all.length})`]]
        .map(([v, t]) => `<button type="button" class="chip" aria-pressed="${fileFilter === v}" data-ff="${v}">${t}</button>`).join("");
      $$("[data-ff]").forEach((b) => b.addEventListener("click", () => { fileFilter = b.dataset.ff; drawFiles(); }));
      const words = $("#file-q").value.toLowerCase().split(/\s+/).filter(Boolean);
      const list = all.filter((p) => (fileFilter === "all" || (fileFilter === "done" ? files[p.id] : !files[p.id])) && words.every((w) => (p.n + " " + (p.d || "")).toLowerCase().includes(w)));
      $("#file-list").innerHTML = list.slice(0, 300).map((p) => `<li><img src="${esc(p.i)}" alt="" loading="lazy"><span><b>${esc(p.n)}</b><small>${esc(p.d || "")}${p.own ? " · website only" : ""}</small></span>
        <span class="file-in"><input type="url" value="${esc(files[p.id] || "")}" placeholder="Paste the Google Drive link" data-file="${esc(p.id)}" aria-label="Download link for ${esc(p.n)}">
        ${files[p.id] ? `<a class="btn btn-ghost btn-small" href="${esc(files[p.id])}" target="_blank" rel="noopener">Test</a>` : ""}<span class="saved-tick" hidden>Saved</span></span></li>`).join("") || '<li class="muted">Nothing here.</li>';
      $$("[data-file]").forEach((inp) => inp.addEventListener("change", async () => {
        if (await saveFile(inp.dataset.file, inp.value)) { const t = inp.parentElement.querySelector(".saved-tick"); t.hidden = false; setTimeout(() => (t.hidden = true), 2000); overview(); }
      }));
    }
    $("#file-q").addEventListener("input", drawFiles);

    /* ================= coupons ================= */
    async function loadCoupons() {
      const { data } = await db.from("coupons").select("*").order("created_at", { ascending: false });
      coupons = data || [];
      $("#cp-list").innerHTML = coupons.map((c) => `<li><div class="ord-top"><b>${esc(c.code)}</b><span>${c.percent}% off</span>${c.active ? '<span class="badge st-paid">On</span>' : '<span class="badge">Off</span>'}</div>
        <p class="small muted">Used ${c.used}${c.max_uses ? " of " + c.max_uses : ""} times${c.expires_at ? " · ends " + esc(new Date(c.expires_at).toLocaleDateString()) : ""}${c.note ? " · " + esc(c.note) : ""}</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost btn-small" data-cp-toggle="${esc(c.code)}">${c.active ? "Switch off" : "Switch on"}</button>
        <button type="button" class="btn btn-ghost btn-small danger" data-cp-del="${esc(c.code)}">Delete</button></div></li>`).join("") || '<li class="muted">No codes yet.</li>';
      $$("[data-cp-toggle]").forEach((b) => b.addEventListener("click", async () => {
        const c = coupons.find((x) => x.code === b.dataset.cpToggle);
        const { error } = await db.from("coupons").update({ active: !c.active }).eq("code", c.code); if (error) return toast(error.message); loadCoupons();
      }));
      $$("[data-cp-del]").forEach((b) => b.addEventListener("click", async () => {
        if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to delete"; return; }
        const { error } = await db.from("coupons").delete().eq("code", b.dataset.cpDel); if (error) return toast(error.message); loadCoupons();
      }));
    }
    $("#cp-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = $("#cp-msg"), code = $("#cp-code").value.trim().toUpperCase();
      const row = { code, percent: +$("#cp-pct").value, active: true, note: $("#cp-note").value.trim(),
        expires_at: $("#cp-end").value ? new Date($("#cp-end").value + "T23:59:59").toISOString() : null, max_uses: $("#cp-max").value ? +$("#cp-max").value : null };
      const { error } = await db.from("coupons").insert(row);
      if (error) { m.className = "form-msg"; return (m.textContent = /duplicate/.test(error.message) ? "That code already exists." : error.message); }
      m.className = "form-msg ok"; m.textContent = `${code} created. Buyers type it in the cart.`; e.target.reset(); $("#cp-pct").value = 10; loadCoupons();
    });

    /* ================= selling settings (saved with Save changes) ================= */
    function shopPane() {
      const c = A.content; const sh = c.shop = Object.assign({}, (S.defaults || {}).shop || {}, c.shop || {});
      $("#sh-sell").checked = !!sh.sell_on_site; $("#sh-etsy").checked = sh.show_etsy !== false;
      $("#sh-pct").value = sh.discount_pct ?? 10; $("#sh-delivery").value = sh.delivery_note || "";
      const ex = () => { const p = Math.max(0, Math.min(90, +$("#sh-pct").value || 0)); $("#sh-example").textContent = `Example: a $5.00 pattern on Etsy costs $${(5 * (100 - p) / 100).toFixed(2)} here.`; };
      ex();
      $("#sh-sell").onchange = () => { sh.sell_on_site = $("#sh-sell").checked; A.dirty(); };
      $("#sh-test").checked = !!sh.test_mode;
      $("#sh-test").onchange = () => { sh.test_mode = $("#sh-test").checked; A.dirty(); };
      $("#sh-etsy").onchange = () => { sh.show_etsy = $("#sh-etsy").checked; A.dirty(); };
      $("#sh-pct").oninput = () => { sh.discount_pct = Math.max(0, Math.min(90, +$("#sh-pct").value || 0)); ex(); A.dirty(); };
      $("#sh-delivery").oninput = () => { sh.delivery_note = $("#sh-delivery").value; A.dirty(); };
    }

    /* ================= website-only patterns ================= */
    const CATS = S.cats || [];
    const FORMATS = ["A4", "US Letter", "A0 copy shop", "Projector"];
    let ed = null;
    async function loadOwn() {
      const { data, error } = await db.from("products").select("*").order("created_at", { ascending: false });
      if (error) return toast("Couldn't load website-only patterns: " + error.message);
      own = data || [];
      $("#own-list").innerHTML = own.map((o) => `<li class="${o.published ? "" : "is-hidden"}"><img src="${esc((o.images[0] || {}).full || "")}" alt="" loading="lazy">
        <span><b>${esc(o.title)}</b><small>${esc(o.subtitle || "")} · ${money(o.price)} · ${o.published ? "on the website" : "draft"}${files[o.id] ? "" : " · no download link"}</small></span>
        <span class="pat-acts"><button type="button" class="chip" data-own="${esc(o.id)}">Edit</button></span></li>`).join("") || '<li class="muted">None yet. Click "Add a pattern".</li>';
      $$("[data-own]").forEach((b) => b.addEventListener("click", () => openOwn(own.find((o) => o.id === b.dataset.own))));
    }
    const stamp = () => { const d = new Date(), z = (n) => String(n).padStart(2, "0"); return "w" + String(d.getFullYear()).slice(2) + z(d.getMonth() + 1) + z(d.getDate()) + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds()); };
    function openOwn(o) {
      ed = o ? structuredClone(o) : { id: "", title: "", subtitle: "", description: "", price: 5, compare_at: null, cats: ["dresses"], sizes: "XS to 5XL", formats: ["A4", "US Letter", "A0 copy shop"], tags: [], images: [], sketch: "", published: false };
      $("#own-list-view").hidden = true; $("#own-edit").hidden = false; $("#own-msg").textContent = ""; $("#own-del").hidden = !o;
      $("#o-title").value = ed.title; $("#o-sub").value = ed.subtitle || ""; $("#o-price").value = ed.price; $("#o-was").value = ed.compare_at || "";
      $("#o-sizes").value = ed.sizes || ""; $("#o-tags").value = (ed.tags || []).join(", "); $("#o-desc").value = ed.description || "";
      $("#o-drive").value = ed.id ? files[ed.id] || "" : ""; $("#o-pub").checked = !!ed.published;
      ownChips(); ownImgs(); scrollTo(0, 0);
    }
    function ownChips() {
      $("#o-cats").innerHTML = CATS.map((c) => `<button type="button" class="chip" aria-pressed="${ed.cats.includes(c.slug)}" data-oc="${c.slug}">${esc(c.name)}</button>`).join("");
      $$("[data-oc]").forEach((b) => b.addEventListener("click", () => { const i = ed.cats.indexOf(b.dataset.oc); i >= 0 ? ed.cats.splice(i, 1) : ed.cats.push(b.dataset.oc); if (!ed.cats.length) ed.cats.push(b.dataset.oc); ownChips(); }));
      $("#o-formats").innerHTML = FORMATS.map((f) => `<button type="button" class="chip" aria-pressed="${(ed.formats || []).includes(f)}" data-of2="${f}">${f}</button>`).join("");
      $$("[data-of2]").forEach((b) => b.addEventListener("click", () => { ed.formats = ed.formats || []; const i = ed.formats.indexOf(b.dataset.of2); i >= 0 ? ed.formats.splice(i, 1) : ed.formats.push(b.dataset.of2); ownChips(); }));
    }
    function ownImgs() {
      const box = $("#o-imgs");
      box.innerHTML = ed.images.map((im, k) => `<span class="thumb-edit"><img src="${esc(im.full)}" alt=""><span class="btn-row">
        ${k ? `<button type="button" data-img-first="${k}" title="Make main photo">★</button>` : '<em>main</em>'}<button type="button" data-img-rm="${k}" aria-label="Remove photo">×</button></span></span>`).join("")
        + `<label class="btn btn-ghost btn-small">Add photos<input type="file" accept="image/*" multiple hidden id="o-img-up"></label>`;
      $$("[data-img-rm]", box).forEach((b) => b.addEventListener("click", () => { ed.images.splice(+b.dataset.imgRm, 1); ownImgs(); }));
      $$("[data-img-first]", box).forEach((b) => b.addEventListener("click", () => { const [x] = ed.images.splice(+b.dataset.imgFirst, 1); ed.images.unshift(x); ownImgs(); }));
      $("#o-img-up").addEventListener("change", async (e) => { for (const f of e.target.files) { const url = await A.upload(f, "products"); if (url) ed.images.push({ full: url, medium: url }); } ownImgs(); });
      const sk = $("#o-sketch");
      sk.innerHTML = (ed.sketch ? `<span class="thumb-edit"><img src="${esc(ed.sketch)}" alt=""><span class="btn-row"><button type="button" id="o-sk-rm" aria-label="Remove sketch">×</button></span></span>` : "")
        + `<label class="btn btn-ghost btn-small">${ed.sketch ? "Change sketch" : "Upload sketch"}<input type="file" accept="image/*" hidden id="o-sk-up"></label>`;
      $("#o-sk-up").addEventListener("change", async (e) => { const url = await A.upload(e.target.files[0], "sketches"); if (url) { ed.sketch = url; ownImgs(); } });
      const rm = $("#o-sk-rm"); if (rm) rm.addEventListener("click", () => { ed.sketch = ""; ownImgs(); });
    }
    $("#own-new").addEventListener("click", () => openOwn(null));
    $("#own-back").addEventListener("click", () => { $("#own-edit").hidden = true; $("#own-list-view").hidden = false; loadOwn(); });
    $("#own-edit").addEventListener("submit", async (e) => {
      e.preventDefault();
      const m = $("#own-msg");
      const row = { ...ed, id: ed.id || stamp(), title: $("#o-title").value.trim(), subtitle: $("#o-sub").value.trim(), price: +$("#o-price").value,
        compare_at: $("#o-was").value ? +$("#o-was").value : null, sizes: $("#o-sizes").value.trim(), tags: $("#o-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
        description: $("#o-desc").value, published: $("#o-pub").checked, updated_at: new Date().toISOString() };
      delete row.created_at;
      if (row.published && !row.images.length) { m.className = "form-msg"; return (m.textContent = "Add at least one photo before showing it on the website."); }
      m.className = "form-msg"; m.textContent = "Saving…";
      const { error } = await db.from("products").upsert(row);
      if (error) return (m.textContent = "Not saved: " + error.message);
      ed.id = row.id; $("#own-del").hidden = false;
      const drive = $("#o-drive").value.trim();
      if (drive !== (files[row.id] || "")) await saveFile(row.id, drive);
      m.className = "form-msg ok"; m.textContent = row.published ? "Saved. It appears on the website after the next update (within an hour, or use Update the website now on Overview)." : "Saved as a draft.";
      loadOwn();
    });
    $("#own-del").addEventListener("click", async () => {
      const b = $("#own-del");
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Click again to delete"; setTimeout(() => { b.dataset.sure = ""; b.textContent = "Delete"; }, 4000); return; }
      const { error } = await db.from("products").delete().eq("id", ed.id);
      if (error) return toast(error.message);
      toast("Deleted."); $("#own-back").click();
    });

    /* ================= studio & login (saved with Save changes) ================= */
    async function uploadMedia(file, folder, maxMb) {
      if (!file) return null;
      if (file.size > maxMb * 1048576) { toast(`That file is over ${maxMb} MB. Please use a smaller one.`); return null; }
      toast("Uploading… keep this page open.");
      const name = `${folder}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
      const { error } = await db.storage.from("site-images").upload(name, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
      if (error) { toast("Upload failed: " + error.message); return null; }
      toast("Uploaded.");
      return db.storage.from("site-images").getPublicUrl(name).data.publicUrl;
    }
    function mediaSlot(obj, key, label, kind, def) {
      const el = document.createElement("div"); el.className = "media-slot";
      const v = obj[key];
      el.innerHTML = `<span class="media-label">${esc(label)}</span>
        <div class="media-prev">${v ? (kind === "video" ? `<video src="${esc(asset(v))}" muted loop playsinline autoplay></video>` : `<img src="${esc(asset(v))}" alt="">`) : '<span class="muted small">None</span>'}</div>
        <div class="btn-row"><label class="btn btn-ghost btn-small">Upload ${kind === "video" ? "video" : "photo"}<input type="file" hidden accept="${kind === "video" ? "video/mp4,video/webm" : "image/*"}"></label>
        ${v && def !== undefined && v !== def ? '<button type="button" class="btn btn-ghost btn-small" data-reset>Use the original</button>' : ""}
        ${v && def === "" ? '<button type="button" class="btn btn-ghost btn-small" data-reset>Remove</button>' : ""}</div>`;
      $("input", el).addEventListener("change", async (e) => { const url = await uploadMedia(e.target.files[0], kind === "video" ? "videos" : "studio", kind === "video" ? 50 : 8); if (url) { obj[key] = url; A.dirty(); studioPane(); } });
      const r = $("[data-reset]", el); if (r) r.addEventListener("click", () => { obj[key] = def || ""; A.dirty(); studioPane(); });
      return el;
    }
    function textField(obj, key, label, rows) {
      const l = document.createElement("label"); l.className = "field";
      l.innerHTML = `<span>${esc(label)}</span>` + (rows ? `<textarea rows="${rows}"></textarea>` : "<input>");
      const i = $(rows ? "textarea" : "input", l); i.value = obj[key] || ""; i.addEventListener("input", () => { obj[key] = i.value; A.dirty(); });
      return l;
    }
    function studioPane() {
      const c = A.content, D = S.defaults || {};
      const md = c.media = Object.assign({}, D.media || {}, c.media || {});
      const st = c.studio = Object.assign({}, D.studio || {}, c.studio || {});
      const ml = $("#media-login"); ml.innerHTML = "";
      ml.append(mediaSlot(md, "login_wide", "Computer video (wide)", "video", (D.media || {}).login_wide), mediaSlot(md, "login_wide_poster", "Computer still photo", "img", (D.media || {}).login_wide_poster),
        mediaSlot(md, "login_square", "Phone video (square)", "video", (D.media || {}).login_square), mediaSlot(md, "login_square_poster", "Phone still photo", "img", (D.media || {}).login_square_poster));
      const mf = $("#media-film"); mf.innerHTML = "";
      mf.append(mediaSlot(st, "film_video", "Your own film video (optional)", "video", ""), mediaSlot(st, "film_poster", "Still photo for the video", "img", ""));
      const SC = ["Sketch", "Grade", "Download", "Measure", "Print", "Cut", "Sew", "Press", "Wear"];
      st.film_scenes = st.film_scenes || [];
      const fs = $("#film-scenes"); fs.innerHTML = '<h3 class="sub-h">Film scene words (leave empty to keep the original)</h3>';
      SC.forEach((name, i) => {
        const o = st.film_scenes[i] = st.film_scenes[i] || {};
        const row = document.createElement("div"); row.className = "two";
        row.append(textField(o, "title", `Scene ${i + 1} (${name}): heading`), textField(o, "text", "Text"));
        fs.append(row);
      });
      const sf = $("#studio-fields"); sf.innerHTML = "";
      sf.append(textField(st, "hero_label", "Small label"), textField(st, "hero_title", "Heading (put *stars* around the red words)"), textField(st, "hero_text", "Text", 3));
      const hero = document.createElement("div"); hero.className = "media-grid";
      hero.append(mediaSlot(st, "hero_img", "Big photo", "img", (D.studio || {}).hero_img), mediaSlot(st, "hero_small_img", "Small photo", "img", (D.studio || {}).hero_small_img));
      sf.append(hero, textField(st, "bento_title", "Photo grid heading"), textField(st, "bento_note", "Photo grid note"));
      st.bento = (st.bento || []).slice(0, 4);
      const bg = document.createElement("div"); bg.className = "media-grid";
      st.bento.forEach((b, i) => {
        const card = document.createElement("div"); card.className = "media-card";
        card.append(mediaSlot(b, "img", `Photo ${i + 1}`, "img", ((D.studio || {}).bento || [])[i]?.img), textField(b, "title", "Title"), textField(b, "text", "Line"));
        bg.append(card);
      });
      sf.append(bg);
      const vals = st.values = (st.values || []).slice(0, 4);
      const vh = document.createElement("h3"); vh.className = "sub-h"; vh.textContent = '"What we care about"'; sf.append(vh);
      vals.forEach((v) => { const row = document.createElement("div"); row.className = "two"; row.append(textField(v, "title", "Title"), textField(v, "text", "Text", 2)); sf.append(row); });
      sf.append(textField(st, "cta_title", "Bottom banner heading"), textField(st, "cta_text", "Bottom banner text"));
    }

    /* ================= FAQs (saved with Save changes) ================= */
    function faqPane() {
      const c = A.content; const list = c.faqs = c.faqs && c.faqs.length ? c.faqs : structuredClone((S.defaults || {}).faqs || []);
      const box = $("#faq-list"); box.innerHTML = "";
      list.forEach((f, k) => {
        const card = document.createElement("div"); card.className = "card-box";
        card.append(textField(f, "q", `Question ${k + 1}`), textField(f, "a", "Answer", 3));
        const row = document.createElement("div"); row.className = "btn-row";
        row.innerHTML = `<button type="button" class="btn btn-ghost btn-small" ${k ? "" : "disabled"} data-up>Move up</button><button type="button" class="btn btn-ghost btn-small danger" data-del>Remove</button>`;
        $("[data-up]", row).addEventListener("click", () => { [list[k - 1], list[k]] = [list[k], list[k - 1]]; A.dirty(); faqPane(); });
        $("[data-del]", row).addEventListener("click", () => { list.splice(k, 1); A.dirty(); faqPane(); });
        card.append(row); box.append(card);
      });
    }
    $("#faq-add").addEventListener("click", () => { A.content.faqs.push({ q: "", a: "" }); A.dirty(); faqPane(); });

    function seasonPane() {
      const se = A.content.seasonal = Object.assign({ enabled: true, banner: true, bar: true }, A.content.seasonal || {});
      [["se-on", "enabled"], ["se-banner", "banner"], ["se-bar", "bar"]].forEach(([id, k]) => { const el = $("#" + id); el.checked = se[k] !== false; el.onchange = () => { se[k] = el.checked; A.dirty(); }; });
    }
    A.hooks.push(shopPane, studioPane, faqPane, seasonPane); seasonPane();
    shopPane(); studioPane(); faqPane(); A.markClean();
    (async () => {
      const { data } = await db.from("pattern_files").select("listing_id, drive_url");
      files = Object.fromEntries((data || []).map((f) => [f.listing_id, f.drive_url]));
      await loadOwn(); drawFiles(); loadCoupons(); await refreshOrders();
    })();
  }
})();
