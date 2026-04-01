import { HStack, Spinner } from "@chakra-ui/react";
import {
    ComponentType,
    LazyExoticComponent,
    Suspense,
} from "react";
import { createHashRouter, redirect } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Dashboard } from "./Dashboard";
import { Login } from "./Login";
import { RouteErrorPage } from "./RouteErrorPage";
import { WorkspaceLayout } from "./WorkspaceLayout";
import {
    AdminAccountsPage,
    AdminBillingPage,
    AdminChatPage,
    AdminLimitsPage,
    AdminManagerPage,
    CryptoLinkPage,
    CryptoLinkSettingsPage,
    FlewPage,
    HostsPage,
    InboundsPage,
    NodesPage,
    SubscriptionEditorPage,
} from "./lazyRoutes";

const RouteFallback = () => (
    <HStack justifyContent="center" py={12}>
        <Spinner size="md" color="primary.300" />
    </HStack>
);

const renderLazyRoute = (
    Page: LazyExoticComponent<ComponentType<any>>
) => (
    <Suspense fallback={<RouteFallback />}>
        <Page />
    </Suspense>
);

const fetchAdminLoader = async () => {
    const token = getAuthToken();
    if (!token) {
        return redirect("/login/");
    }

    try {
        const response = await fetch("/admin", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        return response;
    } catch (error) {
        console.error("Router: Admin loader failed:", error);
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 401 || status === 403) {
            return redirect("/login/");
        }
        throw error;
    }
};

const fetchSudoLoader = async () => {
    const admin = await fetchAdminLoader();
    if (admin instanceof Response) {
        return admin;
    }
    if (!admin?.is_sudo) {
        return redirect("/");
    }
    return admin;
};

const isXpanelEnabled = (system: any) => {
    if (system?.xpanel_enabled !== undefined) {
        return Boolean(system.xpanel_enabled);
    }
    const features = Array.isArray(system?.features) ? system.features : [];
    return features
        .map((value: unknown) => String(value || "").trim().toLowerCase())
        .includes("xpanel");
};

const fetchXpanelLoader = async () => {
    await fetchAdminLoader();
    const system = await fetch("/system");
    if (!isXpanelEnabled(system)) {
        return redirect("/");
    }
    return system;
};

export const router = createHashRouter([
    {
        path: "/",
        element: <WorkspaceLayout />,
        errorElement: <RouteErrorPage />,
        loader: fetchAdminLoader,
        children: [
            {
                index: true,
                element: <Dashboard />,
            },
            {
                path: "inbounds/",
                element: renderLazyRoute(InboundsPage),
            },
            {
                path: "nodes/",
                element: renderLazyRoute(NodesPage),
            },
            {
                path: "hosts/",
                element: renderLazyRoute(HostsPage),
            },
            {
                path: "admin-billing/",
                element: renderLazyRoute(AdminBillingPage),
            },
            {
                path: "admin-chat/",
                element: renderLazyRoute(AdminChatPage),
            },
            {
                path: "admin-accounts/",
                element: renderLazyRoute(AdminAccountsPage),
                loader: fetchSudoLoader,
            },
            {
                path: "admin-limits/",
                element: renderLazyRoute(AdminLimitsPage),
            },
            {
                path: "happ-crypto/",
                element: renderLazyRoute(CryptoLinkPage),
            },
            {
                path: "subscription-settings/",
                element: renderLazyRoute(CryptoLinkSettingsPage),
                loader: fetchSudoLoader,
            },
            {
                path: "happ-crypto/settings/",
                element: renderLazyRoute(CryptoLinkSettingsPage),
                loader: fetchSudoLoader,
            },
            {
                path: "subscription/new/",
                element: renderLazyRoute(SubscriptionEditorPage),
            },
            {
                path: "subscription/:username/",
                element: renderLazyRoute(SubscriptionEditorPage),
            },
        ],
    },
    {
        path: "/admin-manager/",
        element: renderLazyRoute(AdminManagerPage),
        errorElement: <RouteErrorPage />,
        loader: fetchAdminLoader,
    },
    {
        path: "/flew/",
        element: renderLazyRoute(FlewPage),
        errorElement: <RouteErrorPage />,
        loader: fetchXpanelLoader,
    },
    {
        path: "/login",
        element: <Login />,
    },
    {
        path: "/login/",
        element: <Login />,
    },
]);
