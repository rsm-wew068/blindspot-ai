"""Deterministic, deliberately simplified pedestrian/vehicle test environment."""
import hashlib
import json
import math
from collections import deque
from dataclasses import asdict, dataclass

VERSION = "blindspot-0.1"
DT = 0.025
CROSSING = 45.0
CAR_HALF_LENGTH = 2.1
CAR_HALF_WIDTH = 0.9
PED_RADIUS = 0.3
BOUNDS = {"speed_kmh": (15, 65), "van_gap": (1, 12), "emerge_s": (0, 6),
          "ped_speed": (0.8, 2.5), "reaction_s": (0, 1.0), "brake_mps2": (3, 9)}


@dataclass(frozen=True)
class Scenario:
    speed_kmh: float = 45
    van_gap: float = 3
    emerge_s: float = 0.8
    ped_speed: float = 1.8
    reaction_s: float = 0.3
    brake_mps2: float = 6
    pedestrian: bool = True

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict):
            raise ValueError("Scenario must be an object.")
        unknown = set(data) - set(cls.__dataclass_fields__)
        if unknown:
            raise ValueError("Unknown scenario fields: " + ", ".join(sorted(unknown)))
        values = asdict(cls())
        values.update(data)
        for name, (low, high) in BOUNDS.items():
            value = values[name]
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError(f"{name} must be a finite number between {low} and {high}.")
            values[name] = round(float(value), 4)
        if not isinstance(values["pedestrian"], bool):
            raise ValueError("pedestrian must be true or false.")
        return cls(**values)


def intersects_box(a, b, box):
    """Segment/AABB intersection (also used for continuous collision detection)."""
    lo, hi = 0.0, 1.0
    for p, q, lower, upper in zip(a, b, box[:2], box[2:]):
        delta = q - p
        if abs(delta) < 1e-12:
            if not lower <= p <= upper:
                return False
        else:
            enter, leave = sorted(((lower - p) / delta, (upper - p) / delta))
            lo, hi = max(lo, enter), min(hi, leave)
            if lo > hi:
                return False
    return True


def pedestrian_y(s, time):
    return max(-6, 5.6 - max(0, time - s.emerge_s) * s.ped_speed)


def observe(s, x, v, t):
    """No pedestrian coordinates or timing leak through the occlusion boundary."""
    van = [CROSSING - s.van_gap - 5, 2.2, CROSSING - s.van_gap, 4.8]
    ped = None
    if s.pedestrian:
        y = pedestrian_y(s, t)
        visible = not intersects_box((x + CAR_HALF_LENGTH, 0), (CROSSING, y), van)
        if visible:
            ped = {"x": CROSSING, "y": y, "vy": -s.ped_speed if t >= s.emerge_s and y > -6 else 0}
    return {"x": x, "speed": v, "crossing_x": CROSSING, "van": van, "pedestrian": ped}


def control(observation, policy, cruise, braking, latency):
    """Two transparent baselines; these are rules, not trained driving models."""
    x, v = observation["x"], observation["speed"]
    front = x + CAR_HALF_LENGTH
    distance = observation["crossing_x"] - front - PED_RADIUS
    stopping = v * latency + v * v / (2 * braking) + 1.5
    p = observation["pedestrian"]
    if p and -1.3 <= p["y"] <= 5.6 and x - CAR_HALF_LENGTH < p["x"] + PED_RADIUS:
        arrival = max(0, distance) / max(v, 0.5)
        projected_y = p["y"] + p["vy"] * arrival
        crossing_risk = abs(p["y"]) <= 1.3 or (p["vy"] < 0 and -2.2 <= projected_y <= 2.2)
        if crossing_risk and distance <= stopping + 5:
            return -braking, "Visible pedestrian conflicts with the vehicle path"
    target = cruise
    if policy == "cautious" and 0 < distance < 30:
        # Known road geometry only: maintain a small stopping distance near the obstruction.
        visibility_distance = max(1.5, distance - 10)
        target = min(cruise, max(2.5, math.sqrt(2 * braking * visibility_distance) * 0.65))
    if v > target + 0.1:
        return -min(braking, 3.5), "Slow for the obstructed crosswalk"
    if v < target - 0.1:
        return min(2, (target - v) / DT), "Return to target speed"
    return 0, "Maintain speed"


