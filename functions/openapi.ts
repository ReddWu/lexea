// openapi edge function — serves the Action's OpenAPI spec as JSON so a
// ChatGPT Custom GPT can import it via URL (avoids mobile copy-paste mangling).
// GET {oss_host}/functions/openapi
export default async function (req: Request): Promise<Response> {
  // The spec's servers.url must be this project's PUBLIC oss_host (where the
  // weak-words / add-word endpoints live). Set it as a secret so any fork works
  // without editing code: `insforge secrets add PUBLIC_OSS_HOST https://<appkey>.<region>.insforge.app`.
  // Falls back to forwarded host (may be the internal Deno host on some setups).
  const fwdHost = req.headers.get("x-forwarded-host");
  const fwdProto = req.headers.get("x-forwarded-proto") || "https";
  const origin =
    (Deno.env.get("PUBLIC_OSS_HOST") || "").replace(/\/+$/, "") ||
    (fwdHost ? `${fwdProto}://${fwdHost}` : new URL(req.url).origin);
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Vocab Weak Words",
      description: "Fetch the learner's weakest English vocabulary, ranked weakest-first.",
      version: "1.0.0",
    },
    servers: [{ url: origin }],
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
      "/functions/review-word": {
        post: {
          operationId: "reviewWord",
          summary: "Record how well the user recalled a word during a quiz, updating its spaced-repetition schedule.",
          description:
            "Call this after quizzing the user on one of their words. rating: 1=forgot, 2=hard, 3=good, 4=easy. Forgotten/hard words will resurface sooner.",
          "x-openai-isConsequential": false,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ReviewWordRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "The word's updated schedule.",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ReviewWordResponse" },
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
        ReviewWordRequest: {
          type: "object",
          required: ["word", "rating"],
          properties: {
            word: { type: "string", description: "The word being quizzed (must already be in the list)." },
            rating: {
              type: "integer",
              enum: [1, 2, 3, 4],
              description: "Recall quality: 1 forgot, 2 hard, 3 good, 4 easy.",
            },
          },
        },
        ReviewWordResponse: {
          type: "object",
          properties: {
            ok: { type: "boolean" },
            word: { type: "string" },
            due: { type: "string", description: "Next review time (ISO)." },
            interval_days: { type: "integer" },
            state: { type: "string" },
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
