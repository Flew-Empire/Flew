export const getAuthToken = () => {
  return localStorage.getItem("token");
};

export const setAuthToken = (token: string) => {
  localStorage.setItem("token", token);
};

export const removeAuthToken = () => {
  localStorage.removeItem("token");
};

const getDashboardBasePath = () => {
  if (typeof window === "undefined") {
    return "/";
  }

  const pathname = window.location.pathname || "/";
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
};

export const buildDashboardUrl = (hashPath = "/") => {
  const normalizedHash = hashPath.startsWith("/") ? hashPath : `/${hashPath}`;
  return `${getDashboardBasePath()}#${normalizedHash}`;
};
