import { FC } from "react";
import { CryptoLinkModal } from "components/CryptoLinkModal";

export const CryptoLinkSettingsPage: FC = () => {
  return <CryptoLinkModal mode="page" view="settings" />;
};

export default CryptoLinkSettingsPage;
