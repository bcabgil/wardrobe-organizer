#!/usr/bin/env python3
"""
Wardrobe Organizer & AI Fashion Stylist PWA
Automated Headless Test Runner

Drives Microsoft Edge headlessly to execute browser-native ES module test suites.
Captures results via robust Chromium file logging (--enable-logging --log-file).
Eliminates loopback socket/HTTP server requirements and deceptive regex audit fallbacks.
Exits 0 strictly on 100% test pass; exits 1 on test failure, timeout, or missing results.
"""

import sys
import os
import json
import time
import shutil
import tempfile
import argparse
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

EDGE_PATHS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    shutil.which("msedge") or "",
]

START_MARKER = "__TEST_RESULTS_JSON_START__"
END_MARKER = "__TEST_RESULTS_JSON_END__"

ALL_SUITES = [
    'wardrobeDb',
    'mediaUtils',
    'eventBus',
    'jszip',
    'backup',
    'offlineStylist',
    'weatherService',
    'router',
    'laundryGrouping',
    'uiComponents',
    'geminiService',
    'e2e_scenarios'
]


def find_edge_binary(override_path=None):
    if override_path and os.path.isfile(override_path):
        return override_path
    for path in EDGE_PATHS:
        if path and os.path.isfile(path):
            return path
    raise FileNotFoundError("Microsoft Edge executable not found. Please specify via --edge-path.")


def get_project_root():
    cur = Path(__file__).resolve().parent
    while cur != cur.parent:
        if (cur / "tests" / "index.html").is_file():
            return str(cur)
        cur = cur.parent
    return str(Path(__file__).resolve().parent)


def extract_results_from_log(log_path):
    """
    Reads the Chromium log file and extracts the JSON test results payload.
    Supports both chunked console logs (for large multi-suite payloads > 4KB)
    and single-line markers.
    Returns parsed dictionary or None.
    """
    if not os.path.exists(log_path):
        return None
    try:
        import re
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        if "__TEST_CHUNKS_DONE__" in content:
            matches = re.findall(r"__TEST_CHUNK_(\d+)_(\d+)__(.*?)__END_CHUNK__", content)
            if matches:
                total = int(matches[0][1])
                chunk_map = {}
                for idx_str, tot_str, chunk_data in matches:
                    chunk_map[int(idx_str)] = chunk_data
                if len(chunk_map) == total:
                    full_json = "".join(chunk_map[i] for i in range(total))
                    return json.loads(full_json)
        if START_MARKER in content and END_MARKER in content:
            s = content.find(START_MARKER) + len(START_MARKER)
            e = content.find(END_MARKER, s)
            raw_json = content[s:e]
            return json.loads(raw_json)
    except Exception:
        pass
    return None


def kill_process_tree(proc):
    """
    Terminates the Edge process and all child processes cleanly without relying
    on Windows RPC/WMI taskkill, which can block or deadlock in sandboxed environments.
    """
    if not proc:
        return
    try:
        import psutil
        parent = psutil.Process(proc.pid)
        procs_to_kill = [parent]
        try:
            procs_to_kill.extend(parent.children(recursive=True))
        except Exception:
            pass
        for p in procs_to_kill:
            try:
                p.kill()
            except Exception:
                pass
        try:
            psutil.wait_procs(procs_to_kill, timeout=1.0)
        except Exception:
            pass
    except Exception:
        try:
            proc.kill()
            try:
                proc.wait(timeout=1.0)
            except Exception:
                pass
        except Exception:
            pass


def _execute_suite_once(edge_bin, project_root, suite_name, filter_text=None, timeout=12, no_headless=False):
    """
    Executes a single test suite in an isolated headless Edge instance.
    Returns parsed results dictionary or None on timeout/failure.
    """
    temp_dir = tempfile.mkdtemp(prefix="edge_test_run_")
    log_file = os.path.join(temp_dir, "edge_browser.log")
    prof_dir = os.path.join(temp_dir, "profile")

    file_path = Path(project_root) / "tests" / "index.html"
    query_parts = [f"t={int(time.time() * 1000)}"]
    if suite_name and suite_name != "all":
        query_parts.append(f"suite={suite_name}")
    if filter_text:
        query_parts.append(f"filter={filter_text}")
    query_str = "?" + "&".join(query_parts)

    target_url = f"file:///{file_path.as_posix()}{query_str}"

    edge_cmd = [
        edge_bin,
        "--headless=new" if not no_headless else "--start-maximized",
        "--no-sandbox",
        "--allow-file-access-from-files",
        "--disable-gpu",
        "--disable-direct-composition",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-extensions",
        "--disable-component-update",
        "--no-first-run",
        "--no-default-browser-check",
        "--enable-logging",
        f"--log-file={log_file}",
        f"--user-data-dir={prof_dir}",
        "--disable-features=EdgeElevationService,OptimizationGuideModelDownloading,SecondaryTileManager",
        target_url,
    ]

    results = None
    process = None
    start_time = time.time()

    try:
        # Note: Do NOT pass stdout=DEVNULL or stderr=DEVNULL on Windows;
        # Chromium's renderer process fails initialization when standard handles are NUL.
        process = subprocess.Popen(edge_cmd)

        while time.time() - start_time < timeout:
            results = extract_results_from_log(log_file)
            if results:
                break
            time.sleep(0.15)

    except Exception as e:
        print(f"[FATAL] Failed to launch Edge process for {suite_name}: {e}", file=sys.stderr, flush=True)
    finally:
        kill_process_tree(process)
        time.sleep(0.1)
        if not results and os.path.exists(log_file):
            try:
                with open(log_file, "r", encoding="utf-8", errors="replace") as f:
                    print(f"\n[DEBUG {suite_name}] Log dump:\n{f.read()[:1500]}", file=sys.stderr)
            except Exception:
                pass
        try:
            shutil.rmtree(temp_dir, ignore_errors=True)
        except Exception:
            pass

    return results


