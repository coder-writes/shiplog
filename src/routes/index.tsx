import { createFileRoute, redirect } from "@tanstack/react-router";

// "/" always goes to the daily log; the signed-in gate sends visitors to /auth.
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShipLog: your daily developer work log" },
      {
        name: "description",
        content: "Dictate your day, pull in GitHub activity, and turn it into standups and a brag doc.",
      },
      { property: "og:title", content: "ShipLog: your daily developer work log" },
      {
        property: "og:description",
        content: "Dictate your day, pull in GitHub activity, and turn it into standups and a brag doc.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/log" });
  },
});
