#!/usr/bin/env python3
"""
Universal Agent Runner for Multi-Model Orchestration.

Calls external CLI AI agents (Codex, Gemini) via subprocess
and returns structured JSON to stdout for Claude Code consumption.

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
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(SCRIPT_DIR, "agent_registry.json")
IS_WINDOWS = sys.platform == "win32"

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


def capture_session_id(agent_cfg, raw_stdout):
    """Extract session ID from agent output based on capture strategy.

    Returns session_id string or None if not captured.
    """
    capture_cfg = agent_cfg.get("session_id_capture")
    if not capture_cfg:
        return None

    strategy = capture_cfg.get("strategy")

    if strategy == "from_jsonl_field":
        field = capture_cfg.get("field_path", "session_id")
        for line in raw_stdout.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                # Walk nested path (e.g. "item.session_id")
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
        # Fallback: scan raw output for UUID pattern
        match = UUID_PATTERN.search(raw_stdout)
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
            # Parse first UUID from output
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


def parse_codex_jsonl(raw_output):
    """Extract final agent message from Codex JSONL stream."""
    last_message = None
    for line in raw_output.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            event = json.loads(line)
            if (event.get("type") == "item.completed"
                    and event.get("item", {}).get("type") == "agent_message"):
                last_message = event["item"].get("text", "")
        except (json.JSONDecodeError, KeyError):
            continue
    return last_message


def parse_gemini_json(raw_output):
    """Extract response from Gemini --output-format json envelope."""
    try:
        envelope = json.loads(raw_output.strip())
        if "response" in envelope:
            return envelope["response"]
    except (json.JSONDecodeError, KeyError):
        pass
    return None


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


def _execute_agent(agent_cfg, cmd, prompt, stdin_prompt, effective_timeout,
                   subprocess_cwd, env, output_file, agent_name):
    """Run agent subprocess and return parsed result dict.

    Args:
        stdin_prompt: prompt text for stdin, or None if prompt is positional.
    """
    start = time.time()
    try:
        result = subprocess.run(
            cmd,
            input=stdin_prompt,
            capture_output=True, text=True,
            timeout=effective_timeout,
            cwd=subprocess_cwd, env=env,
            encoding="utf-8", errors="replace"
        )
        duration = round(time.time() - start, 2)

        # Capture session ID from stdout before any further processing
        session_id = capture_session_id(agent_cfg, result.stdout)

        agent_wrote_file = (
            output_file
            and os.path.exists(output_file)
            and os.path.getsize(output_file) > 0
        )

        if agent_wrote_file:
            with open(output_file, "r", encoding="utf-8") as f:
                response = f.read().strip()
            write_result_file(output_file, agent_name, response,
                              duration, result.returncode, session_id)
        else:
            # Determine which args template was used for format detection
            args = agent_cfg.get("args", [])
            if "--json" in args or "--json" in cmd:
                response = parse_codex_jsonl(result.stdout)
                if response is None:
                    response = result.stdout.strip()
            elif "--output-format" in args or "--output-format" in cmd:
                response = parse_gemini_json(result.stdout)
                if response is None:
                    response = result.stdout.strip()
            else:
                response = result.stdout.strip()

            if not response and result.stderr.strip():
                response = result.stderr.strip()

            if output_file:
                write_result_file(output_file, agent_name, response,
                                  duration, result.returncode, session_id)

        if result.returncode != 0:
            return {
                "success": False, "agent": agent_name,
                "response": response or None,
                "duration_seconds": duration,
                "error": "Exit code %d" % result.returncode,
                "session_id": session_id,
            }

        return {
            "success": True, "agent": agent_name,
            "response": response, "duration_seconds": duration,
            "error": None,
            "session_id": session_id,
        }

    except subprocess.TimeoutExpired:
        duration = round(time.time() - start, 2)
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": duration,
            "error": "Timeout after %d seconds" % effective_timeout,
            "session_id": None,
        }
    except FileNotFoundError:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Command '%s' not found" % agent_cfg["command"],
            "session_id": None,
        }


def run_agent(agent_name, prompt, cwd, timeout, registry, output_file=None,
              resume_session=None):
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

    # Determine timeout
    cfg_timeout = agent_cfg.get("timeout_seconds", 300)
    if timeout:
        effective_timeout = timeout
    elif cfg_timeout == 0:
        effective_timeout = None
    else:
        effective_timeout = cfg_timeout

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
            agent_cfg, cmd, prompt, stdin_prompt, effective_timeout,
            subprocess_cwd, env, output_file, agent_name
        )

        # Check if resume actually worked.
        # "error" has generic "Exit code N"; real CLI errors land
        # in "response" via stderr (line 286-287).
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
            # Fallback: run stateless (normal args)
            sys.stderr.write(
                "WARNING: Session resume failed for %s (session=%s), "
                "falling back to stateless. Error: %s\n"
                % (agent_name, resume_session, result.get("error"))
            )
            # Clear output file if resume wrote partial data
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
        agent_cfg, cmd, prompt, prompt, effective_timeout,
        subprocess_cwd, env, output_file, agent_name
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

    result = run_agent(
        args.agent, prompt, args.cwd, args.timeout, registry,
        output_file=args.output_file,
        resume_session=args.resume_session,
    )
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(
        0 if result["success"]
        else (2 if "not found" in (result["error"] or "") else 1)
    )


if __name__ == "__main__":
    main()
