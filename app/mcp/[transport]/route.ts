import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyMcpAuth } from "@/lib/mcp/token";
import { registerTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  {
    capabilities: {
      tools: {},
    },
  },
  { basePath: "/mcp", maxDuration: 60 },
);

// TODO: Re-enable auth after confirming MCP connection works
// const authHandler = withMcpAuth(handler, verifyMcpAuth, {
//   required: true,
//   resourceMetadataPath: "/.well-known/oauth-protected-resource",
// });

// Vercel hobby plan allows up to 60s for streaming responses
export const maxDuration = 60;

export { handler as GET, handler as POST, handler as DELETE };
