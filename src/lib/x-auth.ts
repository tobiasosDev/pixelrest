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

export function oauth2App(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
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
  accessSecret?: string | null;
  refreshToken?: string | null;
  userId?: string;
  screenName?: string;
}): Promise<void> {
  const admin = supabaseAdmin();
  const { error } = await admin.from("x_auth").upsert({
    id: 1,
    access_token: options.accessToken,
    access_secret: options.accessSecret ?? "",
    refresh_token: options.refreshToken ?? null,
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
  refreshToken: string | null;
  screenName: string | null;
} | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("x_auth")
    .select("access_token,access_secret,refresh_token,screen_name")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data?.access_token) {
    return null;
  }
  return {
    accessToken: data.access_token as string,
    accessSecret: (data.access_secret as string | null) ?? "",
    refreshToken: (data.refresh_token as string | null) ?? null,
    screenName: (data.screen_name as string | null) ?? null,
  };
}

export async function resolveXCredentials(): Promise<XCredentials | null> {
  const fromEnv = readXCredentials();
  if (fromEnv) {
    return fromEnv;
  }
  const stored = await loadStoredXUser();
  if (!stored) {
    return null;
  }
  const oauth2 = oauth2App();
  if (stored.refreshToken && oauth2) {
    const client = new TwitterApi({
      clientId: oauth2.clientId,
      clientSecret: oauth2.clientSecret,
    });
    const refreshed = await client.refreshOAuth2Token(stored.refreshToken);
    await saveXUser({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      screenName: stored.screenName ?? undefined,
    });
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      clientId: oauth2.clientId,
      clientSecret: oauth2.clientSecret,
    };
  }
  const app = appXKeys();
  if (!app || !stored.accessSecret) {
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
  const oauth2 = oauth2App();
  if (oauth2) {
    const client = new TwitterApi({
      clientId: oauth2.clientId,
      clientSecret: oauth2.clientSecret,
    });
    const link = client.generateOAuth2AuthLink(xCallbackUrl(), {
      scope: [
        "tweet.read",
        "tweet.write",
        "users.read",
        "offline.access",
        "media.write",
      ],
    });
    await saveOAuthPending({
      oauthToken: link.state,
      oauthTokenSecret: link.codeVerifier,
    });
    return link.url;
  }
  const app = appXKeys();
  if (!app) {
    throw new Error("X client keys are missing");
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

export async function finishXConnectOAuth2(options: {
  state: string;
  code: string;
}): Promise<{ screenName: string | null }> {
  const oauth2 = oauth2App();
  if (!oauth2) {
    throw new Error("X client keys are missing");
  }
  const codeVerifier = await takeOAuthPending(options.state);
  if (!codeVerifier) {
    throw new Error("OAuth session expired. Start connect again.");
  }
  const client = new TwitterApi({
    clientId: oauth2.clientId,
    clientSecret: oauth2.clientSecret,
  });
  const logged = await client.loginWithOAuth2({
    code: options.code,
    codeVerifier,
    redirectUri: xCallbackUrl(),
  });
  let screenName: string | null = null;
  let userId: string | undefined;
  try {
    const me = await logged.client.v2.me();
    screenName = me.data.username ?? null;
    userId = me.data.id;
  } catch {
    screenName = null;
  }
  await saveXUser({
    accessToken: logged.accessToken,
    refreshToken: logged.refreshToken ?? null,
    userId,
    screenName: screenName ?? undefined,
  });
  return { screenName };
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
