import { io, type Socket } from "socket.io-client";

import { getSocketBaseUrl } from "@/lib/runtimeConfig";

let activeSocket: Socket | null = null;
let activeToken = "";

export function getAgoojiyeChatSocket() {
  const token = localStorage.getItem("ece_session") || "";
  if (activeSocket && activeToken === token) return activeSocket;
  activeSocket?.disconnect();
  activeToken = token;
  activeSocket = io(`${getSocketBaseUrl() || ""}/agoojye-workos`, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 8,
    timeout: 10_000,
  });
  return activeSocket;
}

export function closeAgoojiyeChatSocket() {
  activeSocket?.disconnect();
  activeSocket = null;
  activeToken = "";
}
