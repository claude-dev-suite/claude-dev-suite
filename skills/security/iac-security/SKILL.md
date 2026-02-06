# Infrastructure as Code Security Skill

> **USE WHEN:** Securing Terraform, CloudFormation, Ansible, Pulumi, or other IaC configurations.
> **DO NOT USE FOR:** General IaC patterns, cloud architecture design, cost optimization.

## IaC Security Overview

### Common Vulnerability Categories

| Category | Examples |
|----------|----------|
| **Secrets Exposure** | Hardcoded API keys, passwords in plaintext |
| **Overly Permissive IAM** | `*` actions, `*` resources |
| **Network Exposure** | 0.0.0.0/0 ingress, public S3 buckets |
| **Missing Encryption** | Unencrypted EBS, S3, RDS |
| **Logging Disabled** | No CloudTrail, no VPC flow logs |
| **Resource Misconfig** | Default security groups, weak TLS |

## Terraform Security

### Secrets Management

```hcl
# Bad: Hardcoded secrets
resource "aws_db_instance" "main" {
  password = "mysecretpassword"  # Never do this!
}

# Good: Use variables with sensitive flag
variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_db_instance" "main" {
  password = var.db_password
}

# Better: Use AWS Secrets Manager
data "aws_secretsmanager_secret_version" "db" {
  secret_id = "production/db/password"
}

resource "aws_db_instance" "main" {
  password = jsondecode(data.aws_secretsmanager_secret_version.db.secret_string)["password"]
}

# Best: Use external secrets with SOPS or Vault
data "sops_file" "secrets" {
  source_file = "secrets.enc.yaml"
}

resource "aws_db_instance" "main" {
  password = data.sops_file.secrets.data["db_password"]
}
```

### IAM Least Privilege

```hcl
# Bad: Overly permissive
resource "aws_iam_policy" "bad" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}

# Good: Least privilege
resource "aws_iam_policy" "good" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject"
      ]
      Resource = [
        "${aws_s3_bucket.data.arn}/*"
      ]
      Condition = {
        StringEquals = {
          "s3:x-amz-acl" = "bucket-owner-full-control"
        }
      }
    }]
  })
}

# Good: Use AWS IAM Access Analyzer
resource "aws_accessanalyzer_analyzer" "main" {
  analyzer_name = "main"
  type          = "ACCOUNT"
}
```

### Network Security

```hcl
# Bad: Open to the world
resource "aws_security_group" "bad" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # SSH open to internet!
  }
}

# Good: Restricted access
resource "aws_security_group" "good" {
  ingress {
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.bastion.id]  # Only from bastion
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.corporate_cidr]  # Only corporate network
  }

  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # HTTPS egress OK
  }
}
```

### Encryption at Rest

```hcl
# S3 with encryption
resource "aws_s3_bucket" "secure" {
  bucket = "my-secure-bucket"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "secure" {
  bucket = aws_s3_bucket.secure.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.main.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "secure" {
  bucket = aws_s3_bucket.secure.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# RDS with encryption
resource "aws_db_instance" "secure" {
  storage_encrypted   = true
  kms_key_id          = aws_kms_key.rds.arn

  # Additional security
  deletion_protection = true
  skip_final_snapshot = false

  # Logging
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
}

# EBS encryption by default
resource "aws_ebs_encryption_by_default" "main" {
  enabled = true
}
```

### Logging and Monitoring

```hcl
# CloudTrail for all regions
resource "aws_cloudtrail" "main" {
  name                          = "main-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["arn:aws:s3"]
    }
  }
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.flow_log.arn
  log_destination = aws_cloudwatch_log_group.flow_log.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}
```

## CloudFormation Security

### Secure Template Patterns

