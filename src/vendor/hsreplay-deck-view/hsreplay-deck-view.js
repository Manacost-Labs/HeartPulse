(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HSReplayDeckView = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  "use strict";

  const DEFAULT_OPTIONS = {
    locale: "ruRU",
    dataUrl: "https://api.hearthstonejson.com/v1/latest/{locale}/cards.collectible.json",
    artBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    artFormat: "webp",
    className: "",
    group: true,
    sort: true,
    clear: true,
    showLegendaryAsStar: true,
    showSingleCountBox: false,
    imageFallbackFormat: "png",
    iconBadgeSingleCount: false,
    archetypeArtBaseUrl: "https://art.hearthstonejson.com/v1/256x/",
    archetypeArtFormat: "webp",
    archetypeIconBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    archetypeIconFormat: "webp",
    stonePortraitArtBaseUrl: "https://art.hearthstonejson.com/v1/256x/",
    stonePortraitArtFormat: "webp",
    stonePortraitFrameImage: "https://static.hsreplay.net/static/webpack/assets/images/battlegrounds/minion-frame.d21732172d83faeae997.png",
    synergyArtBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    synergyArtFormat: "webp",
    mulliganArtBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    mulliganArtFormat: "webp",
    matchupArtBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    matchupArtFormat: "webp",
    matchupIconBaseUrl: "https://art.hearthstonejson.com/v1/tiles/",
    matchupIconFormat: "webp",
    costCurveMaxCost: 7,
    costCurveOverLabel: "7+",
    costCurveShowTotal: true
  };

  const RARITY_ORDER = {
    free: 0,
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4
  };

  const MULLIGAN_STATUS_LABELS = {
    keep: "оставлять",
    situational: "ситуативно",
    replace: "менять"
  };

  const META_BADGE_KINDS = new Set([
    "tier-1",
    "tier-2",
    "counter",
    "meme",
    "rising",
    "falling"
  ]);

  const databaseCache = new Map();

  function withDefaults(options) {
    return Object.assign({}, DEFAULT_OPTIONS, options || {});
  }

  function resolveTarget(target) {
    if (typeof target === "string") {
      const element = document.querySelector(target);
      if (!element) {
        throw new Error(`HSReplayDeckView: target not found: ${target}`);
      }
      return element;
    }
    if (!target || typeof target.appendChild !== "function") {
      throw new Error("HSReplayDeckView: target must be an Element or selector");
    }
    return target;
  }

  function parseDeckCards(input) {
    if (Array.isArray(input)) {
      return input.map(Number).filter(Number.isFinite);
    }
    if (typeof input !== "string") {
      return [];
    }
    return input
      .split(/[,\s]+/)
      .map((value) => Number(value.trim()))
      .filter(Number.isFinite);
  }

  function normalizeRarity(rarity) {
    return String(rarity || "common").toLowerCase();
  }

  function normalizeArtAxis(value, fallback) {
    if (value === null || typeof value === "undefined" || value === "") {
      return fallback;
    }
    if (Number.isFinite(Number(value))) {
      return `${Number(value)}%`;
    }
    return String(value).trim() || fallback;
  }

  function normalizeArtBackgroundSize(value) {
    if (value === null || typeof value === "undefined" || value === "") {
      return "";
    }
    if (Number.isFinite(Number(value))) {
      const scale = Number(value);
      return `auto ${scale <= 10 ? scale * 100 : scale}%`;
    }

    const text = String(value).trim();
    if (!text) {
      return "";
    }
    if (/^-?\d+(\.\d+)?%$/.test(text)) {
      return `auto ${text}`;
    }
    return text;
  }

  function getArtPresentation(raw) {
    if (!raw || typeof raw !== "object") {
      return {
        artPosition: "",
        artSize: ""
      };
    }

    const focus = raw.focus && typeof raw.focus === "object" ? raw.focus : {};
    const focusX = raw.focusX ?? raw.artFocusX ?? raw.backgroundFocusX ?? focus.x;
    const focusY = raw.focusY ?? raw.artFocusY ?? raw.backgroundFocusY ?? focus.y;
    const explicitPosition = raw.position
      || raw.artPosition
      || raw.backgroundPosition
      || raw.objectPosition
      || raw.imagePosition
      || "";
    const artPosition = explicitPosition
      ? String(explicitPosition).trim()
      : (typeof focusX !== "undefined" || typeof focusY !== "undefined")
        ? `${normalizeArtAxis(focusX, "50%")} ${normalizeArtAxis(focusY, "50%")}`
        : "";
    const artSize = normalizeArtBackgroundSize(
      raw.backgroundSize ?? raw.artSize ?? raw.scale ?? raw.artScale ?? raw.zoom
    );

    return {
      artPosition,
      artSize
    };
  }

  function applyArtPresentation(element, item) {
    if (item.artPosition) {
      element.style.setProperty("--hsrdv-card-art-position", item.artPosition);
    }
    if (item.artSize) {
      element.style.setProperty("--hsrdv-card-art-background-size", item.artSize);
    }
  }

  function setMaskedArtBackground(element, artUrl) {
    element.style.backgroundImage = `url("${artUrl}"), url("${artUrl}")`;
  }

  function normalizeCard(card) {
    const rarity = normalizeRarity(card.rarity);
    const artPresentation = getArtPresentation(card);
    return {
      id: card.id || card.cardId || "",
      dbfId: card.dbfId || card.dbf_id || null,
      name: card.name || "Unknown card",
      cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : 0,
      rarity,
      elite: Boolean(card.elite) || rarity === "legendary",
      count: Math.max(1, Number(card.count || 1)),
      image: card.image || card.imageUrl || card.art || "",
      artPosition: artPresentation.artPosition,
      artSize: artPresentation.artSize,
      predicted: Boolean(card.predicted)
    };
  }

  function getCardKey(card) {
    return card.dbfId || card.id || card.name;
  }

  function groupCards(cards) {
    const grouped = new Map();
    cards.forEach((rawCard) => {
      const card = normalizeCard(rawCard);
      const key = getCardKey(card);
      if (!grouped.has(key)) {
        grouped.set(key, card);
        return;
      }
      grouped.get(key).count += card.count;
    });
    return Array.from(grouped.values());
  }

  function sortCards(cards) {
    return cards.slice().sort((a, b) => {
      if (a.cost !== b.cost) {
        return a.cost - b.cost;
      }
      const rarityDiff = (RARITY_ORDER[a.rarity] ?? 99) - (RARITY_ORDER[b.rarity] ?? 99);
      if (rarityDiff !== 0) {
        return rarityDiff;
      }
      return a.name.localeCompare(b.name, "ru");
    });
  }

  function getArtUrl(card, options) {
    if (card.image) {
      return card.image;
    }
    if (!card.id) {
      return "";
    }
    return `${options.artBaseUrl}${card.id}.${options.artFormat}`;
  }

  function isDirectImageUrl(value) {
    return /^(https?:)?\/\//i.test(value)
      || /^(data|blob):/i.test(value)
      || value.startsWith("/")
      || value.startsWith("./")
      || value.startsWith("../");
  }

  function getArtworkId(artwork) {
    if (!artwork) {
      return "";
    }
    if (typeof artwork === "string") {
      return artwork.trim();
    }
    return String(artwork.id || artwork.cardId || artwork.card_id || "").trim();
  }

  function getArtworkUrl(artwork, baseUrl, format) {
    if (!artwork) {
      return "";
    }
    if (typeof artwork === "string") {
      const value = artwork.trim();
      if (!value) {
        return "";
      }
      return isDirectImageUrl(value) ? value : `${baseUrl}${value}.${format}`;
    }

    const directUrl = artwork.image || artwork.imageUrl || artwork.art || artwork.url || artwork.src;
    if (directUrl) {
      return directUrl;
    }

    const id = getArtworkId(artwork);
    return id ? `${baseUrl}${id}.${format}` : "";
  }

  function getArchetypeArtUrl(artwork, options) {
    return getArtworkUrl(artwork, options.archetypeArtBaseUrl, options.archetypeArtFormat);
  }

  function getArchetypeIconUrl(artwork, options) {
    return getArtworkUrl(artwork, options.archetypeIconBaseUrl, options.archetypeIconFormat);
  }

  function getStonePortraitArtUrl(portrait, options) {
    if (portrait.image) {
      return portrait.image;
    }
    if (!portrait.id) {
      return "";
    }
    return `${options.stonePortraitArtBaseUrl}${portrait.id}.${options.stonePortraitArtFormat}`;
  }

  function getSynergyArtUrl(item, options) {
    if (item.image) {
      return item.image;
    }
    if (!item.id) {
      return "";
    }
    return `${options.synergyArtBaseUrl}${item.id}.${options.synergyArtFormat}`;
  }

  function getMulliganArtUrl(item, options) {
    if (item.image) {
      return item.image;
    }
    if (!item.id) {
      return "";
    }
    return `${options.mulliganArtBaseUrl}${item.id}.${options.mulliganArtFormat}`;
  }

  function getMatchupArtUrl(item, options) {
    if (item.image) {
      return item.image;
    }
    if (!item.id) {
      return "";
    }
    return `${options.matchupArtBaseUrl}${item.id}.${options.matchupArtFormat}`;
  }

  function getMatchupIconUrl(matchup, options) {
    return getArtworkUrl(matchup.icon, options.matchupIconBaseUrl, options.matchupIconFormat);
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (typeof text !== "undefined") {
      element.textContent = text;
    }
    return element;
  }

  function shouldShowCountBox(card, options) {
    return options.showSingleCountBox || card.count > 1 || (options.showLegendaryAsStar && card.elite);
  }

  function getCountLabel(card, options) {
    if (options.showLegendaryAsStar && card.elite && card.count === 1) {
      return "★";
    }
    return String(card.count);
  }

  function getIconBadgeLabel(card, options) {
    if (options.showLegendaryAsStar && card.elite && card.count === 1) {
      return "★";
    }
    if (card.count > 1) {
      return `×${card.count}`;
    }
    if (options.iconBadgeSingleCount) {
      return String(card.count);
    }
    return "";
  }

  function prepareCards(cards, options) {
    const normalized = options.group ? groupCards(cards) : cards.map(normalizeCard);
    return options.sort ? sortCards(normalized) : normalized;
  }

  function parseArchetypeArtworks(input) {
    if (Array.isArray(input)) {
      return input;
    }
    if (typeof input !== "string") {
      return [];
    }
    return input.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  }

  function parseSynergyItems(input) {
    if (Array.isArray(input)) {
      return input;
    }
    if (typeof input !== "string") {
      return [];
    }
    return input.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  }

  function parseCardItems(input) {
    if (Array.isArray(input)) {
      return input;
    }
    if (typeof input !== "string") {
      return [];
    }
    return input.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  }

  function parsePercent(value) {
    if (value === null || typeof value === "undefined") {
      return null;
    }
    if (typeof value === "string" && value.trim() === "") {
      return null;
    }
    if (Number.isFinite(Number(value))) {
      return Number(value);
    }
    if (typeof value !== "string") {
      return null;
    }
    const parsed = Number.parseFloat(value.replace(",", ".").replace("%", ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function clampPercent(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, value));
  }

  function formatPercent(value) {
    const parsed = parsePercent(value);
    if (parsed === null) {
      return value ? String(value) : "";
    }
    return `${parsed.toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
      minimumFractionDigits: Number.isInteger(parsed) ? 0 : 1
    })}%`;
  }

  function formatNumber(value) {
    if (value === null || typeof value === "undefined" || value === "") {
      return "";
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return String(value);
    }
    return parsed.toLocaleString("ru-RU");
  }

  function normalizeArchetype(archetype) {
    if (typeof archetype === "string") {
      return {
        name: archetype,
        icon: "",
        arts: [],
        stats: [],
        url: ""
      };
    }

    const raw = archetype || {};
    return {
      name: raw.name || raw.title || "Unknown archetype",
      icon: raw.icon || raw.iconUrl || raw.classIcon || raw.classIconUrl || raw.image || raw.iconCardId || "",
      iconAlt: raw.iconAlt || raw.className || raw.name || raw.title || "",
      arts: parseArchetypeArtworks(raw.arts || raw.artworks || raw.cards || raw.cardIds || raw.backgroundCards),
      stats: Array.isArray(raw.stats) ? raw.stats : [],
      url: raw.url || raw.href || "",
      label: raw.label || raw.ariaLabel || ""
    };
  }

  function normalizeStonePortrait(portrait) {
    if (typeof portrait === "string") {
      const value = portrait.trim();
      const isImage = isDirectImageUrl(value);
      return {
        id: isImage ? "" : value,
        dbfId: null,
        name: value || "Unknown card",
        image: isImage ? value : "",
        href: "",
        position: "",
        predicted: false
      };
    }

    const raw = portrait || {};
    const id = String(raw.id || raw.cardId || raw.card_id || "").trim();
    return {
      id,
      dbfId: raw.dbfId || raw.dbf_id || null,
      name: raw.name || raw.title || id || "Unknown card",
      image: raw.image || raw.imageUrl || raw.art || raw.src || raw.portrait || raw.url || "",
      href: raw.href || "",
      position: raw.position || raw.objectPosition || raw.imagePosition || "",
      predicted: Boolean(raw.predicted)
    };
  }

  function normalizeSynergyItem(item) {
    if (typeof item === "number") {
      return normalizeSynergyItem(String(item));
    }
    if (typeof item === "string") {
      const value = item.trim();
      const isImage = isDirectImageUrl(value);
      return {
        id: isImage ? "" : value,
        dbfId: null,
        name: value || "Unknown card",
        label: "",
        image: isImage ? value : "",
        href: "",
        rarity: "common",
        count: 1,
        elite: false,
        artPosition: "",
        artSize: "",
        predicted: false
      };
    }

    const raw = item || {};
    const rarity = normalizeRarity(raw.rarity);
    const artPresentation = getArtPresentation(raw);
    return {
      id: String(raw.id || raw.cardId || raw.card_id || "").trim(),
      dbfId: raw.dbfId || raw.dbf_id || null,
      name: raw.name || raw.title || raw.cardName || raw.id || "Unknown card",
      label: raw.label || raw.caption || raw.role || raw.note || "",
      image: raw.image || raw.imageUrl || raw.art || raw.src || "",
      href: raw.href || raw.url || "",
      rarity,
      count: Math.max(1, Number(raw.count || 1)),
      elite: Boolean(raw.elite) || rarity === "legendary",
      artPosition: artPresentation.artPosition,
      artSize: artPresentation.artSize,
      predicted: Boolean(raw.predicted)
    };
  }

  function normalizeSynergy(synergy) {
    if (Array.isArray(synergy)) {
      return {
        title: "Synergy",
        subtitle: "",
        eyebrow: "",
        badge: "",
        connector: "plus",
        items: synergy.map(normalizeSynergyItem),
        result: null,
        url: "",
        label: ""
      };
    }

    if (typeof synergy === "string") {
      return {
        title: synergy,
        subtitle: "",
        eyebrow: "",
        badge: "",
        connector: "plus",
        items: [],
        result: null,
        url: "",
        label: synergy
      };
    }

    const raw = synergy || {};
    const connector = String(raw.connector || raw.operator || raw.joiner || "plus").toLowerCase();
    const result = raw.result || raw.outcome || raw.payoff || null;
    return {
      title: raw.title || raw.name || "Synergy",
      subtitle: raw.subtitle || raw.description || raw.text || "",
      eyebrow: raw.eyebrow || raw.type || raw.category || "",
      badge: raw.badge || raw.tag || "",
      connector: connector === "arrow" || connector === "then" || connector === "to" ? "arrow" : "plus",
      items: parseSynergyItems(raw.items || raw.cards || raw.minions || raw.cardIds || raw.sequence).map(normalizeSynergyItem),
      result,
      url: raw.url || raw.href || "",
      label: raw.label || raw.ariaLabel || raw.title || raw.name || "Synergy"
    };
  }

  function normalizeMulliganStatus(status, keepRate) {
    const value = String(status || "").trim().toLowerCase();
    if (["keep", "hold", "always", "good", "оставлять", "оставить", "кип"].includes(value)) {
      return "keep";
    }
    if (["situational", "case", "maybe", "coin", "matchup", "ситуативно", "по ситуации"].includes(value)) {
      return "situational";
    }
    if (["replace", "change", "mulligan", "bad", "менять", "заменить", "скидывать"].includes(value)) {
      return "replace";
    }

    const parsedKeepRate = parsePercent(keepRate);
    if (parsedKeepRate !== null) {
      if (parsedKeepRate >= 62) {
        return "keep";
      }
      if (parsedKeepRate >= 45) {
        return "situational";
      }
      return "replace";
    }
    return "situational";
  }

  function normalizeMulliganItem(item) {
    if (typeof item === "number") {
      return normalizeMulliganItem(String(item));
    }
    if (typeof item === "string") {
      const value = item.trim();
      const isImage = isDirectImageUrl(value);
      return {
        id: isImage ? "" : value,
        dbfId: null,
        name: value || "Unknown card",
        image: isImage ? value : "",
        href: "",
        rarity: "common",
        keepRate: "",
        winrate: "",
        status: "situational",
        note: "",
        artPosition: "",
        artSize: "",
        predicted: false
      };
    }

    const raw = item || {};
    const keepRate = raw.keepRate ?? raw.keep ?? raw.kept ?? raw.keepPercent ?? raw.keep_percentage ?? "";
    const status = normalizeMulliganStatus(raw.status || raw.decision || raw.state || raw.label, keepRate);
    const artPresentation = getArtPresentation(raw);
    return {
      id: String(raw.id || raw.cardId || raw.card_id || "").trim(),
      dbfId: raw.dbfId || raw.dbf_id || null,
      name: raw.name || raw.title || raw.cardName || raw.id || "Unknown card",
      image: raw.image || raw.imageUrl || raw.art || raw.src || "",
      href: raw.href || raw.url || "",
      rarity: normalizeRarity(raw.rarity),
      keepRate,
      winrate: raw.winrate ?? raw.winRate ?? raw.wr ?? "",
      status,
      note: raw.note || raw.reason || raw.caption || "",
      artPosition: artPresentation.artPosition,
      artSize: artPresentation.artSize,
      predicted: Boolean(raw.predicted)
    };
  }

  function normalizeMulligan(mulligan) {
    if (Array.isArray(mulligan)) {
      return {
        title: "Mulligan",
        subtitle: "",
        badge: "",
        cards: mulligan.map(normalizeMulliganItem),
        url: "",
        label: "Mulligan"
      };
    }

    const raw = mulligan || {};
    return {
      title: raw.title || raw.name || "Стартовая рука",
      subtitle: raw.subtitle || raw.description || raw.text || "",
      badge: raw.badge || raw.tag || raw.context || "",
      cards: parseCardItems(raw.cards || raw.items || raw.hand || raw.cardIds).map(normalizeMulliganItem),
      url: raw.url || raw.href || "",
      label: raw.label || raw.ariaLabel || raw.title || raw.name || "Mulligan"
    };
  }

  function normalizeMatchupStatus(status, winrate) {
    const value = String(status || "").trim().toLowerCase();
    if (["favored", "favorable", "good", "advantage", "выгодный", "хороший"].includes(value)) {
      return "favored";
    }
    if (["even", "neutral", "mirror", "ровный", "средний"].includes(value)) {
      return "even";
    }
    if (["unfavored", "bad", "disadvantage", "weak", "плохой", "невыгодный"].includes(value)) {
      return "unfavored";
    }

    const parsedWinrate = parsePercent(winrate);
    if (parsedWinrate !== null) {
      if (parsedWinrate >= 53) {
        return "favored";
      }
      if (parsedWinrate <= 47) {
        return "unfavored";
      }
    }
    return "even";
  }

  function normalizeMatchupCard(card) {
    if (typeof card === "number") {
      return normalizeMatchupCard(String(card));
    }
    if (typeof card === "string") {
      const value = card.trim();
      const isImage = isDirectImageUrl(value);
      return {
        id: isImage ? "" : value,
        dbfId: null,
        name: value || "Unknown card",
        image: isImage ? value : "",
        rarity: "common",
        count: 1,
        elite: false,
        artPosition: "",
        artSize: ""
      };
    }
    const raw = card || {};
    const rarity = normalizeRarity(raw.rarity);
    const artPresentation = getArtPresentation(raw);
    return {
      id: String(raw.id || raw.cardId || raw.card_id || "").trim(),
      dbfId: raw.dbfId || raw.dbf_id || null,
      name: raw.name || raw.title || raw.cardName || raw.id || "Unknown card",
      image: raw.image || raw.imageUrl || raw.art || raw.src || "",
      rarity,
      count: Math.max(1, Number(raw.count || 1)),
      elite: Boolean(raw.elite) || rarity === "legendary",
      artPosition: artPresentation.artPosition,
      artSize: artPresentation.artSize
    };
  }

  function normalizeMatchup(matchup) {
    const raw = matchup || {};
    const winrate = raw.winrate ?? raw.winRate ?? raw.wr ?? raw.value ?? "";
    const status = normalizeMatchupStatus(raw.status || raw.result || raw.state, winrate);
    return {
      name: raw.name || raw.title || raw.opponent || raw.className || "Unknown matchup",
      className: raw.className || raw.class || raw.hero || "",
      icon: raw.icon || raw.iconUrl || raw.classIcon || raw.classIconUrl || raw.image || "",
      winrate,
      games: raw.games ?? raw.matches ?? raw.count ?? "",
      status,
      note: raw.note || raw.description || "",
      cards: parseCardItems(raw.cards || raw.keyCards || raw.items || raw.cardIds).map(normalizeMatchupCard),
      url: raw.url || raw.href || "",
      label: raw.label || raw.ariaLabel || raw.name || raw.title || "Matchup"
    };
  }

  function normalizeMetaKind(kind, label) {
    const value = String(kind || label || "").trim().toLowerCase().replace(/\s+/g, "-");
    const normalized = value
      .replace(/^t1$/, "tier-1")
      .replace(/^tier1$/, "tier-1")
      .replace(/^t2$/, "tier-2")
      .replace(/^tier2$/, "tier-2");
    return META_BADGE_KINDS.has(normalized) ? normalized : "tier-2";
  }

  function normalizeMetaBadge(badge) {
    const raw = badge || {};
    const label = raw.label || raw.badge || raw.tier || raw.kind || "Tier 2";
    const kind = normalizeMetaKind(raw.kind || raw.type || raw.status, label);
    return {
      kind,
      label,
      title: raw.title || raw.name || label,
      value: raw.value || raw.score || raw.winrate || "",
      delta: raw.delta || raw.trend || raw.change || "",
      description: raw.description || raw.text || raw.note || "",
      url: raw.url || raw.href || "",
      labelText: raw.ariaLabel || raw.title || raw.name || label
    };
  }

  function getCostCurveMaxCost(rawMaxCost, options) {
    const parsed = Number(rawMaxCost ?? options.costCurveMaxCost);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 7;
  }

  function createEmptyCostBuckets(maxCost, overLabel) {
    return Array.from({ length: maxCost + 1 }, (_, cost) => ({
      cost,
      label: cost === maxCost ? overLabel : String(cost),
      count: 0
    }));
  }

  function normalizeCostBucketCost(value, index, maxCost) {
    if (typeof value === "string" && value.includes("+")) {
      return maxCost;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(maxCost, Math.floor(parsed)));
    }
    return Math.max(0, Math.min(maxCost, index));
  }

  function normalizeCostCurveBuckets(input, maxCost, overLabel) {
    const buckets = createEmptyCostBuckets(maxCost, overLabel);
    if (!input) {
      return null;
    }

    if (Array.isArray(input)) {
      input.forEach((bucket, index) => {
        if (Number.isFinite(Number(bucket))) {
          buckets[Math.min(index, maxCost)].count += Math.max(0, Number(bucket));
          return;
        }
        const raw = bucket || {};
        const cost = normalizeCostBucketCost(raw.cost ?? raw.mana ?? raw.label, index, maxCost);
        buckets[cost].count += Math.max(0, Number(raw.count ?? raw.value ?? raw.cards ?? 0));
        if (raw.label) {
          buckets[cost].label = String(raw.label);
        }
      });
      return buckets;
    }

    if (typeof input === "object") {
      Object.entries(input).forEach(([key, value], index) => {
        const cost = normalizeCostBucketCost(key, index, maxCost);
        buckets[cost].count += Math.max(0, Number(value));
        if (key.includes("+")) {
          buckets[cost].label = key;
        }
      });
      return buckets;
    }

    return null;
  }

  function buildCostCurveBuckets(cards, maxCost, overLabel) {
    const buckets = createEmptyCostBuckets(maxCost, overLabel);
    (cards || []).forEach((rawCard) => {
      const card = normalizeCard(rawCard);
      const cost = Math.max(0, Math.floor(Number(card.cost) || 0));
      const bucketCost = Math.min(cost, maxCost);
      buckets[bucketCost].count += Math.max(1, Number(card.count || 1));
    });
    return buckets;
  }

  function normalizeCostCurve(curve, options) {
    const settings = withDefaults(options);
    if (Array.isArray(curve)) {
      const maxCost = getCostCurveMaxCost(null, settings);
      return {
        title: "Mana curve",
        subtitle: "",
        badge: "",
        cards: curve,
        buckets: null,
        maxCost,
        overLabel: settings.costCurveOverLabel || `${maxCost}+`,
        url: "",
        label: "Mana curve"
      };
    }

    const raw = curve || {};
    const maxCost = getCostCurveMaxCost(raw.maxCost ?? raw.maxMana, settings);
    const overLabel = raw.overLabel
      || raw.maxLabel
      || (maxCost === settings.costCurveMaxCost ? settings.costCurveOverLabel : `${maxCost}+`)
      || `${maxCost}+`;
    return {
      title: raw.title || raw.name || "Mana curve",
      subtitle: raw.subtitle || raw.description || raw.text || "",
      badge: raw.badge || raw.tag || "",
      cards: parseCardItems(raw.cards || raw.deck || raw.items),
      buckets: normalizeCostCurveBuckets(raw.buckets || raw.curve || raw.costs, maxCost, overLabel),
      maxCost,
      overLabel,
      url: raw.url || raw.href || "",
      label: raw.label || raw.ariaLabel || raw.title || raw.name || "Mana curve"
    };
  }

  function getCostCurveStats(curve) {
    const buckets = curve.buckets || buildCostCurveBuckets(curve.cards, curve.maxCost, curve.overLabel);
    const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const weightedCost = buckets.reduce((sum, bucket) => sum + (bucket.cost * bucket.count), 0);
    const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
    return {
      buckets,
      total,
      average: total ? weightedCost / total : 0,
      maxCount
    };
  }

  function createTile(rawCard, options) {
    const card = normalizeCard(rawCard);
    const settings = withDefaults(options);
    const hasCountBox = shouldShowCountBox(card, settings);
    const tile = createElement(
      "figure",
      `hsrdv-card-tile${card.predicted ? " hsrdv-card-tile--predicted" : ""}`
    );
    tile.setAttribute("aria-label", `${card.name}, ${card.cost} mana`);
    if (card.dbfId) {
      tile.dataset.dbfId = String(card.dbfId);
    }
    if (card.id) {
      tile.dataset.cardId = card.id;
    }

    const gem = createElement("div", `hsrdv-card-gem hsrdv-rarity-${card.rarity}`);
    gem.appendChild(createElement("span", "hsrdv-card-cost", String(card.cost)));

    const frame = createElement(
      "div",
      `hsrdv-card-frame ${hasCountBox ? "hsrdv-card-frame--with-count" : "hsrdv-card-frame--without-count"}`
    );

    const artUrl = getArtUrl(card, settings);
    if (artUrl) {
      const image = createElement("img", "hsrdv-card-art");
      image.src = artUrl;
      image.alt = card.name;
      if (settings.imageFallbackFormat && settings.artFormat !== settings.imageFallbackFormat) {
        image.addEventListener(
          "error",
          () => {
            if (image.dataset.fallbackTried || card.image || !card.id) {
              return;
            }
            image.dataset.fallbackTried = "1";
            image.src = `${settings.artBaseUrl}${card.id}.${settings.imageFallbackFormat}`;
          },
          { once: true }
        );
      }
      frame.appendChild(image);
    }

    if (hasCountBox) {
      const countBox = createElement("div", "hsrdv-card-countbox");
      const countClass = card.count > 1 ? "hsrdv-card-count hsrdv-card-count--copies" : "hsrdv-card-count";
      countBox.appendChild(createElement("span", countClass, getCountLabel(card, settings)));
      frame.appendChild(countBox);
    }

    frame.appendChild(createElement("span", "hsrdv-card-fade"));
    frame.appendChild(createElement("figcaption", "hsrdv-card-name", card.name));

    tile.appendChild(gem);
    tile.appendChild(frame);
    return tile;
  }

  function createIcon(rawCard, options) {
    const card = normalizeCard(rawCard);
    const settings = withDefaults(options);
    const badgeLabel = getIconBadgeLabel(card, settings);
    const icon = createElement(
      "div",
      `hsrdv-card-icon hsrdv-rarity-${card.rarity}${card.predicted ? " hsrdv-card-icon--predicted" : ""}`
    );
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", badgeLabel ? `${card.name} ${badgeLabel}` : card.name);
    if (card.dbfId) {
      icon.dataset.dbfId = String(card.dbfId);
    }
    if (card.id) {
      icon.dataset.cardId = card.id;
    }

    const artUrl = getArtUrl(card, settings);
    if (artUrl) {
      setMaskedArtBackground(icon, artUrl);
      applyArtPresentation(icon, card);
    }

    if (badgeLabel) {
      const badgeClass = badgeLabel === "★"
        ? "hsrdv-card-icon-badge hsrdv-card-icon-badge--star"
        : "hsrdv-card-icon-badge hsrdv-card-icon-badge--copies";
      icon.appendChild(createElement("span", badgeClass, badgeLabel));
    }

    return icon;
  }

  function createSquareIcon(rawCard, options) {
    const card = normalizeCard(rawCard);
    const settings = withDefaults(options);
    const badgeLabel = getIconBadgeLabel(card, settings);
    const icon = createElement(
      "div",
      `hsrdv-card-square-icon hsrdv-rarity-${card.rarity}${card.predicted ? " hsrdv-card-square-icon--predicted" : ""}`
    );
    icon.setAttribute("role", "img");
    icon.setAttribute("aria-label", badgeLabel ? `${card.name} ${badgeLabel}` : card.name);
    if (card.dbfId) {
      icon.dataset.dbfId = String(card.dbfId);
    }
    if (card.id) {
      icon.dataset.cardId = card.id;
    }

    const artUrl = getArtUrl(card, settings);
    if (artUrl) {
      setMaskedArtBackground(icon, artUrl);
      applyArtPresentation(icon, card);
    }

    if (badgeLabel) {
      const badgeClass = badgeLabel === "★"
        ? "hsrdv-card-square-badge hsrdv-card-square-badge--star"
        : "hsrdv-card-square-badge hsrdv-card-square-badge--copies";
      icon.appendChild(createElement("span", badgeClass, badgeLabel));
    }

    return icon;
  }

  function createArchetypeCard(rawArchetype, options) {
    const settings = withDefaults(options);
    const archetype = normalizeArchetype(rawArchetype);
    const element = createElement(
      archetype.url ? "a" : "article",
      "hsrdv-archetype-card"
    );
    element.setAttribute("aria-label", archetype.label || archetype.name);
    if (archetype.url) {
      element.href = archetype.url;
    }

    const background = createElement("div", "hsrdv-archetype-bg");
    background.setAttribute("aria-hidden", "true");

    archetype.arts.forEach((artwork) => {
      const artUrl = getArchetypeArtUrl(artwork, settings);
      if (!artUrl) {
        return;
      }

      const panel = createElement("span", "hsrdv-archetype-art-panel");
      const art = createElement("span", "hsrdv-archetype-art");
      art.style.backgroundImage = `url("${artUrl}")`;

      if (artwork && typeof artwork === "object") {
        if (artwork.position || artwork.backgroundPosition) {
          art.style.backgroundPosition = artwork.position || artwork.backgroundPosition;
        }
        if (typeof artwork.scale !== "undefined") {
          art.style.transform = `scale(${artwork.scale})`;
        }
        if (typeof artwork.opacity !== "undefined") {
          panel.style.opacity = String(artwork.opacity);
        }
      }

      panel.appendChild(art);
      background.appendChild(panel);
    });

    const content = createElement("div", "hsrdv-archetype-content");
    const iconUrl = getArchetypeIconUrl(archetype.icon, settings);
    if (iconUrl) {
      const icon = createElement("img", "hsrdv-archetype-icon");
      icon.src = iconUrl;
      icon.alt = archetype.iconAlt || "";
      content.appendChild(icon);
    }

    content.appendChild(createElement("h3", "hsrdv-archetype-title", archetype.name));

    if (archetype.stats.length) {
      const stats = createElement("dl", "hsrdv-archetype-stats");
      archetype.stats.forEach((stat) => {
        const item = createElement("div", "hsrdv-archetype-stat");
        item.appendChild(createElement("dt", "", stat.label || ""));
        item.appendChild(createElement("dd", "", stat.value ?? ""));
        stats.appendChild(item);
      });
      content.appendChild(stats);
    }

    element.appendChild(background);
    element.appendChild(content);
    return element;
  }

  function createStonePortrait(rawPortrait, options) {
    const settings = withDefaults(options);
    const portrait = normalizeStonePortrait(rawPortrait);
    const element = createElement(
      portrait.href ? "a" : "div",
      `hsrdv-stone-portrait${portrait.predicted ? " hsrdv-stone-portrait--predicted" : ""}`
    );
    element.setAttribute("aria-label", portrait.name);
    if (portrait.href) {
      element.href = portrait.href;
    }
    if (portrait.dbfId) {
      element.dataset.dbfId = String(portrait.dbfId);
    }
    if (portrait.id) {
      element.dataset.cardId = portrait.id;
    }

    const artUrl = getStonePortraitArtUrl(portrait, settings);
    if (artUrl) {
      const image = createElement("img", "hsrdv-stone-portrait-art");
      image.src = artUrl;
      image.alt = portrait.name;
      if (portrait.position) {
        image.style.objectPosition = portrait.position;
      }
      element.appendChild(image);
    }

    return element;
  }

  function createSynergyItem(rawItem, options) {
    const settings = withDefaults(options);
    const item = normalizeSynergyItem(rawItem);
    const badgeLabel = getIconBadgeLabel(item, settings);
    const element = createElement(
      item.href ? "a" : "div",
      `hsrdv-synergy-item hsrdv-rarity-${item.rarity}${item.predicted ? " hsrdv-synergy-item--predicted" : ""}`
    );
    element.setAttribute("aria-label", item.label ? `${item.name}, ${item.label}` : item.name);
    if (item.href) {
      element.href = item.href;
    }
    if (item.dbfId) {
      element.dataset.dbfId = String(item.dbfId);
    }
    if (item.id) {
      element.dataset.cardId = item.id;
    }

    const artBox = createElement("span", "hsrdv-synergy-artbox");
    const artUrl = getSynergyArtUrl(item, settings);
    if (artUrl) {
      const art = createElement("span", "hsrdv-synergy-art");
      setMaskedArtBackground(art, artUrl);
      applyArtPresentation(art, item);
      artBox.appendChild(art);
    }
    if (badgeLabel) {
      const badgeClass = badgeLabel === "★"
        ? "hsrdv-synergy-badge hsrdv-synergy-badge--star"
        : "hsrdv-synergy-badge hsrdv-synergy-badge--copies";
      artBox.appendChild(createElement("span", badgeClass, badgeLabel));
    }

    element.appendChild(artBox);
    element.appendChild(createElement("span", "hsrdv-synergy-name", item.name));
    if (item.label) {
      element.appendChild(createElement("span", "hsrdv-synergy-label", item.label));
    }
    return element;
  }

  function createSynergyCard(rawSynergy, options) {
    const settings = withDefaults(options);
    const synergy = normalizeSynergy(rawSynergy);
    const element = createElement(
      synergy.url ? "a" : "article",
      `hsrdv-synergy-card hsrdv-synergy-card--${synergy.connector}`
    );
    element.setAttribute("aria-label", synergy.label || synergy.title);
    if (synergy.url) {
      element.href = synergy.url;
    }

    const header = createElement("header", "hsrdv-synergy-header");
    const titleGroup = createElement("div", "hsrdv-synergy-title-group");
    if (synergy.eyebrow) {
      titleGroup.appendChild(createElement("span", "hsrdv-synergy-eyebrow", synergy.eyebrow));
    }
    titleGroup.appendChild(createElement("h3", "hsrdv-synergy-title", synergy.title));
    if (synergy.subtitle) {
      titleGroup.appendChild(createElement("p", "hsrdv-synergy-subtitle", synergy.subtitle));
    }
    header.appendChild(titleGroup);
    if (synergy.badge) {
      header.appendChild(createElement("span", "hsrdv-synergy-card-badge", synergy.badge));
    }
    element.appendChild(header);

    const chain = createElement("ol", "hsrdv-synergy-chain");
    synergy.items.forEach((item, index) => {
      if (index > 0) {
        const connector = createElement("li", "hsrdv-synergy-connector");
        connector.setAttribute("aria-hidden", "true");
        connector.appendChild(createElement("span", "", synergy.connector === "arrow" ? "→" : "+"));
        chain.appendChild(connector);
      }
      const chainItem = createElement("li", "hsrdv-synergy-chain-item");
      chainItem.appendChild(createSynergyItem(item, settings));
      chain.appendChild(chainItem);
    });
    element.appendChild(chain);

    if (synergy.result) {
      const result = createElement("div", "hsrdv-synergy-result");
      if (typeof synergy.result === "string") {
        result.appendChild(createElement("strong", "", synergy.result));
      } else {
        if (synergy.result.label) {
          result.appendChild(createElement("span", "hsrdv-synergy-result-label", synergy.result.label));
        }
        result.appendChild(createElement("strong", "", synergy.result.value || synergy.result.text || ""));
      }
      element.appendChild(result);
    }

    return element;
  }

  function createMulliganItem(rawItem, options) {
    const settings = withDefaults(options);
    const item = normalizeMulliganItem(rawItem);
    const element = createElement(
      item.href ? "a" : "article",
      `hsrdv-mulligan-item hsrdv-mulligan-item--${item.status}${item.predicted ? " hsrdv-mulligan-item--predicted" : ""}`
    );
    element.setAttribute("aria-label", `${item.name}, ${MULLIGAN_STATUS_LABELS[item.status]}`);
    if (item.href) {
      element.href = item.href;
    }
    if (item.dbfId) {
      element.dataset.dbfId = String(item.dbfId);
    }
    if (item.id) {
      element.dataset.cardId = item.id;
    }

    const artBox = createElement("span", `hsrdv-mulligan-artbox hsrdv-rarity-${item.rarity}`);
    const artUrl = getMulliganArtUrl(item, settings);
    if (artUrl) {
      const art = createElement("span", "hsrdv-mulligan-art");
      setMaskedArtBackground(art, artUrl);
      applyArtPresentation(art, item);
      artBox.appendChild(art);
    }
    element.appendChild(artBox);

    const body = createElement("span", "hsrdv-mulligan-body");
    body.appendChild(createElement("strong", "hsrdv-mulligan-name", item.name));
    body.appendChild(createElement("span", "hsrdv-mulligan-status", MULLIGAN_STATUS_LABELS[item.status]));

    const metrics = createElement("span", "hsrdv-mulligan-metrics");
    if (item.keepRate !== "") {
      const metric = createElement("span", "hsrdv-mulligan-metric");
      metric.appendChild(createElement("span", "", "Keep"));
      metric.appendChild(createElement("strong", "", formatPercent(item.keepRate)));
      metrics.appendChild(metric);
    }
    if (item.winrate !== "") {
      const metric = createElement("span", "hsrdv-mulligan-metric");
      metric.appendChild(createElement("span", "", "WR"));
      metric.appendChild(createElement("strong", "", formatPercent(item.winrate)));
      metrics.appendChild(metric);
    }
    if (metrics.childElementCount) {
      body.appendChild(metrics);
    }
    if (item.note) {
      body.appendChild(createElement("span", "hsrdv-mulligan-note", item.note));
    }

    element.appendChild(body);
    return element;
  }

  function createMulliganCard(rawMulligan, options) {
    const settings = withDefaults(options);
    const mulligan = normalizeMulligan(rawMulligan);
    const element = createElement(
      mulligan.url ? "a" : "article",
      "hsrdv-mulligan-card"
    );
    element.setAttribute("aria-label", mulligan.label || mulligan.title);
    if (mulligan.url) {
      element.href = mulligan.url;
    }

    const header = createElement("header", "hsrdv-mulligan-header");
    const titleGroup = createElement("div", "hsrdv-mulligan-title-group");
    titleGroup.appendChild(createElement("h3", "hsrdv-mulligan-title", mulligan.title));
    if (mulligan.subtitle) {
      titleGroup.appendChild(createElement("p", "hsrdv-mulligan-subtitle", mulligan.subtitle));
    }
    header.appendChild(titleGroup);
    if (mulligan.badge) {
      header.appendChild(createElement("span", "hsrdv-mulligan-badge", mulligan.badge));
    }
    element.appendChild(header);

    const list = createElement("div", "hsrdv-mulligan-cards");
    mulligan.cards.forEach((card) => {
      list.appendChild(createMulliganItem(card, settings));
    });
    element.appendChild(list);
    return element;
  }

  function createMatchupMiniCard(rawCard, options) {
    const settings = withDefaults(options);
    const card = normalizeMatchupCard(rawCard);
    const badgeLabel = getIconBadgeLabel(card, settings);
    const element = createElement("span", `hsrdv-matchup-card hsrdv-rarity-${card.rarity}`);
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", badgeLabel ? `${card.name} ${badgeLabel}` : card.name);
    if (card.dbfId) {
      element.dataset.dbfId = String(card.dbfId);
    }
    if (card.id) {
      element.dataset.cardId = card.id;
    }

    const artUrl = getMatchupArtUrl(card, settings);
    if (artUrl) {
      setMaskedArtBackground(element, artUrl);
      applyArtPresentation(element, card);
    }
    if (badgeLabel) {
      const badgeClass = badgeLabel === "★"
        ? "hsrdv-matchup-card-badge hsrdv-matchup-card-badge--star"
        : "hsrdv-matchup-card-badge hsrdv-matchup-card-badge--copies";
      element.appendChild(createElement("span", badgeClass, badgeLabel));
    }
    return element;
  }

  function createMatchupRow(rawMatchup, options) {
    const settings = withDefaults(options);
    const matchup = normalizeMatchup(rawMatchup);
    const parsedWinrate = parsePercent(matchup.winrate);
    const winrateValue = clampPercent(parsedWinrate ?? 50);
    const element = createElement(
      matchup.url ? "a" : "article",
      `hsrdv-matchup-row hsrdv-matchup-row--${matchup.status}`
    );
    element.setAttribute("aria-label", matchup.label || matchup.name);
    element.style.setProperty("--hsrdv-matchup-winrate", `${winrateValue}%`);
    if (matchup.url) {
      element.href = matchup.url;
    }

    const opponent = createElement("div", "hsrdv-matchup-opponent");
    const iconUrl = getMatchupIconUrl(matchup, settings);
    if (iconUrl) {
      const icon = createElement("img", "hsrdv-matchup-icon");
      icon.src = iconUrl;
      icon.alt = matchup.className || matchup.name;
      opponent.appendChild(icon);
    } else {
      opponent.appendChild(createElement("span", "hsrdv-matchup-icon hsrdv-matchup-icon--fallback", matchup.name.slice(0, 1)));
    }
    const text = createElement("span", "hsrdv-matchup-text");
    text.appendChild(createElement("strong", "", matchup.name));
    if (matchup.className) {
      text.appendChild(createElement("span", "", matchup.className));
    }
    opponent.appendChild(text);
    element.appendChild(opponent);

    const score = createElement("div", "hsrdv-matchup-score");
    score.appendChild(createElement("strong", "", formatPercent(matchup.winrate)));
    if (matchup.games !== "") {
      score.appendChild(createElement("span", "", `${formatNumber(matchup.games)} игр`));
    }
    element.appendChild(score);

    const gauge = createElement("div", "hsrdv-matchup-gauge");
    gauge.appendChild(createElement("span", "hsrdv-matchup-gauge-fill"));
    gauge.appendChild(createElement("span", "hsrdv-matchup-gauge-mid"));
    element.appendChild(gauge);

    const cards = createElement("div", "hsrdv-matchup-keycards");
    matchup.cards.forEach((card) => {
      cards.appendChild(createMatchupMiniCard(card, settings));
    });
    element.appendChild(cards);

    return element;
  }

  function createMetaBadge(rawBadge) {
    const badge = normalizeMetaBadge(rawBadge);
    const element = createElement(
      badge.url ? "a" : "article",
      `hsrdv-meta-badge hsrdv-meta-badge--${badge.kind}`
    );
    element.setAttribute("aria-label", badge.labelText);
    if (badge.url) {
      element.href = badge.url;
    }

    const header = createElement("span", "hsrdv-meta-badge-header");
    header.appendChild(createElement("span", "hsrdv-meta-badge-label", badge.label));
    if (badge.delta) {
      header.appendChild(createElement("span", "hsrdv-meta-badge-delta", badge.delta));
    }
    element.appendChild(header);

    element.appendChild(createElement("strong", "hsrdv-meta-badge-title", badge.title));
    if (badge.value) {
      element.appendChild(createElement("span", "hsrdv-meta-badge-value", badge.value));
    }
    if (badge.description) {
      element.appendChild(createElement("span", "hsrdv-meta-badge-description", badge.description));
    }
    return element;
  }

  function createCostCurve(rawCurve, options) {
    const settings = withDefaults(options);
    const curve = normalizeCostCurve(rawCurve, settings);
    const stats = getCostCurveStats(curve);
    const element = createElement(
      curve.url ? "a" : "article",
      "hsrdv-cost-curve"
    );
    element.setAttribute("aria-label", curve.label || curve.title);
    if (curve.url) {
      element.href = curve.url;
    }

    const header = createElement("header", "hsrdv-cost-curve-header");
    const titleGroup = createElement("div", "hsrdv-cost-curve-title-group");
    titleGroup.appendChild(createElement("h3", "hsrdv-cost-curve-title", curve.title));
    if (curve.subtitle) {
      titleGroup.appendChild(createElement("p", "hsrdv-cost-curve-subtitle", curve.subtitle));
    }
    header.appendChild(titleGroup);

    const badge = curve.badge || (settings.costCurveShowTotal ? `${stats.total} cards` : "");
    if (badge) {
      header.appendChild(createElement("span", "hsrdv-cost-curve-badge", badge));
    }
    element.appendChild(header);

    const chart = createElement("div", "hsrdv-cost-curve-chart");
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", `Mana curve, ${stats.total} cards`);
    chart.style.setProperty("--hsrdv-cost-curve-columns", String(stats.buckets.length));
    stats.buckets.forEach((bucket) => {
      const ratio = bucket.count / stats.maxCount;
      const bucketElement = createElement("span", "hsrdv-cost-curve-bucket");
      bucketElement.style.setProperty("--hsrdv-cost-curve-ratio", String(ratio));
      bucketElement.setAttribute("aria-label", `${bucket.label} mana: ${bucket.count}`);

      bucketElement.appendChild(createElement("span", "hsrdv-cost-curve-count", String(bucket.count)));
      const bar = createElement("span", "hsrdv-cost-curve-bar");
      bar.appendChild(createElement("span", "hsrdv-cost-curve-fill"));
      bucketElement.appendChild(bar);
      bucketElement.appendChild(createElement("span", "hsrdv-cost-curve-label", bucket.label));
      chart.appendChild(bucketElement);
    });
    element.appendChild(chart);

    const footer = createElement("footer", "hsrdv-cost-curve-footer");
    footer.appendChild(createElement("span", "", `Avg ${stats.average.toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
      minimumFractionDigits: 1
    })}`));
    footer.appendChild(createElement("span", "", `${stats.total} cards`));
    element.appendChild(footer);
    return element;
  }

  function renderDeck(target, cards, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const renderCards = prepareCards(cards, settings);
    const rootElement = createElement("div", `hsrdv ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-list");

    renderCards.forEach((card) => {
      const item = createElement("li");
      item.appendChild(createTile(card, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderIcons(target, cards, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const renderCards = prepareCards(cards, settings);
    const rootElement = createElement("div", `hsrdv hsrdv-icons ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-icon-list");

    renderCards.forEach((card) => {
      const item = createElement("li");
      item.appendChild(createIcon(card, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderSquareIcons(target, cards, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const renderCards = prepareCards(cards, settings);
    const rootElement = createElement("div", `hsrdv hsrdv-square-icons ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-square-icon-list");

    renderCards.forEach((card) => {
      const item = createElement("li");
      item.appendChild(createSquareIcon(card, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderArchetypes(target, archetypes, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-archetypes ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-archetype-list");

    (archetypes || []).forEach((archetype) => {
      const item = createElement("li");
      item.appendChild(createArchetypeCard(archetype, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderStonePortraits(target, portraits, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-stone-portraits ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-stone-portrait-list");

    if (settings.stonePortraitFrameImage) {
      rootElement.style.setProperty(
        "--hsrdv-stone-portrait-frame-image",
        `url("${settings.stonePortraitFrameImage}")`
      );
    }

    (portraits || []).forEach((portrait) => {
      const item = createElement("li");
      item.appendChild(createStonePortrait(portrait, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderSynergies(target, synergies, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-synergies ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-synergy-list");

    (synergies || []).forEach((synergy) => {
      const item = createElement("li");
      item.appendChild(createSynergyCard(synergy, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderMulligans(target, mulligans, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-mulligans ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-mulligan-list");

    (mulligans || []).forEach((mulligan) => {
      const item = createElement("li");
      item.appendChild(createMulliganCard(mulligan, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderMatchups(target, matchups, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-matchups ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-matchup-list");

    (matchups || []).forEach((matchup) => {
      const item = createElement("li");
      item.appendChild(createMatchupRow(matchup, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderMetaBadges(target, badges, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-meta-badges ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-meta-badge-list");

    (badges || []).forEach((badge) => {
      const item = createElement("li");
      item.appendChild(createMetaBadge(badge, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderCostCurve(target, curve, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-cost-curves ${settings.className}`.trim());
    rootElement.appendChild(createCostCurve(curve, settings));
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  function renderCostCurves(target, curves, options) {
    const settings = withDefaults(options);
    const container = resolveTarget(target);
    const rootElement = createElement("div", `hsrdv hsrdv-cost-curves ${settings.className}`.trim());
    const list = createElement("ul", "hsrdv-cost-curve-list");

    (curves || []).forEach((curve) => {
      const item = createElement("li");
      item.appendChild(createCostCurve(curve, settings));
      list.appendChild(item);
    });

    rootElement.appendChild(list);
    if (settings.clear) {
      container.replaceChildren(rootElement);
    } else {
      container.appendChild(rootElement);
    }
    return rootElement;
  }

  async function loadCardDatabase(options) {
    const settings = withDefaults(options);
    const url = settings.dataUrl.replace("{locale}", settings.locale);
    if (databaseCache.has(url)) {
      return databaseCache.get(url);
    }
    if (typeof fetch !== "function") {
      throw new Error("HSReplayDeckView: fetch is required to load HearthstoneJSON data");
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HSReplayDeckView: HearthstoneJSON request failed: ${response.status}`);
    }
    const cards = await response.json();
    const byDbfId = new Map(cards.map((card) => [Number(card.dbfId), card]));
    databaseCache.set(url, byDbfId);
    return byDbfId;
  }

  async function cardsFromDbfIds(dbfIds, options) {
    const ids = parseDeckCards(dbfIds);
    const byDbfId = await loadCardDatabase(options);
    return ids
      .map((dbfId) => byDbfId.get(dbfId))
      .filter(Boolean);
  }

  async function renderDeckFromDbfIds(target, dbfIds, options) {
    const cards = await cardsFromDbfIds(dbfIds, options);
    return renderDeck(target, cards, options);
  }

  async function renderIconsFromDbfIds(target, dbfIds, options) {
    const cards = await cardsFromDbfIds(dbfIds, options);
    return renderIcons(target, cards, options);
  }

  async function renderSquareIconsFromDbfIds(target, dbfIds, options) {
    const cards = await cardsFromDbfIds(dbfIds, options);
    return renderSquareIcons(target, cards, options);
  }

  async function renderStonePortraitsFromDbfIds(target, dbfIds, options) {
    const cards = await cardsFromDbfIds(dbfIds, options);
    return renderStonePortraits(target, cards, options);
  }

  async function renderCostCurveFromDbfIds(target, dbfIds, options) {
    const cards = await cardsFromDbfIds(dbfIds, options);
    return renderCostCurve(target, cards, options);
  }

  return {
    createArchetypeCard,
    createCostCurve,
    createIcon,
    createMatchupMiniCard,
    createMatchupRow,
    createMetaBadge,
    createMulliganCard,
    createMulliganItem,
    createSquareIcon,
    createStonePortrait,
    createSynergyCard,
    createSynergyItem,
    createTile,
    cardsFromDbfIds,
    groupCards,
    loadCardDatabase,
    normalizeCard,
    normalizeCostCurve,
    normalizeMatchup,
    normalizeMatchupCard,
    normalizeMetaBadge,
    normalizeMulligan,
    normalizeMulliganItem,
    normalizeStonePortrait,
    normalizeSynergy,
    normalizeSynergyItem,
    parseDeckCards,
    renderCostCurve,
    renderCostCurveFromDbfIds,
    renderCostCurves,
    renderDeck,
    renderDeckFromDbfIds,
    renderArchetypes,
    renderIcons,
    renderIconsFromDbfIds,
    renderMatchups,
    renderMetaBadges,
    renderMulligans,
    renderSquareIcons,
    renderSquareIconsFromDbfIds,
    renderStonePortraits,
    renderStonePortraitsFromDbfIds,
    renderSynergies,
    sortCards
  };
});
