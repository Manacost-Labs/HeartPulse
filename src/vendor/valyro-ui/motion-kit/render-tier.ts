/*
 * Does this browser composite on a GPU? Virtual machines, remote desktops, servers and blocklisted
 * drivers render in software: every layer is blended on the processor, pixel by pixel, each frame, and a
 * full-page transition that is free on a GPU takes most of a core there. Weak devices (two cores or less,
 * 2 GB of memory or less) get the same treatment. Checked once, on first use; browser only.
 */
/** gpu or cpu: the values of PageTransitionTier and ScrollEffectTier, kept here so neither engine depends on the other. */
type Tier = 'gpu' | 'cpu';

/** auto — detect the machine (detectRenderTier); gpu / cpu — always that one. */
export type PageTransitionTierSetting = Tier | 'auto';

/** Renderer names of software rasterisers: SwiftShader (Chrome), llvmpipe / softpipe (Mesa), WARP (Windows). */
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b|mesa offscreen/i;

let detected: Tier | undefined;

function probeGpu(): boolean {
  try {
    const canvas = document.createElement('canvas');
    // The browser refuses this context when it could only offer a slow (software) one.
    const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (!gl) return false;
    let renderer = String(gl.getParameter(gl.RENDERER));
    if (/webkit webgl/i.test(renderer)) {
      // Chrome and Safari mask the name; the debug extension tells it.
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      if (info) renderer = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    // Hand the context back at once: browsers keep only a few alive.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !SOFTWARE.test(renderer);
  } catch {
    return false;
  }
}

/** gpu, or cpu on a machine without GPU compositing or with little to spare. Cached after the first call. */
export function detectRenderTier(): Tier {
  if (detected) return detected;
  if (typeof document === 'undefined') return 'gpu';
  const device = navigator as Navigator & { deviceMemory?: number };
  const weak = (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 2) || (device.deviceMemory !== undefined && device.deviceMemory <= 2);
  detected = weak || !probeGpu() ? 'cpu' : 'gpu';
  return detected;
}

/** The tier to play: `auto` resolved for this machine. */
export const resolveRenderTier = (setting: PageTransitionTierSetting = 'auto'): Tier => (setting === 'auto' ? detectRenderTier() : setting);

/** The tier once detected, else undefined: never runs the probe. */
export const knownRenderTier = (): Tier | undefined => detected;

/**
 * Detects the tier when the browser is idle and calls `callback` with it — at once when it is known — so
 * effects that start on mount (ScrollEffect) do not pay for the probe during the first paint. Returns the cancel.
 */
export function onRenderTier(callback: (tier: Tier) => void): () => void {
  if (detected) {
    callback(detected);
    return () => {};
  }
  if (typeof window === 'undefined') return () => {};
  let live = true;
  const run = () => {
    if (live) callback(detectRenderTier());
  };
  const host = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
  if (host.requestIdleCallback) {
    const handle = host.requestIdleCallback(run, { timeout: 2000 });
    return () => {
      live = false;
      host.cancelIdleCallback?.(handle);
    };
  }
  const timer = window.setTimeout(run, 200);
  return () => {
    live = false;
    window.clearTimeout(timer);
  };
}

/** Runs the detection when the browser is idle, so the first transition does not pay for it. */
export function warmRenderTier() {
  if (detected || typeof window === 'undefined') return;
  const idle = (window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(() => detectRenderTier(), { timeout: 2000 });
  else window.setTimeout(detectRenderTier, 200);
}
