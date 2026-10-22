/**
 * Gato's Header Menu
 *
 * Application V1 windows (all PF1 sheets in Foundry v13) build their title-bar buttons in `_getHeaderButtons()`:
 * the base class adds "Close" and fires the `get<Class>HeaderButtons` hooks, then subclasses such as ActorSheet
 * add more (Prototype Token). `_renderOuter()` calls it once, synchronously, before its first await, and binds
 * click handlers by matching the button `class`.
 *
 * We wrap `_renderOuter` and, for the windows in scope, shadow `_getHeaderButtons` on the instance for that one
 * synchronous call: the final list is split into buttons that stay visible and buttons that move into one ⋮ menu.
 */

const MODULE_ID = "gatos-header-menu";
const MENU_CLASS = "gatos-header-menu-toggle";
const DEFAULT_KEEP = ["close", "configure-token"];

/** Last condensed list per app id, so the ⋮ button can find the hidden buttons and their handlers. */
const hiddenByApp = new Map();

const L = (k, d) => (d ? game.i18n.format(k, d) : game.i18n.localize(k));

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function keepList() {
  const raw = game.settings.get(MODULE_ID, "keep") ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function setting(key) {
  try {
    return game.settings.get(MODULE_ID, key);
  } catch {
    return undefined;
  }
}

/** Remember every button class we have seen, so the configuration dialog can list them. */
async function rememberButtons(buttons) {
  const known = foundry.utils.deepClone(setting("known") ?? {});
  let changed = false;
  for (const b of buttons) {
    if (!b?.class || b.class === MENU_CLASS) continue;
    const label = b.label ?? b.class;
    if (known[b.class]?.label !== label || known[b.class]?.icon !== b.icon) {
      known[b.class] = { label, icon: b.icon ?? "" };
      changed = true;
    }
  }
  if (changed) await game.settings.set(MODULE_ID, "known", known);
}

/* -------------------------------------------- */
/*  Scope                                       */
/* -------------------------------------------- */

function appliesTo(app) {
  if (!setting("enabled")) return false;
  const scope = setting("scope") ?? "actorItem";
  const DocSheet = foundry.appv1?.api?.DocumentSheet ?? globalThis.DocumentSheet;
  if (scope === "all") return true;
  if (!(DocSheet && app instanceof DocSheet)) return false;
  if (scope === "document") return true;
  const name = app.document?.documentName;
  if (scope === "actor") return name === "Actor";
  return name === "Actor" || name === "Item";
}

/* -------------------------------------------- */
/*  Condensing the button list                  */
/* -------------------------------------------- */

function condense(app, buttons) {
  if (!Array.isArray(buttons) || buttons.length === 0) return buttons;
  rememberButtons(buttons).catch((err) => console.warn(`${MODULE_ID} | could not store known buttons`, err));

  const keep = new Set(keepList());
  const visible = [];
  const hidden = [];
  for (const b of buttons) {
    const cls = String(b?.class ?? "").split(/\s+/);
    if (cls.some((c) => keep.has(c))) visible.push(b);
    else hidden.push(b);
  }
  if (hidden.length < (setting("minHidden") ?? 1)) return buttons;

  hiddenByApp.set(app.appId, hidden);
  const toggle = {
    label: setting("showMenuLabel") ? "GATOSHM.Menu" : "",
    class: MENU_CLASS,
    icon: "fa-solid fa-ellipsis-vertical",
    tooltip: L("GATOSHM.MenuTooltip", { n: hidden.length }),
    onclick: (event) => openMenu(app, event),
  };
  // Put the ⋮ button just before Close so the bar reads: [kept…] [⋮] [Close]
  const closeIdx = visible.findIndex((b) => String(b.class).split(/\s+/).includes("close"));
  if (closeIdx >= 0) visible.splice(closeIdx, 0, toggle);
  else visible.push(toggle);

  if (setting("iconOnly")) {
    for (const b of visible) {
      if (b === toggle || !b.label) continue;
      b.tooltip ??= L(b.label);
      b.label = "";
    }
  }
  return visible;
}

/* -------------------------------------------- */
/*  Dropdown menu                               */
/* -------------------------------------------- */

let openDropdown = null;

function closeMenu() {
  if (!openDropdown) return;
  openDropdown.el.remove();
  document.removeEventListener("pointerdown", openDropdown.outside, true);
  document.removeEventListener("keydown", openDropdown.escape, true);
  openDropdown = null;
}

function openMenu(app, event) {
  event?.preventDefault?.();
  const anchor = event?.currentTarget ?? app.element?.[0]?.querySelector(`.${MENU_CLASS}`);
  if (openDropdown?.appId === app.appId) return closeMenu();
  closeMenu();

  const hidden = hiddenByApp.get(app.appId) ?? [];
  const el = document.createElement("nav");
  el.className = "gatos-header-menu-dropdown";
  el.setAttribute("role", "menu");
  for (const b of hidden) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `gatos-header-menu-item ${b.class ?? ""}`;
    item.setAttribute("role", "menuitem");
    const label = b.label ? L(b.label) : (b.tooltip ? L(b.tooltip) : b.class);
    item.innerHTML = `<i class="${b.icon ?? "fa-solid fa-circle"}"></i><span></span>`;
    item.querySelector("span").textContent = label;
    item.addEventListener("click", (ev) => {
      ev.preventDefault();
      closeMenu();
      try {
        b.onclick?.call(app, ev);
      } catch (err) {
        console.error(`${MODULE_ID} | header button "${b.class}" failed`, err);
      }
    });
    el.append(item);
  }
  if (game.user.isGM) {
    const cfg = document.createElement("button");
    cfg.type = "button";
    cfg.className = "gatos-header-menu-item gatos-header-menu-config";
    cfg.innerHTML = `<i class="fa-solid fa-sliders"></i><span></span>`;
    cfg.querySelector("span").textContent = L("GATOSHM.Configure");
    cfg.addEventListener("click", (ev) => {
      ev.preventDefault();
      closeMenu();
      openConfig();
    });
    el.append(cfg);
  }

  document.body.append(el);
  const r = anchor?.getBoundingClientRect?.() ?? { left: event?.clientX ?? 100, bottom: event?.clientY ?? 100, right: event?.clientX ?? 100 };
  const z = Number(app.element?.[0]?.style.zIndex) || 100;
  el.style.zIndex = String(z + 1);
  const w = el.offsetWidth;
  const left = Math.max(4, Math.min(window.innerWidth - w - 4, r.right - w));
  el.style.left = `${left}px`;
  el.style.top = `${Math.min(window.innerHeight - el.offsetHeight - 4, r.bottom + 2)}px`;

  const outside = (ev) => {
    if (el.contains(ev.target) || anchor?.contains?.(ev.target)) return;
    closeMenu();
  };
  const escape = (ev) => {
    if (ev.key === "Escape") closeMenu();
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", escape, true);
  openDropdown = { el, appId: app.appId, outside, escape };
}

/* -------------------------------------------- */
/*  Configuration dialog                        */
/* -------------------------------------------- */

async function openConfig() {
  const known = setting("known") ?? {};
  const keep = new Set(keepList());
  for (const k of DEFAULT_KEEP) if (!known[k]) known[k] = { label: k, icon: "" };
  const rows = Object.entries(known)
    .filter(([cls]) => cls !== MENU_CLASS)
    .sort((a, b) => L(a[1].label).localeCompare(L(b[1].label)))
    .map(([cls, info]) => `
      <label class="gatos-header-menu-row">
        <input type="checkbox" name="keep" value="${foundry.utils.escapeHTML(cls)}" ${keep.has(cls) ? "checked" : ""}>
        <i class="${foundry.utils.escapeHTML(info.icon || "fa-solid fa-circle")}"></i>
        <span class="label">${foundry.utils.escapeHTML(L(info.label) || cls)}</span>
        <code>${foundry.utils.escapeHTML(cls)}</code>
      </label>`).join("");
  const content = `
    <p class="hint">${L("GATOSHM.ConfigHint")}</p>
    <div class="gatos-header-menu-config-list">${rows}</div>
    <div class="form-group">
      <label>${L("GATOSHM.ConfigExtra")}</label>
      <input type="text" name="extra" value="${foundry.utils.escapeHTML([...keep].filter((k) => !known[k]).join(", "))}" placeholder="my-module-button">
    </div>`;
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: L("GATOSHM.ConfigTitle"), icon: "fa-solid fa-ellipsis-vertical" },
    classes: ["gatos-header-menu-config"],
    position: { width: 460 },
    content,
    ok: {
      label: L("GATOSHM.Save"),
      icon: "fa-solid fa-floppy-disk",
      callback: (_ev, button) => {
        const form = button.form;
        const checked = [...form.querySelectorAll("input[name=keep]:checked")].map((i) => i.value);
        const extra = (form.querySelector("input[name=extra]")?.value ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        return [...new Set([...checked, ...extra])];
      },
    },
    rejectClose: false,
  });
  if (!Array.isArray(result)) return;
  await game.settings.set(MODULE_ID, "keep", result.join(", "));
  rerenderOpenWindows();
}

