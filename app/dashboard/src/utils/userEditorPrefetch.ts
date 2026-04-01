import { fetch } from "service/http";
import { User } from "types/User";

const USER_EDITOR_PREFETCH_TTL_MS = 30_000;

type CachedUserEntry = {
  user: User;
  expiresAt: number;
};

const userEditorCache = new Map<string, CachedUserEntry>();
const userEditorInflight = new Map<string, Promise<User>>();

const getKey = (username: string) => username.trim().toLowerCase();

export const isUserEditorNotFoundError = (error: any) => {
  const status = error?.response?.status ?? error?.status ?? error?.statusCode;
  return status === 404;
};

export const getPrefetchedUserEditor = (username: string) => {
  const key = getKey(username);
  const cached = userEditorCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt < Date.now()) {
    userEditorCache.delete(key);
    return null;
  }
  return cached.user;
};

export const prefetchUserEditor = (username: string) => {
  const key = getKey(username);
  if (!key) {
    return Promise.reject(new Error("Username is required for prefetch"));
  }

  const cached = getPrefetchedUserEditor(key);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = userEditorInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const request = fetch<User>(`/user/${encodeURIComponent(username)}`, {
    ...( { silent404: true } as any ),
  })
    .then((user) => {
      userEditorCache.set(key, {
        user,
        expiresAt: Date.now() + USER_EDITOR_PREFETCH_TTL_MS,
      });
      return user;
    })
    .finally(() => {
      userEditorInflight.delete(key);
    });

  userEditorInflight.set(key, request);
  return request;
};

export const clearPrefetchedUserEditor = (username?: string) => {
  if (!username) {
    userEditorCache.clear();
    userEditorInflight.clear();
    return;
  }

  const key = getKey(username);
  userEditorCache.delete(key);
  userEditorInflight.delete(key);
};
