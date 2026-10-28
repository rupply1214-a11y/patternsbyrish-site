(() => {
  // background video: wide for computers, square for phones
  const v = document.querySelector("[data-bg-video]");
  if (v) {
    const pick = () => {
      const wide = matchMedia("(min-aspect-ratio: 1/1)").matches;
      const src = wide ? v.dataset.wide : v.dataset.square;
      if (v.dataset.now === src) return;
      v.dataset.now = src; v.poster = wide ? v.dataset.widePoster : v.dataset.squarePoster; v.src = src;
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) v.play().catch(() => {});
    };
    pick(); addEventListener("resize", pick);
  }
  const box = document.querySelector("[data-login]");
  if (!box || !window.supabase) return;
  const $ = (s) => box.querySelector(s);
  const db = window.supabase.createClient(box.dataset.sbUrl, box.dataset.sbKey);
  const home = new URL(box.dataset.home, location.href).href;
  const here = location.origin + location.pathname;
  const params = new URLSearchParams(location.search);
  // only ever send people to pages on this website
  const safe = (p) => (p && /^[a-z0-9\-\/]*$/i.test(p) && !p.startsWith("/") ? p : "");
  const next = safe(params.get("next"));
  const save = (params.get("save") || "").replace(/\D/g, "");
  const card = $("[data-card]"), form = $("[data-form]"), msgEl = $("[data-msg]");
  let mode = "in";

  const msg = (t, ok) => { msgEl.textContent = t || ""; msgEl.classList.toggle("ok", !!ok); };
  const busy = (on) => { card.classList.toggle("sewing", on); $("[data-submit]").disabled = on; };
  const friendly = (e) => {
    const m = (e && e.message) || "Something went wrong. Please try again.";
    if (/invalid login/i.test(m)) return "That email and password don't match. Check them, or tap Forgot your password.";
    if (/already registered|already exists/i.test(m)) return "This email already has an account. Sign in instead.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first: open the link we sent you.";
    if (/password/i.test(m) && /6/.test(m)) return "Use a password with at least 6 characters.";
    if (/provider is not enabled/i.test(m)) return "Google sign in isn't switched on yet. Please use your email for now.";
    return m;
  };

  function setMode(m) {
    mode = m;
    box.querySelectorAll("[data-when]").forEach((el) => { el.hidden = el.dataset.when !== m; });
    $("[data-title]").innerHTML = m === "in" ? 'Welcome back to <em class="acc">the studio</em>' : 'Pull up a <em class="acc">sewing chair</em>';
    $("[data-sub]").textContent = m === "in"
      ? "Sign in to see the patterns you've saved. The shop owner goes straight to the admin panel."
      : "Make a free account to save the patterns you love and find them again in your sewing room.";
    $("[data-submit-label]").textContent = m === "in" ? "Sign in" : "Create my account";
    form.password.autocomplete = m === "in" ? "current-password" : "new-password";
    $("[data-forgot]").hidden = m !== "in";
    $(".lg-row").classList.toggle("up", m !== "in");
    msg("");
  }
  box.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  if (params.get("mode") === "up") setMode("up");

  $("[data-eye]").addEventListener("click", (e) => {
    const show = form.password.type === "password";
    form.password.type = show ? "text" : "password";
    e.currentTarget.classList.toggle("open", show);
    e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  // after signing in: save the pattern they tapped, remember their list, then send them on
  let routing = false;
  async function route(session) {
    if (!session || routing) return;
    routing = true;
    busy(true);
    try { localStorage.setItem("pbr_user", session.user.email || "you"); } catch {}
    if (save) await db.from("wishlist").upsert({ user_id: session.user.id, listing_id: save });
    const { data: rows } = await db.from("wishlist").select("listing_id");
    try { localStorage.setItem("pbr_saved", JSON.stringify((rows || []).map((r) => r.listing_id))); } catch {}
    const { data: isAdmin } = await db.rpc("is_admin");
    const dest = next ? home + next : isAdmin ? home + "admin/" : home + "sewing-room/";
    card.classList.remove("sewing"); card.classList.add("done");
    $("[data-title]").innerHTML = 'All <em class="acc">sewn up!</em>';
    $("[data-sub]").textContent = isAdmin && !next ? "Opening the admin panel…" : "Opening your sewing room…";
    setTimeout(() => location.replace(dest), 1100);
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = form.email.value.trim(), password = form.password.value;
    if (!/^\S+@\S+\.\S+$/.test(email)) return msg("Please type your email address.");
    if (password.length < 6) return msg("Use a password with at least 6 characters.");
    busy(true); msg("");
    if (mode === "in") {
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) { busy(false); return msg(friendly(error)); }
      return route(data.session);
    }
    const { data, error } = await db.auth.signUp({ email, password, options: { emailRedirectTo: here + location.search } });
    busy(false);
    if (error) return msg(friendly(error));
    if (data.session) return route(data.session);
    msg("Almost there! We've sent you an email. Open the link in it to finish making your account.", true);
  });

  $("[data-google]").addEventListener("click", async () => {
    busy(true); msg("");
    const { error } = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: here + location.search } });
    if (error) { busy(false); msg(friendly(error)); }
  });

  $("[data-forgot]").addEventListener("click", async () => {
    const email = form.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) { form.email.focus(); return msg("Type your email above first, then tap Forgot your password again."); }
    busy(true);
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: here + "?reset=1" });
    busy(false);
    msg(error ? friendly(error) : "We've sent you an email with a link to set a new password.", !error);
  });

  // coming back from a password reset email
  const newpass = $("[data-newpass]");
  newpass.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pw = newpass.newpass.value;
    if (pw.length < 6) return ($("[data-msg2]").textContent = "Use at least 6 characters.");
    const { data, error } = await db.auth.updateUser({ password: pw });
    if (error) return ($("[data-msg2]").textContent = friendly(error));
    route((await db.auth.getSession()).data.session || data.session);
  });

  let recovering = params.get("reset") === "1";
  db.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      recovering = true; form.hidden = true; newpass.hidden = false;
      box.querySelector(".lg-switch").hidden = true; $("[data-google]").hidden = true; box.querySelector(".lg-or").hidden = true;
      $("[data-title]").innerHTML = 'Choose a <em class="acc">new password</em>';
      $("[data-sub]").textContent = "Type a new password for your account.";
    } else if (event === "SIGNED_IN" && !recovering && !card.classList.contains("done")) {
      route(session);
    }
  });
  db.auth.getSession().then(({ data }) => { if (data.session && !recovering) route(data.session); });
})();
