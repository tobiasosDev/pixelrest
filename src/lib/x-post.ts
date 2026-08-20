import { EUploadMimeType, TwitterApi } from "twitter-api-v2";

export interface XCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
}

export function readXCredentials(): XCredentials | null {
  const appKey = process.env.X_CONSUMER_KEY ?? process.env.X_API_KEY;
  const appSecret = process.env.X_CONSUMER_SECRET ?? process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret =
    process.env.X_ACCESS_TOKEN_SECRET ?? process.env.X_ACCESS_SECRET;
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    return null;
  }
  return { appKey, appSecret, accessToken, accessSecret };
}

export async function postImageTweet(options: {
  text: string;
  image: Buffer;
  credentials?: XCredentials | null;
}): Promise<{ id: string }> {
  const credentials = options.credentials ?? readXCredentials();
  if (!credentials) {
    throw new Error("X API credentials are missing");
  }
  const client = new TwitterApi(credentials);
  const mediaId = await client.v2.uploadMedia(options.image, {
    media_type: EUploadMimeType.Png,
    media_category: "tweet_image",
  });
  const posted = await client.v2.tweet({
    text: options.text,
    media: { media_ids: [mediaId] as [string] },
  });
  const id = posted.data.id;
  if (!id) {
    throw new Error("X did not return a post id");
  }
  return { id };
}
