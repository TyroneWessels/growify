const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const collectionSource = fs.readFileSync(path.join(root, "plantencollectie.js"), "utf8");

const context = { window: {} };
vm.runInNewContext(collectionSource, context);

test("all plant collections render cards through the shared template", () => {
  for (const file of ["script.js", "catalogus.js", "pagina.js"]) {
    assert.match(fs.readFileSync(path.join(root, file), "utf8"), /window\.renderPlantCard/);
  }
});

test("the shared plant card renders optional data without empty image or source controls", () => {
  const markup = context.window.renderPlantCard({
    name: "Klimmende philodendron met lange naam",
    category: "Hangplant",
    scientific: "Philodendron hederaceum",
    light: "Indirect licht"
  }, { image: "", href: "plant/?naam=philodendron" });

  assert.match(markup, /plant-art-placeholder/);
  assert.match(markup, /plant-art-placeholder-icon/);
  assert.match(markup, /plant-tag">Hangplant<\/span>/);
  assert.match(markup, /plant-feature">Indirect licht<\/span>/);
  assert.doesNotMatch(markup, /class="plant-photo"/);
  assert.doesNotMatch(markup, /class="image-credit"/);
  assert.doesNotMatch(markup, /class="plant-feature"><\/span>/);
  assert.match(markup, />Bekijk verzorging <span aria-hidden="true">→<\/span><\/a>/);
});

test("plants without registered photos still load and render a placeholder", () => {
  const source = collectionSource.replace(
    "window.SPROUTLY_PLANTS.forEach((plant) => {",
    'window.SPROUTLY_PLANTS.push({ name: "Plant zonder foto", scientific: "Geen foto bekend", category: "Tuinplant" });\nwindow.SPROUTLY_PLANTS.forEach((plant) => {'
  );
  const missingPhotoContext = { window: {} };
  vm.runInNewContext(source, missingPhotoContext);
  const plant = missingPhotoContext.window.SPROUTLY_PLANTS.find((item) => item.name === "Plant zonder foto");
  const markup = missingPhotoContext.window.renderPlantCard(plant);

  assert.equal(plant.image, undefined);
  assert.equal(plant.imageSource, undefined);
  assert.match(markup, /plant-art-placeholder/);
  assert.doesNotMatch(markup, /class="image-credit"/);
});

test("the shared plant card keeps all plant values dynamic and escapes user-visible text", () => {
  const markup = context.window.renderPlantCard({
    name: "Rosa <test>",
    category: "Buitenplant",
    scientific: "Rosa test",
    difficulty: "hard",
    image: "assets/plants/roos.jpg",
    imageSource: "https://example.test/license"
  }, {
    displayName: "Roos <balkon>",
    href: "plant/?naam=roos",
    action: { attribute: "data-save", value: "Rosa <test>", label: "Voeg Rosa toe" }
  });

  assert.match(markup, /Roos &lt;balkon&gt;/);
  assert.match(markup, /Rosa &lt;test&gt;/);
  assert.match(markup, /plant-feature">Uitdagend<\/span>/);
  assert.match(markup, /aria-label="Voeg Rosa toe"/);
  assert.match(markup, /class="image-credit"/);
  assert.doesNotMatch(markup, /Monstera/);
});

test("a failed plant photo is replaced with the shared illustration placeholder", () => {
  const classes = new Set();
  let placeholderMarkup = "";
  const image = {
    closest: () => ({
      classList: { add: (className) => classes.add(className) },
      insertAdjacentHTML: (_position, markup) => { placeholderMarkup = markup; }
    }),
    remove() { this.removed = true; }
  };

  context.window.handlePlantImageError({ currentTarget: image });

  assert.equal(image.removed, true);
  assert.equal(classes.has("plant-art-placeholder"), true);
  assert.match(placeholderMarkup, /plant-art-placeholder-icon/);
  assert.match(placeholderMarkup, /<svg/);
});
