# Terraform State Management

## Overview

Terraform state is the source of truth that maps your configuration to real-world infrastructure. The state file (`terraform.tfstate`) tracks resource metadata, dependency information, and attribute values. Proper state management is critical for team collaboration, security, and disaster recovery.

---

## State File Purpose

The state file serves four key functions:

1. **Resource mapping** -- Links HCL resource addresses (`aws_instance.web`) to cloud resource IDs (`i-0abc123def456`)
2. **Dependency tracking** -- Records implicit and explicit dependencies for correct ordering
3. **Performance** -- Caches attribute values to avoid querying every resource on every plan
4. **Collaboration** -- When stored remotely with locking, enables team-wide infrastructure management

### Local vs Remote State

```
Local state (default):
  terraform.tfstate     <- Single file on disk
  terraform.tfstate.backup

Remote state (recommended for teams):
  S3 bucket / Azure Blob / GCS / Terraform Cloud
  + State locking (DynamoDB / built-in)
  + Encryption at rest
  + Versioning for rollback
```

---

## Remote Backends

### AWS S3 + DynamoDB

```hcl
# backend.tf
terraform {
  backend "s3" {
    bucket         = "my-org-terraform-state"
    key            = "environments/production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"
    # Use a specific KMS key for encryption
    kms_key_id     = "arn:aws:kms:us-east-1:123456789012:key/abcd-1234"
  }
}
```

**Bootstrap the backend infrastructure:**

```hcl
# bootstrap/main.tf -- Apply this FIRST with local state, then migrate

resource "aws_s3_bucket" "state" {
  bucket = "my-org-terraform-state"
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.state.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "state_lock" {
  name         = "terraform-state-lock"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Purpose = "Terraform state locking"
  }
}

resource "aws_kms_key" "state" {
  description             = "KMS key for Terraform state encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}
```

### Azure Blob Storage

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "myorgterraformstate"
    container_name       = "tfstate"
    key                  = "production.terraform.tfstate"
    use_azuread_auth     = true  # Recommended over access keys
  }
}
```

### Google Cloud Storage

```hcl
terraform {
  backend "gcs" {
    bucket = "my-org-terraform-state"
    prefix = "environments/production"
  }
}
```

### Terraform Cloud / HCP Terraform

```hcl
terraform {
  cloud {
    organization = "my-org"

    workspaces {
      name = "production"
    }
  }
}
```

---

## State Locking

State locking prevents concurrent operations that could corrupt state.

### How It Works (S3 + DynamoDB)

```
1. terraform plan/apply starts
2. Terraform writes a lock entry to DynamoDB:
   LockID: "my-org-terraform-state/environments/production/terraform.tfstate"
   Info: { "ID": "uuid", "Who": "user@host", "Operation": "OperationTypeApply" }
3. If lock exists -> operation blocked with "state locked" error
4. After operation completes -> lock entry removed
```

### Force Unlocking (Emergency Only)

```bash
# Only use when you are certain no other operation is running
terraform force-unlock LOCK_ID

# The LOCK_ID is shown in the lock error message:
# Error: Error locking state: Error acquiring the state lock
# Lock Info:
#   ID:        a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Lock Timeout

```bash
# Wait up to 5 minutes for lock release before failing
terraform plan -lock-timeout=5m
```

---

## State File Security

State files contain sensitive information including resource attributes, outputs, and sometimes secrets.

### Encryption

```hcl
# S3: Server-side encryption with KMS
backend "s3" {
  encrypt    = true
  kms_key_id = "arn:aws:kms:us-east-1:123456789012:key/..."
}
```

### Access Control

```hcl
# IAM policy: restrict state access to CI/CD and admins
resource "aws_iam_policy" "terraform_state" {
  name = "terraform-state-access"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
        ]
        Resource = "arn:aws:s3:::my-org-terraform-state/environments/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
        ]
        Resource = "arn:aws:s3:::my-org-terraform-state"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Resource = "arn:aws:dynamodb:us-east-1:123456789012:table/terraform-state-lock"
      },
    ]
  })
}
```

### Sensitive Values in State

```hcl
# Mark outputs as sensitive to prevent display
output "database_password" {
  value     = aws_db_instance.main.password
  sensitive = true
}

# Terraform still stores the value in state -- encryption is essential
```

---

## State Commands

### terraform state list

```bash
# List all resources in state
terraform state list

# Filter by resource type
terraform state list aws_instance
# aws_instance.web
# aws_instance.api

# Filter by module
terraform state list module.vpc
# module.vpc.aws_vpc.this
# module.vpc.aws_subnet.public[0]
```

### terraform state show

