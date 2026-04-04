import { FetchOptions, $fetch as ohMyFetch } from "ofetch";
import { getAuthToken } from "utils/authStorage";

export const $fetch = ohMyFetch.create({
  baseURL: import.meta.env.VITE_BASE_API,
});

const redactHeaders = (headers?: Record<string, any>) => {
  if (!headers) return headers;
  const copy: Record<string, any> = { ...headers };
  if (copy.Authorization) copy.Authorization = "REDACTED";
  if (copy.authorization) copy.authorization = "REDACTED";
  return copy;
};

export const fetcher = <T = any>(
  url: string,
  ops: FetchOptions<"json"> = {}
) => {
  const silent404 = Boolean((ops as any)?.silent404);
  const silent403 = Boolean((ops as any)?.silent403);
  const token = getAuthToken();
  if (token) {
    ops["headers"] = {
      ...(ops?.headers || {}),
      Authorization: `Bearer ${getAuthToken()}`,
    };
  }
  const method = (ops?.method || "GET").toString().toUpperCase();
  return $fetch<T>(url, ops)
    .then((res) => {
      return res;
    })
    .catch((err) => {
      const status = err?.response?.status ?? err?.status ?? err?.statusCode;
      if (!((silent404 && status === 404) || (silent403 && status === 403))) {
        console.error("[API ERR]", method, url, err);
      }
      throw err;
    });
};

export const fetch = fetcher;
