import { StatisticsQueryKey } from "components/Statistics";
import { fetch } from "service/http";
import { User, UserCreate } from "types/User";
import { queryClient } from "utils/react-query";
import { clearPrefetchedUserEditor } from "utils/userEditorPrefetch";
import { getUsersPerPageLimitSize } from "utils/userPreferenceStorage";
import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";

type UsersResponse = {
  users: User[];
  total: number;
};

const sanitizeQueryObject = <T extends Record<string, any>>(query: T): Partial<T> => {
  const entries = Object.entries(query).filter(([, value]) => {
    if (value === undefined || value === null) return false;
    if (typeof value === "string" && value.length === 0) return false;
    return true;
  });

  return Object.fromEntries(entries) as Partial<T>;
};

export type FilterType = {
  search?: string;
  limit?: number;
  offset?: number;
  sort: string;
  status?: "active" | "disabled" | "limited" | "expired" | "on_hold";
  admin?: string;
};
export type ProtocolType = "vmess" | "vless" | "trojan" | "shadowsocks";

export type FilterUsageType = {
  start?: string;
  end?: string;
};

export type InboundType = {
  tag: string;
  protocol: ProtocolType;
  network: string;
  tls: string;
  port?: number;
};
export type Inbounds = Map<ProtocolType, InboundType[]>;

type RawInbound = Record<string, unknown> & {
  tag?: string;
  protocol?: string;
  port?: number | string;
  network?: string;
  tls?: string;
  streamSettings?: {
    network?: string;
    security?: string;
  };
};

type CoreConfigPayload = {
  inbounds?: RawInbound[];
};

type DashboardStateType = {
  isCreatingNewUser: boolean;
  editingUser: User | null | undefined;
  deletingUser: User | null;
  hasFetchedUsers: boolean;
  version: string | null;
  users: {
    users: User[];
    total: number;
  };
  inbounds: Inbounds;
  loading: boolean;
  filters: FilterType;
  subscribeUrl: string | null;
  QRcodeLinks: string[] | null;
  isEditingHosts: boolean;
  isEditingNodes: boolean;
  isShowingNodesUsage: boolean;
  isResetingAllUsage: boolean;
  isEditingAdminLimits: boolean;
  isEditingCrypto: boolean;
  resetUsageUser: User | null;
  revokeSubscriptionUser: User | null;
  isEditingCore: boolean;
  onCreateUser: (isOpen: boolean) => void;
  onEditingUser: (user: User | null) => void;
  onDeletingUser: (user: User | null) => void;
  onResetAllUsage: (isResetingAllUsage: boolean) => void;
  refetchUsers: () => Promise<UsersResponse>;
  resetAllUsage: () => Promise<void>;
  onFilterChange: (filters: Partial<FilterType>) => void;
  deleteUser: (user: User) => Promise<void>;
  createUser: (user: UserCreate) => Promise<void>;
  editUser: (user: UserCreate) => Promise<void>;
  fetchUserUsage: (user: User, query: FilterUsageType) => Promise<void>;
  setQRCode: (links: string[] | null) => void;
  setSubLink: (subscribeURL: string | null) => void;
  onEditingHosts: (isEditingHosts: boolean) => void;
  onEditingNodes: (isEditingHosts: boolean) => void;
  onShowingNodesUsage: (isShowingNodesUsage: boolean) => void;
  onEditingAdminLimits: (isEditingAdminLimits: boolean) => void;
  onEditingCrypto: (isEditingCrypto: boolean) => void;
  resetDataUsage: (user: User) => Promise<void>;
  revokeSubscription: (user: User) => Promise<void>;
};

const fetchUsers = (query: FilterType): Promise<UsersResponse> => {
  const sanitizedQuery = sanitizeQueryObject(query);
  useDashboard.setState({ loading: true });
  return fetch("/users", { query: sanitizedQuery })
    .then((users: UsersResponse) => {
      useDashboard.setState({ users });
      useDashboard.setState({ hasFetchedUsers: true });
      return users;
    })
    .catch((error) => {
      console.error("Failed to fetch users:", error);
      useDashboard.setState({
        users: { users: [], total: 0 },
        hasFetchedUsers: true,
      });
      return { users: [], total: 0 };
    })
    .finally(() => {
      useDashboard.setState({ loading: false });
    });
};

const toDashboardInbounds = (rawInbounds: RawInbound[]): Inbounds => {
  const grouped: Partial<Record<ProtocolType, InboundType[]>> = {};

  rawInbounds.forEach((inbound) => {
    const protocol = String(inbound?.protocol || "").toLowerCase();
    if (
      protocol !== "vmess" &&
      protocol !== "vless" &&
      protocol !== "trojan" &&
      protocol !== "shadowsocks"
    ) {
      return;
    }

    const typedProtocol = protocol as ProtocolType;
    const network =
      inbound?.streamSettings?.network || String(inbound?.network || "tcp");
    const tls =
      inbound?.streamSettings?.security || String(inbound?.tls || "none");
    const rawPort =
      typeof inbound?.port === "number"
        ? inbound.port
        : Number.parseInt(String(inbound?.port || ""), 10);

    if (!grouped[typedProtocol]) {
      grouped[typedProtocol] = [];
    }

    grouped[typedProtocol]!.push({
      tag: String(inbound?.tag || ""),
      protocol: typedProtocol,
      network: String(network || "tcp"),
      tls: String(tls || "none"),
      port: Number.isNaN(rawPort) ? undefined : rawPort,
    });
  });

  return new Map(Object.entries(grouped)) as Inbounds;
};

