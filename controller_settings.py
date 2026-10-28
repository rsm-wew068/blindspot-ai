"""Bounded controller settings; never execute model-generated code."""
import math

HIGHWAY = {'exit_prepare_m': (0, 1000), 'lane_cooldown_s': (.8, 12), 'speed_gain_mps': (0, 8)}
STREET = {'caution_distance_m': (0, 45), 'caution_speed_factor': (.2, 1), 'visible_margin_m': (0, 15)}

def baseline(s):
    if getattr(s, 'kind', None) == 'highway':
        return {'exit_prepare_m': 130., 'lane_cooldown_s': .8, 'speed_gain_mps': (1.1-s.aggressiveness)*1.5}
    return {'caution_distance_m': 0., 'caution_speed_factor': .65, 'visible_margin_m': 5.}

def validate(values, highway):
    bounds = HIGHWAY if highway else STREET
    if not isinstance(values, dict) or set(values) != set(bounds):
        raise ValueError('Expected exactly the supported controller settings.')
    for key, (lo, hi) in bounds.items():
        value = values[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not lo <= value <= hi:
            raise ValueError('Controller setting outside supported bounds: ' + key)
    return dict(values)
