const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const preferenceScript = fs.readFileSync(path.join(root, "toegankelijkheid.js"), "utf8");

test("all pages offer clearly labelled text-size and contrast preferences", () => {
  for (const page of ["index", "planten", "mijn-planten", "kalender", "plant", "herstel"]) {
    const html = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
    assert.match(html, /class="accessibility-toggle"[^>]*aria-label="Grotere tekst instellen"/, page);
    assert.match(html, /class="contrast-toggle"[^>]*aria-label="Hoog contrast instellen"/, page);
    assert.match(html, /<script src="toegankelijkheid\.js"><\/script>/, page);
  }
});

test("all pages provide a keyboard skip link to a focusable main area", () => {
  for (const page of ["index", "planten", "mijn-planten", "kalender", "plant", "herstel"]) {
    const html = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
    const skipLink = html.match(/<a class="skip-link" href="([^"]+)"/);
    assert.ok(skipLink, `${page} should have a skip link`);
    const mainId = skipLink[1].slice(skipLink[1].lastIndexOf("#") + 1);
    assert.match(html, new RegExp(`<main\\b(?=[^>]*\\bid="${mainId}")[^>]*\\btabindex="-1"`), page);
  }
});

test("the header separates notification settings from the notification center", () => {
  for (const page of ["index", "planten", "mijn-planten", "kalender", "plant"]) {
    const html = fs.readFileSync(path.join(root, `${page}.html`), "utf8");
    assert.match(html, /<a class="notification-button notification-settings-button" href="kalender\/#notification-settings" aria-label="Meldingsinstellingen openen"/, page);
    assert.match(html, /<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8/, page);
    assert.match(html, /class="notification-view-button" href="kalender\/#care-notifications" aria-label="Bekijk geplande meldingen"/, page);
    assert.match(html, /class="notification-view-label-full">Bekijk meldingen<\/span>/, page);
  }

  const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(home, /href="kalender\/#care-notifications">Bekijk meldingen<\/a>/);
  assert.match(home, /href="kalender\/#notification-settings">Meldingen instellen<\/a>/);

  const calendar = fs.readFileSync(path.join(root, "kalender.html"), "utf8");
  const center = calendar.match(/<section\b(?=[^>]*\bid="care-notifications")[\s\S]*?<\/section>/)?.[0];
  const settings = calendar.match(/<dialog\b(?=[^>]*\bid="notification-settings")[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(center, "calendar should provide a notification center");
  assert.match(center, /id="notification-list"/);
  assert.match(center, /href="#notification-settings"/);
  assert.ok(settings, "calendar should provide a notification settings dialog");
  assert.match(settings, /id="reminder-button"/);
  assert.match(settings, /id="push-reminder-time" type="time"/);
  assert.match(settings, /id="push-reminder-button"/);
  assert.match(settings, /id="push-test-admin"/);
  assert.match(settings, /id="push-test-button"/);
  assert.match(settings, /id="notification-settings-close"/);
  assert.match(settings, /id="notification-center-open" href="#care-notifications"/);
});

test("notification settings open from the URL and close back to the center", () => {
  const handlers = {};
  const windowHandlers = {};
  const opener = { isConnected: true, focused: false, focus() { this.focused = true; } };
  const settingsDialog = {
    open: false,
    addEventListener(name, callback) { handlers[name] = callback; },
    showModal() { this.open = true; },
    close() {
      this.open = false;
      handlers.close();
    }
  };
  const closeButton = { addEventListener(name, callback) { handlers.closeButton = callback; } };
  const iconCloseButton = { addEventListener(name, callback) { handlers.iconCloseButton = callback; } };
  const centerLink = { addEventListener(name, callback) { handlers.centerLink = callback; } };
  const context = {
    document: {
      activeElement: opener,
      querySelector(selector) {
        return {
          "#notification-settings": settingsDialog,
          ".notification-dialog-close": iconCloseButton,
          "#notification-settings-close": closeButton,
          "#notification-center-open": centerLink,
          "#push-reminder-button": null,
          "#push-reminder-disable": null,
          "#push-reminder-time": null,
          "#push-reminder-status": null
        }[selector] || null;
      }
    },
    window: {
      location: { hash: "#notification-settings", href: "https://example.test/kalender/#notification-settings" },
      history: { state: null, replaceState(_state, _title, url) { this.url = url; } },
      addEventListener(name, callback) { windowHandlers[name] = callback; }
    },
    URL,
    console
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, "push-notifications.js"), "utf8"), context);
  assert.equal(settingsDialog.open, true);

  handlers.iconCloseButton();
  assert.equal(settingsDialog.open, false);
  assert.equal(new URL(context.window.history.url).hash, "");

  context.window.location.hash = "#notification-settings";
  windowHandlers.hashchange();
  assert.equal(settingsDialog.open, true);

  handlers.keydown({ key: "Escape", preventDefault() {} });
  assert.equal(settingsDialog.open, false);
  assert.equal(new URL(context.window.history.url).hash, "");

  context.window.location.hash = "#notification-settings";
  windowHandlers.hashchange();
  assert.equal(settingsDialog.open, true);
  context.window.location.hash = "#care-notifications";
  windowHandlers.hashchange();
  assert.equal(settingsDialog.open, false);
  assert.equal(opener.focused, true);
});

