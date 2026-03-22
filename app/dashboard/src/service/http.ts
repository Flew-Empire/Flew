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
      console.error("[API ERR]", method, url, err);
      throw err;
    });
};

export const fetch = fetcher;
