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

// TODO: Re-enable auth after confirming MCP connection works
// const authHandler = withMcpAuth(handler, verifyMcpAuth, {
//   required: true,
//   resourceMetadataPath: "/.well-known/oauth-protected-resource",
// });

export { handler as GET, handler as POST, handler as DELETE };
