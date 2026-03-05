---
name: terraform
description: |
  Terraform infrastructure as code. HCL syntax, providers (AWS, Azure, GCP),
  modules, state management, workspaces, and production patterns.

  USE WHEN: user mentions "Terraform", "HCL", "infrastructure as code", "IaC",
  "terraform plan", "terraform apply", "tfstate", "OpenTofu"

  DO NOT USE FOR: Kubernetes manifests - use `kubernetes`;
  Docker - use `docker`; Pulumi - different IaC tool
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Terraform

## Project Structure

```
infrastructure/
├── modules/
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── outputs.tf
│   └── ecs-service/
├── environments/
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   └── terraform.tfvars
│   └── prod/
├── backend.tf
└── versions.tf
```

## Provider and Backend

```hcl
# versions.tf
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Environment = var.environment, ManagedBy = "terraform" } }
}
```

## Resource Definition

```hcl
# VPC module
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true

  tags = { Name = "${var.project}-vpc" }
}

resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone = var.availability_zones[count.index]

  tags = { Name = "${var.project}-private-${count.index}" }
}

output "vpc_id" { value = aws_vpc.main.id }
output "private_subnet_ids" { value = aws_subnet.private[*].id }
```

## Module Usage

```hcl
module "vpc" {
  source = "../../modules/vpc"

  project            = "my-app"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
}

module "api" {
  source = "../../modules/ecs-service"

  cluster_id  = aws_ecs_cluster.main.id
  subnet_ids  = module.vpc.private_subnet_ids
  image       = "${var.ecr_repo}:${var.image_tag}"
  environment = var.environment
}
```

## Variables and Outputs

```hcl
# variables.tf
variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

# terraform.tfvars
environment   = "prod"
instance_type = "t3.medium"
```

## Key Commands

```bash
terraform init          # Initialize providers and backend
terraform plan          # Preview changes
terraform apply         # Apply changes
terraform destroy       # Destroy all resources
terraform fmt           # Format HCL files
terraform validate      # Validate configuration
terraform state list    # List resources in state
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Local state file | Use remote backend (S3 + DynamoDB) |
| No state locking | Enable DynamoDB locking table |
| Hardcoded values | Use variables with tfvars per environment |
| Monolithic config | Split into modules |
| `terraform apply` without plan | Always review plan first, use `-out=plan.tfplan` |
| No version constraints | Pin provider and Terraform versions |

## Production Checklist

- [ ] Remote state backend with encryption and locking
- [ ] Provider and Terraform version pinned
- [ ] Modules for reusable infrastructure
- [ ] Separate tfvars per environment
- [ ] CI/CD pipeline: plan on PR, apply on merge
- [ ] State imports for existing resources
- [ ] `prevent_destroy` on critical resources
