(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // topic filter
  const tabs = [...document.querySelectorAll(".j-tab")];
  tabs.forEach((t) => t.addEventListener("click", () => {
    tabs.forEach((x) => x.setAttribute("aria-pressed", x === t));
    document.querySelectorAll(".j-grid > li[data-topic]").forEach((li) => { li.hidden = !!t.dataset.topic && li.dataset.topic !== t.dataset.topic; });
  }));
  // cards rise in as they scroll into view (they start mostly visible, never hidden)
  if (!still && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".j-reveal").forEach((el) => { if (el.getBoundingClientRect().top > innerHeight * 0.9) { el.classList.add("pre"); io.observe(el); } });
  }
  // the big title follows the pointer a little, like a spotlight on the cutting table
  const hero = document.querySelector(".j-hero");
  if (hero && !still && matchMedia("(pointer: fine)").matches) {
    hero.addEventListener("pointermove", (e) => {
      const r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100).toFixed(1) + "%");
      hero.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100).toFixed(1) + "%");
    });
  }
  // gentle tilt on the lead story
  const lead = document.querySelector(".j-lead");
  if (lead && !still && matchMedia("(pointer: fine)").matches) {
    lead.addEventListener("pointermove", (e) => {
      const r = lead.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      lead.style.transform = `perspective(1200px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
    });
    lead.addEventListener("pointerleave", () => (lead.style.transform = ""));
  }
})();
