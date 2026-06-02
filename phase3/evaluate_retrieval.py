#!/usr/bin/env python3
import json
import sys

import requests

API = "http://127.0.0.1:4100/v1/rag/search"
TESTSET = "/home/clemi/projekte/LLM/phase3/testset_gold.json"


def main() -> int:
    with open(TESTSET, "r", encoding="utf-8") as f:
        tests = json.load(f)

    passed = 0
    results = []
    for t in tests:
        payload = {"query": t["query"], "project": t["project"], "top_k": 5}
        r = requests.post(API, json=payload, timeout=20)
        r.raise_for_status()
        data = r.json()
        hits = data.get("hits", [])
        ok = any(t["expected_path_contains"] in (h.get("source", {}).get("path", "")) for h in hits)
        if ok:
            passed += 1
        results.append({"query": t["query"], "project": t["project"], "ok": ok, "hits": len(hits)})

    total = len(tests)
    pass_rate = (passed / total) * 100 if total else 0
    output = {"total": total, "passed": passed, "pass_rate": round(pass_rate, 2), "results": results}
    print(json.dumps(output, ensure_ascii=True, indent=2))
    return 0 if pass_rate >= 90 else 1


if __name__ == "__main__":
    sys.exit(main())
