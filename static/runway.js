(() => {
  const box = document.querySelector("[data-runway]");
  if (!box) return;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const looks = [...box.querySelectorAll("[data-look]")];
  // front row: tap to flip between the finished look and its sketch
  box.querySelectorAll("[data-flip]").forEach((b) => b.addEventListener("click", () => b.classList.toggle("flipped")));
  if (still || !("IntersectionObserver" in window)) { looks.forEach((l) => l.classList.add("in")); return; }
  box.classList.add("lb-live");
  // each look: the sketch draws itself, then the finished piece drops in
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }), { rootMargin: "0px 0px -25% 0px" });
  looks.forEach((l) => io.observe(l));
})();
