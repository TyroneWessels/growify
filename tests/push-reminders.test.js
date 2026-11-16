const test = require("node:test");
const assert = require("node:assert/strict");

let reminderLogic;
test.before(async () => {
  reminderLogic = await import("../supabase/functions/_shared/reminder-logic.mjs");
});

test("daily reminders include only due soil checks and use the scheduled label", () => {
  const state = {
    savedPlants: ["Monstera", "Basilicum", "Lavendel"],
    plantProfiles: {
      Monstera: { careLog: [{ date: "2026-11-09", action: "Aarde gecontroleerd" }] },
      Basilicum: { careLog: [{ date: "2026-11-15", action: "Water gegeven" }] },
      Lavendel: { careLog: [{ date: "2026-11-06", action: "Aarde gecontroleerd" }], customName: "Buitenplant" }
    },
    careOverrides: {}
  };

  assert.deepEqual(reminderLogic.getDueWateringTasks(state, "2026-11-16"), [
    { taskId: "calendar-Monstera-watering-2026-11-16", plantName: "Monstera", title: "Controleer de aarde" },
    { taskId: "calendar-Lavendel-watering-2026-11-16", plantName: "Buitenplant", title: "Controleer de aarde" }
  ]);
});

test("first check is due today, custom intervals and postponements are respected", () => {
  const state = {
    savedPlants: ["Goudrank", "plant-1"],
    plantProfiles: {
      "plant-1": {
        species: "Monstera",
        careIntervals: { watering: 30 },
        careLog: [{ date: "2026-10-01", action: "Water gegeven" }]
      }
    },
    careOverrides: { "calendar-plant-1-watering-2026-10-31": "2026-11-20" }
  };
  assert.deepEqual(reminderLogic.getDueWateringTasks(state, "2026-11-16").map((task) => task.plantName), ["Goudrank"]);
});

test("reminders run at or shortly after the user's local preferred time", () => {
  const before = new Date("2026-11-16T16:59:00Z");
  const onTime = new Date("2026-11-16T17:17:00Z");
  const late = new Date("2026-11-16T20:01:00Z");
  assert.equal(reminderLogic.isWithinReminderWindow(before, "Europe/Amsterdam", "18:00"), false);
  assert.equal(reminderLogic.isWithinReminderWindow(onTime, "Europe/Amsterdam", "18:00"), true);
  assert.equal(reminderLogic.isWithinReminderWindow(late, "Europe/Amsterdam", "18:00"), false);
  assert.deepEqual(reminderLogic.getLocalDateTime(onTime, "Europe/Amsterdam"), { date: "2026-11-16", hour: 18, minute: 17 });
});

test("push payload summarizes plant tasks and opens the care calendar", () => {
  const payload = reminderLogic.buildReminderPayload([
    { plantName: "Monstera", title: "Controleer de aarde" },
    { plantName: "Basilicum", title: "Controleer de aarde" }
  ], "2026-11-16");
  assert.equal(payload.body, "Controleer de aarde van Monstera, Basilicum.");
  assert.equal(payload.tag, "growify-care-2026-11-16");
  assert.equal(payload.url, "kalender/");
  assert.equal(reminderLogic.buildReminderPayload([], "2026-11-16"), null);
  assert.deepEqual(reminderLogic.buildReminderPayload([], "2026-11-16", true), {
    title: "Growify · tijd voor je planten",
    body: "Bekijk welke planten vandaag verzorging nodig hebben.",
    tag: "growify-care-2026-11-16",
    url: "kalender/"
  });
});

test("admin access is restricted to the configured account", () => {
  assert.equal(reminderLogic.isPushTestAdmin("admin-user-id", "admin-user-id"), true);
  assert.equal(reminderLogic.isPushTestAdmin("other-user-id", "admin-user-id"), false);
  assert.equal(reminderLogic.isPushTestAdmin("", "admin-user-id"), false);
});

test("only known browser push-service hosts can receive server requests", () => {
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/subscription"), true);
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://web.push.apple.com/subscription"), true);
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/subscription"), true);
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://127.0.0.1/admin"), false);
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://fcm.googleapis.com.attacker.test/"), false);
  assert.equal(reminderLogic.isAllowedPushEndpoint("https://user@fcm.googleapis.com/"), false);
});
