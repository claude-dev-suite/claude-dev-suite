# Terraform Workspaces

## Overview

Terraform workspaces allow you to manage multiple distinct sets of infrastructure state from a single configuration directory. Each workspace has its own state file, enabling environment isolation (dev, staging, production) without duplicating code. However, workspaces have significant limitations and are not always the best approach.

---

## How Workspaces Work

```bash
# List workspaces (default workspace always exists)
terraform workspace list
# * default

# Create a new workspace
terraform workspace new staging
# Created and switched to workspace "staging"!

# Switch workspace
terraform workspace select production

# Show current workspace
terraform workspace show
# production

# Delete a workspace (must switch away first)
terraform workspace select default
terraform workspace delete staging
```

### State File Layout with Workspaces

```
# Local backend
terraform.tfstate.d/
  staging/
    terraform.tfstate
  production/
    terraform.tfstate
terraform.tfstate          <- default workspace

# S3 backend
s3://terraform-state/
  env:/
    staging/
      terraform.tfstate
    production/
      terraform.tfstate
  terraform.tfstate        <- default workspace
```

---

## Workspace-Based Environment Isolation

### Workspace-Aware Configuration

```hcl
# variables.tf
locals {
  environment = terraform.workspace

  # Environment-specific sizing
  instance_config = {
    dev = {
      instance_type    = "t3.small"
      min_size         = 1
      max_size         = 2
      multi_az         = false
      db_instance_class = "db.t3.micro"
      db_storage       = 20
    }
    staging = {
      instance_type    = "t3.medium"
      min_size         = 2
      max_size         = 4
      multi_az         = false
      db_instance_class = "db.t3.small"
      db_storage       = 50
    }
    production = {
      instance_type    = "t3.large"
      min_size         = 3
      max_size         = 20
      multi_az         = true
      db_instance_class = "db.r6g.large"
      db_storage       = 200
    }
  }

  config = local.instance_config[local.environment]
}

# main.tf
resource "aws_instance" "app" {
  ami           = data.aws_ami.app.id
  instance_type = local.config.instance_type

  tags = {
    Name        = "app-${local.environment}"
    Environment = local.environment
  }
}

resource "aws_db_instance" "main" {
  identifier     = "db-${local.environment}"
  instance_class = local.config.db_instance_class
  allocated_storage = local.config.db_storage
  multi_az       = local.config.multi_az

  # Different credentials per environment
  username = "admin"
  password = data.aws_ssm_parameter.db_password.value
}
```

### Workspace-Specific Variable Files

```hcl
# Use terraform.workspace to load workspace-specific tfvars
# This pattern uses a data source to conditionally load values

variable "domain_name" {
  type = map(string)
  default = {
    dev        = "dev.example.com"
    staging    = "staging.example.com"
    production = "example.com"
  }
}

resource "aws_route53_record" "app" {
  zone_id = var.zone_id
  name    = var.domain_name[terraform.workspace]
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
```

---

## Naming Conventions

```
Workspace naming pattern: {environment}[-{region}][-{variant}]

Examples:
  dev
  staging
  production
  production-us-east-1
  production-eu-west-1
  dev-feature-auth    # Feature branch testing
```

### Workspace Name in Resource Tags

```hcl
locals {
  common_tags = {
    Environment = terraform.workspace
    ManagedBy   = "terraform"
    Workspace   = terraform.workspace
    CostCenter  = lookup({
      dev        = "engineering"
      staging    = "engineering"
      production = "operations"
    }, terraform.workspace, "unknown")
  }
}
```

---

## CI/CD with Workspaces

### GitHub Actions

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  TF_VERSION: "1.7.0"

