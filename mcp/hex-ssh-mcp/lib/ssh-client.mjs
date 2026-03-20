/**
 * SSH client for remote command execution.
 * Supports RSA/ED25519/ECDSA private keys.
 * Security: ALLOWED_HOSTS env var restricts target hosts.
 */

import { Client } from "ssh2";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const DEFAULT_KEY_PATHS = [
    join(homedir(), ".ssh", "id_rsa"),
    join(homedir(), ".ssh", "id_ed25519"),
    join(homedir(), ".ssh", "id_ecdsa"),
];

const CONNECT_TIMEOUT = 20000;
const KEEPALIVE_INTERVAL = 30000;

/**
 * Validate host against ALLOWED_HOSTS env.
 * If ALLOWED_HOSTS is set, only listed hosts are permitted.
 */
function validateHost(host) {
    const allowed = process.env.ALLOWED_HOSTS;
    if (!allowed) return;
    const list = allowed.split(",").map((h) => h.trim().toLowerCase());
    if (!list.includes(host.toLowerCase())) {
        throw new Error(
            `Host "${host}" not in ALLOWED_HOSTS. Permitted: ${list.join(", ")}`
        );
    }
}

/**
 * Validate remote path against ALLOWED_DIRS env.
 * If ALLOWED_DIRS is set, only paths under listed dirs are permitted.
 */
export function validateRemotePath(filePath) {
    const allowed = process.env.ALLOWED_DIRS;
    if (!allowed) return;
    const dirs = allowed.split(",").map((d) => d.trim());
    const normalized = filePath.replace(/\/+$/, "");
    const ok = dirs.some((dir) => {
        const nd = dir.replace(/\/+$/, "");
        return normalized === nd || normalized.startsWith(nd + "/");
    });
    if (!ok) {
        throw new Error(
            `Path "${filePath}" not under ALLOWED_DIRS. Permitted: ${dirs.join(", ")}`
        );
    }
}

/**
 * Get private key from explicit path, env var, or default locations.
 */
function getPrivateKey(keyPath) {
    if (keyPath) {
        try { return readFileSync(keyPath); }
        catch (e) { throw new Error(`Cannot read key: ${keyPath} (${e.message})`); }
    }

    const envKey = process.env.SSH_PRIVATE_KEY;
    if (envKey) {
        // Env var can be a path or the key content itself
        if (envKey.startsWith("-----")) return Buffer.from(envKey);
        try { return readFileSync(envKey); }
        catch { /* fall through to defaults */ }
    }

    for (const p of DEFAULT_KEY_PATHS) {
        try { return readFileSync(p); }
        catch { continue; }
    }

    throw new Error(
        "No SSH private key found. Provide privateKeyPath, set SSH_PRIVATE_KEY, " +
        `or place key at: ${DEFAULT_KEY_PATHS.join(", ")}`
    );
}

/**
 * Execute a command on a remote host via SSH.
 *
 * @param {object} opts
 * @param {string} opts.host - Remote hostname or IP
 * @param {string} opts.user - SSH username
 * @param {string} opts.command - Shell command to execute
 * @param {string} [opts.privateKeyPath] - Path to private key
 * @param {number} [opts.port=22] - SSH port
 * @returns {Promise<{output: string, error: string|null, exitCode: number}>}
 */
export function executeCommand({ host, user, command, privateKeyPath, port = 22 }) {
    validateHost(host);

    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = "";
        let stderr = "";

        let privateKey;
        try {
            privateKey = getPrivateKey(privateKeyPath);
        } catch (e) {
            return reject(e);
        }

        conn.on("ready", () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(new Error(`Exec failed: ${err.message}`));
                }
                stream.on("close", (code) => {
                    conn.end();
                    resolve({
                        output: stdout.trim(),
                        error: stderr.trim() || null,
                        exitCode: code || 0,
                    });
                });
                stream.on("data", (data) => { stdout += data.toString(); });
                stream.stderr.on("data", (data) => { stderr += data.toString(); });
            });
        });

        conn.on("error", (err) => {
            reject(new Error(`SSH connection to ${host}:${port} failed: ${err.message}`));
        });

        conn.connect({
            host,
            port,
            username: user,
            privateKey,
            algorithms: {
                kex: [
                    "ecdh-sha2-nistp256",
                    "ecdh-sha2-nistp384",
                    "ecdh-sha2-nistp521",
                    "diffie-hellman-group14-sha256",
                ],
            },
            readyTimeout: CONNECT_TIMEOUT,
            keepaliveInterval: KEEPALIVE_INTERVAL,
        });
    });
}
