export const MCP_GATEWAY_VERSION = 'gbap.mcp.v1';

const tools = [
  {
    name: 'crm_company_list',
    title: 'List customer companies',
    description: 'List customer companies visible to the signed-in GBAP user. Supports bounded text search.',
    target: { kind: 'CAPABILITY', capability: 'crm.v1.account.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
        query: { type: 'string', minLength: 1, maxLength: 512 },
      },
    },
  },
  {
    name: 'crm_contact_list',
    title: 'List contacts',
    description: 'List CRM contacts visible to the signed-in GBAP user.',
    target: { kind: 'CAPABILITY', capability: 'crm.v1.contact.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
      },
    },
  },
  {
    name: 'crm_opportunity_list',
    title: 'List opportunities',
    description: 'List CRM opportunities visible to the signed-in GBAP user.',
    target: { kind: 'CAPABILITY', capability: 'crm.v1.opportunity.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
      },
    },
  },
  {
    name: 'crm_task_list',
    title: 'List CRM tasks',
    description: 'List CRM follow-up tasks visible to the signed-in GBAP user.',
    target: { kind: 'CAPABILITY', capability: 'crm.ops.v1.task.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
      },
    },
  },
  {
    name: 'crm_note_list',
    title: 'List CRM notes',
    description: 'List CRM notes visible to the signed-in GBAP user.',
    target: { kind: 'CAPABILITY', capability: 'crm.ops.v1.note.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
      },
    },
  },
  {
    name: 'crm_activity_list',
    title: 'List CRM activity',
    description: 'List CRM task and note activity visible to the signed-in GBAP user.',
    target: { kind: 'CAPABILITY', capability: 'crm.ops.v1.activity.list' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
      },
    },
  },
  {
    name: 'knowledge_search',
    title: 'Search enterprise knowledge',
    description: 'Search only enterprise knowledge the signed-in GBAP user is authorized to read. Results preserve canonical source citations.',
    target: { kind: 'NATIVE', method: 'POST', path: '/api/knowledge/search' },
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 4000 },
        collectionIds: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', minLength: 1, maxLength: 255 },
        },
        topK: { type: 'integer', minimum: 1, maximum: 12, default: 6 },
        minimumScore: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
  },
];

const byName = new Map(tools.map((tool) => [tool.name, Object.freeze(tool)]));

export function listMcpTools() {
  return tools.map(({ target: _target, ...tool }) => ({
    ...tool,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  }));
}

export function getMcpTool(name) {
  return byName.get(name) ?? null;
}

// Enforce the published schemas at the gateway, before any business API call.
// This registry intentionally uses only the bounded JSON Schema subset below.
export function validateMcpArguments(tool, value = {}) {
  function check(schema, input, path) {
    if (schema.type === 'object') {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(`invalid_argument:${path}`);
      const result = {};
      for (const name of Object.keys(input)) {
        if (!Object.hasOwn(schema.properties ?? {}, name)) throw new Error(`unknown_argument:${path}.${name}`);
      }
      for (const [name, property] of Object.entries(schema.properties ?? {})) {
        if (!Object.hasOwn(input, name)) {
          if (schema.required?.includes(name)) throw new Error(`missing_argument:${path}.${name}`);
          if (property.default !== undefined) result[name] = property.default;
        } else result[name] = check(property, input[name], `${path}.${name}`);
      }
      return result;
    }
    if (schema.type === 'array') {
      if (!Array.isArray(input) || input.length > schema.maxItems) throw new Error(`invalid_argument:${path}`);
      return input.map((item, index) => check(schema.items, item, `${path}[${index}]`));
    }
    if (schema.type === 'string') {
      if (typeof input !== 'string') throw new Error(`invalid_argument:${path}`);
      const result = input.trim();
      if (result.length < (schema.minLength ?? 0) || result.length > schema.maxLength) throw new Error(`invalid_argument:${path}`);
      return result;
    }
    if (!Number.isFinite(input) || (schema.type === 'integer' && !Number.isInteger(input))
      || input < schema.minimum || input > schema.maximum) throw new Error(`invalid_argument:${path}`);
    return input;
  }
  return check(tool.inputSchema, value, 'arguments');
}
