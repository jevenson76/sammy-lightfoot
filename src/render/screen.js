// The game draws to a 280x192 back buffer (Apple II hi-res dimensions) and
// presents it scaled by a whole number wherever the window allows, so every
// pixel stays square and crisp.

export const SCREEN_W = 280;
export const SCREEN_H = 192;

// The six Apple II hi-res colours (NTSC approximations).
export const COLORS = {
  black: '#000000',
  white: '#ffffff',
  green: '#14f53c',
  violet: '#ff44fd',
  orange: '#ff6a3c',
  blue: '#14cffd',
};

export function createScreen(canvas) {
  const back = document.createElement('canvas');
  back.width = SCREEN_W;
  back.height = SCREEN_H;
  const ctx = back.getContext('2d');
  const out = canvas.getContext('2d');

  function resize() {
    const pad = 8;
    const availW = Math.max(SCREEN_W, window.innerWidth - pad * 2);
    const availH = Math.max(SCREEN_H, window.innerHeight - pad * 2);
    // Scale by a whole number of DEVICE pixels (a 125% Windows display has
    // 1.25 device px per CSS px), so every game pixel is the same size. On a
    // screen too small for 2x, fill the width and let the browser scale.
    const dpr = window.devicePixelRatio || 1;
    const fit = Math.min(availW / SCREEN_W, availH / SCREEN_H) * dpr;
    const k = fit >= 2 ? Math.floor(fit) : Math.max(1, Math.ceil(fit));
    const cssScale = fit >= 2 ? k / dpr : Math.max(1 / dpr, fit / dpr);
    canvas.width = SCREEN_W * k;
    canvas.height = SCREEN_H * k;
    canvas.style.width = `${SCREEN_W * cssScale}px`;
    canvas.style.height = `${SCREEN_H * cssScale}px`;
    out.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  return {
    ctx,
    present(shakeX = 0, shakeY = 0) {
      out.fillStyle = COLORS.black;
      out.fillRect(0, 0, canvas.width, canvas.height);
      const scale = canvas.width / SCREEN_W;
      out.drawImage(back, Math.round(shakeX) * scale, Math.round(shakeY) * scale, canvas.width, canvas.height);
    },
  };
}
