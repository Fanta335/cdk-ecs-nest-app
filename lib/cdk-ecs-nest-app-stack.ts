import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_iam as iam,
  aws_rds as rds,
  aws_secretsmanager as secretsmanager,
  aws_elasticloadbalancingv2 as elbv2,
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
} from "aws-cdk-lib";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as ecrdeploy from "cdk-ecr-deployment";
import * as path from "path";
import { Construct } from "constructs";

export class CdkEcsNestAppStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const ACCOUNT = props.env?.account;
    const REGION = props.env?.region;

    // VPC
    const vpc = new ec2.Vpc(this, "VPC", {
      cidr: "10.0.0.0/16",
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Security groups
    // SG for ELB
    const securityGroupELB = new ec2.SecurityGroup(this, "SecurityGroupELB", {
      vpc,
      description: "Security group ELB",
      securityGroupName: "SGELB",
    });
    securityGroupELB.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "Allow all HTTP connection");

    // SG for application on ECS
    const securityGroupApp = new ec2.SecurityGroup(this, "SecurityGroupApp", {
      vpc,
      description: "Security group App",
      securityGroupName: "SGAPP",
    });
    securityGroupApp.addIngressRule(securityGroupELB, ec2.Port.tcp(3000), "Allow HTTP connection from ELB");

    // SG for VPC endpoint
    const securityGroupPrivateLink = new ec2.SecurityGroup(this, "SecurityGroupPrivateLink", {
      vpc,
      description: "Security group private link",
      securityGroupName: "SGPL",
    });

    // SG for Bastion host
    const securityGroupBastion = new ec2.SecurityGroup(this, "SecurityGroupBastion", {
      vpc,
      description: "Security group Bastion",
      securityGroupName: "SGBastion",
    });
    securityGroupBastion.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), "Allow SSH connection from ");

    // SG for RDS
    const securityGroupRDS = new ec2.SecurityGroup(this, "SecurityGroupRDS", {
      vpc,
      description: "Security group RDS",
      securityGroupName: "SGRDS",
    });
    securityGroupRDS.addIngressRule(securityGroupApp, ec2.Port.tcp(3306), "Allow MySQL connection from App");
    securityGroupRDS.addIngressRule(securityGroupBastion, ec2.Port.tcp(3306), "Allow MySQL connection from Bastion");

    // VPC endpoint
    new ec2.InterfaceVpcEndpoint(this, "ECSPrivateLinkAPI", {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${REGION}.ecr.api`),
      securityGroups: [securityGroupPrivateLink],
      privateDnsEnabled: true,
    });
    new ec2.InterfaceVpcEndpoint(this, "ECSPrivateLinkDKR", {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${REGION}.ecr.dkr`),
      securityGroups: [securityGroupPrivateLink],
      privateDnsEnabled: true,
    });
    new ec2.GatewayVpcEndpoint(this, "ECSPrivateLinkS3", {
      vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
    });
    new ec2.InterfaceVpcEndpoint(this, "SecretsManagerPrivateLink", {
      vpc,
      service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
      securityGroups: [securityGroupPrivateLink],
    });
    // new ec2.InterfaceVpcEndpoint(this, "ECSPrivateLinkLogs", {
    //   vpc,
    //   service: new ec2.InterfaceVpcEndpointService("com.amazonaws.ap-northeast-1.logs"),
    //   securityGroups: [securityGroupPrivateLink],
    // });

    // Bastion host
    const bastionHost = new ec2.BastionHostLinux(this, "BastionHost", {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      securityGroup: securityGroupBastion,
      subnetSelection: {
        subnetType: ec2.SubnetType.PUBLIC,
      },
    });
    bastionHost.instance.addUserData("yum -y update", "yum install -y mysql jq");

    // RDS Credentials
    const databaseCredentialSecret = new secretsmanager.Secret(this, "databaseCredentialSecret", {
      secretName: "rds-secrets",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: "dbuser",
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: "password",
      },
    });

    // RDS
    const rdsInstance = new rds.DatabaseInstance(this, "RDSInstance", {
      engine: rds.DatabaseInstanceEngine.MYSQL,
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      securityGroups: [securityGroupRDS],
      // multiAz: true,
      removalPolicy: RemovalPolicy.DESTROY,
      credentials: rds.Credentials.fromSecret(databaseCredentialSecret),
      deletionProtection: false,
      parameterGroup: new rds.ParameterGroup(this, "ParameterGroup", {
        engine: rds.DatabaseInstanceEngine.mysql({
          version: rds.MysqlEngineVersion.VER_8_0_26,
        }),
        parameters: {
          character_set_client: "utf8mb4",
          character_set_server: "utf8mb4",
        },
      }),
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "ALB", {
      vpc,
      securityGroup: securityGroupELB,
      internetFacing: true,
      loadBalancerName: "ALB",
    });

    const listener = alb.addListener("Listener", {
      port: 80,
    });

    // create ECR repository
    const repository = new ecr.Repository(this, "Repository", {
      repositoryName: "cdk-ecs-nest-app",
    });

    // ECR image
    const image = new DockerImageAsset(this, "DockerImageAsset", {
      directory: path.join(__dirname, "../api"),
    });

    // ECR deployment
    new ecrdeploy.ECRDeployment(this, "ECRDeployment", {
      src: new ecrdeploy.DockerImageName(image.imageUri),
      dest: new ecrdeploy.DockerImageName(`${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/${repository.repositoryName}`),
    });

    // ECS Task definition
    const fargateTaskDefinition = new ecs.FargateTaskDefinition(this, "FargateTaskDefinition", {
      memoryLimitMiB: 2048,
      cpu: 1024,
    });

    fargateTaskDefinition.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters", "secretsmanager:GetSecretValue", "kms:Decrypt"],
        resources: [databaseCredentialSecret.secretArn],
      })
    );

    const container = fargateTaskDefinition.addContainer("Container", {
      containerName: "CdkEcsNestAppContainer",
      image: ecs.ContainerImage.fromEcrRepository(repository),
      portMappings: [
        {
          hostPort: 3000,
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
      secrets: {
        PASSWORD: ecs.Secret.fromSecretsManager(databaseCredentialSecret, "password"),
        PORT: ecs.Secret.fromSecretsManager(databaseCredentialSecret, "port"),
        HOST: ecs.Secret.fromSecretsManager(databaseCredentialSecret, "host"),
        USERNAME: ecs.Secret.fromSecretsManager(databaseCredentialSecret, "username"),
        DBNAME: ecs.Secret.fromSecretsManager(databaseCredentialSecret, "dbname"),
      },
    });

    const cluster = new ecs.Cluster(this, "fargate-cluster", {
      vpc,
      clusterName: "fargateCluster",
    });

    const fargateService = new ecs.FargateService(this, "FargateService", {
      cluster,
      serviceName: "fargateService",
      desiredCount: 1, // Temp val for testing
      taskDefinition: fargateTaskDefinition,
      securityGroups: [securityGroupApp],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const cfnService = fargateService.node.tryFindChild("Service") as ecs.CfnService;
    cfnService.launchType = undefined;
    cfnService.capacityProviderStrategy = [
      { capacityProvider: "FARGATE_SPOT", weight: 2 },
      { capacityProvider: "FARGATE", weight: 1 },
    ];

    listener.addTargets("ECS", {
      port: 80,
      targets: [
        fargateService.loadBalancerTarget({
          containerName: container.containerName,
          containerPort: 3000,
        }),
      ],
    });

    const autoScaling = fargateService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 2,
    });
    autoScaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });
    autoScaling.scaleOnMemoryUtilization("MemoryScaling", {
      targetUtilizationPercent: 50,
      scaleInCooldown: Duration.seconds(60),
      scaleOutCooldown: Duration.seconds(60),
    });
  }
}
