(function (window, document) {
  "use strict";

  var BeautyApp = window.BeautyApp || {};

  function ready(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }

    callback();
  }

  function getElement(target, root) {
    if (!target) return null;
    if (target instanceof Element || target === window || target === document) return target;

    var scope = root || document;
    if (typeof target === "string") {
      return scope.querySelector(target) || document.getElementById(target.replace(/^#/, ""));
    }

    return null;
  }

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function qsa(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function on(target, eventName, handler, options) {
    var element = getElement(target) || target;
    if (!element || !eventName || !handler) return function noop() {};

    element.addEventListener(eventName, handler, options || false);
    return function off() {
      element.removeEventListener(eventName, handler, options || false);
    };
  }

  function delegate(root, eventName, selector, handler) {
    var element = getElement(root) || document;
    if (!selector || !handler) return function noop() {};

    return on(element, eventName, function (event) {
      var target = event.target.closest(selector);
      if (!target || !element.contains(target)) return;
      handler.call(target, event, target);
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toNumber(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (value == null || value === "") return fallback || 0;

    var parsed = Number(String(value).replace(/[,%\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback || 0;
  }

  function formatNumber(value, options) {
    var config = options || {};
    var locale = config.locale || "zh-CN";
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: config.minimumFractionDigits || 0,
      maximumFractionDigits: config.maximumFractionDigits == null ? 0 : config.maximumFractionDigits
    }).format(value);
  }

  function formatCurrency(value, options) {
    var config = options || {};
    return new Intl.NumberFormat(config.locale || "zh-CN", {
      style: "currency",
      currency: config.currency || "CNY",
      maximumFractionDigits: config.maximumFractionDigits == null ? 0 : config.maximumFractionDigits
    }).format(value);
  }

  function formatPercent(value, options) {
    var config = options || {};
    return new Intl.NumberFormat(config.locale || "zh-CN", {
      style: "percent",
      maximumFractionDigits: config.maximumFractionDigits == null ? 0 : config.maximumFractionDigits
    }).format(value);
  }

  function rafTween(duration, onUpdate, onComplete) {
    var start = performance.now();
    var total = Math.max(0, duration || 0);

    function frame(now) {
      var progress = total === 0 ? 1 : clamp((now - start) / total, 0, 1);
      var eased = 1 - Math.pow(1 - progress, 3);

      onUpdate(eased, progress);

      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else if (typeof onComplete === "function") {
        onComplete();
      }
    }

    window.requestAnimationFrame(frame);
  }

  function animateNumber(element, targetNumber, duration) {
    var target = getElement(element);
    if (!target) return;

    var finalValue = toNumber(targetNumber, 0);
    var startValue = toNumber(target.dataset.currentValue || target.textContent, 0);
    var decimals = Number(target.dataset.decimals || 0);
    var prefix = target.dataset.prefix || "";
    var suffix = target.dataset.suffix || "";
    var useGrouping = target.dataset.grouping !== "false";

    target.dataset.currentValue = String(finalValue);

    rafTween(duration == null ? 800 : duration, function (eased) {
      var value = startValue + (finalValue - startValue) * eased;
      var rounded = Number(value.toFixed(decimals));
      var display = useGrouping
        ? formatNumber(rounded, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          })
        : rounded.toFixed(decimals);

      target.textContent = prefix + display + suffix;
    });
  }

  function resolveProgressFill(element) {
    var target = getElement(element);
    if (!target) return null;
    if (target.classList && target.classList.contains("progress-bar__fill")) return target;
    return target.querySelector(".progress-bar__fill") || target;
  }

  function animateProgress(element, targetPercent, duration) {
    var fill = resolveProgressFill(element);
    if (!fill) return;

    var percent = clamp(toNumber(targetPercent, 0), 0, 100);
    var start = toNumber(fill.dataset.currentPercent || fill.style.width || 0, 0);
    var owner = fill.closest(".progress-bar") || fill.parentElement;

    fill.dataset.currentPercent = String(percent);
    if (owner) {
      owner.setAttribute("role", owner.getAttribute("role") || "progressbar");
      owner.setAttribute("aria-valuemin", "0");
      owner.setAttribute("aria-valuemax", "100");
    }

    rafTween(duration == null ? 700 : duration, function (eased) {
      var value = start + (percent - start) * eased;
      fill.style.width = value.toFixed(2) + "%";
      fill.style.setProperty("--progress-value", value.toFixed(2) + "%");
      if (owner) owner.setAttribute("aria-valuenow", String(Math.round(value)));
    });
  }

  function setVHVariable() {
    document.documentElement.style.setProperty("--vh", window.innerHeight * 0.01 + "px");
  }

  function initAnimatedNumbers(root) {
    qsa("[data-animate-number]", root).forEach(function (element) {
      var target = element.dataset.animateNumber;
      var duration = toNumber(element.dataset.duration, 800);
      animateNumber(element, target, duration);
    });
  }

  function initProgressBars(root) {
    qsa("[data-progress]", root).forEach(function (element) {
      var duration = toNumber(element.dataset.duration, 700);
      animateProgress(element, element.dataset.progress, duration);
    });
  }

  function initApp(root) {
    setVHVariable();
    initAnimatedNumbers(root || document);
    initProgressBars(root || document);
    document.documentElement.classList.add("is-ready");
  }

  on(window, "resize", function () {
    setVHVariable();
  });

  BeautyApp.ready = ready;
  BeautyApp.getElement = getElement;
  BeautyApp.qs = qs;
  BeautyApp.qsa = qsa;
  BeautyApp.on = on;
  BeautyApp.delegate = delegate;
  BeautyApp.clamp = clamp;
  BeautyApp.toNumber = toNumber;
  BeautyApp.formatNumber = formatNumber;
  BeautyApp.formatCurrency = formatCurrency;
  BeautyApp.formatPercent = formatPercent;
  BeautyApp.animateNumber = animateNumber;
  BeautyApp.animateProgress = animateProgress;
  BeautyApp.initAnimatedNumbers = initAnimatedNumbers;
  BeautyApp.initProgressBars = initProgressBars;
  BeautyApp.initApp = initApp;

  window.BeautyApp = BeautyApp;
  window.animateNumber = animateNumber;
  window.animateProgress = animateProgress;

  ready(function () {
    initApp(document);
  });
})(window, document);
