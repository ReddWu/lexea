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
                  schema: {
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
                },
              },
            },
          },
        },
      },
    },
    security: [{ apiKey: [] }],
    components: {
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
