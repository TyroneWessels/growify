(() => {
  const enableButton = document.querySelector("#push-reminder-button");
  const disableButton = document.querySelector("#push-reminder-disable");
  const timeInput = document.querySelector("#push-reminder-time");
  const status = document.querySelector("#push-reminder-status");
  const adminPanel = document.querySelector("#push-test-admin");
  const testButton = document.querySelector("#push-test-button");
  const testStatus = document.querySelector("#push-test-status");
  if (!enableButton || !disableButton || !timeInput || !status) return;

  function setSubscriptionState(isSubscribed) {
    enableButton.textContent = isSubscribed ? "Tijd opslaan" : "Dagelijkse melding aanzetten";
    disableButton.hidden = !isSubscribed;
  }

  function supportsPush() {
    return window.isSecureContext
      && "serviceWorker" in navigator
      && "PushManager" in window
      && "Notification" in window;
  }

  function isIosHomeScreenApp() {
    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = navigator.standalone === true
      || window.matchMedia("(display-mode: standalone)").matches;
    return !isIos || isStandalone;
  }

  function decodeApplicationServerKey(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  }

  function getCurrentTimeZone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam";
  }

  function getPreferredTime() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeInput.value)) {
      throw new Error("Kies een geldig tijdstip voor de dagelijkse melding.");
    }
    return timeInput.value;
  }

  async function getActiveSubscription() {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  }

  async function refreshSettings() {
    if (!supportsPush()) {
      status.textContent = "Deze browser ondersteunt geen pushmeldingen via Growify.";
      enableButton.disabled = true;
      return;
    }
    const subscription = await getActiveSubscription();
    setSubscriptionState(Boolean(subscription));
    if (!subscription) return;

    const user = await window.SproutlyAccount.getUser();
    if (!user) {
      status.textContent = "Log in om je pushmelding aan je Growify-account te koppelen.";
      return;
    }
    const settings = await window.SproutlyAccount.getPushSubscription(subscription.endpoint);
    if (settings?.preferred_time) timeInput.value = settings.preferred_time.slice(0, 5);
    status.textContent = `Je dagelijkse telefoonmelding staat aan${settings?.preferred_time ? ` om ${settings.preferred_time.slice(0, 5)}` : ""}.`;
  }

  async function refreshAdminPanel() {
    if (!adminPanel || !testButton || !testStatus || !supportsPush()) return;
    adminPanel.hidden = true;
    const user = await window.SproutlyAccount.getUser();
    if (!user) return;

    const result = await window.SproutlyAccount.checkPushTestAdmin();
    if (result.authorized !== true) return;

    adminPanel.hidden = false;
    const subscription = await getActiveSubscription();
    testButton.disabled = !subscription;
    testStatus.textContent = subscription
      ? "Testmelding gaat alleen naar dit apparaat en verandert het dagelijkse schema niet."
      : "Zet eerst de dagelijkse melding aan op dit apparaat om een test te sturen.";
  }

  testButton?.addEventListener("click", async () => {
    testButton.disabled = true;
    testStatus.textContent = "Testmelding wordt verstuurd…";
    try {
      const subscription = await getActiveSubscription();
      if (!subscription) throw new Error("Er is geen pushabonnement op dit apparaat. Zet eerst de dagelijkse melding aan.");
      await window.SproutlyAccount.sendPushTestNotification(subscription.endpoint);
      testStatus.textContent = "Testmelding verstuurd. Controleer de meldingen op dit apparaat.";
    } catch (error) {
      console.error("Testmelding versturen is mislukt:", error);
      testStatus.textContent = error.message || "De testmelding kon niet worden verstuurd.";
    } finally {
      testButton.disabled = false;
    }
  });

  enableButton.addEventListener("click", async () => {
    enableButton.disabled = true;
    disableButton.disabled = true;
    try {
      if (!supportsPush()) throw new Error("Pushmeldingen zijn alleen beschikbaar via HTTPS in een ondersteunde browser.");
      if (!isIosHomeScreenApp()) {
        throw new Error("Voeg Growify eerst via Safari toe aan je beginscherm. Open daarna de app vanaf het beginscherm om meldingen aan te zetten.");
      }

      const user = await window.SproutlyAccount.getUser();
      if (!user) throw new Error("Log eerst in op je Growify-account. Pushherinneringen werken voor ingelogde gebruikers.");

      const publicKey = window.GROWIFY_VAPID_PUBLIC_KEY;
      if (!publicKey || publicKey === "PASTE_YOUR_VAPID_PUBLIC_KEY_HERE") {
        throw new Error("De openbare push-sleutel is nog niet ingesteld in push-config.js.");
      }
      const preferredTime = getPreferredTime();
      let permission = Notification.permission;
      if (permission === "default") permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Meldingen zijn niet toegestaan. Geef Growify toestemming in de browserinstellingen.");

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeApplicationServerKey(publicKey)
        });
      }
      await window.SproutlyAccount.savePushSubscription(subscription, getCurrentTimeZone(), preferredTime);
      setSubscriptionState(true);
      status.textContent = `Je ontvangt dagelijks rond ${preferredTime} een telefoonmelding als er nog planten aandacht nodig hebben.`;
    } catch (error) {
      console.error("Dagelijkse pushmelding instellen is mislukt:", error);
      status.textContent = error.message || "De pushmelding kon niet worden ingesteld. Probeer het later opnieuw.";
    } finally {
      enableButton.disabled = false;
      disableButton.disabled = false;
    }
  });

  disableButton.addEventListener("click", async () => {
    disableButton.disabled = true;
    enableButton.disabled = true;
    try {
      const subscription = await getActiveSubscription();
      if (!subscription) {
        setSubscriptionState(false);
        status.textContent = "Er staat geen pushmelding aan op dit apparaat.";
        return;
      }
      await window.SproutlyAccount.deletePushSubscription(subscription.endpoint);
      const removed = await subscription.unsubscribe();
      if (!removed) throw new Error("De browser kon het pushabonnement niet verwijderen. Probeer het opnieuw.");
      setSubscriptionState(false);
      status.textContent = "De dagelijkse telefoonmelding is uitgezet.";
    } catch (error) {
      console.error("Dagelijkse pushmelding uitzetten is mislukt:", error);
      status.textContent = error.message || "De pushmelding kon niet worden uitgezet. Probeer het later opnieuw.";
    } finally {
      disableButton.disabled = false;
      enableButton.disabled = false;
    }
  });

  window.addEventListener("load", () => {
    refreshSettings().catch((error) => {
      console.error("Instellingen voor pushmeldingen konden niet worden geladen:", error);
      status.textContent = "De instellingen voor telefoonmeldingen konden niet worden geladen.";
    });
    refreshAdminPanel().catch((error) => {
      console.error("Beheerderscontrole voor pushmeldingen is mislukt:", error);
      status.textContent = "Het beheer van testmeldingen kon niet worden gecontroleerd.";
    });
  }, { once: true });
  window.addEventListener("sproutly-auth-change", () => {
    refreshAdminPanel().catch((error) => {
      console.error("Beheerderscontrole voor pushmeldingen is mislukt:", error);
      status.textContent = "Het beheer van testmeldingen kon niet worden gecontroleerd.";
    });
  });
})();
