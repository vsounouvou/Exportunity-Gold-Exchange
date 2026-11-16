import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { runRoomSlugContracts, runRoomEntryContracts } from "./room-route-contracts.mjs";

const source = await readFile(new URL("../../client/src/config/chatRooms.ts", import.meta.url), "utf8");
const rooms = await import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(source)).toString("base64"));
const routingSource = await readFile(new URL("../../client/src/lib/workspaceEntry.ts", import.meta.url), "utf8");
const routing = await import("data:text/javascript;base64," + Buffer.from(routingSource).toString("base64"));
const page = await readFile(new URL("../../client/src/pages/AppProRoomPage.tsx", import.meta.url), "utf8");
const start = page.indexOf("export default function AppProRoomPage() {");
const end = page.indexOf("\nfunction AppProRoomContent(", start);
assert.ok(start >= 0 && end > start, "route boundary is present");
const entry = page.slice(start, end).replace("export default function", "function");
const compiled = transformSync(entry, { loader: "tsx", jsx: "transform", target: "es2022" }).code;

test("strict room slugs keep all known aliases and reject unknown/prototype names", () => {
  assert.equal(runRoomSlugContracts(rooms.resolveRoomKeyFromSlug, assert.ok), 44);
});

test("actual React route boundary never mounts room services for invalid or anonymous requests", () => {
  const render = (fixture) => {
    const mounts = [];
    const pathname = fixture.route.replace(":roomKey", fixture.slug);
    const window = { location: { pathname, search: fixture.search, hash: fixture.hash } };
    const Content = ({ roomKey }) => {
      mounts.push(roomKey);
      return React.createElement("span", null, roomKey);
    };
    let destination;
    const Redirect = ({ to }) => { destination = to; return null; };
    const Component = new Function(
      "React", "useSession", "useLocation", "useRoute", "resolveRoomKeyFromSlug",
      "workspaceLoginUrl", "AppProRoomContent", "Redirect", "window",
      compiled + "\nreturn AppProRoomPage;"
    )(
      React, () => ({ isAuthenticated: fixture.authenticated, isGuest: fixture.guest }),
      () => [pathname], (route) => [route === fixture.route, route === fixture.route ? { roomKey: fixture.slug } : null],
      rooms.resolveRoomKeyFromSlug, routing.workspaceLoginUrl, Content, Redirect, window
    );
    const element = Component();
    const html = renderToStaticMarkup(element);
    if (element.type === Redirect) return { view: "login", mounts, to: destination };
    if (element.type === Content) return { view: "room", mounts, key: element.key };
    assert.match(html, /data-testid="unknown-room"/);
    assert.match(html, /Salle introuvable/);
    assert.doesNotMatch(html, /<form|<textarea/);
    return { view: "unknown", mounts, href: element.props.children[2].props.href };
  };
  assert.equal(runRoomEntryContracts(render, assert.ok), 55);
});
