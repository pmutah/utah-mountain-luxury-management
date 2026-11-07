import { listMuseTools } from './catalog';
import { PUBLIC_TOKEN_ROUTES, botRoutes, guarded, ok, written, type BotRoute } from './routes';

/** One OpenAPI path item from a documented bot route. */
function pathItem(route: BotRoute) {
  const params = route.param
    ? [
        {
          name: route.param,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ]
    : [];
  return {
    [route.method]: {
      operationId: route.operationId,
      summary: route.summary,
      ...(route.note ? { description: route.note } : {}),
      ...(params.length > 0 ? { parameters: params } : {}),
      ...(route.public ? { security: [] } : {}),
      responses: route.writes ? written : guarded,
    },
  };
}

/** The token-in-the-path routes a guest or a cleaner opens with no login. */
function publicPathItem(summary: string, path: string, description: string) {
  const name = path.split('/').filter(Boolean).pop() ?? 'token';
  return {
    get: {
      operationId: `getPublic${name.charAt(0).toUpperCase()}${name.slice(1).replace(/[^a-zA-Z0-9]/g, '')}`,
      summary,
      description,
      security: [],
      parameters: [{ name, in: 'path', required: true, schema: { type: 'string' } }],
      responses: { ...ok, '404': { description: 'The token is not valid' } },
    },
  };
}

export function museUmlOpenApiSpec() {
  const tools = listMuseTools();
  const toolNames = tools.map((t) => t.name);
  const documented: Record<string, unknown> = {};
  for (const route of botRoutes()) {
    const existing = (documented[route.path] ?? {}) as Record<string, unknown>;
    documented[route.path] = { ...existing, ...pathItem(route) };
  }
  for (const path of PUBLIC_TOKEN_ROUTES) {
    documented[path] = publicPathItem(
      path.includes('owner')
        ? "Todd's read-only Ranch and River statement"
        : path.includes('clean')
          ? "The cleaner's job list"
          : 'A guest stay page or preference form',
      path,
      'The token in the path is the whole credential. No bearer and no cookie are needed.',
    );
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Muse — Utah Mountain Luxury full management API',
      version: '1.0.0',
      description:
        'Full Utah Mountain Luxury control for Muse and Amanda. GET /api/muse/tools or /api/amanda/tools for parameter schemas. POST either tools route to run co-host tools, construction tools, or dashboard_request for every other /api route. The same bearer authenticates every /api/* REST route. GET /api/muse/instructions or /api/amanda/instructions for standing rules.',
    },
    servers: [{ url: 'https://wilhite-portfolio.pages.dev' }],
    security: [{ MuseBearer: [] }],
    components: {
      securitySchemes: {
        MuseBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'MUSE_BOT_SECRET or AMANDA_BOT_SECRET',
        },
      },
      schemas: {
        RunToolRequest: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', enum: toolNames },
            arguments: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
    'x-uml-tools': tools,
    'x-uml-documented-routes': botRoutes().map((route) => `${route.method.toUpperCase()} ${route.path}`),
    'x-uml-public-routes': PUBLIC_TOKEN_ROUTES,
    'x-uml-note':
      'x-uml-documented-routes is the same list GET /api/agent/map describes. A route that is not there is not documented and may not exist.',
    paths: {
      ...documented,
      '/api/muse/instructions': {
        get: {
          operationId: 'getMuseInstructions',
          security: [],
          summary: 'Standing UML operating rules',
          responses: { '200': { description: 'Plain text' } },
        },
      },
      '/api/muse/tools': {
        get: {
          operationId: 'listUmlTools',
          summary: 'List co-host + construction tools with JSON-schema parameters',
          responses: { '200': { description: 'Tool catalog' } },
        },
        post: {
          operationId: 'runUmlTool',
          summary: 'Run any UML agent tool',
          description: `Tools: ${toolNames.join(', ')}`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RunToolRequest' },
              },
            },
          },
          responses: {
            '200': { description: 'Tool result' },
            '400': { description: 'Unknown tool or execution error' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
    },
  };
}
