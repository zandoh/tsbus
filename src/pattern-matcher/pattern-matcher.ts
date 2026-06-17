/**
 * Pattern matching utility for event subscriptions
 * Supports wildcard patterns using * for flexible event matching
 */
export interface PatternMatcher {
  /**
   * Check if a pattern matches an event name
   * @param pattern - Pattern to match (supports * wildcard)
   * @param event - Event name to test
   * @returns True if the pattern matches the event
   * @example
   * ```ts
   * matcher.matches('user:*', 'user:login') // true
   * matcher.matches('user:login', 'user:login') // true
   * matcher.matches('*', 'any:event') // true
   * ```
   */
  matches(pattern: string, event: string): boolean;

  /**
   * Check if a pattern contains wildcard characters
   * @param pattern - Pattern to check
   * @returns True if the pattern contains *
   */
  hasWildcard(pattern: string): boolean;
}

/**
 * Creates a pattern matcher with regex caching for performance
 * Compiles patterns to regex and caches them for efficient repeated matching
 * @returns PatternMatcher instance
 */
export function createPatternMatcher(): PatternMatcher {
  const patternCache = new Map<string, RegExp>();

  return {
    hasWildcard(pattern: string): boolean {
      return pattern.includes("*");
    },

    matches(pattern: string, event: string): boolean {
      if (pattern === "*") {
        return true;
      }

      if (pattern === event) {
        return true;
      }

      let regex = patternCache.get(pattern);

      if (!regex) {
        // Convert pattern to regex (e.g., "user:*" -> /^user:.*$/)
        const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
        regex = new RegExp(`^${regexPattern}$`);
        patternCache.set(pattern, regex);
      }

      return regex.test(event);
    },
  };
}
