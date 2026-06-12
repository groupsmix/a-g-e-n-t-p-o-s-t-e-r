/**
 * Publisher contract tests (Backlog T-41).
 *
 * Each test verifies a publisher's behaviour against mocked HTTP responses
 * without hitting real platform APIs. The contract covers:
 *   - Missing credentials → failure result (no throw)
 *   - Unsupported media type → failure result
 *   - HTTP 401 / 429 / 5xx → failure result with redacted message
 *   - Success → result with postId
 *   - Missing id in response → failure result
 *   - Token redaction: access tokens never appear in error messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PostContent, PublishResult } from "../base-publisher.js";

// ── Mock the config module so we never read real env ────────────────────────
vi.mock("@repo/config", () => ({
  getEnv: () => ({
    INSTAGRAM_ACCESS_TOKEN: "test-ig-token",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "123456",
    TIKTOK_ACCESS_TOKEN: "test-tt-token",
    TWITTER_ACCESS_TOKEN: "test-tw-token",
    TWITTER_API_KEY: "test-tw-key",
    TWITTER_API_SECRET: "test-tw-secret",
    TWITTER_ACCESS_SECRET: "test-tw-access-secret",
    YOUTUBE_CLIENT_ID: "test-yt-client",
    YOUTUBE_CLIENT_SECRET: "test-yt-secret",
    YOUTUBE_REFRESH_TOKEN: "test-yt-refresh",
    LINKEDIN_ACCESS_TOKEN: "test-li-token",
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockContent(overrides: Partial<PostContent> = {}): PostContent {
  return {
    type: "image",
    mediaUrl: "https://cdn.example.com/poster.jpg",
    caption: "Test caption",
    hashtags: ["test"],
    ...overrides,
  };
}

/** Build a fetch mock that returns the given JSON with status 200. */
function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Build a fetch mock that returns an error status. */
function jsonError(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function assertNoTokenInResult(result: PublishResult, token: string) {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(token);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Publisher contracts", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Instagram ────────────────────────────────────────────────────────────

  describe("InstagramPublisher", () => {
    it("returns failure on HTTP 401 from container endpoint", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonError(401, { error: { message: "Invalid token" } }));
      const { InstagramPublisher } = await import("../platforms/instagram.js");
      const pub = new InstagramPublisher("feed");
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
      assertNoTokenInResult(result, "test-ig-token");
    });

    it("returns failure when container returns no id", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonOk({ error: { message: "Rate limited" } }));
      const { InstagramPublisher } = await import("../platforms/instagram.js");
      const pub = new InstagramPublisher("feed");
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(false);
    });

    it("returns failure on HTTP 500", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonError(500, { error: "Internal" }));
      const { InstagramPublisher } = await import("../platforms/instagram.js");
      const pub = new InstagramPublisher("reels");
      const result = await pub.publish(mockContent({ type: "video" }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    it("returns success with postId on valid response", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "container-123" }))
        .mockResolvedValueOnce(jsonOk({ status_code: "FINISHED" }))
        .mockResolvedValueOnce(jsonOk({ id: "published-456" }));
      const { InstagramPublisher } = await import("../platforms/instagram.js");
      const pub = new InstagramPublisher("feed");
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(true);
      expect(result.postId).toBe("published-456");
    });
  });

  // ── Threads ──────────────────────────────────────────────────────────────

  describe("ThreadsPublisher", () => {
    it("returns failure on HTTP 429", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "user-1" }))
        .mockResolvedValueOnce(jsonError(429, { error: "Rate limited" }));
      const { ThreadsPublisher } = await import("../platforms/threads.js");
      const pub = new ThreadsPublisher();
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(false);
      expect(result.error).toContain("429");
    });

    it("returns failure when publish returns no id", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "user-1" }))
        .mockResolvedValueOnce(jsonOk({ id: "container-1" }))
        .mockResolvedValueOnce(jsonOk({}));
      const { ThreadsPublisher } = await import("../platforms/threads.js");
      const pub = new ThreadsPublisher();
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(false);
      expect(result.error).toContain("no id");
    });

    it("returns success on valid flow", async () => {
      globalThis.fetch = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "user-1" }))
        .mockResolvedValueOnce(jsonOk({ id: "container-1" }))
        .mockResolvedValueOnce(jsonOk({ id: "thread-pub-1" }));
      const { ThreadsPublisher } = await import("../platforms/threads.js");
      const pub = new ThreadsPublisher();
      const result = await pub.publish(mockContent());
      expect(result.success).toBe(true);
      expect(result.postId).toBe("thread-pub-1");
    });
  });

  // ── TikTok ───────────────────────────────────────────────────────────────

  describe("TikTokPublisher", () => {
    it("returns success immediately after init (no sync poll)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonOk({ data: { publish_id: "tt-pub-1" } }));
      const { TikTokPublisher } = await import("../platforms/tiktok.js");
      const pub = new TikTokPublisher();
      const result = await pub.publish(mockContent({ type: "video" }));
      expect(result.success).toBe(true);
      expect(result.postId).toBe("tt-pub-1");
      // Only one fetch call (init), no polling
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns failure when init fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(jsonError(401, { error: { message: "Unauthorized" } }));
      const { TikTokPublisher } = await import("../platforms/tiktok.js");
      const pub = new TikTokPublisher();
      const result = await pub.publish(mockContent({ type: "video" }));
      expect(result.success).toBe(false);
    });
  });

  // ── LinkedIn ─────────────────────────────────────────────────────────────

  describe("LinkedInPublisher", () => {
    it("uses IMAGE recipe for image posts (no binary upload)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "person-1" }))
        .mockResolvedValueOnce(jsonOk({ id: "post-1" }));
      globalThis.fetch = fetchMock;
      const { LinkedInPublisher } = await import("../platforms/linkedin.js");
      const pub = new LinkedInPublisher();
      const result = await pub.publish(mockContent({ type: "image" }));
      expect(result.success).toBe(true);
      // Only 2 fetches: getAuthorUrn + ugcPosts (no asset upload)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("uses VIDEO recipe for video posts (with binary upload)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonOk({ id: "person-1" }))
        .mockResolvedValueOnce(
          jsonOk({
            value: {
              asset: "urn:li:asset:123",
              uploadMechanism: {
                "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                  uploadUrl: "https://upload.linkedin.com/test",
                },
              },
            },
          }),
        )
        .mockResolvedValueOnce(new Response(null, { status: 200 }))
        .mockResolvedValueOnce(jsonOk({ id: "post-2" }));
      globalThis.fetch = fetchMock;
      const { LinkedInPublisher } = await import("../platforms/linkedin.js");
      const pub = new LinkedInPublisher();
      const result = await pub.publish(mockContent({ type: "video" }));
      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  // ── Publisher factory ────────────────────────────────────────────────────

  describe("publisher-factory", () => {
    it("tryGetPublisher returns undefined for unknown platform", async () => {
      const { tryGetPublisher } = await import("../publisher-factory.js");
      expect(tryGetPublisher("nonexistent")).toBeUndefined();
    });

    it("publishToAll returns failure for unknown platform", async () => {
      const { publishToAll } = await import("../publisher-factory.js");
      const results = await publishToAll(["nonexistent"], mockContent());
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain("No publisher");
    });
  });

  // ── Unsupported media type ───────────────────────────────────────────────

  describe("media type validation", () => {
    it("rejects unsupported media type before HTTP calls", async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;
      const { TikTokPublisher } = await import("../platforms/tiktok.js");
      const pub = new TikTokPublisher();
      // TikTok only supports video
      const result = await pub.publish(mockContent({ type: "image" }));
      expect(result.success).toBe(false);
      expect(result.error).toContain("does not support media type");
      // No HTTP calls were made
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
