/**
 * The liquid for variation 22: a fluid simulation, run ahead of each transition (in a worker,
 * `stirring.worker.js`, when the browser can) and played back by `slideshow.js`.
 */

/** The liquid is simulated on a grid of about this many cells, in this many steps */
export const CELLS = 10000;
export const STEPS = 60;
/** Strokes drawn through it, how wide (in cells) and for how long (in progress units) */
const STROKES = 3;
const BRUSH = 5;
const STROKE_TIME = 0.12;

/**
 * Simulates a liquid stirred by a few strokes (stable fluids: the velocity is carried along by
 * itself, then made incompressible, with walls at the screen's edges), and records, for every
 * step, where the content on screen came from (for the current image, stirred from the start)
 * and where it's going (for the next one, settling by the end). Positions are in grid units,
 * cell centres at i + 0.5, bottom row first.
 * @param {number} cols
 * @param {number} rows
 * @returns {Float32Array} per step and cell: x, y offsets for the current image, then the next
 */
export const stir = (cols, rows) => {
  const n = cols * rows;
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  const carriedU = new Float32Array(n);
  const carriedV = new Float32Array(n);
  const pressure = new Float32Array(n);
  const solved = new Float32Array(n);
  const divergence = new Float32Array(n);
  const flows = []; // the velocity at each step

  // A field's value anywhere, between its cell centres
  const at = (field, x, y) => {
    const fx = Math.min(Math.max(x - 0.5, 0), cols - 1.001);
    const fy = Math.min(Math.max(y - 0.5, 0), rows - 1.001);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const i = y0 * cols + x0;
    return (
      (field[i] * (1 - tx) + field[i + 1] * tx) * (1 - ty) +
      (field[i + cols] * (1 - tx) + field[i + cols + 1] * tx) * ty
    );
  };
  const walls = () => {
    for (let row = 0; row < rows; row++) {
      u[row * cols] = 0;
      u[row * cols + cols - 1] = 0;
    }
    for (let col = 0; col < cols; col++) {
      v[col] = 0;
      v[(rows - 1) * cols + col] = 0;
    }
  };

  // The strokes: each crosses near the middle in its own direction, on a slight curve
  const size = Math.hypot(cols, rows);
  const strokes = Array.from({ length: STROKES }, (_, s) => {
    const angle = Math.random() * Math.PI * 2;
    const length = size * (0.45 + 0.2 * Math.random());
    const centre = [cols * (0.3 + 0.4 * Math.random()), rows * (0.3 + 0.4 * Math.random())];
    return {
      start: 0.04 + s * 0.14 + Math.random() * 0.04,
      from: [
        centre[0] - (Math.cos(angle) * length) / 2,
        centre[1] - (Math.sin(angle) * length) / 2,
      ],
      way: [Math.cos(angle) * length, Math.sin(angle) * length],
      bend: (Math.random() - 0.5) * 0.5,
    };
  });

  for (let step = 1; step <= STEPS; step++) {
    const time = step / STEPS;

    // Each stroke drags the liquid under it along at its own speed
    for (const stroke of strokes) {
      const k = (time - stroke.start) / STROKE_TIME;
      if (k < 0 || k > 1) continue;
      const [wx, wy] = stroke.way;
      const curve = stroke.bend * Math.sin(Math.PI * k);
      const x = stroke.from[0] + wx * k - wy * curve;
      const y = stroke.from[1] + wy * k + wx * curve;
      const turn = stroke.bend * Math.PI * Math.cos(Math.PI * k);
      const speed = 1 / (STROKE_TIME * STEPS);
      const vx = (wx - wy * turn) * speed;
      const vy = (wy + wx * turn) * speed;
      for (
        let row = Math.max(0, Math.floor(y - BRUSH * 2));
        row < Math.min(rows, y + BRUSH * 2);
        row++
      ) {
        for (
          let col = Math.max(0, Math.floor(x - BRUSH * 2));
          col < Math.min(cols, x + BRUSH * 2);
          col++
        ) {
          const d2 = (col + 0.5 - x) ** 2 + (row + 0.5 - y) ** 2;
          const grip = 0.6 * Math.exp(-d2 / (BRUSH * BRUSH)) * Math.sin(Math.PI * k);
          const i = row * cols + col;
          u[i] += (vx - u[i]) * grip;
          v[i] += (vy - v[i]) * grip;
        }
      }
    }

    // The liquid carries its own motion along
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const x = col + 0.5 - u[i];
        const y = row + 0.5 - v[i];
        carriedU[i] = at(u, x, y);
        carriedV[i] = at(v, x, y);
      }
    }
    u.set(carriedU);
    v.set(carriedV);
    walls();

    // And can't be squeezed: take out the part of the motion that would
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const right = col < cols - 1 ? u[i + 1] : 0;
        const left = col > 0 ? u[i - 1] : 0;
        const up = row < rows - 1 ? v[i + cols] : 0;
        const down = row > 0 ? v[i - cols] : 0;
        divergence[i] = 0.5 * (right - left + up - down);
      }
    }
    pressure.fill(0);
    for (let iteration = 0; iteration < 30; iteration++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const i = row * cols + col;
          const p = pressure[i];
          const sum =
            (col < cols - 1 ? pressure[i + 1] : p) +
            (col > 0 ? pressure[i - 1] : p) +
            (row < rows - 1 ? pressure[i + cols] : p) +
            (row > 0 ? pressure[i - cols] : p);
          solved[i] = (sum - divergence[i]) / 4;
        }
      }
      pressure.set(solved);
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const p = pressure[i];
        u[i] -= 0.5 * ((col < cols - 1 ? pressure[i + 1] : p) - (col > 0 ? pressure[i - 1] : p));
        v[i] -=
          0.5 * ((row < rows - 1 ? pressure[i + cols] : p) - (row > 0 ? pressure[i - cols] : p));
      }
    }
    walls();

    // What moves the images: the liquid's motion, eased in at the start and out by the end
    const ease = Math.min(1, time / 0.12) ** 2 * (1 - Math.max(0, (time - 0.7) / 0.3) ** 2);
    const flow = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      flow[i * 2] = u[i] * ease;
      flow[i * 2 + 1] = v[i] * ease;
    }
    flows.push(flow);
  }

  // Follow the content: for the current image, where what's on screen at each step came from
  // (stirred from the start); for the next, where it's going (settled by the end)
  const record = new Float32Array((STEPS + 1) * n * 4);
  const offsets = (step) => record.subarray(step * n * 4, (step + 1) * n * 4);
  const channel = (step, c) => {
    const field = new Float32Array(n);
    const source = offsets(step);
    for (let i = 0; i < n; i++) field[i] = source[i * 4 + c];
    return field;
  };
  for (let step = 1; step <= STEPS; step++) {
    const flow = flows[step - 1];
    const fromX = channel(step - 1, 0);
    const fromY = channel(step - 1, 1);
    const here = offsets(step);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const x = col + 0.5 - flow[i * 2];
        const y = row + 0.5 - flow[i * 2 + 1];
        here[i * 4] = -flow[i * 2] + at(fromX, x, y);
        here[i * 4 + 1] = -flow[i * 2 + 1] + at(fromY, x, y);
      }
    }
  }
  for (let step = STEPS - 1; step >= 0; step--) {
    const flow = flows[step];
    const toX = channel(step + 1, 2);
    const toY = channel(step + 1, 3);
    const here = offsets(step);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const x = col + 0.5 + flow[i * 2];
        const y = row + 0.5 + flow[i * 2 + 1];
        here[i * 4 + 2] = flow[i * 2] + at(toX, x, y);
        here[i * 4 + 3] = flow[i * 2 + 1] + at(toY, x, y);
      }
    }
  }
  return record;
};
