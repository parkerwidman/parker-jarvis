import "server-only";

import { cookies } from "next/headers";
import {
  JARVIS_WORKSPACE_COOKIE,
  parseJarvisWorkspace,
  type JarvisWorkspace,
} from "./jarvis-workspace";

export async function readJarvisWorkspaceFromCookies(): Promise<JarvisWorkspace> {
  const cookieStore = await cookies();
  const value = cookieStore.get(JARVIS_WORKSPACE_COOKIE)?.value ?? null;
  return parseJarvisWorkspace(value);
}