/**
 * Apply a settings change to windows that are already open. AppV1 only builds the title bar in `_renderOuter`
 * (re-rendering replaces the inner content only), so the Foundry-made header buttons are rebuilt in place.
 * Buttons other modules injected into the DOM (Popout!, taskbar Tags, document id link) are left untouched.
 */
function rerenderOpenWindows() {
  for (const app of Object.values(ui.windows)) {
    if (!app.rendered || !app.element?.[0]) continue;
    if (!appliesTo(app) && !hiddenByApp.has(app.appId)) continue;
    hiddenByApp.delete(app.appId);
    try {
      refreshHeader(app);
    } catch (err) {
      console.warn(`${MODULE_ID} | could not refresh header of`, app, err);
    }
  }
}

function refreshHeader(app) {
  const header = app.element[0].querySelector(".window-header");
  if (!header) return;
  const all = app._getHeaderButtons();
  const buttons = appliesTo(app) ? condense(app, all) : all;
  const old = [...header.querySelectorAll(":scope > a.header-button.control")];
  if (!old.length) return;
  const anchor = old[0].previousElementSibling;
  for (const el of old) el.remove();

  const make = (b) => {
    const a = document.createElement("a");
    a.className = `header-button control ${b.class ?? ""}`;
    if (b.tooltip) a.dataset.tooltip = b.tooltip;
    a.innerHTML = `<i class="${b.icon ?? ""}"></i>`;
    a.append(document.createTextNode(b.label ? L(b.label) : ""));
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      b.onclick?.(ev);
    });
    return a;
  };
  let after = anchor;
  for (const b of buttons) {
    const el = make(b);
    if (String(b.class).split(/\s+/).includes("close")) {
      header.append(el); // Close always stays right-most
      continue;
    }
    if (after) after.after(el);
    else header.prepend(el);
    after = el;
  }
}

