import { redirect } from "next/navigation";

// Root redirects to event-types (the main admin view)
export default function Home() {
  redirect("/event-types");
}
