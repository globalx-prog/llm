#!/usr/bin/env python3
import argparse
import fnmatch
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import yaml


def run(cmd: list[str], cwd: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=True)


def load_policy(policy_path: str) -> dict:
    with open(policy_path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def to_abs(path: str, repo: str) -> str:
    p = Path(path)
    if p.is_absolute():
        return str(p)
    return str((Path(repo) / p).resolve())


def allowed_file(file_path: str, allow: list[str], deny: list[str]) -> bool:
    in_allow = any(fnmatch.fnmatch(file_path, pat) for pat in allow)
    in_deny = any(fnmatch.fnmatch(file_path, pat) for pat in deny)
    return in_allow and not in_deny


def main() -> int:
    parser = argparse.ArgumentParser(description="Phase5 Agent Runner (policy-enforced)")
    parser.add_argument("--repo", required=True)
    parser.add_argument("--policy", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--role", required=True)
    parser.add_argument("--reason", required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--patch", required=True, help="Path to unified diff patch")
    parser.add_argument("--run-id", default="")
    args = parser.parse_args()

    repo = str(Path(args.repo).resolve())
    policy = load_policy(args.policy)

    run_id = args.run_id.strip() or f"agent_run_{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}_{uuid4().hex[:8]}"
    stop_file = str(policy.get("emergency_stop_file", "/data/agents/STOP"))
    audit_dir = str(policy.get("audit_log_dir", "/data/logs/agents"))
    allow = list(policy.get("write_allowlist", []))
    deny = list(policy.get("write_denylist", []))
    req = list(policy.get("required_metadata", []))
    allowed_roles = set(policy.get("allowed_roles", ["admin", "service"]))

    if os.path.exists(stop_file):
        print(f"blocked: emergency stop active ({stop_file})")
        return 2

    if args.role not in allowed_roles:
        print(f"blocked: role '{args.role}' not allowed")
        return 3

    md = {"reason": args.reason.strip(), "task_id": args.task_id.strip()}
    missing = [k for k in req if not md.get(k)]
    if missing:
        print(f"blocked: missing metadata {missing}")
        return 4

    patch = Path(args.patch)
    if not patch.exists():
        print(f"patch not found: {patch}")
        return 5

    # preview touched files first from patch headers
    touched_rel: list[str] = []
    for line in patch.read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("+++ b/"):
            rel = line.replace("+++ b/", "", 1).strip()
            if rel != "/dev/null":
                touched_rel.append(rel)

    if not touched_rel:
        print("blocked: no writable file targets found in patch")
        return 6

    touched_abs = [to_abs(p, repo) for p in touched_rel]
    violations = [p for p in touched_abs if not allowed_file(p, allow, deny)]
    if violations:
        print("blocked: denylist/allowlist violation")
        for v in violations:
            print(v)
        return 7

    # apply patch
    run(["git", "apply", "--index", str(patch)], cwd=repo)

    changed = run(["git", "diff", "--cached", "--name-only"], cwd=repo).stdout.splitlines()
    changed_abs = [to_abs(p, repo) for p in changed]
    violations_after = [p for p in changed_abs if not allowed_file(p, allow, deny)]
    if violations_after:
        print("blocked: post-apply policy violation")
        for v in violations_after:
            print(v)
        run(["git", "reset", "HEAD"], cwd=repo)
        return 8

    os.makedirs(audit_dir, exist_ok=True)
    diff_path = os.path.join(audit_dir, f"{run_id}.diff")
    audit_path = os.path.join(audit_dir, f"{run_id}.json")

    diff_txt = run(["git", "diff", "--cached"], cwd=repo).stdout
    with open(diff_path, "w", encoding="utf-8") as f:
        f.write(diff_txt)

    audit = {
        "run_id": run_id,
        "user": args.user,
        "role": args.role,
        "task_id": args.task_id,
        "reason": args.reason,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "changed_files": changed,
        "diff_file": diff_path,
        "policy": args.policy,
    }
    with open(audit_path, "w", encoding="utf-8") as f:
        json.dump(audit, f, ensure_ascii=True, indent=2)

    print(json.dumps({"status": "ok", "run_id": run_id, "changed_files": changed, "audit": audit_path, "diff": diff_path}, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
