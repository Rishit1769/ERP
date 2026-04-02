const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RequestConfig = {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  params?: Record<string, string | number | boolean | undefined | null>;
};

export class ApiError extends Error {
  response: { status: number; data: Record<string, unknown> };
  constructor(status: number, data: Record<string, unknown>) {
    super(`API error ${status}`);
    this.name = "ApiError";
    this.response = { status, data };
  }
}

let _refreshPromise: Promise<void> | null = null;

async function request<T = unknown>(
  method: Method,
  url: string,
  body?: unknown,
  config?: RequestConfig
): Promise<{ data: T }> {
  let fullUrl = `${BASE_URL}${url}`;

  // Append query params (mirrors axios `params` config)
  if (config?.params) {
    const qs = Object.entries(config.params)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v!))}`)
      .join("&");
    if (qs) fullUrl += (fullUrl.includes("?") ? "&" : "?") + qs;
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  // Never set Content-Type for FormData — the browser adds it with the boundary
  const headers: Record<string, string> = isFormData
    ? {}
    : { "Content-Type": "application/json" };

  if (config?.headers) {
    for (const [k, v] of Object.entries(config.headers)) {
      if (isFormData && k.toLowerCase() === "content-type") continue;
      headers[k] = v;
    }
  }

  const init: RequestInit = {
    method,
    credentials: "include",
    headers,
    signal: config?.signal,
    ...(body !== undefined
      ? { body: isFormData ? (body as FormData) : JSON.stringify(body) }
      : {}),
  };

  const execute = async (): Promise<{ data: T }> => {
    const res = await fetch(fullUrl, init);
    if (!res.ok) {
      let errData: Record<string, unknown> = {};
      try {
        errData = (await res.json()) as Record<string, unknown>;
      } catch {
        // non-JSON error body
      }
      throw new ApiError(res.status, errData);
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { data };
  };

  try {
    return await execute();
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.response.status === 401 &&
      !url.includes("/auth/refresh") &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/me")
    ) {
      // Deduplicate concurrent refresh calls
      if (!_refreshPromise) {
        _refreshPromise = fetch(`${BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        })
          .then((r) => { if (!r.ok) throw new Error("refresh failed"); })
          .finally(() => { _refreshPromise = null; });
      }

      try {
        await _refreshPromise;
        return await execute();
      } catch {
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        throw err;
      }
    }
    throw err;
  }
}

const api = {
  get: <T = unknown>(url: string, config?: RequestConfig) =>
    request<T>("GET", url, undefined, config),
  post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("POST", url, body, config),
  put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("PUT", url, body, config),
  patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) =>
    request<T>("PATCH", url, body, config),
  delete: <T = unknown>(url: string, config?: RequestConfig) =>
    request<T>("DELETE", url, undefined, config),
};

export default api;