test("text-size and contrast preferences are restored, announced, and saved independently", () => {
  const classes = new Set();
  const createButton = () => ({
    attributes: {},
    handlers: {},
    nodes: {
      label: { textContent: "" },
      indicator: { textContent: "" }
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    querySelector(selector) {
      return selector === ".accessibility-toggle-label" ? this.nodes.label : this.nodes.indicator;
    },
    addEventListener(name, callback) { this.handlers[name] = callback; }
  });
  const textButton = createButton();
  const contrastButton = createButton();
  const buttons = new Map([
    [".accessibility-toggle", textButton],
    [".contrast-toggle", contrastButton]
  ]);
  const values = new Map([
    ["growify-large-text", "true"],
    ["growify-high-contrast", "false"]
  ]);
  const context = {
    document: {
      documentElement: { classList: { toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      } } },
      querySelector: (selector) => buttons.get(selector)
    },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value)
    },
    console: { error() {} }
  };

  vm.runInNewContext(preferenceScript, context);
  assert.equal(classes.has("larger-text"), true);
  assert.equal(classes.has("high-contrast"), false);
  assert.equal(textButton.attributes["aria-pressed"], "true");
  assert.equal(textButton.attributes["aria-label"], "Normale tekst instellen");
  assert.equal(textButton.nodes.label.textContent, "Normale tekst");
  assert.equal(textButton.nodes.indicator.textContent, "A−");
  assert.equal(contrastButton.attributes["aria-pressed"], "false");
  assert.equal(contrastButton.attributes["aria-label"], "Hoog contrast instellen");
  assert.equal(contrastButton.nodes.label.textContent, "Hoog contrast");

  textButton.handlers.click();
  assert.equal(classes.has("larger-text"), false);
  assert.equal(textButton.attributes["aria-pressed"], "false");
  assert.equal(textButton.attributes["aria-label"], "Grotere tekst instellen");
  assert.equal(values.get("growify-large-text"), "false");

  contrastButton.handlers.click();
  assert.equal(classes.has("high-contrast"), true);
  assert.equal(contrastButton.attributes["aria-pressed"], "true");
  assert.equal(contrastButton.attributes["aria-label"], "Normaal contrast instellen");
  assert.equal(contrastButton.nodes.label.textContent, "Normaal contrast");
  assert.equal(values.get("growify-high-contrast"), "true");
});

test("mobile disclosure summaries explain how to expand and collapse content", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.equal((html.match(/class="disclosure-action"/g) || []).length, 3);
  assert.match(html, /class="disclosure-closed">Tonen<\/span>/);
  assert.match(html, /class="disclosure-open">Verbergen<\/span>/);
});
