(function () {
  const MAX_DOWNLOAD_SIZE_MB = 1.95;
  let picaInstance = null;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Не удалось загрузить изображение: ${src}`));
      image.src = src;
    });
  }

  async function loadImageFromSource(src) {
    if (!src) {
      throw new Error("Пустой путь к изображению.");
    }

    if (/^https?:\/\//i.test(src)) {
      const response = await fetch(src, { mode: "cors", cache: "force-cache" });
      if (!response.ok) {
        throw new Error(`Не удалось загрузить изображение: ${src}`);
      }
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      try {
        return await loadImage(blobUrl);
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      }
    }

    return loadImage(src);
  }

  function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Не удалось собрать изображение."));
      }, type, quality);
    });
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
      } else {
        lines.push(line);
        line = word;
      }
    });

    if (line) {
      lines.push(line);
    }

    return lines.length ? lines : [""];
  }

  function drawImageContain(ctx, image, x, y, width, height) {
    const imageRatio = image.width / image.height;
    const boxRatio = width / height;
    let drawWidth = width;
    let drawHeight = height;

    if (imageRatio > boxRatio) {
      drawHeight = width / imageRatio;
    } else {
      drawWidth = height * imageRatio;
    }

    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;
    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
  }

  function getPicaInstance() {
    if (!window.pica) {
      return null;
    }

    if (!picaInstance) {
      picaInstance = window.pica({
        features: ["js", "wasm", "ww"]
      });
    }

    return picaInstance;
  }

  async function maybeDownscaleCanvas(sourceCanvas, options = {}) {
    const targetMax = options.maxWidthOrHeight || 3200;
    const currentMax = Math.max(sourceCanvas.width, sourceCanvas.height);

    if (currentMax <= targetMax) {
      return sourceCanvas;
    }

    const ratio = targetMax / currentMax;
    const targetCanvas = document.createElement("canvas");
    targetCanvas.width = Math.round(sourceCanvas.width * ratio);
    targetCanvas.height = Math.round(sourceCanvas.height * ratio);

    const pica = getPicaInstance();
    if (pica) {
      await pica.resize(sourceCanvas, targetCanvas, {
        filter: "mks2013",
        unsharpAmount: 160,
        unsharpRadius: 0.6,
        unsharpThreshold: 1
      });
      return targetCanvas;
    }

    const ctx = targetCanvas.getContext("2d");
    ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
    return targetCanvas;
  }

  async function compressForWordPress(blob, fileName, options = {}) {
    if (!window.imageCompression) {
      return blob;
    }

    try {
      const compressed = await window.imageCompression(blob, {
        maxSizeMB: options.maxSizeMB || MAX_DOWNLOAD_SIZE_MB,
        maxWidthOrHeight: options.maxWidthOrHeight || 3200,
        useWebWorker: true,
        fileType: "image/webp",
        initialQuality: options.initialQuality || 0.95,
        preserveExif: false
      });

      return new File([compressed], `${fileName}.webp`, { type: "image/webp" });
    } catch (error) {
      console.warn("Сжатие не удалось, использую исходный blob.", error);
      return blob;
    }
  }

  function debounce(callback, delay = 180) {
    let timeoutId;
    return (...args) => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => callback(...args), delay);
    };
  }

  async function loadJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  async function loadBattlegroundsLibrary(options = {}) {
    const locale = options.locale || "ruRU";
    const includeEnglish = options.includeEnglish ? "&includeEnglish=1" : "";
    const apiUrl = `/api/battlegrounds-library?locale=${encodeURIComponent(locale)}${includeEnglish}`;

    try {
      const payload = await loadJson(apiUrl, {
        headers: { Accept: "application/json" }
      });
      if (Array.isArray(payload.cards) && payload.cards.length) {
        return payload;
      }
    } catch (error) {
      console.warn("Не удалось загрузить свежую библиотеку HearthstoneJSON, использую локальный файл.", error);
    }

    return loadJson(options.fallbackUrl || "/bg-legacy/bgs-library.json", { cache: "force-cache" });
  }

  async function exportCardSheet(items, options = {}) {
    const cards = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!cards.length) {
      throw new Error("Нет карт для экспорта.");
    }

    const showHeader = options.showHeader !== false;
    const showCardBackground = options.showCardBackground !== false;
    const background = options.background || "#07101f";
    const title = options.title || "Тир-лист Героев";
    const subtitle = options.subtitle || `${cards.length} карточек`;
    const fileBaseName = options.fileBaseName || "battlegrounds-export";
    const columns = Math.min(options.columns || 10, 10);
    const renderScale = options.renderScale || 1;
    const gap = Math.round((options.gap || 28) * renderScale);
    const baseCardWidth = options.cardWidth || 176;
    const cardWidth = Math.round(baseCardWidth * renderScale);
    const artHeight = Math.round((options.artHeight || Math.round(baseCardWidth * (options.artRatio || 1.38))) * renderScale);
    const showText = options.showText !== false;
    const showMeta = options.showMeta !== false;
    const textLines = options.textLines || 3;
    const footerHeight = Math.round((options.footerHeight || 28 + textLines * 22 + 18) * renderScale);
    const bodyHeight = showText || showMeta ? footerHeight : 0;
    const cardHeight = options.cardHeight || artHeight + bodyHeight + Math.round(24 * renderScale);
    const padding = Math.round((options.padding || 46) * renderScale);
    const headerHeight = showHeader ? Math.round((options.headerHeight || 180) * renderScale) : Math.round(24 * renderScale);
    const rows = Math.ceil(cards.length / columns);
    const canvas = document.createElement("canvas");

    canvas.width = padding * 2 + columns * cardWidth + (columns - 1) * gap;
    canvas.height = headerHeight + padding + rows * cardHeight + (rows - 1) * gap + padding;

    const ctx = canvas.getContext("2d");

    if (background !== "transparent") {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (showHeader) {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "rgba(219, 192, 122, 0.24)");
      gradient.addColorStop(0.45, "rgba(19, 32, 57, 0.14)");
      gradient.addColorStop(1, "rgba(121, 183, 255, 0.18)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(248, 241, 219, 0.92)";
      ctx.font = `700 ${Math.round(42 * renderScale)}px "BgDisplay", Georgia, serif`;
      ctx.fillText(title, padding, Math.round(74 * renderScale));

      ctx.fillStyle = "rgba(200, 210, 232, 0.9)";
      ctx.font = `500 ${Math.round(22 * renderScale)}px "Segoe UI", sans-serif`;
      ctx.fillText(subtitle, padding, Math.round(112 * renderScale));
    }

    for (const [index, card] of cards.entries()) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const x = padding + column * (cardWidth + gap);
      const y = headerHeight + row * (cardHeight + gap);

      if (card.empty) {
        continue;
      }

      const imageSource = card.exportImage || card.image || card.artUrl;
      const img = await loadImageFromSource(imageSource);

      if (showCardBackground) {
        ctx.save();
        roundedRect(ctx, x, y, cardWidth, cardHeight, Math.round(22 * renderScale));
        ctx.fillStyle = "rgba(13, 20, 35, 0.96)";
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      roundedRect(ctx, x, y, cardWidth, artHeight, Math.round(18 * renderScale));
      ctx.clip();
      drawImageContain(ctx, img, x, y, cardWidth, artHeight);
      ctx.restore();

      if (showText) {
        ctx.fillStyle = "rgba(248, 241, 219, 0.96)";
        ctx.font = `700 ${Math.round(20 * renderScale)}px "Segoe UI", sans-serif`;
        const lines = wrapText(ctx, card.name, cardWidth - Math.round(22 * renderScale)).slice(0, textLines);
        lines.forEach((line, lineIndex) => {
          ctx.fillText(
            line,
            x + Math.round(12 * renderScale),
            y + artHeight + Math.round(28 * renderScale) + lineIndex * Math.round(22 * renderScale)
          );
        });
      }

      const metaBits = [];
      if (card.meta) {
        metaBits.push(card.meta);
      }
      if (card.averagePlace) {
        metaBits.push(`Среднее ${card.averagePlace}`);
      }

      if (showMeta && metaBits.length) {
        ctx.fillStyle = "rgba(200, 210, 232, 0.88)";
        ctx.font = `500 ${Math.round(16 * renderScale)}px "Segoe UI", sans-serif`;
        ctx.fillText(
          metaBits.join(" • "),
          x + Math.round(12 * renderScale),
          y + cardHeight - Math.round(16 * renderScale)
        );
      }
    }

    const finalCanvas = await maybeDownscaleCanvas(canvas, {
      maxWidthOrHeight: options.maxWidthOrHeight
    });
    const outputType = options.outputType || "image/webp";
    const outputQuality = options.outputQuality || 0.97;
    const extension = outputType === "image/png" ? "png" : "webp";
    const rawBlob = await canvasToBlob(finalCanvas, outputType, outputQuality);
    const resultBlob = outputType === "image/webp" && options.compress !== false
      ? await compressForWordPress(rawBlob, fileBaseName, {
        maxSizeMB: options.maxSizeMB,
        maxWidthOrHeight: options.maxWidthOrHeight,
        initialQuality: options.initialQuality
      })
      : new File([rawBlob], `${fileBaseName}.${extension}`, { type: outputType });
    const blobUrl = URL.createObjectURL(resultBlob);
    const link = document.createElement("a");

    link.href = blobUrl;
    link.download = resultBlob.name || `${fileBaseName}.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 800);
    return resultBlob;
  }

  const HTML_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
  }

  function initSiteNav() {
    document.querySelectorAll("[data-nav-dropdown]").forEach((dropdown) => {
      const toggle = dropdown.querySelector(".nav-dropdown-toggle");
      if (!toggle) {
        return;
      }

      const close = () => {
        dropdown.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      };

      toggle.addEventListener("click", () => {
        const isOpen = dropdown.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
      });

      document.addEventListener("click", (event) => {
        if (event.target instanceof Node && !dropdown.contains(event.target)) {
          close();
        }
      });

      dropdown.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          close();
          toggle.focus();
        }
      });
    });

    document.querySelectorAll("[data-section-nav]").forEach((select) => {
      select.addEventListener("change", () => {
        if (select.value && select.value !== "current") {
          window.location.href = select.value;
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteNav);
  } else {
    initSiteNav();
  }

  window.Shared = {
    MAX_DOWNLOAD_SIZE_MB,
    loadImage,
    loadImageFromSource,
    roundedRect,
    debounce,
    loadJson,
    loadBattlegroundsLibrary,
    exportCardSheet,
    escapeHtml
  };
})();
