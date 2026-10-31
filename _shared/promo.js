/*
 * Promo landing page for App Store Connect codes — the page an Instagram
 * story's Link sticker (or a bio link) opens.
 *
 * Everything it shows comes from its own URL, built by PromoVault
 * (PromoPageLink.swift):
 *
 *   promo/?app=keepchallengeit&name=KeepChallengeIt&type=promo
 *         &codes=XJ9KE7L3M4HR,RT7PL2QW8ZNA&id=6804486637&lang=es
 *
 *   codes  comma-separated App Store Connect codes (required)
 *   name   the app's public name
 *   app    the app's docs/ folder slug — used only for its icon.png
 *   type   "promo" (free download) or "offer" (subscription / IAP offer)
 *   id     numeric App Store ID — makes offer links open the right app
 *   lang   "es" for Spanish; English otherwise
 *
 * Once the page is up it also reads the studio catalog (../studio/apps.json,
 * the file the website and PromoVault share) for the app's public name, what
 * it does, its App Store ID and, when the catalog says it's live, a link to
 * its store page. The URL's own values are the fallback, so the page still
 * works if the catalog can't be read.
 *
 * Each code gets a Redeem button linking to apps.apple.com/redeem with the
 * code already filled in, so on an iPhone nobody types anything. Apple is
 * the one enforcing "one use per code" — this page has no backend and never
 * needs one, since it only ever shows codes the story itself already made
 * public.
 *
 * Replaces an earlier version that tried to claim codes from the shared
 * CloudKit container over CloudKit JS. That could never work: CloudKit's
 * World role is read-only, so every claim failed and every visitor was told
 * all codes were taken.
 */
