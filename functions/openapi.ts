// openapi edge function — serves the Action's OpenAPI spec as JSON so a
// ChatGPT Custom GPT can import it via URL (avoids mobile copy-paste mangling).
// GET {oss_host}/functions/openapi
export default async function (_req: Request): Promise<Response> {
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Vocab Weak Words",
      description: "Fetch the learner's weakest English vocabulary, ranked weakest-first.",
      version: "1.0.0",
    },
    servers: [{ url: "https://w9jmt9y8.us-east.insforge.app" }],
    paths: {
      "/functions/weak-words": {
        get: {
          operationId: "getWeakWords",
          summary: "Get the learner's weakest English words (ranked weakest-first).",
          parameters: [
            {
              name: "n",
              in: "query",
              required: false,
              description: "How many words to return (max 100).",
              schema: { type: "integer", default: 30, maximum: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Ranked weak words with example sentences.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/WeakWordsResponse" },
                },
              },
            },
          },
        },
      },
      "/functions/add-word": {
        post: {
          operationId: "addWord",
          summary: "Save an English word the user asked about into their vocabulary list.",
          description:
            "Call this when the user asks about / wants to learn a single English word that is not already in their list, so it joins future practice.",
          "x-openai-isConsequential": false,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AddWordRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Whether the word was added.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AddWordResponse" },
                },
              },
            },
          },
        },
      },
    },
    security: [{ apiKey: [] }],
    components: {
      schemas: {
        WeakWordsResponse: {
          type: "object",
          properties: {
            count: { type: "integer" },
            words: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  word: { type: "string" },
                  context: { type: "string" },
                  lapses: { type: "integer" },
                  reps: { type: "integer" },
                  due: { type: "string" },
                  state: { type: "string" },
                },
              },
            },
          },
        },
        AddWordRequest: {
          type: "object",
          required: ["word"],
          properties: {
            word: { type: "string", description: "A single English word." },
            context: { type: "string", description: "An example sentence using the word (optional)." },
            translation: { type: "string", description: "A short meaning/gloss (optional)." },
          },
        },
        AddWordResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            added: { type: "boolean", description: "true if newly added, false if it already existed." },
            word: { type: "string" },
          },
        },
      },
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
      },
    },
  };

  return new Response(JSON.stringify(spec), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
