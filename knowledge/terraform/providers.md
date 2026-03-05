# Terraform Providers

## Overview

Terraform providers are plugins that interact with APIs of cloud platforms, SaaS tools, and other services. Each provider exposes resources (managed infrastructure) and data sources (read-only queries). Provider configuration includes authentication, region selection, and version constraints. Understanding provider management is essential for multi-cloud, multi-region, and multi-account Terraform deployments.

---

## Provider Configuration

### Basic Configuration

```hcl
# providers.tf

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.10"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy   = "terraform"
      Environment = var.environment
      Project     = var.project_name
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
```

---

## Provider Versioning and Constraints

### Version Constraint Syntax

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"

      # Exact version
      # version = "5.30.0"

      # Pessimistic constraint (most common) -- allows patch updates
      # version = "~> 5.30"     # >= 5.30.0, < 5.31.0
      # version = "~> 5.30.0"   # >= 5.30.0, < 5.31.0

      # Range constraints
      # version = ">= 5.0, < 6.0"

      # Multiple constraints
      version = ">= 5.30, < 6.0, != 5.31.0"
    }
  }
}
```

### Lock File

```bash
# .terraform.lock.hcl is auto-generated and should be committed to git
# It pins exact versions and hashes for reproducibility

# Regenerate lock file for multiple platforms
terraform providers lock \
  -platform=linux_amd64 \
  -platform=darwin_amd64 \
  -platform=darwin_arm64 \
  -platform=windows_amd64
```

### Upgrading Providers

```bash
# Upgrade within constraints
terraform init -upgrade

# Check for available updates
terraform providers

# Show current lock file versions
cat .terraform.lock.hcl | grep -A2 "provider"
```

---

## Provider Aliases (Multi-Region, Multi-Account)

### Multi-Region Deployment

```hcl
# Default provider for primary region
provider "aws" {
  region = "us-east-1"
  alias  = "us_east"
}

# Secondary region
provider "aws" {
  region = "eu-west-1"
  alias  = "eu_west"
}

# Disaster recovery region
provider "aws" {
  region = "ap-southeast-1"
  alias  = "ap_southeast"
}

# Resources specify which provider to use
resource "aws_s3_bucket" "primary" {
  provider = aws.us_east
  bucket   = "my-app-primary"
}

resource "aws_s3_bucket" "replica" {
  provider = aws.eu_west
  bucket   = "my-app-replica"
}

# Modules can accept provider configuration
module "cdn" {
  source = "./modules/cdn"

  providers = {
    aws           = aws.us_east
    aws.us_east_1 = aws.us_east  # ACM certs must be in us-east-1
  }
}
```

### Multi-Account Deployment

```hcl
# Management account
provider "aws" {
  region = "us-east-1"
  alias  = "management"
}

# Production account via assumed role
provider "aws" {
  region = "us-east-1"
  alias  = "production"

  assume_role {
    role_arn     = "arn:aws:iam::${var.production_account_id}:role/TerraformExecutionRole"
    session_name = "terraform-production"
    external_id  = var.external_id
  }
}

# Development account via assumed role
provider "aws" {
  region = "us-east-1"
  alias  = "development"

  assume_role {
    role_arn     = "arn:aws:iam::${var.development_account_id}:role/TerraformExecutionRole"
    session_name = "terraform-development"
  }
}

# Deploy to production
resource "aws_vpc" "production" {
  provider   = aws.production
  cidr_block = "10.0.0.0/16"
}

# Deploy to development
resource "aws_vpc" "development" {
  provider   = aws.development
  cidr_block = "10.1.0.0/16"
}
```

### Passing Providers to Modules

```hcl
# Module definition accepting multiple providers
# modules/multi-region-app/main.tf

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.primary, aws.secondary]
    }
  }
}

resource "aws_instance" "primary" {
  provider      = aws.primary
  ami           = var.ami_primary
  instance_type = var.instance_type
}

resource "aws_instance" "secondary" {
  provider      = aws.secondary
  ami           = var.ami_secondary
  instance_type = var.instance_type
}

# Calling the module
module "app" {
  source = "./modules/multi-region-app"

  providers = {
    aws.primary   = aws.us_east
    aws.secondary = aws.eu_west
  }

  instance_type = "t3.medium"
  ami_primary   = "ami-0abcdef1"
  ami_secondary = "ami-0abcdef2"
}
```

---

## Provider Authentication

### Static Credentials (Not Recommended for Production)

```hcl
# Avoid this in production -- credentials in code or state
provider "aws" {
  region     = "us-east-1"
  access_key = var.aws_access_key    # From variable
  secret_key = var.aws_secret_key    # From variable
}
```

### Environment Variables (CI/CD)

```bash
# AWS
export AWS_ACCESS_KEY_ID="AKIA..."
export AWS_SECRET_ACCESS_KEY="..."
export AWS_REGION="us-east-1"

# Azure
export ARM_CLIENT_ID="..."
export ARM_CLIENT_SECRET="..."
export ARM_SUBSCRIPTION_ID="..."
export ARM_TENANT_ID="..."

