#!/usr/bin/env python3
"""
Code Quality Hook (PostToolUse on Edit|Write)

Checks code quality after file modifications.
Exit code 2 = feedback to Claude (violations found)
Exit code 0 = clean

Checks from code-quality-checker skill:
- KISS: function complexity, too many parameters
- DRY: duplicate code patterns (basic detection)
- YAGNI: unused imports, commented code blocks
"""

import json
import re
import sys
from pathlib import Path

# File extensions to check
CODE_EXTENSIONS = {'.ts', '.tsx', '.js', '.jsx', '.py', '.cs'}

# Files to skip
SKIP_PATTERNS = [
    r'\.min\.',
    r'\.d\.ts$',
    r'node_modules',
    r'__pycache__',
    r'\.test\.',
    r'\.spec\.',
]

# Thresholds
MAX_FUNCTION_LINES = 50
MAX_FUNCTION_PARAMS = 5
MAX_FILE_LINES = 500
DUPLICATE_THRESHOLD = 8  # consecutive identical lines


def should_check_file(filepath):
    """Check if file should be analyzed."""
    if not filepath:
        return False

    path = Path(filepath)

    # Check extension
    if path.suffix.lower() not in CODE_EXTENSIONS:
        return False

    # Check skip patterns
    filepath_str = str(filepath)
    for pattern in SKIP_PATTERNS:
        if re.search(pattern, filepath_str):
            return False

    return True


def read_file(filepath):
    """Read file content."""
    try:
        return Path(filepath).read_text(encoding='utf-8')
    except Exception:
        return None


def check_function_complexity(content, filepath):
    """Check for overly complex functions."""
    violations = []

    # Python function detection
    if filepath.endswith('.py'):
        # Match def function_name(params):
        pattern = r'^(\s*)def\s+(\w+)\s*\(([^)]*)\).*?(?=\n\1(?:def |class |\S)|\Z)'
        for match in re.finditer(pattern, content, re.MULTILINE | re.DOTALL):
            indent = match.group(1)
            func_name = match.group(2)
            params = match.group(3)
            func_body = match.group(0)

            # Count lines
            lines = func_body.count('\n')
            if lines > MAX_FUNCTION_LINES:
                violations.append(
                    f"KISS: Function '{func_name}' has {lines} lines (max {MAX_FUNCTION_LINES})"
                )

            # Count parameters
            param_count = len([p.strip() for p in params.split(',') if p.strip() and p.strip() != 'self'])
            if param_count > MAX_FUNCTION_PARAMS:
                violations.append(
                    f"KISS: Function '{func_name}' has {param_count} parameters (max {MAX_FUNCTION_PARAMS})"
                )

    # TypeScript/JavaScript function detection
    elif filepath.endswith(('.ts', '.tsx', '.js', '.jsx')):
        # Match function declarations and arrow functions
        patterns = [
            r'(?:function|const|let|var)\s+(\w+)\s*[=:]?\s*(?:async\s*)?\(?([^)]*)\)?.*?{',
            r'(\w+)\s*:\s*(?:async\s*)?\(([^)]*)\)\s*(?:=>|{)',
        ]

        for pattern in patterns:
            for match in re.finditer(pattern, content):
                func_name = match.group(1)
                params = match.group(2) if len(match.groups()) > 1 else ''

                # Count parameters (rough estimate)
                param_count = len([p.strip() for p in params.split(',') if p.strip()])
                if param_count > MAX_FUNCTION_PARAMS:
                    violations.append(
                        f"KISS: Function '{func_name}' has {param_count} parameters (max {MAX_FUNCTION_PARAMS})"
                    )

    # C# method detection
    elif filepath.endswith('.cs'):
        pattern = r'(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?[\w<>\[\]]+\s+(\w+)\s*\(([^)]*)\)'
        for match in re.finditer(pattern, content):
            method_name = match.group(1)
            params = match.group(2)

            param_count = len([p.strip() for p in params.split(',') if p.strip()])
            if param_count > MAX_FUNCTION_PARAMS:
                violations.append(
                    f"KISS: Method '{method_name}' has {param_count} parameters (max {MAX_FUNCTION_PARAMS})"
                )

    return violations


def check_duplicate_code(content):
    """Check for duplicate code blocks (basic)."""
    violations = []
    lines = content.split('\n')

    # Skip if file too small
    if len(lines) < DUPLICATE_THRESHOLD * 2:
        return violations

    # Simple duplicate detection: look for repeated line sequences
    seen_blocks = {}
    i = 0
    while i < len(lines) - DUPLICATE_THRESHOLD:
        block = '\n'.join(lines[i:i + DUPLICATE_THRESHOLD])
        # Skip empty or whitespace-only blocks
        if block.strip():
            normalized = re.sub(r'\s+', ' ', block.strip())
            if normalized in seen_blocks:
                violations.append(
                    f"DRY: Duplicate code block ({DUPLICATE_THRESHOLD}+ lines) at lines {seen_blocks[normalized]} and {i + 1}"
                )
            else:
                seen_blocks[normalized] = i + 1
        i += 1

    return violations[:3]  # Limit to 3 violations


def check_yagni(content, filepath):
    """Check for YAGNI violations."""
    violations = []

    # Large commented code blocks
    comment_block_pattern = r'((?:^\s*(?://|#).*\n){10,})'
    matches = re.findall(comment_block_pattern, content, re.MULTILINE)
    if matches:
        violations.append(
            f"YAGNI: Large commented code block detected ({len(matches)} blocks). Remove dead code."
        )

    # TODO/FIXME without action
    todo_count = len(re.findall(r'(?i)\b(TODO|FIXME|HACK|XXX)\b', content))
    if todo_count > 5:
        violations.append(
            f"YAGNI: {todo_count} TODO/FIXME comments. Address or remove stale items."
        )

    return violations


def check_file_size(content):
    """Check if file is too large."""
    violations = []
    lines = content.count('\n') + 1

    if lines > MAX_FILE_LINES:
        violations.append(
            f"KISS: File has {lines} lines (consider splitting, max recommended {MAX_FILE_LINES})"
        )

    return violations


def main():
    # Read hook input from stdin
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    # Get the file path from tool input
    tool_input = input_data.get('tool_input', {})
    filepath = tool_input.get('file_path', '')

    # Check if we should analyze this file
    if not should_check_file(filepath):
        sys.exit(0)

    # Read file content
    content = read_file(filepath)
    if not content:
        sys.exit(0)

    # Run all checks
    all_violations = []
    all_violations.extend(check_function_complexity(content, filepath))
    all_violations.extend(check_duplicate_code(content))
    all_violations.extend(check_yagni(content, filepath))
    all_violations.extend(check_file_size(content))

    # Report violations
    if all_violations:
        print("=" * 60, file=sys.stderr)
        print("CODE QUALITY ISSUES DETECTED", file=sys.stderr)
        print("=" * 60, file=sys.stderr)
        print(f"\nFile: {filepath}", file=sys.stderr)
        print(f"Issues: {len(all_violations)}\n", file=sys.stderr)

        for i, violation in enumerate(all_violations[:10], 1):
            print(f"  {i}. {violation}", file=sys.stderr)

        print("\n" + "-" * 60, file=sys.stderr)
        print("Consider refactoring to improve code quality.", file=sys.stderr)
        print("=" * 60, file=sys.stderr)

        sys.exit(2)  # Feedback to Claude

    sys.exit(0)


if __name__ == '__main__':
    main()
