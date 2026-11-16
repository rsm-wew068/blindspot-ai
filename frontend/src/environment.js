// Route the prompt locally before selecting a simulator; no API credits required.
export function environmentForPrompt(prompt) {
  return /\b(highway|freeway|motorway|interstate)\b/i.test(prompt) ? "highway" : "crosswalk";
}

export function selectInvestigationCase(rows, highway, concern = "") {
  if (!Array.isArray(rows) || rows.length === 0) return { chosen: null, policy: "reactive", reason: "" };
  if (!highway) {
    const preferCautiousFailure = /\b(cautious|occlusion-aware|slowing down early|early slowing|backfires)\b/i.test(concern);
    const chosen = preferCautiousFailure
      ? rows.find((row) => !row.reactive.collision && row.cautious.collision) ||
        rows.find((row) => row.cautious.collision || row.reactive.collision) ||
        rows[0]
      : rows.find((row) => row.reactive.collision && !row.cautious.collision) ||
        rows.find((row) => row.reactive.collision || row.cautious.collision) ||
        rows[0];
    const policy = preferCautiousFailure && chosen.cautious.collision
      ? "cautious"
      : chosen.reactive.collision
        ? "reactive"
        : chosen.cautious.collision
          ? "cautious"
          : "reactive";
    const reason = chosen.reactive.collision || chosen.cautious.collision
      ? !chosen.reactive.collision && chosen.cautious.collision
        ? "cautious collision found"
        : "first collision found"
      : "first generated case; no collisions found";
    return { chosen, policy, reason };
  }
  const rank = (row) => {
    const feasible = (row.scenario?.exit_distance_m ?? 0) >= 180 ? 1 : 0;
    const r = row.reactive, c = row.cautious;
    const problem = r.collision || r.missed_exit || r.direction_reversals > 0 ? 1 : 0;
    const contrast = problem && !c.collision && !c.missed_exit ? 1 : 0;
    return [
      problem && feasible ? 1 : 0,
      contrast,
      problem,
      r.direction_reversals || 0,
      r.collision || r.missed_exit ? 1 : 0,
      feasible,
      r.lane_changes || 0,
    ];
  };
  const compareTuples = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  const chosen = rows.reduce((best, row) => (compareTuples(rank(row), rank(best)) > 0 ? row : best), rows[0]);
  const r = chosen.reactive;
  const reason = r.direction_reversals > 0
    ? "most direction reversals"
    : r.collision
      ? "aggressive collision found"
      : r.missed_exit
        ? "missed exit found"
        : chosen.cautious.collision || chosen.cautious.missed_exit
          ? "exit-aware failure found"
          : "generated highway case";
  return { chosen, policy: "reactive", reason };
}
