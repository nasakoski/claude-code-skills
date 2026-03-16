#!/usr/bin/env python3
"""
Universal Agent Runner for Multi-Model Orchestration.

Calls external CLI AI agents (Codex, Gemini) via subprocess
and returns structured JSON to stdout for Claude Code consumption.

Streams agent stdout to a log file for real-time visibility.
Writes process-level heartbeat.json every 30s (independent of agent).

Supports session resume for multi-turn debate (challenge/follow-up rounds).

Exit codes: 0 = success, 1 = agent error, 2 = agent not found/unavailable

Usage:
    python agent_runner.py --agent gemini --prompt "Analyze scope..."
    python agent_runner.py --agent codex --prompt-file /tmp/prompt.md --cwd /project
    python agent_runner.py --agent codex-review --prompt-file prompt.md --output-file result.md --cwd /project
    python agent_runner.py --agent codex-review --resume-session abc-123 --prompt-file challenge.md --output-file result.md --cwd /project
    python agent_runner.py --health-check
    python agent_runner.py --list-agents
"""

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(SCRIPT_DIR, "agent_registry.json")
IS_WINDOWS = sys.platform == "win32"

DEFAULT_HARD_TIMEOUT = 900  # 15 minutes

UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)


def load_registry():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_env(agent_cfg):
    env = os.environ.copy()
    for key, val in agent_cfg.get("env_override", {}).items():
        env[key] = val
    return env


WINDOWS_PERFORMANCE_HINT = (
    "\n## Platform Note (Windows)\n"
    "You are running on Windows where shell commands use PowerShell "
    "(5-15 seconds per invocation).\n"
    "- **PREFER your built-in file read tool** over shell commands "
    "(`cat`, `type`, `Get-Content`) for reading files. "
    "Your built-in file read is instant.\n"
    "- **BATCH shell operations**: combine related checks into one command "
    "(e.g., `git log --oneline -10 && git diff --stat` instead of "
    "separate calls).\n"
    "- **AVOID grep/rg via shell** -- PowerShell escaping differs from bash "
    "and often causes regex errors. Use your built-in file read to examine "
    "specific files directly.\n"
    "- **Shell budget**: each shell call costs 5-15 seconds. "
    "Prioritize wisely.\n\n"
)


def prepare_prompt(prompt):
    """Prepend platform-specific performance hints to agent prompt."""
    if IS_WINDOWS:
        return WINDOWS_PERFORMANCE_HINT + prompt
    return prompt


def resolve_arg_placeholders(args, context):
    """Replace {cwd}, {output_file}, {session_id} placeholders in args.

    If a placeholder value is empty/None, removes the flag AND its value.
    E.g., args=["-C", "{cwd}", "-o", "{output_file}"] with output_file=None
    becomes ["-C", "/project"] (removes -o and {output_file}).
    """
    resolved = []
    skip_next = False
    for i, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue

        has_placeholder = "{" in arg and "}" in arg
        if has_placeholder:
            value = arg
            for key, val in context.items():
                value = value.replace("{%s}" % key, str(val) if val else "")
            if not value:
                if resolved and resolved[-1].startswith("-"):
                    resolved.pop()
                continue
            resolved.append(value)
        else:
            if i + 1 < len(args):
                next_arg = args[i + 1]
                if "{" in next_arg and "}" in next_arg:
                    next_val = next_arg
                    for key, val in context.items():
                        next_val = next_val.replace(
                            "{%s}" % key, str(val) if val else ""
                        )
                    if not next_val:
                        skip_next = True
                        continue
            resolved.append(arg)
    return resolved


def build_command(agent_cfg, resolved_args):
    cmd_path = shutil.which(agent_cfg["command"]) or agent_cfg["command"]
    if IS_WINDOWS and cmd_path.lower().endswith((".cmd", ".bat")):
        cmd = ["cmd", "/c", cmd_path] + resolved_args
    else:
        cmd = [cmd_path] + resolved_args
    return cmd


