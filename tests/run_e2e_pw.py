#!/usr/bin/env python3
"""Sequential runner for the Playwright e2e specs.

Runs webapp/tests/e2e/specs/*.spec.ts one FILE at a time, in alphabetical order.
The sequence stops at the FIRST spec file that has any failing test and prints
exactly which file (index + name) and which test(s) failed.

Why: running the whole Playwright suite at once is slow and a failure deep in the
run is hard to locate. Fix the failing spec, then re-run with --start N to skip
the specs already known green. Once everything from N onward passes, the runner
automatically does one full regression pass from spec #1 to confirm the fixes
did not break anything earlier.

Usage (run from anywhere; the script cd's into webapp itself):
  python3 webapp/tests/run_e2e_pw.py                 # run all specs from #1
  python3 webapp/tests/run_e2e_pw.py --start 12      # start at the 12th spec
  python3 webapp/tests/run_e2e_pw.py --list          # print the numbered spec list
  python3 webapp/tests/run_e2e_pw.py --no-regress    # skip the auto regression pass
  python3 webapp/tests/run_e2e_pw.py --timeout 900   # per-spec timeout secs (default 600)

Proxy env vars are unset for the child processes, and PLAYWRIGHT_BASE_URL
defaults to http://localhost.
"""

import argparse
import glob
import os
import signal
import subprocess
import sys
import threading
import time

# webapp/  (this file lives at webapp/tests/run_e2e_pw.py)
WEBAPP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_DIR = os.path.join(WEBAPP_DIR, "tests", "e2e", "specs")
PROXY_VARS = ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY",
              "all_proxy", "ALL_PROXY")


def discover():
    files = sorted(glob.glob(os.path.join(SPEC_DIR, "*.spec.ts")))
    # Paths relative to WEBAPP_DIR, which is the cwd we run playwright from.
    return [os.path.relpath(f, WEBAPP_DIR) for f in files]


def child_env(base_url):
    env = dict(os.environ)
    for v in PROXY_VARS:
        env.pop(v, None)
    env.setdefault("PLAYWRIGHT_BASE_URL", base_url)
    env["PYTHONUNBUFFERED"] = "1"
    env["FORCE_COLOR"] = "0"
    return env


def _kill_pg(pid):
    try:
        os.killpg(os.getpgid(pid), signal.SIGKILL)
    except Exception:
        try:
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass


def run_spec(path, idx, total, timeout, base_url, reruns=0):
    print(f"\n===== [{idx}/{total}] RUN {path} =====", flush=True)
    cmd = ["npx", "playwright", "test", path, "--reporter=list"]
    if reruns > 0:
        # Playwright retries failing tests in-process; a test passing on retry is
        # reported as flaky and the run still exits 0 (treated as passing).
        cmd.append(f"--retries={reruns}")
    proc = subprocess.Popen(
        cmd, cwd=WEBAPP_DIR, env=child_env(base_url),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
        start_new_session=True,
    )
    timed_out = {"hit": False}

    def _kill():
        timed_out["hit"] = True
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    watchdog = threading.Timer(timeout, _kill)
    watchdog.start()
    captured = []
    try:
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            captured.append(line)
    finally:
        proc.wait()
        watchdog.cancel()
    if timed_out["hit"]:
        msg = f"[TIMEOUT after {timeout}s]\n"
        sys.stdout.write(msg)
        captured.append(msg)
    return proc.returncode, "".join(captured)


def failing_tests(output):
    """Extract failing test descriptions from the Playwright list reporter."""
    cases = []
    for raw in output.splitlines():
        s = raw.strip()
        # list reporter marks failures with ✘ / ✗; detail blocks start with "N) ".
        if s.startswith("✘") or s.startswith("✗"):
            cases.append(s)
        elif len(s) > 2 and s[0].isdigit() and s[1] == ")":
            cases.append(s)
    # de-dup, keep order
    seen, out = set(), []
    for c in cases:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def resolve_start(files, value):
    """Resolve --start to a 1-based index. Accepts either a number or a filename
    substring (robust when specs are added/removed between runs). Returns
    (index, error_message)."""
    total = len(files)
    if value.isdigit():
        idx = int(value)
        if idx < 1 or idx > total:
            return None, f"--start index must be between 1 and {total}"
        return idx, None
    matches = [i + 1 for i, f in enumerate(files) if value in f]
    if not matches:
        return None, (f"--start '{value}' matched no spec. Use --list to see "
                      "available specs.")
    if len(matches) > 1:
        names = ", ".join(f"#{m} {files[m - 1]}" for m in matches)
        print(f"[note] --start '{value}' matched {len(matches)} specs: {names}; "
              f"using the first (#{matches[0]}).")
    return matches[0], None


