import path from "path";
import { S3 } from "aws-sdk";
import chrome from "chrome-aws-lambda";

const ext = "png";
const ContentType = `image/${ext}`;
const Bucket = process.env.BucketName;
const s3 = new S3({ apiVersion: "2006-03-01" });

// chrome-aws-lambda handles loading locally vs from the Layer
const puppeteer = chrome.puppeteer;

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
    args: chrome.args,
    executablePath: await chrome.executablePath,
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
    Bucket,
    ContentType,
  };

  await s3.putObject(params).promise();
}

async function get(Key) {
  // Disabling S3 lookup on local
  if (process.env.IS_LOCAL) {
    return null;
  }

  const params = { Key, Bucket };

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
