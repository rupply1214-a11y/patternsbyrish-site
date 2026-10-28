(() => {
  const S = window.SITE || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COLORS = { blush: "#FBE2E8", butter: "#FCF1C9", mint: "#DCF1E6", sky: "#DDEBFA", lilac: "#ECE3FA" };
  const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 3200); };

  if (!S.url || !S.key || !window.supabase) {
    document.body.innerHTML = '<p style="padding:40px">The admin panel is not connected to Supabase yet. Add supabase_url and supabase_key to site.config.json.</p>';
    return;
  }
  const db = window.supabase.createClient(S.url, S.key);
  let content = null, saved = "", listings = [], posts = [], editing = null;

  /* ---------- sign in ---------- */
  // one sign-in page for everyone: the admin panel sends you there and it sends admins back here
  const showLogin = () => { location.replace("../login/?next=admin/"); };
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-msg").textContent = "Signing in…";
    const { error } = await db.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-pass").value });
    if (error) { $("#login-msg").textContent = error.message === "Invalid login credentials" ? "That email and password don't match. Check them and try again." : error.message; return; }
    start();
  });
  $("#logout").addEventListener("click", async () => { await db.auth.signOut(); try { localStorage.removeItem("pbr_user"); localStorage.removeItem("pbr_saved"); } catch {} location.replace("../"); });

  async function start() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return showLogin();
    const { data: me } = await db.from("admins").select("email");
    if (!me || !me.length) return location.replace("../sewing-room/");  // signed in, but not the shop owner
    $("#who").textContent = session.user.email;
    $("#login").hidden = true; $("#app").hidden = false;
    const [c, l, b] = await Promise.all([
      db.from("site_content").select("data").eq("id", 1).maybeSingle(),
      fetch("../tools/listings.json").then((r) => r.json()).catch(() => []),
      fetch("../tools/build.json").then((r) => r.json()).catch(() => ({})),
    ]);
    content = Object.assign(structuredClone(S.defaults || {}), (c.data && c.data.data) || {});
    saved = JSON.stringify(content);
    listings = l;
    renderAll(); overview(b); loadPosts();
  }

  /* ---------- tabs ---------- */
  $$(".tabs [role=tab]").forEach((t) => t.addEventListener("click", () => {
    $$(".tabs [role=tab]").forEach((x) => x.setAttribute("aria-selected", x === t));
    $$("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
    scrollTo(0, 0);
  }));

  /* ---------- save bar ---------- */
  const dirty = () => { $("#savebar").hidden = JSON.stringify(content) === saved; };
  $("#discard").addEventListener("click", () => { content = JSON.parse(saved); renderAll(); dirty(); });
  $("#save").addEventListener("click", async () => {
    const { error } = await db.from("site_content").upsert({ id: 1, data: content, updated_at: new Date().toISOString() });
    if (error) return toast("Not saved: " + error.message);
    saved = JSON.stringify(content); dirty();
    toast("Saved. The website shows it within an hour, or click Update the website now.");
  });
  addEventListener("beforeunload", (e) => { if (content && JSON.stringify(content) !== saved) { e.preventDefault(); e.returnValue = ""; } });

  const byId = (id) => listings.find((p) => String(p.id) === String(id));
  function renderAll() { slides(); topbar(); home(); patterns(); runwayPane(); reelsPane(); socialPane(); }

  /* ---------- overview ---------- */
  function overview(b) {
    const when = b.built ? new Date(b.built).toLocaleString() : "not yet";
    $("#stats").innerHTML = [
      [b.patterns ?? "-", "patterns on the website"], [b.hidden ?? 0, "hidden from the website"],
      [b.posts ?? "-", "Journal posts"], [when, "last website update"],
    ].map(([v, t]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join("");
    $("#run-link").href = `https://github.com/${S.repo}/actions/workflows/sync-and-deploy.yml`;
  }

  /* ---------- banners ---------- */
  function slides() {
    const box = $("#slides"); box.innerHTML = "";
    (content.hero_slides || []).forEach((s, k) => {
      const picks = (s.product_ids || []).map(byId).filter(Boolean);
      const card = document.createElement("div");
      card.className = "slide-card";
      card.innerHTML = `
        <div class="slide-prev" style="--tint:${COLORS[s.color] || COLORS.lilac}">
          ${s.image ? `<img class="own" src="${esc(s.image)}" alt="">` : `<div class="imgs">${picks.map((p) => `<img src="${esc(p.i)}" alt="">`).join("") || '<span class="muted small">Photos come from the chosen category</span>'}</div>`}
          <em>${esc(s.note)}</em><b>${esc(s.title)}</b>
        </div>
        <div class="slide-fields">
          <div class="two">
            <label class="field"><span>Small handwritten note</span><input data-k="note" value="${esc(s.note)}"></label>
            <label class="field"><span>Button text</span><input data-k="button" value="${esc(s.button)}"></label>
          </div>
          <label class="field"><span>Heading</span><input data-k="title" value="${esc(s.title)}"></label>
          <label class="field"><span>Text</span><textarea data-k="text" rows="2">${esc(s.text)}</textarea></label>
          <div class="field"><span>Button goes to</span><div class="chips" data-link></div></div>
          <div class="field"><span>Background colour</span><div class="chips" data-color></div></div>
          <div class="field"><span>Photos</span><div class="pick-row" data-picks></div></div>
          <div class="slide-tools">
            <div class="btn-row">
              <button type="button" class="btn btn-ghost btn-small" data-act="up" ${k === 0 ? "disabled" : ""}>Move up</button>
              <button type="button" class="btn btn-ghost btn-small" data-act="down" ${k === content.hero_slides.length - 1 ? "disabled" : ""}>Move down</button>
            </div>
            <button type="button" class="btn btn-ghost btn-small danger" data-act="del">Remove banner</button>
          </div>
        </div>`;
      $$("[data-k]", card).forEach((inp) => inp.addEventListener("input", () => { s[inp.dataset.k] = inp.value; $(".slide-prev b", card).textContent = s.title; $(".slide-prev em", card).textContent = s.note; dirty(); }));
      const links = [["patterns/", "All patterns", ""], ...S.cats.map((c) => [`category/${c.slug}/`, c.name, c.slug])];
      $("[data-link]", card).innerHTML = links.map(([l, n]) => `<button type="button" class="chip" aria-pressed="${s.link === l}" data-l="${l}">${esc(n)}</button>`).join("");
      $$("[data-l]", card).forEach((b) => b.addEventListener("click", () => {
        s.link = b.dataset.l; s.category = (links.find((x) => x[0] === s.link) || [])[2] || ""; slides(); dirty();
      }));
      $("[data-color]", card).innerHTML = Object.entries(COLORS).map(([n, c]) => `<button type="button" class="chip color" aria-pressed="${s.color === n}" aria-label="${n}" data-c="${n}" style="background:${c}"></button>`).join("");
      $$("[data-c]", card).forEach((b) => b.addEventListener("click", () => { s.color = b.dataset.c; slides(); dirty(); }));
      const pr = $("[data-picks]", card);
      pr.innerHTML = picks.map((p) => `<span class="pick"><img src="${esc(p.i)}" alt="">${esc(p.n)}<button type="button" data-rm="${p.id}" aria-label="Remove ${esc(p.n)}">×</button></span>`).join("")
        + (picks.length < 3 ? `<button type="button" class="btn btn-ghost btn-small" data-add>Choose patterns</button>` : "")
        + `<label class="btn btn-ghost btn-small">${s.image ? "Change own photo" : "Upload own photo"}<input type="file" accept="image/*" hidden data-up></label>`
        + (s.image ? `<button type="button" class="btn btn-ghost btn-small" data-noimg>Use pattern photos</button>` : "");
      $$("[data-rm]", pr).forEach((b) => b.addEventListener("click", () => { s.product_ids = s.product_ids.filter((x) => String(x) !== b.dataset.rm); slides(); dirty(); }));
      const add = $("[data-add]", pr);
      if (add) add.addEventListener("click", () => picker(s.product_ids || [], 3, (ids) => { s.product_ids = ids; slides(); dirty(); }));
      $("[data-up]", pr).addEventListener("change", async (e) => { const url = await upload(e.target.files[0], "banners"); if (url) { s.image = url; slides(); dirty(); } });
      const noimg = $("[data-noimg]", pr); if (noimg) noimg.addEventListener("click", () => { s.image = ""; slides(); dirty(); });
      $$("[data-act]", card).forEach((b) => b.addEventListener("click", () => {
        const a = content.hero_slides;
        if (b.dataset.act === "del") { if (a.length < 2) return toast("Keep at least one banner."); a.splice(k, 1); }
        if (b.dataset.act === "up") [a[k - 1], a[k]] = [a[k], a[k - 1]];
        if (b.dataset.act === "down") [a[k + 1], a[k]] = [a[k], a[k + 1]];
        slides(); dirty();
      }));
      box.appendChild(card);
    });
  }
  $("#add-slide").addEventListener("click", () => {
    content.hero_slides = content.hero_slides || [];
    content.hero_slides.push({ title: "New banner heading", text: "One or two sentences about what this banner shows.", button: "Shop now", link: "patterns/", category: "", product_ids: [], color: "lilac", note: "new" });
    slides(); dirty();
  });

  /* ---------- top bar & sale ---------- */
  function topbar() {
    const box = $("#announcements"); box.innerHTML = "";
    (content.announcements || []).forEach((a, k) => {
      const row = document.createElement("div"); row.className = "ann-row";
      row.innerHTML = `<input value="${esc(a)}" aria-label="Message ${k + 1}" maxlength="70"><button type="button" class="icon-x" aria-label="Remove message">×</button>`;
      $("input", row).addEventListener("input", (e) => { content.announcements[k] = e.target.value; dirty(); });
      $("button", row).addEventListener("click", () => { content.announcements.splice(k, 1); topbar(); dirty(); });
      box.appendChild(row);
    });
  }
  $("#add-ann").addEventListener("click", () => { (content.announcements = content.announcements || []).push(""); topbar(); $("#announcements input:last-of-type") && $$("#announcements input").pop().focus(); dirty(); });

  /* ---------- homepage ---------- */
  function home() {
    const rows = content.home_rows || [];
    $("#rows").innerHTML = S.cats.map((c) => { const n = rows.indexOf(c.slug); return `<button type="button" class="chip" aria-pressed="${n >= 0}" data-r="${c.slug}">${n >= 0 ? `<span class="n">${n + 1}</span>` : ""}${esc(c.name)}</button>`; }).join("");
    $$("[data-r]").forEach((b) => b.addEventListener("click", () => {
      const r = content.home_rows = content.home_rows || [], i = r.indexOf(b.dataset.r);
      i >= 0 ? r.splice(i, 1) : r.push(b.dataset.r); home(); dirty();
    }));
    const promo = content.promo = content.promo || {};
    [["promo-title", "title"], ["promo-text", "text"], ["promo-button", "button"]].forEach(([id, k]) => {
      const el = $("#" + id); el.value = promo[k] || ""; el.oninput = () => { promo[k] = el.value; dirty(); };
    });
    const ct = content.category_text = content.category_text || {};
    $("#cat-texts").innerHTML = S.cats.map((c) => `<label class="field"><span>${esc(c.name)}</span><textarea rows="2" data-ct="${c.slug}" placeholder="Standard text">${esc(ct[c.slug] || "")}</textarea></label>`).join("");
    $$("[data-ct]").forEach((t) => t.addEventListener("input", () => { ct[t.dataset.ct] = t.value.trim(); dirty(); }));
  }

  /* ---------- patterns: feature / hide ---------- */
  let patFilter = "all";
  function patterns() {
    const f = content.featured_ids = (content.featured_ids || []).map(String), h = content.hidden_ids = (content.hidden_ids || []).map(String);
    $("#pat-filter").innerHTML = [["all", "All"], ["featured", `Featured (${f.length})`], ["hidden", `Hidden (${h.length})`]]
      .map(([v, t]) => `<button type="button" class="chip" aria-pressed="${patFilter === v}" data-pf="${v}">${t}</button>`).join("");
    $$("[data-pf]").forEach((b) => b.addEventListener("click", () => { patFilter = b.dataset.pf; patterns(); }));
    const words = $("#pat-q").value.toLowerCase().split(/\s+/).filter(Boolean);
    const list = listings.filter((p) => (patFilter === "all" || (patFilter === "featured" ? f.includes(String(p.id)) : h.includes(String(p.id))))
      && words.every((w) => (p.n + " " + p.d).toLowerCase().includes(w))).slice(0, 200);
    $("#pat-list").innerHTML = list.map((p) => {
      const isF = f.includes(String(p.id)), isH = h.includes(String(p.id));
      return `<li class="${isH ? "is-hidden" : ""}"><img src="${esc(p.i)}" alt="" loading="lazy"><span><b>${esc(p.n)}</b><small>${esc(p.d)} · ${esc(p.pr)}</small></span>
        <span class="pat-acts"><button type="button" class="chip" aria-pressed="${isF}" data-feat="${p.id}">${isF ? "Featured" : "Feature"}</button>
        <button type="button" class="chip" aria-pressed="${isH}" data-hide="${p.id}">${isH ? "Hidden" : "Hide"}</button></span></li>`;
    }).join("") || '<li class="muted">No patterns match.</li>';
    $$("[data-feat]").forEach((b) => b.addEventListener("click", () => { toggle(f, b.dataset.feat); patterns(); dirty(); }));
    $$("[data-hide]").forEach((b) => b.addEventListener("click", () => { toggle(h, b.dataset.hide); patterns(); dirty(); }));
  }
  const toggle = (arr, id) => { const i = arr.indexOf(String(id)); i >= 0 ? arr.splice(i, 1) : arr.push(String(id)); };
  $("#pat-q").addEventListener("input", patterns);


  /* ---------- runway ---------- */
  const thumbChip = (id, onRemove) => {
    const p = byId(id); if (!p) return null;
    const el = document.createElement("span"); el.className = "pick";
    el.innerHTML = `<img src="${esc(p.i)}" alt="">${esc(p.n)}<button type="button" aria-label="Remove ${esc(p.n)}">×</button>`;
    $("button", el).addEventListener("click", onRemove);
    return el;
  };
  function runwayPane() {
    const rw = content.runway = content.runway || {};
    ["pick", "skip", "no_sketch"].forEach((k) => { rw[k] = (rw[k] || []).map(String); });
    rw.sketches = rw.sketches || {};
    const lists = [["rw-pick", "pick", 18, "Choose looks"], ["rw-nosketch", "no_sketch", 40, "Choose patterns"], ["rw-skip", "skip", 60, "Choose patterns"]];
    lists.forEach(([box, key, max, label]) => {
      const el = $("#" + box); el.innerHTML = "";
      rw[key].forEach((id, n) => {
        const c = thumbChip(id, () => { rw[key].splice(n, 1); runwayPane(); dirty(); });
        if (c) { if (key === "pick") c.insertAdjacentHTML("afterbegin", `<span class="n">${n + 1}</span>`); el.appendChild(c); }
      });
      const b = document.createElement("button"); b.type = "button"; b.className = "btn btn-ghost btn-small"; b.textContent = label;
      b.addEventListener("click", () => picker(rw[key], max, (ids) => { rw[key] = ids; runwayPane(); dirty(); }));
      el.appendChild(b);
    });
    $("#rw-sketches").innerHTML = Object.entries(rw.sketches).map(([id, url]) => {
      const p = byId(id);
      return `<li><img src="${esc(p ? p.i : "")}" alt=""><span><b>${esc(p ? p.n : "Pattern " + id)}</b></span><img class="sk" src="${esc(url)}" alt="Sketch"><button type="button" class="btn btn-ghost btn-small danger" data-sk-rm="${esc(id)}">Remove</button></li>`;
    }).join("") || '<li class="muted">No sketches added yet.</li>';
    $$("[data-sk-rm]").forEach((b) => b.addEventListener("click", () => { delete rw.sketches[b.dataset.skRm]; runwayPane(); dirty(); }));
  }
  $("#rw-add-sketch").addEventListener("click", () => picker([], 1, (ids) => {
    if (!ids.length) return;
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.addEventListener("change", async () => { const url = await upload(inp.files[0], "sketches"); if (url) { content.runway.sketches[ids[0]] = url; runwayPane(); dirty(); } });
    inp.click();
  }));

  /* ---------- shorts (reels) ---------- */
  const imgSrc = (p) => (/^https?:/.test(p || "") ? p : "../" + (p || ""));
  function reelsPane() {
    const reels = content.reels = (content.reels && content.reels.length ? content.reels : structuredClone(S.defaults.reels || []));
    const box = $("#reels"); box.innerHTML = "";
    reels.forEach((r, k) => {
      const card = document.createElement("div"); card.className = "card-box reel-edit";
      card.innerHTML = `<h2>Reel ${k + 1}: ${esc(r.title)}</h2>
        <div class="two"><label class="field"><span>Title</span><input data-r="title" value="${esc(r.title)}"></label>
        <label class="field"><span>Label</span><input data-r="tag" value="${esc(r.tag)}" placeholder="Printing, Fabric, Fit"></label></div>
        <label class="field"><span>"Read the full guide" goes to</span><select data-r="link">${(S.guides || []).map((g) => `<option value="journal/${esc(g.slug)}/" ${r.link === `journal/${g.slug}/` ? "selected" : ""}>${esc(g.title)}</option>`).join("")}<option value="journal/" ${r.link === "journal/" ? "selected" : ""}>The Journal page</option></select></label>
        <ol class="scene-list">${r.scenes.map((sc, i) => `<li>
          <span class="scene-img"><img src="${esc(imgSrc(sc.img))}" alt=""><label class="btn btn-ghost btn-small">Change photo<input type="file" accept="image/*" hidden data-up="${i}"></label></span>
          <span class="scene-text"><label class="field"><span>Big line</span><input data-s="${i}" data-f="big" value="${esc(sc.big)}" maxlength="34"></label>
          <label class="field"><span>Small line</span><input data-s="${i}" data-f="small" value="${esc(sc.small)}" maxlength="40"></label></span></li>`).join("")}</ol>`;
      $$("[data-r]", card).forEach((inp) => inp.addEventListener("input", () => { r[inp.dataset.r] = inp.value; dirty(); }));
      $$("[data-s]", card).forEach((inp) => inp.addEventListener("input", () => { r.scenes[+inp.dataset.s][inp.dataset.f] = inp.value; dirty(); }));
      $$("[data-up]", card).forEach((inp) => inp.addEventListener("change", async () => { const url = await upload(inp.files[0], "reels"); if (url) { r.scenes[+inp.dataset.up].img = url; reelsPane(); dirty(); } }));
      box.appendChild(card);
    });
  }

  /* ---------- social & footer ---------- */
  function socialPane() {
    const soc = content.social = content.social || {};
    ["instagram", "facebook", "pinterest"].forEach((k) => {
      const el = $("#soc-" + k); el.value = soc[k] || "";
      el.oninput = () => {
        const v = el.value.trim();
        const ok = !v || /^https:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.com|pinterest\.[a-z.]+|pin\.it)\//i.test(v);
        $("#soc-msg").textContent = ok ? "" : `That doesn't look like a ${k} link. Copy it from the address bar of your profile.`;
        if (ok) { soc[k] = v; dirty(); }
      };
    });
  }

  /* ---------- pattern picker ---------- */
  function picker(selected, max, done) {
    let sel = selected.map(String);
    const wrap = document.createElement("div"); wrap.className = "picker";
    wrap.innerHTML = `<div class="picker-box" role="dialog" aria-modal="true" aria-label="Choose patterns">
      <div class="picker-head"><h2>Choose up to ${max} patterns</h2><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="search" placeholder="Search patterns" aria-label="Search patterns"></label></div>
      <ul class="picker-list"></ul>
      <div class="picker-foot"><button type="button" class="btn btn-ghost btn-small" data-x>Cancel</button><button type="button" class="btn btn-small" data-ok>Use these</button></div></div>`;
    const draw = () => {
      const words = $("input", wrap).value.toLowerCase().split(/\s+/).filter(Boolean);
      $(".picker-list", wrap).innerHTML = listings.filter((p) => !p.h && words.every((w) => (p.n + " " + p.d).toLowerCase().includes(w))).slice(0, 120)
        .map((p) => `<li><button type="button" aria-pressed="${sel.includes(String(p.id))}" data-p="${p.id}"><img src="${esc(p.i)}" alt=""><span><b>${esc(p.n)}</b><br><small>${esc(p.d)}</small></span><span>${sel.includes(String(p.id)) ? "✓" : ""}</span></button></li>`).join("");
      $$("[data-p]", wrap).forEach((b) => b.addEventListener("click", () => {
        const id = b.dataset.p; sel.includes(id) ? (sel = sel.filter((x) => x !== id)) : sel.length < max ? sel.push(id) : toast(`You can choose up to ${max}.`); draw();
      }));
    };
    const close = () => wrap.remove();
    $("[data-x]", wrap).addEventListener("click", close);
    $("[data-ok]", wrap).addEventListener("click", () => { done(sel); close(); });
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    $("input", wrap).addEventListener("input", draw);
    document.body.appendChild(wrap); draw(); $("input", wrap).focus();
  }

  /* ---------- image upload ---------- */
  async function upload(file, folder) {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) { toast("That photo is over 5 MB. Please use a smaller one."); return null; }
    toast("Uploading photo…");
    const name = `${folder}/${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-")}`;
    const { error } = await db.storage.from("site-images").upload(name, file, { cacheControl: "31536000", upsert: false });
    if (error) { toast("Upload failed: " + error.message); return null; }
    toast("Photo uploaded.");
    return db.storage.from("site-images").getPublicUrl(name).data.publicUrl;
  }

  /* ---------- blog ---------- */
  async function loadPosts() {
    const { data, error } = await db.from("posts").select("*").order("date", { ascending: false });
    if (error) return toast("Couldn't load posts: " + error.message);
    posts = data;
    $("#post-rows").innerHTML = posts.map((p) => `<li><span><b>${esc(p.title)}</b><small class="muted">/journal/${esc(p.slug)}/ · ${esc(p.date || "")}</small></span>
      <span class="btn-row"><span class="badge ${p.published ? "on" : ""}">${p.published ? "Published" : "Draft"}</span><button type="button" class="btn btn-ghost btn-small" data-edit="${esc(p.slug)}">Edit</button></span></li>`).join("")
      || '<li class="muted">No posts yet. Write your first guide.</li>';
    $$("[data-edit]").forEach((b) => b.addEventListener("click", () => openPost(posts.find((p) => p.slug === b.dataset.edit))));
    guides();
  }
  function guides() {
    const hid = content.hidden_posts = content.hidden_posts || [];
    $("#guide-rows").innerHTML = (S.guides || []).map((g) => `<li><span><b>${esc(g.title)}</b><small class="muted">/journal/${esc(g.slug)}/</small></span>
      <span class="btn-row"><a class="btn btn-ghost btn-small" href="../journal/${esc(g.slug)}/" target="_blank" rel="noopener">View</a>
      <button type="button" class="chip" aria-pressed="${hid.includes(g.slug)}" data-gh="${esc(g.slug)}">${hid.includes(g.slug) ? "Hidden" : "Hide"}</button></span></li>`).join("");
    $$("[data-gh]").forEach((b) => b.addEventListener("click", () => { toggle(hid, b.dataset.gh); guides(); dirty(); }));
  }
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  function openPost(p) {
    editing = p ? { ...p, _old: p.slug } : { slug: "", title: "", description: "", body: "## First heading\n\nStart writing here.", category: "", tag: "Guide", cover: "", published: false, date: new Date().toISOString().slice(0, 10) };
    $("#post-list-view").hidden = true; $("#post-edit").hidden = false; $("#post-msg").textContent = "";
    $("#p-title").value = editing.title; $("#p-slug").value = editing.slug; $("#p-desc").value = editing.description || "";
    $("#p-tag").value = editing.tag || ""; $("#p-date").value = (editing.date || "").slice(0, 10); $("#p-body").value = editing.body || ""; $("#p-pub").checked = !!editing.published;
    $("#del-post").hidden = !p;
    cover(); cats(); preview(false); scrollTo(0, 0);
  }
  function cover() { const img = $("#p-cover-img"); img.hidden = !editing.cover; if (editing.cover) img.src = editing.cover; }
  function cats() {
    $("#p-cat").innerHTML = [["", "Any"], ...S.cats.map((c) => [c.slug, c.name])].map(([v, n]) => `<button type="button" class="chip" aria-pressed="${(editing.category || "") === v}" data-pc="${v}">${esc(n)}</button>`).join("");
    $$("[data-pc]").forEach((b) => b.addEventListener("click", () => { editing.category = b.dataset.pc; cats(); }));
  }
  $("#p-title").addEventListener("input", (e) => { if (!editing._old && !editing._slugTouched) $("#p-slug").value = slugify(e.target.value); });
  $("#p-slug").addEventListener("input", (e) => { editing._slugTouched = true; e.target.value = slugify(e.target.value) || e.target.value.toLowerCase(); });
  $("#p-cover-file").addEventListener("change", async (e) => { const url = await upload(e.target.files[0], "blog"); if (url) { editing.cover = url; cover(); } e.target.value = ""; });
  $("#p-cover-clear").addEventListener("click", () => { editing.cover = ""; cover(); });
  $("#new-post").addEventListener("click", () => openPost(null));
  $("#back-posts").addEventListener("click", () => { $("#post-edit").hidden = true; $("#post-list-view").hidden = false; });

  const body = $("#p-body");
  const wrapSel = (before, after = before, ph = "text") => {
    const s = body.selectionStart, e = body.selectionEnd, txt = body.value.slice(s, e) || ph;
    body.setRangeText(before + txt + after, s, e, "end"); body.focus();
  };
  $$("[data-md]").forEach((b) => b.addEventListener("click", () => {
    const k = b.dataset.md;
    if (k === "h2") wrapSel("\n## ", "\n", "Heading");
    if (k === "b") wrapSel("**", "**", "bold text");
    if (k === "ul") wrapSel("\n- ", "\n- \n", "List item");
    if (k === "link") { const u = prompt("Paste the link (for example a pattern page)"); if (u) wrapSel("[", `](${u})`, "link text"); }
    if (k === "preview") preview(b.getAttribute("aria-pressed") !== "true");
  }));
  $("#md-img").addEventListener("change", async (e) => { const url = await upload(e.target.files[0], "blog"); if (url) wrapSel("\n![", `](${url})\n`, "photo description"); e.target.value = ""; });
  function preview(on) {
    $("[data-md=preview]").setAttribute("aria-pressed", on);
    $("#p-preview").hidden = !on; body.hidden = on;
    if (on) $("#p-preview").innerHTML = window.marked ? window.marked.parse(body.value) : esc(body.value);
  }
  $("#post-edit").addEventListener("submit", async (e) => {
    e.preventDefault();
    const row = { slug: slugify($("#p-slug").value), title: $("#p-title").value.trim(), description: $("#p-desc").value.trim(), body: body.value,
      category: editing.category || "", tag: $("#p-tag").value.trim() || "Guide", cover: editing.cover || "", published: $("#p-pub").checked,
      date: $("#p-date").value || new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() };
    if (!row.slug || !row.title) return ($("#post-msg").textContent = "Add a title and a web address first.");
    $("#post-msg").textContent = "Saving…";
    const { error } = await db.from("posts").upsert(row);
    if (error) { $("#post-msg").className = "form-msg"; return ($("#post-msg").textContent = "Not saved: " + error.message); }
    if (editing._old && editing._old !== row.slug) await db.from("posts").delete().eq("slug", editing._old);
    editing = { ...row, _old: row.slug }; $("#del-post").hidden = false;
    $("#post-msg").className = "form-msg ok";
    $("#post-msg").textContent = row.published ? "Saved. It appears on the website within an hour." : "Saved as a draft. Turn on Published when it's ready.";
    loadPosts();
  });
  $("#del-post").addEventListener("click", async () => {
    if (!editing || !editing._old) return;
    const btn = $("#del-post");
    if (btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "Click again to delete"; setTimeout(() => { btn.dataset.sure = ""; btn.textContent = "Delete"; }, 4000); return; }
    const { error } = await db.from("posts").delete().eq("slug", editing._old);
    if (error) return toast("Not deleted: " + error.message);
    toast("Post deleted."); $("#back-posts").click(); loadPosts();
  });

  start();
})();