def capture_session_id(agent_cfg, raw_output):
    """Extract session ID from agent output based on capture strategy.

    Returns session_id string or None if not captured.
    """
    capture_cfg = agent_cfg.get("session_id_capture")
    if not capture_cfg:
        return None

    strategy = capture_cfg.get("strategy")

    if strategy == "from_log":
        pattern = capture_cfg.get("pattern")
        if pattern:
            match = re.search(pattern, raw_output, re.IGNORECASE)
            if match and match.groups():
                return match.group(1)
        # Fallback: first UUID in output
        match = UUID_PATTERN.search(raw_output)
        return match.group(0) if match else None

    if strategy == "from_jsonl_field":
        field = capture_cfg.get("field_path", "session_id")
        for line in raw_output.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                value = event
                for part in field.split("."):
                    if isinstance(value, dict):
                        value = value.get(part)
                    else:
                        value = None
                        break
                if value and isinstance(value, str):
                    return value
            except (json.JSONDecodeError, KeyError, TypeError):
                continue
        match = UUID_PATTERN.search(raw_output)
        return match.group(0) if match else None

    if strategy == "from_list_command":
        list_cmd = capture_cfg.get("command", "")
        if not list_cmd:
            return None
        try:
            parts = list_cmd.split()
            cmd_path = shutil.which(parts[0])
            if not cmd_path:
                return None
            if IS_WINDOWS and cmd_path.lower().endswith((".cmd", ".bat")):
                parts = ["cmd", "/c", cmd_path] + parts[1:]
            else:
                parts[0] = cmd_path
            result = subprocess.run(
                parts,
                capture_output=True, text=True, timeout=15,
                encoding="utf-8", errors="replace"
            )
            match = UUID_PATTERN.search(result.stdout)
            return match.group(0) if match else None
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return None

    return None


def check_agent_health(agent_name, registry):
    agent_cfg = registry["agents"].get(agent_name)
    if not agent_cfg:
        return False, "Agent not found in registry"

    cmd_path = shutil.which(agent_cfg["command"])
    if not cmd_path:
        return False, "Command not found in PATH"

    try:
        health_cmd = agent_cfg["health_check"].split()
        if IS_WINDOWS:
            hc_path = shutil.which(health_cmd[0])
            if hc_path and hc_path.lower().endswith((".cmd", ".bat")):
                health_cmd = ["cmd", "/c", hc_path] + health_cmd[1:]
        result = subprocess.run(
            health_cmd,
            capture_output=True, text=True, timeout=15,
            env=build_env(agent_cfg),
            encoding="utf-8", errors="replace"
        )
        version = result.stdout.strip() or result.stderr.strip()
        return True, version.split("\n")[0][:80]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return False, str(e)


def write_result_file(output_file, agent_name, response, duration, exit_code,
                      session_id=None):
    """Write standardized result file with metadata wrapper."""
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    header = (
        "<!-- AGENT_REVIEW_RESULT -->\n"
        "<!-- agent: %s -->\n"
        "<!-- timestamp: %s -->\n"
        "<!-- duration_seconds: %.2f -->\n"
        "<!-- exit_code: %d -->\n"
    ) % (agent_name, timestamp, duration, exit_code)
    if session_id:
        header += "<!-- session_id: %s -->\n" % session_id
    header += "\n"
    footer = "\n\n<!-- END_AGENT_REVIEW_RESULT -->\n"

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(header + (response or "") + footer)


# ---------------------------------------------------------------------------
# Streaming execution with heartbeat
# ---------------------------------------------------------------------------

def _get_log_path(output_file):
    """Derive log file path from output file path."""
    if not output_file:
        return None
    if output_file.endswith("_result.md"):
        return output_file[:-len("_result.md")] + ".log"
    return os.path.splitext(output_file)[0] + ".log"


