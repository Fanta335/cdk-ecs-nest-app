import { aws_ec2 as ec2, aws_ecs as ecs, aws_ecr as ecr, aws_iam as iam, aws_elasticloadbalancingv2 as elbv2, Stack, StackProps, Duration } from "aws-cdk-lib";
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

    // VPC endpoint
    const ECSPrivateLinkAPI = new ec2.InterfaceVpcEndpoint(this, "ECSPrivateLinkAPI", {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${REGION}.ecr.api`),
      securityGroups: [securityGroupPrivateLink],
      privateDnsEnabled: true,
    });
    const ECSPrivateLinkDKR = new ec2.InterfaceVpcEndpoint(this, "ECSPrivateLinkDKR", {
      vpc,
      service: new ec2.InterfaceVpcEndpointService(`com.amazonaws.${REGION}.ecr.dkr`),
      securityGroups: [securityGroupPrivateLink],
      privateDnsEnabled: true,
    });
    const ECSPrivateLinkS3 = new ec2.GatewayVpcEndpoint(this, "ECSPrivateLinkS3", {
      vpc,
      service: ec2.GatewayVpcEndpointAwsService.S3,
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

    const container = fargateTaskDefinition.addContainer("Container", {
      containerName: "CdkEcsNestAppContainer",
      image: ecs.ContainerImage.fromEcrRepository(repository),
    });

    container.addPortMappings({
      hostPort: 3000,
      containerPort: 3000,
      protocol: ecs.Protocol.TCP,
    });

    const cluster = new ecs.Cluster(this, "fargate-cluster", {
      vpc,
      clusterName: "fargateCluster",
    });

    const service = new ecs.FargateService(this, "FargateService", {
      cluster,
      serviceName: "fargateService",
      taskDefinition: fargateTaskDefinition,
      securityGroups: [securityGroupApp],
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    listener.addTargets("ECS", {
      port: 80,
      targets: [
        service.loadBalancerTarget({
          containerName: container.containerName,
          containerPort: 3000,
        }),
      ],
    });

    const autoScaling = service.autoScaleTaskCount({
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
