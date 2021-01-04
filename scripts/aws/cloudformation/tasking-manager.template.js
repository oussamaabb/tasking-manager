const cf = require('@mapbox/cloudfriend');

const Parameters = {
  GitSha: {
    Type: 'String'
  },
  NetworkEnvironment: {
    Type :'String',
    AllowedValues: ['staging', 'production']
  },
  AutoscalingPolicy: {
    Type: 'String',
    AllowedValues: ['development', 'demo', 'production'],
    Description: "development: min 1, max 1 instance; demo: min 1 max 3 instances; production: min 2 max 9 instances"
  },
  DBSnapshot: {
    Type: 'String',
    Description: 'Specify an RDS snapshot ID, if you want to create the DB from a snapshot.',
    Default: ''
  },
  DatabaseDump: {
    Type: 'String',
    Description: 'Path to database dump on S3; Ex: s3://my-bkt/tm.sql'
  },
  NewRelicLicense: {
    Type: 'String',
    Description: 'NEW_RELIC_LICENSE'
  },
  PostgresDB: {
    Type: 'String',
    Description: 'POSTGRES_DB'
  },
  PostgresPassword: {
    Type: 'String',
    Description: 'POSTGRES_PASSWORD'
  },
  PostgresUser: {
    Type: 'String',
    Description: 'POSTGRES_USER'
  },
  DatabaseSize: {
    Description: 'Database size in GB',
    Type: 'String',
    Default: '100'
  },
  ELBSubnets: {
    Description: 'ELB subnets',
    Type: 'String'
  },
  SSLCertificateIdentifier: {
    Type: 'String',
    Description: 'SSL certificate for HTTPS protocol'
  },
  TaskingManagerLogDirectory: {
    Description: 'TM_LOG_DIR environment variable',
    Type: 'String'
  },
  TaskingManagerConsumerKey: {
    Description: 'TM_CONSUMER_KEY',
    Type: 'String'
  },
  TaskingManagerConsumerSecret: {
      Description: 'TM_CONSUMER_SECRET',
      Type: 'String'
  },
  TaskingManagerSecret: {
    Description: 'TM_SECRET',
    Type: 'String'
  },
  TaskingManagerAppBaseUrl: {
    Type: 'String',
    Description: 'TM_APP_BASE_URL; Ex: https://example.hotosm.org'
  },
  TaskingManagerEmailFromAddress: {
    Description: 'TM_EMAIL_FROM_ADDRESS',
    Type: 'String'
  },
  TaskingManagerEmailContactAddress: {
    Description: 'TM_EMAIL_CONTACT_ADDRESS',
    Type: 'String'
  },
  TaskingManagerLogLevel: {
    Description: 'TM_LOG_LEVEL',
    Type: 'String',
    Default: 'INFO'
  },
  TaskingManagerImageUploadAPIURL: {
    Description: 'URL for image upload service',
    Type: 'String'
  },
  TaskingManagerImageUploadAPIKey: {
    Description: 'API Key for image upload service',
    Type: 'String'
  },
  TaskingManagerSMTPHost: {
    Description: 'TM_SMTP_HOST environment variable',
    Type: 'String'
  },
  TaskingManagerSMTPPassword: {
    Description: 'TM_SMTP_PASSWORD environment variable',
    Type: 'String'
  },
  TaskingManagerSMTPUser: {
    Description: 'TM_SMTP_USER environment variable',
    Type: 'String'
  },
  TaskingManagerSMTPPort: {
    Description: 'TM_SMTP_PORT environment variable',
    Type: 'String'
  },
  TaskingManagerDefaultChangesetComment: {
    Description: 'TM_DEFAULT_CHANGESET_COMMENT environment variable',
    Type: 'String'
  },
  TaskingManagerURL: {
    Description: 'URL for setting CNAME in Distribution; Ex: example.hotosm.org',
    Type: 'String'
  },
  TaskingManagerOrgName: {
    Description: 'Org Name',
    Type: 'String'
  },
  TaskingManagerOrgCode: {
    Description: 'Org Code',
    Type: 'String'
  },
  SentryBackendDSN: {
    Description: "DSN for sentry",
    Type: 'String'
  }
};

const Conditions = {
  UseASnapshot: cf.notEquals(cf.ref('DBSnapshot'), ''),
  DatabaseDumpFileGiven: cf.notEquals(cf.ref('DatabaseDump'), ''),
  IsTaskingManagerProduction: cf.equals(cf.ref('AutoscalingPolicy'), 'production'),
  IsTaskingManagerDemo: cf.equals(cf.ref('AutoscalingPolicy'), 'Demo (max 3)')
};

