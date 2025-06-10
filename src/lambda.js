import path from "path";
import { S3 } from "aws-sdk";
import puppeteer from "puppeteer-core";
import { Bucket } from "sst/node/bucket";
import chromium from "@sparticuz/chromium";

const ext = "png";
const ContentType = `image/${ext}`;
const s3 = new S3({ apiVersion: "2006-03-01" });

// This is the path to the local Chromium binary
const YOUR_LOCAL_CHROMIUM_PATH =
  "/tmp/localChromium/chromium/mac_arm-1471750/chrome-mac/Chromium.app/Contents/MacOS/Chromium";
//"/tmp/localChromium/chromium/mac-1165945/chrome-mac/Chromium.app/Contents/MacOS/Chromium";

export async function handler(event) {
  const { file, template } = event.pathParameters;

  const title = parseTitle(file);

  // Check if it's a valid request
  if (file === null) {
    return createErrorResponse();
  }

  const options = event.rawQueryString;
  const key = generateS3Key(template, title, options);

  // Check the S3 bucket
  const fromBucket = await get(key);

  // Return from the bucket
  if (fromBucket) {
    return createResponse(fromBucket);
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: process.env.IS_LOCAL
      ? YOUR_LOCAL_CHROMIUM_PATH
      : await chromium.executablePath(),
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1200,
    height: 630,
  });

  // Navigate to the url
  await page.goto(
    `file:${path.join(
      process.cwd(),
      `templates/${template}.html`
    )}?title=${title}&${options}`
  );

  // Wait for page to complete loading
  await page.evaluate("document.fonts.ready");

  // Take screenshot
  const buffer = await page.screenshot();

  // Upload to the bucket
  await upload(key, buffer);

  return createResponse(buffer);
}

/**
 * Parse a base64 url encoded string of the format
 *
 * $title.png
 *
 */
function parseTitle(file) {
  const extension = `.${ext}`;

  if (!file.endsWith(extension)) {
    return null;
  }

  // Remove the .png extension
  const encodedTitle = file.slice(0, -1 * extension.length);

  const buffer = Buffer.from(encodedTitle, "base64");

  return decodeURIComponent(buffer.toString("ascii"));
}

/**
 * Generate a S3 safe key using the path parameters and query string options
 */
function generateS3Key(template, title, options) {
  const parts = [
    template,
    ...(options !== "" ? [encodeURIComponent(options)] : []),
    `${encodeURIComponent(title)}.${ext}`,
  ];

  return parts.join("/");
}

async function upload(Key, Body) {
  const params = {
    Key,
    Body,
    ContentType,
    Bucket: Bucket.WebsiteBucket.bucketName,
  };

  await s3.putObject(params).promise();
}

async function get(Key) {
  // Disabling S3 lookup on local
  if (process.env.IS_LOCAL) {
    return null;
  }

  const params = { Key, Bucket: Bucket.WebsiteBucket.bucketName };

  try {
    const { Body } = await s3.getObject(params).promise();
    return Body;
  } catch (e) {
    return null;
  }
}

function createResponse(buffer) {
  return {
    statusCode: 200,
    // Return as binary data
    isBase64Encoded: true,
    body: buffer.toString("base64"),
    headers: { "Content-Type": ContentType },
  };
}

function createErrorResponse() {
  return {
    statusCode: 500,
    body: "Invalid request",
  };
}
