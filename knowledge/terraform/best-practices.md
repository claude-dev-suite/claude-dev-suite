# Terraform Best Practices

## Overview

This guide covers organizational patterns, naming conventions, tagging strategies, drift detection, plan/apply workflows, code review practices, cost estimation, and security scanning for production Terraform deployments. These practices apply regardless of cloud provider.

---

## Directory Structure

### Monorepo (Single Team, Shared Infrastructure)

```
terraform/
  modules/                    # Reusable modules
    vpc/
    eks/
    rds/
    s3/
  environments/
    dev/
      main.tf
      variables.tf
      outputs.tf
      backend.tf
      terraform.tfvars
    staging/
      main.tf                 # References same modules as dev
      ...
    production/
      main.tf
      ...
  global/                     # Account-level resources (IAM, Route53 zones)
    main.tf
    backend.tf
```

### Multi-Repo (Multiple Teams, Service Ownership)

```
# Repo: terraform-modules (shared library)
modules/
  vpc/
  eks/
  rds/

# Repo: terraform-platform (platform team)
environments/
  dev/
  staging/
  production/

# Repo: terraform-app-team-a (application team)
services/
  api/
  worker/
  database/
```

### Component-Based (Blast Radius Reduction)

```
terraform/
  networking/                 # VPC, subnets, route tables, VPN
    main.tf
    backend.tf               # Separate state file
  compute/                    # ECS, EKS, EC2, ASG
    main.tf
    backend.tf               # Separate state file
  database/                   # RDS, ElastiCache, DynamoDB
    main.tf
    backend.tf               # Separate state file
  monitoring/                 # CloudWatch, alerts, dashboards
    main.tf
    backend.tf               # Separate state file
```

---

## Naming Conventions

### Resource Naming

```hcl
locals {
  # Standard prefix: {project}-{environment}-{component}
  name_prefix = "${var.project}-${var.environment}"
}

resource "aws_vpc" "main" {
  cidr_block = var.cidr_block

  tags = {
    Name = "${local.name_prefix}-vpc"   # myapp-production-vpc
  }
}

resource "aws_subnet" "private" {
  for_each = toset(var.availability_zones)

  tags = {
    Name = "${local.name_prefix}-private-${each.key}"  # myapp-production-private-us-east-1a
  }
}

resource "aws_security_group" "api" {
  name = "${local.name_prefix}-api-sg"   # myapp-production-api-sg

  tags = {
    Name = "${local.name_prefix}-api-sg"
  }
}
```

### HCL Naming Rules

```hcl
# Resource names: snake_case, descriptive
resource "aws_instance" "api_server" { }      # Good
resource "aws_instance" "instance1" { }       # Bad: not descriptive
resource "aws_instance" "apiServer" { }       # Bad: camelCase

# Variable names: snake_case
variable "instance_type" { }                  # Good
variable "instanceType" { }                   # Bad

# Output names: snake_case, prefixed with resource context
output "vpc_id" { }                           # Good
output "vpc_public_subnet_ids" { }            # Good

# Local values: snake_case
locals {
  common_tags  = { ... }                      # Good
  name_prefix  = "..."                        # Good
}

# Module calls: snake_case, match the component
module "api_database" { }                     # Good
module "network" { }                          # Good
```

---

## Tagging Strategy

```hcl
locals {
  required_tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.team
    CostCenter  = var.cost_center
  }

  optional_tags = {
    Application = var.application_name
    DataClass   = var.data_classification  # public, internal, confidential, restricted
    Compliance  = var.compliance_framework  # gdpr, hipaa, pci-dss, soc2
    Backup      = var.backup_policy         # daily, weekly, none
  }

  # Merge required + optional (filtering out empty values)
  common_tags = merge(
    local.required_tags,
    { for k, v in local.optional_tags : k => v if v != "" }
  )
}

# Apply via provider default_tags (AWS)
provider "aws" {
  region = var.region
  default_tags {
    tags = local.common_tags
  }
}

# For resources that need additional tags
resource "aws_instance" "api" {
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-api"
    Role = "api-server"
  })
}
```

### Tag Enforcement

```hcl
# Sentinel policy (Terraform Cloud/Enterprise)
import "tfplan/v2" as tfplan

required_tags = ["Project", "Environment", "ManagedBy", "Owner"]

main = rule {
  all tfplan.resource_changes as _, rc {
    all required_tags as tag {
      rc.change.after.tags contains tag
    }
  }
}
```

---

## Drift Detection

### Scheduled Drift Detection

