import { Fn, Duration, RemovalPolicy } from "@aws-cdk/core";
import * as cf from "@aws-cdk/aws-cloudfront";
import * as route53 from "@aws-cdk/aws-route53";
import { LayerVersion } from "@aws-cdk/aws-lambda";
import { HttpOrigin } from "@aws-cdk/aws-cloudfront-origins";
import { CloudFrontTarget } from "@aws-cdk/aws-route53-targets";
import { DnsValidatedCertificate } from "@aws-cdk/aws-certificatemanager";
import * as sst from "@serverless-stack/resources";

const rootDomain = "serverless-stack.com";
const domainName = `social-cards.${rootDomain}`;
const layerArn =
  "arn:aws:lambda:us-east-1:764866452798:layer:chrome-aws-lambda:22";

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    let hostedZone;
    let domainProps = {};

    const useCustomDomain = scope.stage === "prod";
    const layer = LayerVersion.fromLayerVersionArn(this, "Layer", layerArn);

    // Create S3 bucket to store generated images
    const bucket = new sst.Bucket(this, "WebsiteBucket", {
      s3Bucket: {
        // Delete everything on remove
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      },
    });

    // Create a HTTP API
    const api = new sst.Api(this, "Api", {
      routes: {
        "GET /{path+}": {
          function: {
            handler: "src/lambda.handler",
            // Increase the timeout for generating screenshots
            timeout: 15,
            // Load Chrome in a Layer
            layers: [layer],
            // Pass bucket name to function
            environment: {
              BucketName: bucket.bucketName,
            },
            bundle: {
              // Copy over templates
              copyFiles: [
                {
                  from: "templates",
                  to: "templates",
                },
              ],
              // Exclude bundling it in the Lambda function
              externalModules: ["chrome-aws-lambda"],
            },
          },
        },
      },
    });

    // Allow API to access bucket
    api.attachPermissions([bucket]);

    if (useCustomDomain) {
      // Lookup domain hosted zone
      hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: rootDomain,
      });

      // Create ACM certificate
      const certificate = new DnsValidatedCertificate(this, "Certificate", {
        domainName,
        hostedZone,
        region: "us-east-1",
      });

      domainProps = {
        ...domainProps,
        certificate,
        domainNames: [domainName],
      };
    }

    // Create CloudFront Distribution
    const distribution = new cf.Distribution(this, "WebsiteCdn", {
      ...domainProps,
      defaultBehavior: {
        origin: new HttpOrigin(Fn.parseDomainName(api.url)),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: new cf.CachePolicy(this, "WebsiteCachePolicy", {
          // Set cache duration to 1 year
          minTtl: Duration.seconds(31536000),
        }),
      },
    });

    if (useCustomDomain) {
      // Create DNS record
      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(
          new CloudFrontTarget(distribution)
        ),
      });
    }

    // Show the endpoint in the output
    this.addOutputs({
      ApiEndpoint: api.url,
      BucketName: bucket.bucketName,
      SiteEndpoint: `https://${
        useCustomDomain ? domainName : distribution.distributionDomainName
      }`,
    });
  }
}
