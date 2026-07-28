(function (window, document) {
  "use strict";

  var BeautyApp = window.BeautyApp || {};
  var activeModalStack = [];
  var activeDrawerStack = [];

  function ready(callback) {
    if (BeautyApp.ready) {
      BeautyApp.ready(callback);
      return;
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getElement(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (typeof target === "string") {
      return document.querySelector(target) || document.getElementById(target.replace(/^#/, ""));
    }
    return null;
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function getTabScope(trigger) {
    if (trigger.dataset.tabGroup) {
      return document.querySelector('[data-tabs="' + trigger.dataset.tabGroup + '"]') || document;
    }

    return trigger.closest("[data-tabs]") || document;
  }

  function activateTab(triggerOrName, scope) {
    var trigger = getElement(triggerOrName);
    var name = typeof triggerOrName === "string" && !trigger ? triggerOrName : null;
    var root = scope ? getElement(scope) || scope : null;

    if (!trigger && name) {
      root = root || document;
      trigger = root.querySelector('[data-tab-trigger="' + name + '"]');
    }

    if (!trigger) return;

    var tabName = trigger.dataset.tabTrigger;
    var container = root || getTabScope(trigger);
    var triggers = qsa("[data-tab-trigger]", container);
    var panels = qsa("[data-tab-panel]", container);

    triggers.forEach(function (item) {
      var isActive = item.dataset.tabTrigger === tabName;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-selected", isActive ? "true" : "false");
      item.setAttribute("tabindex", isActive ? "0" : "-1");
    });

    panels.forEach(function (panel) {
      var isActive = panel.dataset.tabPanel === tabName;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
      panel.setAttribute("aria-hidden", isActive ? "false" : "true");
    });

    trigger.dispatchEvent(
      new CustomEvent("tab:change", {
        bubbles: true,
        detail: { tab: tabName, trigger: trigger }
      })
    );
  }

  function initTabs(root) {
    var scope = root || document;
    var containers = qsa("[data-tabs]", scope);

    if (!containers.length && scope === document) {
      containers = [document];
    }

    containers.forEach(function (container) {
      var triggers = qsa("[data-tab-trigger]", container);
      var panels = qsa("[data-tab-panel]", container);
      if (!triggers.length || !panels.length) return;

      triggers.forEach(function (trigger) {
        trigger.setAttribute("role", trigger.getAttribute("role") || "tab");
      });

      panels.forEach(function (panel) {
        panel.setAttribute("role", panel.getAttribute("role") || "tabpanel");
      });

      var activeTrigger =
        triggers.find(function (trigger) {
          return trigger.classList.contains("is-active") || trigger.getAttribute("aria-selected") === "true";
        }) || triggers[0];

      activateTab(activeTrigger, container);
    });
  }

  function focusFirstInteractive(container) {
    var focusable = container.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );

    if (focusable) {
      window.setTimeout(function () {
        focusable.focus({ preventScroll: true });
      }, 80);
    }
  }

  function openModal(id) {
    var modal = getElement(id);
    if (!modal) return;

    modal.hidden = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    modal.setAttribute("role", modal.getAttribute("role") || "dialog");
    modal.setAttribute("aria-modal", "true");
    document.body.classList.add("is-modal-open");

    if (activeModalStack.indexOf(modal) === -1) {
      activeModalStack.push(modal);
    }

    focusFirstInteractive(modal);
    modal.dispatchEvent(new CustomEvent("modal:open", { bubbles: true, detail: { modal: modal } }));
  }

  function closeModal(id) {
    var modal = getElement(id) || activeModalStack[activeModalStack.length - 1];
    if (!modal) return;

    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    activeModalStack = activeModalStack.filter(function (item) {
      return item !== modal;
    });

    window.setTimeout(function () {
      if (!modal.classList.contains("is-open")) modal.hidden = true;
    }, 240);

    if (!activeModalStack.length) {
      document.body.classList.remove("is-modal-open");
    }

    modal.dispatchEvent(new CustomEvent("modal:close", { bubbles: true, detail: { modal: modal } }));
  }

  function openDrawer(id) {
    var drawer = getElement(id);
    if (!drawer) return;

    drawer.hidden = false;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-drawer-open");

    if (activeDrawerStack.indexOf(drawer) === -1) {
      activeDrawerStack.push(drawer);
    }

    focusFirstInteractive(drawer);
    drawer.dispatchEvent(new CustomEvent("drawer:open", { bubbles: true, detail: { drawer: drawer } }));
  }

  function closeDrawer(id) {
    var drawer = getElement(id) || activeDrawerStack[activeDrawerStack.length - 1];
    if (!drawer) return;

    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    activeDrawerStack = activeDrawerStack.filter(function (item) {
      return item !== drawer;
    });

    window.setTimeout(function () {
      if (!drawer.classList.contains("is-open")) drawer.hidden = true;
    }, 240);

    if (!activeDrawerStack.length) {
      document.body.classList.remove("is-drawer-open");
    }

    drawer.dispatchEvent(new CustomEvent("drawer:close", { bubbles: true, detail: { drawer: drawer } }));
  }

  function getToastContainer() {
    var container = document.querySelector(".toast-container");
    if (container) return container;

    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    container.setAttribute("aria-atomic", "true");
    document.body.appendChild(container);
    return container;
  }

  function getToastIcon(type) {
    if (type === "success") return "OK";
    if (type === "warning") return "!";
    if (type === "danger" || type === "error") return "!";
    return "i";
  }

  function showToast(message, type, duration) {
    var toastType = type || "info";
    if (toastType === "error") toastType = "danger";

    var toast = document.createElement("div");
    toast.className = "toast toast--" + toastType;
    toast.setAttribute("role", toastType === "danger" ? "alert" : "status");
    toast.innerHTML =
      '<span class="toast__icon" aria-hidden="true"></span>' +
      '<span class="toast__message"></span>';
    toast.querySelector(".toast__icon").textContent = getToastIcon(toastType);
    toast.querySelector(".toast__message").textContent = message || "";

    getToastContainer().appendChild(toast);

    window.requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });

    function removeToast() {
      toast.classList.remove("is-visible");
      window.setTimeout(function () {
        toast.remove();
      }, 240);
    }

    toast.addEventListener("click", removeToast, { once: true });
    window.setTimeout(removeToast, duration == null ? 2600 : duration);
    return toast;
  }

  function initComponentEvents() {
    document.addEventListener("click", function (event) {
      var tabTrigger = event.target.closest("[data-tab-trigger]");
      if (tabTrigger) {
        event.preventDefault();
        activateTab(tabTrigger);
        return;
      }

      var modalOpen = event.target.closest("[data-modal-open]");
      if (modalOpen) {
        event.preventDefault();
        openModal(modalOpen.dataset.modalOpen);
        return;
      }

      var modalClose = event.target.closest("[data-modal-close], .modal__backdrop");
      if (modalClose) {
        event.preventDefault();
        closeModal(modalClose.dataset.modalClose || modalClose.closest(".modal"));
        return;
      }

      var drawerOpen = event.target.closest("[data-drawer-open]");
      if (drawerOpen) {
        event.preventDefault();
        openDrawer(drawerOpen.dataset.drawerOpen);
        return;
      }

      var drawerClose = event.target.closest("[data-drawer-close], .drawer__backdrop");
      if (drawerClose) {
        event.preventDefault();
        closeDrawer(drawerClose.dataset.drawerClose || drawerClose.closest(".drawer"));
        return;
      }

      var toastTrigger = event.target.closest("[data-toast]");
      if (toastTrigger) {
        event.preventDefault();
        showToast(toastTrigger.dataset.toast, toastTrigger.dataset.toastType, Number(toastTrigger.dataset.toastDuration) || undefined);
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (activeModalStack.length) {
        closeModal();
        return;
      }
      if (activeDrawerStack.length) {
        closeDrawer();
      }
    });
  }

  BeautyApp.activateTab = activateTab;
  BeautyApp.initTabs = initTabs;
  BeautyApp.openModal = openModal;
  BeautyApp.closeModal = closeModal;
  BeautyApp.openDrawer = openDrawer;
  BeautyApp.closeDrawer = closeDrawer;
  BeautyApp.showToast = showToast;

  window.BeautyApp = BeautyApp;
  window.activateTab = activateTab;
  window.openModal = openModal;
  window.closeModal = closeModal;
  window.openDrawer = openDrawer;
  window.closeDrawer = closeDrawer;
  window.showToast = showToast;

  ready(function () {
    initTabs(document);
    initComponentEvents();
  });
})(window, document);
