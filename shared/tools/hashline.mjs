#!/usr/bin/env node
// hashline.mjs -- Hash-verified file editing CLI tool
// Zero dependencies, Node.js built-ins only

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

// --- Helpers ---

function lineHash(content) {
  return createHash('md5').update(content).digest('hex').slice(0, 4);
}

function parseAnchor(anchor) {
  const m = anchor.match(/^(\d+):([0-9a-f]{4})$/);
  if (!m) {
    process.stderr.write(`Invalid anchor format: ${anchor}\n`);
    process.exit(1);
  }
  return { line: parseInt(m[1], 10), hash: m[2] };
}

function readLines(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    process.stderr.write(`File not found: ${abs}\n`);
    process.exit(1);
  }
  const raw = readFileSync(abs, 'utf-8');
  // split preserving every line; handle trailing newline
  const lines = raw.split('\n');
  // If file ends with newline, split produces a trailing empty string -- keep it
  // to round-trip correctly, but we treat total as the meaningful line count.
  return lines;
}

function fuzzyFind(lines, lineNum, expectedHash) {
  // Exact match first
  const idx = lineNum - 1;
  if (idx < 0 || idx >= lines.length) {
    process.stderr.write(`Line ${lineNum} out of range (file has ${lines.length} lines)\n`);
    process.exit(1);
  }
  const actual = lineHash(lines[idx]);
  if (actual === expectedHash) return idx;

  // Fuzzy: search nearby lines (+-5) for matching hash
  // Handles indent changes, inserted/deleted lines
  const searchRadius = 5;
  for (let delta = 1; delta <= searchRadius; delta++) {
    for (const d of [delta, -delta]) {
      const candidate = idx + d;
      if (candidate >= 0 && candidate < lines.length) {
        if (lineHash(lines[candidate]) === expectedHash) {
          process.stderr.write(
            `FUZZY: anchor ${lineNum}:${expectedHash} found at line ${candidate + 1} (shifted by ${d})\n`
          );
          return candidate;
        }
      }
    }
  }

  // Whitespace-tolerant: compare stripped content
  const stripped = lines[idx].replace(/\s+/g, '');
  for (let j = Math.max(0, idx - searchRadius); j < Math.min(lines.length, idx + searchRadius + 1); j++) {
    if (lines[j].replace(/\s+/g, '') === stripped && stripped.length > 0) {
      const jHash = lineHash(lines[j]);
      if (jHash === expectedHash) {
        process.stderr.write(
          `FUZZY: anchor ${lineNum}:${expectedHash} matched via whitespace normalization at line ${j + 1}\n`
        );
        return j;
      }
    }
  }

  process.stderr.write(
    `HASH MISMATCH at line ${lineNum}: expected ${expectedHash}, got ${actual}\n` +
    `  Content: ${lines[idx].slice(0, 80)}\n` +
    `  Searched +-${searchRadius} lines, no fuzzy match found.\n`
  );
  process.exit(1);
}

function verifyHash(lines, lineNum, expectedHash) {
  return fuzzyFind(lines, lineNum, expectedHash);
}

// --- Commands ---

function cmdRead(args) {
  const filePath = args[0];
  if (!filePath) {
    process.stderr.write('Usage: hashline.mjs read <file> [--offset N] [--limit N]\n');
    process.exit(1);
  }

  let offset = 0;
  let limit = 0;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--offset' && args[i + 1]) {
      offset = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    }
  }

  const lines = readLines(filePath);
  // total meaningful lines: if file ends with newline, last element is empty
  const total = lines.length;

  const startIdx = offset;
  const endIdx = limit > 0 ? Math.min(startIdx + limit, total) : total;

  const startLine = startIdx + 1;
  const endLine = endIdx;

  process.stdout.write(`File: ${resolve(filePath)} (${total} lines) [showing lines ${startLine}-${endLine}]\n`);

  for (let i = startIdx; i < endIdx; i++) {
    const num = i + 1;
    const hash = lineHash(lines[i]);
    process.stdout.write(`${num}:${hash}|${lines[i]}\n`);
  }
}

