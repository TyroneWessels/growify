const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "plantencollectie.js"), "utf8"), context);
const plants = context.window.SPROUTLY_PLANTS;

test("the catalog includes familiar garden flowers, herbs, fruit and vegetables", () => {
  const addedNames = [
    "Hortensia", "Roos", "Aardbei", "Munt", "Peterselie", "Zonnebloem", "Tulp", "Komkommer",
    "Courgette", "Wortel", "Sla", "Aardappel", "Doperwt", "Paprika", "Blauwe bes", "Framboos", "Appelboom"
  ];
  const names = plants.map((plant) => plant.name);
  assert.equal(new Set(names).size, names.length);

  for (const name of addedNames) {
    const plant = plants.find((item) => item.name === name);
    assert.ok(plant, `${name} is in the catalog`);
    assert.ok(plant.aliases.length, `${name} has searchable aliases`);
    assert.equal(plant.filter, "outdoor", `${name} appears in the outdoor filter`);
    assert.ok(plant.imageSource.includes("commons.wikimedia.org/wiki/File:"), `${name} photo attribution`);
    assert.ok(Number.isInteger(plant.soilCheckDays) && plant.soilCheckDays > 0, `${name} care interval`);

    const imagePath = path.join(root, plant.image);
    assert.ok(fs.existsSync(imagePath), `${name} photo exists`);
    assert.equal(fs.readFileSync(imagePath).subarray(0, 2).toString("hex"), "ffd8", `${name} photo is JPEG`);
  }
});

test("the spider plant photo source is identified as Chlorophytum comosum", () => {
  const spiderPlant = plants.find((plant) => plant.name === "Graslelie");
  assert.ok(spiderPlant);
  assert.match(spiderPlant.imageSource, /Chlorophytum_comosum_in_China\.jpg$/);
});
