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
        'Full Utah Mountain Luxury control for Muse and Amanda. POST /api/muse/do or /api/amanda/do with a plain-language message and the site does the work. POST /api/muse/tools runs one named tool. Do not use the website.',
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
      '/api/muse/do': {
        post: {
          operationId: 'doUmlRequest',
          summary: 'Tell Utah Mountain Luxury what to do in plain language. It runs the tools and returns the result.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string', description: 'What Brandon asked, in plain language.' },
                    runId: { type: 'string', description: 'Previous runId to continue the same conversation.' },
                  },
                },
              },
            },
          },
          responses: {
            '200': { description: 'What the site did' },
            '400': { description: 'Missing message' },
            '401': { description: 'Unauthorized' },
          },
        },
      },
      '/api/amanda/do': {
        post: {
          operationId: 'doUmlRequestAmanda',
          summary: 'Same as /api/muse/do, for Amanda.',
          responses: { '200': { description: 'What the site did' } },
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
