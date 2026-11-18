const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const pageSource = fs.readFileSync(path.join(root, "pagina.js"), "utf8");
const instancesSource = fs.readFileSync(path.join(root, "plant-instances.js"), "utf8");

function createElement() {
  return {
    hidden: false,
    checked: false,
    disabled: false,
    textContent: "",
    className: "",
    type: "",
    dataset: {},
    handlers: {},
    children: [],
    classList: { add() {}, remove() {} },
    addEventListener(type, handler) { this.handlers[type] = handler; },
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; },
    focus() {},
    querySelectorAll(selector) {
      if (selector === ".plant-photo") return [];
      if (selector !== "[data-remove-plant]") return [];
      if (this.removeButtonMarkup !== this.innerHTML) {
        this.removeButtonMarkup = this.innerHTML;
        this.removeButtons = [...this.innerHTML.matchAll(/data-remove-plant="([^"]+)"/g)].map(([, id]) => {
          const button = createElement();
          button.dataset.removePlant = id;
          return button;
        });
      }
      return this.removeButtons;
    }
  };
}

async function loadPage(initialState) {
  const selectors = [
    "#nav-count", "#saved-plants-grid", "#saved-empty", "#favorites-filter",
    "#favorites-empty", "#show-all-plants", "#page-toast"
  ];
  const elements = new Map(selectors.map((selector) => [selector, createElement()]));
  const storage = new Map([
    ["sproutly-plants", JSON.stringify(initialState.savedPlants)],
    ["sproutly-profiles", JSON.stringify(initialState.plantProfiles)],
    ["sproutly-tasks", JSON.stringify(initialState.completedTasks)],
    ["sproutly-care-overrides", JSON.stringify(initialState.careOverrides)]
  ]);
  const plant = {
    name: "Monstera", category: "Binnenplant", scientific: "Monstera deliciosa",
    art: "art-monstera", light: "Licht", difficulty: "easy", image: "plant.jpg",
    imageSource: "bron"
  };
  const context = {
    window: {
      SPROUTLY_PLANTS: [plant],
      SPROUTLY_DEFAULT_SAVED_PLANTS: [],
      confirm: () => true,
      SproutlyAccount: { async getUser() { return null; } }
    },
    document: {
      querySelector: (selector) => elements.get(selector) || null,
      querySelectorAll: () => [],
      createElement
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    confirm: () => true,
    console,
    structuredClone,
    setTimeout: () => 1,
    clearTimeout() {}
  };
  vm.runInNewContext(instancesSource, context);
  vm.runInNewContext(pageSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, storage };
}

test("undoing removal restores the plant profile, care tasks and overrides", async () => {
  const id = "plant-monstera";
  const taskId = `calendar-${id}-watering`;
  const initialState = {
    savedPlants: [id, "Monstera"],
    plantProfiles: {
      [id]: {
        species: "Monstera", customName: "Monty", photo: "data:image/png;base64,abc",
        careLog: [{ id: "log-1", date: "2026-11-10", action: "Water gegeven" }],
        careIntervals: { watering: 8 }
      },
      Monstera: { species: "Monstera", customName: "Andere monstera" }
    },
    completedTasks: [taskId, "unrelated-task"],
    careOverrides: { [taskId]: "2026-11-20", "unrelated-task": "2026-11-18" }
  };
  const { elements, storage } = await loadPage(initialState);
  const grid = elements.get("#saved-plants-grid");
  const deleteButton = grid.querySelectorAll("[data-remove-plant]")[0];

  assert.equal(typeof deleteButton.handlers.click, "function", grid.innerHTML);
  await deleteButton.handlers.click();
  assert.deepEqual(JSON.parse(storage.get("sproutly-plants")), ["Monstera"]);
  assert.equal(JSON.parse(storage.get("sproutly-profiles"))[id], undefined);
  assert.deepEqual(JSON.parse(storage.get("sproutly-tasks")), ["unrelated-task"]);
  assert.deepEqual(JSON.parse(storage.get("sproutly-care-overrides")), { "unrelated-task": "2026-11-18" });

  const undoButton = elements.get("#page-toast").children.find((child) => child.textContent === "Ongedaan maken");
  assert.ok(undoButton, "the removal toast should offer undo");
  await undoButton.handlers.click();

  assert.deepEqual(JSON.parse(storage.get("sproutly-plants")), [id, "Monstera"]);
  assert.deepEqual(JSON.parse(storage.get("sproutly-profiles"))[id], initialState.plantProfiles[id]);
  assert.deepEqual(JSON.parse(storage.get("sproutly-tasks")).sort(), [...initialState.completedTasks].sort());
  assert.deepEqual(JSON.parse(storage.get("sproutly-care-overrides")), initialState.careOverrides);
});