(function () {
  const CODE_PATTERN = /^[A-Z0-9-]{4,40}$/;
  const MAX_CODES = 20;
  const TRIED_KEY = "promoTriedCodes";

  const COPY = {
    en: {
      promoTagline: "Free download. Pick a code and tap Redeem.",
      offerTagline: "A special offer. Pick a code and tap Redeem.",
      redeem: "Redeem",
      copy: "Copy",
      copied: "Copied",
      tried: "You opened this one",
      rules:
        "One use per code, first come first served. If the App Store says a code was already redeemed, someone beat you to it. Try the next one.",
      computer:
        "On a computer? On your iPhone open the App Store → tap your photo → Redeem Gift Card or Code, and type one in.",
      empty: "This link doesn't have any codes in it. Check the latest post for a fresh one.",
      store: "See it on the App Store",
    },
    es: {
      promoTagline: "Descarga gratis. Elige un código y toca Canjear.",
      offerTagline: "Oferta especial. Elige un código y toca Canjear.",
      redeem: "Canjear",
      copy: "Copiar",
      copied: "Copiado",
      tried: "Ya abriste este",
      rules:
        "Cada código se usa una sola vez: el primero que lo canjee se lo queda. Si el App Store dice que ya se canjeó, alguien te ganó. Prueba el siguiente.",
      computer:
        "¿Estás en una computadora? En tu iPhone abre el App Store → toca tu foto → Canjear tarjeta de regalo o código, y escribe uno.",
      empty: "Este enlace no trae códigos. Revisa la publicación más reciente.",
      store: "Verla en el App Store",
    },
  };

  function readParams() {
    const params = new URLSearchParams(window.location.search);
    const codes = (params.get("codes") || "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code, index, all) => CODE_PATTERN.test(code) && all.indexOf(code) === index)
      .slice(0, MAX_CODES);
    const id = (params.get("id") || "").replace(/\D/g, "");
    const slug = (params.get("app") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    return {
      codes,
      id,
      slug,
      name: (params.get("name") || "").slice(0, 60),
      isOffer: params.get("type") === "offer",
      lang: params.get("lang") === "es" ? "es" : "en",
    };
  }

  function redeemURL(code, config) {
    const url = new URL("https://apps.apple.com/redeem");
    if (config.isOffer && config.id) {
      url.searchParams.set("ctx", "offercodes");
      url.searchParams.set("id", config.id);
    }
    url.searchParams.set("code", code);
    return url.toString();
  }

  // Remembers which codes this browser already opened, so someone coming
  // back after a failed redeem can see which one to skip. Purely a
  // convenience — storage can be blocked (private mode, in-app browsers).
  function loadTried() {
    try {
      return new Set(JSON.parse(localStorage.getItem(TRIED_KEY) || "[]"));
    } catch (e) {
      return new Set();
    }
  }

  function saveTried(tried) {
    try {
      localStorage.setItem(TRIED_KEY, JSON.stringify(Array.from(tried).slice(-100)));
    } catch (e) {
      // Nothing to do — the page works the same without it.
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function codeCard(code, config, copy, tried) {
    const card = el("div", "promo-card");
    card.appendChild(el("div", "promo-code", code));

    const status = el("div", "promo-tried", tried.has(code) ? copy.tried : "");
    card.appendChild(status);

    const actions = el("div", "promo-actions");
    const redeem = el("a", "promo-download", copy.redeem);
    redeem.href = redeemURL(code, config);
    redeem.rel = "noopener";
    redeem.addEventListener("click", () => {
      tried.add(code);
      saveTried(tried);
      status.textContent = copy.tried;
    });
    actions.appendChild(redeem);

    const copyButton = el("button", "promo-copy", copy.copy);
    copyButton.type = "button";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(code);
        copyButton.textContent = copy.copied;
        setTimeout(() => (copyButton.textContent = copy.copy), 1500);
      } catch (e) {
        // Clipboard can be unavailable in in-app browsers; the code is
        // still on screen to select by hand.
      }
    });
    actions.appendChild(copyButton);

    card.appendChild(actions);
    return card;
  }

  // The catalog's entry for this app, or null. Its name, App Store ID and
  // store link come from Apple via build_catalog.py --refresh, so they win
  // over the ones an older link carries.
  function withCatalog(config, app) {
    if (!app) return config;
    const country = config.lang === "es" ? "mx" : "us";
    const store = (app.store && (app.store[country] || app.store.us)) || {};
    const live = app.status === "live" && /^https:\/\/apps\.apple\.com\//.test(store.url || "");
    return Object.assign({}, config, {
      name: app.name || config.name,
      about: (app.tagline && app.tagline[config.lang]) || "",
      id: store.id ? String(store.id) : config.id,
      storeURL: live ? store.url : "",
    });
  }

  function loadCatalog(config) {
    if (!config.slug || !window.fetch) return;
    fetch("../studio/apps.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const app = ((data && data.apps) || []).find((a) => a.slug === config.slug);
        if (app) render(withCatalog(config, app));
      })
      .catch(() => {
        // The URL's own name and ID are already on screen.
      });
  }

  function render(config) {
    const copy = COPY[config.lang];
    document.documentElement.lang = config.lang;

    // Set on the first render only; the one with the catalog leaves it be.
    const icon = document.getElementById("promo-icon");
    if (icon && !icon.getAttribute("src")) {
      if (config.slug) {
        // The studio site keeps a 256px icon for every public app; older drops used <slug>/icon.png
        icon.src = "../studio/icons/" + config.slug + ".png";
        icon.addEventListener("error", () => icon.remove());
      } else {
        icon.remove();
      }
    }

    if (config.name) {
      document.getElementById("promo-name").textContent = config.name;
      document.title = config.name;
    }
    const about = document.getElementById("promo-about");
    about.textContent = config.about || "";
    about.hidden = !config.about;
    document.getElementById("promo-tagline").textContent = config.isOffer
      ? copy.offerTagline
      : copy.promoTagline;

    const host = document.getElementById("promo-host");
    host.textContent = "";

    if (config.codes.length === 0) {
      host.appendChild(el("p", "promo-empty", copy.empty));
      return;
    }

    const tried = loadTried();
    config.codes.forEach((code) => host.appendChild(codeCard(code, config, copy, tried)));
    host.appendChild(el("p", "promo-note", copy.rules));
    host.appendChild(el("p", "promo-note", copy.computer));
    if (config.storeURL) {
      const store = el("a", "promo-store", copy.store);
      store.href = config.storeURL;
      store.rel = "noopener";
      host.appendChild(store);
    }
  }

  const config = readParams();
  render(config);
  loadCatalog(config);
})();
