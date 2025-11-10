// api.js — Handles API base URL for both local dev and production

// If you're running locally, your serverless functions will be proxied by Vite
// On Vercel, they automatically live under /api/*
const base =
  import.meta.env.MODE === "development"
    ? "http://localhost:5173/api" // <-- adjust port if your dev runs on another
    : "/api";

export const api = (path = "") => {
  if (!path.startsWith("/")) path = "/" + path;
  return `${base}${path}`;
};