```yaml
AWSTemplateFormatVersion: '2010-09-09'

Parameters:
  # Use NoEcho for sensitive params
  DBPassword:
    Type: String
    NoEcho: true
    MinLength: 16
    AllowedPattern: '^[a-zA-Z0-9!@#$%^&*()_+-=]+$'

Resources:
  # S3 with encryption
  SecureBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: aws:kms
              KMSMasterKeyID: !Ref KMSKey
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true
      VersioningConfiguration:
        Status: Enabled
      LoggingConfiguration:
        DestinationBucketName: !Ref LogBucket
        LogFilePrefix: s3-access-logs/

  # Security Group with minimal access
  AppSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Application security group
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          SourceSecurityGroupId: !Ref ALBSecurityGroup
      SecurityGroupEgress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0

Metadata:
  # cfn-nag suppressions (document exceptions)
  cfn-lint:
    config:
      ignore_checks:
        - W3011
```

## Kubernetes Manifests (Kustomize/Helm)

### Secure Defaults

```yaml
# kustomization.yaml with security patches
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml

patches:
  - patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: any
      spec:
        template:
          spec:
            securityContext:
              runAsNonRoot: true
              seccompProfile:
                type: RuntimeDefault
            containers:
              - name: any
                securityContext:
                  allowPrivilegeEscalation: false
                  capabilities:
                    drop:
                      - ALL
                  readOnlyRootFilesystem: true
    target:
      kind: Deployment
```

### Helm Security Values

```yaml
# values.yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001

containerSecurityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi

networkPolicy:
  enabled: true
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: database
```

## IaC Scanning Tools

### Checkov (Comprehensive)

```bash
# Scan Terraform
checkov -d ./terraform --framework terraform

# Scan with specific checks
checkov -d . --check CKV_AWS_18,CKV_AWS_19

# Output formats
checkov -d . -o sarif -o cli

# Skip specific checks
checkov -d . --skip-check CKV_AWS_18
```

### tfsec (Terraform-specific)

```bash
# Basic scan
tfsec .

# With severity filter
tfsec . --minimum-severity HIGH

# Custom config
# .tfsec/config.yml
severity_overrides:
  aws-s3-enable-bucket-logging: LOW
  aws-ec2-no-public-ip-subnet: ERROR
```

### Terrascan

```bash
# Scan with all policies
terrascan scan -d ./terraform

# Specific policy
terrascan scan -d . -p aws

# Generate SARIF
terrascan scan -d . -o sarif > results.sarif
```

### KICS (Multi-IaC)

```bash
# Scan multiple IaC types
kics scan -p ./terraform -p ./kubernetes -p ./ansible

# With exclusions
kics scan -p . --exclude-queries "CIS-*"
```

## CI/CD Integration

```yaml
# GitHub Actions
name: IaC Security
on:
  pull_request:
    paths:
      - 'terraform/**'
      - 'kubernetes/**'

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Checkov Scan
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform/
          framework: terraform
          output_format: sarif
          output_file_path: checkov.sarif

      - name: tfsec
        uses: aquasecurity/tfsec-action@v1.0.0
        with:
          working_directory: terraform/
          soft_fail: false

      - name: Trivy Config Scan
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'config'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-config.sarif'

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: checkov.sarif
```

## Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.86.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tfsec
      - id: terraform_checkov
        args:
          - --args=--quiet
          - --args=--compact

  - repo: https://github.com/bridgecrewio/checkov
    rev: 3.1.0
    hooks:
      - id: checkov
        args:
          - --quiet
          - --compact
```

## Quick Reference: Critical Checks

| Resource | Critical Check | Tool |
|----------|----------------|------|
| S3 | Public access blocked | CKV_AWS_19 |
| S3 | Encryption enabled | CKV_AWS_18 |
| Security Group | No 0.0.0.0/0 SSH | CKV_AWS_24 |
| IAM | No wildcard actions | CKV_AWS_1 |
| RDS | Encryption enabled | CKV_AWS_16 |
| RDS | Not publicly accessible | CKV_AWS_17 |
| EBS | Encryption enabled | CKV_AWS_3 |
| CloudTrail | Enabled | CKV_AWS_35 |
