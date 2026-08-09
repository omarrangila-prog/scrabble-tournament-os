import type { Metadata } from "next";
import { Toaster } from "@/components/shell/Toaster";

export const metadata: Metadata = {
  title: "Player — Blufy's AlphaBattle Championship 2026",
  description: "Your pairing, board number, results and standings.",
};

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
