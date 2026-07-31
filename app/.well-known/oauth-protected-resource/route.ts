import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

import { getOAuthIssuer } from '@/lib/oauth/access-token';

const handler = protectedResourceHandler({
  authServerUrls: [getOAuthIssuer()],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
