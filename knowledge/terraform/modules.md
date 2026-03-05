# Terraform Modules

## Overview

Terraform modules are self-contained packages of Terraform configuration that encapsulate reusable infrastructure patterns. A module consists of `.tf` files in a directory and exposes inputs (variables), outputs, and resources. Well-designed modules enable infrastructure composition, versioning, and team-wide consistency.

---

## Module Structure

```
modules/
  vpc/
    main.tf           # Core resources
    variables.tf      # Input variables
    outputs.tf        # Output values
    versions.tf       # Terraform and provider version constraints
    README.md         # Module documentation
    examples/
      basic/          # Usage example
        main.tf
    tests/
      vpc_test.go     # Terratest tests
```

### variables.tf

```hcl
# modules/vpc/variables.tf

variable "name" {
  description = "Name prefix for all VPC resources"
  type        = string

  validation {
    condition     = length(var.name) <= 24
    error_message = "Name must be 24 characters or fewer."
  }
}

variable "cidr_block" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "Must be a valid CIDR block."
  }
}

variable "availability_zones" {
  description = "List of availability zones for subnets"
  type        = list(string)
}

variable "enable_nat_gateway" {
  description = "Whether to create NAT gateways for private subnets"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "Use a single NAT gateway instead of one per AZ (cost savings for non-prod)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
```

### main.tf

```hcl
# modules/vpc/main.tf

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "${var.name}-vpc"
  })
}

resource "aws_subnet" "public" {
  count = length(var.availability_zones)

  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.cidr_block, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "${var.name}-public-${var.availability_zones[count.index]}"
    Tier = "public"
  })
}

resource "aws_subnet" "private" {
  count = length(var.availability_zones)

  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + length(var.availability_zones))
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "${var.name}-private-${var.availability_zones[count.index]}"
    Tier = "private"
  })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = merge(var.tags, {
    Name = "${var.name}-igw"
  })
}

resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0
  domain = "vpc"

  tags = merge(var.tags, {
    Name = "${var.name}-nat-eip-${count.index}"
  })
}

resource "aws_nat_gateway" "this" {
  count = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.availability_zones)) : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name = "${var.name}-nat-${count.index}"
  })

  depends_on = [aws_internet_gateway.this]
}
```

### outputs.tf

```hcl
# modules/vpc/outputs.tf

output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.this.id
}

output "vpc_cidr_block" {
  description = "The CIDR block of the VPC"
  value       = aws_vpc.this.cidr_block
}

output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ips" {
  description = "Elastic IP addresses of NAT gateways"
  value       = aws_eip.nat[*].public_ip
}
```

### versions.tf

```hcl
# modules/vpc/versions.tf

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0, < 6.0"
    }
  }
}
```

---

## Module Composition

Compose complex infrastructure from smaller modules.

```hcl
# environments/production/main.tf

module "vpc" {
  source = "../../modules/vpc"

  name               = "prod"
  cidr_block         = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true
  single_nat_gateway = false

  tags = local.common_tags
}

module "eks" {
  source = "../../modules/eks"

  cluster_name    = "prod-cluster"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnet_ids
  kubernetes_version = "1.29"

  node_groups = {
    general = {
      instance_types = ["m6i.xlarge"]
      min_size       = 3
      max_size       = 10
      desired_size   = 3
    }
    compute = {
      instance_types = ["c6i.2xlarge"]
      min_size       = 0
      max_size       = 20
      desired_size   = 0
      labels = { workload = "compute" }
      taints = [{ key = "workload", value = "compute", effect = "NO_SCHEDULE" }]
    }
  }

  tags = local.common_tags
}

module "rds" {
  source = "../../modules/rds"

  identifier        = "prod-db"
  engine            = "postgres"
  engine_version    = "16.1"
  instance_class    = "db.r6g.xlarge"
  allocated_storage = 100

  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  allowed_cidr_blocks = [module.vpc.vpc_cidr_block]

  multi_az           = true
  backup_retention   = 30
  deletion_protection = true

  tags = local.common_tags
}
```

---

## Module Registry

### Terraform Cloud Private Registry

```hcl
# Using a registry module
module "vpc" {
  source  = "app.terraform.io/my-org/vpc/aws"
  version = "~> 3.0"

  name               = "prod"
  cidr_block         = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}
```

### Git-Based Module Sources

```hcl
# SSH
module "vpc" {
  source = "git@github.com:my-org/terraform-modules.git//modules/vpc?ref=v3.2.1"
}

# HTTPS with tag
module "vpc" {
  source = "github.com/my-org/terraform-modules//modules/vpc?ref=v3.2.1"
}

# Specific branch (avoid in production)
module "vpc" {
  source = "github.com/my-org/terraform-modules//modules/vpc?ref=feature-branch"
}
```

---

## Versioning Strategy

```
v1.0.0  Initial release
v1.1.0  Added single_nat_gateway option (backward compatible)
v1.2.0  Added VPC flow logs support (backward compatible)
v2.0.0  Changed subnet CIDR calculation (BREAKING: requires state migration)
```

**Semantic versioning rules for modules:**
- **PATCH** (v1.0.1): Bug fixes, documentation updates
- **MINOR** (v1.1.0): New variables with defaults, new outputs, new optional resources
- **MAJOR** (v2.0.0): Removed variables, changed resource addressing, required state migration

```hcl
# Pin to minor version for stability
module "vpc" {
  source  = "app.terraform.io/my-org/vpc/aws"
  version = "~> 3.2"   # Allows 3.2.x but not 3.3.0
}
```

