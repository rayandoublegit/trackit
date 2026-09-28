import { redirect } from "next/navigation";

// Catalog stats moved into the /admin shell.
export default function AdminStatsRedirect() {
  redirect("/admin/catalog");
}
