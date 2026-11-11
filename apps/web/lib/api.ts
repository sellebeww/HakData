// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

async function post(query: string, variables: Record<string, unknown>) {
  let res: Response;
  try {
    res = await fetch("/api/graphql", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Periksa koneksi Anda.", "NETWORK");
  }
  const body = await res.json().catch(() => null);
  if (!body) throw new ApiError("Respons server tidak valid.", "BAD_RESPONSE");
  return body;
}

// Access token hanya 15 menit: bila kedaluwarsa, tukar dengan refresh token sekali (satu penerbangan) lalu ulangi permintaan.
let refreshing: Promise<boolean> | null = null;
export const refreshSession = () =>
  (refreshing ??= post(`mutation{refresh{id}}`, {})
    .then((b) => !b.errors?.length)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    }));

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  let body = await post(query, variables);
  if (body.errors?.[0]?.extensions?.code === "UNAUTHENTICATED" && !/\b(login|refresh|logout)\b/.test(query) && (await refreshSession()))
    body = await post(query, variables);
  if (body.errors?.length) throw new ApiError(body.errors[0].message, body.errors[0].extensions?.code ?? "ERROR");
  return body.data as T;
}

export async function uploadEvidence(requestId: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/evidence/${requestId}`, { method: "POST", body: fd, credentials: "include" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new ApiError(Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? "Unggahan gagal."), String(res.status));
  return body;
}
