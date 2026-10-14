// ─── Device capability detection ───────────────────────────────────
// Decides whether this device can handle the Cesium 3D globe, or should
// get the lightweight Leaflet 2D map instead. Weak GPUs, software WebGL
// (SwiftShader/llvmpipe), and phones default to 2D.

export interface DeviceProfile {
  hasWebGL: boolean;
  renderer: string;
  softwareGL: boolean;
  isMobile: boolean;
  lowMemory: boolean;
  /** true → serve the 2D map by default */
  prefer2D: boolean;
  reason: string;
}

let cached: DeviceProfile | null = null;

export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;
  let hasWebGL = false;
  let renderer = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      hasWebGL = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    }
  } catch { /* no WebGL */ }
  const softwareGL = /swiftshader|software|llvmpipe|softpipe|basic render|angle \(google/i.test(renderer);
  const ua = navigator.userAgent || '';
  const isMobile = /android|iphone|ipad|ipod|mobile|phone/i.test(ua);
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 720;
  const mem = (navigator as any).deviceMemory as number | undefined;
  const lowMemory = typeof mem === 'number' ? mem < 4 : false;

  let reason = '';
  let prefer2D = false;
  if (!hasWebGL) { prefer2D = true; reason = 'no WebGL'; }
  else if (softwareGL) { prefer2D = true; reason = 'software WebGL'; }
  else if (isMobile) { prefer2D = true; reason = 'mobile device'; }
  else if (lowMemory && smallScreen) { prefer2D = true; reason = 'low memory'; }

  cached = { hasWebGL, renderer, softwareGL, isMobile, lowMemory, prefer2D, reason };
  return cached;
}
