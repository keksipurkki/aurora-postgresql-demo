import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as secrets from '@aws-cdk/aws-secretsmanager';
import * as assert from 'assert';
import * as rds from '@aws-cdk/aws-rds';

const id = (name: string) => `aurora-demo-${name}`;

class DatabaseStack extends cdk.Stack {

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
  }

  cluster(name: string): rds.DatabaseCluster {

    const vpc = ec2.Vpc.fromLookup(this, id('vpc'), {
      isDefault: true
    });

    const cluster = new rds.DatabaseCluster(this, name, {
      engine: rds.DatabaseClusterEngine.AURORA_POSTGRESQL,
      masterUser: {
        username: 'admin'
      },
      clusterIdentifier: name,
      instances: 2,
      instanceProps: {
        instanceType: this.instanceType,
        vpc
      }
    });

    // Polish
    const secret = cluster.node.findChild('Secret').node.defaultChild as secrets.CfnSecret;
    assert(secret instanceof secrets.CfnSecret);

    secret.name = id('credentials');
    secret.description = `Database credentials for ${this.stackName}`;

    return cluster;
  }

  get instanceType() {
    return new ec2.InstanceType('t2.small');
  }

}

function main() {

  const env = { region: "eu-north-1", account: "011252223791" };

  const app = new cdk.App();
  const stack = new DatabaseStack(app, id('stack'), {
    env
  });

  console.log(`Constructed ${stack.cluster(id('cluster'))}`);
  app.synth();

}

main();
