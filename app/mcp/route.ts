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
  {
    streamableHttpEndpoint: "/mcp",
    maxDuration: 60,
  },
);

const authHandler = withMcpAuth(handler, verifyMcpAuth, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

// Vercel hobby plan allows up to 60s for streaming responses
export const maxDuration = 60;

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
