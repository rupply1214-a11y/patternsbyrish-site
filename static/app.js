(() => {
  // mobile menu
  const btn = document.querySelector(".menu-btn"), nav = document.getElementById("nav");
  if (btn && nav) btn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    btn.setAttribute("aria-expanded", open);
  });

  // hero: highlight one size line
  const sheet = document.querySelector(".sheet");
  if (sheet) {
    // draw the size lines once, only when someone can actually see it; otherwise they simply stay drawn
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still && document.visibilityState === "visible") sheet.classList.add("draw");
    const chips = sheet.querySelectorAll(".chip");
    let pinned = null;
    const show = (size) => {
      sheet.classList.toggle("focus", !!size);
      sheet.querySelectorAll("[data-size]").forEach((el) => {
        if (!el.classList.contains("chip")) el.classList.toggle("on", el.dataset.size === size);
      });
      chips.forEach((c) => c.setAttribute("aria-pressed", c.dataset.size === size));
    };
    chips.forEach((c) => {
      c.addEventListener("mouseenter", () => show(c.dataset.size));
      c.addEventListener("mouseleave", () => show(pinned));
      c.addEventListener("focus", () => show(c.dataset.size));
      c.addEventListener("blur", () => show(pinned));
      c.addEventListener("click", () => { pinned = pinned === c.dataset.size ? null : c.dataset.size; show(pinned); });
    });
  }

  // product gallery
  const gal = document.querySelector("[data-gallery]");
  if (gal) {
    const main = gal.querySelector("[data-main]");
    gal.querySelectorAll(".thumb").forEach((t) => t.addEventListener("click", () => {
      if (!main) return;
      main.src = t.dataset.src; main.alt = t.dataset.alt;
      gal.querySelectorAll(".thumb").forEach((x) => x.setAttribute("aria-pressed", x === t));
    }));
    if (main) main.addEventListener("click", () => window.open(main.src, "_blank", "noopener"));
  }

  // all-patterns filters
  const f = document.querySelector("[data-filters]"), data = document.getElementById("catalog");
  if (f && data) {
    const items = JSON.parse(data.textContent), grid = document.querySelector("[data-grid]");
    const cards = new Map([...grid.children].map((el) => [String(el.dataset.id), el]));
    const q = f.querySelector("[data-q]"), sort = f.querySelector("[data-sort]"), pills = f.querySelectorAll("[data-cat]");
    const count = document.querySelector("[data-count]"), empty = document.querySelector("[data-empty]");
    const params = new URLSearchParams(location.search);
    let cat = params.get("type") || "";
    if (params.get("q")) q.value = params.get("q");
    const run = () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      let list = items.filter((p) => (!cat || p.c.includes(cat)) && words.every((w) => p.k.includes(w)));
      const s = sort.value;
      list.sort((a, b) => s === "low" ? a.p - b.p : s === "high" ? b.p - a.p : b.t - a.t);
      cards.forEach((el) => (el.hidden = true));
      list.forEach((p) => { const el = cards.get(String(p.id)); if (el) { el.hidden = false; grid.appendChild(el); } });
      count.textContent = `${list.length} pattern${list.length === 1 ? "" : "s"}`;
      empty.hidden = list.length > 0;
      pills.forEach((b) => b.setAttribute("aria-pressed", b.dataset.cat === cat));
      const u = new URL(location.href);
      cat ? u.searchParams.set("type", cat) : u.searchParams.delete("type");
      q.value ? u.searchParams.set("q", q.value) : u.searchParams.delete("q");
      history.replaceState(null, "", u);
    };
    pills.forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; run(); }));
    q.addEventListener("input", run);
    sort.addEventListener("change", run);
    if (cat || q.value) run();
  }
})();
