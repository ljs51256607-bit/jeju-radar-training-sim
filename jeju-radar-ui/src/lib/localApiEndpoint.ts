const loopbackHostnames = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function localApiEndpoint(pathname: string) {
  if (typeof window === "undefined") {
    return pathname;
  }

  const { hostname, port, protocol } = window.location;

  if (!port || (protocol !== "http:" && protocol !== "https:") || loopbackHostnames.has(hostname)) {
    return pathname;
  }

  return `${protocol}//127.0.0.1:${port}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}
