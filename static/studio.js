(() => {
  const film = document.querySelector("[data-film]");
  if (!film) return;
  const $ = (s, el = film) => el.querySelector(s);
  const $$ = (s, el = film) => [...el.querySelectorAll(s)];
  const svg = $(".stage"), scenes = $$(".scene"), segs = $$(".seg");
  const data = JSON.parse(document.getElementById("film-scenes").textContent);
  const toggle = $("[data-film-toggle]"), big = $("[data-film-big]");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let i = 0, playing = false, elapsed = 0, last = 0, raf = 0, timers = [], userPaused = false, visible = false;

  const countUp = (scene) => $$("[data-count]", scene).forEach((el) => {
    const to = parseFloat(el.dataset.count), dec = +el.dataset.dec || 0, t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 1600), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
    if (!still) requestAnimationFrame(step);
  });

  const smil = (scene) => {
    timers.forEach(clearTimeout); timers = [];
    $$("[data-smil]", scene).forEach((a) => {
      try { a.endElement(); } catch (e) { /* not started yet */ }
      if (still) return;
      timers.push(setTimeout(() => { try { a.beginElement(); } catch (e) { /* SMIL not supported */ } }, (+a.dataset.at || 0) * 1000));
    });
  };

  const show = (n, run = true) => {
    i = (n + scenes.length) % scenes.length; elapsed = 0;
    scenes.forEach((s, k) => { s.classList.toggle("on", k === i); s.classList.remove("run"); });
    const s = scenes[i];
    if (run && !still) { void s.getBBox(); s.classList.add("run"); smil(s); countUp(s); }
    segs.forEach((g, k) => { g.classList.toggle("done", k < i); g.setAttribute("aria-selected", k === i); $(".seg-fill", g).style.width = k < i ? "100%" : "0"; });
    $("[data-film-count]").textContent = `Scene ${i + 1} of ${scenes.length}`;
    $("[data-film-title]").textContent = data[i].title;
    $("[data-film-text]").textContent = data[i].text;
  };

  const frame = (t) => {
    if (!playing) return;
    elapsed += t - last; last = t;
    const dur = data[i].dur;
    $(".seg-fill", segs[i]).style.width = Math.min(100, (elapsed / dur) * 100) + "%";
    if (elapsed >= dur) {
      if (i === scenes.length - 1) { pause(); return; }
      show(i + 1);
    }
    raf = requestAnimationFrame(frame);
  };
  const play = () => {
    if (playing) return;
    if (i === scenes.length - 1 && elapsed >= data[i].dur) show(0);
    playing = true; film.classList.remove("paused"); try { svg.unpauseAnimations(); } catch (e) { /* no SMIL */ }
    toggle.setAttribute("aria-pressed", "true"); toggle.setAttribute("aria-label", "Pause");
    big.hidden = true;
    if (!scenes[i].classList.contains("run") && !still) show(i);
    last = performance.now(); raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    playing = false; cancelAnimationFrame(raf); film.classList.add("paused"); try { svg.pauseAnimations(); } catch (e) { /* no SMIL */ }
    toggle.setAttribute("aria-pressed", "false"); toggle.setAttribute("aria-label", "Play");
  };

  toggle.addEventListener("click", () => { userPaused = playing; playing ? pause() : play(); });
  big.addEventListener("click", () => { userPaused = false; play(); });
  $("[data-film-restart]").addEventListener("click", () => { userPaused = false; show(0); film.classList.remove("paused"); play(); });
  segs.forEach((g, k) => g.addEventListener("click", () => { show(k); if (!playing && !still) { userPaused = false; play(); } }));
  document.addEventListener("keydown", (e) => {
    if (!visible || /input|textarea|select|button/i.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") show(i + 1); else if (e.key === "ArrowLeft") show(i - 1);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden && playing) pause(); });

  // start with the first scene fully drawn; play automatically once the film is on screen
  show(0, false);
  if (still) { big.hidden = true; return; }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !userPaused) play();
      else if (!visible && playing) pause();
    }, { threshold: 0.55 }).observe(film);
  }
})();
