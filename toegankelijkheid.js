(() => {
  const preferences = [
    {
      button: document.querySelector(".accessibility-toggle"),
      key: "growify-large-text",
      className: "larger-text",
      enabledLabel: "Normale tekst",
      disabledLabel: "Grotere tekst",
      enabledAriaLabel: "Normale tekst instellen",
      disabledAriaLabel: "Grotere tekst instellen",
      enabledIndicator: "A−",
      disabledIndicator: "A+"
    },
    {
      button: document.querySelector(".contrast-toggle"),
      key: "growify-high-contrast",
      className: "high-contrast",
      enabledLabel: "Normaal contrast",
      disabledLabel: "Hoog contrast",
      enabledAriaLabel: "Normaal contrast instellen",
      disabledAriaLabel: "Hoog contrast instellen",
      enabledIndicator: "HC",
      disabledIndicator: "HC"
    }
  ];

  for (const preference of preferences) {
    const { button } = preference;
    if (!button) continue;

    let enabled = false;
    try {
      enabled = localStorage.getItem(preference.key) === "true";
    } catch (error) {
      console.error("Toegankelijkheidsvoorkeur lezen mislukt:", error);
    }

    const applyPreference = () => {
      document.documentElement.classList.toggle(preference.className, enabled);
      button.setAttribute("aria-pressed", String(enabled));
      button.setAttribute("aria-label", enabled ? preference.enabledAriaLabel : preference.disabledAriaLabel);
      button.querySelector(".accessibility-toggle-label").textContent = enabled
        ? preference.enabledLabel
        : preference.disabledLabel;
      button.querySelector("[aria-hidden='true']").textContent = enabled
        ? preference.enabledIndicator
        : preference.disabledIndicator;
    };

    applyPreference();
    button.addEventListener("click", () => {
      enabled = !enabled;
      applyPreference();
      try {
        localStorage.setItem(preference.key, String(enabled));
      } catch (error) {
        console.error("Toegankelijkheidsvoorkeur opslaan mislukt:", error);
      }
    });
  }

  const menu = document.querySelector(".accessibility-menu");
  if (menu) {
    document.addEventListener?.("pointerdown", (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener?.("keydown", (event) => {
      if (event.key !== "Escape" || !menu.open) return;
      menu.open = false;
      menu.querySelector("summary").focus();
    });
  }
})();
