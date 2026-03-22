import { createHashRouter, redirect } from "react-router-dom";
import { fetch } from "../service/http";
import { getAuthToken } from "../utils/authStorage";
import { Dashboard } from "./Dashboard";
import { XpertPanel } from "./XpertPanel";
import { TrafficPage } from "./TrafficPage";
import { AdminManager } from "./AdminManager";
import { Login } from "./Login";

const fetchAdminLoader = async () => {
    try {
        const token = getAuthToken();
        if (!token) {
            console.log("Router: No token found, redirecting to login");
            throw new Error("No token found");
        }
        
        console.log("Router: Validating admin token...");
        const response = await fetch("/admin", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        
        console.log("Router: Admin validation successful");
        return response;
    } catch (error) {
        console.error("Router: Admin loader failed:", error);
        throw error;
    }
};

const fetchSudoLoader = async () => {
    const admin = await fetchAdminLoader();
    if (!admin?.is_sudo) {
        return redirect("/");
    }
    return admin;
};

export const router = createHashRouter([
    {
        path: "/",
        element: <Dashboard />,
        errorElement: <Login />,
        loader: fetchAdminLoader,
    },
    {
        path: "/xpert/",
        element: <XpertPanel />,
        errorElement: <Login />,
        loader: fetchSudoLoader,
    },
    {
        path: "/traffic/",
        element: <TrafficPage />,
        errorElement: <Login />,
        loader: fetchAdminLoader,
    },
    {
        path: "/admin-manager/",
        element: <AdminManager />,
        errorElement: <Login />,
        loader: fetchSudoLoader,
    },
    {
        path: "/login/",
        element: <Login />,
    },
]);
