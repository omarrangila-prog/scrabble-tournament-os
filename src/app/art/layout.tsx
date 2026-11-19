import type { Metadata } from "next";

/* Opened from WhatsApp far more than browsed to, so the link preview is what most people see first. */
export const metadata: Metadata = {
  title: "Art Activity Registration",
  description: "Canvas Painting or Tote Bag Printing, Rs. 1,000 each. Choose one or both and reserve your spot.",
  alternates: { canonical: "/art/register" },
  openGraph: {
    type: "website",
    title: "Art Activity Registration",
    description: "Canvas Painting · Tote Bag Printing / Painting. Rs. 1,000 each, Rs. 2,000 for both. Reserve your spot.",
    url: "/art/register",
  },
};

export default function ArtLayout({ children }: { children: React.ReactNode }) {
  return children;
}
