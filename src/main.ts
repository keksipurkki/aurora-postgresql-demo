import * as cdk from "@aws-cdk/core";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as kms from "@aws-cdk/aws-kms";
import * as route53 from "@aws-cdk/aws-route53";
import * as secrets from "@aws-cdk/aws-secretsmanager";
import * as assert from "assert";
import * as rds from "@aws-cdk/aws-rds";

const tag = (name: string) => `aurora-demo-${name}`;

class DatabaseStack extends cdk.Stack {
  vpc: ec2.IVpc;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    this.vpc = ec2.Vpc.fromLookup(this, tag("vpc"), {
      isDefault: true,
    });
  }

  cluster(name: string): rds.DatabaseCluster {
    const cluster = new rds.DatabaseCluster(this, name, {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      port: 5432,
      parameterGroup: this.parameterGroup,
      kmsKey: this.kmsKey,
      masterUser: {
        username: "master",
      },
      clusterIdentifier: name,
      instances: 2,
      instanceProps: {
        instanceType: this.instanceType,
        securityGroup: this.securityGroup,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PUBLIC
        },
        vpc: this.vpc,
      },
    });

    // Polish
    const secret = cluster.node.findChild("Secret").node.defaultChild as secrets.CfnSecret;
    assert(secret instanceof secrets.CfnSecret);

    secret.name = tag("credentials");
    secret.description = `Database credentials for ${this.stackName}`;

    return cluster;
  }

  addBastionHost() {
    const bastion = new ec2.BastionHostLinux(this, tag("bastion"), {
      vpc: this.vpc,
      instanceType: new ec2.InstanceType("t3.nano"),
      instanceName: tag("bastion"),
    });

    bastion.allowSshAccessFrom(ec2.Peer.anyIpv4());
    bastion.instance.instance.keyName = `aurora-demo-bastion`;

    return bastion;
  }

  get instanceType() {
    return new ec2.InstanceType("t3.medium"); // Smallest possible
  }

  get parameterGroup() {
    return rds.ParameterGroup.fromParameterGroupName(
      this,
      tag("parameter-group"),
      `default.aurora-postgresql10`
    );
  }

  get kmsKey() {
    return new kms.Key(this, tag("key"), {
      alias: `alias/${tag("key")}`,
    });
  }

  get securityGroup() {
    const name = tag("sg");

    const sg = new ec2.SecurityGroup(this, name, {
      vpc: this.vpc,
      securityGroupName: name,
    });

    sg.connections.allowFrom(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      `Access to the database`
    );

    return sg;
  }

  associate(domainName: string, cluster: rds.DatabaseCluster) {
    const zone = route53.HostedZone.fromLookup(this, tag("dns"), {
      domainName: "keksipurkki.net",
      privateZone: false,
    });

    return new route53.CnameRecord(this, domainName, {
      zone,
      domainName: cluster.clusterEndpoint.hostname,
      recordName: domainName,
    });
  }
}

function main() {
  const env = { region: "eu-north-1", account: "011252223791" };
  const stackName = tag("stack");
  const domainName = `aurora`; // aurora.keksipurkki.net

  const app = new cdk.App();
  const stack = new DatabaseStack(app, stackName, {
    env,
  });

  const cluster = stack.cluster(tag("cluster"));
  stack.associate(domainName, cluster);
  stack.addBastionHost();
  app.synth();
}

main();