class HeaderMenuConfig extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: "gatos-header-menu-config-launcher", window: { title: "GATOSHM.ConfigTitle" } };
  render() {
    openConfig();
    return this;
  }
}

/* -------------------------------------------- */
/*  Wrapping                                    */
/* -------------------------------------------- */

function renderOuterWrapper(wrapped, ...args) {
  if (!appliesTo(this)) return wrapped(...args);
  const own = Object.prototype.hasOwnProperty.call(this, "_getHeaderButtons");
  const original = this._getHeaderButtons;
  const app = this;
  // `_renderOuter` reads the buttons synchronously before its first await, so an own-property shadow for the
  // duration of this call is enough and is removed again right after.
  this._getHeaderButtons = function (...a) {
    const buttons = original.apply(app, a);
    try {
      return condense(app, buttons);
    } catch (err) {
      console.error(`${MODULE_ID} | could not condense header buttons`, err);
      return buttons;
    }
  };
  try {
    return wrapped(...args);
  } finally {
    if (own) this._getHeaderButtons = original;
    else delete this._getHeaderButtons;
  }
}

function installWrapper() {
  const target = "foundry.appv1.api.Application.prototype._renderOuter";
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    libWrapper.register(MODULE_ID, target, renderOuterWrapper, "WRAPPER");
    return;
  }
  const proto = foundry.appv1?.api?.Application?.prototype ?? globalThis.Application?.prototype;
  const original = proto._renderOuter;
  proto._renderOuter = function (...args) {
    return renderOuterWrapper.call(this, original.bind(this), ...args);
  };
}

/* -------------------------------------------- */
/*  Init                                        */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `GATOSHM.Settings.${key}.Name`, hint: `GATOSHM.Settings.${key}.Hint`, config: true, ...data,
  });
  reg("enabled", { scope: "client", type: Boolean, default: true, onChange: rerenderOpenWindows });
  reg("scope", {
    scope: "world", type: String, default: "actorItem", onChange: rerenderOpenWindows,
    choices: {
      actor: "GATOSHM.Scope.actor",
      actorItem: "GATOSHM.Scope.actorItem",
      document: "GATOSHM.Scope.document",
      all: "GATOSHM.Scope.all",
    },
  });
  reg("keep", { scope: "world", type: String, default: DEFAULT_KEEP.join(", "), onChange: rerenderOpenWindows });
  reg("iconOnly", { scope: "client", type: Boolean, default: false, onChange: rerenderOpenWindows });
  reg("showMenuLabel", { scope: "client", type: Boolean, default: false, onChange: rerenderOpenWindows });
  reg("minHidden", { scope: "world", type: Number, default: 1, range: { min: 1, max: 5, step: 1 }, onChange: rerenderOpenWindows });
  game.settings.register(MODULE_ID, "known", { scope: "client", config: false, type: Object, default: {} });
  game.settings.registerMenu(MODULE_ID, "configure", {
    name: "GATOSHM.ConfigTitle", label: "GATOSHM.Configure", hint: "GATOSHM.ConfigMenuHint",
    icon: "fa-solid fa-sliders", type: HeaderMenuConfig, restricted: true,
  });
});

Hooks.once("setup", installWrapper);

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { openConfig, keepList, hiddenFor: (app) => hiddenByApp.get(app.appId) ?? [] };
});

Hooks.on("closeApplication", (app) => {
  hiddenByApp.delete(app.appId);
  if (openDropdown?.appId === app.appId) closeMenu();
});
