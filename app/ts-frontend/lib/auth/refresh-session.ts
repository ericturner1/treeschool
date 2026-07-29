export type RefreshedSupabaseSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

export type RefreshSupabaseSessionResult =
  | {
      ok: true;
      session: RefreshedSupabaseSession;
    }
  | {
      ok: false;
      status: number;
      errorCode: string;
    };

export async function refreshSupabaseSession({
  supabaseUrl,
  anonKey,
  refreshToken
}: {
  supabaseUrl: string;
  anonKey: string;
  refreshToken: string;
}): Promise<RefreshSupabaseSessionResult> {
  const performRefresh = () =>
    fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      cache: "no-store"
    }).catch(() => null);

  let response = await performRefresh();

  // A dropped response can happen after Supabase has already rotated the token.
  // Retrying immediately is safe inside Supabase's refresh-token reuse interval.
  if (!response || response.status >= 500) {
    response = await performRefresh();
  }

  if (!response?.ok) {
    let errorCode = "unknown";

    try {
      const payload = (await response?.json()) as {
        error_code?: string;
        code?: string;
      };
      errorCode = payload?.error_code ?? payload?.code ?? errorCode;
    } catch {
      // The response status and safe error code are sufficient diagnostics.
    }

    return {
      ok: false,
      status: response?.status ?? 0,
      errorCode
    };
  }

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!payload.access_token || !payload.refresh_token) {
    return {
      ok: false,
      status: response.status,
      errorCode: "missing_session_tokens"
    };
  }

  return {
    ok: true,
    session: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in
    }
  };
}
