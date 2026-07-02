(function () {
  const searchInput = document.getElementById("builder-search");
  const sourceFiltersEl = document.getElementById("builder-source-filters");
  const raceFiltersEl = document.getElementById("builder-race-filters");
  const levelFiltersEl = document.getElementById("builder-level-filters");
  const accessoryFiltersEl = document.getElementById("builder-accessory-filters");
  const raceBlockEl = document.getElementById("builder-race-block");
  const levelBlockEl = document.getElementById("builder-level-block");
  const accessoryBlockEl = document.getElementById("builder-accessory-block");
  const clearButton = document.getElementById("builder-clear");
  const exportPngButton = document.getElementById("builder-export-png");
  const exportWebpButton = document.getElementById("builder-export-webp");
  const toggleGridButton = document.getElementById("builder-toggle-grid");
  const backgroundPickerEl = document.getElementById("builder-background-picker");
  const annotationToolButtons = document.querySelectorAll(".annotation-tool[data-ann-tool]");
  const clearAnnotationsButton = document.getElementById("builder-clear-annotations");
  const annotationHintEl = document.getElementById("builder-annotation-hint");
  const ANNOTATION_COLOR = "#ff2121";
  const ANNOTATION_DARK = "#5a0b0b";
  const ANNOTATION_LIGHT = "#ffe7e7";
  const ANNOTATION_STROKE_RATIO = 0.058;
  const ANNOTATION_OUTLINE_RATIO = 0.22;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const quickSlotsPanelEl = document.getElementById("quick-slots-panel");
  const quickSlotsEl = document.getElementById("quick-slots");
  const communitySlotsPanelEl = document.getElementById("community-slots-panel");
  const communitySlotsEl = document.getElementById("community-slots");
  const annotationPanelEl = document.getElementById("annotation-panel");
  const hideQuickSlotsInput = document.getElementById("builder-hide-quick-slots");
  const hideCommunitySlotsInput = document.getElementById("builder-hide-community-slots");
  const hideAnnotationsInput = document.getElementById("builder-hide-annotations");
  const statusEl = document.getElementById("builder-status");
  const libraryEl = document.getElementById("builder-library");
  const boardEl = document.getElementById("strategy-board");
  const counterEl = document.getElementById("builder-counter");

  const BOARD_COLUMNS = 5;
  const BOARD_ROWS = 5;
  const BOARD_SLOT_COUNT = BOARD_COLUMNS * BOARD_ROWS;
  const EXPORT_WIDTH = 2200;
  const EXPORT_SIDE_PADDING = 60;
  const EXPORT_TOP_PADDING = 32;
  const EXPORT_BOTTOM_PADDING = 32;
  const EXPORT_COLUMN_GAP = 24;
  const EXPORT_ROW_GAP = 20;
  const QUICK_SLOTS_COUNT = 10;
  const QUICK_SLOTS_STORAGE_KEY = "strategy-builder-quick-slots-v1";
  const BACKGROUND_STORAGE_KEY = "strategy-builder-background-mode-v1";
  const HIDE_QUICK_SLOTS_STORAGE_KEY = "strategy-builder-hide-quick-slots-v1";
  const HIDE_COMMUNITY_SLOTS_STORAGE_KEY = "strategy-builder-hide-community-slots-v1";
  const HIDE_ANNOTATIONS_STORAGE_KEY = "strategy-builder-hide-annotations-v1";
  const WALLPAPER_BLUR_PX = 14;
  const WALLPAPER_BRIGHTNESS = 0.45;
  const SLOT_CARD_WIDTH = 0.13;
  const BOARD_INSET_X = 0.048;
  const BOARD_INSET_Y = 0.07;
  const BOARD_COLUMN_GAP = 0.025;
  const BOARD_ROW_GAP = 0.025;

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

  const state = {
    cards: [],
    filtered: [],
    placed: [],
    search: "",
    source: "ALL",
    race: "ALL",
    level: "ALL",
    accessorySize: "ALL",
    activeId: null,
    draggingLibrary: false,
    draggingPlaced: false,
    showGrid: false,
    backgroundMode: loadBackgroundMode(),
    quickSlots: loadQuickSlots(),
    hideQuickSlots: loadBooleanSetting(HIDE_QUICK_SLOTS_STORAGE_KEY, false),
    hideCommunitySlots: loadBooleanSetting(HIDE_COMMUNITY_SLOTS_STORAGE_KEY, false),
    hideAnnotations: loadBooleanSetting(HIDE_ANNOTATIONS_STORAGE_KEY, false),
    annotations: [],
    annotationTool: null,
    pendingAnnotation: null
  };

  function loadBooleanSetting(key, fallback) {
    try {
      const value = window.localStorage.getItem(key);
      return value === null ? fallback : value === "1";
    } catch (error) {
      return fallback;
    }
  }

  function saveBooleanSetting(key, value) {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch (error) {
      console.warn("Не удалось сохранить настройку конструктора.", error);
    }
  }

  function loadQuickSlots() {
    try {
      const raw = window.localStorage.getItem(QUICK_SLOTS_STORAGE_KEY);
      if (!raw) {
        return new Array(QUICK_SLOTS_COUNT).fill(null);
      }
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : [];
      const normalized = new Array(QUICK_SLOTS_COUNT).fill(null);
      for (let index = 0; index < Math.min(QUICK_SLOTS_COUNT, list.length); index += 1) {
        const entry = list[index];
        if (entry && entry.id && entry.source) {
          normalized[index] = { id: String(entry.id), source: String(entry.source) };
        }
      }
      return normalized;
    } catch (error) {
      console.warn("Не удалось прочитать быстрые слоты из localStorage.", error);
      return new Array(QUICK_SLOTS_COUNT).fill(null);
    }
  }

  function saveQuickSlots() {
    try {
      window.localStorage.setItem(QUICK_SLOTS_STORAGE_KEY, JSON.stringify(state.quickSlots));
    } catch (error) {
      console.warn("Не удалось сохранить быстрые слоты.", error);
    }
  }

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

  function saveBackgroundMode() {
    try {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, state.backgroundMode);
    } catch (error) {
      console.warn("Не удалось сохранить режим фона.", error);
    }
  }

  function findCard(id, source) {
    return state.cards.find((card) => String(card.id) === String(id) && card.source === source);
  }

  function normalizeAssetUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
    return `/bg-legacy/${raw.replace(/^\.\//, "")}`;
  }

  function getCardArtUrl(card, size = "512x") {
    if (card?.source === "SPELL" || card?.source === "HERO" || card?.source === "ACCESSORY") {
      return normalizeAssetUrl(card?.image || card?.artUrl || card?.cropImage || "");
    }

    if (!card?.id) {
      return normalizeAssetUrl(card?.artUrl || "");
    }

    return normalizeAssetUrl(card?.artUrl) || `/api/card-art?id=${encodeURIComponent(card.id)}&locale=ruRU&size=${encodeURIComponent(size)}`;
  }

  function normalize(value) {
    return String(value || "").toLowerCase().trim();
  }

  function stripHtml(value) {
    const tmp = document.createElement("div");
    tmp.innerHTML = value || "";
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
  }

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "");
  }

  function getEnglishNameFromImagePath(imagePath) {
    const raw = String(imagePath || "").trim();
    if (!raw) {
      return "";
    }

    const filename = raw.split("/").pop() || raw;
    const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, "");

    try {
      return decodeURIComponent(withoutExtension).replace(/\s+/g, " ").trim();
    } catch (error) {
      return withoutExtension.replace(/\s+/g, " ").trim();
    }
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function syncCounter() {
    counterEl.textContent = `${state.placed.length} карт на полотне`;
    boardEl.classList.toggle("is-empty", state.placed.length === 0);
  }

  function applyBoardVisualSettings() {
    boardEl.classList.toggle("show-grid", state.showGrid);
    const hasWallpaper = state.backgroundMode !== "transparent";
    boardEl.classList.toggle("has-wallpaper", hasWallpaper);
    boardEl.dataset.background = state.backgroundMode;
    if (toggleGridButton) {
      toggleGridButton.classList.toggle("is-active", state.showGrid);
      toggleGridButton.textContent = state.showGrid ? "Скрыть сетку" : "Показать сетку";
      toggleGridButton.setAttribute("aria-pressed", state.showGrid ? "true" : "false");
    }
    renderBackgroundPicker();
  }

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
          saveBackgroundMode();
          applyBoardVisualSettings();
        });
        backgroundPickerEl.append(button);
      });
    }
    backgroundPickerEl.querySelectorAll(".background-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.bg === state.backgroundMode);
    });
  }

  function renderQuickSlots() {
    if (!quickSlotsEl) {
      return;
    }
    quickSlotsEl.replaceChildren();

    for (let index = 0; index < QUICK_SLOTS_COUNT; index += 1) {
      const entry = state.quickSlots[index];
      const card = entry ? findCard(entry.id, entry.source) : null;
      const slot = document.createElement("div");
      slot.className = `quick-slot${card ? " is-filled" : " is-empty"}`;
      slot.dataset.index = String(index);
      slot.title = card ? `${card.name} — клик, чтобы добавить на полотно` : "Пустой быстрый слот";

      if (card) {
        const art = document.createElement("img");
        art.className = "quick-slot-art";
        art.src = getCardArtUrl(card, "256x");
        art.alt = card.name;
        art.loading = "lazy";
        art.decoding = "async";
        slot.append(art);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "quick-slot-remove";
        remove.setAttribute("aria-label", "Убрать из быстрых слотов");
        remove.textContent = "×";
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          state.quickSlots[index] = null;
          saveQuickSlots();
          renderQuickSlots();
        });
        slot.append(remove);

        slot.addEventListener("click", () => {
          addCardToBoard(card);
        });
      }

      slot.addEventListener("dragover", (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        slot.classList.add("is-drop-target");
      });
      slot.addEventListener("dragleave", () => {
        slot.classList.remove("is-drop-target");
      });
      slot.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        slot.classList.remove("is-drop-target");
        const dropped = readCardFromDataTransfer(event.dataTransfer);
        if (!dropped) {
          return;
        }
        const existingIndex = state.quickSlots.findIndex((slotEntry) => (
          slotEntry && String(slotEntry.id) === String(dropped.id) && slotEntry.source === dropped.source
        ));
        if (existingIndex !== -1 && existingIndex !== index) {
          state.quickSlots[existingIndex] = null;
        }
        state.quickSlots[index] = { id: String(dropped.id), source: dropped.source };
        saveQuickSlots();
        renderQuickSlots();
      });

      quickSlotsEl.append(slot);
    }
  }

  function applyPanelVisibility() {
    if (quickSlotsPanelEl) quickSlotsPanelEl.hidden = state.hideQuickSlots;
    if (communitySlotsPanelEl) communitySlotsPanelEl.hidden = state.hideCommunitySlots;
    if (annotationPanelEl) annotationPanelEl.hidden = state.hideAnnotations;
    if (hideQuickSlotsInput) hideQuickSlotsInput.checked = state.hideQuickSlots;
    if (hideCommunitySlotsInput) hideCommunitySlotsInput.checked = state.hideCommunitySlots;
    if (hideAnnotationsInput) hideAnnotationsInput.checked = state.hideAnnotations;
  }

  function bindPanelToggle(input, key, storageKey) {
    if (!input) return;
    input.checked = Boolean(state[key]);
    input.addEventListener("change", () => {
      state[key] = Boolean(input.checked);
      saveBooleanSetting(storageKey, state[key]);
      applyPanelVisibility();
    });
  }

  function renderCommunitySlots() {
    if (!communitySlotsEl) return;
    communitySlotsEl.replaceChildren();
    if (!state.cards.length || !compsList.length) {
      communitySlotsEl.closest("[data-community-empty]")?.setAttribute("data-community-empty", "true");
      return;
    }

    const counts = new Map();
    compsList.forEach((comp) => {
      (comp.cards || []).forEach((compCard) => {
        const libraryCard = findLibraryCardForCompCard(compCard);
        if (!libraryCard) return;
        const key = `${libraryCard.source}:${libraryCard.id}`;
        const entry = counts.get(key) || { card: libraryCard, count: 0, core: 0 };
        entry.count += 1;
        if (compCard.role === "CORE") entry.core += 1;
        counts.set(key, entry);
      });
    });

    [...counts.values()]
      .sort((left, right) => (right.core - left.core) || (right.count - left.count) || left.card.name.localeCompare(right.card.name, "ru"))
      .slice(0, QUICK_SLOTS_COUNT)
      .forEach((entry) => {
        const slot = document.createElement("button");
        slot.type = "button";
        slot.className = "community-slot";
        slot.title = `${entry.card.name} — встречается в ${entry.count} сборках`;
        slot.innerHTML = `
          <img class="community-slot-art" src="${window.Shared.escapeHtml(getCardArtUrl(entry.card, "256x"))}" alt="${window.Shared.escapeHtml(entry.card.name)}" loading="lazy" decoding="async">
          <span class="community-slot-count">${entry.count}</span>
        `;
        slot.addEventListener("click", () => addCardToBoard(entry.card));
        communitySlotsEl.append(slot);
      });
  }

  function getSlotPosition(slot) {
    const column = slot % BOARD_COLUMNS;
    const row = Math.floor(slot / BOARD_COLUMNS);
    const usableWidth = 1 - BOARD_INSET_X * 2 - BOARD_COLUMN_GAP * (BOARD_COLUMNS - 1);
    const usableHeight = 1 - BOARD_INSET_Y * 2 - BOARD_ROW_GAP * (BOARD_ROWS - 1);

    return {
      x: BOARD_INSET_X + (usableWidth / BOARD_COLUMNS) * (column + 0.5) + BOARD_COLUMN_GAP * column,
      y: BOARD_INSET_Y + (usableHeight / BOARD_ROWS) * (row + 0.5) + BOARD_ROW_GAP * row
    };
  }

  function getNearestSlot(clientX, clientY) {
    const rect = boardEl.getBoundingClientRect();
    const relativeX = Math.min(0.999, Math.max(0, (clientX - rect.left) / rect.width));
    const relativeY = Math.min(0.999, Math.max(0, (clientY - rect.top) / rect.height));
    const column = Math.min(BOARD_COLUMNS - 1, Math.max(0, Math.floor(relativeX * BOARD_COLUMNS)));
    const row = Math.min(BOARD_ROWS - 1, Math.max(0, Math.floor(relativeY * BOARD_ROWS)));
    return row * BOARD_COLUMNS + column;
  }

  function getFirstFreeSlot() {
    const occupied = new Set(state.placed.map((card) => card.slot));

    for (let slot = 0; slot < BOARD_SLOT_COUNT; slot += 1) {
      if (!occupied.has(slot)) {
        return slot;
      }
    }

    return null;
  }

  function getCardSearchText(card) {
    return [
      card.name,
      card.englishName,
      card.slug,
      card.text,
      card.source === "SPELL" ? "заклинание tavern spell" : "",
      card.source === "MINION" ? "существо minion" : "",
      card.source === "HERO" ? "герой hero" : "",
      card.source === "ACCESSORY" ? "аксессуар accessory trinket малый большой" : "",
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
    { value: "HERO", label: "Герои" },
    { value: "MINION", label: "Существа" },
    { value: "SPELL", label: "Заклинания" },
    { value: "ACCESSORY", label: "Аксессуары" }
  ];

  const raceOrder = ["ALL", "NONE", "BEAST", "DEMON", "DRAGON", "ELEMENTAL", "MECHANICAL", "MURLOC", "NAGA", "PIRATE", "QUILBOAR", "UNDEAD"];
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
        updateLibrary();
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
        updateLibrary();
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
        updateLibrary();
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
        updateLibrary();
      }));
    });
  }

  function getLibraryMeta(card) {
    if (card.source === "SPELL") {
      return `Заклинание • Таверна ${card.techLevel || "?"} • Мана ${card.manaCost ?? 0}`;
    }

    if (card.source === "HERO") {
      return `Герой • ${card.heroTier || "Пул героев"}`;
    }

    if (card.source === "ACCESSORY") {
      return `${card.accessorySize === "LARGE" ? "Большой аксессуар" : "Малый аксессуар"} • Новый слот стратегии`;
    }

    const raceLabel = raceNames[(card.races || [])[0]] || "Нейтральные";
    return `${raceLabel} • Таверна ${card.techLevel || "?"}`;
  }

  function getSourceLabel(card) {
    if (card.source === "SPELL") {
      return "Заклинание";
    }
    if (card.source === "HERO") {
      return "Герой";
    }
    if (card.source === "ACCESSORY") {
      return "Аксессуар";
    }
    return "Существо";
  }

  function renderLibrary() {
    libraryEl.replaceChildren();

    if (!state.filtered.length) {
      setStatus("По текущим фильтрам ничего не найдено.");
      return;
    }

    const heroCount = state.filtered.filter((card) => card.source === "HERO").length;
    const minionCount = state.filtered.filter((card) => card.source === "MINION").length;
    const spellCount = state.filtered.filter((card) => card.source === "SPELL").length;
    const accessoryCount = state.filtered.filter((card) => card.source === "ACCESSORY").length;
    setStatus(`Доступно ${state.filtered.length} карт: ${heroCount} героев, ${minionCount} существ, ${spellCount} заклинаний и ${accessoryCount} аксессуаров.`);

    const fragment = document.createDocumentFragment();
    state.filtered.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `builder-card builder-card-tile${card.source === "SPELL" ? " is-spell" : ""}${card.source === "HERO" ? " is-hero" : ""}`;
      button.draggable = true;
      const safeName = window.Shared.escapeHtml(card.name);
      button.title = `${card.name} — ${getSourceLabel(card)} • ${getLibraryMeta(card)}`;
      const displaySrc = card.source === "MINION" && card.artUrl ? card.artUrl : getCardArtUrl(card, "256x");
      button.innerHTML = `
        <div class="builder-card-media">
          <img class="builder-card-art" src="${window.Shared.escapeHtml(displaySrc)}" alt="${safeName}" loading="lazy" decoding="async">
        </div>
      `;
      const art = button.querySelector(".builder-card-art");
      art.addEventListener("error", () => {
        const fallback = getCardArtUrl(card, "256x");
        if (!art.dataset.fallback && art.getAttribute("src") !== fallback) {
          art.dataset.fallback = "1";
          art.src = fallback;
        }
      });

      button.addEventListener("dragstart", (event) => {
        state.draggingLibrary = true;
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("text/plain", String(card.id));
        event.dataTransfer.setData("application/x-bg-card", JSON.stringify({
          id: String(card.id),
          source: card.source
        }));
      });

      button.addEventListener("dragend", () => {
        state.draggingLibrary = false;
      });

      button.addEventListener("click", () => addCardToBoard(card));
      fragment.append(button);
    });
    libraryEl.append(fragment);
  }

  function addCardToBoard(card, preferredSlot = null) {
    const slot = preferredSlot ?? getFirstFreeSlot();

    if (slot === null) {
      setStatus("Все 15 слотов заняты. Удали карту или переставь существующую.");
      return;
    }

    const placedCard = {
      uid: crypto.randomUUID(),
      id: card.id,
      name: card.name,
      source: card.source,
      artUrl: getCardArtUrl(card, "512x"),
      slot,
      highlighted: false
    };

    state.placed.push(placedCard);
    state.activeId = placedCard.uid;
    renderBoard();
  }

  function removePlacedCard(uid) {
    state.placed = state.placed.filter((card) => card.uid !== uid);

    if (state.activeId === uid) {
      state.activeId = state.placed[0]?.uid || null;
    }

    state.annotations = state.annotations.filter((ann) => !ann.cardUids.includes(uid));
    if (state.pendingAnnotation && state.pendingAnnotation.uid === uid) {
      state.pendingAnnotation = null;
    }

    renderBoard();
  }

  function toggleHighlight(uid) {
    const target = state.placed.find((card) => card.uid === uid);
    if (!target) {
      return;
    }
    target.highlighted = !target.highlighted;
    state.activeId = uid;
    renderBoard();
  }

  const tileTap = { uid: null, timer: null };
  const DOUBLE_CLICK_MS = 260;

  function handleTileTap(uid) {
    if (tileTap.uid === uid && tileTap.timer !== null) {
      window.clearTimeout(tileTap.timer);
      tileTap.timer = null;
      tileTap.uid = null;
      removePlacedCard(uid);
      return;
    }
    if (tileTap.timer !== null) {
      window.clearTimeout(tileTap.timer);
    }
    tileTap.uid = uid;
    tileTap.timer = window.setTimeout(() => {
      tileTap.timer = null;
      tileTap.uid = null;
      toggleHighlight(uid);
    }, DOUBLE_CLICK_MS);
  }

  function movePlacedCardToSlot(uid, targetSlot) {
    const movingCard = state.placed.find((card) => card.uid === uid);
    if (!movingCard) {
      return;
    }

    const occupant = state.placed.find((card) => card.slot === targetSlot && card.uid !== uid);
    if (!occupant) {
      state.placed = state.placed.map((card) => (
        card.uid === uid ? { ...card, slot: targetSlot } : card
      ));
      renderBoard();
      return;
    }

    const originalSlot = movingCard.slot;
    state.placed = state.placed.map((card) => {
      if (card.uid === uid) {
        return { ...card, slot: targetSlot };
      }
      if (card.uid === occupant.uid) {
        return { ...card, slot: originalSlot };
      }
      return card;
    });

    renderBoard();
  }

  function setAnnotationTool(tool) {
    if (state.annotationTool === tool) {
      state.annotationTool = null;
    } else {
      state.annotationTool = tool;
    }
    state.pendingAnnotation = null;
    applyAnnotationToolUi();
  }

  function applyAnnotationToolUi() {
    boardEl.classList.toggle("is-annotating", Boolean(state.annotationTool));
    boardEl.dataset.annotationTool = state.annotationTool || "";
    annotationToolButtons.forEach((button) => {
      const active = button.dataset.annTool === state.annotationTool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (annotationHintEl) {
      const hints = {
        arrow: "Кликни по первой карте, затем по второй — стрелка пойдёт от первой ко второй.",
        plus: "Кликни две карты — между ними встанет «+».",
        equals: "Кликни две карты — между ними встанет знак «=».",
        "double-arrow": "Кликни две карты — связь с двумя наконечниками.",
        question: "Кликни по карте, чтобы поставить «?» (или снять).",
        strike: "Кликни по карте, чтобы перечеркнуть её крестом (или снять).",
        "label-prokrutka": "Кликни по карте — под ней появится надпись «Прокрутка».",
        "label-key": "Кликни по карте — под ней появится надпись «Ключевая».",
        erase: "Кликни по аннотации или подписи, чтобы удалить."
      };
      annotationHintEl.textContent = state.annotationTool ? hints[state.annotationTool] || "" : "";
    }
  }

  function addAnnotation(entry) {
    state.annotations.push({ id: crypto.randomUUID(), ...entry });
    renderBoard();
  }

  function removeAnnotationById(id) {
    const before = state.annotations.length;
    state.annotations = state.annotations.filter((ann) => ann.id !== id);
    if (state.annotations.length !== before) {
      renderBoard();
    }
  }

  function removeStrikeForCard(uid) {
    const before = state.annotations.length;
    state.annotations = state.annotations.filter((ann) => !(ann.type === "strike" && ann.cardUids[0] === uid));
    if (state.annotations.length !== before) {
      renderBoard();
    }
  }

  const LABEL_TOOL_TEXTS = {
    "label-prokrutka": "Прокрутка",
    "label-key": "Ключевая"
  };

  const TWO_CARD_TOOLS = new Set(["arrow", "plus", "equals", "double-arrow"]);
  const SINGLE_CARD_TOGGLE_TOOLS = new Set(["strike", "question"]);

  function handleAnnotationClick(cardUid) {
    const tool = state.annotationTool;
    if (!tool) return false;
    if (SINGLE_CARD_TOGGLE_TOOLS.has(tool)) {
      const existing = state.annotations.find((ann) => ann.type === tool && ann.cardUids[0] === cardUid);
      if (existing) {
        removeAnnotationById(existing.id);
      } else {
        addAnnotation({ type: tool, cardUids: [cardUid] });
      }
      return true;
    }
    if (tool === "erase") {
      const cardAnn = state.annotations.find((ann) => (
        (ann.type === "strike" || ann.type === "question" || ann.type === "label")
        && ann.cardUids[0] === cardUid
      ));
      if (cardAnn) {
        removeAnnotationById(cardAnn.id);
      }
      return true;
    }
    if (LABEL_TOOL_TEXTS[tool]) {
      const text = LABEL_TOOL_TEXTS[tool];
      const existing = state.annotations.find((ann) => (
        ann.type === "label" && ann.cardUids[0] === cardUid && ann.text === text
      ));
      if (existing) {
        removeAnnotationById(existing.id);
      } else {
        state.annotations = state.annotations.filter((ann) => !(ann.type === "label" && ann.cardUids[0] === cardUid));
        addAnnotation({ type: "label", cardUids: [cardUid], text });
      }
      return true;
    }
    if (TWO_CARD_TOOLS.has(tool)) {
      if (!state.pendingAnnotation) {
        state.pendingAnnotation = { uid: cardUid };
        renderBoard();
        return true;
      }
      if (state.pendingAnnotation.uid === cardUid) {
        state.pendingAnnotation = null;
        renderBoard();
        return true;
      }
      const first = state.pendingAnnotation.uid;
      state.pendingAnnotation = null;
      addAnnotation({ type: tool, cardUids: [first, cardUid] });
      return true;
    }
    return false;
  }

  function cardRectForUid(uid, rowMap, entriesByUid) {
    const card = state.placed.find((c) => c.uid === uid);
    if (!card) return null;
    const slotPosition = getSlotPosition(card.slot);
    return { cx: slotPosition.x, cy: slotPosition.y };
  }

  function renderAnnotationOverlay() {
    const existing = boardEl.querySelector(".strategy-board-annotations");
    if (existing) existing.remove();
    if (!state.annotations.length && !state.pendingAnnotation) return;

    const rect = boardEl.getBoundingClientRect();
    const W = rect.width || 1;
    const H = rect.height || 1;
    if (!W || !H) return;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "strategy-board-annotations");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("overflow", "visible");
    svg.style.overflow = "visible";

    const defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML = `
      <filter id="ann-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.55"/>
      </filter>
    `;
    svg.append(defs);

    const cardWidthPx = W * 0.142;
    const cardHeightPx = cardWidthPx * 1.4;
    const strokeWidth = Math.max(6, cardWidthPx * ANNOTATION_STROKE_RATIO);
    const outlineExtra = Math.max(2, strokeWidth * ANNOTATION_OUTLINE_RATIO);
    const annLayer = document.createElementNS(SVG_NS, "g");
    annLayer.setAttribute("filter", "url(#ann-shadow)");
    svg.append(annLayer);

    const cardCenter = (uid) => {
      const card = state.placed.find((c) => c.uid === uid);
      if (!card) return null;
      const pos = getSlotPosition(card.slot);
      return { cx: pos.x * W, cy: pos.y * H };
    };

    const appendAnnotation = (node, id) => {
      node.setAttribute("data-ann-id", id);
      node.classList.add("strategy-annotation");
      annLayer.append(node);
    };

    const buildDoubleArrowPath = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const shaftWidth = strokeWidth * 0.9;
      const headLen = Math.min(len * 0.28, cardWidthPx * 0.26);
      const headWidth = shaftWidth * 2.4;
      const leftBaseX = x1 + ux * headLen;
      const leftBaseY = y1 + uy * headLen;
      const rightBaseX = x2 - ux * headLen;
      const rightBaseY = y2 - uy * headLen;
      return [
        `M ${x1} ${y1}`,
        `L ${leftBaseX + px * headWidth} ${leftBaseY + py * headWidth}`,
        `L ${leftBaseX + px * (shaftWidth / 2)} ${leftBaseY + py * (shaftWidth / 2)}`,
        `L ${rightBaseX + px * (shaftWidth / 2)} ${rightBaseY + py * (shaftWidth / 2)}`,
        `L ${rightBaseX + px * headWidth} ${rightBaseY + py * headWidth}`,
        `L ${x2} ${y2}`,
        `L ${rightBaseX - px * headWidth} ${rightBaseY - py * headWidth}`,
        `L ${rightBaseX - px * (shaftWidth / 2)} ${rightBaseY - py * (shaftWidth / 2)}`,
        `L ${leftBaseX - px * (shaftWidth / 2)} ${leftBaseY - py * (shaftWidth / 2)}`,
        `L ${leftBaseX - px * headWidth} ${leftBaseY - py * headWidth}`,
        "Z"
      ].join(" ");
    };

    const buildArrowPath = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const shaftWidth = strokeWidth * 0.95;
      const headLen = Math.min(len * 0.42, cardWidthPx * 0.32);
      const headWidth = shaftWidth * 2.6;
      const baseX = x2 - ux * headLen;
      const baseY = y2 - uy * headLen;
      const leftBaseX = baseX + px * (shaftWidth / 2);
      const leftBaseY = baseY + py * (shaftWidth / 2);
      const rightBaseX = baseX - px * (shaftWidth / 2);
      const rightBaseY = baseY - py * (shaftWidth / 2);
      const leftHeadX = baseX + px * headWidth;
      const leftHeadY = baseY + py * headWidth;
      const rightHeadX = baseX - px * headWidth;
      const rightHeadY = baseY - py * headWidth;
      const startLeftX = x1 + px * (shaftWidth / 2);
      const startLeftY = y1 + py * (shaftWidth / 2);
      const startRightX = x1 - px * (shaftWidth / 2);
      const startRightY = y1 - py * (shaftWidth / 2);
      return [
        `M ${startLeftX} ${startLeftY}`,
        `L ${leftBaseX} ${leftBaseY}`,
        `L ${leftHeadX} ${leftHeadY}`,
        `L ${x2} ${y2}`,
        `L ${rightHeadX} ${rightHeadY}`,
        `L ${rightBaseX} ${rightBaseY}`,
        `L ${startRightX} ${startRightY}`,
        "Z"
      ].join(" ");
    };

    const makeCrossLine = (x1, y1, x2, y2, width, color) => {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", String(width));
      line.setAttribute("stroke-linecap", "round");
      return line;
    };

    state.annotations.forEach((ann) => {
      if (ann.type === "strike") {
        const center = cardCenter(ann.cardUids[0]);
        if (!center) return;
        const hx = cardWidthPx / 2;
        const hy = cardHeightPx / 2;
        const coreWidth = strokeWidth * 1.45;
        const haloWidth = coreWidth + outlineExtra * 2;
        const group = document.createElementNS(SVG_NS, "g");
        group.append(makeCrossLine(center.cx - hx, center.cy - hy, center.cx + hx, center.cy + hy, haloWidth, ANNOTATION_LIGHT));
        group.append(makeCrossLine(center.cx + hx, center.cy - hy, center.cx - hx, center.cy + hy, haloWidth, ANNOTATION_LIGHT));
        group.append(makeCrossLine(center.cx - hx, center.cy - hy, center.cx + hx, center.cy + hy, coreWidth, ANNOTATION_COLOR));
        group.append(makeCrossLine(center.cx + hx, center.cy - hy, center.cx - hx, center.cy + hy, coreWidth, ANNOTATION_COLOR));
        appendAnnotation(group, ann.id);
        return;
      }
      if (ann.type === "label") {
        const center = cardCenter(ann.cardUids[0]);
        if (!center) return;
        const fontSize = cardWidthPx * 0.13;
        const y = center.cy + cardHeightPx / 2 + fontSize * 0.55;
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(center.cx));
        text.setAttribute("y", String(y));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#fff8e6");
        text.setAttribute("stroke", "#0b0f1a");
        text.setAttribute("stroke-width", String(Math.max(2, fontSize * 0.26)));
        text.setAttribute("stroke-linejoin", "round");
        text.setAttribute("paint-order", "stroke fill");
        text.setAttribute("font-family", '"BgDisplay", Georgia, serif');
        text.setAttribute("font-weight", "700");
        text.setAttribute("font-size", String(fontSize));
        text.setAttribute("letter-spacing", "0.02em");
        text.textContent = ann.text || "";
        appendAnnotation(text, ann.id);
        return;
      }
      if (ann.type === "arrow") {
        const a = cardCenter(ann.cardUids[0]);
        const b = cardCenter(ann.cardUids[1]);
        if (!a || !b) return;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const shorten = Math.min(cardWidthPx * 0.55, len * 0.35);
        const ux = dx / len;
        const uy = dy / len;
        const x1 = a.cx + ux * shorten;
        const y1 = a.cy + uy * shorten;
        const x2 = b.cx - ux * shorten;
        const y2 = b.cy - uy * shorten;
        const d = buildArrowPath(x1, y1, x2, y2);
        const group = document.createElementNS(SVG_NS, "g");
        const outline = document.createElementNS(SVG_NS, "path");
        outline.setAttribute("d", d);
        outline.setAttribute("fill", ANNOTATION_LIGHT);
        outline.setAttribute("stroke", ANNOTATION_LIGHT);
        outline.setAttribute("stroke-width", String(outlineExtra * 2));
        outline.setAttribute("stroke-linejoin", "round");
        const core = document.createElementNS(SVG_NS, "path");
        core.setAttribute("d", d);
        core.setAttribute("fill", ANNOTATION_COLOR);
        core.setAttribute("stroke", ANNOTATION_DARK);
        core.setAttribute("stroke-width", String(Math.max(1, outlineExtra * 0.4)));
        core.setAttribute("stroke-linejoin", "round");
        group.append(outline);
        group.append(core);
        appendAnnotation(group, ann.id);
        return;
      }
      const makeBar = (x1, y1, x2, y2, width, color) => {
        const l = document.createElementNS(SVG_NS, "line");
        l.setAttribute("x1", x1);
        l.setAttribute("y1", y1);
        l.setAttribute("x2", x2);
        l.setAttribute("y2", y2);
        l.setAttribute("stroke", color);
        l.setAttribute("stroke-width", String(width));
        l.setAttribute("stroke-linecap", "round");
        return l;
      };

      if (ann.type === "plus") {
        const a = cardCenter(ann.cardUids[0]);
        const b = cardCenter(ann.cardUids[1]);
        if (!a || !b) return;
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const arm = cardWidthPx * 0.12;
        const barThick = strokeWidth * 1.15;
        const haloThick = barThick + outlineExtra * 1.6;
        const group = document.createElementNS(SVG_NS, "g");
        group.append(makeBar(mx - arm, my, mx + arm, my, haloThick, ANNOTATION_LIGHT));
        group.append(makeBar(mx, my - arm, mx, my + arm, haloThick, ANNOTATION_LIGHT));
        group.append(makeBar(mx - arm, my, mx + arm, my, barThick, ANNOTATION_COLOR));
        group.append(makeBar(mx, my - arm, mx, my + arm, barThick, ANNOTATION_COLOR));
        appendAnnotation(group, ann.id);
        return;
      }
      if (ann.type === "equals") {
        const a = cardCenter(ann.cardUids[0]);
        const b = cardCenter(ann.cardUids[1]);
        if (!a || !b) return;
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const arm = cardWidthPx * 0.13;
        const gap = cardWidthPx * 0.08;
        const barThick = strokeWidth * 1.1;
        const haloThick = barThick + outlineExtra * 1.6;
        const group = document.createElementNS(SVG_NS, "g");
        group.append(makeBar(mx - arm, my - gap, mx + arm, my - gap, haloThick, ANNOTATION_LIGHT));
        group.append(makeBar(mx - arm, my + gap, mx + arm, my + gap, haloThick, ANNOTATION_LIGHT));
        group.append(makeBar(mx - arm, my - gap, mx + arm, my - gap, barThick, ANNOTATION_COLOR));
        group.append(makeBar(mx - arm, my + gap, mx + arm, my + gap, barThick, ANNOTATION_COLOR));
        appendAnnotation(group, ann.id);
        return;
      }
      if (ann.type === "double-arrow") {
        const a = cardCenter(ann.cardUids[0]);
        const b = cardCenter(ann.cardUids[1]);
        if (!a || !b) return;
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const shorten = Math.min(cardWidthPx * 0.55, len * 0.35);
        const ux = dx / len;
        const uy = dy / len;
        const x1 = a.cx + ux * shorten;
        const y1 = a.cy + uy * shorten;
        const x2 = b.cx - ux * shorten;
        const y2 = b.cy - uy * shorten;
        const d = buildDoubleArrowPath(x1, y1, x2, y2);
        const group = document.createElementNS(SVG_NS, "g");
        const outline = document.createElementNS(SVG_NS, "path");
        outline.setAttribute("d", d);
        outline.setAttribute("fill", ANNOTATION_LIGHT);
        outline.setAttribute("stroke", ANNOTATION_LIGHT);
        outline.setAttribute("stroke-width", String(outlineExtra * 2));
        outline.setAttribute("stroke-linejoin", "round");
        const core = document.createElementNS(SVG_NS, "path");
        core.setAttribute("d", d);
        core.setAttribute("fill", ANNOTATION_COLOR);
        core.setAttribute("stroke", ANNOTATION_DARK);
        core.setAttribute("stroke-width", String(Math.max(1, outlineExtra * 0.4)));
        core.setAttribute("stroke-linejoin", "round");
        group.append(outline);
        group.append(core);
        appendAnnotation(group, ann.id);
        return;
      }
      if (ann.type === "question") {
        const center = cardCenter(ann.cardUids[0]);
        if (!center) return;
        const radius = cardWidthPx * 0.22;
        const cy = center.cy - cardHeightPx / 2 + radius * 0.7;
        const cx = center.cx;
        const group = document.createElementNS(SVG_NS, "g");
        const halo = document.createElementNS(SVG_NS, "circle");
        halo.setAttribute("cx", cx);
        halo.setAttribute("cy", cy);
        halo.setAttribute("r", String(radius + outlineExtra));
        halo.setAttribute("fill", ANNOTATION_LIGHT);
        const body = document.createElementNS(SVG_NS, "circle");
        body.setAttribute("cx", cx);
        body.setAttribute("cy", cy);
        body.setAttribute("r", String(radius));
        body.setAttribute("fill", ANNOTATION_COLOR);
        body.setAttribute("stroke", ANNOTATION_DARK);
        body.setAttribute("stroke-width", String(Math.max(1, outlineExtra * 0.5)));
        const glyph = document.createElementNS(SVG_NS, "text");
        glyph.setAttribute("x", String(cx));
        glyph.setAttribute("y", String(cy));
        glyph.setAttribute("text-anchor", "middle");
        glyph.setAttribute("dominant-baseline", "central");
        glyph.setAttribute("fill", ANNOTATION_LIGHT);
        glyph.setAttribute("font-family", '"BgDisplay", Georgia, serif');
        glyph.setAttribute("font-weight", "700");
        glyph.setAttribute("font-size", String(radius * 1.6));
        glyph.textContent = "?";
        group.append(halo);
        group.append(body);
        group.append(glyph);
        appendAnnotation(group, ann.id);
        return;
      }
    });

    if (state.pendingAnnotation) {
      const c = cardCenter(state.pendingAnnotation.uid);
      if (c) {
        const pulse = document.createElementNS(SVG_NS, "circle");
        pulse.setAttribute("cx", c.cx);
        pulse.setAttribute("cy", c.cy);
        pulse.setAttribute("r", String(cardWidthPx * 0.65));
        pulse.setAttribute("fill", "none");
        pulse.setAttribute("stroke", ANNOTATION_COLOR);
        pulse.setAttribute("stroke-width", String(strokeWidth * 0.7));
        pulse.setAttribute("stroke-dasharray", "10 6");
        pulse.classList.add("strategy-annotation-pending");
        svg.append(pulse);
      }
    }

    svg.addEventListener("click", (event) => {
      if (state.annotationTool !== "erase") return;
      const target = event.target.closest("[data-ann-id]");
      if (!target) return;
      event.stopPropagation();
      removeAnnotationById(target.dataset.annId);
    });

    boardEl.append(svg);
  }

  function renderBoard() {
    boardEl.replaceChildren();

    const grid = document.createElement("div");
    grid.className = "strategy-board-grid";
    grid.setAttribute("aria-hidden", "true");
    boardEl.append(grid);

    const hint = document.createElement("div");
    hint.className = "strategy-board-hint";
    hint.textContent = "Перетаскивай карты из библиотеки сюда.";

    if (!state.placed.length) {
      boardEl.append(hint);
    }

    state.placed.forEach((card) => {
      const slotPosition = getSlotPosition(card.slot);
      const tile = document.createElement("article");
      const classes = ["placed-card"];
      if (state.activeId === card.uid) classes.push("is-active");
      if (card.highlighted) classes.push("is-highlighted");
      tile.className = classes.join(" ");
      tile.style.left = `${slotPosition.x * 100}%`;
      tile.style.top = `${slotPosition.y * 100}%`;
      tile.innerHTML = `
        <img class="placed-card-art" src="${card.artUrl}" alt="${window.Shared.escapeHtml(card.name)}">
        <button class="placed-card-remove" type="button" aria-label="Удалить карту">×</button>
      `;

      tile.addEventListener("pointerdown", (event) => {
        if (event.target.closest(".placed-card-remove")) {
          return;
        }
        if (event.button !== undefined && event.button !== 0) {
          return;
        }
        if (state.annotationTool) {
          event.preventDefault();
          event.stopPropagation();
          handleAnnotationClick(card.uid);
          return;
        }

        const startX = event.clientX;
        const startY = event.clientY;
        const DRAG_THRESHOLD = 5;
        let dragging = false;
        let pendingEvent = null;
        let rafId = null;

        const applyMove = () => {
          rafId = null;
          if (!pendingEvent) return;
          const dx = pendingEvent.clientX - startX;
          const dy = pendingEvent.clientY - startY;
          tile.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
          pendingEvent = null;
        };

        const move = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const dy = moveEvent.clientY - startY;
          if (!dragging) {
            if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) {
              return;
            }
            dragging = true;
            state.activeId = card.uid;
            state.draggingPlaced = true;
            tile.classList.add("is-dragging");
          }
          pendingEvent = moveEvent;
          if (rafId === null) {
            rafId = requestAnimationFrame(applyMove);
          }
        };

        const release = (releaseEvent) => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (dragging) {
            tile.classList.remove("is-dragging");
            tile.style.transform = "";
            state.draggingPlaced = false;
            movePlacedCardToSlot(card.uid, getNearestSlot(releaseEvent.clientX, releaseEvent.clientY));
          } else {
            handleTileTap(card.uid);
          }
        };

        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", release);
      });

      tile.querySelector(".placed-card-remove").addEventListener("click", () => removePlacedCard(card.uid));
      if (state.annotations.some((ann) => ann.type === "strike" && ann.cardUids[0] === card.uid)) {
        tile.classList.add("is-struck");
      }
      if (state.pendingAnnotation && state.pendingAnnotation.uid === card.uid) {
        tile.classList.add("is-ann-pending");
      }
      boardEl.append(tile);
    });

    renderAnnotationOverlay();
    syncCounter();
  }

  function drawAnnotationsOnCanvas(ctx, cardRects, cardWidth) {
    if (!state.annotations.length) return;
    const strokeWidth = Math.max(6, cardWidth * ANNOTATION_STROKE_RATIO);
    const outlineExtra = Math.max(2, strokeWidth * ANNOTATION_OUTLINE_RATIO);

    const tracePath = (points) => {
      ctx.beginPath();
      points.forEach(([px, py], idx) => {
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    };

    const buildArrowPoints = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const shaftWidth = strokeWidth * 0.95;
      const headLen = Math.min(len * 0.42, cardWidth * 0.32);
      const headWidth = shaftWidth * 2.6;
      const baseX = x2 - ux * headLen;
      const baseY = y2 - uy * headLen;
      return [
        [x1 + px * (shaftWidth / 2), y1 + py * (shaftWidth / 2)],
        [baseX + px * (shaftWidth / 2), baseY + py * (shaftWidth / 2)],
        [baseX + px * headWidth, baseY + py * headWidth],
        [x2, y2],
        [baseX - px * headWidth, baseY - py * headWidth],
        [baseX - px * (shaftWidth / 2), baseY - py * (shaftWidth / 2)],
        [x1 - px * (shaftWidth / 2), y1 - py * (shaftWidth / 2)]
      ];
    };

    const buildDoubleArrowPoints = (x1, y1, x2, y2) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const shaftWidth = strokeWidth * 0.9;
      const headLen = Math.min(len * 0.28, cardWidth * 0.26);
      const headWidth = shaftWidth * 2.4;
      const leftBaseX = x1 + ux * headLen;
      const leftBaseY = y1 + uy * headLen;
      const rightBaseX = x2 - ux * headLen;
      const rightBaseY = y2 - uy * headLen;
      return [
        [x1, y1],
        [leftBaseX + px * headWidth, leftBaseY + py * headWidth],
        [leftBaseX + px * (shaftWidth / 2), leftBaseY + py * (shaftWidth / 2)],
        [rightBaseX + px * (shaftWidth / 2), rightBaseY + py * (shaftWidth / 2)],
        [rightBaseX + px * headWidth, rightBaseY + py * headWidth],
        [x2, y2],
        [rightBaseX - px * headWidth, rightBaseY - py * headWidth],
        [rightBaseX - px * (shaftWidth / 2), rightBaseY - py * (shaftWidth / 2)],
        [leftBaseX - px * (shaftWidth / 2), leftBaseY - py * (shaftWidth / 2)],
        [leftBaseX - px * headWidth, leftBaseY - py * headWidth]
      ];
    };

    state.annotations.forEach((ann) => {
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = strokeWidth * 0.8;
      ctx.shadowOffsetY = strokeWidth * 0.18;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (ann.type === "strike") {
        const rect = cardRects.get(ann.cardUids[0]);
        if (!rect) { ctx.restore(); return; }
        const coreWidth = strokeWidth * 1.45;
        const haloWidth = coreWidth + outlineExtra * 2;
        const drawX = (color, w) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(rect.x, rect.y);
          ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
          ctx.moveTo(rect.x + rect.w, rect.y);
          ctx.lineTo(rect.x, rect.y + rect.h);
          ctx.stroke();
        };
        drawX(ANNOTATION_LIGHT, haloWidth);
        ctx.shadowColor = "transparent";
        drawX(ANNOTATION_COLOR, coreWidth);
        ctx.restore();
        return;
      }

      if (ann.type === "label") {
        const rect = cardRects.get(ann.cardUids[0]);
        if (!rect) { ctx.restore(); return; }
        const fontSize = cardWidth * 0.13;
        const y = rect.y + rect.h + fontSize * 0.95;
        ctx.font = `700 ${fontSize}px "BgDisplay", Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#0b0f1a";
        ctx.lineWidth = Math.max(2, fontSize * 0.26);
        ctx.fillStyle = "#fff8e6";
        ctx.strokeText(ann.text || "", rect.x + rect.w / 2, y);
        ctx.shadowColor = "transparent";
        ctx.fillText(ann.text || "", rect.x + rect.w / 2, y);
        ctx.restore();
        return;
      }

      if (ann.type === "arrow") {
        const a = cardRects.get(ann.cardUids[0]);
        const b = cardRects.get(ann.cardUids[1]);
        if (!a || !b) { ctx.restore(); return; }
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const shorten = Math.min(cardWidth * 0.55, len * 0.35);
        const x1 = a.cx + ux * shorten;
        const y1 = a.cy + uy * shorten;
        const x2 = b.cx - ux * shorten;
        const y2 = b.cy - uy * shorten;
        const points = buildArrowPoints(x1, y1, x2, y2);
        ctx.fillStyle = ANNOTATION_LIGHT;
        ctx.strokeStyle = ANNOTATION_LIGHT;
        ctx.lineWidth = outlineExtra * 2;
        tracePath(points);
        ctx.fill();
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = ANNOTATION_COLOR;
        ctx.strokeStyle = ANNOTATION_DARK;
        ctx.lineWidth = Math.max(1, outlineExtra * 0.4);
        tracePath(points);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (ann.type === "plus") {
        const a = cardRects.get(ann.cardUids[0]);
        const b = cardRects.get(ann.cardUids[1]);
        if (!a || !b) { ctx.restore(); return; }
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const arm = cardWidth * 0.12;
        const barThick = strokeWidth * 1.15;
        const haloThick = barThick + outlineExtra * 1.6;
        const drawPlus = (color, w) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(mx - arm, my);
          ctx.lineTo(mx + arm, my);
          ctx.moveTo(mx, my - arm);
          ctx.lineTo(mx, my + arm);
          ctx.stroke();
        };
        drawPlus(ANNOTATION_LIGHT, haloThick);
        ctx.shadowColor = "transparent";
        drawPlus(ANNOTATION_COLOR, barThick);
        ctx.restore();
        return;
      }

      if (ann.type === "equals") {
        const a = cardRects.get(ann.cardUids[0]);
        const b = cardRects.get(ann.cardUids[1]);
        if (!a || !b) { ctx.restore(); return; }
        const mx = (a.cx + b.cx) / 2;
        const my = (a.cy + b.cy) / 2;
        const arm = cardWidth * 0.13;
        const gap = cardWidth * 0.08;
        const barThick = strokeWidth * 1.1;
        const haloThick = barThick + outlineExtra * 1.6;
        const drawEquals = (color, w) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(mx - arm, my - gap);
          ctx.lineTo(mx + arm, my - gap);
          ctx.moveTo(mx - arm, my + gap);
          ctx.lineTo(mx + arm, my + gap);
          ctx.stroke();
        };
        drawEquals(ANNOTATION_LIGHT, haloThick);
        ctx.shadowColor = "transparent";
        drawEquals(ANNOTATION_COLOR, barThick);
        ctx.restore();
        return;
      }

      if (ann.type === "double-arrow") {
        const a = cardRects.get(ann.cardUids[0]);
        const b = cardRects.get(ann.cardUids[1]);
        if (!a || !b) { ctx.restore(); return; }
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const shorten = Math.min(cardWidth * 0.55, len * 0.35);
        const x1 = a.cx + ux * shorten;
        const y1 = a.cy + uy * shorten;
        const x2 = b.cx - ux * shorten;
        const y2 = b.cy - uy * shorten;
        const points = buildDoubleArrowPoints(x1, y1, x2, y2);
        ctx.fillStyle = ANNOTATION_LIGHT;
        ctx.strokeStyle = ANNOTATION_LIGHT;
        ctx.lineWidth = outlineExtra * 2;
        tracePath(points);
        ctx.fill();
        ctx.stroke();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = ANNOTATION_COLOR;
        ctx.strokeStyle = ANNOTATION_DARK;
        ctx.lineWidth = Math.max(1, outlineExtra * 0.4);
        tracePath(points);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (ann.type === "question") {
        const rect = cardRects.get(ann.cardUids[0]);
        if (!rect) { ctx.restore(); return; }
        const radius = cardWidth * 0.22;
        const cx = rect.cx;
        const cy = rect.y + radius * 0.7;
        ctx.fillStyle = ANNOTATION_LIGHT;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + outlineExtra, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.fillStyle = ANNOTATION_COLOR;
        ctx.strokeStyle = ANNOTATION_DARK;
        ctx.lineWidth = Math.max(1, outlineExtra * 0.5);
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = ANNOTATION_LIGHT;
        ctx.font = `700 ${radius * 1.6}px "BgDisplay", Georgia, serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", cx, cy + radius * 0.05);
        ctx.restore();
        return;
      }
    });
  }

  async function exportBoard(fileType) {
    if (!state.placed.length) {
      setStatus("Сначала добавь хотя бы одну карту на полотно.");
      return;
    }

    const loadedEntries = await Promise.all(state.placed.map(async (card) => {
      try {
        const image = await window.Shared.loadImageFromSource(card.artUrl);
        return { card, image };
      } catch (error) {
        console.warn(`Не удалось загрузить карту ${card.name}:`, error);
        return null;
      }
    }));
    const entries = loadedEntries.filter(Boolean);

    if (!entries.length) {
      setStatus("Не удалось загрузить ни одной карты для экспорта.");
      return;
    }

    const occupiedRows = [...new Set(entries.map(({ card }) => Math.floor(card.slot / BOARD_COLUMNS)))].sort((a, b) => a - b);
    const rowMap = new Map(occupiedRows.map((row, index) => [row, index]));
    const exportRows = Math.max(1, occupiedRows.length);
    const cardWidth = (EXPORT_WIDTH - EXPORT_SIDE_PADDING * 2 - EXPORT_COLUMN_GAP * (BOARD_COLUMNS - 1)) / BOARD_COLUMNS;
    const maxCardHeight = Math.max(...entries.map(({ image }) => cardWidth * (image.height / image.width)));

    const rowsWithLabels = new Set();
    state.annotations.forEach((ann) => {
      if (ann.type !== "label") return;
      const card = state.placed.find((c) => c.uid === ann.cardUids[0]);
      if (!card) return;
      const orig = Math.floor(card.slot / BOARD_COLUMNS);
      const comp = rowMap.get(orig);
      if (comp !== undefined) rowsWithLabels.add(comp);
    });
    const labelFontSize = cardWidth * 0.13;
    const labelRowExtra = labelFontSize * 1.6;
    const rowOffsets = new Array(exportRows);
    let cursorY = EXPORT_TOP_PADDING;
    for (let r = 0; r < exportRows; r += 1) {
      rowOffsets[r] = cursorY;
      cursorY += maxCardHeight;
      if (rowsWithLabels.has(r)) cursorY += labelRowExtra;
      if (r < exportRows - 1) cursorY += EXPORT_ROW_GAP;
    }

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_WIDTH;
    canvas.height = Math.ceil(cursorY + EXPORT_BOTTOM_PADDING);
    const ctx = canvas.getContext("2d");

    const wallpaperUrl = getBackgroundUrl(state.backgroundMode);
    if (wallpaperUrl) {
      try {
        let wallpaper = wallpaperImageCache.get(wallpaperUrl);
        if (!wallpaper) {
          wallpaper = await window.Shared.loadImageFromSource(wallpaperUrl);
          wallpaperImageCache.set(wallpaperUrl, wallpaper);
        }
        const bleed = WALLPAPER_BLUR_PX * 4;
        const targetW = canvas.width + bleed * 2;
        const targetH = canvas.height + bleed * 2;
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
        ctx.filter = `blur(${WALLPAPER_BLUR_PX}px) brightness(${WALLPAPER_BRIGHTNESS})`;
        ctx.drawImage(wallpaper, drawX, drawY, drawW, drawH);
        ctx.restore();
        ctx.fillStyle = "rgba(4, 8, 16, 0.35)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } catch (error) {
        console.warn("Не удалось отрисовать игровой фон:", error);
      }
    }

    const cardRects = new Map();
    for (const { card, image } of entries) {
      const originalRow = Math.floor(card.slot / BOARD_COLUMNS);
      const compactRow = rowMap.get(originalRow) ?? 0;
      const imageRatio = image.width / image.height;
      const cardHeight = cardWidth / imageRatio;
      const column = card.slot % BOARD_COLUMNS;
      const x = EXPORT_SIDE_PADDING + column * (cardWidth + EXPORT_COLUMN_GAP);
      const rowTop = rowOffsets[compactRow];
      const y = rowTop + (maxCardHeight - cardHeight) / 2;
      cardRects.set(card.uid, { x, y, w: cardWidth, h: cardHeight, cx: x + cardWidth / 2, cy: y + cardHeight / 2 });
      if (card.highlighted) {
        ctx.save();
        ctx.shadowColor = "rgba(255, 222, 130, 1)";
        ctx.shadowBlur = 70;
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
        ctx.shadowBlur = 42;
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
        ctx.shadowBlur = 24;
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
        ctx.restore();
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
      } else {
        ctx.drawImage(image, x, y, cardWidth, cardHeight);
      }
    }

    drawAnnotationsOnCanvas(ctx, cardRects, cardWidth);

    const mimeType = fileType === "png" ? "image/png" : "image/webp";
    const extension = fileType === "png" ? "png" : "webp";
    const quality = fileType === "png" ? 1 : 0.98;

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Не удалось собрать стратегию.")), mimeType, quality);
    });

    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `strategy-board.${extension}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1200);
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
      id: String(card.id),
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
      englishName: "",
      slug: "",
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

  async function bootstrap() {
    try {
      const [libraryPayload, spellsPayload, englishNamesPayload] = await Promise.all([
        window.Shared.loadBattlegroundsLibrary({ locale: "ruRU", includeEnglish: true }),
        loadOptionalJson("/api/battlegrounds-spells?locale=ru_RU&pageSize=200", "заклинания"),
        loadOptionalJson("/api/battlegrounds-card-names?locale=en_US", "английские названия")
      ]);

      const englishCards = englishNamesPayload.cards || [];
      const englishByKey = new Map();
      englishCards.forEach((card) => {
        if (card?.id != null) {
          englishByKey.set(String(card.id), card);
        }
        if (card?.slug) {
          englishByKey.set(`slug:${String(card.slug)}`, card);
        }
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

      state.cards = [...heroes, ...minions, ...spells, ...accessories];
      syncAccessorySizeFilter();
      renderSourceFilters();
      renderRaceFilters();
      renderLevelFilters();
      renderAccessoryFilters();
      updateLibrary();
      renderBoard();
      renderQuickSlots();
      renderCommunitySlots();
      applyBoardVisualSettings();
      applyPanelVisibility();
    } catch (error) {
      console.error(error);
      setStatus("Не удалось загрузить библиотеку героев, карт и заклинаний.");
    }
  }

  function updateLibrary() {
    state.filtered = state.cards.filter(matchesFilters);
    renderLibrary();
  }

  boardEl.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  boardEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const card = readCardFromDataTransfer(event.dataTransfer);
    if (!card) {
      return;
    }

    addCardToBoard(card, getNearestSlot(event.clientX, event.clientY));
  });

  function readCardFromDataTransfer(dataTransfer) {
    const rich = dataTransfer.getData("application/x-bg-card");
    if (rich) {
      try {
        const parsed = JSON.parse(rich);
        const found = findCard(parsed.id, parsed.source);
        if (found) {
          return found;
        }
      } catch (error) {
        // fall through to text/plain
      }
    }
    const cardId = dataTransfer.getData("text/plain");
    return state.cards.find((item) => String(item.id) === String(cardId)) || null;
  }

  searchInput.addEventListener("input", window.Shared.debounce((event) => {
    state.search = event.target.value;
    updateLibrary();
  }, 120));

  clearButton.addEventListener("click", () => {
    state.placed = [];
    state.activeId = null;
    state.annotations = [];
    state.pendingAnnotation = null;
    renderBoard();
  });

  annotationToolButtons.forEach((button) => {
    button.addEventListener("click", () => setAnnotationTool(button.dataset.annTool));
  });

  if (clearAnnotationsButton) {
    clearAnnotationsButton.addEventListener("click", () => {
      state.annotations = [];
      state.pendingAnnotation = null;
      renderBoard();
    });
  }

  let resizeRaf = null;
  window.addEventListener("resize", () => {
    if (!state.annotations.length && !state.pendingAnnotation) return;
    if (resizeRaf !== null) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null;
      renderAnnotationOverlay();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (state.annotationTool || state.pendingAnnotation) {
      state.annotationTool = null;
      state.pendingAnnotation = null;
      applyAnnotationToolUi();
      renderBoard();
      event.preventDefault();
    }
  });

  applyAnnotationToolUi();

  exportPngButton.addEventListener("click", () => exportBoard("png"));
  exportWebpButton.addEventListener("click", () => exportBoard("webp"));

  if (toggleGridButton) {
    toggleGridButton.addEventListener("click", () => {
      state.showGrid = !state.showGrid;
      applyBoardVisualSettings();
    });
  }


  document.addEventListener("wheel", (event) => {
    if (state.draggingLibrary || state.draggingPlaced) {
      window.scrollBy({ top: event.deltaY, left: event.deltaX, behavior: "auto" });
    }
  }, { passive: true });

  // --- Колонки библиотеки ---

  const LIBRARY_COLUMNS_STORAGE_KEY = "strategy-builder-library-columns-v1";
  const LIBRARY_COLUMNS_MIN = 2;
  const LIBRARY_COLUMNS_MAX = 5;
  const libraryColumnsInput = document.getElementById("builder-library-columns");
  const libraryColumnsValueEl = document.getElementById("builder-library-columns-value");

  function loadLibraryColumns() {
    try {
      const value = Number.parseInt(window.localStorage.getItem(LIBRARY_COLUMNS_STORAGE_KEY), 10);
      if (Number.isFinite(value)) {
        return Math.min(LIBRARY_COLUMNS_MAX, Math.max(LIBRARY_COLUMNS_MIN, value));
      }
    } catch (error) {
      // ignore
    }
    return 3;
  }

  let libraryColumns = loadLibraryColumns();

  function applyLibraryColumns() {
    if (libraryEl) {
      libraryEl.style.setProperty("--library-columns", String(libraryColumns));
    }
    if (libraryColumnsValueEl) {
      libraryColumnsValueEl.textContent = String(libraryColumns);
    }
    if (libraryColumnsInput && libraryColumnsInput.value !== String(libraryColumns)) {
      libraryColumnsInput.value = String(libraryColumns);
    }
  }

  if (libraryColumnsInput) {
    libraryColumnsInput.min = String(LIBRARY_COLUMNS_MIN);
    libraryColumnsInput.max = String(LIBRARY_COLUMNS_MAX);
    libraryColumnsInput.addEventListener("input", () => {
      const value = Number.parseInt(libraryColumnsInput.value, 10);
      if (!Number.isFinite(value)) return;
      libraryColumns = Math.min(LIBRARY_COLUMNS_MAX, Math.max(LIBRARY_COLUMNS_MIN, value));
      applyLibraryColumns();
      try {
        window.localStorage.setItem(LIBRARY_COLUMNS_STORAGE_KEY, String(libraryColumns));
      } catch (error) {
        // ignore
      }
    });
  }

  applyLibraryColumns();

  // --- Готовые сборки (HSReplay / Firestone) ---

  const compSelect = document.getElementById("builder-comp-select");
  const compApplyButton = document.getElementById("builder-comp-apply");
  const compInfoEl = document.getElementById("builder-comp-info");
  const compCardsEl = document.getElementById("builder-comp-cards");
  let compsList = [];

  function compCardArtUrl(compCard, size = "256x") {
    return `https://art.hearthstonejson.com/v1/bgs/latest/ruRU/${encodeURIComponent(size)}/${encodeURIComponent(compCard.id)}.png`;
  }

  function renderCompCards(comp) {
    if (!compCardsEl) return;
    compCardsEl.replaceChildren();
    if (!comp) {
      compCardsEl.hidden = true;
      return;
    }
    comp.cards.slice(0, 15).forEach((compCard) => {
      const img = document.createElement("img");
      img.className = `comp-import-thumb${compCard.role === "CORE" ? " is-core" : ""}`;
      img.src = compCardArtUrl(compCard);
      img.alt = compCard.ruName || compCard.name;
      img.title = `${compCard.ruName || compCard.name}${compCard.role === "CORE" ? " · ядро сборки" : ""}`;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", () => {
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = `/api/card-art?id=${encodeURIComponent(compCard.id)}&locale=ruRU&size=256x`;
        } else {
          img.remove();
        }
      });
      compCardsEl.append(img);
    });
    compCardsEl.hidden = false;
  }

  async function loadComps() {
    try {
      const payload = await window.Shared.loadJson("/api/bg-comps");
      if (Array.isArray(payload.comps) && payload.comps.length) {
        return payload.comps;
      }
      throw new Error("Пустой список сборок.");
    } catch (error) {
      console.warn("Сборки из API недоступны, использую локальный снапшот.", error);
    }
    return (window.compsStatic && window.compsStatic.comps) || [];
  }

  function populateCompSelect() {
    if (!compSelect) return;
    compSelect.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = compsList.length ? "Выбери сборку..." : "Сборки недоступны";
    compSelect.append(placeholder);

    const bySource = new Map();
    compsList.forEach((comp) => {
      if (!bySource.has(comp.source)) {
        bySource.set(comp.source, []);
      }
      bySource.get(comp.source).push(comp);
    });
    bySource.forEach((comps, source) => {
      const group = document.createElement("optgroup");
      group.label = source;
      comps
        .slice()
        .sort((left, right) => String(left.title).localeCompare(String(right.title), "ru-RU"))
        .forEach((comp) => {
          const option = document.createElement("option");
          option.value = comp.key;
          const tierPrefix = comp.tier ? `[${comp.tier}] ` : "";
          option.textContent = `${tierPrefix}${comp.title}`;
          group.append(option);
        });
      compSelect.append(group);
    });
  }

  function selectedComp() {
    return compsList.find((comp) => comp.key === compSelect?.value) || null;
  }

  function renderCompInfo() {
    if (!compInfoEl) return;
    const comp = selectedComp();
    if (!comp) {
      compInfoEl.hidden = true;
      compInfoEl.textContent = "";
      renderCompCards(null);
      if (compApplyButton) compApplyButton.disabled = true;
      return;
    }
    const bits = [comp.source];
    if (comp.tier) bits.push(`${comp.tier}-тир`);
    if (comp.difficulty) bits.push(`сложность: ${comp.difficulty}`);
    if (comp.avgPlacement) bits.push(`среднее место ${comp.avgPlacement}`);
    bits.push(`${comp.cards.length} карт`);
    compInfoEl.textContent = `${bits.join(" · ")}${comp.description ? ` — ${comp.description}` : ""}`;
    compInfoEl.hidden = false;
    renderCompCards(comp);
    if (compApplyButton) compApplyButton.disabled = false;
  }

  function normalizeCompName(value) {
    return String(value || "").toLowerCase().replace(/['’`]/g, "'").replace(/\s+/g, " ").trim();
  }

  function findLibraryCardForCompCard(compCard) {
    const id = String(compCard.id || "");
    const direct = state.cards.find((card) => card.source === "MINION" && String(card.id) === id);
    if (direct) return direct;

    if (compCard.dbfId) {
      const spell = state.cards.find((card) => card.source === "SPELL" && String(card.id) === `spell-${compCard.dbfId}`);
      if (spell) return spell;
    }

    const en = normalizeCompName(compCard.name);
    if (en) {
      const byEnglish = state.cards.find((card) => (
        (card.source === "MINION" || card.source === "SPELL") && normalizeCompName(card.englishName) === en
      ));
      if (byEnglish) return byEnglish;
    }

    const ru = normalizeCompName(compCard.ruName);
    if (ru) {
      const byRussian = state.cards.find((card) => (
        (card.source === "MINION" || card.source === "SPELL") && normalizeCompName(card.name) === ru
      ));
      if (byRussian) return byRussian;
    }

    return null;
  }

  function applyComp(comp) {
    if (!comp) return;
    if (!state.cards.length) {
      setStatus("Библиотека ещё загружается — попробуй через пару секунд.");
      return;
    }
    if (state.placed.length && !window.confirm(`Полотно будет очищено и заполнено сборкой «${comp.title}». Продолжить?`)) {
      return;
    }

    state.placed = [];
    state.activeId = null;
    state.annotations = [];
    state.pendingAnnotation = null;

    const missing = [];
    const added = new Set();
    let placedCount = 0;
    const ordered = [
      ...comp.cards.filter((card) => card.role === "CORE"),
      ...comp.cards.filter((card) => card.role !== "CORE")
    ];

    for (const compCard of ordered) {
      if (placedCount >= BOARD_SLOT_COUNT) {
        break;
      }
      const libraryCard = findLibraryCardForCompCard(compCard);
      if (!libraryCard) {
        missing.push(compCard.ruName || compCard.name);
        continue;
      }
      const key = `${libraryCard.source}:${libraryCard.id}`;
      if (added.has(key)) {
        continue;
      }
      addCardToBoard(libraryCard);
      added.add(key);
      placedCount += 1;
    }

    const parts = [`Сборка «${comp.title}» (${comp.source}): на полотне ${placedCount} карт`];
    if (missing.length) {
      parts.push(`не найдено в библиотеке: ${missing.join(", ")}`);
    }
    setStatus(`${parts.join(". ")}.`);
  }

  async function initCompImport() {
    if (!compSelect || !compApplyButton) return;
    compsList = await loadComps();
    populateCompSelect();
    renderCompInfo();
    renderCommunitySlots();
    compSelect.addEventListener("change", renderCompInfo);
    compApplyButton.addEventListener("click", () => applyComp(selectedComp()));
  }

  bindPanelToggle(hideQuickSlotsInput, "hideQuickSlots", HIDE_QUICK_SLOTS_STORAGE_KEY);
  bindPanelToggle(hideCommunitySlotsInput, "hideCommunitySlots", HIDE_COMMUNITY_SLOTS_STORAGE_KEY);
  bindPanelToggle(hideAnnotationsInput, "hideAnnotations", HIDE_ANNOTATIONS_STORAGE_KEY);
  applyPanelVisibility();

  initCompImport();

  bootstrap();
})();
