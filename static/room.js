(() => {
  const box = document.querySelector("[data-room]");
  if (!box || !window.supabase) return;
  const db = window.supabase.createClient(box.dataset.sbUrl, box.dataset.sbKey);
  const home = new URL(box.dataset.home, location.href).href;
  const grid = box.querySelector("[data-room-grid]"), empty = box.querySelector("[data-room-empty]");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let user = null, ids = [];

  const remember = () => { try { localStorage.setItem("pbr_saved", JSON.stringify(ids)); } catch {} };
  async function draw() {
    const cat = await fetch(home + "static/catalog.json").then((r) => r.json()).catch(() => []);
    const items = ids.map((id) => cat.find((p) => String(p.id) === String(id))).filter(Boolean);
    empty.hidden = items.length > 0;
    grid.innerHTML = items.map((p) => `
      <article class="card">
        <a class="card-link" href="${home}pattern/${esc(p.s)}/">
          <div class="card-pic"><img src="${esc(p.i)}" alt="${esc(p.n)} sewing pattern" loading="lazy"></div>
          <h3 class="card-title">${esc(p.n)}</h3>${p.d ? `<p class="card-sub">${esc(p.d)}</p>` : ""}
        </a>
        <p class="card-meta"><span class="price-line"><span class="price">${esc(p.pr)}</span>${p.w ? ` <s class="was">${esc(p.w)}</s>` : ""}</span></p>
        <button type="button" class="heart" aria-pressed="true" aria-label="Remove ${esc(p.n)} from my sewing room" data-unsave="${esc(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-9.2-8.6C1.2 8.3 3 5 6.3 5c2 0 3.3 1.1 4 2.3h3.4c.7-1.2 2-2.3 4-2.3C21 5 22.8 8.3 21.2 11.4 19 15.6 12 20 12 20z"/></svg></button>
      </article>`).join("");
    box.querySelector("[data-hello]").textContent = items.length
      ? `Hello ${user.email.split("@")[0]}! You've saved ${items.length} pattern${items.length === 1 ? "" : "s"}.`
      : `Hello ${user.email.split("@")[0]}! Nothing saved yet.`;
    grid.querySelectorAll("[data-unsave]").forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.unsave;
      b.closest(".card").classList.add("leaving");
      await db.from("wishlist").delete().eq("user_id", user.id).eq("listing_id", id);
      ids = ids.filter((x) => x !== id); remember();
      setTimeout(draw, 300);
    }));
  }

  async function purchases() {
    const sec = document.querySelector("[data-purchases]");
    if (!sec) return;
    const { data: rows, error } = await db.rpc("my_downloads");
    if (error || !rows || !rows.length) return;
    const cat = await fetch(home + "static/catalog.json").then((r) => r.json()).catch(() => []);
    sec.hidden = false;
    sec.querySelector("[data-purchase-list]").innerHTML = rows.map((r) => {
      const p = cat.find((x) => String(x.id) === String(r.listing_id));
      const img = p ? `<img src="${esc(p.i)}" alt="" loading="lazy">` : "";
      const when = r.paid_at ? new Date(r.paid_at).toLocaleDateString() : "";
      const btn = r.drive_url ? `<a class="btn btn-small" href="${esc(r.drive_url)}" target="_blank" rel="noopener">Download</a>`
        : `<span class="dl-wait">Your files are being prepared. We'll add the download here shortly.</span>`;
      return `<li>${img}<span><b>${esc(p ? p.n : r.name || "Pattern")}</b><small>Bought ${esc(when)}</small></span>${btn}</li>`;
    }).join("");
    if (location.hash === "#purchases") sec.scrollIntoView();
  }

  box.querySelector("[data-signout]").addEventListener("click", async () => {
    await db.auth.signOut();
    try { localStorage.removeItem("pbr_user"); localStorage.removeItem("pbr_saved"); localStorage.removeItem("pbr_cart"); } catch {}
    location.replace(home);
  });

  db.auth.getSession().then(async ({ data }) => {
    if (!data.session) return location.replace(home + "login/?next=sewing-room/");
    user = data.session.user;
    const { data: rows } = await db.from("wishlist").select("listing_id").order("created_at", { ascending: false });
    ids = (rows || []).map((r) => String(r.listing_id)); remember();
    draw(); purchases();
  });
})();
