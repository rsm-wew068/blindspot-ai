"""Synthetic highway policy comparison. No Tesla software or real sensor model."""
from dataclasses import dataclass, asdict
import hashlib
import json
import math
from simulation import intersects_box

VERSION = 'blindspot-highway-1'
DT = 0.1
BOUNDS = {'speed_kmh': (80, 130), 'traffic_kmh': (60, 110), 'speed_variation': (0, 30),
          'spacing_m': (25, 90), 'exit_distance_m': (0, 1600), 'aggressiveness': (0.1, 1),
          'traffic_phase': (0, 30)}

@dataclass(frozen=True)
class HighwayScenario:
    kind: str = 'highway'
    speed_kmh: float = 115
    traffic_kmh: float = 85
    speed_variation: float = 23
    spacing_m: float = 85
    exit_distance_m: float = 10
    aggressiveness: float = 0.9
    traffic_phase: float = 3

    @classmethod
    def parse(cls, data):
        if not isinstance(data, dict) or set(data) - set(cls.__dataclass_fields__):
            raise ValueError('Unknown highway scenario fields.')
        values = asdict(cls()); values.update(data)
        if values['kind'] != 'highway':
            raise ValueError('Expected a highway scenario.')
        for key, (lo, hi) in BOUNDS.items():
            v = values[key]
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
                raise ValueError(f'{key} must be between {lo} and {hi}.')
            values[key] = round(float(v), 4)
        return cls(**values)


def traffic(s, t):
    """Identical exogenous traffic for each policy; smooth lane-specific speed waves."""
    cars = []
    omega = 2 * math.pi / 20
    for lane in range(3):
        phase = lane * 2.1 + s.traffic_phase
        base = (s.traffic_kmh + (1 - lane) * 3) / 3.6
        amp = s.speed_variation / 3.6
        distance = base * t + amp / omega * (math.cos(phase) - math.cos(omega * t + phase))
        speed = base + amp * math.sin(omega * t + phase)
        offset = min(s.spacing_m - 10, max(10, (28 + lane * 11) % s.spacing_m))
        for i in range(-2, 9):
            cars.append({'id': f'{lane}-{i}', 'x': offset + i * s.spacing_m + distance,
                         'y': lane * 3.6, 'v': speed, 'lane': lane})
    return cars


