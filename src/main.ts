import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as kms from "@aws-cdk/aws-kms";
import * as route53 from "@aws-cdk/aws-route53";
import * as secrets from "@aws-cdk/aws-secretsmanager";
import * as assert from "assert";
import * as rds from "@aws-cdk/aws-rds";

const id = (name: string) => `aurora-demo-${name}`;

class DatabaseStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }

  cluster(name: string): rds.DatabaseCluster {
    const vpc = ec2.Vpc.fromLookup(this, id("vpc"), {
      isDefault: true,
    });

    const cluster = new rds.DatabaseCluster(this, name, {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      parameterGroup: this.parameterGroup,
      kmsKey: this.kmsKey,
      masterUser: {
        username: "master",
      },
      clusterIdentifier: name,
      instances: 2,
      instanceProps: {
        instanceType: this.instanceType,
        vpc,
      },
    });

    // Polish
    const secret = cluster.node.findChild("Secret").node.defaultChild as secrets.CfnSecret;
    assert(secret instanceof secrets.CfnSecret);

    secret.name = id("credentials");
    secret.description = `Database credentials for ${this.stackName}`;

    return cluster;
  }

  get instanceType() {
    return new ec2.InstanceType("t2.medium"); // Smallest possible
  }

  get parameterGroup() {
    return rds.ParameterGroup.fromParameterGroupName(
      this,
      id("parameter-group"),
      `default.aurora-postgresql10`
    );
  }

  get kmsKey() {
    return new kms.Key(this, id("key"), {
      alias: `alias/${id("key")}`,
    });
  }

  associate(domainName: string, cluster: rds.DatabaseCluster) {

    const zone = route53.HostedZone.fromLookup(this, id('dns'), {
      domainName: 'local.',
    });

    return new route53.CnameRecord(this, domainName, {
      zone,
      domainName: cluster.clusterEndpoint.hostname,
      recordName: domainName
    });
  }
}

function main() {
  const env = { region: "eu-north-1", account: "011252223791" };
  const stackName = id('stack');
  const domainName = `${stackName}.local`;

  const app = new cdk.App();
  const stack = new DatabaseStack(app, stackName, {
    env,
  });

  const cluster = stack.cluster(id("cluster"));
  stack.associate(domainName, cluster);
  app.synth();
}

main();