export const fetchInbounds = () => {
  return fetch("/core/config")
    .then((config: CoreConfigPayload) => {
      useDashboard.setState({
        inbounds: toDashboardInbounds(
          Array.isArray(config?.inbounds) ? config.inbounds : []
        ),
      });
    })
    .catch((error) => {
      console.error("Failed to fetch inbounds from core config:", error);
      useDashboard.setState({ inbounds: new Map() });
    })
    .finally(() => {
      useDashboard.setState({ loading: false });
    });
};

export const useDashboard = create(
  subscribeWithSelector<DashboardStateType>((set, get) => ({
    version: null,
    editingUser: null,
    deletingUser: null,
    hasFetchedUsers: false,
    isCreatingNewUser: false,
    QRcodeLinks: null,
    subscribeUrl: null,
    users: {
      users: [],
      total: 0,
    },
    loading: true,
    isResetingAllUsage: false,
    isEditingHosts: false,
    isEditingNodes: false,
    isShowingNodesUsage: false,
    isEditingAdminLimits: false,
    isEditingCrypto: false,
    resetUsageUser: null,
    revokeSubscriptionUser: null,
    filters: {
      username: "",
      limit: getUsersPerPageLimitSize(),
      sort: "-created_at",
    },
    inbounds: new Map(),
    isEditingCore: false,
    refetchUsers: () => {
      try {
        return fetchUsers(get().filters);
      } catch (error) {
        console.error("refetchUsers failed:", error);
        return Promise.resolve({ users: [], total: 0 });
      }
    },
    resetAllUsage: () => {
      return fetch(`/users/reset`, { method: "POST" }).then(() => {
        get().onResetAllUsage(false);
        get().refetchUsers();
      });
    },
    onResetAllUsage: (isResetingAllUsage) => set({ isResetingAllUsage }),
    onCreateUser: (isCreatingNewUser) => set({ isCreatingNewUser }),
    onEditingUser: (editingUser) => {
      set({ editingUser });
    },
    onDeletingUser: (deletingUser) => {
      set({ deletingUser });
    },
    onFilterChange: (filters) => {
      set({
        filters: {
          ...get().filters,
          ...filters,
        },
      });
      get().refetchUsers();
    },
    setQRCode: (QRcodeLinks) => {
      set({ QRcodeLinks });
    },
    deleteUser: (user: User) => {
      set({ editingUser: null });
      return fetch(`/user/${encodeURIComponent(user.username)}`, {
        method: "DELETE",
      }).then(async () => {
        clearPrefetchedUserEditor(user.username);
        set((state) => ({
          deletingUser: null,
          users: {
            users: state.users.users.filter(
              (item) => item.username !== user.username
            ),
            total: Math.max(
              0,
              state.users.total -
                (state.users.users.some(
                  (item) => item.username === user.username
                )
                  ? 1
                  : 0)
            ),
          },
        }));
        await get().refetchUsers();
        queryClient.invalidateQueries(StatisticsQueryKey);
      });
    },
    createUser: (body: UserCreate) => {
      return fetch(`/user`, { method: "POST", body }).then(async () => {
        set({ editingUser: null });
        await get().refetchUsers();
        queryClient.invalidateQueries(StatisticsQueryKey);
      });
    },
    editUser: (body: UserCreate) => {
      return fetch(`/user/${encodeURIComponent(body.username)}`, {
        method: "PUT",
        body,
      }).then(async () => {
        await get().refetchUsers();
        queryClient.invalidateQueries(StatisticsQueryKey);
      });
    },
    fetchUserUsage: (body: User, query: FilterUsageType) => {
      const sanitizedQuery = sanitizeQueryObject(query);
      return fetch(`/user/${encodeURIComponent(body.username)}/usage`, {
        method: "GET",
        query: sanitizedQuery,
      });
    },
    onEditingHosts: (isEditingHosts: boolean) => {
      set({ isEditingHosts });
    },
    onEditingNodes: (isEditingNodes: boolean) => {
      set({ isEditingNodes });
    },
    onShowingNodesUsage: (isShowingNodesUsage: boolean) => {
      set({ isShowingNodesUsage });
    },
    onEditingAdminLimits: (isEditingAdminLimits: boolean) => {
      set({ isEditingAdminLimits });
    },
    onEditingCrypto: (isEditingCrypto: boolean) => {
      set({ isEditingCrypto });
    },
    setSubLink: (subscribeUrl) => {
      set({ subscribeUrl });
    },
    resetDataUsage: (user) => {
      return fetch(`/user/${encodeURIComponent(user.username)}/reset`, {
        method: "POST",
      }).then(async () => {
        set({ resetUsageUser: null });
        await get().refetchUsers();
      });
    },
    revokeSubscription: (user) => {
      return fetch(`/user/${encodeURIComponent(user.username)}/revoke_sub`, {
        method: "POST",
      }).then(async (user) => {
        set({ revokeSubscriptionUser: null, editingUser: user });
        await get().refetchUsers();
      });
    },
  }))
);
