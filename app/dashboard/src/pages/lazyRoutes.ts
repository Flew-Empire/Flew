import { lazy } from "react";

type RouteModule = {
  default: React.ComponentType<any>;
};

export type RoutePreloadKey =
  | "adminAccounts"
  | "adminManager"
  | "inbounds"
  | "nodes"
  | "hosts"
  | "subscriptionEditor"
  | "cryptoLinkSettings";

const routeImporters: Record<RoutePreloadKey, () => Promise<RouteModule>> = {
  adminAccounts: () => import("./AdminAccountsPage"),
  adminManager: () =>
    import("./AdminManager").then((module) => ({
      default: module.AdminManager,
    })),
  inbounds: () => import("./InboundsPage"),
  nodes: () => import("./NodesPage"),
  hosts: () => import("./HostsPage"),
  subscriptionEditor: () => import("./SubscriptionEditorPage"),
  cryptoLinkSettings: () => import("./CryptoLinkSettingsPage"),
};

const preloadCache = new Map<RoutePreloadKey, Promise<RouteModule>>();

export const preloadRoute = (key: RoutePreloadKey) => {
  if (!preloadCache.has(key)) {
    preloadCache.set(key, routeImporters[key]());
  }
  return preloadCache.get(key)!;
};

export const scheduleRoutePreload = (keys: RoutePreloadKey[]) => {
  if (typeof window === "undefined") return () => {};

  const browserWindow = window as Window &
    typeof globalThis & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

  const preloadWork = () => {
    keys.forEach((key, index) => {
      browserWindow.setTimeout(() => {
        preloadRoute(key).catch((error) => {
          console.error(`Failed to preload route ${key}:`, error);
        });
      }, index * 160);
    });
  };

  if (typeof browserWindow.requestIdleCallback === "function") {
    const idleId = browserWindow.requestIdleCallback(preloadWork, {
      timeout: 1800,
    });
    return () => browserWindow.cancelIdleCallback?.(idleId);
  }

  const timerId = browserWindow.setTimeout(preloadWork, 900);
  return () => browserWindow.clearTimeout(timerId);
};

export const AdminAccountsPage = lazy(() => preloadRoute("adminAccounts"));
export const AdminManagerPage = lazy(() => preloadRoute("adminManager"));
export const InboundsPage = lazy(() => preloadRoute("inbounds"));
export const NodesPage = lazy(() => preloadRoute("nodes"));
export const HostsPage = lazy(() => preloadRoute("hosts"));
export const SubscriptionEditorPage = lazy(() =>
  preloadRoute("subscriptionEditor")
);
export const CryptoLinkSettingsPage = lazy(() =>
  preloadRoute("cryptoLinkSettings")
);
