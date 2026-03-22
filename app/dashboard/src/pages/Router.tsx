import { createHashRouter, redirect } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Dashboard } from "./Dashboard";
import { AdminManager } from "./AdminManager";
import { Login } from "./Login";
import { Flew } from "./Flew";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { InboundsPage } from "./InboundsPage";
import { NodesPage } from "./NodesPage";
import { HostsPage } from "./HostsPage";
import { SubscriptionEditorPage } from "./SubscriptionEditorPage";

const fetchAdminLoader = async () => {
    try {
        const token = getAuthToken();
        if (!token) {
            throw new Error("No token found");
        }
        
        
        const response = await fetch("/admin", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        
        
        return response;
    } catch (error) {
        console.error("Router: Admin loader failed:", error);
        throw error;
    }
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
        errorElement: <Login />,
        loader: fetchAdminLoader,
        children: [
            {
                index: true,
                element: <Dashboard />,
            },
            {
                path: "inbounds/",
                element: <InboundsPage />,
            },
            {
                path: "nodes/",
                element: <NodesPage />,
            },
            {
                path: "hosts/",
                element: <HostsPage />,
            },
            {
                path: "subscription/:username/",
                element: <SubscriptionEditorPage />,
            },
        ],
    },
    {
        path: "/admin-manager/",
        element: <AdminManager />,
        errorElement: <Login />,
        loader: fetchAdminLoader,
    },
    {
        path: "/flew/",
        element: <Flew />,
        errorElement: <Login />,
        loader: fetchXpanelLoader,
    },
    {
        path: "/login/",
        element: <Login />,
    },
]);