def run_sequence(files, start_offset, timeout, base_url, label, reruns=0):
    total = len(files)
    to_run = total - start_offset + 1
    print(f"\n########## {label} (specs {start_offset}..{total} of {total}) ##########",
          flush=True)
    seq_start = time.time()
    passed = 0
    for i, path in enumerate(files):
        idx = i + 1
        if idx < start_offset:
            print(f"----- [{idx}/{total}] SKIP {path}")
            continue
        t0 = time.time()
        rc, out = run_spec(path, idx, total, timeout, base_url, reruns)
        dur = time.time() - t0
        if rc != 0:
            cases = failing_tests(out)
            print("\n" + "=" * 64)
            print(f"FAILED at spec #{idx}/{total}: {path}  ({dur:.0f}s)")
            if cases:
                print("Failing test(s):")
                for c in cases:
                    print(f"  {c}")
            else:
                print(f"(could not parse a failing test; playwright exit code={rc} "
                      "— see output above. May be a timeout or setup error.)")
            print(f"\nResume after fixing with:  python3 webapp/tests/run_e2e_pw.py --start {idx}")
            print("=" * 64, flush=True)
            return (idx, path, cases)
        passed += 1
        elapsed = time.time() - seq_start
        print(f"===== [{idx}/{total}] PASS {path}  ({dur:.0f}s) =====")
        print(f"[progress] {passed}/{to_run} specs passed | total elapsed {elapsed:.0f}s",
              flush=True)
    print(f"\n########## {label}: ALL PASSED ({to_run} specs, {time.time() - seq_start:.0f}s) ##########",
          flush=True)
    return None


def _bail(sig, frame):
    print(f"\nKILLED by signal {sig}", flush=True)
    print("DONE 130", flush=True)
    sys.exit(130)


def main():
    signal.signal(signal.SIGHUP, _bail)
    signal.signal(signal.SIGTERM, _bail)
    signal.signal(signal.SIGINT, _bail)

    ap = argparse.ArgumentParser(description="Sequential Playwright e2e runner")
    ap.add_argument("--start", default="1",
                    help="where to start: a 1-based spec index, or a filename "
                         "substring (stable when specs are added/removed). Default 1.")
    ap.add_argument("--timeout", type=int, default=600,
                    help="per-spec timeout in seconds (default 600)")
    ap.add_argument("--base-url", default=os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost"),
                    help="PLAYWRIGHT_BASE_URL (default http://localhost)")
    ap.add_argument("--reruns", type=int, default=1,
                    help="pass-through to playwright --retries: retry failing tests "
                         "up to N times; a test passing on retry is flaky-pass "
                         "(default 1; use --reruns 0 to disable).")
    ap.add_argument("--no-regress", action="store_true",
                    help="do not auto-run the full regression pass after success")
    ap.add_argument("--list", action="store_true",
                    help="print the numbered spec list and exit")
    args = ap.parse_args()

    files = discover()
    total = len(files)
    if total == 0:
        print(f"No spec files found under {SPEC_DIR}", file=sys.stderr)
        return 2

    if args.list:
        for i, path in enumerate(files, 1):
            print(f"{i:3d}  {path}")
        return 0

    start_idx, err = resolve_start(files, args.start)
    if err:
        print(err, file=sys.stderr)
        return 2

    result = run_sequence(files, start_idx, args.timeout, args.base_url,
                          label=f"PASS 1: from #{start_idx} ({files[start_idx - 1]})",
                          reruns=args.reruns)
    if result is not None:
        return 1

    if start_idx > 1 and not args.no_regress:
        result = run_sequence(files, 1, args.timeout, args.base_url,
                              label="REGRESSION PASS: from #1", reruns=args.reruns)
        if result is not None:
            return 1

    print("\n========================================")
    print(" ALL PLAYWRIGHT SPECS PASSED")
    print("========================================")
    print("DONE 0", flush=True)
    return 0


if __name__ == "__main__":
    rc = main()
    if rc != 0:
        print("DONE", rc, flush=True)
    sys.exit(rc)
