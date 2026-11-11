// Copyright (c) 2026 Vassel Goleyu. All rights reserved.
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
  }
}

export async function gql<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
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
