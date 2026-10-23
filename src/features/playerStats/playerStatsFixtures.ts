/* Trimmed answers of GET /api/account/game-stats for the synthetic dev account (scripts/dev-seed-player-games.ts). */
import type { ArenaStats, BattlegroundsStats, ConstructedStats } from '../../modules/playerStats/public';

export const battlegroundsFixture: BattlegroundsStats = {
  "mode": "battlegrounds",
  "period": "all",
  "duos": false,
  "games": 220,
  "summary": {
    "highestRating": 7488,
    "currentRating": 7185,
    "ratingChange": 1085,
    "averagePlacement": 4.2,
    "placements": [30, 24, 39, 22, 28, 39, 37, 1],
    "top4Rate": 52.3,
    "firstPlaces": 30,
    "timePlayedSeconds": 381908
  },
  "ratingSeries": [
    {
      "id": "seed-bg-0160",
      "startedAt": 1790684582691,
      "heroCardId": "BG20_HERO_101",
      "placement": 7,
      "rating": 7326,
      "delta": -37,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BGS_116", "attack": 24, "health": 30, "golden": false },
        { "cardId": "BG24_715", "attack": 12, "health": 12, "golden": true },
        { "cardId": "BGS_034", "attack": 12, "health": 6, "golden": false },
        { "cardId": "BG27_084", "attack": 36, "health": 12, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0161",
      "startedAt": 1790720435670,
      "heroCardId": "BG20_HERO_280",
      "placement": 1,
      "rating": 7391,
      "delta": 65,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_525", "attack": 47, "health": 47, "golden": false },
        { "cardId": "BG26_ICC_901", "attack": 12, "health": 58, "golden": false },
        { "cardId": "BG26_135", "attack": 35, "health": 12, "golden": false },
        { "cardId": "BG24_715", "attack": 23, "health": 23, "golden": true },
        { "cardId": "BG29_813", "attack": 23, "health": 35, "golden": false },
        { "cardId": "BGS_115", "attack": 35, "health": 35, "golden": false },
        { "cardId": "BG24_715", "attack": 23, "health": 23, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0162",
      "startedAt": 1790753315422,
      "heroCardId": "BG20_HERO_242",
      "placement": 4,
      "rating": 7393,
      "delta": 2,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG28_300", "attack": 8, "health": 8, "golden": false },
        { "cardId": "BGS_041", "attack": 33, "health": 100, "golden": false },
        { "cardId": "BG26_152", "attack": 33, "health": 42, "golden": false },
        { "cardId": "BG23_000", "attack": 8, "health": 33, "golden": false },
        { "cardId": "BG20_101", "attack": 17, "health": 33, "golden": false },
        { "cardId": "BG23_318", "attack": 50, "health": 17, "golden": false },
        { "cardId": "BG25_010", "attack": 17, "health": 8, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0163",
      "startedAt": 1790787869209,
      "heroCardId": "BG20_HERO_201",
      "placement": 1,
      "rating": 7450,
      "delta": 57,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_135", "attack": 39, "health": 13, "golden": false },
        { "cardId": "BG24_500", "attack": 39, "health": 26, "golden": false },
        { "cardId": "BG25_016", "attack": 39, "health": 52, "golden": false },
        { "cardId": "BG28_309", "attack": 65, "health": 26, "golden": false },
        { "cardId": "BG23_000", "attack": 26, "health": 104, "golden": true },
        { "cardId": "BGS_115", "attack": 39, "health": 39, "golden": false },
        { "cardId": "BG26_137", "attack": 156, "health": 156, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0164",
      "startedAt": 1790824005149,
      "heroCardId": "BG20_HERO_103",
      "placement": 6,
      "rating": 7431,
      "delta": -19,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BGS_041", "attack": 31, "health": 92, "golden": false },
        { "cardId": "BG27_000", "attack": 15, "health": 15, "golden": false },
        { "cardId": "BGS_131", "attack": 8, "health": 8, "golden": false },
        { "cardId": "BG28_303", "attack": 31, "health": 31, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0165",
      "startedAt": 1790857080534,
      "heroCardId": "BG20_HERO_201",
      "placement": 3,
      "rating": 7453,
      "delta": 22,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG25_010", "attack": 35, "health": 17, "golden": true },
        { "cardId": "BGS_041", "attack": 35, "health": 104, "golden": false },
        { "cardId": "BG23_357", "attack": 26, "health": 17, "golden": false },
        { "cardId": "BGS_008", "attack": 61, "health": 61, "golden": false },
        { "cardId": "BG29_816", "attack": 17, "health": 69, "golden": false },
        { "cardId": "BG23_318", "attack": 52, "health": 17, "golden": false },
        { "cardId": "BG20_104", "attack": 35, "health": 121, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0166",
      "startedAt": 1790891952866,
      "heroCardId": "BG20_HERO_101",
      "placement": 7,
      "rating": 7408,
      "delta": -45,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG27_556", "attack": 20, "health": 25, "golden": false },
        { "cardId": "BG26_137", "attack": 30, "health": 30, "golden": false },
        { "cardId": "BG28_583", "attack": 20, "health": 30, "golden": false },
        { "cardId": "BG29_813", "attack": 10, "health": 15, "golden": false },
        { "cardId": "BG26_814", "attack": 15, "health": 20, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0167",
      "startedAt": 1790926533132,
      "heroCardId": "BG20_HERO_100",
      "placement": 6,
      "rating": 7379,
      "delta": -29,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG25_011", "attack": 6, "health": 23, "golden": false },
        { "cardId": "BG25_009", "attack": 45, "health": 6, "golden": false },
        { "cardId": "BG25_010", "attack": 23, "health": 11, "golden": true },
        { "cardId": "BG26_814", "attack": 17, "health": 23, "golden": false },
        { "cardId": "BG24_715", "attack": 6, "health": 6, "golden": false },
        { "cardId": "BG29_611", "attack": 11, "health": 11, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0168",
      "startedAt": 1790960461862,
      "heroCardId": "BG20_HERO_280",
      "placement": 1,
      "rating": 7447,
      "delta": 68,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG23_009", "attack": 26, "health": 65, "golden": false },
        { "cardId": "BG28_309", "attack": 130, "health": 52, "golden": true },
        { "cardId": "BG23_007", "attack": 52, "health": 156, "golden": true },
        { "cardId": "BG28_633", "attack": 52, "health": 156, "golden": true },
        { "cardId": "BGS_116", "attack": 52, "health": 65, "golden": false },
        { "cardId": "BG23_007", "attack": 26, "health": 78, "golden": false },
        { "cardId": "BG26_523", "attack": 52, "health": 52, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0169",
      "startedAt": 1790997585102,
      "heroCardId": "BG23_HERO_303",
      "placement": 4,
      "rating": 7456,
      "delta": 9,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG29_611", "attack": 9, "health": 9, "golden": false },
        { "cardId": "BG29_888", "attack": 19, "health": 75, "golden": true },
        { "cardId": "BG21_004", "attack": 75, "health": 112, "golden": true },
        { "cardId": "BGS_034", "attack": 19, "health": 9, "golden": false },
        { "cardId": "BG21_004", "attack": 37, "health": 56, "golden": false },
        { "cardId": "BG23_357", "attack": 28, "health": 19, "golden": false },
        { "cardId": "BG28_582", "attack": 56, "health": 56, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0170",
      "startedAt": 1791032181881,
      "heroCardId": "BG20_HERO_103",
      "placement": 6,
      "rating": 7438,
      "delta": -18,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG23_009", "attack": 15, "health": 37, "golden": false },
        { "cardId": "BG23_009", "attack": 15, "health": 37, "golden": false },
        { "cardId": "BG25_008", "attack": 29, "health": 15, "golden": false },
        { "cardId": "BG24_500", "attack": 44, "health": 29, "golden": true },
        { "cardId": "BG26_814", "attack": 44, "health": 59, "golden": true },
        { "cardId": "BG20_100", "attack": 15, "health": 7, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0171",
      "startedAt": 1791066232694,
      "heroCardId": "BG20_HERO_201",
      "placement": 4,
      "rating": 7443,
      "delta": 5,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG28_582", "attack": 24, "health": 24, "golden": false },
        { "cardId": "BG26_525", "attack": 32, "health": 32, "golden": false },
        { "cardId": "BG28_582", "attack": 24, "health": 24, "golden": false },
        { "cardId": "BG26_505", "attack": 48, "health": 56, "golden": false },
        { "cardId": "BG28_303", "attack": 32, "health": 32, "golden": false },
        { "cardId": "BG23_009", "attack": 16, "health": 40, "golden": false },
        { "cardId": "BG20_101", "attack": 32, "health": 64, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0172",
      "startedAt": 1791101372240,
      "heroCardId": "BG20_HERO_280",
      "placement": 2,
      "rating": 7488,
      "delta": 45,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BGS_018", "attack": 79, "health": 79, "golden": false },
        { "cardId": "BG26_817", "attack": 34, "health": 23, "golden": false },
        { "cardId": "BG21_004", "attack": 45, "health": 68, "golden": false },
        { "cardId": "BG28_707", "attack": 181, "health": 136, "golden": true },
        { "cardId": "BG28_633", "attack": 45, "health": 136, "golden": true },
        { "cardId": "BG29_300", "attack": 23, "health": 68, "golden": false },
        { "cardId": "BGS_126", "attack": 68, "health": 34, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0173",
      "startedAt": 1791135692071,
      "heroCardId": "BG20_HERO_101",
      "placement": 7,
      "rating": 7443,
      "delta": -45,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BGS_034", "attack": 9, "health": 5, "golden": false },
        { "cardId": "BG29_816", "attack": 9, "health": 37, "golden": false },
        { "cardId": "BG29_888", "attack": 5, "health": 19, "golden": false },
        { "cardId": "BG25_022", "attack": 9, "health": 5, "golden": false },
        { "cardId": "BG22_202", "attack": 9, "health": 9, "golden": false },
        { "cardId": "BGS_126", "attack": 28, "health": 14, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0174",
      "startedAt": 1791169743963,
      "heroCardId": "BG20_HERO_102",
      "placement": 7,
      "rating": 7397,
      "delta": -46,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG27_556", "attack": 20, "health": 25, "golden": false },
        { "cardId": "BG26_135", "attack": 15, "health": 5, "golden": false },
        { "cardId": "BG28_583", "attack": 20, "health": 30, "golden": false },
        { "cardId": "BG26_135", "attack": 15, "health": 5, "golden": false },
        { "cardId": "BG28_582", "attack": 30, "health": 30, "golden": true },
        { "cardId": "BG25_016", "attack": 15, "health": 20, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0175",
      "startedAt": 1791205822496,
      "heroCardId": "BG20_HERO_102",
      "placement": 3,
      "rating": 7419,
      "delta": 22,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG25_013", "attack": 17, "health": 69, "golden": true },
        { "cardId": "BG26_147", "attack": 52, "health": 52, "golden": true },
        { "cardId": "BG26_ICC_901", "attack": 9, "health": 43, "golden": false },
        { "cardId": "BG26_523", "attack": 35, "health": 35, "golden": false },
        { "cardId": "BG26_147", "attack": 52, "health": 52, "golden": true },
        { "cardId": "BG28_633", "attack": 17, "health": 52, "golden": false },
        { "cardId": "BG25_011", "attack": 9, "health": 35, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0176",
      "startedAt": 1791238629528,
      "heroCardId": "BG20_HERO_102",
      "placement": 7,
      "rating": 7375,
      "delta": -44,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG20_101", "attack": 12, "health": 24, "golden": false },
        { "cardId": "BG20_100", "attack": 24, "health": 12, "golden": true },
        { "cardId": "BG26_174", "attack": 24, "health": 12, "golden": false },
        { "cardId": "BGS_115", "attack": 18, "health": 18, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0177",
      "startedAt": 1791272378882,
      "heroCardId": "BG20_HERO_280",
      "placement": 7,
      "rating": 7334,
      "delta": -41,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG24_715", "attack": 11, "health": 11, "golden": true },
        { "cardId": "BG24_500", "attack": 17, "health": 11, "golden": false },
        { "cardId": "BG26_817", "attack": 17, "health": 11, "golden": false },
        { "cardId": "BG26_137", "attack": 34, "health": 34, "golden": false },
        { "cardId": "BG25_022", "attack": 11, "health": 6, "golden": false },
        { "cardId": "BG28_582", "attack": 34, "health": 34, "golden": true },
        { "cardId": "BG23_004", "attack": 23, "health": 34, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0178",
      "startedAt": 1791306708939,
      "heroCardId": "BG20_HERO_101",
      "placement": 6,
      "rating": 7314,
      "delta": -20,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG23_002", "attack": 29, "health": 22, "golden": false },
        { "cardId": "BG25_011", "attack": 7, "health": 29, "golden": false },
        { "cardId": "BGS_126", "attack": 44, "health": 22, "golden": false },
        { "cardId": "BG28_550", "attack": 22, "health": 29, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0179",
      "startedAt": 1791342993674,
      "heroCardId": "BG24_HERO_204",
      "placement": 8,
      "rating": 7254,
      "delta": -60,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG28_583", "attack": 19, "health": 28, "golden": false },
        { "cardId": "BG23_004", "attack": 9, "health": 14, "golden": false },
        { "cardId": "BG27_005", "attack": 5, "health": 19, "golden": false },
        { "cardId": "BG24_715", "attack": 5, "health": 5, "golden": false },
        { "cardId": "BG23_002", "attack": 37, "health": 28, "golden": true },
        { "cardId": "BG29_611", "attack": 9, "health": 9, "golden": true },
        { "cardId": "BG25_016", "attack": 28, "health": 37, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0180",
      "startedAt": 1791375537620,
      "heroCardId": "BG23_HERO_305",
      "placement": 3,
      "rating": 7276,
      "delta": 22,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG26_802", "attack": 26, "health": 52, "golden": false },
        { "cardId": "BG23_007", "attack": 17, "health": 52, "golden": false },
        { "cardId": "BG25_016", "attack": 26, "health": 35, "golden": false },
        { "cardId": "BGS_119", "attack": 17, "health": 9, "golden": false },
        { "cardId": "BG26_354", "attack": 104, "health": 104, "golden": true },
        { "cardId": "BG28_550", "attack": 26, "health": 35, "golden": false },
        { "cardId": "BG26_802", "attack": 26, "health": 52, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0181",
      "startedAt": 1791412654423,
      "heroCardId": "BG20_HERO_101",
      "placement": 4,
      "rating": 7278,
      "delta": 2,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG20_101", "attack": 32, "health": 64, "golden": true },
        { "cardId": "BG23_357", "attack": 24, "health": 16, "golden": false },
        { "cardId": "BG26_810", "attack": 16, "health": 40, "golden": false },
        { "cardId": "BG23_008", "attack": 32, "health": 48, "golden": false },
        { "cardId": "BGS_040", "attack": 64, "health": 32, "golden": false },
        { "cardId": "BGS_020", "attack": 48, "health": 32, "golden": true },
        { "cardId": "BG20_104", "attack": 16, "health": 56, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0182",
      "startedAt": 1791447480332,
      "heroCardId": "BG20_HERO_102",
      "placement": 7,
      "rating": 7231,
      "delta": -47,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG26_963", "attack": 16, "health": 21, "golden": false },
        { "cardId": "BG28_582", "attack": 16, "health": 16, "golden": false },
        { "cardId": "BGS_115", "attack": 16, "health": 16, "golden": false },
        { "cardId": "BG29_300", "attack": 21, "health": 64, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0183",
      "startedAt": 1791479153710,
      "heroCardId": "BG20_HERO_101",
      "placement": 7,
      "rating": 7193,
      "delta": -38,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG26_814", "attack": 40, "health": 53, "golden": true },
        { "cardId": "BG26_137", "attack": 40, "health": 40, "golden": false },
        { "cardId": "BG26_963", "attack": 40, "health": 53, "golden": true },
        { "cardId": "BG23_002", "attack": 27, "health": 20, "golden": false },
        { "cardId": "BG25_008", "attack": 27, "health": 13, "golden": false },
        { "cardId": "BG25_011", "attack": 13, "health": 53, "golden": true },
        { "cardId": "BGS_034", "attack": 27, "health": 13, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0184",
      "startedAt": 1791515768702,
      "heroCardId": "BG20_HERO_103",
      "placement": 5,
      "rating": 7180,
      "delta": -13,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG24_500", "attack": 21, "health": 14, "golden": false },
        { "cardId": "BGS_119", "attack": 14, "health": 7, "golden": false },
        { "cardId": "BG23_002", "attack": 28, "health": 21, "golden": false },
        { "cardId": "BG23_008", "attack": 28, "health": 42, "golden": false },
        { "cardId": "BG26_137", "attack": 42, "health": 42, "golden": false },
        { "cardId": "BG26_147", "attack": 21, "health": 21, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0185",
      "startedAt": 1791549617377,
      "heroCardId": "BG20_HERO_101",
      "placement": 6,
      "rating": 7152,
      "delta": -28,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG29_300", "attack": 15, "health": 44, "golden": false },
        { "cardId": "BG28_741", "attack": 29, "health": 7, "golden": false },
        { "cardId": "BG26_817", "attack": 22, "health": 15, "golden": false },
        { "cardId": "BG26_146", "attack": 15, "health": 15, "golden": false },
        { "cardId": "BG25_008", "attack": 29, "health": 15, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0186",
      "startedAt": 1791584427112,
      "heroCardId": "BG20_HERO_242",
      "placement": 3,
      "rating": 7169,
      "delta": 17,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG28_303", "attack": 43, "health": 43, "golden": false },
        { "cardId": "BG29_813", "attack": 43, "health": 64, "golden": true },
        { "cardId": "BG26_802", "attack": 64, "health": 128, "golden": true },
        { "cardId": "BGS_131", "attack": 21, "health": 21, "golden": true },
        { "cardId": "BG28_309", "attack": 107, "health": 43, "golden": true },
        { "cardId": "BG26_354", "attack": 64, "health": 64, "golden": false },
        { "cardId": "BG25_001", "attack": 21, "health": 11, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0187",
      "startedAt": 1791619148877,
      "heroCardId": "BG20_HERO_100",
      "placement": 4,
      "rating": 7170,
      "delta": 1,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG28_550", "attack": 24, "health": 32, "golden": false },
        { "cardId": "BG25_013", "attack": 8, "health": 32, "golden": false },
        { "cardId": "BGS_115", "attack": 24, "health": 24, "golden": false },
        { "cardId": "BG28_583", "attack": 32, "health": 48, "golden": false },
        { "cardId": "BG20_104", "attack": 16, "health": 56, "golden": false },
        { "cardId": "BG26_146", "attack": 16, "health": 16, "golden": false },
        { "cardId": "BGS_004", "attack": 8, "health": 24, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0188",
      "startedAt": 1791654732545,
      "heroCardId": "BG20_HERO_280",
      "placement": 7,
      "rating": 7127,
      "delta": -43,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BGS_126", "attack": 52, "health": 26, "golden": true },
        { "cardId": "BG29_888", "attack": 9, "health": 35, "golden": true },
        { "cardId": "BG28_583", "attack": 17, "health": 26, "golden": false },
        { "cardId": "BG23_000", "attack": 4, "health": 17, "golden": false },
        { "cardId": "BG23_002", "attack": 35, "health": 26, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0189",
      "startedAt": 1791689018574,
      "heroCardId": "BG20_HERO_101",
      "placement": 2,
      "rating": 7168,
      "delta": 41,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG27_016", "attack": 88, "health": 88, "golden": false },
        { "cardId": "BG26_814", "attack": 33, "health": 44, "golden": false },
        { "cardId": "BG24_018", "attack": 33, "health": 66, "golden": false },
        { "cardId": "BGS_020", "attack": 33, "health": 22, "golden": false },
        { "cardId": "BG28_741", "attack": 44, "health": 11, "golden": false },
        { "cardId": "BG25_010", "attack": 44, "health": 22, "golden": true },
        { "cardId": "BG27_514", "attack": 88, "health": 110, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0190",
      "startedAt": 1791721736562,
      "heroCardId": "BG20_HERO_201",
      "placement": 5,
      "rating": 7165,
      "delta": -3,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG26_147", "attack": 20, "health": 20, "golden": false },
        { "cardId": "BGS_020", "attack": 20, "health": 13, "golden": false },
        { "cardId": "BG28_583", "attack": 27, "health": 40, "golden": false },
        { "cardId": "BGS_018", "attack": 47, "health": 47, "golden": false },
        { "cardId": "BG29_816", "attack": 27, "health": 107, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0191",
      "startedAt": 1791757044413,
      "heroCardId": "BG20_HERO_280",
      "placement": 6,
      "rating": 7140,
      "delta": -25,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG21_015", "attack": 24, "health": 24, "golden": false },
        { "cardId": "BGS_115", "attack": 18, "health": 18, "golden": false },
        { "cardId": "BGS_123", "attack": 24, "health": 24, "golden": true },
        { "cardId": "BGS_115", "attack": 18, "health": 18, "golden": false },
        { "cardId": "BG26_137", "attack": 36, "health": 36, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0192",
      "startedAt": 1791791463327,
      "heroCardId": "BG20_HERO_201",
      "placement": 7,
      "rating": 7103,
      "delta": -37,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG25_016", "attack": 18, "health": 24, "golden": false },
        { "cardId": "BG28_309", "attack": 30, "health": 12, "golden": false },
        { "cardId": "BG28_300", "attack": 6, "health": 6, "golden": false },
        { "cardId": "BGS_131", "attack": 12, "health": 12, "golden": true },
        { "cardId": "BG29_888", "attack": 6, "health": 24, "golden": false },
        { "cardId": "BG28_303", "attack": 48, "health": 48, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0193",
      "startedAt": 1791827701345,
      "heroCardId": "BG20_HERO_101",
      "placement": 6,
      "rating": 7078,
      "delta": -25,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG23_318", "attack": 32, "health": 11, "golden": false },
        { "cardId": "BG22_202", "attack": 11, "health": 11, "golden": false },
        { "cardId": "BG25_354", "attack": 5, "health": 37, "golden": false },
        { "cardId": "BG25_008", "attack": 21, "health": 11, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0194",
      "startedAt": 1791860047735,
      "heroCardId": "BG20_HERO_103",
      "placement": 7,
      "rating": 7042,
      "delta": -36,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG26_505", "attack": 60, "health": 70, "golden": true },
        { "cardId": "BG28_300", "attack": 5, "health": 5, "golden": false },
        { "cardId": "BG28_309", "attack": 50, "health": 20, "golden": true },
        { "cardId": "BG27_005", "attack": 5, "health": 20, "golden": false },
        { "cardId": "BG22_202", "attack": 10, "health": 10, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0195",
      "startedAt": 1791894762778,
      "heroCardId": "BG20_HERO_103",
      "placement": 4,
      "rating": 7054,
      "delta": 12,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG22_403", "attack": 75, "health": 47, "golden": false },
        { "cardId": "BGS_131", "attack": 9, "health": 9, "golden": false },
        { "cardId": "BG29_816", "attack": 19, "health": 75, "golden": false },
        { "cardId": "BG26_963", "attack": 28, "health": 37, "golden": false },
        { "cardId": "BG25_016", "attack": 56, "health": 75, "golden": true },
        { "cardId": "BG26_ICC_901", "attack": 9, "health": 47, "golden": false },
        { "cardId": "BG26_174", "attack": 75, "health": 37, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0196",
      "startedAt": 1791930758639,
      "heroCardId": "BG20_HERO_102",
      "placement": 6,
      "rating": 7031,
      "delta": -23,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BGS_119", "attack": 11, "health": 6, "golden": false },
        { "cardId": "BG20_101", "attack": 23, "health": 45, "golden": true },
        { "cardId": "BG26_963", "attack": 17, "health": 23, "golden": false },
        { "cardId": "BG26_810", "attack": 11, "health": 28, "golden": false },
        { "cardId": "BGS_004", "attack": 6, "health": 17, "golden": false },
        { "cardId": "BGS_018", "attack": 40, "health": 40, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0197",
      "startedAt": 1791963042509,
      "heroCardId": "BG20_HERO_242",
      "placement": 4,
      "rating": 7033,
      "delta": 2,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG21_004", "attack": 36, "health": 54, "golden": false },
        { "cardId": "BG26_810", "attack": 18, "health": 45, "golden": false },
        { "cardId": "BG20_100", "attack": 36, "health": 18, "golden": true },
        { "cardId": "BG28_707", "attack": 72, "health": 54, "golden": false },
        { "cardId": "BG28_707", "attack": 72, "health": 54, "golden": false },
        { "cardId": "BG27_005", "attack": 18, "health": 72, "golden": true },
        { "cardId": "BG28_741", "attack": 36, "health": 9, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0198",
      "startedAt": 1791997667504,
      "heroCardId": "BG28_HERO_800",
      "placement": 4,
      "rating": 7039,
      "delta": 6,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG23_008", "attack": 35, "health": 52, "golden": false },
        { "cardId": "BG26_174", "attack": 35, "health": 17, "golden": false },
        { "cardId": "BG20_100", "attack": 35, "health": 17, "golden": true },
        { "cardId": "BGS_131", "attack": 9, "health": 9, "golden": false },
        { "cardId": "BGS_119", "attack": 35, "health": 17, "golden": true },
        { "cardId": "BG26_354", "attack": 52, "health": 52, "golden": false },
        { "cardId": "BG22_403", "attack": 139, "health": 87, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0199",
      "startedAt": 1792031790641,
      "heroCardId": "BG20_HERO_201",
      "placement": 7,
      "rating": 6992,
      "delta": -47,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BGS_126", "attack": 34, "health": 17, "golden": false },
        { "cardId": "BG23_009", "attack": 11, "health": 28, "golden": false },
        { "cardId": "BG26_524", "attack": 23, "health": 17, "golden": false },
        { "cardId": "BG23_009", "attack": 11, "health": 28, "golden": false },
        { "cardId": "BGS_119", "attack": 11, "health": 6, "golden": false },
        { "cardId": "BG22_202", "attack": 23, "health": 23, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0200",
      "startedAt": 1792066889028,
      "heroCardId": "BG20_HERO_242",
      "placement": 1,
      "rating": 7057,
      "delta": 65,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_963", "attack": 40, "health": 53, "golden": false },
        { "cardId": "BGS_018", "attack": 93, "health": 93, "golden": false },
        { "cardId": "BG26_ICC_901", "attack": 13, "health": 67, "golden": false },
        { "cardId": "BG27_005", "attack": 27, "health": 107, "golden": true },
        { "cardId": "BG26_175", "attack": 107, "health": 107, "golden": false },
        { "cardId": "BG29_816", "attack": 27, "health": 107, "golden": false },
        { "cardId": "BG26_137", "attack": 160, "health": 160, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0201",
      "startedAt": 1792101293990,
      "heroCardId": "BG20_HERO_201",
      "placement": 4,
      "rating": 7059,
      "delta": 2,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG26_525", "attack": 35, "health": 35, "golden": false },
        { "cardId": "BG29_300", "attack": 35, "health": 104, "golden": true },
        { "cardId": "BG27_000", "attack": 17, "health": 17, "golden": false },
        { "cardId": "BGS_119", "attack": 17, "health": 9, "golden": false },
        { "cardId": "BG26_805", "attack": 17, "health": 69, "golden": true },
        { "cardId": "BG26_817", "attack": 26, "health": 17, "golden": false },
        { "cardId": "BG20_104", "attack": 17, "health": 61, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0202",
      "startedAt": 1792138049354,
      "heroCardId": "BG22_HERO_000",
      "placement": 6,
      "rating": 7035,
      "delta": -24,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG26_524", "attack": 24, "health": 18, "golden": false },
        { "cardId": "BG26_525", "attack": 48, "health": 48, "golden": true },
        { "cardId": "BG25_010", "attack": 12, "health": 6, "golden": false },
        { "cardId": "BG26_525", "attack": 48, "health": 48, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0203",
      "startedAt": 1792172723807,
      "heroCardId": "BG20_HERO_242",
      "placement": 1,
      "rating": 7094,
      "delta": 59,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BGS_041", "attack": 49, "health": 148, "golden": false },
        { "cardId": "BG27_514", "attack": 49, "health": 62, "golden": false },
        { "cardId": "BG24_018", "attack": 37, "health": 74, "golden": false },
        { "cardId": "BG29_813", "attack": 25, "health": 37, "golden": false },
        { "cardId": "BG26_135", "attack": 37, "health": 12, "golden": false },
        { "cardId": "BG20_100", "attack": 25, "health": 12, "golden": false },
        { "cardId": "BG28_707", "attack": 197, "health": 148, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0204",
      "startedAt": 1792207254806,
      "heroCardId": "BG20_HERO_101",
      "placement": 6,
      "rating": 7073,
      "delta": -21,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG27_005", "attack": 8, "health": 31, "golden": false },
        { "cardId": "BG27_005", "attack": 8, "health": 31, "golden": false },
        { "cardId": "BG24_018", "attack": 23, "health": 46, "golden": false },
        { "cardId": "BG25_022", "attack": 31, "health": 15, "golden": true },
        { "cardId": "BG26_810", "attack": 15, "health": 38, "golden": false },
        { "cardId": "BG25_010", "attack": 15, "health": 8, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0205",
      "startedAt": 1792239046851,
      "heroCardId": "BG20_HERO_100",
      "placement": 6,
      "rating": 7049,
      "delta": -24,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG25_354", "attack": 6, "health": 44, "golden": false },
        { "cardId": "BG26_810", "attack": 13, "health": 32, "golden": false },
        { "cardId": "BG26_963", "attack": 19, "health": 25, "golden": false },
        { "cardId": "BG26_805", "attack": 6, "health": 25, "golden": false },
        { "cardId": "BG28_582", "attack": 38, "health": 38, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0206",
      "startedAt": 1792276044825,
      "heroCardId": "BG21_HERO_010",
      "placement": 7,
      "rating": 7004,
      "delta": -45,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG26_810", "attack": 9, "health": 22, "golden": false },
        { "cardId": "BG24_500", "attack": 13, "health": 9, "golden": false },
        { "cardId": "BG25_022", "attack": 9, "health": 4, "golden": false },
        { "cardId": "BG26_817", "attack": 13, "health": 9, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0207",
      "startedAt": 1792308587206,
      "heroCardId": "BG20_HERO_102",
      "placement": 5,
      "rating": 7000,
      "delta": -4,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG23_318", "attack": 96, "health": 32, "golden": true },
        { "cardId": "BG24_018", "attack": 24, "health": 48, "golden": false },
        { "cardId": "BG26_524", "attack": 32, "health": 24, "golden": false },
        { "cardId": "BG26_814", "attack": 24, "health": 32, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0208",
      "startedAt": 1792344475398,
      "heroCardId": "BG20_HERO_242",
      "placement": 3,
      "rating": 7027,
      "delta": 27,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG28_633", "attack": 40, "health": 120, "golden": true },
        { "cardId": "BG27_084", "attack": 30, "health": 10, "golden": false },
        { "cardId": "BG28_303", "attack": 80, "health": 80, "golden": true },
        { "cardId": "BG24_500", "attack": 30, "health": 20, "golden": false },
        { "cardId": "BG28_582", "attack": 60, "health": 60, "golden": true },
        { "cardId": "BG21_004", "attack": 40, "health": 60, "golden": false },
        { "cardId": "BG26_174", "attack": 40, "health": 20, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0209",
      "startedAt": 1792379200125,
      "heroCardId": "BG20_HERO_101",
      "placement": 3,
      "rating": 7044,
      "delta": 17,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG26_810", "attack": 19, "health": 47, "golden": false },
        { "cardId": "BG27_005", "attack": 19, "health": 75, "golden": true },
        { "cardId": "BGS_116", "attack": 75, "health": 93, "golden": true },
        { "cardId": "BG25_008", "attack": 37, "health": 19, "golden": false },
        { "cardId": "BGS_008", "attack": 65, "health": 65, "golden": false },
        { "cardId": "BG26_147", "attack": 28, "health": 28, "golden": false },
        { "cardId": "BG25_001", "attack": 19, "health": 9, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0210",
      "startedAt": 1792412227124,
      "heroCardId": "BG20_HERO_201",
      "placement": 1,
      "rating": 7108,
      "delta": 64,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG28_633", "attack": 25, "health": 74, "golden": false },
        { "cardId": "BG26_802", "attack": 37, "health": 74, "golden": false },
        { "cardId": "BGS_123", "attack": 49, "health": 49, "golden": true },
        { "cardId": "BG23_357", "attack": 37, "health": 25, "golden": false },
        { "cardId": "BG22_403", "attack": 197, "health": 123, "golden": true },
        { "cardId": "BG26_814", "attack": 37, "health": 49, "golden": false },
        { "cardId": "BG26_147", "attack": 37, "health": 37, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0211",
      "startedAt": 1792448059788,
      "heroCardId": "BG20_HERO_201",
      "placement": 7,
      "rating": 7064,
      "delta": -44,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG23_357", "attack": 16, "health": 11, "golden": false },
        { "cardId": "BGS_126", "attack": 64, "health": 32, "golden": true },
        { "cardId": "BGS_004", "attack": 5, "health": 16, "golden": false },
        { "cardId": "BG22_202", "attack": 11, "health": 11, "golden": false },
        { "cardId": "BG25_013", "attack": 5, "health": 21, "golden": false },
        { "cardId": "BG24_018", "attack": 16, "health": 32, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0212",
      "startedAt": 1792483150754,
      "heroCardId": "BG20_HERO_100",
      "placement": 6,
      "rating": 7042,
      "delta": -22,
      "anomalyCardId": null,
      "tavernTier": 5,
      "board": [
        { "cardId": "BG28_303", "attack": 23, "health": 23, "golden": false },
        { "cardId": "BG25_001", "attack": 11, "health": 6, "golden": false },
        { "cardId": "BG28_303", "attack": 23, "health": 23, "golden": false },
        { "cardId": "BG24_500", "attack": 34, "health": 23, "golden": true },
        { "cardId": "BG25_009", "attack": 45, "health": 6, "golden": false },
        { "cardId": "BGS_115", "attack": 17, "health": 17, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0213",
      "startedAt": 1792518004027,
      "heroCardId": "BG20_HERO_102",
      "placement": 2,
      "rating": 7083,
      "delta": 41,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_505", "attack": 144, "health": 168, "golden": true },
        { "cardId": "BGS_126", "attack": 72, "health": 36, "golden": false },
        { "cardId": "BG26_146", "attack": 24, "health": 24, "golden": false },
        { "cardId": "BG28_300", "attack": 24, "health": 24, "golden": true },
        { "cardId": "BG26_810", "attack": 48, "health": 120, "golden": true },
        { "cardId": "BG23_000", "attack": 24, "health": 96, "golden": true },
        { "cardId": "BG26_137", "attack": 72, "health": 72, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0214",
      "startedAt": 1792553375860,
      "heroCardId": "BG20_HERO_201",
      "placement": 7,
      "rating": 7040,
      "delta": -43,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG25_022", "attack": 13, "health": 7, "golden": false },
        { "cardId": "BG26_137", "attack": 40, "health": 40, "golden": false },
        { "cardId": "BG26_814", "attack": 20, "health": 27, "golden": false },
        { "cardId": "BG26_135", "attack": 20, "health": 7, "golden": false },
        { "cardId": "BG23_004", "attack": 13, "health": 20, "golden": false },
        { "cardId": "BGS_126", "attack": 80, "health": 40, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0215",
      "startedAt": 1792585901123,
      "heroCardId": "BG20_HERO_201",
      "placement": 1,
      "rating": 7102,
      "delta": 62,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_817", "attack": 33, "health": 22, "golden": false },
        { "cardId": "BG25_013", "attack": 22, "health": 88, "golden": true },
        { "cardId": "BG28_707", "attack": 88, "health": 66, "golden": false },
        { "cardId": "BG23_002", "attack": 88, "health": 66, "golden": true },
        { "cardId": "BG22_403", "attack": 88, "health": 55, "golden": false },
        { "cardId": "BG26_817", "attack": 33, "health": 22, "golden": false },
        { "cardId": "BG29_611", "attack": 22, "health": 22, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0216",
      "startedAt": 1792622136674,
      "heroCardId": "BG20_HERO_201",
      "placement": 1,
      "rating": 7166,
      "delta": 64,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_524", "attack": 99, "health": 74, "golden": true },
        { "cardId": "BGS_040", "attack": 99, "health": 49, "golden": false },
        { "cardId": "BG29_300", "attack": 25, "health": 74, "golden": false },
        { "cardId": "BG28_582", "attack": 74, "health": 74, "golden": true },
        { "cardId": "BG27_514", "attack": 49, "health": 62, "golden": false },
        { "cardId": "BGS_116", "attack": 49, "health": 62, "golden": false },
        { "cardId": "BGS_034", "attack": 25, "health": 12, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0217",
      "startedAt": 1792655690163,
      "heroCardId": "BG20_HERO_101",
      "placement": 2,
      "rating": 7210,
      "delta": 44,
      "anomalyCardId": null,
      "tavernTier": 7,
      "board": [
        { "cardId": "BG26_146", "attack": 23, "health": 23, "golden": false },
        { "cardId": "BG26_805", "attack": 12, "health": 47, "golden": false },
        { "cardId": "BG23_008", "attack": 47, "health": 70, "golden": false },
        { "cardId": "BG26_147", "attack": 35, "health": 35, "golden": false },
        { "cardId": "BG26_505", "attack": 70, "health": 82, "golden": false },
        { "cardId": "BGS_040", "attack": 93, "health": 47, "golden": false },
        { "cardId": "BG25_011", "attack": 12, "health": 47, "golden": false }
      ]
    },
    {
      "id": "seed-bg-0218",
      "startedAt": 1792691378718,
      "heroCardId": "BG20_HERO_103",
      "placement": 3,
      "rating": 7231,
      "delta": 21,
      "anomalyCardId": null,
      "tavernTier": 6,
      "board": [
        { "cardId": "BG27_084", "attack": 52, "health": 17, "golden": true },
        { "cardId": "BGS_020", "attack": 26, "health": 17, "golden": false },
        { "cardId": "BGS_018", "attack": 61, "health": 61, "golden": false },
        { "cardId": "BG24_500", "attack": 52, "health": 35, "golden": true },
        { "cardId": "BG26_817", "attack": 26, "health": 17, "golden": false },
        { "cardId": "BGS_034", "attack": 17, "health": 9, "golden": false },
        { "cardId": "BG26_354", "attack": 104, "health": 104, "golden": true }
      ]
    },
    {
      "id": "seed-bg-0219",
      "startedAt": 1792725717786,
      "heroCardId": "BG20_HERO_101",
      "placement": 7,
      "rating": 7185,
      "delta": -46,
      "anomalyCardId": null,
      "tavernTier": 4,
      "board": [
        { "cardId": "BG26_524", "attack": 27, "health": 20, "golden": false },
        { "cardId": "BG25_001", "attack": 13, "health": 7, "golden": false },
        { "cardId": "BG21_015", "attack": 27, "health": 27, "golden": false },
        { "cardId": "BG26_525", "attack": 27, "health": 27, "golden": false },
        { "cardId": "BG26_810", "attack": 13, "health": 33, "golden": false },
        { "cardId": "BG20_101", "attack": 27, "health": 53, "golden": true }
      ]
    }
  ],
  "heroes": [
    {
      "heroCardId": "BG20_HERO_101",
      "games": 31,
      "netRating": -101,
      "averagePlacement": 4.65,
      "placements": [3, 5, 3, 2, 3, 6, 9, 0],
      "combat": [
        { "turn": 1, "winrate": 58.1, "rounds": 31 },
        { "turn": 2, "winrate": 54.8, "rounds": 31 },
        { "turn": 3, "winrate": 61.3, "rounds": 31 },
        { "turn": 4, "winrate": 45.2, "rounds": 31 },
        { "turn": 5, "winrate": 58.1, "rounds": 31 },
        { "turn": 6, "winrate": 61.3, "rounds": 31 },
        { "turn": 7, "winrate": 45.2, "rounds": 31 },
        { "turn": 8, "winrate": 65.5, "rounds": 29 },
        { "turn": 9, "winrate": 52, "rounds": 25 },
        { "turn": 10, "winrate": 52.4, "rounds": 21 },
        { "turn": 11, "winrate": 55.6, "rounds": 18 },
        { "turn": 12, "winrate": 69.2, "rounds": 13 },
        { "turn": 13, "winrate": 45.5, "rounds": 11 },
        { "turn": 14, "winrate": 62.5, "rounds": 8 },
        { "turn": 15, "winrate": 66.7, "rounds": 3 }
      ],
      "offered": 48,
      "picked": 31,
      "global": null
    },
    {
      "heroCardId": "BG20_HERO_242",
      "games": 29,
      "netRating": 299,
      "averagePlacement": 3.79,
      "placements": [3, 5, 5, 7, 3, 3, 3, 0],
      "combat": [
        { "turn": 1, "winrate": 44.8, "rounds": 29 },
        { "turn": 2, "winrate": 62.1, "rounds": 29 },
        { "turn": 3, "winrate": 62.1, "rounds": 29 },
        { "turn": 4, "winrate": 58.6, "rounds": 29 },
        { "turn": 5, "winrate": 55.2, "rounds": 29 },
        { "turn": 6, "winrate": 55.2, "rounds": 29 },
        { "turn": 7, "winrate": 62.1, "rounds": 29 },
        { "turn": 8, "winrate": 46.4, "rounds": 28 },
        { "turn": 9, "winrate": 37, "rounds": 27 },
        { "turn": 10, "winrate": 58.3, "rounds": 24 },
        { "turn": 11, "winrate": 56.5, "rounds": 23 },
        { "turn": 12, "winrate": 22.2, "rounds": 18 },
        { "turn": 13, "winrate": 30, "rounds": 10 },
        { "turn": 14, "winrate": 42.9, "rounds": 7 },
        { "turn": 15, "winrate": 60, "rounds": 5 }
      ],
      "offered": 47,
      "picked": 29,
      "global": null
    },
    {
      "heroCardId": "BG20_HERO_201",
      "games": 26,
      "netRating": 97,
      "averagePlacement": 4.27,
      "placements": [6, 2, 2, 2, 4, 3, 7, 0],
      "combat": [
        { "turn": 1, "winrate": 57.7, "rounds": 26 },
        { "turn": 2, "winrate": 53.8, "rounds": 26 },
        { "turn": 3, "winrate": 57.7, "rounds": 26 },
        { "turn": 4, "winrate": 50, "rounds": 26 },
        { "turn": 5, "winrate": 38.5, "rounds": 26 },
        { "turn": 6, "winrate": 57.7, "rounds": 26 },
        { "turn": 7, "winrate": 46.2, "rounds": 26 },
        { "turn": 8, "winrate": 53.8, "rounds": 26 },
        { "turn": 9, "winrate": 60, "rounds": 20 },
        { "turn": 10, "winrate": 40, "rounds": 15 },
        { "turn": 11, "winrate": 50, "rounds": 12 },
        { "turn": 12, "winrate": 50, "rounds": 6 },
        { "turn": 13, "winrate": 60, "rounds": 5 },
        { "turn": 14, "winrate": 33.3, "rounds": 3 },
        { "turn": 15, "winrate": 0, "rounds": 1 }
      ],
      "offered": 41,
      "picked": 26,
      "global": null
    },
    {
      "heroCardId": "BG20_HERO_280",
      "games": 24,
      "netRating": 129,
      "averagePlacement": 4.29,
      "placements": [4, 3, 2, 2, 3, 6, 4, 0],
      "combat": [
        { "turn": 1, "winrate": 58.3, "rounds": 24 },
        { "turn": 2, "winrate": 41.7, "rounds": 24 },
        { "turn": 3, "winrate": 50, "rounds": 24 },
        { "turn": 4, "winrate": 58.3, "rounds": 24 },
        { "turn": 5, "winrate": 50, "rounds": 24 },
        { "turn": 6, "winrate": 54.2, "rounds": 24 },
        { "turn": 7, "winrate": 50, "rounds": 24 },
        { "turn": 8, "winrate": 57.1, "rounds": 21 },
        { "turn": 9, "winrate": 50, "rounds": 20 },
        { "turn": 10, "winrate": 38.9, "rounds": 18 },
        { "turn": 11, "winrate": 50, "rounds": 16 },
        { "turn": 12, "winrate": 75, "rounds": 12 },
        { "turn": 13, "winrate": 18.2, "rounds": 11 },
        { "turn": 14, "winrate": 37.5, "rounds": 8 },
        { "turn": 15, "winrate": 60, "rounds": 5 }
      ],
      "offered": 44,
      "picked": 24,
      "global": null
    },
    {
      "heroCardId": "BG20_HERO_100",
      "games": 23,
      "netRating": 171,
      "averagePlacement": 4.09,
      "placements": [3, 1, 7, 1, 3, 7, 1, 0],
      "combat": [
        { "turn": 1, "winrate": 73.9, "rounds": 23 },
        { "turn": 2, "winrate": 65.2, "rounds": 23 },
        { "turn": 3, "winrate": 52.2, "rounds": 23 },
        { "turn": 4, "winrate": 47.8, "rounds": 23 },
        { "turn": 5, "winrate": 73.9, "rounds": 23 },
        { "turn": 6, "winrate": 52.2, "rounds": 23 },
        { "turn": 7, "winrate": 69.6, "rounds": 23 },
        { "turn": 8, "winrate": 43.5, "rounds": 23 },
        { "turn": 9, "winrate": 66.7, "rounds": 21 },
        { "turn": 10, "winrate": 35.3, "rounds": 17 },
        { "turn": 11, "winrate": 66.7, "rounds": 15 },
        { "turn": 12, "winrate": 45.5, "rounds": 11 },
        { "turn": 13, "winrate": 57.1, "rounds": 7 },
        { "turn": 14, "winrate": 60, "rounds": 5 },
        { "turn": 15, "winrate": 33.3, "rounds": 3 }
      ],
      "offered": 45,
      "picked": 23,
      "global": null
    },
    {
      "heroCardId": "BG20_HERO_103",
      "games": 22,
      "netRating": 66,
      "averagePlacement": 4.32,
      "placements": [3, 2, 4, 1, 4, 4, 4, 0],
      "combat": [
        { "turn": 1, "winrate": 72.7, "rounds": 22 },
        { "turn": 2, "winrate": 68.2, "rounds": 22 },
        { "turn": 3, "winrate": 50, "rounds": 22 },
        { "turn": 4, "winrate": 59.1, "rounds": 22 },
        { "turn": 5, "winrate": 36.4, "rounds": 22 },
        { "turn": 6, "winrate": 59.1, "rounds": 22 },
        { "turn": 7, "winrate": 45.5, "rounds": 22 },
        { "turn": 8, "winrate": 28.6, "rounds": 21 },
        { "turn": 9, "winrate": 50, "rounds": 18 },
        { "turn": 10, "winrate": 26.7, "rounds": 15 },
        { "turn": 11, "winrate": 46.2, "rounds": 13 },
        { "turn": 12, "winrate": 54.5, "rounds": 11 },
        { "turn": 13, "winrate": 33.3, "rounds": 9 },
        { "turn": 14, "winrate": 28.6, "rounds": 7 },
        { "turn": 15, "winrate": 40, "rounds": 5 }
      ],
      "offered": 37,
      "picked": 22,
      "global": null
    }
  ],
  "global": { "availability": "subscription", "mmr": "TOP_50_PERCENT" },
  "cards": {
    "BG20_HERO_101": "Зирелла",
    "BG20_HERO_242": "Гафф Рунический Тотем",
    "BG20_HERO_201": "Вол'джин",
    "BG20_HERO_280": "Куртрус Ливень Пепла",
    "BG20_HERO_100": "Рокара",
    "BG20_HERO_103": "Вестник смерти Черношип",
    "BG20_HERO_102": "Воевода Саурфанг",
    "BG23_HERO_305": "Король воров Вихлепых",
    "BG28_HERO_800": "Тей'телан Кровавый Взор",
    "BG23_HERO_303": "Мурлок Холмс",
    "BG22_HERO_000": "Тавиш Грозовая Вершина",
    "BG21_HERO_010": "Скаббс Маслорез",
    "BG24_HERO_204": "Механо-усилитель",
    "BG29_888": "Бликостраж",
    "BGS_018": "Голдринн, Великий волк",
    "BG27_084": "Шустрый скарабей",
    "BG26_817": "Коллекционер мечей",
    "BG26_135": "Музыкант Южных Морей",
    "BG26_814": "Влюбленный трубадур",
    "BG26_174": "Дирижер душ",
    "BG24_715": "Терпеливый разведчик",
    "BG25_001": "Восставший всадник",
    "BGS_041": "Калесгос, аспект магии",
    "BG26_152": "Вспомогательный дрон",
    "BG28_633": "Скверносвин",
    "BGS_116": "Обновляющая аномалия",
    "BGS_123": "Буря в таверне",
    "BG26_810": "Разносчица пороха",
    "BG26_ICC_901": "Чародейка драккари",
    "BGS_020": "Палеомурлок-разведчик",
    "BG28_303": "Переодетый грабитель могил",
    "BG27_556": "Трясинный собиратель",
    "BG26_505": "Любительница маракасов",
    "BG26_805": "Вокалибри",
    "BG29_300": "Голодный зимнеплав",
    "BG23_009": "Лавовый скрытень",
    "BG28_550": "Звезда родео",
    "BGS_126": "Буйный элементаль огня",
    "BG25_354": "Тит Ривендер",
    "BG21_015": "Таресгоса",
    "BG28_582": "Искалеченный бандит",
    "BG24_018": "Тортоллан-синепанцирь",
    "BG26_137": "Водный счетовод",
    "BG23_318": "Лирой Бесшабашный",
    "BGS_040": "Надина Красная",
    "BG23_007": "Укротитель волн",
    "BG29_816": "Рычащий вербовщик",
    "BG22_403": "Юный Мрачноглаз",
    "BG20_101": "Турбохряк",
    "BG27_005": "Хронокэп Крюкохвост",
    "BGS_008": "Гибельный змей",
    "BG27_000": "Железная смотрительница",
    "BGS_115": "Продажементаль",
    "BG28_309": "Мумификатор",
    "BGS_004": "Заклинатель гнева",
    "BG20_100": "Иглошкур-геомант",
    "BG23_357": "Мозговая жижа",
    "BG28_300": "Безобидная черепушка",
    "BG23_008": "Светящаяся Чешуя",
    "BG26_524": "Малчезар, принц танца",
    "BG26_523": "Тихондрий",
    "BG26_963": "Электрический синтезатор",
    "BG23_004": "Глубоководный удильщик",
    "BG26_802": "Банановый буян",
    "BG21_004": "Ненасытный ур'зул",
    "BG29_813": "Упорный поэт",
    "BG25_009": "Вечная призывательница",
    "BGS_119": "Трескучий циклон",
    "BG24_500": "Янтарный страж",
    "BGS_034": "Бронзовый страж",
    "BG23_002": "Коллекционер раковин",
    "BG26_525": "Внушительная барабанщица",
    "BG25_010": "Безрукая Отрекшаяся",
    "BG23_000": "Мини-мирмидон",
    "BGS_131": "Смертоносная спора",
    "BG25_022": "Алый Череп",
    "BG25_008": "Вечный рыцарь",
    "BG27_514": "Морская ведьма Зар'джира",
    "BG28_583": "Геомаг Ругуг",
    "BG26_147": "Созвучатор",
    "BG20_104": "Бдыщер",
    "BG28_741": "Энергоцарица",
    "BG25_011": "Неруб-смертороевик",
    "BG27_016": "Поборница Саргераса",
    "BG26_354": "Хоровой «мрррглр»",
    "BG26_146": "Баюбот",
    "BG29_611": "Протягиватель кабелей",
    "BG28_707": "Живой азерит",
    "BG26_175": "Сюрпризоменталь",
    "BG25_013": "Гнолл из стаи Гнилошкуров",
    "BG25_016": "Син'дорай-снайпер",
    "BG22_202": "Голован"
  }
};

export const standardFixture: ConstructedStats = {
  "mode": "standard",
  "period": "all",
  "games": 160,
  "summary": {
    "wins": 97,
    "losses": 63,
    "ties": 0,
    "winrate": 60.6,
    "rankedGames": 142,
    "averageDurationSeconds": 577,
    "averageTurns": 10,
    "timePlayedSeconds": 92330,
    "currentRank": { "starLevel": 51, "stars": 1, "legendRank": 2326 },
    "bestRank": { "starLevel": 51, "stars": 1, "legendRank": 2266 },
    "first": { "games": 83, "wins": 49 },
    "coin": { "games": 77, "wins": 48 }
  },
  "rankSeries": [
    {
      "id": "seed-standard-0093",
      "startedAt": 1790047546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3697 },
      "value": 205
    },
    {
      "id": "seed-standard-0094",
      "startedAt": 1790088046178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3747 },
      "value": 205
    },
    {
      "id": "seed-standard-0095",
      "startedAt": 1790128546178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3685 },
      "value": 205
    },
    {
      "id": "seed-standard-0096",
      "startedAt": 1790169046178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3600 },
      "value": 205
    },
    {
      "id": "seed-standard-0097",
      "startedAt": 1790209546178,
      "result": "win",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3514 },
      "value": 205
    },
    {
      "id": "seed-standard-0098",
      "startedAt": 1790250046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3431 },
      "value": 205
    },
    {
      "id": "seed-standard-0100",
      "startedAt": 1790331046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3473 },
      "value": 205
    },
    {
      "id": "seed-standard-0101",
      "startedAt": 1790371546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3408 },
      "value": 205
    },
    {
      "id": "seed-standard-0102",
      "startedAt": 1790412046178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3323 },
      "value": 205
    },
    {
      "id": "seed-standard-0103",
      "startedAt": 1790452546178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3369 },
      "value": 205
    },
    {
      "id": "seed-standard-0104",
      "startedAt": 1790493046178,
      "result": "loss",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3417 },
      "value": 205
    },
    {
      "id": "seed-standard-0105",
      "startedAt": 1790533546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3452 },
      "value": 205
    },
    {
      "id": "seed-standard-0106",
      "startedAt": 1790574046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3368 },
      "value": 205
    },
    {
      "id": "seed-standard-0107",
      "startedAt": 1790614546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3316 },
      "value": 205
    },
    {
      "id": "seed-standard-0109",
      "startedAt": 1790695546178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3300 },
      "value": 205
    },
    {
      "id": "seed-standard-0110",
      "startedAt": 1790736046178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3345 },
      "value": 205
    },
    {
      "id": "seed-standard-0111",
      "startedAt": 1790776546178,
      "result": "loss",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3419 },
      "value": 205
    },
    {
      "id": "seed-standard-0112",
      "startedAt": 1790817046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3356 },
      "value": 205
    },
    {
      "id": "seed-standard-0113",
      "startedAt": 1790857546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3306 },
      "value": 205
    },
    {
      "id": "seed-standard-0114",
      "startedAt": 1790898046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3242 },
      "value": 205
    },
    {
      "id": "seed-standard-0115",
      "startedAt": 1790938546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3272 },
      "value": 205
    },
    {
      "id": "seed-standard-0116",
      "startedAt": 1790979046178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3310 },
      "value": 205
    },
    {
      "id": "seed-standard-0118",
      "startedAt": 1791060046178,
      "result": "win",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3186 },
      "value": 205
    },
    {
      "id": "seed-standard-0119",
      "startedAt": 1791100546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3228 },
      "value": 205
    },
    {
      "id": "seed-standard-0120",
      "startedAt": 1791141046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3155 },
      "value": 205
    },
    {
      "id": "seed-standard-0121",
      "startedAt": 1791181546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3204 },
      "value": 205
    },
    {
      "id": "seed-standard-0122",
      "startedAt": 1791222046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3166 },
      "value": 205
    },
    {
      "id": "seed-standard-0123",
      "startedAt": 1791262546178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3190 },
      "value": 205
    },
    {
      "id": "seed-standard-0124",
      "startedAt": 1791303046178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3121 },
      "value": 205
    },
    {
      "id": "seed-standard-0125",
      "startedAt": 1791343546178,
      "result": "loss",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3175 },
      "value": 205
    },
    {
      "id": "seed-standard-0127",
      "startedAt": 1791424546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3174 },
      "value": 205
    },
    {
      "id": "seed-standard-0128",
      "startedAt": 1791465046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3092 },
      "value": 205
    },
    {
      "id": "seed-standard-0129",
      "startedAt": 1791505546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3154 },
      "value": 205
    },
    {
      "id": "seed-standard-0130",
      "startedAt": 1791546046178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3204 },
      "value": 205
    },
    {
      "id": "seed-standard-0131",
      "startedAt": 1791586546178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3149 },
      "value": 205
    },
    {
      "id": "seed-standard-0132",
      "startedAt": 1791627046178,
      "result": "win",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3066 },
      "value": 205
    },
    {
      "id": "seed-standard-0133",
      "startedAt": 1791667546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 3024 },
      "value": 205
    },
    {
      "id": "seed-standard-0134",
      "startedAt": 1791708046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2981 },
      "value": 205
    },
    {
      "id": "seed-standard-0136",
      "startedAt": 1791789046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2826 },
      "value": 205
    },
    {
      "id": "seed-standard-0137",
      "startedAt": 1791829546178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2742 },
      "value": 205
    },
    {
      "id": "seed-standard-0138",
      "startedAt": 1791870046178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2815 },
      "value": 205
    },
    {
      "id": "seed-standard-0139",
      "startedAt": 1791910546178,
      "result": "win",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2763 },
      "value": 205
    },
    {
      "id": "seed-standard-0140",
      "startedAt": 1791951046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2719 },
      "value": 205
    },
    {
      "id": "seed-standard-0141",
      "startedAt": 1791991546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2632 },
      "value": 205
    },
    {
      "id": "seed-standard-0142",
      "startedAt": 1792032046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2597 },
      "value": 205
    },
    {
      "id": "seed-standard-0143",
      "startedAt": 1792072546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2551 },
      "value": 205
    },
    {
      "id": "seed-standard-0145",
      "startedAt": 1792153546178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2504 },
      "value": 205
    },
    {
      "id": "seed-standard-0146",
      "startedAt": 1792194046178,
      "result": "loss",
      "playerClass": "SHAMAN",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2554 },
      "value": 205
    },
    {
      "id": "seed-standard-0147",
      "startedAt": 1792234546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2580 },
      "value": 205
    },
    {
      "id": "seed-standard-0148",
      "startedAt": 1792275046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2520 },
      "value": 205
    },
    {
      "id": "seed-standard-0149",
      "startedAt": 1792315546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2456 },
      "value": 205
    },
    {
      "id": "seed-standard-0150",
      "startedAt": 1792356046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2382 },
      "value": 205
    },
    {
      "id": "seed-standard-0151",
      "startedAt": 1792396546178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2346 },
      "value": 205
    },
    {
      "id": "seed-standard-0152",
      "startedAt": 1792437046178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2375 },
      "value": 205
    },
    {
      "id": "seed-standard-0154",
      "startedAt": 1792518046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2377 },
      "value": 205
    },
    {
      "id": "seed-standard-0155",
      "startedAt": 1792558546178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2346 },
      "value": 205
    },
    {
      "id": "seed-standard-0156",
      "startedAt": 1792599046178,
      "result": "win",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2270 },
      "value": 205
    },
    {
      "id": "seed-standard-0157",
      "startedAt": 1792639546178,
      "result": "loss",
      "playerClass": "DEATHKNIGHT",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2301 },
      "value": 205
    },
    {
      "id": "seed-standard-0158",
      "startedAt": 1792680046178,
      "result": "win",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2266 },
      "value": 205
    },
    {
      "id": "seed-standard-0159",
      "startedAt": 1792720546178,
      "result": "loss",
      "playerClass": "PRIEST",
      "rank": { "starLevel": 51, "stars": 1, "legendRank": 2326 },
      "value": 205
    }
  ],
  "decks": [
    { "key": "AAECAfHhBAKH9gWV8gUOh+MEq+8E", "deckCode": "AAECAfHhBAKH9gWV8gUOh+MEq+8E", "deckName": "Кровь и лёд", "archetype": "Blood Death Knight", "playerClass": "DEATHKNIGHT", "lastPlayedAt": 1792639546178, "games": 92, "wins": 61 },
    { "key": "AAECAa0GBPDtBIGlBuqmBomyBg2t", "deckCode": "AAECAa0GBPDtBIGlBuqmBomyBg2t", "deckName": "Драконы", "archetype": "Dragon Priest", "playerClass": "PRIEST", "lastPlayedAt": 1792720546178, "games": 46, "wins": 24 },
    { "key": "AAECAaoICPqwBs/OBqf7BcHQBg6E", "deckCode": "AAECAaoICPqwBs/OBqf7BcHQBg6E", "deckName": "Элементали", "archetype": "Elemental Shaman", "playerClass": "SHAMAN", "lastPlayedAt": 1792477546178, "games": 22, "wins": 12 }
  ],
  "archetypes": [
    { "archetype": "Blood Death Knight", "playerClass": "DEATHKNIGHT", "globalWinrate": null, "games": 92, "wins": 61 },
    { "archetype": "Dragon Priest", "playerClass": "PRIEST", "globalWinrate": null, "games": 46, "wins": 24 },
    { "archetype": "Elemental Shaman", "playerClass": "SHAMAN", "globalWinrate": null, "games": 22, "wins": 12 }
  ],
  "classes": [
    { "playerClass": "DEATHKNIGHT", "globalWinrate": null, "games": 92, "wins": 61 },
    { "playerClass": "PRIEST", "globalWinrate": null, "games": 46, "wins": 24 },
    { "playerClass": "SHAMAN", "globalWinrate": null, "games": 22, "wins": 12 }
  ],
  "opponentClasses": [
    { "opponentClass": "HUNTER", "games": 20, "wins": 11 },
    { "opponentClass": "SHAMAN", "games": 19, "wins": 13 },
    { "opponentClass": "PALADIN", "games": 17, "wins": 11 },
    { "opponentClass": "PRIEST", "games": 15, "wins": 12 },
    { "opponentClass": "WARRIOR", "games": 15, "wins": 8 },
    { "opponentClass": "DEATHKNIGHT", "games": 15, "wins": 6 },
    { "opponentClass": "MAGE", "games": 12, "wins": 8 },
    { "opponentClass": "ROGUE", "games": 12, "wins": 7 },
    { "opponentClass": "DRUID", "games": 12, "wins": 7 },
    { "opponentClass": "DEMONHUNTER", "games": 12, "wins": 6 },
    { "opponentClass": "WARLOCK", "games": 11, "wins": 8 }
  ],
  "matchups": [
    { "playerClass": "PRIEST", "opponentClass": "PRIEST", "games": 2, "wins": 1 },
    { "playerClass": "PRIEST", "opponentClass": "WARLOCK", "games": 1, "wins": 1 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "DEATHKNIGHT", "games": 8, "wins": 3 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "ROGUE", "games": 8, "wins": 6 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "WARLOCK", "games": 8, "wins": 6 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "WARRIOR", "games": 10, "wins": 5 },
    { "playerClass": "SHAMAN", "opponentClass": "ROGUE", "games": 1, "wins": 0 },
    { "playerClass": "PRIEST", "opponentClass": "PALADIN", "games": 4, "wins": 2 },
    { "playerClass": "PRIEST", "opponentClass": "SHAMAN", "games": 9, "wins": 7 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "HUNTER", "games": 10, "wins": 6 },
    { "playerClass": "SHAMAN", "opponentClass": "PALADIN", "games": 4, "wins": 2 },
    { "playerClass": "PRIEST", "opponentClass": "DRUID", "games": 2, "wins": 1 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "MAGE", "games": 6, "wins": 5 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "PRIEST", "games": 10, "wins": 8 },
    { "playerClass": "PRIEST", "opponentClass": "HUNTER", "games": 8, "wins": 3 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "DRUID", "games": 9, "wins": 6 },
    { "playerClass": "SHAMAN", "opponentClass": "PRIEST", "games": 3, "wins": 3 },
    { "playerClass": "PRIEST", "opponentClass": "MAGE", "games": 3, "wins": 1 },
    { "playerClass": "SHAMAN", "opponentClass": "DEATHKNIGHT", "games": 1, "wins": 0 },
    { "playerClass": "PRIEST", "opponentClass": "DEATHKNIGHT", "games": 6, "wins": 3 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "PALADIN", "games": 9, "wins": 7 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "SHAMAN", "games": 9, "wins": 6 },
    { "playerClass": "SHAMAN", "opponentClass": "HUNTER", "games": 2, "wins": 2 },
    { "playerClass": "PRIEST", "opponentClass": "DEMONHUNTER", "games": 5, "wins": 1 },
    { "playerClass": "SHAMAN", "opponentClass": "DRUID", "games": 1, "wins": 0 },
    { "playerClass": "SHAMAN", "opponentClass": "WARRIOR", "games": 2, "wins": 0 },
    { "playerClass": "DEATHKNIGHT", "opponentClass": "DEMONHUNTER", "games": 5, "wins": 3 },
    { "playerClass": "PRIEST", "opponentClass": "WARRIOR", "games": 3, "wins": 3 },
    { "playerClass": "PRIEST", "opponentClass": "ROGUE", "games": 3, "wins": 1 },
    { "playerClass": "SHAMAN", "opponentClass": "MAGE", "games": 3, "wins": 2 },
    { "playerClass": "SHAMAN", "opponentClass": "WARLOCK", "games": 2, "wins": 1 },
    { "playerClass": "SHAMAN", "opponentClass": "SHAMAN", "games": 1, "wins": 0 },
    { "playerClass": "SHAMAN", "opponentClass": "DEMONHUNTER", "games": 2, "wins": 2 }
  ],
  "global": {
    "availability": "subscription"
  }
};

