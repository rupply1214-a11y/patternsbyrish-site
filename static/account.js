(() => {
  const C = window.PBR || {};
  if (!C.sb) return;
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let saved = new Set((read("pbr_saved", []) || []).map(String));
  const user = (() => { try { return localStorage.getItem("pbr_user"); } catch { return null; } })();

  // header: a little account button that knows if you're signed in
  document.querySelectorAll("[data-account]").forEach((a) => {
    a.href = C.base + (user ? "sewing-room/" : "login/");
    a.setAttribute("aria-label", user ? "My sewing room" : "Sign in");
    a.classList.toggle("signed", !!user);
    const label = a.querySelector("[data-account-label]");
    if (label) label.textContent = user ? "My sewing room" : "Sign in";
    const n = a.querySelector("[data-saved-count]");
    if (n) { n.textContent = saved.size || ""; n.hidden = !saved.size; }
  });

  const paint = () => document.querySelectorAll("[data-heart]").forEach((b) => {
    const on = saved.has(b.dataset.heart);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", (on ? "Saved in your sewing room: " : "Save to your sewing room: ") + (b.dataset.name || "this pattern"));
    const t = b.querySelector("[data-heart-label]"); if (t) t.textContent = on ? "Saved to my sewing room" : "Save to my sewing room";
  });
  paint();

  let client = null;
  const sb = () => client ? Promise.resolve(client) : new Promise((res, rej) => {
    if (window.supabase) return res(client = window.supabase.createClient(C.sb, C.key));
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
    s.onload = () => res(client = window.supabase.createClient(C.sb, C.key)); s.onerror = rej;
    document.head.appendChild(s);
  });
  const toLogin = (id) => {
    const here = location.pathname.split("/").filter(Boolean);
    const baseParts = new URL(C.base, location.href).pathname.split("/").filter(Boolean);
    const rel = here.slice(baseParts.length).join("/") + (here.length > baseParts.length ? "/" : "");
    location.href = C.base + "login/?next=" + encodeURIComponent(rel) + (id ? "&save=" + id : "");
  };

  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-heart]");
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.heart;
    if (!user) return toLogin(id);
    const on = !saved.has(id);
    on ? saved.add(id) : saved.delete(id);
    write("pbr_saved", [...saved]); paint();
    b.classList.remove("pop"); void b.offsetWidth; if (on) b.classList.add("pop");
    try {
      const db = await sb();
      const { data } = await db.auth.getSession();
      if (!data.session) { try { localStorage.removeItem("pbr_user"); } catch {} return toLogin(on ? id : ""); }
      const q = on ? db.from("wishlist").upsert({ user_id: data.session.user.id, listing_id: id })
                   : db.from("wishlist").delete().eq("user_id", data.session.user.id).eq("listing_id", id);
      const { error } = await q;
      if (error) throw error;
    } catch {
      on ? saved.delete(id) : saved.add(id); write("pbr_saved", [...saved]); paint();
    }
  });
})();