jobs:
  plan:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [dev, staging, production]
      fail-fast: false

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Init
        run: terraform init

      - name: Select Workspace
        run: terraform workspace select ${{ matrix.workspace }} || terraform workspace new ${{ matrix.workspace }}

      - name: Terraform Plan
        run: terraform plan -out=tfplan-${{ matrix.workspace }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Upload Plan
        uses: actions/upload-artifact@v4
        with:
          name: tfplan-${{ matrix.workspace }}
          path: tfplan-${{ matrix.workspace }}

  apply:
    needs: plan
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        workspace: [dev, staging, production]
      max-parallel: 1  # Apply sequentially: dev -> staging -> production

    environment: ${{ matrix.workspace }}  # Requires approval for production

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Download Plan
        uses: actions/download-artifact@v4
        with:
          name: tfplan-${{ matrix.workspace }}

      - name: Terraform Init
        run: terraform init

      - name: Select Workspace
        run: terraform workspace select ${{ matrix.workspace }}

      - name: Terraform Apply
        run: terraform apply tfplan-${{ matrix.workspace }}
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Workspaces vs Directories

### When to Use Workspaces

| Scenario | Workspaces | Separate Directories |
|----------|-----------|---------------------|
| Identical environments (dev/staging/prod) | Good fit | Unnecessary duplication |
| Environments with different resources | Poor fit | Better: different configs |
| Multi-region deployment of same stack | Good fit | Alternative: modules |
| Different cloud accounts | Possible but complex | Clearer separation |
| Team isolation (team A / team B) | Not designed for this | Better: separate repos |

### Workspace Limitations

1. **Same code, different state** -- Workspaces share configuration. If dev needs different resources than prod, workspaces force conditional logic everywhere.
2. **No built-in promotion** -- No mechanism to promote a plan from dev to staging.
3. **Shared backend config** -- All workspaces use the same backend. Cannot use different AWS accounts for state storage per workspace.
4. **Visible in state path** -- Workspace name is embedded in the state key, but not in the plan output.

---

## Alternatives: Terragrunt

Terragrunt provides a more sophisticated approach to environment management.

### Terragrunt Directory Structure

```
live/
  terragrunt.hcl              # Root config (backend, provider defaults)
  dev/
    env.hcl                   # Environment variables
    vpc/
      terragrunt.hcl          # Module invocation
    eks/
      terragrunt.hcl
    rds/
      terragrunt.hcl
  staging/
    env.hcl
    vpc/
      terragrunt.hcl
    eks/
      terragrunt.hcl
  production/
    env.hcl
    vpc/
      terragrunt.hcl
    eks/
      terragrunt.hcl
modules/
  vpc/
    main.tf
    variables.tf
    outputs.tf
  eks/
    main.tf
    variables.tf
    outputs.tf
```

### Terragrunt Root Configuration

```hcl
# live/terragrunt.hcl

remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite"
  }
  config = {
    bucket         = "my-org-terraform-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite"
  contents  = <<EOF
provider "aws" {
  region = "us-east-1"
}
EOF
}
```

### Terragrunt Module Invocation

```hcl
# live/production/vpc/terragrunt.hcl

include "root" {
  path = find_in_parent_folders()
}

locals {
  env = read_terragrunt_config(find_in_parent_folders("env.hcl"))
}

terraform {
  source = "../../../modules/vpc"
}

inputs = {
  name               = "production"
  cidr_block         = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true
  single_nat_gateway = false

  tags = {
    Environment = local.env.locals.environment
    ManagedBy   = "terraform"
  }
}
```

### Terragrunt Dependencies

```hcl
# live/production/eks/terragrunt.hcl

dependency "vpc" {
  config_path = "../vpc"

  # Use mock outputs during plan when VPC doesn't exist yet
  mock_outputs = {
    vpc_id             = "vpc-mock"
    private_subnet_ids = ["subnet-mock-1", "subnet-mock-2"]
  }
}

inputs = {
  cluster_name = "production"
  vpc_id       = dependency.vpc.outputs.vpc_id
  subnet_ids   = dependency.vpc.outputs.private_subnet_ids
}
```

### Terragrunt Commands

```bash
# Apply a single component
cd live/production/vpc
terragrunt apply

# Apply all components in an environment (respects dependencies)
cd live/production
terragrunt run-all apply

# Plan across all components
cd live/production
terragrunt run-all plan

# Destroy in reverse dependency order
cd live/production
terragrunt run-all destroy
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Using `default` workspace for production | Accidental changes, no separation | Create explicit named workspaces |
| Heavy conditional logic per workspace | Code becomes unreadable | Use separate directories or Terragrunt |
| No workspace-specific variable validation | Wrong config applied to wrong env | Validate `terraform.workspace` against known values |
| Workspace for different architectures | Workspaces assume same config | Separate codebases for different architectures |
| Forgetting to switch workspace | Apply dev changes to production | CI/CD with explicit workspace selection |
| Mixing workspaces and `-var-file` | Confusion about which overrides apply | Choose one pattern and stick with it |

---

## Production Checklist

- [ ] Workspace names follow consistent naming convention
- [ ] Environment-specific values defined in a lookup map, not scattered conditionals
- [ ] CI/CD explicitly selects workspace before plan/apply
- [ ] Production workspace requires manual approval in CI/CD
- [ ] `default` workspace is not used for any environment
- [ ] Workspace-aware resource naming prevents conflicts
- [ ] Backend state paths include workspace name for clear separation
- [ ] Team documented when to use workspaces vs directories vs Terragrunt
- [ ] Workspace validation prevents unknown workspace names
- [ ] Cross-workspace state references use `terraform_remote_state`
- [ ] Destroy protection configured for production workspace resources
