(() => {
  const box = document.querySelector("[data-runway]");
  if (!box) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const looks = [...box.querySelectorAll("[data-look]")];
  const now = box.querySelector(".rw-now"), label = box.querySelector("[data-now]");
  if (still || !("IntersectionObserver" in window)) { looks.forEach((l) => l.classList.add("in")); return; }
  box.classList.add("rw-live");
  // each look walks forward as it reaches the middle of the screen, and the cameras flash
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); if (label) label.textContent = "Look " + String(e.target.dataset.look).padStart(2, "0"); }
  }), { rootMargin: "-30% 0px -30% 0px" });
  looks.forEach((l) => io.observe(l));
  // the "now walking" pill shows only while the show is on screen
  const walk = box.querySelector(".rw-walk");
  if (walk && now) new IntersectionObserver(([e]) => { now.hidden = !e.isIntersecting; }, { rootMargin: "-40% 0px -40% 0px" }).observe(walk);
})();
