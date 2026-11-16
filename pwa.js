(() => {
  if (!("serviceWorker" in navigator)) return;

  const siteRoot = new URL("./", document.baseURI);
  const serviceWorkerUrl = new URL("service-worker.js", siteRoot);

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(serviceWorkerUrl, { scope: siteRoot.pathname })
      .catch((error) => console.error("De Growify-service worker kon niet worden gestart:", error));
  }, { once: true });
})();
