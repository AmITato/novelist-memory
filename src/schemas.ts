// ─── JSON Schemas for Structured Output ─────────────────────────────────────
// These schemas are used with response_format: { type: 'json_schema' } to get
// provider-level constrained decoding. The model literally cannot produce
// malformed JSON — the tokenizer refuses to emit invalid tokens.
//
// OpenAI strict mode rules:
//   - Every object must have additionalProperties: false
//   - Every property must be in `required` (use type union with null for optional)
//   - No default values
//   - Root must be { type: 'object' }

// ─── WhiteboardDelta Schema ─────────────────────────────────────────────────
// Used by: updater (normal + rebuild), update_whiteboard tool

export const whiteboardDeltaSchema = {
  name: 'whiteboard_delta',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['chronicle', 'threads', 'hearts', 'palette', 'canon', 'authorNotes'],
    properties: {
      chronicle: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['add', 'update'],
        properties: {
          add: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id', 'timestamp', 'location', 'summary', 'charactersPresent', 'emotionalStates', 'sensoryContext', 'verbatimDialogue', 'sourceMessageRange'],
              properties: {
                id: { type: 'string' as const },
                timestamp: { type: 'string' as const },
                location: { type: 'string' as const },
                summary: { type: 'string' as const },
                charactersPresent: { type: 'array' as const, items: { type: 'string' as const } },
                emotionalStates: {
                  type: 'object' as const,
                  additionalProperties: { type: 'string' as const },
                },
                sensoryContext: { type: 'string' as const },
                verbatimDialogue: { type: ['array', 'null'] as const, items: { type: 'string' as const } },
                sourceMessageRange: {
                  type: ['array', 'null'] as const,
                  items: { type: 'number' as const },
                },
              },
            },
          },
          update: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id'],
              properties: {
                id: { type: 'string' as const },
                timestamp: { type: 'string' as const },
                location: { type: 'string' as const },
                summary: { type: 'string' as const },
                charactersPresent: { type: 'array' as const, items: { type: 'string' as const } },
                emotionalStates: {
                  type: 'object' as const,
                  additionalProperties: { type: 'string' as const },
                },
                sensoryContext: { type: 'string' as const },
                verbatimDialogue: { type: 'array' as const, items: { type: 'string' as const } },
                sourceMessageRange: {
                  type: 'array' as const,
                  items: { type: 'number' as const },
                },
              },
            },
          },
        },
      },
      threads: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['add', 'update'],
        properties: {
          add: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id', 'name', 'status', 'lastTouched', 'summary', 'dependencies', 'triggerConditions', 'downstreamConsequences'],
              properties: {
                id: { type: 'string' as const },
                name: { type: 'string' as const },
                status: { type: 'string' as const, enum: ['ACTIVE', 'DORMANT', 'SEEDED', 'RESOLVED'] },
                lastTouched: { type: 'string' as const },
                summary: { type: 'string' as const },
                dependencies: { type: 'array' as const, items: { type: 'string' as const } },
                triggerConditions: { type: 'array' as const, items: { type: 'string' as const } },
                downstreamConsequences: { type: 'array' as const, items: { type: 'string' as const } },
              },
            },
          },
          update: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id'],
              properties: {
                id: { type: 'string' as const },
                name: { type: 'string' as const },
                status: { type: 'string' as const, enum: ['ACTIVE', 'DORMANT', 'SEEDED', 'RESOLVED'] },
                lastTouched: { type: 'string' as const },
                summary: { type: 'string' as const },
                dependencies: { type: 'array' as const, items: { type: 'string' as const } },
                triggerConditions: { type: 'array' as const, items: { type: 'string' as const } },
                downstreamConsequences: { type: 'array' as const, items: { type: 'string' as const } },
              },
            },
          },
        },
      },
      hearts: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['add', 'update'],
        properties: {
          add: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id', 'from', 'to', 'status', 'keyKnowledge', 'processing', 'sensoryMemories', 'unresolved', 'nextBeat'],
              properties: {
                id: { type: 'string' as const },
                from: { type: 'string' as const },
                to: { type: 'string' as const },
                status: { type: 'string' as const },
                keyKnowledge: { type: 'array' as const, items: { type: 'string' as const } },
                processing: { type: 'string' as const },
                sensoryMemories: { type: 'array' as const, items: { type: 'string' as const } },
                unresolved: { type: 'array' as const, items: { type: 'string' as const } },
                nextBeat: { type: 'string' as const },
              },
            },
          },
          update: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['id'],
              properties: {
                id: { type: 'string' as const },
                from: { type: 'string' as const },
                to: { type: 'string' as const },
                status: { type: 'string' as const },
                keyKnowledge: { type: 'array' as const, items: { type: 'string' as const } },
                processing: { type: 'string' as const },
                sensoryMemories: { type: 'array' as const, items: { type: 'string' as const } },
                unresolved: { type: 'array' as const, items: { type: 'string' as const } },
                nextBeat: { type: 'string' as const },
              },
            },
          },
        },
      },
      palette: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['formattingAssignments', 'voiceNotes', 'sensorySignatures', 'fragileDetails'],
        properties: {
          formattingAssignments: {
            type: ['object', 'null'] as const,
            additionalProperties: { type: 'string' as const },
          },
          voiceNotes: {
            type: ['object', 'null'] as const,
            additionalProperties: { type: 'string' as const },
          },
          sensorySignatures: {
            type: ['object', 'null'] as const,
            additionalProperties: { type: 'string' as const },
          },
          fragileDetails: {
            type: ['array', 'null'] as const,
            items: { type: 'string' as const },
          },
        },
      },
      canon: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['timelinePosition', 'completedEvents', 'upcomingEvents', 'butterflyLog'],
        properties: {
          timelinePosition: { type: ['string', 'null'] as const },
          completedEvents: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['event', 'deviations', 'foreshadowingNeeded'],
              properties: {
                event: { type: 'string' as const },
                deviations: { type: ['string', 'null'] as const },
                foreshadowingNeeded: { type: ['string', 'null'] as const },
              },
            },
          },
          upcomingEvents: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['event', 'deviations', 'foreshadowingNeeded'],
              properties: {
                event: { type: 'string' as const },
                deviations: { type: ['string', 'null'] as const },
                foreshadowingNeeded: { type: ['string', 'null'] as const },
              },
            },
          },
          butterflyLog: {
            type: ['array', 'null'] as const,
            items: {
              type: 'object' as const,
              additionalProperties: false,
              required: ['change', 'projectedConsequences'],
              properties: {
                change: { type: 'string' as const },
                projectedConsequences: { type: 'string' as const },
              },
            },
          },
        },
      },
      authorNotes: {
        type: ['object', 'null'] as const,
        additionalProperties: false,
        required: ['add', 'remove'],
        properties: {
          add: { type: ['array', 'null'] as const, items: { type: 'string' as const } },
          remove: { type: ['array', 'null'] as const, items: { type: 'number' as const } },
        },
      },
    },
  },
}