function cmdEdit(args) {
  const filePath = args[0];
  if (!filePath) {
    process.stderr.write('Usage: hashline.mjs edit <file> --edits \'<JSON>\' | --edits-file <path>\n');
    process.exit(1);
  }

  let editsRaw = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--edits' && args[i + 1]) {
      editsRaw = args[i + 1];
      i++;
    } else if (args[i] === '--edits-file' && args[i + 1]) {
      const ef = resolve(args[i + 1]);
      if (!existsSync(ef)) {
        process.stderr.write(`Edits file not found: ${ef}\n`);
        process.exit(1);
      }
      editsRaw = readFileSync(ef, 'utf-8');
      i++;
    }
  }

  if (!editsRaw) {
    process.stderr.write('No edits provided. Use --edits or --edits-file.\n');
    process.exit(1);
  }

  let edits;
  try {
    edits = JSON.parse(editsRaw);
  } catch (e) {
    process.stderr.write(`Invalid JSON: ${e.message}\n`);
    process.exit(1);
  }

  if (!Array.isArray(edits) || edits.length === 0) {
    process.stderr.write('Edits must be a non-empty JSON array.\n');
    process.exit(1);
  }

  const lines = readLines(filePath);

  // Assign sort key (highest line first for bottom-to-top application)
  const sorted = edits.map((edit) => {
    if (edit.anchor) {
      const a = parseAnchor(edit.anchor);
      return { ...edit, _sortLine: a.line };
    } else if (edit.start && edit.end) {
      const s = parseAnchor(edit.start);
      return { ...edit, _sortLine: s.line };
    } else if (edit.after) {
      const a = parseAnchor(edit.after);
      return { ...edit, _sortLine: a.line };
    } else {
      process.stderr.write(`Invalid edit entry: ${JSON.stringify(edit)}\n`);
      process.exit(1);
    }
  });

  // Sort bottom-to-top (descending by line number)
  sorted.sort((a, b) => b._sortLine - a._sortLine);

  for (const edit of sorted) {
    if (edit.anchor) {
      // Single line replace or delete
      const { line, hash } = parseAnchor(edit.anchor);
      const resolvedIdx = verifyHash(lines, line, hash);
      if (edit.text === '' || edit.text === undefined) {
        lines.splice(resolvedIdx, 1);
      } else {
        lines[resolvedIdx] = edit.text;
      }
    } else if (edit.start && edit.end) {
      // Range replace
      const s = parseAnchor(edit.start);
      const e = parseAnchor(edit.end);
      const startIdx = verifyHash(lines, s.line, s.hash);
      const endIdx = verifyHash(lines, e.line, e.hash);
      const count = endIdx - startIdx + 1;
      if (edit.text === '' || edit.text === undefined) {
        lines.splice(startIdx, count);
      } else {
        const newLines = edit.text.split('\n');
        lines.splice(startIdx, count, ...newLines);
      }
    } else if (edit.after) {
      // Insert after
      const { line, hash } = parseAnchor(edit.after);
      const resolvedIdx = verifyHash(lines, line, hash);
      const newLines = edit.text.split('\n');
      lines.splice(resolvedIdx + 1, 0, ...newLines);
    }
  }

  const abs = resolve(filePath);
  writeFileSync(abs, lines.join('\n'), 'utf-8');
  process.stdout.write(`OK: ${abs} updated (${lines.length} lines)\n`);
}

function cmdGrep(args) {
  let pattern = null;
  let searchPath = '.';
  let glob = null;
  let limit = 0;
  let ctxBefore = 0;
  let ctxAfter = 0;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--glob' && args[i + 1]) {
      glob = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '-B' && args[i + 1]) {
      ctxBefore = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '-A' && args[i + 1]) {
      ctxAfter = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '-C' && args[i + 1]) {
      ctxBefore = ctxAfter = parseInt(args[i + 1], 10);
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  pattern = positional[0] || null;
  if (positional[1]) searchPath = positional[1];

  if (!pattern) {
    process.stderr.write('Usage: hashline.mjs grep <pattern> [path] [--glob "*.ts"] [--limit N]\n');
    process.exit(1);
  }

  let cmd = `rg -n --no-heading --with-filename "${pattern.replace(/"/g, '\\"')}" "${resolve(searchPath)}"`;
  if (glob) {
    cmd += ` --glob "${glob}"`;
  }
  if (limit > 0) {
    cmd += ` --max-count ${limit}`;
  }
  if (ctxBefore > 0) {
    cmd += ` -B ${ctxBefore}`;
  }
  if (ctxAfter > 0) {
    cmd += ` -A ${ctxAfter}`;
  }

  let output;
  try {
    output = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch (e) {
    if (e.status === 1) {
      // No matches
      process.stdout.write('No matches found.\n');
      return;
    }
    if (e.status === 2 || (e.message && e.message.includes('ENOENT'))) {
      process.stderr.write('rg (ripgrep) not found. Install ripgrep to use grep command.\n');
      process.exit(2);
    }
    process.stderr.write(`rg error: ${e.message}\n`);
    process.exit(1);
  }

  // rg output: file:line:content
  // Windows paths may start with drive letter (e.g., D:\path:42:content)
  // Use regex that accounts for optional drive prefix
  const resultLines = output.split('\n');
  for (const rl of resultLines) {
    if (!rl) continue;
    const match = rl.match(/^((?:[A-Za-z]:)?[^:]*):(\d+):(.*)$/);
    if (match) {
      const [, file, lineNum, content] = match;
      const hash = lineHash(content);
      process.stdout.write(`${file}:${lineNum}:${hash}|${content}\n`);
    } else {
      process.stdout.write(rl + '\n');
    }
  }
}

// --- Main ---

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case 'read':
    cmdRead(rest);
    break;
  case 'edit':
    cmdEdit(rest);
    break;
  case 'grep':
    cmdGrep(rest);
    break;
  default:
    process.stderr.write(
      'hashline.mjs -- Hash-verified file editing\n\n' +
      'Commands:\n' +
      '  read <file> [--offset N] [--limit N]   Read file with line hashes\n' +
      '  edit <file> --edits <JSON>              Apply hash-verified edits\n' +
      '  edit <file> --edits-file <path>         Apply edits from JSON file\n' +
      '  grep <pattern> [path] [--glob] [--limit]  Search with ripgrep\n'
    );
    process.exit(1);
}