export const arenaFixture: ArenaStats = {
  "mode": "arena",
  "period": "all",
  "games": 132,
  "summary": {
    "runs": 18,
    "averageWins": 4.39,
    "bestRun": { "runId": "seed-run-0009", "playerClass": "ROGUE", "wins": 10, "losses": 3, "games": 13, "startedAt": 1789650646178, "lastPlayedAt": 1789665046178, "complete": true, "underground": false },
    "twelveWinRuns": 0,
    "wins": 79,
    "losses": 53,
    "gameWinrate": 59.8,
    "timePlayedSeconds": 87448
  },
  "runs": [
    { "runId": "seed-run-0017", "playerClass": "PALADIN", "wins": 2, "losses": 2, "games": 4, "startedAt": 1792415446178, "lastPlayedAt": 1792419046178, "complete": false, "underground": false },
    { "runId": "seed-run-0016", "playerClass": "DEMONHUNTER", "wins": 1, "losses": 3, "games": 4, "startedAt": 1792069846178, "lastPlayedAt": 1792073446178, "complete": true, "underground": false },
    { "runId": "seed-run-0015", "playerClass": "HUNTER", "wins": 3, "losses": 3, "games": 6, "startedAt": 1791724246178, "lastPlayedAt": 1791730246178, "complete": true, "underground": false },
    { "runId": "seed-run-0014", "playerClass": "PALADIN", "wins": 0, "losses": 3, "games": 3, "startedAt": 1791378646178, "lastPlayedAt": 1791381046178, "complete": true, "underground": false },
    { "runId": "seed-run-0013", "playerClass": "ROGUE", "wins": 2, "losses": 3, "games": 5, "startedAt": 1791033046178, "lastPlayedAt": 1791037846178, "complete": true, "underground": false },
    { "runId": "seed-run-0012", "playerClass": "HUNTER", "wins": 3, "losses": 3, "games": 6, "startedAt": 1790687446178, "lastPlayedAt": 1790693446178, "complete": true, "underground": false },
    { "runId": "seed-run-0011", "playerClass": "MAGE", "wins": 1, "losses": 3, "games": 4, "startedAt": 1790341846178, "lastPlayedAt": 1790345446178, "complete": true, "underground": false },
    { "runId": "seed-run-0010", "playerClass": "WARLOCK", "wins": 5, "losses": 3, "games": 8, "startedAt": 1789996246178, "lastPlayedAt": 1790004646178, "complete": true, "underground": false },
    { "runId": "seed-run-0009", "playerClass": "ROGUE", "wins": 10, "losses": 3, "games": 13, "startedAt": 1789650646178, "lastPlayedAt": 1789665046178, "complete": true, "underground": false },
    { "runId": "seed-run-0008", "playerClass": "MAGE", "wins": 10, "losses": 3, "games": 13, "startedAt": 1789305046178, "lastPlayedAt": 1789319446178, "complete": true, "underground": false },
    { "runId": "seed-run-0007", "playerClass": "HUNTER", "wins": 5, "losses": 3, "games": 8, "startedAt": 1788959446178, "lastPlayedAt": 1788967846178, "complete": true, "underground": false },
    { "runId": "seed-run-0006", "playerClass": "DEMONHUNTER", "wins": 0, "losses": 3, "games": 3, "startedAt": 1788613846178, "lastPlayedAt": 1788616246178, "complete": true, "underground": false },
    { "runId": "seed-run-0005", "playerClass": "DEMONHUNTER", "wins": 9, "losses": 3, "games": 12, "startedAt": 1788268246178, "lastPlayedAt": 1788281446178, "complete": true, "underground": false },
    { "runId": "seed-run-0004", "playerClass": "PALADIN", "wins": 3, "losses": 3, "games": 6, "startedAt": 1787922646178, "lastPlayedAt": 1787928646178, "complete": true, "underground": false },
    { "runId": "seed-run-0003", "playerClass": "ROGUE", "wins": 6, "losses": 3, "games": 9, "startedAt": 1787577046178, "lastPlayedAt": 1787586646178, "complete": true, "underground": false },
    { "runId": "seed-run-0002", "playerClass": "ROGUE", "wins": 4, "losses": 3, "games": 7, "startedAt": 1787231446178, "lastPlayedAt": 1787238646178, "complete": true, "underground": false },
    { "runId": "seed-run-0001", "playerClass": "HUNTER", "wins": 8, "losses": 3, "games": 11, "startedAt": 1786885846178, "lastPlayedAt": 1786897846178, "complete": true, "underground": false },
    { "runId": "seed-run-0000", "playerClass": "HUNTER", "wins": 7, "losses": 3, "games": 10, "startedAt": 1786540246178, "lastPlayedAt": 1786551046178, "complete": true, "underground": false }
  ],
  "classes": [
    { "playerClass": "HUNTER", "runs": 5, "averageWins": 5.2, "games": 41, "wins": 26, "globalWinrate": null, "globalAverageWins": null },
    { "playerClass": "ROGUE", "runs": 4, "averageWins": 5.5, "games": 34, "wins": 22, "globalWinrate": null, "globalAverageWins": null },
    { "playerClass": "DEMONHUNTER", "runs": 3, "averageWins": 3.33, "games": 19, "wins": 10, "globalWinrate": null, "globalAverageWins": null },
    { "playerClass": "PALADIN", "runs": 3, "averageWins": 1.67, "games": 13, "wins": 5, "globalWinrate": null, "globalAverageWins": null },
    { "playerClass": "MAGE", "runs": 2, "averageWins": 5.5, "games": 17, "wins": 11, "globalWinrate": null, "globalAverageWins": null },
    { "playerClass": "WARLOCK", "runs": 1, "averageWins": 5, "games": 8, "wins": 5, "globalWinrate": null, "globalAverageWins": null }
  ],
  "global": {
    "availability": "subscription"
  }
};
