const NUM_USERS_PER_PAGE_LOCAL_STORAGE_KEY = "flew-num-users-per-page";
const NUM_USERS_PER_PAGE_DEFAULT = 10;
const ALLOWED_PAGE_SIZES = [10, 20, 30];

const normalizeUsersPerPage = (value: unknown) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (ALLOWED_PAGE_SIZES.includes(parsed)) {
    return parsed;
  }
  return NUM_USERS_PER_PAGE_DEFAULT;
};

export const getUsersPerPageLimitSize = () => {
  const normalized = normalizeUsersPerPage(
    localStorage.getItem(NUM_USERS_PER_PAGE_LOCAL_STORAGE_KEY)
  );
  localStorage.setItem(NUM_USERS_PER_PAGE_LOCAL_STORAGE_KEY, String(normalized));
  return normalized;
};

export const setUsersPerPageLimitSize = (value: string) => {
  const normalized = normalizeUsersPerPage(value);
  return localStorage.setItem(NUM_USERS_PER_PAGE_LOCAL_STORAGE_KEY, String(normalized));
};