def execute_suite(edge_bin, project_root, suite_name, filter_text=None, timeout=12, no_headless=False, retries=2):
    for attempt in range(retries + 1):
        res = _execute_suite_once(edge_bin, project_root, suite_name, filter_text, timeout, no_headless)
        if res:
            return res
        if attempt < retries:
            time.sleep(0.3)
    return None


def run_tests(args):
    project_root = get_project_root()
    edge_bin = find_edge_binary(args.edge_path)

    print("============================================================")
    print(" Wardrobe Organizer & AI Fashion Stylist Test Runner")
    print(f" Engine: {edge_bin}")
    print(f" Workspace: {project_root}")
    print("============================================================")

    suites_to_run = [args.suite] if args.suite else ALL_SUITES

    overall_total = 0
    overall_passed = 0
    overall_failed = 0
    overall_skipped = 0
    overall_assertions = 0
    total_start_time = time.time()

    print("\n----------------- BROWSER TEST EXECUTION RESULTS -----------------")

    suite_failures = []
    timed_out_suites = []

    for suite_name in suites_to_run:
        res = execute_suite(
            edge_bin=edge_bin,
            project_root=project_root,
            suite_name=suite_name,
            filter_text=args.filter,
            timeout=max(args.timeout, 5),
            no_headless=args.no_headless
        )

        if not res:
            timed_out_suites.append(suite_name)
            overall_failed += 1
            print(f"\n[FAIL] {suite_name}: Headless browser execution timed out or failed to return results")
            continue

        summary = res.get("summary", {})
        overall_total += summary.get("total", 0)
        overall_passed += summary.get("passed", 0)
        overall_failed += summary.get("failed", 0)
        overall_skipped += summary.get("skipped", 0)
        overall_assertions += summary.get("assertions", 0)

        for s in res.get("suites", []):
            s_name = s.get("name", suite_name)
            s_pass = s.get("passed", 0)
            s_fail = s.get("failed", 0)
            s_skip = s.get("skipped", 0)
            status_tag = "[PASS]" if s_fail == 0 else "[FAIL]"
            print(f"\n{status_tag} {s_name} (Passed: {s_pass}, Failed: {s_fail}, Skipped: {s_skip})")
            for t in s.get("tests", []):
                t_name = t.get("name")
                t_status = t.get("status")
                if t_status == "passed":
                    print(f"  ✓ {t_name} ({t.get('durationMs', 0)}ms)")
                elif t_status == "skipped":
                    print(f"  ○ {t_name} [{t.get('skipReason', 'Skipped')}]")
                elif t_status == "failed":
                    print(f"  ✗ {t_name}")
                    err = t.get("error", {})
                    if err:
                        print(f"    Error: {err.get('message')}")
                        if err.get("expected") is not None or err.get("actual") is not None:
                            print(f"    Expected: {err.get('expected')}")
                            print(f"    Actual:   {err.get('actual')}")
                    suite_failures.append(f"{s_name} > {t_name}")
        time.sleep(0.1)

    total_duration_s = time.time() - total_start_time

    print("\n============================================================")
    print(" SUMMARY:")
    print(f" Total Tests: {overall_total}")
    print(f" Assertions:  {overall_assertions}")
    print(f" Passed:      {overall_passed}")
    print(f" Failed:      {overall_failed}")
    print(f" Skipped:     {overall_skipped}")
    print(f" Duration:    {total_duration_s:.2f}s")
    print("============================================================")

    if overall_failed > 0 or timed_out_suites:
        if timed_out_suites:
            print(f"[FAIL] The following suites timed out: {', '.join(timed_out_suites)}", file=sys.stderr)
        if suite_failures:
            print(f"[FAIL] {len(suite_failures)} test(s) failed in browser execution:", file=sys.stderr)
            for f in suite_failures:
                print(f"  - {f}", file=sys.stderr)
        return 1

    print("[SUCCESS] All executed tests passed successfully.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Headless Edge Test Runner for Wardrobe Organizer PWA")
    parser.add_argument("--edge-path", default=None, help="Path to msedge.exe")
    parser.add_argument("--suite", default=None, help="Run only suites matching this name")
    parser.add_argument("--filter", default=None, help="Filter tests by text pattern")
    parser.add_argument("--timeout", type=int, default=12, help="Execution timeout in seconds per suite")
    parser.add_argument("--no-headless", action="store_true", help="Run with visible browser window")
    args = parser.parse_args()

    sys.exit(run_tests(args))