// ─── Intern Selection Schema ────────────────────────────────────────────────
// Used by: intern scene retrieval (step 1 — identify relevant messages)

export const internSelectionSchema = {
  name: 'intern_selection',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['intent', 'selectedMessages', 'searchNotes'],
    properties: {
      intent: { type: 'string' as const },
      selectedMessages: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          additionalProperties: false,
          required: ['messageIndex', 'messageId', 'relevanceNote', 'priority'],
          properties: {
            messageIndex: { type: 'number' as const },
            messageId: { type: 'string' as const },
            relevanceNote: { type: 'string' as const },
            priority: { type: 'number' as const },
          },
        },
      },
      searchNotes: { type: 'string' as const },
    },
  },
}

// ─── Intern Annotation Schema ───────────────────────────────────────────────
// Used by: intern scene annotation (step 3 — annotate each retrieved scene)

export const internAnnotationSchema = {
  name: 'intern_annotation',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['annotation', 'keyDetails', 'emotionalContext'],
    properties: {
      annotation: { type: 'string' as const },
      keyDetails: { type: 'array' as const, items: { type: 'string' as const } },
      emotionalContext: { type: 'string' as const },
    },
  },
}

// ─── Archive Metadata Schema ────────────────────────────────────────────────
// Used by: archive metadata extraction for messages leaving the sliding window

export const archiveMetadataSchema = {
  name: 'archive_metadata',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['inStoryTimestamp', 'charactersPresent', 'sceneDescriptor', 'emotionalRegister', 'activeThreads'],
    properties: {
      inStoryTimestamp: { type: ['string', 'null'] as const },
      charactersPresent: { type: 'array' as const, items: { type: 'string' as const } },
      sceneDescriptor: { type: 'string' as const },
      emotionalRegister: { type: 'string' as const },
      activeThreads: { type: 'array' as const, items: { type: 'string' as const } },
    },
  },
}

// ─── Chronicle Compaction Schema ────────────────────────────────────────────
// Used by: compaction pipeline — compresses old chronicle entries

export const chronicleCompactionSchema = {
  name: 'chronicle_compaction',
  strict: true,
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    required: ['summary', 'emotionalStates', 'keyDialogue'],
    properties: {
      summary: { type: 'string' as const },
      emotionalStates: {
        type: 'object' as const,
        additionalProperties: { type: 'string' as const },
      },
      keyDialogue: {
        type: ['array', 'null'] as const,
        items: { type: 'string' as const },
      },
    },
  },
}

// ─── Helper: Build response_format parameter ────────────────────────────────
// Wraps a schema definition into the OpenAI-compatible response_format object
// that OpenRouter forwards to providers supporting constrained decoding.

export function jsonSchemaResponseFormat(schema: { name: string, strict: boolean, schema: object }) {
  return {
    type: 'json_schema' as const,
    json_schema: schema,
  }
}
