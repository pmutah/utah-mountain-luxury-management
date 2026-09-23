import { listMuseTools } from './catalog';

export function museUmlOpenApiSpec() {
  const tools = listMuseTools();
  const toolNames = tools.map((t) => t.name);
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
    paths: {
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
