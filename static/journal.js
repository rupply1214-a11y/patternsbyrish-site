(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- story topic filter ---------- */
  const tabs = [...document.querySelectorAll(".j-tab")];
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => x.setAttribute("aria-pressed", x === t));
    document.querySelectorAll(".js-list > li[data-topic]").forEach((li) => { li.hidden = !!t.dataset.topic && li.dataset.topic !== t.dataset.topic; });
  }));

  /* ---------- the puzzle: scroll pieces a dress together ---------- */
  const box = document.querySelector("[data-puzzle]");
  if (!box || still) return; // without motion the page shows the finished dress and every tip as a plain list
  const pieces = [...box.querySelectorAll(".pz-piece")];
  const chs = [...box.querySelectorAll(".pz-ch")];
  const dots = [...box.querySelectorAll("[data-dot]")];
  const bar = box.querySelector(".pz-progress span");
  const STEPS = chs.length; // intro + 7 chapters + finale
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (x) => 1 - Math.pow(1 - x, 3);
  box.classList.add("pz-live");

  let active = -1, ticking = false;
  const render = () => {
    ticking = false;
    const r = box.getBoundingClientRect();
    const run = box.offsetHeight - innerHeight;
    const prog = clamp(-r.top / run);
    const t = Math.min(prog * STEPS, STEPS - 0.001);
    pieces.forEach((p, i) => {
      const n = i + 1; // piece n lands while chapter n opens
      const k = clamp((t - (n - 0.45)) / 0.6);
      p.style.setProperty("--p", ease(k).toFixed(3));
      p.classList.toggle("locked", k >= 1);
    });
    const now = Math.floor(t);
    if (now !== active) {
      active = now;
      chs.forEach((c, i) => { c.classList.toggle("on", i === now); c.classList.toggle("past", i < now); c.inert = i !== now; });
      dots.forEach((d, i) => { d.classList.toggle("on", i === now); d.classList.toggle("done", i < now); });
      box.classList.toggle("pz-done", now >= STEPS - 1);
      box.dataset.step = now;
    }
    if (bar) bar.style.transform = `scaleX(${prog.toFixed(4)})`;
  };
  const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(render); } };
  addEventListener("scroll", ask, { passive: true });
  addEventListener("resize", ask);
  render();
})();
