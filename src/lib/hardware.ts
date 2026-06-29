export interface HardwareCapabilities {
  hasNPU: boolean;
  hasWebGPU: boolean;
  hasWebGL: boolean;
  deviceMemoryGB: number;
  cpuCores: number;
  computeTier: 'NPU' | 'GPU' | 'CPU_HIGH' | 'CPU_LOW';
  recommendedChunkSize: number; // Chars per moving window chunk
}

export class HardwareDetector {
  static async detect(): Promise<HardwareCapabilities> {
    // 1. NPU Detection (via WebNN - emerging standard for on-device ML/LiteRT)
    const hasNPU = 'ml' in navigator;
    
    // 2. GPU Detection (WebGPU)
    const hasWebGPU = 'gpu' in navigator;
    
    // 3. GPU Detection (WebGL fallback)
    let hasWebGL = false;
    try {
      const canvas = document.createElement('canvas');
      hasWebGL = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {}

    // @ts-ignore - navigator.deviceMemory is available in Chromium browsers (Chrome/Edge/Android)
    const deviceMemoryGB = navigator.deviceMemory || 4; 
    const cpuCores = navigator.hardwareConcurrency || 2;

    let computeTier: HardwareCapabilities['computeTier'] = 'CPU_LOW';
    let recommendedChunkSize = 1000;

    // Prioritize hardware delegation based on capabilities and specs over the last 10 years
    if (hasNPU) {
      computeTier = 'NPU';
      recommendedChunkSize = 8000; // Dedicated NPU handles large contexts efficiently
    } else if (hasWebGPU && deviceMemoryGB >= 4) {
      computeTier = 'GPU';
      recommendedChunkSize = 4000; // WebGPU handles medium-large contexts
    } else if (hasWebGL && deviceMemoryGB >= 6 && cpuCores >= 6) {
      computeTier = 'CPU_HIGH'; 
      recommendedChunkSize = 2000; // High-end CPU fallback
    } else {
      computeTier = 'CPU_LOW';
      recommendedChunkSize = 800; // Older devices (10 years old) CPU processing
    }

    // Extreme constraints for very old devices (e.g., <= 2GB RAM like older iPhones / Androids)
    if (deviceMemoryGB <= 2) {
      recommendedChunkSize = 500; // Very aggressive moving window
    }

    return {
      hasNPU,
      hasWebGPU,
      hasWebGL,
      deviceMemoryGB,
      cpuCores,
      computeTier,
      recommendedChunkSize
    };
  }
}