# GCP
export GOOGLE_CREDENTIALS="$(cat service-account.json)"
export GOOGLE_PROJECT="my-project"
export GOOGLE_REGION="us-central1"
```

### Assumed Role (AWS Best Practice)

```hcl
provider "aws" {
  region = "us-east-1"

  assume_role {
    role_arn     = "arn:aws:iam::123456789012:role/TerraformRole"
    session_name = "terraform-${var.environment}"
    # Optional: restrict with policy
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [
        {
          Effect   = "Allow"
          Action   = ["ec2:*", "s3:*", "rds:*"]
          Resource = "*"
        }
      ]
    })
  }
}
```

### AWS SSO / Identity Center

```hcl
provider "aws" {
  region  = "us-east-1"
  profile = "my-sso-profile"  # From ~/.aws/config
}
```

```ini
# ~/.aws/config
[profile my-sso-profile]
sso_start_url = https://my-org.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = TerraformAdmin
region = us-east-1
```

### OIDC Federation (GitHub Actions)

```yaml
# .github/workflows/terraform.yml
jobs:
  terraform:
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubTerraformRole
          aws-region: us-east-1

      - run: terraform apply -auto-approve
```

```hcl
# No credentials in provider block -- uses OIDC token from environment
provider "aws" {
  region = "us-east-1"
}
```

### HashiCorp Vault Dynamic Credentials

```hcl
provider "vault" {
  address = "https://vault.example.com"
}

data "vault_aws_access_credentials" "creds" {
  backend = "aws"
  role    = "terraform-role"
  type    = "sts"
}

provider "aws" {
  region     = "us-east-1"
  access_key = data.vault_aws_access_credentials.creds.access_key
  secret_key = data.vault_aws_access_credentials.creds.secret_key
  token      = data.vault_aws_access_credentials.creds.security_token
}
```

---

## Custom Providers

### When to Build a Custom Provider

- Internal API that has no public Terraform provider
- Proprietary SaaS with a REST/gRPC API
- Legacy systems that need infrastructure-as-code management

### Provider Development Framework

```go
// internal/provider/provider.go
package provider

import (
    "context"
    "github.com/hashicorp/terraform-plugin-framework/datasource"
    "github.com/hashicorp/terraform-plugin-framework/provider"
    "github.com/hashicorp/terraform-plugin-framework/provider/schema"
    "github.com/hashicorp/terraform-plugin-framework/resource"
)

type MyProvider struct {
    version string
}

func (p *MyProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
    resp.TypeName = "myservice"
    resp.Version = p.version
}

func (p *MyProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
    resp.Schema = schema.Schema{
        Attributes: map[string]schema.Attribute{
            "api_url": schema.StringAttribute{
                Required:    true,
                Description: "The URL of the API.",
            },
            "api_token": schema.StringAttribute{
                Required:    true,
                Sensitive:   true,
                Description: "API authentication token.",
            },
        },
    }
}

func (p *MyProvider) Resources(_ context.Context) []func() resource.Resource {
    return []func() resource.Resource{
        NewApplicationResource,
        NewDatabaseResource,
    }
}

func (p *MyProvider) DataSources(_ context.Context) []func() datasource.DataSource {
    return []func() datasource.DataSource{
        NewApplicationDataSource,
    }
}
```

### Using a Custom Provider

```hcl
terraform {
  required_providers {
    myservice = {
      source  = "my-org/myservice"
      version = "~> 1.0"
    }
  }
}

provider "myservice" {
  api_url   = "https://api.myservice.internal"
  api_token = var.myservice_token
}

resource "myservice_application" "web" {
  name        = "web-app"
  environment = "production"
  replicas    = 3
}
```

---

## Provider Configuration Patterns

### Proxy/Mirror Configuration

```hcl
# ~/.terraformrc or terraform.rc
provider_installation {
  network_mirror {
    url = "https://terraform-mirror.internal.example.com/"
  }

  # Fallback to direct registry
  direct {
    exclude = []
  }
}
```

### Provider Feature Flags

```hcl
provider "aws" {
  region = "us-east-1"

  # Skip metadata API check (useful for testing)
  skip_metadata_api_check = true

  # Custom endpoints (for LocalStack or other mocking)
  endpoints {
    s3       = "http://localhost:4566"
    dynamodb = "http://localhost:4566"
    sqs      = "http://localhost:4566"
    lambda   = "http://localhost:4566"
  }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
    key_vault {
      purge_soft_delete_on_destroy = false
    }
    virtual_machine {
      delete_os_disk_on_deletion = true
    }
  }
}
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Hardcoded credentials in provider | Credentials in state and code | Use env vars, assumed roles, or OIDC |
| No version constraints | Provider updates can break infra | Pin with `~>` or range constraints |
| Missing `.terraform.lock.hcl` in git | Non-reproducible builds | Commit lock file, run `providers lock` for all platforms |
| Default provider for multi-region | All resources in one region | Use aliases for each region |
| Overly broad IAM for Terraform | Blast radius of compromise | Least-privilege IAM with specific actions |
| One provider block per file | Scattered configuration | Consolidate providers in `providers.tf` |
| No `default_tags` (AWS) | Inconsistent tagging | Use provider-level default tags |

---

## Production Checklist

- [ ] Provider versions pinned with pessimistic constraints (`~>`)
- [ ] `.terraform.lock.hcl` committed to version control
- [ ] Lock file covers all platforms used (linux, darwin, windows)
- [ ] No static credentials in provider configuration
- [ ] OIDC or assumed roles used for CI/CD authentication
- [ ] Multi-region deployments use provider aliases
- [ ] Multi-account deployments use assume_role
- [ ] Provider `default_tags` set for consistent resource tagging
- [ ] Custom provider endpoints configured for local testing
- [ ] Provider upgrade procedure documented (init -upgrade, test, commit lock file)
- [ ] Terraform and provider versions specified in `required_version` / `required_providers`
