export function frameAt(frames, time) {
  let index = 0;
  for (let i = 1; i < frames.length && frames[i].t <= time; i++) index = i;
  const frame = frames[index],
    next = frames[index + 1];
  if (!next) return frame;
  const blend = Math.max(0, Math.min(1, (time - frame.t) / (next.t - frame.t)));
  return {
    ...frame,
    x: frame.x + (next.x - frame.x) * blend,
    v: frame.v + (next.v - frame.v) * blend,
    ped_y:
      frame.ped_y === null
        ? null
        : frame.ped_y + (next.ped_y - frame.ped_y) * blend,
  };
}
