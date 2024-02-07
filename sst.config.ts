import type { SSTConfig } from "sst";
import { MyStack } from "./stacks/MyStack";

export default {
  config(_input) {
    return {
      name: "social-cards",
      region: "us-east-1",
    };
  },
  stacks(app) {
    app.setDefaultRemovalPolicy("destroy");

    app.stack(MyStack, {id: "my-stack"});
  },
} satisfies SSTConfig;
