import { Header } from "components/Header";
import { Footer } from "components/Footer";
import { TrafficManager } from "components/TrafficManager";
import { FC } from "react";

export const TrafficPage: FC = () => {
  return (
    <>
      <Header />
      <TrafficManager />
      <Footer />
    </>
  );
};