const Resources = {
  TaskingManagerECSCluster: {
    Type: 'AWS::ECS:Cluster',
    Properties: {
      CapacityProviders: [
        'FARGATE',
        'FARGATE_SPOT'
      ],
      ClusterName: cf.stackName,
      ClusterSettings: [{
        Name: 'containerInsights',
        Value: 'enabled'
      }],
      Tags: [
        {
          Key: 'Name',
          Value: cf.stackName
        },
        {
          Key: 'Project',
          Value: 'TaskingManager'
        }
      ]
    }
  },
  TaskingManagerECSTaskDefinition: {
    Type: 'AWS::ECS::TaskDefinition',
    Properties: {
      ContainerDefinitions: [{
        EnvironmentFiles: [],
        Essential: true,
        // HealthCheck: {
          // Need more input from Yogesh
        // },
        Image: 'quay.io/hotosm/taskingmanager:latest', //configure this properly

      }],
      Cpu: '1024', 
      ExecutionRoleArn: cf.ref('TaskingManagerECSExecutionRole'),
      Family: cf.stackName,
      Memory: '4096',
      NetworkMode: 'awsvpc',
      RequiresCompatibilities: ['FARGATE'],
      Tags: [{
        Key: 'Project',
        Value: 'TaskingManager'
      }, {
        Key: 'Name',
        Value: cf.stackName
      }],
      TaskRoleArn:cf.ref('TaskingManagerECSTaskRole'), // s3 bucket access, secrets manager 
    }
  },
  TaskingManagerECSService: {
    Type: 'AWS::ECS::Service',
    Properties: {
      Cluster: cf.ref('TaskingManagerECSCluster'),
      DeploymentConfiguration: {
        MaximumPercent: 200,
        MinimumHealthyPercent: 50
      },
      DeploymentController: {
        'Type': 'ECS'
      },
      DesiredCount: cf.if('IsTaskingManagerProduction', 3, 1),
      EnableECSManagedTags: true,
      HealthCheckGracePeriodSeconds: 300,
      LaunchType: 'FARGATE',
      LoadBalancers: [{
        ContainerName: cf.stackName,
        ContainerPort: 8080,
        TargetGroupArn: cf.ref('TaskingManagerTargetGroup')
      }],
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          SecurityGroups: [cf.importValue(cf.join('-', ['hotosm-network-production', cf.ref('NetworkEnvironment'), 'elbs-security-group', cf.region]))],
          Subnets: cf.split(',', cf.ref('ELBSubnets')) // private subnets on vpc + nat gateway
        }
      },
      PlatformVersion: '1.4.0',
      PropagateTags: 'SERVICE',
      SchedulingStrategy: 'REPLICA',
      ServiceName: cf.stackName,
      Tags: [{
        Key: 'Project',
        Value: 'TaskingManager'
      }, {
        Key: 'Name',
        Value: cf.stackName
      }],
      TaskDefinition: cf.ref('TaskingManagerECSTaskDefinition')
    }
  },
  TaskingManagerECSTaskRole: {  //  grants containers in the task permission to call AWS APIs - s3
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
             Service: [ "ecs-tasks.amazonaws.com" ]
          },
          Action: [ "sts:AssumeRole" ]
        }]
      },
      ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy',
          'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
      ],
      Policies: [{
        PolicyName: "RDSPolicy",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement:[{
            Action: ['rds:DescribeDBInstances'],
            Effect: 'Allow',
            Resource: ['arn:aws:rds:*']
          }]
        }
      }, {
        PolicyName: "CloudFormationPermissions",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement:[{
            Action: [
              'cloudformation:SignalResource',
              'cloudformation:DescribeStackResource'
            ],
            Effect: 'Allow',
            Resource: ['arn:aws:cloudformation:*']
          }]
        }
      }
      ],
      RoleName: cf.join('-', [cf.stackName, 'ecs', 'role'])
    }
  }, 
  TaskingManagerECSExecutionRole: { 
    Type: 'AWS::IAM::Role',
    Properties: {
      AssumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
             Service: [ "ecs-tasks.amazonaws.com" ]
          },
          Action: [ "sts:AssumeRole" ]
        }]
      },
      ManagedPolicyArns: [
          'arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy'
      ],
      Policies: [{
        PolicyName: "SecretsPolicy",
        PolicyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: [
                "secretsmanager:GetSecretValue",
                "kms:Decrypt",
                // "logs:CreateLogStream",
                // "logs:PutLogEvents"
              ],
              Resource: [
              cf.join(':', ['arn:aws:secretsmanager:', cf.region, cf.accountId, 'secret:*']),
              cf.join(':', ['arn:aws:kms:', cf.region, cf.accountId, 'key/<key_id>'])
              ]
            }
          ]
        }
      }],
      RoleName: cf.join('-', [cf.stackName, 'ecs', 'execution-role'])
    }
      // grants the Amazon ECS container agent permission to make AWS API calls - cloudwatch logs, secrets
  }, 
  TaskingManagerASG: {
    Type: 'AWS::ApplicationAutoScaling::ScalableTarget',
    Properties: {
      MinCapacity: cf.if('IsTaskingManagerProduction', 3, 1),
      MaxCapacity: cf.if('IsTaskingManagerProduction', 9, cf.if('IsTaskingManagerDemo', 3, 1)),
      ResourceId: cf.join('/', ['service', cf.ref('TaskingManagerECSCluster'), cf.getAtt('TaskingManagerECSService', 'Name')]),
      RoleARN: cf.join('', ['arn:aws:iam::', cf.accountId, ':role/aws-service-role/ecs.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_ECSService']),
      ScalableDimension: 'ecs:service:DesiredCount',
      ServiceNamespace: 'ecs'
    }
  },
  TaskingManagerASGPolicy: {
    Type: 'AWS::ApplicationAutoScaling::ScalingPolicy',
    Properties: {
      PolicyName: cf.stackName,
      PolicyType: 'TargetTrackingScaling',
      ScalingTargetId: cf.ref('TaskingManagerASG'),
      TargetTrackingScalingPolicyConfiguration: {
        DisableScaleIn: false,
        PredefinedMetricSpecification: {
          PredefinedMetricType: 'ALBRequestCountPerTarget',
          ResourceLabel: cf.join('/', [
            cf.getAtt('TaskingManagerLoadBalancer', 'LoadBalancerFullName'),
            cf.getAtt('TaskingManagerTargetGroup', 'TargetGroupFullName')
            ])
        },
        ScaleInCooldown: 300,
        ScaleOutCooldown: 300,
        TargetValue: 1000
      }
    }
  },
  TaskingManagerLoadBalancer: {
    Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
    Properties: {
      Name: cf.stackName,
      SecurityGroups: [cf.importValue(cf.join('-', ['hotosm-network-production', cf.ref('NetworkEnvironment'), 'elbs-security-group', cf.region]))],
      Subnets: cf.split(',', cf.ref('ELBSubnets')),
      Type: 'application'
    }
  },
  TaskingManagerLoadBalancerRoute53: {
    Type: 'AWS::Route53::RecordSet',
    Properties: {
      Name: cf.join('-', [cf.stackName, 'api.hotosm.org']),
      Type: 'A',
      AliasTarget: {
        DNSName: cf.getAtt('TaskingManagerLoadBalancer', 'DNSName'),
        HostedZoneId: cf.getAtt('TaskingManagerLoadBalancer', 'CanonicalHostedZoneID')
      },
      HostedZoneId: 'Z2O929GW6VWG99',
    }
  },
  TaskingManagerTargetGroup: {
    Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
    Properties: {
      HealthCheckIntervalSeconds: 60,
      HealthCheckPort: 8000,
      HealthCheckProtocol: 'HTTP',
      HealthCheckTimeoutSeconds: 10,
      HealthyThresholdCount: 3,
      UnhealthyThresholdCount: 3,
      HealthCheckPath: '/api/v2/system/heartbeat/',
      Port: 8000,
      Protocol: 'HTTP',
      TargetType: 'ip', //what else might this change?
      VpcId: cf.importValue(cf.join('-', ['hotosm-network-production', 'default-vpc', cf.region])),
      Tags: [ { "Key": "stack_name", "Value": cf.stackName } ],
      Matcher: {
        HttpCode: '200,202,302,304'
      }
    }
  },
  TaskingManagerLoadBalancerHTTPSListener: {
    Type: 'AWS::ElasticLoadBalancingV2::Listener',
    Properties: {
      Certificates: [ {
        CertificateArn: cf.arn('acm', cf.ref('SSLCertificateIdentifier'))
      }],
      DefaultActions: [{
        Type: 'forward',
        TargetGroupArn: cf.ref('TaskingManagerTargetGroup')
      }],
      LoadBalancerArn: cf.ref('TaskingManagerLoadBalancer'),
      Port: 443,
      Protocol: 'HTTPS',
      SslPolicy: 'ELBSecurityPolicy-FS-1-2-2019-08'
    }
  },
  TaskingManagerLoadBalancerHTTPListener: {
    Type: 'AWS::ElasticLoadBalancingV2::Listener',
    Properties: {
      DefaultActions: [{
        Type: 'redirect',
        RedirectConfig: {
          Protocol: 'HTTPS',
          Port: '443',
          Host: '#{host}',
          Path: '/#{path}',
          Query: '#{query}',
          StatusCode: 'HTTP_301'
        }
      }],
      LoadBalancerArn: cf.ref('TaskingManagerLoadBalancer'),
      Port: 80,
      Protocol: 'HTTP'
    }
  },
  TaskingManagerRDS: {
    Type: 'AWS::RDS::DBInstance',
    Properties: {
        Engine: 'postgres',
        DBName: cf.if('UseASnapshot', cf.noValue, cf.ref('PostgresDB')),
        EngineVersion: '11.5',
        MasterUsername: cf.if('UseASnapshot', cf.noValue, cf.ref('PostgresUser')),
        MasterUserPassword: cf.if('UseASnapshot', cf.noValue, cf.ref('PostgresPassword')),
        AllocatedStorage: cf.ref('DatabaseSize'),
        BackupRetentionPeriod: 10,
        StorageType: 'gp2',
        DBParameterGroupName: 'tm3-logging-postgres11',
        EnableCloudwatchLogsExports: ['postgresql'],
        DBInstanceClass: cf.if('IsTaskingManagerProduction', 'db.t3.2xlarge', 'db.t2.small'),
        DBSnapshotIdentifier: cf.if('UseASnapshot', cf.ref('DBSnapshot'), cf.noValue),
        VPCSecurityGroups: [cf.importValue(cf.join('-', ['hotosm-network-production', cf.ref('NetworkEnvironment'), 'ec2s-security-group', cf.region]))],
    }
  },
  TaskingManagerReactBucket: {
    Type: 'AWS::S3::Bucket',
    Properties: {
      BucketName: cf.join('-', [cf.stackName, 'react-app']),
      AccessControl: "PublicRead",
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        BlockPublicPolicy: false,
        IgnorePublicAcls: false,
        RestrictPublicBuckets: false
      },
      WebsiteConfiguration: {
        ErrorDocument: 'index.html',
        IndexDocument: 'index.html'
      }
    }
  },
  TaskingManagerReactBucketPolicy: {
    Type: 'AWS::S3::BucketPolicy',
    Properties: {
      Bucket : cf.ref('TaskingManagerReactBucket'),
      PolicyDocument: {
        Version: "2012-10-17",
        Statement:[{
          Action: [ 's3:GetObject'],
          Effect: 'Allow',
          Principal: '*',
          Resource: [ cf.join('',
            [
              cf.getAtt('TaskingManagerReactBucket', 'Arn'), 
              '/*'
            ]
          )],
          Sid: 'AddPerm'
        }]
      }
    }
  },
  TaskingManagerReactCloudfront: {
    Type: "AWS::CloudFront::Distribution",
    Properties: {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        Aliases: [
          cf.ref('TaskingManagerURL')
        ],
        Enabled: true,
        Origins: [{
          Id: cf.join('-', [cf.stackName, 'react-app']),
          DomainName: cf.getAtt('TaskingManagerReactBucket', 'DomainName'),
          CustomOriginConfig: {
            OriginProtocolPolicy: 'https-only'
          }
        }],
        CustomErrorResponses: [{
          ErrorCachingMinTTL : 0,
          ErrorCode: 403,
          ResponseCode: 200,
          ResponsePagePath: '/index.html'
        },{
          ErrorCachingMinTTL : 0,
          ErrorCode: 404,
          ResponseCode: 200,
          ResponsePagePath: '/index.html'
        }],
        DefaultCacheBehavior: {
          AllowedMethods: ['GET', 'HEAD', 'OPTIONS'],
          CachedMethods: ['GET', 'HEAD', 'OPTIONS'],
          ForwardedValues: {
            QueryString: true,
            Cookies: {
              Forward: 'all'
            },
            Headers: ['Accept', 'Referer']
          },
          Compress: true,
          TargetOriginId: cf.join('-', [cf.stackName, 'react-app']),
          ViewerProtocolPolicy: "redirect-to-https"
        },
        ViewerCertificate: {
          AcmCertificateArn: cf.arn('acm', cf.ref('SSLCertificateIdentifier')),
          MinimumProtocolVersion: 'TLSv1.2_2018',
          SslSupportMethod: 'sni-only'
        }
      }
    }
  },
  TaskingManagerRoute53: {
    Type: 'AWS::Route53::RecordSet',
    Properties: {
      Name: cf.ref('TaskingManagerURL'),
      Type: 'A',
      AliasTarget: {
        DNSName: cf.getAtt('TaskingManagerReactCloudfront', 'DomainName'),
        HostedZoneId: 'Z2FDTNDATAQYW2'
      },
      HostedZoneId: 'Z2O929GW6VWG99',
    }
  }
};

const Outputs = {
  CloudfrontDistributionID: {
    Value: cf.ref('TaskingManagerReactCloudfront'),
    Export: {
      Name: cf.join('-', [cf.stackName, 'cloudfront-id', cf.region])
    }
  }
}

module.exports = { Parameters, Resources, Conditions, Outputs }
