import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://betterr.me';

const handler = protectedResourceHandler({
  authServerUrls: [BASE_URL],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