```bash
# Show attributes of a specific resource
terraform state show aws_instance.web
# resource "aws_instance" "web" {
#     ami           = "ami-0abcdef1234567890"
#     instance_type = "t3.medium"
#     ...
# }
```

### terraform state mv

```bash
# Rename a resource (refactoring without destroy/recreate)
terraform state mv aws_instance.web aws_instance.application

# Move into a module
terraform state mv aws_instance.web module.compute.aws_instance.this

# Move between modules
terraform state mv module.old.aws_instance.this module.new.aws_instance.this
```

### terraform state rm

```bash
# Remove a resource from state WITHOUT destroying it
# Use case: resource is now managed elsewhere or manually
terraform state rm aws_instance.legacy

# Remove an entire module
terraform state rm module.deprecated
```

### terraform import

```bash
# Import existing infrastructure into state
terraform import aws_instance.web i-0abc123def456

# Import into a module
terraform import module.vpc.aws_vpc.this vpc-0abc123

# Import with for_each key
terraform import 'aws_instance.servers["web"]' i-0abc123
```

### terraform state pull / push

```bash
# Download state to local file (for inspection or backup)
terraform state pull > state-backup.json

# Upload state (DANGEROUS - use only for recovery)
terraform state push state-backup.json
```

---

## State Migration Between Backends

### Local to S3

```bash
# 1. Add backend configuration to your .tf files
# backend.tf -> add the S3 backend block

# 2. Run init -- Terraform detects the backend change
terraform init

# Terraform will prompt:
# Do you want to migrate all workspaces to "s3"?
# Enter a value: yes

# 3. Verify state is accessible
terraform state list

# 4. Remove local state file (it is now in S3)
rm terraform.tfstate terraform.tfstate.backup
```

### S3 to Terraform Cloud

```bash
# 1. Replace backend block with cloud block
# Remove: backend "s3" { ... }
# Add: cloud { organization = "..." workspaces { name = "..." } }

# 2. Login to Terraform Cloud
terraform login

# 3. Run init to migrate
terraform init

# Terraform will prompt to migrate state to Terraform Cloud
```

### Between S3 Buckets

```bash
# 1. Pull current state
terraform state pull > state-backup.json

# 2. Update backend configuration to new bucket
# Edit backend.tf

# 3. Re-initialize with migration
terraform init -migrate-state

# 4. Verify
terraform state list
terraform plan  # Should show no changes
```

---

## State File Organization

### Per-Environment State

```
s3://terraform-state/
  environments/
    dev/terraform.tfstate
    staging/terraform.tfstate
    production/terraform.tfstate
  shared/
    dns/terraform.tfstate
    iam/terraform.tfstate
```

### Per-Component State (Blast Radius Reduction)

```
s3://terraform-state/
  production/
    networking/terraform.tfstate      # VPC, subnets, routes
    compute/terraform.tfstate         # EC2, ASG, ECS
    database/terraform.tfstate        # RDS, ElastiCache
    monitoring/terraform.tfstate      # CloudWatch, alerts
```

### Cross-State References

```hcl
# networking/outputs.tf
output "vpc_id" {
  value = aws_vpc.main.id
}

# compute/main.tf
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "terraform-state"
    key    = "production/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.networking.outputs.private_subnet_ids[0]
}
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Correct Approach |
|-------------|---------|------------------|
| Local state for team projects | No locking, no collaboration | Use remote backend from day one |
| State file in git | Secrets exposed, merge conflicts | Remote backend with encryption |
| Single state file for everything | Blast radius is entire infrastructure | Split by environment and component |
| No state versioning | Cannot recover from corruption | Enable S3 versioning or use Terraform Cloud |
| Sharing state bucket access keys | Overly broad access | Use IAM roles with least privilege |
| Manual `terraform state push` | Risk of overwriting concurrent changes | Use `terraform state mv` or `import` instead |
| No DynamoDB lock table | Concurrent applies corrupt state | Always configure state locking |
| Hardcoded backend config | Cannot reuse across environments | Use `-backend-config` partial configuration |

---

## Production Checklist

- [ ] Remote backend configured with encryption at rest
- [ ] State locking enabled (DynamoDB for S3, built-in for Cloud/Azure)
- [ ] S3 bucket versioning enabled for state recovery
- [ ] Public access blocked on state storage
- [ ] IAM policies restrict state access to CI/CD and admins
- [ ] State organized per environment and per component
- [ ] Cross-state references use `terraform_remote_state` data source
- [ ] Sensitive outputs marked as `sensitive = true`
- [ ] Backend bootstrapped before main infrastructure
- [ ] State backup procedure documented and tested
- [ ] Force-unlock procedure documented for emergencies
- [ ] No secrets stored as plain-text variables (use Vault or SSM)
