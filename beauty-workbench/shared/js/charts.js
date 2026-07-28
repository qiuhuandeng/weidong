(function (window, document) {
  "use strict";

  var BeautyCharts = window.BeautyCharts || {};

  function getCanvas(canvasId) {
    if (canvasId instanceof HTMLCanvasElement) return canvasId;
    if (typeof canvasId === "string") {
      return document.getElementById(canvasId.replace(/^#/, "")) || document.querySelector(canvasId);
    }
    return null;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toNumber(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback || 0;
  }

  function setupCanvas(canvas, width, height) {
    var dpr = window.devicePixelRatio || 1;
    var cssWidth = width || canvas.clientWidth || canvas.width || 300;
    var cssHeight = height || canvas.clientHeight || canvas.height || cssWidth;

    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    return {
      ctx: ctx,
      width: cssWidth,
      height: cssHeight
    };
  }

  function drawRingChart(canvasId, percent, color, size) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;

    var chartSize = size || canvas.clientWidth || canvas.width || 96;
    var chart = setupCanvas(canvas, chartSize, chartSize);
    var ctx = chart.ctx;
    var value = clamp(toNumber(percent, 0), 0, 100);
    var center = chartSize / 2;
    var lineWidth = Math.max(8, chartSize * 0.1);
    var radius = center - lineWidth / 2;
    var startAngle = -Math.PI / 2;
    var endAngle = startAngle + Math.PI * 2 * (value / 100);

    ctx.lineCap = "round";
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.strokeStyle = "#EEF0F4";
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = color || "#4F46E5";
    ctx.arc(center, center, radius, startAngle, endAngle);
    ctx.stroke();

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Progress " + Math.round(value) + "%");

    return {
      percent: value,
      color: color || "#4F46E5",
      size: chartSize
    };
  }

  function normalizeSeries(dataPoints) {
    if (!Array.isArray(dataPoints)) return [];

    return dataPoints
      .map(function (point, index) {
        if (typeof point === "number") {
          return { x: index, y: point, label: String(index + 1) };
        }

        return {
          x: point.x == null ? index : point.x,
          y: toNumber(point.y == null ? point.value : point.y, 0),
          label: point.label == null ? String(point.x == null ? index + 1 : point.x) : String(point.label)
        };
      })
      .filter(function (point) {
        return Number.isFinite(point.y);
      });
  }

  function getRange(values, preferredMin, preferredMax) {
    var min = preferredMin == null ? Math.min.apply(null, values) : preferredMin;
    var max = preferredMax == null ? Math.max.apply(null, values) : preferredMax;

    if (!Number.isFinite(min)) min = 0;
    if (!Number.isFinite(max)) max = 1;
    if (min === max) {
      min -= 1;
      max += 1;
    }

    return { min: min, max: max };
  }

  function drawGrid(ctx, width, height, padding, options) {
    if (options.grid === false) return;

    var lines = options.gridLines || 4;
    ctx.save();
    ctx.strokeStyle = options.gridColor || "#E5E7EB";
    ctx.lineWidth = 1;

    for (var i = 0; i <= lines; i += 1) {
      var y = padding.top + ((height - padding.top - padding.bottom) / lines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLineChart(canvasId, dataPoints, options) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;

    var config = options || {};
    var width = config.width || canvas.clientWidth || canvas.width || 320;
    var height = config.height || canvas.clientHeight || canvas.height || 160;
    var chart = setupCanvas(canvas, width, height);
    var ctx = chart.ctx;
    var data = normalizeSeries(dataPoints);
    var padding = Object.assign({ top: 18, right: 16, bottom: 24, left: 28 }, config.padding || {});

    if (!data.length) return null;

    var values = data.map(function (point) {
      return point.y;
    });
    var range = getRange(values, config.min, config.max);
    var innerWidth = width - padding.left - padding.right;
    var innerHeight = height - padding.top - padding.bottom;

    function xFor(index) {
      if (data.length === 1) return padding.left + innerWidth / 2;
      return padding.left + (innerWidth / (data.length - 1)) * index;
    }

    function yFor(value) {
      return padding.top + innerHeight - ((value - range.min) / (range.max - range.min)) * innerHeight;
    }

    drawGrid(ctx, width, height, padding, config);

    ctx.save();
    ctx.beginPath();
    data.forEach(function (point, index) {
      var x = xFor(index);
      var y = yFor(point.y);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else if (config.smooth !== false) {
        var previousX = xFor(index - 1);
        var previousY = yFor(data[index - 1].y);
        var controlX = previousX + (x - previousX) / 2;
        ctx.bezierCurveTo(controlX, previousY, controlX, y, x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.strokeStyle = config.color || "#4F46E5";
    ctx.lineWidth = config.lineWidth || 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    if (config.fill !== false) {
      ctx.lineTo(xFor(data.length - 1), padding.top + innerHeight);
      ctx.lineTo(xFor(0), padding.top + innerHeight);
      ctx.closePath();

      var gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + innerHeight);
      gradient.addColorStop(0, config.fillColor || "rgba(79, 70, 229, 0.18)");
      gradient.addColorStop(1, "rgba(79, 70, 229, 0)");
      ctx.fillStyle = gradient;
      ctx.fill();
    }
    ctx.restore();

    if (config.points !== false) {
      ctx.save();
      data.forEach(function (point, index) {
        ctx.beginPath();
        ctx.fillStyle = config.pointColor || "#FFFFFF";
        ctx.strokeStyle = config.color || "#4F46E5";
        ctx.lineWidth = 2;
        ctx.arc(xFor(index), yFor(point.y), config.pointRadius || 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", config.ariaLabel || "Line chart");

    return {
      data: data,
      min: range.min,
      max: range.max
    };
  }

  function drawBarChart(canvasId, dataPoints, options) {
    var canvas = getCanvas(canvasId);
    if (!canvas) return null;

    var config = options || {};
    var width = config.width || canvas.clientWidth || canvas.width || 320;
    var height = config.height || canvas.clientHeight || canvas.height || 160;
    var chart = setupCanvas(canvas, width, height);
    var ctx = chart.ctx;
    var data = normalizeSeries(dataPoints);
    var padding = Object.assign({ top: 18, right: 16, bottom: 24, left: 28 }, config.padding || {});

    if (!data.length) return null;

    var values = data.map(function (point) {
      return point.y;
    });
    var range = getRange(values.concat([0]), config.min, config.max);
    var innerWidth = width - padding.left - padding.right;
    var innerHeight = height - padding.top - padding.bottom;
    var gap = config.gap == null ? 8 : config.gap;
    var barWidth = Math.max(4, (innerWidth - gap * (data.length - 1)) / data.length);
    var zeroY = padding.top + innerHeight - ((0 - range.min) / (range.max - range.min)) * innerHeight;

    function yFor(value) {
      return padding.top + innerHeight - ((value - range.min) / (range.max - range.min)) * innerHeight;
    }

    drawGrid(ctx, width, height, padding, config);

    ctx.save();
    data.forEach(function (point, index) {
      var x = padding.left + index * (barWidth + gap);
      var y = yFor(point.y);
      var top = Math.min(y, zeroY);
      var barHeight = Math.max(2, Math.abs(zeroY - y));
      var radius = Math.min(config.radius == null ? 6 : config.radius, barWidth / 2, barHeight / 2);

      ctx.fillStyle = point.color || config.color || "#4F46E5";
      roundedRect(ctx, x, top, barWidth, barHeight, radius);
      ctx.fill();
    });
    ctx.restore();

    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", config.ariaLabel || "Bar chart");

    return {
      data: data,
      min: range.min,
      max: range.max
    };
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    var r = Math.max(0, radius || 0);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  BeautyCharts.drawRingChart = drawRingChart;
  BeautyCharts.drawLineChart = drawLineChart;
  BeautyCharts.drawBarChart = drawBarChart;

  window.BeautyCharts = BeautyCharts;
  window.drawRingChart = drawRingChart;
  window.drawLineChart = drawLineChart;
  window.drawBarChart = drawBarChart;
})(window, document);
