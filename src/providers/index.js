import { LangGraphProvider } from "./langgraph.js";

const SUPPORTED_PROVIDERS = ["openai", "anthropic", "openai-compat"];

// Default base URLs for well-known local providers.

/**
 * Creates and returns the appropriate LLM provider instance based on config.
 *
 * Supported providers:
 *   openai        — OpenAI API (requires OPENAI_API_KEY)
 *   anthropic     — Anthropic API (requires ANTHROPIC_API_KEY)
 *   openai-compat — Any OpenAI-compatible endpoint (requires WISH_BASE_URL)
 *
 * @param {Object}  config
 * @param {string}  config.provider
 * @param {string}  config.model
 * @param {string}  [config.openaiApiKey]
 * @param {string}  [config.anthropicApiKey]
 * @param {string}  [config.baseUrl]
 * @param {string}  [config.apiKey]
 */
export function createProvider(config) {
  const { provider } = config;

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(
      `Unknown provider: "${provider}".\n` +
        `Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }

  switch (provider) {
    case "openai": {
      if (!config.openaiApiKey) {
        throw new Error(
          'Provider "openai" requires OPENAI_API_KEY to be set in your environment or .env file.',
        );
      }
      return new LangGraphProvider(config);
    }

    case "anthropic": {
      if (!config.anthropicApiKey) {
        throw new Error(
          'Provider "anthropic" requires ANTHROPIC_API_KEY to be set in your environment or .env file.',
        );
      }
      return new LangGraphProvider(config);
    }

    case "openai-compat": {
      if (!config.baseUrl) {
        throw new Error(
          'Provider "openai-compat" requires WISH_BASE_URL to be set.\n' +
            "Example: WISH_BASE_URL=http://localhost:1234/v1",
        );
      }
      return new LangGraphProvider(config);
    }
  }
}
