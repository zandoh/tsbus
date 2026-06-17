import { describe, expect, it } from "vitest";
import { createPatternMatcher } from "./pattern-matcher";

describe("PatternMatcher", () => {
  describe("hasWildcard", () => {
    it("should detect wildcards in patterns", () => {
      const matcher = createPatternMatcher();

      expect(matcher.hasWildcard("user:*")).toBe(true);
      expect(matcher.hasWildcard("*")).toBe(true);
      expect(matcher.hasWildcard("user:login")).toBe(false);
      expect(matcher.hasWildcard("user:login:*:success")).toBe(true);
    });
  });

  describe("matches", () => {
    it("should match exact patterns", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("user:login", "user:login")).toBe(true);
      expect(matcher.matches("user:login", "user:logout")).toBe(false);
    });

    it("should match global wildcard", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("*", "user:login")).toBe(true);
      expect(matcher.matches("*", "anything")).toBe(true);
      expect(matcher.matches("*", "foo:bar:baz")).toBe(true);
    });

    it("should match suffix wildcards", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("user:*", "user:login")).toBe(true);
      expect(matcher.matches("user:*", "user:logout")).toBe(true);
      expect(matcher.matches("user:*", "admin:login")).toBe(false);
    });

    it("should match prefix wildcards", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("*:login", "user:login")).toBe(true);
      expect(matcher.matches("*:login", "admin:login")).toBe(true);
      expect(matcher.matches("*:login", "user:logout")).toBe(false);
    });

    it("should match middle wildcards", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("user:*:success", "user:login:success")).toBe(true);
      expect(matcher.matches("user:*:success", "user:logout:success")).toBe(true);
      expect(matcher.matches("user:*:success", "user:login:failure")).toBe(false);
    });

    it("should cache regex patterns for performance", () => {
      const matcher = createPatternMatcher();

      // First call - creates regex
      expect(matcher.matches("user:*", "user:login")).toBe(true);
      // Second call - uses cached regex
      expect(matcher.matches("user:*", "user:logout")).toBe(true);
    });

    it("should escape special regex characters", () => {
      const matcher = createPatternMatcher();

      expect(matcher.matches("user.login", "user.login")).toBe(true);
      expect(matcher.matches("user.login", "userXlogin")).toBe(false);
      expect(matcher.matches("user+login", "user+login")).toBe(true);
      expect(matcher.matches("user(test)", "user(test)")).toBe(true);
    });
  });
});
