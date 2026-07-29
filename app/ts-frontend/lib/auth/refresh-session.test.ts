import { afterEach, describe, expect, mock, test } from "bun:test";
import { refreshSupabaseSession } from "./refresh-session";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Supabase session refresh", () => {
  test("returns a complete rotated session", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600
      })
    ) as typeof fetch;

    const result = await refreshSupabaseSession({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon-key",
      refreshToken: "old-refresh-token"
    });

    expect(result).toEqual({
      ok: true,
      session: {
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600
      }
    });
  });

  test("retries a transient server failure once", async () => {
    const fetchMock = mock()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token"
        })
      );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await refreshSupabaseSession({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon-key",
      refreshToken: "old-refresh-token"
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("returns only a safe error code when Supabase rejects the token", async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error_code: "refresh_token_not_found",
          message: "sensitive upstream detail"
        },
        { status: 400 }
      )
    ) as typeof fetch;

    const result = await refreshSupabaseSession({
      supabaseUrl: "https://example.supabase.co",
      anonKey: "anon-key",
      refreshToken: "old-refresh-token"
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      errorCode: "refresh_token_not_found"
    });
  });
});
