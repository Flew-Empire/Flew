import {
  Box,
  BoxProps,
  Button,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  InputRightElement,
  Select,
  Spinner,
  chakra,
} from "@chakra-ui/react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import classNames from "classnames";
import { useDashboard } from "contexts/DashboardContext";
import { useFeatures } from "hooks/useFeatures";
import debounce from "lodash.debounce";
import React, { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetch } from "service/http";

const iconProps = {
  baseStyle: {
    w: 4,
    h: 4,
  },
};

const SearchIcon = chakra(MagnifyingGlassIcon, iconProps);
const ClearIcon = chakra(XMarkIcon, iconProps);
export const ReloadIcon = chakra(ArrowPathIcon, iconProps);

type AdminItem = {
  username: string;
  is_sudo: boolean;
};

export type FilterProps = {} & BoxProps;

const setSearchField = debounce((search: string) => {
  useDashboard.getState().onFilterChange({
    ...useDashboard.getState().filters,
    offset: 0,
    search,
  });
}, 300);

export const Filters: FC<FilterProps> = ({ ...props }) => {
  const { loading, filters, onFilterChange, refetchUsers, onCreateUser } =
    useDashboard();
  const { t } = useTranslation();
  const { hasFeature } = useFeatures();
  const [search, setSearch] = useState("");
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [me, setMe] = useState<AdminItem | null>(null);
  const [isScrollBlurActive, setIsScrollBlurActive] = useState(false);

  useEffect(() => {
    const updateBlurState = () => {
      setIsScrollBlurActive(window.scrollY > 0);
    };

    updateBlurState();
    window.addEventListener("scroll", updateBlurState, { passive: true });
    return () => {
      window.removeEventListener("scroll", updateBlurState);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const currentAdmin = await fetch("/admin");
        if (!alive) return;
        setMe({ username: currentAdmin.username, is_sudo: !!currentAdmin.is_sudo });

        if (currentAdmin?.is_sudo) {
          try {
            const all = await fetch("/admins");
            if (!alive) return;
            const list = Array.isArray(all) ? all : [];
            const hasMe = list.some((a) => a?.username === currentAdmin.username);
            setAdmins(
              hasMe
                ? list
                : [
                    {
                      username: currentAdmin.username,
                      is_sudo: !!currentAdmin.is_sudo,
                    },
                    ...list,
                  ]
            );
          } catch {
            setAdmins([
              {
                username: currentAdmin.username,
                is_sudo: !!currentAdmin.is_sudo,
              },
            ]);
          }
        } else {
          setAdmins([
            { username: currentAdmin.username, is_sudo: !!currentAdmin.is_sudo },
          ]);
        }
      } catch {
        setAdmins([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setSearchField(e.target.value);
  };

  const clear = () => {
    setSearch("");
    onFilterChange({
      ...filters,
      offset: 0,
      search: "",
    });
  };

  const onAdminFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      offset: 0,
      admin: value === "__all__" ? undefined : value,
    });
  };

  const onStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onFilterChange({
      ...filters,
      offset: 0,
      status: value.length > 0 ? (value as typeof filters.status) : undefined,
    });
  };

  const canUseAdminFilter = hasFeature("admin_filter");
  const canShowAdminFilter = !!me?.is_sudo && canUseAdminFilter;
  const selectedValue =
    filters.admin === me?.username ? "__sudo_self__" : filters.admin || "__all__";
  const searchPlaceholder =
    t("search") === "search" ? "Search users..." : t("search");
  const allStatusLabel =
    t("filters.statusAll") === "filters.statusAll"
      ? "All Status"
      : t("filters.statusAll");
  const allAdminLabel =
    t("filters.adminAll") === "filters.adminAll"
      ? "All Admins"
      : t("filters.adminAll");
  const desktopColumns = canShowAdminFilter
    ? "minmax(0, 1.6fr) minmax(0, 0.92fr) minmax(0, 0.92fr) 52px auto"
    : "minmax(0, 1.8fr) minmax(0, 1fr) 52px auto";

  return (
    <Box
      id="filters"
      position="sticky"
      top={0}
      mx="-6"
      px="6"
      rowGap={4}
      bg={isScrollBlurActive ? "rgba(40, 50, 65, 0.85)" : "transparent"}
      _dark={{
        bg: isScrollBlurActive ? "rgba(40, 50, 65, 0.85)" : "transparent",
        borderColor: isScrollBlurActive
          ? "rgba(255, 255, 255, 0.12)"
          : "transparent",
      }}
      borderBottomWidth="1px"
      borderColor={isScrollBlurActive ? "rgba(255, 255, 255, 0.08)" : "transparent"}
      backdropFilter={isScrollBlurActive ? "blur(8px)" : "none"}
      WebkitBackdropFilter={isScrollBlurActive ? "blur(8px)" : "none"}
      boxShadow={isScrollBlurActive ? "0 8px 20px rgba(0, 0, 0, 0.18)" : "none"}
      transition="background-color .18s ease, backdrop-filter .18s ease, border-color .18s ease, box-shadow .18s ease"
      py={4}
      zIndex="docked"
      borderRadius={isScrollBlurActive ? "16px" : "0"}
      className={isScrollBlurActive ? "glass-header" : ""}
      {...props}
    >
      <Box
        display="grid"
        gridTemplateColumns={{ base: "repeat(2, minmax(0, 1fr))", lg: desktopColumns }}
        gap={3}
        alignItems="center"
      >
        <Box
          gridColumn={{ base: "1", lg: canShowAdminFilter ? "4" : "3" }}
          gridRow={{ base: "1", lg: "1" }}
        >
          <IconButton
            aria-label="refresh users"
            disabled={loading}
            onClick={refetchUsers}
            size="sm"
            variant="outline"
            className="icon-btn"
            w={{ base: "full", lg: "52px" }}
            icon={
              <ReloadIcon
                className={classNames({
                  "animate-spin": loading,
                })}
              />
            }
          />
        </Box>

        <Box
          gridColumn={{ base: "2", lg: canShowAdminFilter ? "5" : "4" }}
          gridRow={{ base: "1", lg: "1" }}
        >
          <Button
            size="sm"
            onClick={() => onCreateUser(true)}
            px={6}
            py={5}
            borderRadius="12px"
            bg="rgba(99, 102, 241, 0.2)"
            color="#818cf8"
            border="1px solid rgba(99, 102, 241, 0.3)"
            fontWeight="600"
            fontSize="13px"
            _dark={{
              bg: "rgba(99, 102, 241, 0.25)",
              color: "#818cf8",
              border: "1px solid rgba(99, 102, 241, 0.4)",
              boxShadow: "0 4px 15px rgba(99, 102, 241, 0.3)",
              _hover: {
                bg: "rgba(99, 102, 241, 0.35)",
                boxShadow: "0 6px 20px rgba(99, 102, 241, 0.4)",
                transform: "translateY(-2px)",
              },
              _active: {
                transform: "translateY(0)",
              },
            }}
            transition="all 0.3s ease"
            w="full"
          >
            + {t("createUser")}
          </Button>
        </Box>

        <Box
          gridColumn={{ base: "1 / -1", lg: "1" }}
          gridRow={{ base: "2", lg: "1" }}
          minW={0}
        >
          <InputGroup w="full">
            <InputLeftElement pointerEvents="none">
              <SearchIcon />
            </InputLeftElement>
            <Input
              placeholder={searchPlaceholder}
              value={search}
              borderColor="light-border"
              _dark={{ bg: "gray.750", borderColor: "gray.600" }}
              onChange={onChange}
            />

            <InputRightElement>
              {loading && <Spinner size="xs" />}
              {filters.search && filters.search.length > 0 && (
                <IconButton
                  onClick={clear}
                  aria-label="clear"
                  size="xs"
                  variant="ghost"
                  icon={<ClearIcon />}
                />
              )}
            </InputRightElement>
          </InputGroup>
        </Box>

        {canShowAdminFilter && (
          <Box
            gridColumn={{ base: "1 / -1", lg: "2" }}
            gridRow={{ base: "3", lg: "1" }}
          >
            <Select
              className="admin-filter-select"
              size="md"
              borderColor="light-border"
              _dark={{ bg: "gray.750", borderColor: "gray.600" }}
              value={selectedValue}
              onChange={onAdminFilterChange}
              w="full"
            >
              <option value="__all__">{allAdminLabel}</option>
              <option value="__sudo_self__">{me?.username} (sudo)</option>
              {admins
                .filter((a) => a.username !== me?.username)
                .map((a) => (
                  <option key={a.username} value={a.username}>
                    {a.username}
                    {a.is_sudo ? " (sudo)" : ""}
                  </option>
                ))}
            </Select>
          </Box>
        )}

        <Box
          gridColumn={{
            base: "1 / -1",
            lg: canShowAdminFilter ? "3" : "2",
          }}
          gridRow={{ base: canShowAdminFilter ? "4" : "3", lg: "1" }}
        >
          <Select
            className="admin-filter-select"
            size="md"
            borderColor="light-border"
            _dark={{ bg: "gray.750", borderColor: "gray.600" }}
            value={filters.status || ""}
            onChange={onStatusFilterChange}
            w="full"
          >
            <option value="">{allStatusLabel}</option>
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="disabled">Disabled</option>
            <option value="limited">Limited</option>
            <option value="expired">Expired</option>
          </Select>
        </Box>
      </Box>
    </Box>
  );
};
