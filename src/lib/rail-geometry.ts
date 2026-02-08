/**
 * Actual rail corridor geometry from OpenStreetMap.
 *
 * Source: OpenStreetMap "Down Main North" track segments
 * Ways: 432724771, 432724768, 174265326, 173241836, 1086583989
 * Data © OpenStreetMap contributors, ODbL.
 *
 * The coordinates trace the Down Main North line from south of
 * Cardiff through to past Kotara station.
 */

// ─── Full stitched rail path (lat, lng pairs) ──────────────────────────────
// Runs south → north: approach to Cardiff → Cardiff → Kotara → departure

export const RAIL_PATH: [number, number][] = [
  // ── Way 432724771: South approach → Cardiff area → mid-corridor ──────
  [-32.9434264, 151.6668132],
  [-32.9432879, 151.6681841],  // ← nearest to Cardiff station
  [-32.9432281, 151.6687582],
  [-32.9431949, 151.6690146],
  [-32.9431621, 151.6692311],
  [-32.9431287, 151.6693889],
  [-32.9430827, 151.6695713],
  [-32.9430198, 151.6697686],
  [-32.9429572, 151.6699479],
  [-32.9428732, 151.6701370],
  [-32.9427803, 151.6703301],
  [-32.9426547, 151.6705431],
  [-32.9425748, 151.6706729],
  [-32.9424059, 151.6708960],
  [-32.9422577, 151.6710587],
  [-32.9421347, 151.6711815],
  [-32.9419884, 151.6713172],
  [-32.9417590, 151.6715059],
  [-32.9412598, 151.6718906],
  [-32.9411714, 151.6719625],
  [-32.9410026, 151.6721046],
  [-32.9408704, 151.6722257],
  [-32.9407153, 151.6723847],
  [-32.9406249, 151.6724923],
  [-32.9404923, 151.6726653],
  [-32.9403706, 151.6728459],
  [-32.9402229, 151.6731053],
  [-32.9401401, 151.6732790],
  [-32.9400604, 151.6734689],
  [-32.9399925, 151.6736631],
  [-32.9399389, 151.6738474],
  [-32.9399169, 151.6739291],
  [-32.9398549, 151.6742141],
  [-32.9397921, 151.6746177],

  // ── Way 432724768: Mid-corridor → big curve → Tickhole approach ──────
  [-32.9394362, 151.6773407],
  [-32.9393791, 151.6778491],
  [-32.9393529, 151.6783692],
  [-32.9393586, 151.6788311],
  [-32.9393908, 151.6793428],
  [-32.9394574, 151.6798127],
  [-32.9395486, 151.6802978],
  [-32.9396612, 151.6807431],
  [-32.9398132, 151.6812140],
  [-32.9400007, 151.6816865],
  [-32.9401106, 151.6819303],
  [-32.9401952, 151.6820975],
  [-32.9403370, 151.6823614],
  [-32.9404302, 151.6825208],
  [-32.9406727, 151.6828957],
  [-32.9409575, 151.6832934],
  [-32.9412683, 151.6836761],
  [-32.9421366, 151.6845923],
  [-32.9432321, 151.6857501],
  [-32.9435605, 151.6861066],

  // ── Way 174265326: Tickhole Tunnel ───────────────────────────────────
  [-32.9439694, 151.6866098],
  [-32.9441074, 151.6868663],
  [-32.9442141, 151.6871027],
  [-32.9443963, 151.6875990],

  // ── Way 173241836: Through Kotara ────────────────────────────────────
  [-32.9444378, 151.6877591],
  [-32.9445233, 151.6880880],
  [-32.9445870, 151.6884115],  // ← nearest to Kotara station
  [-32.9446326, 151.6887393],
  [-32.9446590, 151.6890490],
  [-32.9446713, 151.6893257],
  [-32.9446702, 151.6896357],
  [-32.9446427, 151.6899986],
  [-32.9445880, 151.6903892],
  [-32.9444858, 151.6908285],
  [-32.9443981, 151.6911379],
  [-32.9442243, 151.6915878],
  [-32.9440490, 151.6919552],
  [-32.9437356, 151.6925028],
  [-32.9435133, 151.6928540],
  [-32.9430307, 151.6936559],
  [-32.9427839, 151.6941147],
  [-32.9427020, 151.6943088],

  // ── Way 1086583989: Past Kotara → north departure ────────────────────
  [-32.9425605, 151.6946441],
  [-32.9424125, 151.6950622],
  [-32.9423404, 151.6952890],
  [-32.9422332, 151.6956487],
  [-32.9421263, 151.6960218],
  [-32.9419355, 151.6966805],
  [-32.9418716, 151.6969005],
  [-32.9417591, 151.6972478],
  [-32.9415173, 151.6978930],
  [-32.9414025, 151.6982145],
  [-32.9413091, 151.6985301],
  [-32.9412660, 151.6986943],
  [-32.9412176, 151.6989054],
  [-32.9411780, 151.6991083],
  [-32.9411431, 151.6992998],
  [-32.9410682, 151.6996555],
  [-32.9409954, 151.6999791],
  [-32.9409176, 151.7002734],
  [-32.9408924, 151.7003672],
];

// ─── Station path indices ───────────────────────────────────────────────────
// Index of the nearest track point to each station.

/** Cardiff station: index 1 → [-32.9432879, 151.6681841] */
export const CARDIFF_PATH_INDEX = 1;

/** Kotara station: index 60 → [-32.9445870, 151.6884115] */
export const KOTARA_PATH_INDEX = 60;

// ─── On-track station coordinates ───────────────────────────────────────────
// These are the actual positions on the rail line, for accurate map markers.

export const CARDIFF_TRACK_POS: [number, number] = RAIL_PATH[CARDIFF_PATH_INDEX];
export const KOTARA_TRACK_POS: [number, number] = RAIL_PATH[KOTARA_PATH_INDEX];

// ─── Path interpolation ────────────────────────────────────────────────────

function computeCumulativeDistances(path: [number, number][]): number[] {
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    const [lat1, lng1] = path[i - 1];
    const [lat2, lng2] = path[i];
    const d = Math.sqrt((lat2 - lat1) ** 2 + (lng2 - lng1) ** 2);
    distances.push(distances[i - 1] + d);
  }
  return distances;
}

const CUMULATIVE = computeCumulativeDistances(RAIL_PATH);

export const TOTAL_PATH_LENGTH = CUMULATIVE[CUMULATIVE.length - 1];
export const CARDIFF_DISTANCE = CUMULATIVE[CARDIFF_PATH_INDEX];
export const KOTARA_DISTANCE = CUMULATIVE[KOTARA_PATH_INDEX];

/**
 * Interpolate a position along the rail path.
 * @param t — normalised value 0..1 over the full path length
 * @returns [lat, lng] on the track
 */
export function interpolateOnPath(t: number): [number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  const targetDist = clamped * TOTAL_PATH_LENGTH;

  for (let i = 1; i < CUMULATIVE.length; i++) {
    if (CUMULATIVE[i] >= targetDist) {
      const segStart = CUMULATIVE[i - 1];
      const segEnd = CUMULATIVE[i];
      const segT = segEnd === segStart ? 0 : (targetDist - segStart) / (segEnd - segStart);
      const [lat1, lng1] = RAIL_PATH[i - 1];
      const [lat2, lng2] = RAIL_PATH[i];
      return [lat1 + (lat2 - lat1) * segT, lng1 + (lng2 - lng1) * segT];
    }
  }
  return RAIL_PATH[RAIL_PATH.length - 1];
}