---

## Module Testing with Terratest

```go
// tests/vpc_test.go
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/gruntwork-io/terratest/modules/aws"
    "github.com/stretchr/testify/assert"
)

func TestVpcModule(t *testing.T) {
    t.Parallel()

    awsRegion := "us-east-1"

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../examples/basic",

        Vars: map[string]interface{}{
            "name":               "test-vpc",
            "cidr_block":         "10.99.0.0/16",
            "availability_zones": []string{"us-east-1a", "us-east-1b"},
            "enable_nat_gateway":  false,
        },

        EnvVars: map[string]string{
            "AWS_DEFAULT_REGION": awsRegion,
        },
    })

    // Clean up after test
    defer terraform.Destroy(t, terraformOptions)

    // Deploy
    terraform.InitAndApply(t, terraformOptions)

    // Validate outputs
    vpcId := terraform.Output(t, terraformOptions, "vpc_id")
    assert.NotEmpty(t, vpcId)

    publicSubnetIds := terraform.OutputList(t, terraformOptions, "public_subnet_ids")
    assert.Len(t, publicSubnetIds, 2)

    privateSubnetIds := terraform.OutputList(t, terraformOptions, "private_subnet_ids")
    assert.Len(t, privateSubnetIds, 2)

    // Verify VPC exists in AWS
    vpc := aws.GetVpcById(t, vpcId, awsRegion)
    assert.Equal(t, "10.99.0.0/16", *vpc.CidrBlock)

    // Verify DNS settings
    assert.True(t, *vpc.EnableDnsHostnames)
    assert.True(t, *vpc.EnableDnsSupport)

    // Verify subnets are in correct AZs
    subnets := aws.GetSubnetsForVpc(t, vpcId, awsRegion)
    assert.Len(t, subnets, 4) // 2 public + 2 private
}

func TestVpcModuleWithNat(t *testing.T) {
    t.Parallel()

    terraformOptions := terraform.WithDefaultRetryableErrors(t, &terraform.Options{
        TerraformDir: "../examples/basic",
        Vars: map[string]interface{}{
            "name":               "test-nat",
            "cidr_block":         "10.98.0.0/16",
            "availability_zones": []string{"us-east-1a"},
            "enable_nat_gateway":  true,
            "single_nat_gateway":  true,
        },
    })

    defer terraform.Destroy(t, terraformOptions)
    terraform.InitAndApply(t, terraformOptions)

    natIps := terraform.OutputList(t, terraformOptions, "nat_gateway_ips")
    assert.Len(t, natIps, 1)
}
```

---

## Reusable Module Patterns

### Pattern: Feature Flags with Conditional Resources

```hcl
variable "enable_flow_logs" {
  type    = bool
  default = false
}

resource "aws_flow_log" "this" {
  count = var.enable_flow_logs ? 1 : 0

  vpc_id          = aws_vpc.this.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_log[0].arn
  log_destination = aws_cloudwatch_log_group.flow_log[0].arn
}
```

### Pattern: Dynamic Blocks for Repeated Configuration

```hcl
variable "ingress_rules" {
  type = list(object({
    from_port   = number
    to_port     = number
    protocol    = string
    cidr_blocks = list(string)
    description = string
  }))
}

resource "aws_security_group" "this" {
  name   = "${var.name}-sg"
  vpc_id = var.vpc_id

  dynamic "ingress" {
    for_each = var.ingress_rules
    content {
      from_port   = ingress.value.from_port
      to_port     = ingress.value.to_port
      protocol    = ingress.value.protocol
      cidr_blocks = ingress.value.cidr_blocks
      description = ingress.value.description
    }
  }
}
```

### Pattern: for_each with Map of Objects

```hcl
variable "databases" {
  type = map(object({
    engine         = string
    instance_class = string
    storage        = number
  }))
}

resource "aws_db_instance" "this" {
  for_each = var.databases

  identifier     = "${var.name}-${each.key}"
  engine         = each.value.engine
  instance_class = each.value.instance_class
  allocated_storage = each.value.storage

  tags = merge(var.tags, { Database = each.key })
}
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Monolithic module (100+ resources) | Hard to test, slow to plan | Break into focused modules (vpc, subnets, nat) |
| No version pinning | Breaking changes propagate automatically | Pin to minor version (`~> 3.2`) |
| Hardcoded values in modules | Not reusable | Expose as variables with sensible defaults |
| Deeply nested modules (3+ levels) | Difficult to debug, slow plans | Flatten to max 2 levels of nesting |
| Using `count` for named resources | Index changes cause recreation | Use `for_each` with stable keys |
| No validation on variables | Runtime errors deep in apply | Add `validation` blocks to variables |
| Outputting sensitive values without marking | Exposed in logs | Use `sensitive = true` on outputs |

---

## Production Checklist

- [ ] Module has clear `variables.tf`, `outputs.tf`, `versions.tf`
- [ ] All variables have descriptions and appropriate types
- [ ] Validation blocks on variables that accept constrained values
- [ ] Sensitive variables and outputs marked as `sensitive = true`
- [ ] Module pinned to specific provider version ranges
- [ ] README.md with usage examples and input/output tables
- [ ] Terratest or `terraform test` covering the primary use case
- [ ] Semantic versioning applied with changelog
- [ ] No hardcoded regions, account IDs, or environment-specific values
- [ ] `for_each` used instead of `count` for named resources
- [ ] Examples directory with at least one working configuration
- [ ] Module published to private registry or versioned via git tags
