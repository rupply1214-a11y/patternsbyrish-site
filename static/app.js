(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rootAttr = document.body.dataset.root || "./";
  const preview = /index\.html$/.test(rootAttr);
  const base = rootAttr.replace(/index\.html$/, "");
  const page = (p) => base + p + (preview && p.endsWith("/") ? "index.html" : "");

  /* ---------- mobile menu ---------- */
  const nav = $("#nav"), menuBtn = $("[data-menu]"), header = $("[data-header]");
  if (menuBtn && nav) {
    menuBtn.addEventListener("click", () => {
      const open = !nav.classList.contains("open");
      document.documentElement.style.setProperty("--nav-top", header.getBoundingClientRect().bottom + "px");
      nav.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open);
      menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
    });
  }

  /* ---------- mega menu ---------- */
  const mega = $("[data-mega]");
  if (mega) {
    const btn = $(".mega-btn", mega), panel = $(".mega-panel", mega);
    let timer, hoverAt = 0;
    const set = (open) => { btn.setAttribute("aria-expanded", open); panel.hidden = !open; };
    btn.addEventListener("click", () => { if (Date.now() - hoverAt < 500) return; set(panel.hidden); });
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      mega.addEventListener("mouseenter", () => { clearTimeout(timer); if (!nav.classList.contains("open") && panel.hidden) { hoverAt = Date.now(); set(true); } });
      mega.addEventListener("mouseleave", () => { if (!nav.classList.contains("open")) timer = setTimeout(() => set(false), 180); });
    }
    document.addEventListener("click", (e) => { if (!mega.contains(e.target) && !nav.classList.contains("open")) set(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { set(false); btn.focus(); } });
  }

  /* ---------- search ---------- */
  const layer = $("[data-search]");
  let catalog = null;
  const loadCatalog = async () => {
    if (catalog) return catalog;
    try { catalog = await (await fetch(base + "static/catalog.json")).json(); } catch { catalog = []; }
    return catalog;
  };
  if (layer) {
    const input = $("[data-search-input]"), list = $("[data-search-results]"), hint = $("[data-search-hint]");
    let last = null;
    const open = () => { last = document.activeElement; layer.hidden = false; document.body.style.overflow = "hidden"; input.focus(); loadCatalog(); };
    const close = () => { layer.hidden = true; document.body.style.overflow = ""; if (last) last.focus(); };
    $$("[data-search-open]").forEach((b) => b.addEventListener("click", open));
    $("[data-search-close]").addEventListener("click", close);
    layer.addEventListener("click", (e) => { if (e.target === layer) close(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !layer.hidden) close();
      if (e.key === "/" && layer.hidden && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); open(); }
    });
    input.addEventListener("input", async () => {
      const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      const all = await loadCatalog();
      hint.hidden = words.length > 0;
      if (!words.length) { list.innerHTML = ""; return; }
      const hits = all.filter((p) => words.every((w) => p.k.includes(w))).slice(0, 8);
      list.innerHTML = hits.length ? hits.map((p) => `<li><a href="${page("pattern/" + p.s + "/")}">${p.i ? `<img src="${p.i}" alt="" loading="lazy">` : "<span></span>"}<span><b>${esc(p.n)}</b><small>${esc(p.d || "")}</small></span><span class="price">${p.pr}</span></a></li>`).join("")
        : `<li class="search-empty">No patterns match "${esc(input.value)}". Press Enter to search all patterns.</li>`;
    });
    if (preview) $(".search-form", layer).setAttribute("action", page("patterns/"));
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  /* ---------- hero carousel ---------- */
  const hero = $("[data-hero]");
  if (hero) {
    const slides = $$(".slide", hero), dots = $$(".dot", hero), pauseBtn = $("[data-pause]", hero);
    let i = 0, timer = null, paused = still, hover = false;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => {
        const on = k === i;
        s.classList.toggle("is-on", on);
        if (on) { s.classList.remove("moving"); void s.offsetWidth; s.classList.add("moving"); }
        s.toggleAttribute("inert", !on);
        on ? s.removeAttribute("aria-hidden") : s.setAttribute("aria-hidden", "true");
      });
      dots.forEach((d, k) => d.setAttribute("aria-selected", k === i));
    };
    const tick = () => { clearInterval(timer); if (!paused && !hover && slides.length > 1) timer = setInterval(() => show(i + 1), 7000); };
    $("[data-next]", hero).addEventListener("click", () => { show(i + 1); tick(); });
    $("[data-prev]", hero).addEventListener("click", () => { show(i - 1); tick(); });
    dots.forEach((d, k) => d.addEventListener("click", () => { show(k); tick(); }));
    pauseBtn.setAttribute("aria-pressed", paused);
    pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.setAttribute("aria-pressed", paused); pauseBtn.setAttribute("aria-label", paused ? "Play banners" : "Pause banners"); tick(); });
    hero.addEventListener("mouseenter", () => { hover = true; tick(); });
    hero.addEventListener("mouseleave", () => { hover = false; tick(); });
    hero.addEventListener("focusin", () => { hover = true; tick(); });
    hero.addEventListener("focusout", () => { hover = false; tick(); });
    document.addEventListener("visibilitychange", () => { hover = document.hidden; tick(); });
    let x0 = null;
    hero.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    hero.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) { show(i + (dx < 0 ? 1 : -1)); tick(); } x0 = null; });
    if (!still && document.visibilityState === "visible") slides[0].classList.add("moving");
    tick();
  }

  /* ---------- sideways rows ---------- */
  $$(".row-scroll").forEach((wrap) => {
    const track = $(".row-track", wrap), [prev, next] = $$("[data-scroll]", wrap);
    const update = () => {
      prev.disabled = track.scrollLeft < 8;
      next.disabled = track.scrollLeft + track.clientWidth > track.scrollWidth - 8;
    };
    $$("[data-scroll]", wrap).forEach((b) => b.addEventListener("click", () => track.scrollBy({ left: track.clientWidth * 0.8 * +b.dataset.scroll, behavior: still ? "auto" : "smooth" })));
    track.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
  });

  /* ---------- themed dropdowns ---------- */
  $$("[data-select]").forEach((sel) => {
    const btn = $(".select-btn", sel), list = $(".select-list", sel), value = $(".select-value", sel);
    const opts = () => $$("[role=option]", list);
    let active = 0;
    const mark = () => opts().forEach((o, k) => o.classList.toggle("active", k === active));
    const open = () => {
      $$("[data-select] .select-list").forEach((l) => { if (l !== list) { l.hidden = true; l.previousElementSibling.setAttribute("aria-expanded", "false"); } });
      list.hidden = false; btn.setAttribute("aria-expanded", "true");
      active = Math.max(0, opts().findIndex((o) => o.getAttribute("aria-selected") === "true")); mark(); list.focus();
    };
    const close = (focus = true) => { list.hidden = true; btn.setAttribute("aria-expanded", "false"); if (focus) btn.focus(); };
    const choose = (o) => {
      opts().forEach((x) => x.setAttribute("aria-selected", x === o));
      value.textContent = o.firstChild.textContent.trim();
      sel.dataset.value = o.dataset.value;
      close();
      sel.dispatchEvent(new CustomEvent("select-change", { detail: { value: o.dataset.value }, bubbles: true }));
    };
    sel.dataset.value = (opts().find((o) => o.getAttribute("aria-selected") === "true") || opts()[0]).dataset.value;
    btn.addEventListener("click", () => (list.hidden ? open() : close()));
    btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); } });
    list.addEventListener("click", (e) => { const o = e.target.closest("[role=option]"); if (o) choose(o); });
    list.addEventListener("keydown", (e) => {
      const all = opts();
      if (e.key === "ArrowDown") { active = Math.min(all.length - 1, active + 1); mark(); all[active].scrollIntoView({ block: "nearest" }); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(0, active - 1); mark(); all[active].scrollIntoView({ block: "nearest" }); e.preventDefault(); }
      else if (e.key === "Home") { active = 0; mark(); e.preventDefault(); }
      else if (e.key === "End") { active = all.length - 1; mark(); e.preventDefault(); }
      else if (e.key === "Enter" || e.key === " ") { choose(all[active]); e.preventDefault(); }
      else if (e.key === "Escape" || e.key === "Tab") close(e.key === "Escape");
    });
    document.addEventListener("click", (e) => { if (!sel.contains(e.target) && !list.hidden) close(false); });
  });

  /* ---------- pattern lists ---------- */
  const bar = $("[data-filters]"), grid = $("[data-grid]");
  if (bar && grid) {
    const cards = $$(".card", grid), moreBtn = $("[data-more]"), count = $("[data-count]"), empty = $("[data-empty]");
    const q = $("[data-q]", bar), current = bar.dataset.current;
    const params = new URLSearchParams(location.search);
    const st = { q: params.get("q") || "", type: current || params.get("type") || "", size: "", sort: "new", shown: 24 };
    q.value = st.q;
    const pick = (name, v) => {
      const sel = $(`[data-select][data-name="${name}"]`, bar), o = sel && $(`[role=option][data-value="${v}"]`, sel);
      if (!o) return;
      $$("[role=option]", sel).forEach((x) => x.setAttribute("aria-selected", x === o));
      $(".select-value", sel).textContent = o.firstChild.textContent.trim();
    };
    pick("type", st.type);
    const run = (keep) => {
      if (!keep) st.shown = 24;
      const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
      let list = cards.filter((c) => (!st.type || c.dataset.c.split(" ").includes(st.type))
        && (!st.size || c.dataset.z.includes(st.size)) && words.every((w) => c.dataset.k.includes(w)));
      const by = { new: (a, b) => b.dataset.t - a.dataset.t, low: (a, b) => a.dataset.p - b.dataset.p, high: (a, b) => b.dataset.p - a.dataset.p, az: (a, b) => a.dataset.n.localeCompare(b.dataset.n) }[st.sort];
      list.sort(by);
      cards.forEach((c) => (c.hidden = true));
      list.forEach((c, k) => { c.hidden = k >= st.shown; grid.appendChild(c); });
      count.textContent = `${list.length} pattern${list.length === 1 ? "" : "s"}`;
      empty.hidden = list.length > 0;
      moreBtn.hidden = list.length <= st.shown;
      if (!moreBtn.hidden) moreBtn.textContent = `Show ${Math.min(24, list.length - st.shown)} more patterns`;
      if (!current) {
        const u = new URL(location.href);
        st.q ? u.searchParams.set("q", st.q) : u.searchParams.delete("q");
        st.type ? u.searchParams.set("type", st.type) : u.searchParams.delete("type");
        history.replaceState(null, "", u);
      }
    };
    q.addEventListener("input", () => { st.q = q.value; run(); });
    bar.addEventListener("select-change", (e) => {
      const name = e.target.dataset.name, v = e.detail.value;
      if (name === "type" && current && v !== current) { location.href = v ? page("category/" + v + "/") : page("patterns/") + (st.q ? "?q=" + encodeURIComponent(st.q) : ""); return; }
      st[name] = v; run();
    });
    moreBtn.addEventListener("click", () => { st.shown += 24; run(true); });
    $("[data-reset]").addEventListener("click", () => { st.q = ""; q.value = ""; st.size = ""; pick("size", ""); if (!current) { st.type = ""; pick("type", ""); } run(); });
    run();
  }

  /* ---------- product gallery ---------- */
  const gal = $("[data-gallery]");
  if (gal) {
    const main = $("[data-main]", gal), frame = $(".gallery-main", gal), thumbs = $$(".thumb", gal);
    let i = 0;
    const show = (n) => {
      if (!thumbs.length || !main) return;
      i = (n + thumbs.length) % thumbs.length; const t = thumbs[i];
      main.src = t.dataset.src; main.alt = t.dataset.alt; frame.classList.remove("zoom");
      thumbs.forEach((x) => x.setAttribute("aria-pressed", x === t));
    };
    thumbs.forEach((t, k) => t.addEventListener("click", () => show(k)));
    $$("[data-g]", gal).forEach((b) => b.addEventListener("click", () => show(i + +b.dataset.g)));
    if (main) {
      main.addEventListener("click", (e) => {
        const r = main.getBoundingClientRect();
        main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
        frame.classList.toggle("zoom");
      });
      main.addEventListener("mousemove", (e) => {
        if (!frame.classList.contains("zoom")) return;
        const r = main.getBoundingClientRect();
        main.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      });
    }
    let x0 = null;
    frame.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    frame.addEventListener("touchend", (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1)); x0 = null; });
  }

  /* ---------- copy link ---------- */
  $$("[data-share]").forEach((b) => b.addEventListener("click", async () => {
    const url = location.href.split("?")[0];
    try { await navigator.clipboard.writeText(url); b.textContent = "Link copied"; }
    catch { prompt("Copy this link", url); }
    setTimeout(() => (b.textContent = "Copy link"), 2200);
  }));

  /* ---------- sticky buy bar on phones ---------- */
  const buyBar = $("[data-buybar]"), buyBtn = $(".buy .btn-big");
  if (buyBar && buyBtn && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => buyBar.classList.toggle("show", !e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 }).observe(buyBtn);
  }

  /* ---------- sew the headings and bring sections in as they scroll into view ---------- */
  if (!still && "IntersectionObserver" in window) {
    const below = (el) => el.getBoundingClientRect().top > innerHeight;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.remove("pre");
      if (e.target.classList.contains("stitch-h")) e.target.classList.add("sew");
      io.unobserve(e.target);
    }), { rootMargin: "0px 0px -10% 0px" });
    $$(".stitch-h").forEach((h) => { if (below(h)) io.observe(h); });
    $$(".band .grid, .swatches, .post-grid, .kit, .steps, .promo, .cat-row").forEach((el) => { if (below(el)) { el.classList.add("reveal", "pre"); io.observe(el); } });
  }
})();