def run(s, policy='reactive', replay=True):
    s = HighwayScenario.parse(asdict(s))
    if policy not in ('reactive', 'cautious'):
        raise ValueError('Unknown highway controller.')
    x, v, y, lane = 0., s.speed_kmh / 3.6, 3.6, 1
    target, start_y, maneuver_start, last_change = 1, y, None, -100.
    changes = reversals = 0
    previous_direction = 0
    frames, events = [], []
    collision = finished = False
    exit_success = None
    min_clearance = float('inf')
    hard_brakes = 0; last_hard = False
    first_brake = None
    reason = 'Follow traffic'
    for step in range(1000):
        t = round(step * DT, 4)
        cars = traffic(s, t)
        if maneuver_start is not None and t - maneuver_start >= 2:
            lane = target; y = lane * 3.6; maneuver_start = None
        def lane_speed(k):
            leaders = [c for c in cars if c['lane'] == k and c['x'] > x]
            lead = min(leaders, key=lambda c: c['x'], default=None)
            return min(s.speed_kmh / 3.6, lead['v'] + max(0, lead['x'] - x - 25) * .08) if lead and lead['x'] - x < 150 else s.speed_kmh / 3.6
        def safe(k):
            for c in cars:
                if c['lane'] != k: continue
                gap = abs(c['x'] - x) - 4.4
                closing = max(0, v - c['v']) if c['x'] > x else max(0, c['v'] - v)
                if gap < (6 if policy == 'reactive' else 12) + closing * (0.5 if policy == 'reactive' else 1.5):
                    return False
            return True
        remaining = s.exit_distance_m - x
        if maneuver_start is None and remaining > 0:
            cooldown = 0.8 if policy == 'reactive' else 6
            if t - last_change >= cooldown:
                candidates = [k for k in (lane - 1, lane + 1) if 0 <= k <= 2 and safe(k)]
                need_exit = remaining < (130 if policy == 'reactive' else max(400, v * 20))
                choice = lane
                if need_exit:
                    if lane + 1 in candidates: choice = lane + 1
                elif candidates:
                    best = max(candidates, key=lane_speed)
                    threshold = (1.1 - s.aggressiveness) * 1.5 if policy == 'reactive' else 3.5
                    if lane_speed(best) > lane_speed(lane) + threshold: choice = best
                if choice != lane:
                    direction = 1 if choice > lane else -1
                    reversals += int(previous_direction != 0 and previous_direction != direction)
                    previous_direction = direction
                    changes += 1; target = choice; start_y = y; maneuver_start = t; last_change = t
                    reason = 'Move right for exit' if need_exit else 'Pursue faster lane'
                    events.append({'t': t, 'kind': 'lane_change', 'text': f'{reason}: lane {lane + 1} → {choice + 1}'})
        occupied = [lane, target] if maneuver_start is not None else [lane]
        desired = s.speed_kmh / 3.6
        for c in cars:
            if c['lane'] in occupied and c['x'] > x:
                gap = c['x'] - x - 4.4
                headway = .65 if policy == 'reactive' else 1.2
                desired = min(desired, max(0, c['v'] + (gap - 5 - v * headway) * .45))
        accel = max(-6, min(2.2, (desired - v) * 1.8))
        if accel < -.1 and first_brake is None: first_brake = t
        hard = accel < -4; hard_brakes += int(hard and not last_hard); last_hard = hard
        for c in cars:
            min_clearance = min(min_clearance, math.hypot(max(0, abs(c['x']-x)-4.4), max(0, abs(c['y']-y)-1.9)))
        if replay and step % 2 == 0:
            frames.append({'t': t, 'x': x, 'y': y, 'v': v, 'a': accel, 'reason': reason,
                           'traffic': [{'id': c['id'], 'x': round(c['x'], 3), 'y': c['y']} for c in cars if abs(c['x']-x)<160]})
        nv = max(0, min(s.speed_kmh / 3.6, v + accel * DT)); nx = x + (v + nv) / 2 * DT
        ny = y
        if maneuver_start is not None:
            u = min(1, (t + DT - maneuver_start) / 2)
            ny = start_y + (target * 3.6 - start_y) * (u*u*(3-2*u))
        if exit_success:
            ny = 7.2 + min(12, max(0, nx - s.exit_distance_m) * .25)
        next_cars = traffic(s, t + DT)
        collision = any(intersects_box((c['x']-x, c['y']-y), (n['x']-nx, n['y']-ny), [-4.4,-1.9,4.4,1.9]) for c,n in zip(cars,next_cars))
        x, y, v = nx, ny, nv
        if exit_success is None and x >= s.exit_distance_m:
            exit_success = abs(y - 7.2) < .2 and target == 2
            events.append({'t': round(t+DT,4), 'kind':'exit', 'text': 'Reached exit lane' if exit_success else 'Missed exit'})
        finished = x >= s.exit_distance_m + 45 and not collision
        if collision or finished or step == 999:
            t = round(t+DT,4)
            reason = 'Collision' if collision else ('Exit taken' if finished and exit_success else 'Missed exit' if finished else 'Time limit')
            events.append({'t':t, 'kind':'collision' if collision else 'finish' if finished else 'timeout', 'text':reason})
            if replay: frames.append({'t':t,'x':x,'y':y,'v':v,'a':accel,'reason':reason,
                                      'traffic':[{'id':c['id'],'x':round(c['x'],3),'y':c['y']} for c in next_cars if abs(c['x']-x)<160]})
            break
    canonical = json.dumps({'scenario':asdict(s),'version':VERSION},sort_keys=True)
    return {'id':hashlib.sha256(canonical.encode()).hexdigest()[:10], 'version':VERSION, 'scenario':asdict(s),
            'policy':policy,'frames':frames,'events':events,'metrics':{
                'collision':collision,'finished':finished,'impact_kmh':round(v*3.6,2) if collision else None,
                'duration_s':round(t,2),'lane_changes':changes,'direction_reversals':reversals,
                'exit_success':bool(exit_success) and finished,'missed_exit':exit_success is False,
                'min_clearance_m':0 if collision else round(min_clearance,3),'hard_brakes':hard_brakes,
                'first_seen_s':None,'first_brake_s':first_brake}}


def compare(s, replay=True):
    return {p:run(s,p,replay) for p in ('reactive','cautious')}
