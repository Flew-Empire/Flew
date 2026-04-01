import { getAuthToken } from "utils/authStorage";
import { fetch } from "service/http";
import { UserApi, UseGetUserReturn } from "types/User";
import { useQuery } from "react-query";

const fetchUser = async () => {
  return await fetch("/admin");
};

const useGetUser = (): UseGetUserReturn => {
  const hasToken = Boolean(getAuthToken());
  const { data, isError, isLoading, isSuccess, error } = useQuery<UserApi, Error>(
    {
      queryKey: ["admin-self"],
      queryFn: fetchUser,
      enabled: hasToken,
      staleTime: 30_000,
      cacheTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      retry: 1,
    }
  );

  const userDataEmpty: UserApi = {
    discord_webook: "",
    is_sudo: false,
    is_primary_sudo: false,
    telegram_id: "",
    username: "",
  };

  return {
    userData: data || userDataEmpty,
    getUserIsPending: hasToken ? isLoading : false,
    getUserIsSuccess: hasToken ? isSuccess : false,
    getUserIsError: hasToken ? isError : false,
    getUserError: hasToken ? error : null,
  };
};

export default useGetUser;
