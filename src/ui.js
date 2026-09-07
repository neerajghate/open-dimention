export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const icons = {
  note: "▤",
  idea: "✧",
  workflow: "☷",
  table: "▦",
  dim: "◇",
};
export const $ = (s) => document.querySelector(s);
export function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function safeSet(key, value) {
  try {
    value === null
      ? localStorage.removeItem(key)
      : localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