def run(s, policy="reactive", replay=True):
    s = Scenario.parse(asdict(s))
    if policy not in ("reactive", "cautious"):
        raise ValueError("Unknown controller.")
    cruise = s.speed_kmh / 3.6
    x, v = 0.0, cruise
    queue = deque([(0, "Maintain speed")] * math.ceil(s.reaction_s / DT))
    frames, events = [], []
    first_seen = first_brake = None
    min_clearance, hard_brakes = float("inf"), 0
    last_hard, collision, finished = False, False, False
    impact = None
    for step in range(1001):
        t = round(step * DT, 5)
        obs = observe(s, x, v, t)
        seen = obs["pedestrian"] is not None
        if seen and first_seen is None:
            first_seen = t
            events.append({"t": t, "kind": "visible", "text": "Pedestrian first visible to controller"})
        requested = control(obs, policy, cruise, s.brake_mps2, s.reaction_s)
        queue.append(requested)
        accel, reason = queue.popleft()
        if accel < -0.1 and v > 0.1 and first_brake is None:
            first_brake = t
            events.append({"t": t, "kind": "brake", "text": reason})
        hard = accel < -4 and v > 0.1
        hard_brakes += int(hard and not last_hard)
        last_hard = hard
        y = pedestrian_y(s, t) if s.pedestrian else None
        if s.pedestrian:
            dx = max(0, abs(CROSSING - x) - CAR_HALF_LENGTH - PED_RADIUS)
            dy = max(0, abs(y) - CAR_HALF_WIDTH - PED_RADIUS)
            min_clearance = min(min_clearance, math.hypot(dx, dy))
        if replay and (step % 4 == 0):
            frames.append({"t": t, "x": round(x, 4), "v": round(v, 4), "ped_y": y,
                           "visible": seen, "a": accel, "reason": reason})
        new_v = max(0, min(cruise, v + accel * DT))
        new_x = x + (v + new_v) * 0.5 * DT
        if s.pedestrian:
            new_y = pedestrian_y(s, t + DT)
            collision = intersects_box((CROSSING - x, y), (CROSSING - new_x, new_y),
                                      [-2.4, -1.2, 2.4, 1.2])
        x, v = new_x, new_v
        if collision or x >= CROSSING + 12:
            t = round(t + DT, 5)
            finished = not collision
            impact = round(v * 3.6, 2) if collision else None
            events.append({"t": t, "kind": "collision" if collision else "finish",
                           "text": "Collision detected" if collision else "Road segment completed"})
            if replay:
                frames.append({"t": t, "x": round(x, 4), "v": round(v, 4),
                               "ped_y": pedestrian_y(s, t) if s.pedestrian else None,
                               "visible": observe(s, x, v, t)["pedestrian"] is not None,
                               "a": accel, "reason": events[-1]["text"]})
            break
    if not collision and not finished:
        events.append({"t": t, "kind": "timeout", "text": "Time limit reached"})
    canonical = json.dumps({"scenario": asdict(s), "version": VERSION}, sort_keys=True)
    return {"id": hashlib.sha256(canonical.encode()).hexdigest()[:10], "version": VERSION,
            "scenario": asdict(s), "policy": policy, "frames": frames, "events": events,
            "metrics": {"collision": collision, "finished": finished, "impact_kmh": impact,
                        "duration_s": round(t, 3), "first_seen_s": first_seen, "first_brake_s": first_brake,
                        "min_clearance_m": 0 if collision else (round(min_clearance, 3) if s.pedestrian else None),
                        "hard_brakes": hard_brakes}}


def compare(s, replay=True):
    return {"reactive": run(s, "reactive", replay), "cautious": run(s, "cautious", replay)}
