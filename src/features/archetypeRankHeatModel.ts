/** Colour model of the archetype page's rank × period table (ArchetypeRankHeatmap, lazy chunk). */

import { wilsonInterval } from './archetypeInsightsModel';

const HEAT_NEUTRAL = [0xf3, 0xe5, 0xc3];
const HEAT_ABOVE = [0x4f, 0x9a, 0x5c];
const HEAT_BELOW = [0xd6, 0x6b, 0x62];
const INK_DARK = '#2b1f16';
const INK_LIGHT = '#fffaf0';
/** Deviation from 50% at which a cell reaches the full colour. */
const HEAT_SATURATION_POINTS = 10;

const hex = (rgb: number[]) => `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
function luminance(rgb: number[]) {
  const [r, g, b] = rgb.map(channel => channel / 255).map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Colour of one rank × period cell on a diverging scale around 50%: green above, red below,
 * more intense with the deviation (full at ±10 points). The 95% Wilson interval of the
 * cell's games damps it, so a small sample that cannot tell 52% from 50% stays pale. The end
 * colours are light enough that the value keeps dark ink at 4.5:1 or better everywhere.
 */
export function rankHeatCell(winrate: number | null | undefined, games: number | null | undefined) {
  if (winrate === null || winrate === undefined || !Number.isFinite(winrate)) {
    return { tone: 'empty' as const, strength: 0, fill: hex(HEAT_NEUTRAL), ink: INK_DARK, low: null, high: null, significant: false };
  }
  const [low, high] = games && games > 0 ? wilsonInterval(winrate, games) : [0, 100];
  const deviation = winrate - 50;
  const confidence = Math.min(1, Math.max(0.25, 1 - (high - low) / 2 / HEAT_SATURATION_POINTS));
  const strength = Math.min(1, Math.abs(deviation) / HEAT_SATURATION_POINTS) * confidence;
  const target = deviation >= 0 ? HEAT_ABOVE : HEAT_BELOW;
  const rgb = HEAT_NEUTRAL.map((channel, index) => channel + (target[index] - channel) * strength);
  const fillLuminance = luminance(rgb);
  const ink = contrast(fillLuminance, luminance([0x2b, 0x1f, 0x16])) >= contrast(fillLuminance, luminance([0xff, 0xfa, 0xf0])) ? INK_DARK : INK_LIGHT;
  return {
    tone: Math.abs(deviation) < 0.05 ? 'even' as const : deviation > 0 ? 'above' as const : 'below' as const,
    strength, fill: hex(rgb), ink, low, high, significant: low > 50 || high < 50,
  };
}

/** Legend stops of `rankHeatCell` for a large sample, from 40% to 60%. */
export const RANK_HEAT_LEGEND = [40, 45, 50, 55, 60].map(winrate => ({ winrate, fill: rankHeatCell(winrate, 1_000_000).fill }));
