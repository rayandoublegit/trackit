import { redirect } from "next/navigation";

// The staff console moved into the /admin shell.
export default function AdminConsoleRedirect() {
  redirect("/admin/users");
}