```yaml
# .github/workflows/drift-detection.yml
name: Terraform Drift Detection

on:
  schedule:
    - cron: '0 8 * * 1-5'  # Weekdays at 8 AM UTC

jobs:
  detect-drift:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        component: [networking, compute, database]

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.7.0"

      - name: Terraform Init
        working-directory: ${{ matrix.component }}
        run: terraform init

      - name: Detect Drift
        id: plan
        working-directory: ${{ matrix.component }}
        run: |
          terraform plan -detailed-exitcode -out=drift.plan 2>&1 | tee plan-output.txt
          echo "exit_code=$?" >> $GITHUB_OUTPUT
        continue-on-error: true

      - name: Notify on Drift
        if: steps.plan.outputs.exit_code == '2'
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Terraform drift detected in `${{ matrix.component }}`",
              "attachments": [{
                "color": "warning",
                "text": "Run `terraform apply` to reconcile."
              }]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Programmatic Drift Check

```bash
# Exit codes:
#   0 = No changes (no drift)
#   1 = Error
#   2 = Changes detected (drift)
terraform plan -detailed-exitcode

# Generate machine-readable plan
terraform plan -out=plan.bin
terraform show -json plan.bin > plan.json

# Parse drift from JSON plan
jq '.resource_changes[] | select(.change.actions != ["no-op"]) | {address, actions: .change.actions}' plan.json
```

---

## Plan/Apply Workflow

### Standard Workflow

```bash
# 1. Format code
terraform fmt -recursive

# 2. Validate configuration
terraform validate

# 3. Plan (save plan for exact apply)
terraform plan -out=tfplan

# 4. Review plan output carefully

# 5. Apply the saved plan (no prompt, exact changes)
terraform apply tfplan
```

### CI/CD Pipeline Pattern

```yaml
# Simplified GitOps flow
# PR opened -> plan (comment on PR)
# PR merged to main -> apply

name: Terraform
on:
  pull_request:
    paths: ['terraform/**']
  push:
    branches: [main]
    paths: ['terraform/**']

jobs:
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - run: terraform init
      - run: terraform fmt -check
      - run: terraform validate

      - id: plan
        run: terraform plan -no-color -out=tfplan
        continue-on-error: true

      - uses: actions/github-script@v7
        with:
          script: |
            const output = `#### Terraform Plan
            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`
            *Pushed by: @${{ github.actor }}*`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            });

  apply:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - run: terraform init
      - run: terraform apply -auto-approve
```

---

## Code Review for Terraform

### Review Checklist

```markdown
## Terraform PR Review Checklist

### Safety
- [ ] No resources being destroyed unexpectedly
- [ ] No `force_new` changes on stateful resources (databases, volumes)
- [ ] `prevent_destroy` lifecycle on critical resources
- [ ] State moves documented if resources are renamed

### Security
- [ ] No secrets in .tf files or terraform.tfvars
- [ ] Security groups are not overly permissive (no 0.0.0.0/0 on SSH)
- [ ] IAM policies follow least privilege
- [ ] Encryption enabled for data at rest and in transit
- [ ] Public access disabled where not needed

### Cost
- [ ] Instance sizes appropriate for the environment
- [ ] No expensive resources left running in dev/staging
- [ ] Reserved capacity considered for production
- [ ] Cost estimate reviewed (Infracost comment)

### Quality
- [ ] terraform fmt applied
- [ ] terraform validate passes
- [ ] Variables have descriptions and types
- [ ] Outputs documented
- [ ] Tags applied consistently
- [ ] Naming conventions followed
```

### Lifecycle Rules for Critical Resources

```hcl
resource "aws_db_instance" "production" {
  identifier     = "prod-db"
  engine         = "postgres"
  instance_class = "db.r6g.xlarge"

  lifecycle {
    prevent_destroy = true  # Terraform will refuse to destroy this

    ignore_changes = [
      password,             # Managed outside Terraform (rotated by Secrets Manager)
    ]
  }

  deletion_protection = true  # AWS-level protection
}

resource "aws_s3_bucket" "critical_data" {
  bucket = "critical-production-data"

  lifecycle {
    prevent_destroy = true
  }
}
```

---

## Cost Estimation (Infracost)

```yaml
# .github/workflows/infracost.yml
name: Infracost

on:
  pull_request:
    paths: ['terraform/**']

jobs:
  infracost:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: infracost/actions/setup@v3
        with:
          api-key: ${{ secrets.INFRACOST_API_KEY }}

      - name: Generate cost estimate
        run: |
          infracost breakdown \
            --path=terraform/ \
            --format=json \
            --out-file=/tmp/infracost.json

      - name: Post PR comment
        run: |
          infracost comment github \
            --path=/tmp/infracost.json \
            --repo=${{ github.repository }} \
            --pull-request=${{ github.event.pull_request.number }} \
            --github-token=${{ secrets.GITHUB_TOKEN }} \
            --behavior=update
```

