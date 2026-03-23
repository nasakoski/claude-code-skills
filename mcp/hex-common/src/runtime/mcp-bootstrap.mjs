export async function createServerRuntime({ name, version, installDir }) {
    let McpServer, StdioServerTransport;
    try {
        ({ McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js"));
        ({ StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js"));
    } catch {
        process.stderr.write(
            `${name}: @modelcontextprotocol/sdk not found.\n` +
            `Run: cd ${installDir} && npm install\n`
        );
        process.exit(1);
    }

    return {
        server: new McpServer({ name, version }),
        StdioServerTransport,
    };
}
