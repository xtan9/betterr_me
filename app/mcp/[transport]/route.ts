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
  { basePath: "/mcp" },
);

const authHandler = withMcpAuth(handler, verifyMcpAuth, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
