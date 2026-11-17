const soilCheckIntervals = {
  Monstera: 7,
  Basilicum: 3,
  Lavendel: 10,
  Sansevieria: 21,
  "Aloë vera": 21,
  Tomaat: 3,
  Rozemarijn: 10,
  Pannenkoekenplant: 7,
  Goudrank: 7,
  Lepelplant: 5,
  "ZZ-plant": 21,
  Graslelie: 7,
  Rubberplant: 10,
  Vioolbladplant: 7,
  "Klimmende philodendron": 7,
  Drakenbloedboom: 14,
  "Chinese evergreen": 10,
  Calathea: 5,
  Pachira: 7,
  Goudpalm: 7,
  Hoya: 14,
  Erwtenplant: 21,
  Tradescantia: 5,
  Kamerlinde: 7,
  Kwartjesplant: 10,
  Olifantspoot: 21,
  Geldboom: 21,
  Vlinderorchidee: 10,
  Varen: 4,
  Kroton: 7,
  Flamingoplant: 7,
  "Ficus benjamina": 7
};

const wateringActions = new Set(["Aarde gecontroleerd", "Water gegeven"]);
const pushServiceHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com"
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function plantLabel(id, species, savedPlants, profiles) {
  const profile = profiles[id];
  if (typeof profile?.customName === "string" && profile.customName.trim()) return profile.customName.trim();
  const duplicates = savedPlants.filter((savedId) => (profiles[savedId]?.species || savedId) === species);
  return duplicates.length > 1 ? `${species} ${duplicates.indexOf(id) + 1}` : species;
}

export function getDueWateringTasks(state, today) {
  if (!isRecord(state) || !Array.isArray(state.savedPlants)) return [];
  const profiles = isRecord(state.plantProfiles) ? state.plantProfiles : {};
  const overrides = isRecord(state.careOverrides) ? state.careOverrides : {};
  const tasks = [];

  for (const id of state.savedPlants) {
    if (typeof id !== "string") continue;
    const profile = isRecord(profiles[id]) ? profiles[id] : {};
    const species = typeof profile.species === "string" ? profile.species : id;
    const interval = profile.careIntervals?.watering ?? soilCheckIntervals[species];
    if (!Number.isInteger(interval) || interval < 1 || interval > 3650) continue;

    const log = Array.isArray(profile.careLog) ? profile.careLog : [];
    const dates = log
      .filter((entry) => isRecord(entry)
        && wateringActions.has(entry.action)
        && parseDate(entry.date)
        && entry.date <= today)
      .map((entry) => entry.date)
      .sort();
    const latest = dates.at(-1);
    if (!latest && !Object.hasOwn(overrides, `calendar-${id}-watering-onbekend`)) {
      tasks.push({
        taskId: `calendar-${id}-watering-onbekend`,
        plantName: plantLabel(id, species, state.savedPlants, profiles),
        title: "Controleer de aarde"
      });
      continue;
    }

    const dueDate = latest ? addDays(latest, interval) : null;
    const taskId = `calendar-${id}-watering-${latest ? dueDate : "onbekend"}`;
    const override = parseDate(overrides[taskId]);
    const plannedDate = override || dueDate;
    if (!plannedDate || plannedDate > today) continue;

    tasks.push({
      taskId,
      plantName: plantLabel(id, species, state.savedPlants, profiles),
      title: "Controleer de aarde"
    });
  }

  return tasks;
}

export function buildReminderPayload(tasks, date, includeGenericWhenEmpty = false) {
  if (!tasks.length) {
    if (!includeGenericWhenEmpty) return null;
    return {
      title: "Growify · tijd voor je planten",
      body: "Bekijk welke planten vandaag verzorging nodig hebben.",
      tag: `growify-care-${date}`,
      url: "kalender/"
    };
  }
  const plants = [...new Set(tasks.map((task) => task.plantName))];
  const names = plants.slice(0, 3).join(", ");
  const remaining = plants.length - 3;
  const plantSummary = `${names}${remaining > 0 ? ` en ${remaining} andere` : ""}`;
  const body = tasks.length === 1
    ? `${plants[0]}: ${tasks[0].title.toLowerCase()}.`
    : `Controleer de aarde van ${plantSummary}.`;
  return {
    title: "Growify · tijd voor je planten",
    body,
    tag: `growify-care-${date}`,
    url: "kalender/"
  };
}

export function isPushTestAdmin(userId, adminUserId) {
  return typeof userId === "string" && userId.length > 0 && userId === adminUserId;
}

export function getLocalDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour), minute: Number(values.minute) };
}

export function isWithinReminderWindow(date, timeZone, preferredTime, windowMinutes = 180) {
  if (typeof preferredTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime)) return false;
  const local = getLocalDateTime(date, timeZone);
  const [hour, minute] = preferredTime.split(":").map(Number);
  const elapsedMinutes = (local.hour * 60 + local.minute) - (hour * 60 + minute);
  return elapsedMinutes >= 0 && elapsedMinutes < windowMinutes;
}

export function isReminderCooldownActive(lastSentDate, localDate) {
  return lastSentDate === localDate;
}

export function isAllowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && pushServiceHosts.has(url.hostname);
  } catch {
    return false;
  }
}
