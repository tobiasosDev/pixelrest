import { TwitterApi } from "twitter-api-v2";
import { supabaseAdmin } from "./supabase";
import { readXCredentials, type XCredentials } from "./x-post";

export function xCallbackUrl(): string {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL || "https://pixelrest.com";
  return `${origin.replace(/\/$/, "")}/api/x/callback`;
}

export function appXKeys(): { appKey: string; appSecret: string } | null {
  const appKey = process.env.X_CONSUMER_KEY ?? process.env.X_API_KEY;
  const appSecret = process.env.X_CONSUMER_SECRET ?? process.env.X_API_SECRET;
  if (!appKey || !appSecret) {
    return null;
  }
  return { appKey, appSecret };
}

export async function saveOAuthPending(options: {
  oauthToken: string;
  oauthTokenSecret: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("x_oauth_pending").upsert({
    oauth_token: options.oauthToken,
    oauth_token_secret: options.oauthTokenSecret,
  });
  if (error) {
    throw error;
  }
}

export async function takeOAuthPending(
  oauthToken: string,
): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("x_oauth_pending")
    .select("oauth_token_secret")
    .eq("oauth_token", oauthToken)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  await admin.from("x_oauth_pending").delete().eq("oauth_token", oauthToken);
  return data.oauth_token_secret as string;
}

export async function saveXUser(options: {
  accessToken: string;
  accessSecret: string;
  userId?: string;
  screenName?: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("x_auth").upsert({
    id: 1,
    access_token: options.accessToken,
    access_secret: options.accessSecret,
    user_id: options.userId ?? null,
    screen_name: options.screenName ?? null,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw error;
  }
}

export async function loadStoredXUser(): Promise<{
  accessToken: string;
  accessSecret: string;
  screenName: string | null;
} | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("x_auth")
    .select("access_token,access_secret,screen_name")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data?.access_token || !data?.access_secret) {
    return null;
  }
  return {
    accessToken: data.access_token as string,
    accessSecret: data.access_secret as string,
    screenName: (data.screen_name as string | null) ?? null,
  };
}

export async function resolveXCredentials(): Promise<XCredentials | null> {
  const fromEnv = readXCredentials();
  if (fromEnv) {
    return fromEnv;
  }
  const app = appXKeys();
  const stored = await loadStoredXUser();
  if (!app || !stored) {
    return null;
  }
  return {
    appKey: app.appKey,
    appSecret: app.appSecret,
    accessToken: stored.accessToken,
    accessSecret: stored.accessSecret,
  };
}

export async function startXConnect(): Promise<string> {
  const app = appXKeys();
  if (!app) {
    throw new Error("X consumer keys are missing");
  }
  const client = new TwitterApi({
    appKey: app.appKey,
    appSecret: app.appSecret,
  });
  const link = await client.generateAuthLink(xCallbackUrl(), {
    authAccessType: "write",
    linkMode: "authorize",
  });
  await saveOAuthPending({
    oauthToken: link.oauth_token,
    oauthTokenSecret: link.oauth_token_secret,
  });
  return link.url;
}

export async function finishXConnect(options: {
  oauthToken: string;
  oauthVerifier: string;
}): Promise<{ screenName: string | null }> {
  const app = appXKeys();
  if (!app) {
    throw new Error("X consumer keys are missing");
  }
  const requestSecret = await takeOAuthPending(options.oauthToken);
  if (!requestSecret) {
    throw new Error("OAuth session expired. Start connect again.");
  }
  const client = new TwitterApi({
    appKey: app.appKey,
    appSecret: app.appSecret,
    accessToken: options.oauthToken,
    accessSecret: requestSecret,
  });
  const logged = await client.login(options.oauthVerifier);
  await saveXUser({
    accessToken: logged.accessToken,
    accessSecret: logged.accessSecret,
    userId: logged.userId,
    screenName: logged.screenName,
  });
  return { screenName: logged.screenName ?? null };
}
