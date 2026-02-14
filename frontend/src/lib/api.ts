export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Wrapper around fetch that automatically includes credentials and JSON headers
 * for cross-origin API requests.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = apiUrl(path);

  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}

// Warn in production if API URL is not configured
if (typeof window !== "undefined" && process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
  console.warn(
    "[Rehearse] NEXT_PUBLIC_API_URL is not set. API calls will fail in production. " +
    "Please set this environment variable in your deployment settings."
  );
}
