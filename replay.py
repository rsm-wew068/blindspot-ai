"""Recompute an exported case. No network or model access required."""
import argparse
import json
from pathlib import Path
from simulation import VERSION, Scenario, compare

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("case", type=Path)
    args = parser.parse_args()
    data = json.loads(args.case.read_text())
    if data.get("version", VERSION) != VERSION:
        raise SystemExit("Simulator version mismatch. Use the version recorded with the case.")
    result = compare(Scenario.parse(data["scenario"]), replay=False)
    for policy, r in result.items():
        print(policy + ": " + json.dumps(r["metrics"]))
        recorded = data.get("results", {}).get(policy, {}).get("metrics")
        if recorded is not None and recorded != r["metrics"]:
            raise SystemExit("Recorded metrics differ from this replay.")
    print("Replay complete. Any supplied recorded metrics matched.")
