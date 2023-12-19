import { getEnvironmentVariable } from "@langchain/core/utils/env";
import { Embeddings, type EmbeddingsParams } from "@langchain/core/embeddings";
import { chunkArray } from "../utils/chunk.js";

/**
 * Interface for TogetherAIEmbeddingsParams parameters. Extends EmbeddingsParams and
 * defines additional parameters specific to the TogetherAIEmbeddings class.
 */
export interface TogetherAIEmbeddingsParams extends EmbeddingsParams {
  /**
   * The API key to use for the TogetherAI API.
   * @default {process.env.TOGETHER_AI_API_KEY}
   */
  apiKey?: string;

  /**
   * Model name to use
   * @default {"TODO_WHAT_ARE_MODEL_NAMES"}
   */
  modelName: string;

  /**
   * Timeout to use when making requests to TogetherAI.
   * @default {undefined}
   */
  timeout?: number;

  /**
   * The maximum number of documents to embed in a single request.
   * @default {512}
   */
  batchSize?: number;

  /**
   * Whether to strip new lines from the input text. May not be suitable
   * for all use cases.
   * @default {false}
   */
  stripNewLines?: boolean;
}

/**˝
 * Class for generating embeddings using the TogetherAI API. Extends the
 * Embeddings class and implements TogetherAIEmbeddingsParams.
 * @example
 * ```typescript
 * @TODO ADD EXAMPLE
 * ```
 */
export class TogetherAIEmbeddings
  extends Embeddings
  implements TogetherAIEmbeddingsParams
{
  modelName = "TODO_WHAT_ARE_MODEL_NAMES";

  apiKey: string;

  batchSize = 512;

  stripNewLines = false;

  timeout?: number;

  private embeddingsAPIUrl = "https://api.together.xyz/api/v1/embeddings";

  constructor(fields?: Partial<TogetherAIEmbeddingsParams>) {
    const fieldsWithDefaults = { maxConcurrency: 2, ...fields };

    super(fieldsWithDefaults);

    let apiKey =
      fieldsWithDefaults?.apiKey ??
      getEnvironmentVariable("TOGETHER_AI_API_KEY");
    if (!apiKey) {
      throw new Error("TOGETHER_AI_API_KEY not found.");
    }
  }

  private constructHeaders() {
    return {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  private constructBody(input: string) {
    const body = {
      model: this?.modelName,
      input
    };
    return body;
  }

  /**
   * Method to generate embeddings for an array of documents. Splits the
   * documents into batches and makes requests to the TogetherAI API to generate
   * embeddings.
   * @param texts Array of documents to generate embeddings for.
   * @returns Promise that resolves to a 2D array of embeddings for each document.
   */
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const batches = chunkArray(
      this.stripNewLines ? texts.map((t) => t.replace(/\n/g, " ")) : texts,
      this.batchSize
    );

    // @TODO replace with type once found.
    let batchResponses: any[] = [];
    /**
     * @TODO Figure out if this is true:
     * TogetherAI doesn't support multiple inputs per API request
     * so we need to make a request for each document in the batch.
     */
    for await (const batch of batches) {
      const batchRequests = batch.map((item) => this.embeddingWithRetry(item));
      const response = await Promise.all(batchRequests);
      batchResponses = batchResponses.concat(response);
    }

    const embeddings: number[][] = [];
    for (let i = 0; i < batchResponses.length; i += 1) {
      const batch = batches[i];
      const { data: batchResponse } = batchResponses[i];
      for (let j = 0; j < batch.length; j += 1) {
        embeddings.push(batchResponse[j].embedding);
      }
    }
    return embeddings;
  }

  /**
   * Method to generate an embedding for a single document. Calls the
   * embeddingWithRetry method with the document as the input.
   * @param {string} text Document to generate an embedding for.
   * @returns {Promise<number[]>} Promise that resolves to an embedding for the document.
   */
  async embedQuery(text: string): Promise<number[]> {
    const { data } = await this.embeddingWithRetry(
      this.stripNewLines ? text.replace(/\n/g, " ") : text
    );
    return data[0].embedding;
  }

  /**
   * Private method to make a request to the TogetherAI API to generate
   * embeddings. Handles the retry logic and returns the response from the
   * API.
   * @param {string} input The input text to embed.
   * @returns Promise that resolves to the response from the API.
   * @TODO Figure out return type and statically type it.
   */
  private async embeddingWithRetry(input: string): Promise<any> {
    const body = JSON.stringify(this.constructBody(input));
    const headers = this.constructHeaders();

    return this.caller.call(async () => {
      const fetchResponse = await (
        await fetch(this.embeddingsAPIUrl, {
          method: "POST",
          headers,
          body
        })
      ).json();
      if (fetchResponse.status === 200) {
        return fetchResponse;
      }
      throw new Error(
        `Error getting prompt completion from Together AI. ${JSON.stringify(
          fetchResponse,
          null,
          2
        )}`
      );
    });
  }
}