### Infracost Usage File for Estimates

```yaml
# infracost-usage.yml
version: 0.1
resource_usage:
  aws_instance.api:
    operating_system: linux
    monthly_hrs: 730       # 24/7

  aws_lambda_function.processor:
    monthly_requests: 1000000
    request_duration_ms: 200

  aws_s3_bucket.data:
    standard:
      storage_gb: 500
      monthly_tier_1_requests: 100000
      monthly_tier_2_requests: 1000000

  aws_nat_gateway.main:
    monthly_data_processed_gb: 100
```

---

## Security Scanning

### tfsec (Aqua Security)

```bash
# Install
brew install tfsec

# Scan
tfsec .

# Scan with custom severity threshold
tfsec . --minimum-severity HIGH

# Output as JSON for CI
tfsec . --format json --out results.json
```

```yaml
# CI integration
- name: tfsec
  uses: aquasecurity/tfsec-action@v1.0.0
  with:
    soft_fail: false
    additional_args: --minimum-severity HIGH
```

### Checkov (Bridgecrew)

```bash
# Install
pip install checkov

# Scan Terraform
checkov -d . --framework terraform

# Scan with specific checks
checkov -d . --check CKV_AWS_18,CKV_AWS_19

# Skip specific checks
checkov -d . --skip-check CKV_AWS_145

# Output as SARIF for GitHub Security
checkov -d . --output sarif --output-file results.sarif
```

### Inline Suppression

```hcl
# tfsec suppression
resource "aws_s3_bucket" "public_website" {
  bucket = "public-website"

  #tfsec:ignore:aws-s3-no-public-access -- Intentional: static website hosting
}

# Checkov suppression
resource "aws_s3_bucket" "public_website" {
  bucket = "public-website"

  #checkov:skip=CKV_AWS_18:Intentional public access for static website
}
```

### OPA (Open Policy Agent) for Custom Rules

```rego
# policy/terraform.rego
package terraform

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_security_group_rule"
  resource.change.after.cidr_blocks[_] == "0.0.0.0/0"
  resource.change.after.from_port <= 22
  resource.change.after.to_port >= 22
  msg := sprintf("Security group rule %s allows SSH from 0.0.0.0/0", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_db_instance"
  resource.change.after.publicly_accessible == true
  msg := sprintf("Database %s is publicly accessible", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_s3_bucket"
  not resource.change.after.tags.DataClass
  msg := sprintf("S3 bucket %s missing required DataClass tag", [resource.address])
}
```

```bash
# Run OPA against Terraform plan
terraform plan -out=tfplan.bin
terraform show -json tfplan.bin > tfplan.json
opa eval --data policy/ --input tfplan.json "data.terraform.deny"
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| `terraform apply` without saved plan | Plan can differ from what was reviewed | Always `plan -out=file` then `apply file` |
| No drift detection | Manual changes go unnoticed | Scheduled plan with alerting |
| Everyone applies from laptop | No audit trail, inconsistent state | CI/CD pipeline with approval gates |
| No cost estimation | Surprise bills | Infracost in PR workflow |
| Security scanning only in production | Vulnerabilities reach production | Scan in PR, block merge on HIGH/CRITICAL |
| Giant PRs with 50+ resource changes | Impossible to review safely | Small, focused PRs per component |
| No `prevent_destroy` on databases | Accidental deletion possible | Lifecycle rule + deletion_protection |
| Ignoring plan output | Unexpected destroys missed | Require human review of every plan |

---

## Production Checklist

- [ ] Directory structure follows component-based or environment-based pattern
- [ ] Naming conventions documented and enforced
- [ ] Tagging strategy defined with required tags
- [ ] Provider default_tags configured
- [ ] Drift detection running on schedule
- [ ] CI/CD pipeline with plan on PR and apply on merge
- [ ] Plan output posted as PR comment for review
- [ ] Manual approval gate for production applies
- [ ] Infracost integrated for cost estimation
- [ ] tfsec or Checkov running in CI pipeline
- [ ] Critical resources have `prevent_destroy` lifecycle
- [ ] Secrets managed via Vault, SSM, or cloud secret manager
- [ ] State files encrypted and access-controlled
- [ ] PR review checklist enforced
- [ ] `terraform fmt` and `terraform validate` in CI
