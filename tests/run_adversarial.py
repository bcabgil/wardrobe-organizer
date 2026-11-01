#!/usr/bin/env python3
"""
Wardrobe Organizer - Empirical Adversarial Test Runner
Executes the Milestone 1 Storage Layer Adversarial Stress Suite.
Complies with Golden Anti-Deadlock Rules:
- No anonymous pipes with msedge
- Direct psutil process tree termination (no taskkill)
- Fail-safe thread watchdog (15s)
- Headless Edge execution with Chromium log polling
"""

import sys
import os
import time
import json
import shutil
import tempfile
import threading
import subprocess
from pathlib import Path

# Ensure UTF-8 output on Windows console
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def arm_watchdog(timeout_seconds=15):
    """Hard fail-safe watchdog: forces emergency exit if execution hangs."""
    def _killer():
        time.sleep(timeout_seconds)
        print(f"\n[FATAL] Watchdog timer expired ({timeout_seconds}s)! Forcing emergency exit.", file=sys.stderr)
        os._exit(2)
    t = threading.Thread(target=_killer, daemon=True)
    t.start()

def kill_process_tree(pid):
    """Kills parent process and all child processes using psutil in < 100ms."""
    if not pid:
        return
    try:
        import psutil
        parent = psutil.Process(pid)
        procs = [parent]
        try:
            procs.extend(parent.children(recursive=True))
        except Exception:
            pass
        for p in procs:
            try:
                p.kill()
            except Exception:
                pass
        try:
            psutil.wait_procs(procs, timeout=1.0)
        except Exception:
            pass
    except Exception:
        pass

def run_adversarial_suite(harness_path, timeout=10):
    edge_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        shutil.which("msedge") or ""
    ]
    edge_bin = next((p for p in edge_paths if p and os.path.isfile(p)), None)
    if not edge_bin:
        raise FileNotFoundError("Microsoft Edge executable not found.")

    temp_dir = tempfile.mkdtemp(prefix="adv_run_")
    log_file = os.path.join(temp_dir, "edge_console.log")
    target_url = f"file:///{Path(harness_path).resolve().as_posix()}"

    cmd = [
        edge_bin,
        "--headless=new",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--disable-web-security",
        "--disable-gpu",
        "--disable-direct-composition",
        "--disable-extensions",
        f"--user-data-dir={temp_dir}",
        "--enable-logging",
        f"--log-file={log_file}",
        target_url
    ]

    t0 = time.time()
    proc = subprocess.Popen(cmd)

    results = None
    start_marker = "__TEST_RESULTS_JSON_START__"
    end_marker = "__TEST_RESULTS_JSON_END__"

    try:
        while time.time() - t0 < timeout:
            if os.path.exists(log_file):
                try:
                    with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                        content = f.read()
                        if start_marker in content and end_marker in content:
                            s = content.find(start_marker) + len(start_marker)
                            e = content.find(end_marker, s)
                            results = json.loads(content[s:e])
                            break
                except Exception:
                    pass
            time.sleep(0.1)
    finally:
        kill_process_tree(proc.pid)
        try:
            proc.wait(timeout=1)
        except Exception:
            pass
        time.sleep(0.05)
        if not results and os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    print("\n[DEBUG LOG DUMP]:\n" + f.read()[:3000], file=sys.stderr)
            except Exception:
                pass
        shutil.rmtree(temp_dir, ignore_errors=True)

    elapsed = round(time.time() - t0, 2)
    return results, elapsed

if __name__ == "__main__":
    arm_watchdog(15)

    project_root = Path(__file__).resolve().parent.parent
    harness_path = project_root / "tests" / "harness_adversarial.html"

    print("============================================================")
    print(" Milestone 1 Storage Layer Adversarial Verification Suite")
    print(f" Target Harness: {harness_path}")
    print("============================================================")

    res, duration = run_adversarial_suite(str(harness_path), timeout=10)

    if not res:
        print(f"\n[FAIL] Adversarial test execution timed out or failed to return results after {duration}s!")
        sys.exit(1)

    summary = res.get("summary", {})
    total = summary.get("total", 0)
    passed = summary.get("passed", 0)
    failed = summary.get("failed", 0)
    skipped = summary.get("skipped", 0)
    assertions = summary.get("assertions", 0)

    print("\n----------------- TEST EXECUTION RESULTS -----------------")
    for suite in res.get("suites", []):
        print(f"\n[{'PASS' if suite.get('failed', 0) == 0 else 'FAIL'}] {suite.get('name')} "
              f"(Passed: {suite.get('passed')}, Failed: {suite.get('failed')}, Skipped: {suite.get('skipped')})")
        for t in suite.get("tests", []):
            status = t.get("status")
            name = t.get("name")
            dur = t.get("durationMs", 0)
            if status == "passed":
                print(f"  ✓ {name} ({dur}ms)")
            elif status == "failed":
                err = t.get("error", {})
                print(f"  ✗ {name} ({dur}ms): {err.get('message')}")
            else:
                print(f"  ○ {name} (skipped: {t.get('skipReason')})")

    print("\n============================================================")
    print(" SUMMARY:")
    print(f" Total Tests: {total}")
    print(f" Assertions:  {assertions}")
    print(f" Passed:      {passed}")
    print(f" Failed:      {failed}")
    print(f" Skipped:     {skipped}")
    print(f" Duration:    {duration}s (Browser execution: {summary.get('durationMs', 0)}ms)")
    print("============================================================")

    if failed == 0:
        print("[SUCCESS] All adversarial stress tests passed cleanly.")
        sys.exit(0)
    else:
        print(f"[FAILURE] {failed} test(s) failed.")
        sys.exit(1)
