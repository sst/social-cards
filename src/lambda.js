import path from "path";
import { S3 } from "aws-sdk";
import chrome from "chrome-aws-lambda";

const ContentType = "image/png";
const Bucket = process.env.BucketName;
const s3 = new S3({ apiVersion: "2006-03-01" });

// chrome-aws-lambda handles loading locally vs from the Layer
const puppeteer = chrome.puppeteer;

export async function handler(event) {
  const uri = event.requestContext.http.path;
  // S3 file keys are like paths, we don't want a leading "/"
  const key = uri.replace(/^\//, "");

  // Check the S3 bucket
  const fromBucket = await get(key);

  // Return from the bucket
  if (fromBucket) {
    return createResponse(fromBucket);
  }

  const pathParameters = parsePathParameters(event.pathParameters.path);

  if (pathParameters === null) {
    return createErrorResponse();
  }

  const { title, options, template } = pathParameters;

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
 * Route patterns to match:
 *
 * /$template/$title.png
 * /$template/$options/$title.png
 *
 * Returns an object with:
 *
 * { template, options, title }
 *
 */
function parsePathParameters(path) {
  let parts = path.split("/");

  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  if (parts.length === 2) {
    parts = [parts[0], null, parts[1]];
  }

  if (!parts[2].endsWith(".png")) {
    return null;
  }

  const encodedTitle = parts[2].replace(/\.png$/, "");
  const buffer = Buffer.from(encodedTitle, "base64");

  return {
    template: parts[0],
    options: parts[1] ? parseOptions(parts[1]) : "",
    title: decodeURIComponent(buffer.toString("ascii")),
  };
}

/**
 * Parse a string that looks like:
 *
 * option1_value1-option2_value2
 *
 * Returns a querystring
 *
 * option1=value1&option2=value2
 */
function parseOptions(optionsStr) {
  const parts = optionsStr.split("-");

  const options = parts.map((part) => {
    const [key, value] = part.split("_");
    return `${key}=${encodeURIComponent(value)}`;
  });

  return options.join("&");
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

  const params = {
    Key,
    Bucket,
  };

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
