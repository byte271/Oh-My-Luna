# openai@7.3.0 ResponseUsage

export interface ResponseUsage {
    /**
     * The number of input tokens.
     */
    input_tokens: number;
    /**
     * A detailed breakdown of the input tokens.
     */
    input_tokens_details: ResponseUsage.InputTokensDetails;
    /**
     * The number of output tokens.
     */
    output_tokens: number;
    /**
     * A detailed breakdown of the output tokens.
     */
    output_tokens_details: ResponseUsage.OutputTokensDetails;
    /**
     * The total number of tokens used.
     */
    total_tokens: number;
}
export declare namespace ResponseUsage {
    /**
     * A detailed breakdown of the input tokens.
     */
    interface InputTokensDetails {
        /**
         * The number of input tokens that were written to the cache.
         */
        cache_write_tokens: number;
        /**
         * The number of tokens that were retrieved from the cache.
         * [More on prompt caching](https://platform.openai.com/docs/guides/prompt-caching).
         */
        cached_tokens: number;
    }
    /**
     * A detailed breakdown of the output tokens.
     */
    interface OutputTokensDetails {
        /**
         * The number of reasoning tokens.
         */
        reasoning_tokens: number;
    }
}
