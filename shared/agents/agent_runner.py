#!/usr/bin/env python3
"""
Universal Agent Runner for Multi-Model Orchestration.

Calls external CLI AI agents (Codex, Gemini) via subprocess
and returns structured JSON to stdout for Claude Code consumption.

Exit codes: 0 = success, 1 = agent error, 2 = agent not found/unavailable

Usage:
    python agent_runner.py --agent gemini --prompt "Analyze scope..."
    python agent_runner.py --agent codex --prompt-file /tmp/prompt.md --cwd /project
    python agent_runner.py --agent codex-review --prompt-file prompt.md --output-file result.md --cwd /project
    python agent_runner.py --health-check
    python agent_runner.py --list-agents
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(SCRIPT_DIR, "agent_registry.json")
IS_WINDOWS = sys.platform == "win32"


def load_registry():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def build_env(agent_cfg):
    env = os.environ.copy()
    for key, val in agent_cfg.get("env_override", {}).items():
        env[key] = val
    return env


def resolve_arg_placeholders(args, context):
    """Replace {cwd}, {output_file} placeholders in args.

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
            # Resolve placeholder
            value = arg
            for key, val in context.items():
                value = value.replace("{%s}" % key, str(val) if val else "")
            # If resolved to empty string, skip this arg and the preceding flag
            if not value:
                if resolved and resolved[-1].startswith("-"):
                    resolved.pop()
                continue
            resolved.append(value)
        else:
            # Check if next arg is a placeholder that will be empty
            if i + 1 < len(args):
                next_arg = args[i + 1]
                if "{" in next_arg and "}" in next_arg:
                    # Check if the placeholder will resolve to empty
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
    # On Windows, .cmd/.bat wrappers need cmd /c prefix
    if IS_WINDOWS and cmd_path.lower().endswith((".cmd", ".bat")):
        cmd = ["cmd", "/c", cmd_path] + resolved_args
    else:
        cmd = [cmd_path] + resolved_args
    return cmd


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


def write_result_file(output_file, agent_name, response, duration, exit_code):
    """Write standardized result file with metadata wrapper."""
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    header = (
        "<!-- AGENT_REVIEW_RESULT -->\n"
        "<!-- agent: %s -->\n"
        "<!-- timestamp: %s -->\n"
        "<!-- duration_seconds: %.2f -->\n"
        "<!-- exit_code: %d -->\n\n"
    ) % (agent_name, timestamp, duration, exit_code)
    footer = "\n\n<!-- END_AGENT_REVIEW_RESULT -->\n"

    os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        f.write(header + (response or "") + footer)


def run_agent(agent_name, prompt, cwd, timeout, registry, output_file=None):
    agent_cfg = registry["agents"].get(agent_name)
    if not agent_cfg:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Agent '%s' not found in registry" % agent_name
        }

    cmd_path = shutil.which(agent_cfg["command"])
    if not cmd_path:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Command '%s' not found in PATH" % agent_cfg["command"]
        }

    # Resolve placeholders in args ({cwd}, {output_file})
    context = {
        "cwd": cwd or os.getcwd(),
        "output_file": output_file or "",
    }
    resolved_args = resolve_arg_placeholders(agent_cfg.get("args", []), context)

    # Determine timeout: 0 means no limit (agent runs until completion)
    cfg_timeout = agent_cfg.get("timeout_seconds", 300)
    if timeout:
        effective_timeout = timeout
    elif cfg_timeout == 0:
        effective_timeout = None
    else:
        effective_timeout = cfg_timeout

    # If -C flag is in resolved args, agent handles its own cwd
    subprocess_cwd = None if "-C" in resolved_args else cwd

    cmd = build_command(agent_cfg, resolved_args)
    env = build_env(agent_cfg)

    start = time.time()
    try:
        result = subprocess.run(
            cmd,
            input=prompt,
            capture_output=True, text=True,
            timeout=effective_timeout,
            cwd=subprocess_cwd, env=env,
            encoding="utf-8", errors="replace"
        )
        duration = round(time.time() - start, 2)

        # Check if agent wrote output file directly (e.g., codex -o)
        agent_wrote_file = (
            output_file
            and os.path.exists(output_file)
            and os.path.getsize(output_file) > 0
        )

        if agent_wrote_file:
            # Agent wrote result file; read it as the response
            with open(output_file, "r", encoding="utf-8") as f:
                response = f.read().strip()
            # Wrap with metadata header/footer
            write_result_file(output_file, agent_name, response,
                              duration, result.returncode)
        else:
            # Parse agent-specific output formats from stdout
            args = agent_cfg.get("args", [])
            if "--json" in args:
                response = parse_codex_jsonl(result.stdout)
                if response is None:
                    response = result.stdout.strip()
            elif "--output-format" in args:
                response = parse_gemini_json(result.stdout)
                if response is None:
                    response = result.stdout.strip()
            else:
                response = result.stdout.strip()

            # Stderr may contain progress/warnings; use if stdout empty
            if not response and result.stderr.strip():
                response = result.stderr.strip()

            # Write result file if output_file requested but agent didn't write
            if output_file:
                write_result_file(output_file, agent_name, response,
                                  duration, result.returncode)

        if result.returncode != 0:
            return {
                "success": False, "agent": agent_name,
                "response": response or None,
                "duration_seconds": duration,
                "error": "Exit code %d" % result.returncode
            }

        return {
            "success": True, "agent": agent_name,
            "response": response, "duration_seconds": duration,
            "error": None
        }

    except subprocess.TimeoutExpired:
        duration = round(time.time() - start, 2)
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": duration,
            "error": "Timeout after %d seconds" % effective_timeout
        }
    except FileNotFoundError:
        return {
            "success": False, "agent": agent_name,
            "response": None, "duration_seconds": 0,
            "error": "Command '%s' not found" % agent_cfg["command"]
        }


def main():
    parser = argparse.ArgumentParser(
        description="Universal Agent Runner for Multi-Model Orchestration")
    parser.add_argument("--agent", help="Agent name (gemini, codex)")
    parser.add_argument("--prompt", help="Prompt text (short)")
    parser.add_argument("--prompt-file", help="Path to prompt file (large context)")
    parser.add_argument("--output-file",
                        help="Path for result file (agent writes or runner writes)")
    parser.add_argument("--cwd", help="Working directory for agent", default=None)
    parser.add_argument("--timeout", type=int, help="Timeout override (seconds)")
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

    result = run_agent(args.agent, prompt, args.cwd, args.timeout, registry,
                       output_file=args.output_file)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(
        0 if result["success"]
        else (2 if "not found" in (result["error"] or "") else 1)
    )


if __name__ == "__main__":
    main()
