import { redirect } from "next/navigation";

/* The short link people will type. */
export default function ArtIndex() {
  redirect("/art/register");
}
