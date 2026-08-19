import { useAuthStore } from "./auth-store";
import { withIds } from "./normalize";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, payload: unknown) {
    const error =
      isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    super(
      typeof error.message === "string"
        ? error.message
        : "The request could not be completed.",
    );
    this.name = "ApiError";
    this.status = status;
    this.code = typeof error.code === "string" ? error.code : "UNKNOWN";
    this.details = isRecord(error.details) ? error.details : {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readPayload(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return withIds(JSON.parse(text) as unknown);
  } catch {
    return { error: { message: text } };
  }
}

export async function refreshSession(): Promise<{
  accessToken: string;
  user: import("./types").User;
}> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  const payload = await readPayload(response);
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as { accessToken: string; user: import("./types").User };
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = useAuthStore.getState().accessToken;
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !headers.has("Content-Type") &&
    !(init.body instanceof FormData)
  )
    headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await readPayload(response);
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    try {
      const session = await refreshSession();
      useAuthStore.getState().setSession(session.accessToken, session.user);
      return apiFetch<T>(path, init, false);
    } catch {
      useAuthStore.getState().clearSession();
    }
  }
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

export async function signIn(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: import("./types").User }>(
    "/auth/sign-in",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false,
  );
}

export async function signUp(email: string, password: string) {
  return apiFetch<{ accessToken: string; user: import("./types").User }>(
    "/auth/sign-up",
    { method: "POST", body: JSON.stringify({ email, password }) },
    false,
  );
}

export async function logout() {
  await apiFetch<null>("/auth/logout", { method: "POST" }, false);
}

export async function uploadWithProgress(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void,
) {
  await new Promise<void>((resolve, reject) => {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) =>
      formData.append(key, value),
    );
    formData.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("Storage upload failed.")),
    );
    request.addEventListener("error", () =>
      reject(new Error("Storage upload failed.")),
    );
    request.send(formData);
  });
}

export async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export { API_URL };
