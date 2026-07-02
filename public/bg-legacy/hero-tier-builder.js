(function () {
  const TIER_ORDER = ["S", "A", "B", "C", "D"];
  const UNASSIGNED_KEY = "POOL";

  const raceNames = {
    NONE: "Нейтральные",
    ALL: "Все типы",
    BEAST: "Звери",
    DEMON: "Демоны",
    DRAGON: "Драконы",
    ELEMENTAL: "Элементали",
    MECHANICAL: "Механизмы",
    MURLOC: "Мурлоки",
    NAGA: "Наги",
    PIRATE: "Пираты",
    QUILBOAR: "Свинобразы",
    UNDEAD: "Нежить"
  };

  const tierLabels = {
    S: "Лучшее ядро",
    A: "Сильный тир",
    B: "Рабочий вариант",
    C: "Ситуативно",
    D: "Слабый тир"
  };

  const BACKGROUND_STORAGE_KEY = "hero-tier-builder-background-mode-v1";
  const COLUMNS_STORAGE_KEY = "hero-tier-builder-library-columns-v1";
  const BACKGROUND_OPTIONS = [
    { value: "transparent", label: "Без фона", url: null },
    { value: "wallpaper", label: "Фон 1", url: "/bg-legacy/wallpaper.webp" },
    { value: "wallpaper1", label: "Фон 2", url: "/bg-legacy/wallpaper1.webp" },
    { value: "wallpaper2", label: "Фон 3", url: "/bg-legacy/wallpaper2.webp" },
    { value: "wallpaper3", label: "Фон 4", url: "/bg-legacy/wallpaper3.webp" }
  ];
  const BACKGROUND_VALUES = new Set(BACKGROUND_OPTIONS.map((option) => option.value));
  const wallpaperImageCache = new Map();

  function getBackgroundUrl(mode) {
    const entry = BACKGROUND_OPTIONS.find((option) => option.value === mode);
    return entry ? entry.url : null;
  }

  function loadBackgroundMode() {
    try {
      const value = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
      return BACKGROUND_VALUES.has(value) ? value : "transparent";
    } catch (error) {
      return "transparent";
    }
  }

  function loadLibraryColumns() {
    try {
      const value = Number(window.localStorage.getItem(COLUMNS_STORAGE_KEY));
      if (Number.isFinite(value)) {
        return Math.min(5, Math.max(2, Math.round(value)));
      }
    } catch (error) {
      // localStorage may be unavailable in privacy modes.
    }
    return 3;
  }

  const state = {
    cards: [],
    cardsById: new Map(),
    placements: {},
    search: "",
    source: "ALL",
    race: "ALL",
    level: "ALL",
    accessorySize: "ALL",
    draggingCardId: null,
    backgroundMode: loadBackgroundMode(),
    libraryColumns: loadLibraryColumns()
  };

  const rowsRoot = document.getElementById("tier-builder-rows");
  const poolRoot = document.getElementById("tier-builder-pool");
  const searchInput = document.getElementById("tier-builder-search");
  const backgroundPickerEl = document.getElementById("tier-builder-background-picker");
  const downloadAllPngButton = document.getElementById("tier-builder-download-all-png");
  const downloadAllWebpButton = document.getElementById("tier-builder-download-all-webp");
  const sourceFiltersEl = document.getElementById("tier-builder-source-filters");
  const raceFiltersEl = document.getElementById("tier-builder-race-filters");
  const levelFiltersEl = document.getElementById("tier-builder-level-filters");
  const accessoryFiltersEl = document.getElementById("tier-builder-accessory-filters");
  const raceBlockEl = document.getElementById("tier-builder-race-block");
  const levelBlockEl = document.getElementById("tier-builder-level-block");
  const accessoryBlockEl = document.getElementById("tier-builder-accessory-block");
  const resetButton = document.getElementById("tier-builder-reset");
  const unassignedButton = document.getElementById("tier-builder-unassigned");
  const summary = document.getElementById("tier-builder-summary");
  const counter = document.getElementById("tier-builder-counter");
  const columnsInput = document.getElementById("tier-builder-library-columns");
  const columnsValueEl = document.getElementById("tier-builder-library-columns-value");

  const raceIcons = {
    ALL: "/bg-legacy/assset/общее.webp",
    NONE: "/bg-legacy/assset/общее.webp",
    BEAST: "/bg-legacy/assset/зверь.webp",
    DEMON: "/bg-legacy/assset/демоны.webp",
    DRAGON: "/bg-legacy/assset/драконы.webp",
    ELEMENTAL: "/bg-legacy/assset/элементали.webp",
    MECHANICAL: "/bg-legacy/assset/механизмы.webp",
    MURLOC: "/bg-legacy/assset/мурлоки.webp",
    NAGA: "/bg-legacy/assset/наги.webp",
    PIRATE: "/bg-legacy/assset/пираты.webp",
    QUILBOAR: "/bg-legacy/assset/свинобразы.webp",
    UNDEAD: "/bg-legacy/assset/нежить.webp"
  };

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "");
  }

  function stripHtml(value) {
    const tmp = document.createElement("div");
    tmp.innerHTML = value || "";
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function normalizeAssetUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
    return `/bg-legacy/${raw.replace(/^\.\//, "")}`;
  }

  function getCardArtUrl(card, size = "256x") {
    if (card?.source === "SPELL" || card?.source === "HERO" || card?.source === "ACCESSORY") {
      return normalizeAssetUrl(card?.image || card?.artUrl || card?.cropImage || "");
    }

    if (!card?.id) {
      return normalizeAssetUrl(card?.artUrl || "");
    }

    return normalizeAssetUrl(card?.artUrl) || `/api/card-art?id=${encodeURIComponent(card.id)}&locale=ruRU&size=${encodeURIComponent(size)}`;
  }

  function getEnglishNameFromImagePath(imagePath) {
    const raw = String(imagePath || "").trim();
    if (!raw) return "";
    const filename = raw.split("/").pop() || raw;
    const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, "");
    try {
      return decodeURIComponent(withoutExtension).replace(/\s+/g, " ").trim();
    } catch (error) {
      return withoutExtension.replace(/\s+/g, " ").trim();
    }
  }

  function normalizeHeroCard(hero, tier) {
    return {
      id: `hero-${slugify(hero.name)}`,
      name: hero.name,
      englishName: getEnglishNameFromImagePath(hero.image),
      text: "",
      techLevel: 0,
      races: [],
      manaCost: 0,
      source: "HERO",
      image: normalizeAssetUrl(hero.image),
      heroTier: tier
    };
  }

  function normalizeMinionCard(card) {
    return {
      id: String(card.id),
      name: card.name,
      englishName: card.englishName || "",
      slug: card.slug || "",
      text: card.text || "",
      techLevel: card.techLevel || 0,
      races: card.races || [],
      manaCost: 0,
      source: "MINION",
      artUrl: card.artUrl || ""
    };
  }

  function normalizeSpellCard(card) {
    return {
      id: `spell-${card.id}`,
      name: card.name,
      englishName: card.englishName || "",
      slug: card.slug || "",
      text: stripHtml(card.text || ""),
      techLevel: card.tier || 0,
      races: [],
      manaCost: card.manaCost ?? 0,
      source: "SPELL",
      image: normalizeAssetUrl(card.image || card.cropImage || card.artUrl || "")
    };
  }

  function normalizeAccessoryCard(card) {
    return {
      id: card.id,
      name: card.name,
      text: "",
      techLevel: 0,
      races: [],
      manaCost: 0,
      source: "ACCESSORY",
      image: normalizeAssetUrl(card.image || ""),
      accessorySize: card.size || "SMALL"
    };
  }

  function getHeroCards() {
    return (window.tierData || []).flatMap((tierEntry) => (
      (tierEntry.heroes || []).map((hero) => normalizeHeroCard(hero, tierEntry.tier))
    ));
  }

  async function loadOptionalJson(url, label) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`Не удалось загрузить ${label}.`, error);
      return { cards: [] };
    }
  }

  function createInitialPlacements(cards) {
    const placements = { [UNASSIGNED_KEY]: cards.map((card) => card.id) };
    TIER_ORDER.forEach((tier) => {
      placements[tier] = [];
    });
    return placements;
  }

  function getCardSearchText(card) {
    return [
      card.name,
      card.englishName,
      card.slug,
      card.text,
      card.source === "SPELL" ? "заклинание spell" : "",
      card.source === "MINION" ? "существо minion" : "",
      card.source === "HERO" ? "герой hero" : "",
      card.source === "ACCESSORY" ? "аксессуар accessory trinket" : "",
      card.accessorySize === "SMALL" ? "малый small" : "",
      card.accessorySize === "LARGE" ? "большой large" : "",
      (card.races || []).join(" "),
      `таверна ${card.techLevel || ""}`,
      `мана ${card.manaCost || ""}`
    ].join(" ");
  }

  function matchesFilters(card) {
    const searchOk = !state.search || normalize(getCardSearchText(card)).includes(normalize(state.search));
    const sourceOk = state.source === "ALL"
      ? card.source !== "HERO"
      : card.source === state.source;

    const raceOk = state.race === "ALL"
      ? true
      : state.source !== "ALL" && state.source !== "MINION"
        ? true
        : card.source !== "MINION"
          ? false
          : ((card.races && card.races.length) ? card.races : ["NONE"]).includes(state.race);

    const levelOk = state.level === "ALL"
      ? true
      : card.source === "HERO" || card.source === "ACCESSORY"
        ? true
        : String(card.techLevel || "") === state.level;

    const accessoryOk = state.accessorySize === "ALL"
      ? true
      : card.source !== "ACCESSORY"
        ? true
        : card.accessorySize === state.accessorySize;

    return searchOk && sourceOk && raceOk && levelOk && accessoryOk;
  }

  function syncAccessorySizeFilter() {
    const enabled = state.source === "ACCESSORY";
    if (accessoryBlockEl) {
      accessoryBlockEl.hidden = !enabled;
    }
    if (!enabled && state.accessorySize !== "ALL") {
      state.accessorySize = "ALL";
    }
    if (raceBlockEl) {
      const showRace = state.source === "ALL" || state.source === "MINION";
      raceBlockEl.hidden = !showRace;
      if (!showRace && state.race !== "ALL") {
        state.race = "ALL";
      }
    }
    if (levelBlockEl) {
      const showLevel = state.source !== "HERO" && state.source !== "ACCESSORY";
      levelBlockEl.hidden = !showLevel;
      if (!showLevel && state.level !== "ALL") {
        state.level = "ALL";
      }
    }
  }

  function createFilterChip(label, isActive, onClick, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${isActive ? " is-active" : ""}`;
    if (options.icon) {
      button.style.setProperty("--chip-icon", `url("${options.icon}")`);
      button.classList.add("chip-with-icon");
    }
    button.innerHTML = `
      ${options.icon ? '<span class="chip-icon" aria-hidden="true"></span>' : ""}
      <span class="chip-label">${label}</span>
    `;
    button.addEventListener("click", onClick);
    return button;
  }

  const sourceOptions = [
    { value: "ALL", label: "Все карты" },
    { value: "MINION", label: "Существа" },
    { value: "SPELL", label: "Заклинания" },
    { value: "ACCESSORY", label: "Аксессуары" },
    { value: "HERO", label: "Герои" }
  ];

  const raceOrder = ["ALL", "NONE", "BEAST", "DEMON", "DRAGON", "ELEMENTAL", "MECHANICAL", "MURLOC", "NAGA", "PIRATE", "QUILBOAR", "UNDEAD"];

  function renderSourceFilters() {
    if (!sourceFiltersEl) return;
    sourceFiltersEl.replaceChildren();
    sourceOptions.forEach((option) => {
      sourceFiltersEl.append(createFilterChip(option.label, state.source === option.value, () => {
        state.source = option.value;
        syncAccessorySizeFilter();
        renderSourceFilters();
        renderRaceFilters();
        renderLevelFilters();
        renderAccessoryFilters();
        render();
      }));
    });
  }

  function renderRaceFilters() {
    if (!raceFiltersEl) return;
    raceFiltersEl.replaceChildren();
    raceOrder.forEach((race) => {
      raceFiltersEl.append(createFilterChip(raceNames[race] || race, state.race === race, () => {
        state.race = race;
        renderRaceFilters();
        render();
      }, { icon: raceIcons[race] }));
    });
  }

  function renderLevelFilters() {
    if (!levelFiltersEl) return;
    levelFiltersEl.replaceChildren();
    const levels = [{ value: "ALL", label: "Все уровни" }, ...["1", "2", "3", "4", "5", "6", "7"].map((level) => ({
      value: level,
      label: `Таверна ${level}`,
      icon: `/bg-legacy/assset/tier${level}.png`
    }))];
    levels.forEach((item) => {
      levelFiltersEl.append(createFilterChip(item.label, state.level === item.value, () => {
        state.level = item.value;
        renderLevelFilters();
        render();
      }, { icon: item.icon }));
    });
  }

  function renderAccessoryFilters() {
    if (!accessoryFiltersEl) return;
    accessoryFiltersEl.replaceChildren();
    const options = [
      { value: "ALL", label: "Все аксессуары" },
      { value: "SMALL", label: "Только малые" },
      { value: "LARGE", label: "Только большие" }
    ];
    options.forEach((option) => {
      accessoryFiltersEl.append(createFilterChip(option.label, state.accessorySize === option.value, () => {
        state.accessorySize = option.value;
        renderAccessoryFilters();
        render();
      }));
    });
  }

  function getSourceLabel(card) {
    if (card.source === "SPELL") {
      return "Заклинание";
    }
    if (card.source === "HERO") {
      return "Герой";
    }
    if (card.source === "ACCESSORY") {
      return card.accessorySize === "LARGE" ? "Большой аксессуар" : "Малый аксессуар";
    }
    return raceNames[(card.races || [])[0]] || "Существо";
  }

  function getCardMeta(card) {
    if (card.source === "HERO") {
      return card.heroTier ? `${card.heroTier}-тир героев` : "Герой";
    }
    if (card.source === "SPELL") {
      return `Таверна ${card.techLevel || "?"} • Мана ${card.manaCost ?? 0}`;
    }
    if (card.source === "ACCESSORY") {
      return card.accessorySize === "LARGE" ? "Большой аксессуар" : "Малый аксессуар";
    }
    return `Таверна ${card.techLevel || "?"} • ${raceNames[(card.races || [])[0]] || "Нейтральные"}`;
  }

  function getBucketForCard(cardId) {
    return [UNASSIGNED_KEY, ...TIER_ORDER].find((bucket) => state.placements[bucket].includes(cardId)) || UNASSIGNED_KEY;
  }

  function removeCardFromBuckets(cardId) {
    [UNASSIGNED_KEY, ...TIER_ORDER].forEach((bucket) => {
      state.placements[bucket] = state.placements[bucket].filter((id) => id !== cardId);
    });
  }

  function moveCard(cardId, targetBucket) {
    if (!targetBucket || !state.placements[targetBucket]) {
      return;
    }

    removeCardFromBuckets(cardId);
    state.placements[targetBucket].push(cardId);
    render();
  }

  function reorderCard(cardId, direction) {
    const bucket = getBucketForCard(cardId);
    const ids = [...state.placements[bucket]];
    const index = ids.indexOf(cardId);

    if (index === -1) {
      return;
    }

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) {
      return;
    }

    ids.splice(index, 1);
    ids.splice(targetIndex, 0, cardId);
    state.placements[bucket] = ids;
    render();
  }

  function createCardElement(cardId) {
    const card = state.cardsById.get(cardId);
    const bucket = getBucketForCard(cardId);
    const element = document.createElement("article");
    element.className = "tier-builder-card";
    element.draggable = true;
    element.dataset.cardId = cardId;
    element.title = `${card.name} — ${getSourceLabel(card)} — ${getCardMeta(card)}`;
    element.innerHTML = `
      <div class="tier-builder-card-media">
        <img src="${getCardArtUrl(card, "256x")}" alt="${window.Shared.escapeHtml(card.name)}" loading="lazy" decoding="async">
      </div>
      <div class="tier-builder-card-actions">
        <button class="tier-builder-card-button" type="button" data-action="prev" aria-label="Сдвинуть раньше">←</button>
        <button class="tier-builder-card-button" type="button" data-action="next" aria-label="Сдвинуть позже">→</button>
        <button class="tier-builder-card-button" type="button" data-action="pool" aria-label="Вернуть в пул">×</button>
      </div>
    `;

    element.addEventListener("dragstart", (event) => {
      state.draggingCardId = cardId;
      element.classList.add("is-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", cardId);
    });

    element.addEventListener("dragend", () => {
      state.draggingCardId = null;
      element.classList.remove("is-dragging");
      document.querySelectorAll(".tier-builder-row").forEach((row) => row.classList.remove("is-over"));
    });

    element.querySelector('[data-action="prev"]').addEventListener("click", () => reorderCard(cardId, -1));
    element.querySelector('[data-action="next"]').addEventListener("click", () => reorderCard(cardId, 1));
    const poolButton = element.querySelector('[data-action="pool"]');

    if (bucket === UNASSIGNED_KEY) {
      poolButton.textContent = "+";
      poolButton.setAttribute("aria-label", "Отправить в S-тир");
      poolButton.addEventListener("click", () => moveCard(cardId, "S"));
    } else {
      poolButton.addEventListener("click", () => moveCard(cardId, UNASSIGNED_KEY));
    }

    return element;
  }

  function buildDropzone(bucket) {
    const zone = document.createElement("div");
    zone.className = "tier-builder-dropzone";
    zone.dataset.tier = bucket;

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      zone.closest(".tier-builder-row")?.classList.add("is-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.closest(".tier-builder-row")?.classList.remove("is-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.closest(".tier-builder-row")?.classList.remove("is-over");
      const cardId = event.dataTransfer.getData("text/plain") || state.draggingCardId;
      if (!cardId) {
        return;
      }

      moveCard(cardId, bucket);
    });

    return zone;
  }

  async function exportTier(tier, fileType = "png") {
    const cards = state.placements[tier].map((id) => state.cardsById.get(id)).filter(Boolean);
    if (!cards.length) {
      return;
    }

    const EXPORT_WIDTH = 2400;
    const SIDE_PADDING = 48;
    const TOP_PADDING = 36;
    const BOTTOM_PADDING = 36;
    const COLUMN_GAP = 20;
    const ROW_GAP = 24;
    const COLUMNS = Math.min(cards.length, 6);

    const loaded = await Promise.all(cards.map(async (card) => {
      try {
        const image = await window.Shared.loadImageFromSource(getCardArtUrl(card, "512x"));
        return { card, image };
      } catch (error) {
        console.warn(`Не удалось загрузить карту ${card.name}:`, error);
        return null;
      }
    }));
    const entries = loaded.filter(Boolean);
    if (!entries.length) return;

    const cardWidth = (EXPORT_WIDTH - SIDE_PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
    const rows = Math.ceil(entries.length / COLUMNS);
    const rowEntries = [];
    for (let r = 0; r < rows; r += 1) {
      rowEntries.push(entries.slice(r * COLUMNS, (r + 1) * COLUMNS));
    }
    const rowHeights = rowEntries.map((row) => (
      Math.max(...row.map(({ image }) => cardWidth * (image.height / image.width)))
    ));
    const totalHeight = TOP_PADDING
      + rowHeights.reduce((sum, h) => sum + h, 0)
      + Math.max(0, rows - 1) * ROW_GAP
      + BOTTOM_PADDING;

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = Math.ceil(totalHeight);
    const ctx = canvas.getContext("2d");

    if (state.backgroundMode !== "transparent") {
      await drawWallpaperBackground(ctx, canvas.width, canvas.height);
    }

    let cursorY = TOP_PADDING;
    rowEntries.forEach((row, rowIndex) => {
      const rowMaxHeight = rowHeights[rowIndex];
      row.forEach(({ image }, colIndex) => {
        const imageRatio = image.width / image.height;
        const cardHeight = cardWidth / imageRatio;
        const x = SIDE_PADDING + colIndex * (cardWidth + COLUMN_GAP);
        const y = cursorY + (rowMaxHeight - cardHeight) / 2;
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
      });
      cursorY += rowMaxHeight + ROW_GAP;
    });

    const mime = fileType === "webp" ? "image/webp" : "image/png";
    const quality = fileType === "webp" ? 0.98 : 1;
    const extension = fileType === "webp" ? "webp" : "png";
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Не удалось собрать тир.")), mime, quality);
    });
    triggerDownload(blob, `tier-${tier.toLowerCase()}.${extension}`);
  }

  async function drawWallpaperBackground(ctx, width, height) {
    const url = getBackgroundUrl(state.backgroundMode);
    if (!url) return;
    try {
      let wallpaper = wallpaperImageCache.get(url);
      if (!wallpaper) {
        wallpaper = await window.Shared.loadImageFromSource(url);
        wallpaperImageCache.set(url, wallpaper);
      }
      const blur = 14;
      const bleed = blur * 4;
      const targetW = width + bleed * 2;
      const targetH = height + bleed * 2;
      const wallpaperRatio = wallpaper.width / wallpaper.height;
      const targetRatio = targetW / targetH;
      let drawW;
      let drawH;
      if (wallpaperRatio > targetRatio) {
        drawH = targetH;
        drawW = drawH * wallpaperRatio;
      } else {
        drawW = targetW;
        drawH = drawW / wallpaperRatio;
      }
      const drawX = -bleed + (targetW - drawW) / 2;
      const drawY = -bleed + (targetH - drawH) / 2;
      ctx.save();
      ctx.filter = `blur(${blur}px) brightness(0.45)`;
      ctx.drawImage(wallpaper, drawX, drawY, drawW, drawH);
      ctx.restore();
      ctx.fillStyle = "rgba(4, 8, 16, 0.35)";
      ctx.fillRect(0, 0, width, height);
    } catch (error) {
      console.warn("Не удалось отрисовать игровой фон:", error);
    }
  }

  function triggerDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  async function exportAllTiers(fileType = "png") {
    const EXPORT_WIDTH = 2400;
    const SIDE_PADDING = 48;
    const OUTER_TOP = 36;
    const OUTER_BOTTOM = 36;
    const COLUMN_GAP = 20;
    const INNER_ROW_GAP = 16;
    const TIER_GAP = 36;
    const LABEL_HEIGHT = 80;

    const tierSections = [];
    for (const tier of TIER_ORDER) {
      const cards = state.placements[tier].map((id) => state.cardsById.get(id)).filter(Boolean);
      if (!cards.length) continue;
      const loaded = await Promise.all(cards.map(async (card) => {
        try {
          const image = await window.Shared.loadImageFromSource(getCardArtUrl(card, "512x"));
          return { card, image };
        } catch (error) {
          console.warn(`Не удалось загрузить карту ${card.name}:`, error);
          return null;
        }
      }));
      const entries = loaded.filter(Boolean);
      if (entries.length) {
        tierSections.push({ tier, entries });
      }
    }
    if (!tierSections.length) return;

    const COLUMNS = Math.min(6, Math.max(...tierSections.map((section) => Math.min(section.entries.length, 6))));
    const cardWidth = (EXPORT_WIDTH - SIDE_PADDING * 2 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;

    const sectionLayouts = tierSections.map(({ tier, entries }) => {
      const rows = Math.ceil(entries.length / COLUMNS);
      const rowEntries = [];
      for (let r = 0; r < rows; r += 1) {
        rowEntries.push(entries.slice(r * COLUMNS, (r + 1) * COLUMNS));
      }
      const rowHeights = rowEntries.map((row) => (
        Math.max(...row.map(({ image }) => cardWidth * (image.height / image.width)))
      ));
      const contentHeight = rowHeights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows - 1) * INNER_ROW_GAP;
      return { tier, rowEntries, rowHeights, contentHeight };
    });

    const totalHeight = OUTER_TOP
      + sectionLayouts.reduce((sum, section) => sum + LABEL_HEIGHT + section.contentHeight, 0)
      + Math.max(0, sectionLayouts.length - 1) * TIER_GAP
      + OUTER_BOTTOM;

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = Math.ceil(totalHeight);
    const ctx = canvas.getContext("2d");

    if (state.backgroundMode !== "transparent") {
      await drawWallpaperBackground(ctx, canvas.width, canvas.height);
    }

    let cursorY = OUTER_TOP;
    sectionLayouts.forEach((section, sectionIndex) => {
      ctx.save();
      ctx.fillStyle = "rgba(240, 215, 154, 0.95)";
      ctx.font = `700 56px "BgDisplay", Georgia, serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(`${section.tier} · ${tierLabels[section.tier] || ""}`, SIDE_PADDING, cursorY + LABEL_HEIGHT / 2);
      ctx.restore();
      cursorY += LABEL_HEIGHT;

      section.rowEntries.forEach((row, rowIndex) => {
        const rowMaxHeight = section.rowHeights[rowIndex];
        row.forEach(({ image }, colIndex) => {
          const imageRatio = image.width / image.height;
          const cardHeight = cardWidth / imageRatio;
          const x = SIDE_PADDING + colIndex * (cardWidth + COLUMN_GAP);
          const y = cursorY + (rowMaxHeight - cardHeight) / 2;
          ctx.drawImage(image, x, y, cardWidth, cardHeight);
        });
        cursorY += rowMaxHeight + (rowIndex < section.rowEntries.length - 1 ? INNER_ROW_GAP : 0);
      });

      if (sectionIndex < sectionLayouts.length - 1) {
        cursorY += TIER_GAP;
      }
    });

    const mime = fileType === "webp" ? "image/webp" : "image/png";
    const quality = fileType === "webp" ? 0.98 : 1;
    const extension = fileType === "webp" ? "webp" : "png";
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Не удалось собрать тир-лист.")), mime, quality);
    });
    triggerDownload(blob, `tier-list.${extension}`);
  }

  function renderPool() {
    poolRoot.innerHTML = "";

    const cards = state.placements[UNASSIGNED_KEY]
      .map((id) => state.cardsById.get(id))
      .filter((card) => matchesFilters(card));

    if (!cards.length) {
      const empty = document.createElement("p");
      empty.className = "tier-builder-empty";
      empty.textContent = "В пуле нет карт по текущим фильтрам.";
      poolRoot.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    cards.forEach((card) => {
      fragment.append(createCardElement(card.id));
    });
    poolRoot.append(fragment);
  }

  function applyLibraryColumns() {
    if (poolRoot) {
      poolRoot.style.setProperty("--tier-pool-columns", String(state.libraryColumns));
    }
    if (columnsInput) {
      columnsInput.value = String(state.libraryColumns);
    }
    if (columnsValueEl) {
      columnsValueEl.textContent = String(state.libraryColumns);
    }
  }

  function renderRows() {
    rowsRoot.innerHTML = "";
    const rowsFragment = document.createDocumentFragment();

    TIER_ORDER.forEach((tier) => {
      const row = document.createElement("section");
      row.className = "tier-builder-row";
      row.innerHTML = `
        <div class="tier-builder-row-head">
          <div class="tier-meta">
            <span class="tier-builder-badge">${tier}</span>
            <div>
              <h3 class="tier-title">${tierLabels[tier]}</h3>
              <p class="tier-builder-count">${state.placements[tier].length} карт</p>
            </div>
          </div>
          <div class="tier-builder-row-actions">
            <button class="secondary-button tier-builder-export" type="button" data-export="png">PNG</button>
            <button class="secondary-button tier-builder-export-webp" type="button" data-export="webp">WebP</button>
          </div>
        </div>
      `;

      const zone = buildDropzone(tier);
      const cards = state.placements[tier]
        .map((id) => state.cardsById.get(id))
        .filter(Boolean);

      if (!cards.length) {
        const empty = document.createElement("p");
        empty.className = "tier-builder-empty";
        empty.textContent = "Перетащи сюда карты из пула слева.";
        zone.append(empty);
      } else {
        const zoneFragment = document.createDocumentFragment();
        cards.forEach((card) => zoneFragment.append(createCardElement(card.id)));
        zone.append(zoneFragment);
      }

      row.append(zone);
      row.querySelector('[data-export="png"]').addEventListener("click", () => exportTier(tier, "png"));
      row.querySelector('[data-export="webp"]').addEventListener("click", () => exportTier(tier, "webp"));
      rowsFragment.append(row);
    });
    rowsRoot.append(rowsFragment);
  }

  function render() {
    renderPool();
    renderRows();

    const assignedCount = TIER_ORDER.reduce((sum, tier) => sum + state.placements[tier].length, 0);
    const visiblePoolCount = state.placements[UNASSIGNED_KEY]
      .map((id) => state.cardsById.get(id))
      .filter((card) => matchesFilters(card))
      .length;

    counter.textContent = `${assignedCount} карт распределено`;
    summary.textContent = `В пуле ${visiblePoolCount} карт по текущим фильтрам. Всего распределено ${assignedCount}.`;
  }

  async function bootstrap() {
    try {
      const [libraryPayload, spellsPayload, englishNamesPayload] = await Promise.all([
        window.Shared.loadBattlegroundsLibrary({ locale: "ruRU", includeEnglish: true }),
        loadOptionalJson("/api/battlegrounds-spells?locale=ru_RU&pageSize=200", "заклинания"),
        loadOptionalJson("/api/battlegrounds-card-names?locale=en_US", "английские названия")
      ]);

      const englishByKey = new Map();
      (englishNamesPayload.cards || []).forEach((card) => {
        if (card?.id != null) englishByKey.set(String(card.id), card);
        if (card?.slug) englishByKey.set(`slug:${String(card.slug)}`, card);
      });
      const resolveEnglish = (localCard) => (
        englishByKey.get(String(localCard.dbfId))
        || englishByKey.get(String(localCard.id))
        || (localCard.slug ? englishByKey.get(`slug:${String(localCard.slug)}`) : null)
        || null
      );

      const heroes = getHeroCards();
      const minions = Array.isArray(libraryPayload.cards)
        ? libraryPayload.cards.map((card) => {
          const english = resolveEnglish(card);
          return normalizeMinionCard({
            ...card,
            englishName: english?.name || card.englishName || "",
            slug: english?.slug || ""
          });
        })
        : [];
      const spells = Array.isArray(spellsPayload.cards)
        ? spellsPayload.cards.map((card) => {
          const english = resolveEnglish(card);
          return normalizeSpellCard({
            ...card,
            englishName: english?.name || "",
            slug: english?.slug || ""
          });
        })
        : [];
      const accessoriesPayload = window.accessoriesData || {};
      const accessories = [...(accessoriesPayload.small || []), ...(accessoriesPayload.large || [])].map(normalizeAccessoryCard);

      state.cards = [...minions, ...spells, ...accessories, ...heroes];
      state.cardsById = new Map(state.cards.map((card) => [card.id, card]));
      state.placements = createInitialPlacements(state.cards);
      syncAccessorySizeFilter();
      renderSourceFilters();
      renderRaceFilters();
      renderLevelFilters();
      renderAccessoryFilters();
      render();
    } catch (error) {
      console.error(error);
      summary.textContent = "Не удалось загрузить библиотеку для конструктора тир-листов.";
    }
  }

  searchInput.addEventListener("input", window.Shared.debounce((event) => {
    state.search = event.target.value.trim();
    render();
  }, 120));

  if (columnsInput) {
    columnsInput.addEventListener("input", (event) => {
      state.libraryColumns = Math.min(5, Math.max(2, Number(event.target.value) || 3));
      try {
        window.localStorage.setItem(COLUMNS_STORAGE_KEY, String(state.libraryColumns));
      } catch (error) {
        console.warn("Не удалось сохранить количество карт в ряду.", error);
      }
      applyLibraryColumns();
    });
  }

  resetButton.addEventListener("click", () => {
    state.search = "";
    state.source = "ALL";
    state.race = "ALL";
    state.level = "ALL";
    state.accessorySize = "ALL";
    searchInput.value = "";
    syncAccessorySizeFilter();
    renderSourceFilters();
    renderRaceFilters();
    renderLevelFilters();
    renderAccessoryFilters();
    render();
  });

  unassignedButton.addEventListener("click", () => {
    state.placements = createInitialPlacements(state.cards);
    render();
  });

  document.addEventListener("wheel", (event) => {
    if (state.draggingCardId) {
      event.preventDefault();
      window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: "auto" });
    }
  }, { passive: false });

  let edgeScrollRAF = null;
  let edgeScrollDirection = 0;
  function stopEdgeScroll() {
    if (edgeScrollRAF !== null) {
      cancelAnimationFrame(edgeScrollRAF);
      edgeScrollRAF = null;
    }
    edgeScrollDirection = 0;
  }
  function stepEdgeScroll() {
    if (edgeScrollDirection !== 0) {
      window.scrollBy(0, edgeScrollDirection * 16);
    }
    edgeScrollRAF = requestAnimationFrame(stepEdgeScroll);
  }
  document.addEventListener("dragover", (event) => {
    if (!state.draggingCardId) return;
    const EDGE = 80;
    if (event.clientY < EDGE) edgeScrollDirection = -1;
    else if (window.innerHeight - event.clientY < EDGE) edgeScrollDirection = 1;
    else edgeScrollDirection = 0;
    if (edgeScrollRAF === null && edgeScrollDirection !== 0) {
      edgeScrollRAF = requestAnimationFrame(stepEdgeScroll);
    }
  });
  document.addEventListener("dragend", stopEdgeScroll);
  document.addEventListener("drop", stopEdgeScroll);

  renderBackgroundPicker();
  applyBoardBackground();
  applyLibraryColumns();

  function renderBackgroundPicker() {
    if (!backgroundPickerEl) return;
    if (backgroundPickerEl.childElementCount === 0) {
      BACKGROUND_OPTIONS.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "background-chip";
        button.dataset.bg = option.value;
        button.setAttribute("aria-label", option.label);
        button.title = option.label;
        if (option.url) {
          button.style.backgroundImage = `url("${option.url}")`;
        } else {
          button.classList.add("is-transparent");
          button.textContent = "∅";
        }
        button.addEventListener("click", () => {
          state.backgroundMode = option.value;
          try {
            window.localStorage.setItem(BACKGROUND_STORAGE_KEY, state.backgroundMode);
          } catch (error) {
            console.warn("Не удалось сохранить режим фона.", error);
          }
          applyBoardBackground();
        });
        backgroundPickerEl.append(button);
      });
    }
    backgroundPickerEl.querySelectorAll(".background-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.bg === state.backgroundMode);
    });
  }

  function applyBoardBackground() {
    if (!rowsRoot) return;
    rowsRoot.classList.toggle("has-wallpaper", state.backgroundMode !== "transparent");
    rowsRoot.dataset.background = state.backgroundMode;
    renderBackgroundPicker();
  }

  if (downloadAllPngButton) {
    downloadAllPngButton.addEventListener("click", () => exportAllTiers("png"));
  }
  if (downloadAllWebpButton) {
    downloadAllWebpButton.addEventListener("click", () => exportAllTiers("webp"));
  }

  bootstrap();
})();
