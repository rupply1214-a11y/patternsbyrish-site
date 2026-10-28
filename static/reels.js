(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SCENE = 4200;
  document.querySelectorAll("[data-reel]").forEach((reel) => {
    const scenes = [...reel.querySelectorAll("[data-scene]")];
    const bars = [...reel.querySelectorAll(".reel-bars i")];
    let i = 0, t0 = 0, held = 0, playing = false, visible = false, raf = 0;
    const show = (n) => {
      i = (n + scenes.length) % scenes.length;
      [i, i + 1].forEach((k) => { const im = scenes[k % scenes.length].querySelector("img"); if (im) im.loading = "eager"; });
      scenes.forEach((s, k) => { s.classList.toggle("on", k === i); if (k === i) { s.classList.remove("go"); void s.offsetWidth; s.classList.add("go"); } });
      bars.forEach((b, k) => { b.style.transform = `scaleX(${k < i ? 1 : 0})`; });
      t0 = performance.now(); held = 0;
    };
    const tick = (now) => {
      if (!playing) return;
      const p = Math.min(1, (now - t0 + held) / SCENE);
      if (bars[i]) bars[i].style.transform = `scaleX(${p})`;
      if (p >= 1) show(i + 1);
      raf = requestAnimationFrame(tick);
    };
    const play = () => { if (playing || still) return; playing = true; reel.classList.add("playing"); t0 = performance.now(); raf = requestAnimationFrame(tick); };
    const pause = () => { if (!playing) return; playing = false; reel.classList.remove("playing"); held += performance.now() - t0; cancelAnimationFrame(raf); };
    reel.querySelector("[data-reel-toggle]").addEventListener("click", (e) => { e.stopPropagation(); playing ? pause() : play(); });
    reel.querySelector("[data-reel-next]").addEventListener("click", () => { show(i + 1); if (!playing) play(); });
    reel.querySelector("[data-reel-prev]").addEventListener("click", () => { show(i - 1); if (!playing) play(); });
    reel.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); playing ? pause() : play(); }
      if (e.key === "ArrowRight") show(i + 1);
      if (e.key === "ArrowLeft") show(i - 1);
    });
    show(0);
    if (still) { reel.classList.add("still"); return; }
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? play() : pause(); }, { threshold: .3 }).observe(reel);
    }
  });
})();
(() => {
  const tabs = [...document.querySelectorAll("[data-reel-tab]")];
  const items = [...document.querySelectorAll(".reels > li")];
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => x.setAttribute("aria-selected", x === t ? "true" : "false"));
    items.forEach((li, k) => li.classList.toggle("on", k === +t.dataset.reelTab));
  }));
})();
