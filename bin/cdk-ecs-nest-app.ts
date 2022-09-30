#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkEcsNestAppStack } from "../lib/cdk-ecs-nest-app-stack";

const app = new cdk.App();
new CdkEcsNestAppStack(app, "CdkEcsNestAppStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