def _write_heartbeat(heartbeat_path, data):
    """Atomic write heartbeat JSON (write to .tmp then os.replace)."""
    if not heartbeat_path:
        return
    tmp_path = heartbeat_path + ".tmp"
    try:
        os.makedirs(os.path.dirname(heartbeat_path), exist_ok=True)
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f)
        os.replace(tmp_path, heartbeat_path)
    except OSError:
        pass


def _heartbeat_loop(proc, heartbeat_path, log_path, start_time,
                    interval, stop_event):
    """Write heartbeat.json every `interval` seconds until process exits."""
    while not stop_event.wait(timeout=interval):
        elapsed = round(time.time() - start_time, 1)
        log_size = 0
        if log_path:
            try:
                log_size = os.path.getsize(log_path)
            except OSError:
                pass
        _write_heartbeat(heartbeat_path, {
            "pid": proc.pid,
            "alive": proc.poll() is None,
            "elapsed_seconds": elapsed,
            "log_size_bytes": log_size,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })
        if proc.poll() is not None:
            break


def _execute_agent(agent_cfg, cmd, stdin_prompt, hard_timeout,
                   heartbeat_interval, subprocess_cwd, env,
                   output_file, log_path, agent_name):
    """Run agent subprocess with streaming stdout and process heartbeat.

    Args:
        stdin_prompt: prompt text for stdin, or None if prompt is positional.
        hard_timeout: max seconds before process is killed.
        heartbeat_interval: seconds between heartbeat writes.
        log_path: file path for streaming stdout (None = capture in memory).
    """
    heartbeat_path = None
    if log_path:
        heartbeat_path = os.path.join(
            os.path.dirname(os.path.abspath(log_path)), "heartbeat.json")

    start = time.time()
    stop_event = threading.Event()
    log_fh = None
    timed_out = False
    raw_stdout = ""

    try:
        # Open log file for OS-level stdout redirect
        if log_path:
            os.makedirs(os.path.dirname(os.path.abspath(log_path)),
                        exist_ok=True)
            log_fh = open(log_path, "w", encoding="utf-8",
                          errors="replace")

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE if stdin_prompt else subprocess.DEVNULL,
            stdout=log_fh if log_fh else subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=subprocess_cwd,
            env=env,
            encoding="utf-8",
            errors="replace",
        )

        # Initial heartbeat
        _write_heartbeat(heartbeat_path, {
            "pid": proc.pid, "alive": True,
            "elapsed_seconds": 0, "log_size_bytes": 0,
            "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        })

        # Send prompt via stdin
        if stdin_prompt:
            try:
                proc.stdin.write(stdin_prompt)
                proc.stdin.close()
            except OSError:
                pass

        # Start heartbeat thread
        hb_thread = threading.Thread(
            target=_heartbeat_loop,
            args=(proc, heartbeat_path, log_path, start,
                  heartbeat_interval, stop_event),
            daemon=True,
        )
        hb_thread.start()

        # Wait for process with hard timeout
        try:
            if log_fh:
                # stdout goes directly to file; just wait
                proc.wait(timeout=hard_timeout)
            else:
                # stdout is PIPE; use communicate to avoid deadlock
                raw_stdout, _ = proc.communicate(timeout=hard_timeout)
                if raw_stdout is None:
                    raw_stdout = ""
        except subprocess.TimeoutExpired:
            timed_out = True
            proc.kill()
            try:
                if log_fh:
                    proc.wait(timeout=10)
                else:
                    raw_stdout, _ = proc.communicate(timeout=10)
                    if raw_stdout is None:
                        raw_stdout = ""
            except subprocess.TimeoutExpired:
                pass

        # Stop heartbeat
        stop_event.set()
        hb_thread.join(timeout=5)
        duration = round(time.time() - start, 2)

    except FileNotFoundError:
        stop_event.set()
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Command '%s' not found" % agent_cfg["command"],
            "session_id": None,
        }
    finally:
        if log_fh:
            log_fh.close()

    # Read log content (for session ID capture and fallback response)
    log_content = ""
    if log_path and os.path.exists(log_path):
        try:
            with open(log_path, "r", encoding="utf-8",
                       errors="replace") as f:
                log_content = f.read()
        except OSError:
            pass

    # For agents with log files, log content serves as raw output
    if log_fh and not raw_stdout:
        raw_stdout = log_content

    # Final heartbeat
    final_status = "timeout" if timed_out else (
        "done" if proc.returncode == 0 else "error")
    log_size = len(log_content.encode("utf-8", errors="replace")
                   ) if log_content else 0
    _write_heartbeat(heartbeat_path, {
        "pid": proc.pid, "alive": False,
        "elapsed_seconds": duration,
        "log_size_bytes": log_size,
        "status": final_status,
        "exit_code": proc.returncode,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })

    if timed_out:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": duration,
            "error": "Hard timeout after %d seconds" % hard_timeout,
            "session_id": None,
        }

    # Capture session ID
    session_id = capture_session_id(agent_cfg, raw_stdout)

    # Parse response
    agent_wrote_file = (
        output_file
        and os.path.exists(output_file)
        and os.path.getsize(output_file) > 0
    )

    if agent_wrote_file:
        with open(output_file, "r", encoding="utf-8") as f:
            response = f.read().strip()
        write_result_file(output_file, agent_name, response,
                          duration, proc.returncode, session_id)
    else:
        # Response is raw stdout (from log file or captured PIPE)
        response = raw_stdout.strip() if raw_stdout else None

        if output_file and response:
            write_result_file(output_file, agent_name, response,
                              duration, proc.returncode, session_id)

    if proc.returncode != 0:
        return {
            "success": False, "agent": agent_name,
            "response": response or None,
            "duration_seconds": duration,
            "error": "Exit code %d" % proc.returncode,
            "session_id": session_id,
        }

    return {
        "success": True, "agent": agent_name,
        "response": response, "duration_seconds": duration,
        "error": None,
        "session_id": session_id,
    }


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def run_agent(agent_name, prompt, cwd, timeout, registry, output_file=None,
              resume_session=None, log_file=None):
    agent_cfg = registry["agents"].get(agent_name)
    if not agent_cfg:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Agent '%s' not found in registry" % agent_name,
            "session_id": None, "session_resumed": False,
        }

    cmd_path = shutil.which(agent_cfg["command"])
    if not cmd_path:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Command '%s' not found in PATH" % agent_cfg["command"],
            "session_id": None, "session_resumed": False,
        }

    context = {
        "cwd": cwd or os.getcwd(),
        "output_file": output_file or "",
        "session_id": resume_session or "",
    }

    # Determine hard timeout
    cfg_timeout = agent_cfg.get(
        "hard_timeout_seconds",
        agent_cfg.get("timeout_seconds", DEFAULT_HARD_TIMEOUT))
    if timeout:
        hard_timeout = timeout
    elif cfg_timeout == 0:
        hard_timeout = DEFAULT_HARD_TIMEOUT
    else:
        hard_timeout = cfg_timeout

    heartbeat_interval = agent_cfg.get("heartbeat_interval_seconds", 30)
    log_path = log_file or _get_log_path(output_file)
    env = build_env(agent_cfg)

    # Try resume mode if session ID provided and agent supports it
    use_resume = (
        resume_session
        and agent_cfg.get("resume_args")
    )

    if use_resume:
        resume_args_template = agent_cfg["resume_args"]
        resolved_args = resolve_arg_placeholders(resume_args_template, context)

        # Prompt delivery: positional (append to args) or flag/stdin
        delivery = agent_cfg.get("resume_prompt_delivery", "flag")
        if delivery == "positional":
            resolved_args.append(prompt)
            stdin_prompt = None
        else:
            stdin_prompt = prompt

        subprocess_cwd = None if "-C" in resolved_args else cwd
        cmd = build_command(agent_cfg, resolved_args)

        result = _execute_agent(
            agent_cfg, cmd, stdin_prompt, hard_timeout,
            heartbeat_interval, subprocess_cwd, env,
            output_file, log_path, agent_name
        )

        # Check if resume actually worked
        error_text = (
            (result.get("error") or "") + " "
            + (result.get("response") or "")
        ).lower()
        resume_failed = (
            not result["success"]
            and error_text.strip()
            and ("session" in error_text
                 or "not found" in error_text
                 or "expired" in error_text
                 or "unexpected argument" in error_text
                 or "unrecognized" in error_text
                 or "invalid option" in error_text
                 or "unknown flag" in error_text)
        )

        if resume_failed:
            sys.stderr.write(
                "WARNING: Session resume failed for %s (session=%s), "
                "falling back to stateless. Error: %s\n"
                % (agent_name, resume_session, result.get("error"))
            )
            if output_file and os.path.exists(output_file):
                os.remove(output_file)
        else:
            result["session_resumed"] = True
            return result

    # Normal (stateless) execution
    resolved_args = resolve_arg_placeholders(
        agent_cfg.get("args", []), context
    )
    subprocess_cwd = None if "-C" in resolved_args else cwd
    cmd = build_command(agent_cfg, resolved_args)

    result = _execute_agent(
        agent_cfg, cmd, prompt, hard_timeout,
        heartbeat_interval, subprocess_cwd, env,
        output_file, log_path, agent_name
    )
    result["session_resumed"] = False
    return result


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(
        description="Universal Agent Runner for Multi-Model Orchestration")
    parser.add_argument("--agent", help="Agent name (gemini, codex)")
    parser.add_argument("--prompt", help="Prompt text (short)")
    parser.add_argument("--prompt-file", help="Path to prompt file (large context)")
    parser.add_argument("--output-file",
                        help="Path for result file (agent writes or runner writes)")
    parser.add_argument("--log-file",
                        help="Path for streaming output log (auto-derived "
                             "from --output-file if not specified)")
    parser.add_argument("--cwd", help="Working directory for agent", default=None)
    parser.add_argument("--timeout", type=int, help="Timeout override (seconds)")
    parser.add_argument("--resume-session",
                        help="Session ID to resume (for challenge/follow-up rounds)")
    parser.add_argument("--health-check", action="store_true",
                        help="Check all agents availability")
    parser.add_argument("--list-agents", action="store_true",
                        help="List registered agents")
    args = parser.parse_args()

    registry = load_registry()

    if args.list_agents:
        for name, cfg in registry["agents"].items():
            groups = ", ".join(cfg.get("skill_groups", [])) or "none"
            print("%s: %s (groups: %s)" % (name, cfg["name"], groups))
        sys.exit(0)

    if args.health_check:
        all_ok = True
        for name in registry["agents"]:
            ok, info = check_agent_health(name, registry)
            status = "OK" if ok else "UNAVAILABLE"
            print("%s: %s -- %s" % (name, status, info))
            if not ok:
                all_ok = False
        sys.exit(0 if all_ok else 1)

    if not args.agent:
        parser.error("--agent is required (or use --health-check / --list-agents)")

    # Resolve prompt
    prompt = args.prompt
    if args.prompt_file:
        with open(args.prompt_file, "r", encoding="utf-8") as f:
            prompt = f.read()
    if not prompt:
        parser.error("--prompt or --prompt-file is required")
    prompt = prepare_prompt(prompt)

    result = run_agent(
        args.agent, prompt, args.cwd, args.timeout, registry,
        output_file=args.output_file,
        resume_session=args.resume_session,
        log_file=args.log_file,
    )
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(
        0 if result["success"]
        else (2 if "not found" in (result["error"] or "") else 1)
    )


if __name__ == "__main__":
    main()
