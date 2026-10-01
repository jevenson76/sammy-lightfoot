// Fixed-step loop. update() always receives exactly STEP; the simulation never
// reads the clock, so outcomes are identical at any display refresh rate.

export const STEP = 1 / 60;

export function startLoop(update, render) {
  let acc = 0;
  let last = performance.now();
  let running = true;

  function frame(now) {
    if (!running) return;
    acc += Math.min((now - last) / 1000, 0.25); // clamp: hidden tab, debugger pause
    last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      update(STEP);
      acc -= STEP;
      steps++;
    }
    if (acc > STEP) acc = STEP; // drop backlog rather than spiral
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return () => { running = false; };
}
