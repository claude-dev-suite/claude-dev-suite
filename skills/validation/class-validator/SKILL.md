---
name: class-validator
description: |
  Class-validator decorator-based validation for TypeScript. Standard in NestJS.
  Use when building APIs with NestJS or needing class-based validation.

  USE WHEN: user mentions "class-validator", "NestJS validation", "DTO validation", "decorator validation", asks about "NestJS DTOs", "ValidationPipe"

  DO NOT USE FOR: Zod/Yup projects (use zod/yup skills), non-decorator patterns, client-side forms (prefer Zod), non-NestJS backends
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Class-validator - Quick Reference

> **Full Reference**: See [advanced.md](advanced.md) for custom validators, cross-field validation, validation groups, error formatting, and class-transformer integration.

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `class-validator` for comprehensive documentation.

## Setup

```bash
npm install class-validator class-transformer
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

## Basic Usage

```typescript
import {
  validate,
  IsString,
  IsEmail,
  IsInt,
  Min,
  Max,
  Length,
  IsOptional,
} from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CreateUserDto {
  @IsString()
  @Length(2, 50)
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(18)
  @Max(120)
  age: number;

  @IsOptional()
  @IsString()
  bio?: string;
}

// Validate
async function validateUser(data: unknown) {
  const user = plainToInstance(CreateUserDto, data);
  const errors = await validate(user);

  if (errors.length > 0) {
    throw new Error(errors.map((e) => Object.values(e.constraints || {})).flat().join(', '));
  }

  return user;
}
```

## Common Decorators

### String Validators

```typescript
import {
  IsString, IsNotEmpty, Length, MinLength, MaxLength,
  Matches, IsUUID, IsEmail, IsUrl, IsIP,
} from 'class-validator';

class StringValidationDto {
  @IsString()
  @IsNotEmpty()
  required: string;

  @Length(5, 20)
  username: string;

  @MinLength(8)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/, {
    message: 'Password must contain letters and numbers',
  })
  password: string;

  @IsEmail()
  email: string;

  @IsUrl({ require_protocol: true })
  website: string;

  @IsUUID('4')
  id: string;
}
```

### Number Validators

```typescript
import { IsNumber, IsInt, IsPositive, Min, Max, IsDivisibleBy } from 'class-validator';

class NumberValidationDto {
  @IsNumber()
  decimal: number;

  @IsInt()
  integer: number;

  @IsPositive()
  positive: number;

  @Min(0)
  @Max(100)
  percentage: number;
}
```

### Date Validators

```typescript
import { IsDate, MinDate, MaxDate, IsISO8601 } from 'class-validator';
import { Type } from 'class-transformer';

class DateValidationDto {
  @IsDate()
  @Type(() => Date)
  date: Date;

  @MinDate(new Date('2020-01-01'))
  @Type(() => Date)
  afterDate: Date;

  @IsISO8601()
  isoString: string;
}
```

### Array Validators

```typescript
import {
  IsArray, ArrayMinSize, ArrayMaxSize, ArrayUnique,
  ArrayNotEmpty, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ItemDto {
  @IsString()
  name: string;
}

class ArrayValidationDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })  // Validate each item
  tags: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
```

### Nested Object Validation

```typescript
import { IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AddressDto {
  @IsString()
  street: string;

  @IsString()
  city: string;
}

class UserWithAddressDto {
  @IsString()
  name: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto;
}
```

### Other Validators

```typescript
import {
  IsBoolean, IsEnum, IsIn, IsOptional,
  IsCreditCard, IsPhoneNumber,
} from 'class-validator';

enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

class MixedValidationDto {
  @IsBoolean()
  active: boolean;

  @IsEnum(UserRole)
  role: UserRole;

  @IsIn(['draft', 'published', 'archived'])
  status: string;

  @IsOptional()
  @IsCreditCard()
  creditCard?: string;
}
```

## NestJS Integration

```typescript
// main.ts
import { ValidationPipe } from '@nestjs/common';

app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,           // Strip non-decorated properties
    forbidNonWhitelisted: true, // Throw on unknown properties
    transform: true,            // Auto-transform payloads to DTO instances
    transformOptions: {
      enableImplicitConversion: true,
    },
  })
);
```

```typescript
// users.controller.ts
@Controller('users')
export class UsersController {
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    // createUserDto is already validated and transformed
    return this.usersService.create(createUserDto);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    // Query params also validated
    return this.usersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findOne(id);
  }
}
```

### Partial DTOs (for updates)

```typescript
import { PartialType, OmitType, PickType, IntersectionType } from '@nestjs/mapped-types';

// All fields optional
export class UpdateUserDto extends PartialType(CreateUserDto) {}

// Omit specific fields
export class CreateUserWithoutPasswordDto extends OmitType(CreateUserDto, ['password']) {}

// Pick specific fields
export class LoginDto extends PickType(CreateUserDto, ['email', 'password']) {}

// Combine DTOs
export class ExtendedUserDto extends IntersectionType(CreateUserDto, AdditionalFieldsDto) {}
```

## Custom Validator (Basic)

```typescript
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const minLength = password.length >= 8;

    return hasUppercase && hasLowercase && hasNumber && minLength;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Password must contain uppercase, lowercase, and number';
  }
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsStrongPasswordConstraint,
    });
  };
}

// Usage
class RegisterDto {
  @IsStrongPassword()
  password: string;
}
```

## When NOT to Use This Skill

- **Client-side validation** - Use Zod with React Hook Form
- **Non-NestJS backends** - Zod is more framework-agnostic
- **Functional programming patterns** - Decorators require classes
- **Simple validation** - Zod has simpler API

## Comparison: class-validator vs Zod

| Feature | class-validator | Zod |
|---------|-----------------|-----|
| Style | Decorators | Functional |
| Framework | NestJS standard | Framework agnostic |
| Transform | class-transformer | Built-in |
| Bundle size | Larger | Smaller |
| Type inference | Manual | Automatic |

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Missing @Type() decorator | Nested validation fails | Use @Type() for nested objects |
| No whitelist in ValidationPipe | Accepts unknown properties | Set whitelist: true |
| Using any in DTOs | Bypasses validation | Use proper types |
| Manual validation in controller | Code duplication | Use ValidationPipe globally |
| Missing experimentalDecorators | Decorators don't work | Enable in tsconfig.json |
| Not using class-transformer | Plain objects not validated | Use plainToInstance() |

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Decorators not working | tsconfig misconfigured | Enable experimentalDecorators: true |
| Nested validation fails | Missing @Type() | Add @Type(() => NestedClass) |
| Validation not running | ValidationPipe not set | Add ValidationPipe globally in main.ts |
| Unknown properties accepted | No whitelist | Set whitelist: true in ValidationPipe |
| Transform not working | Missing transform option | Set transform: true in ValidationPipe |
| Async validators fail | Wrong setup | Use async: true in @ValidatorConstraint |

## Checklist

- [ ] tsconfig with decorators enabled
- [ ] class-transformer for nested/transform
- [ ] Global ValidationPipe in NestJS
- [ ] whitelist and forbidNonWhitelisted
- [ ] Custom validators for specific logic
- [ ] Error formatting for API responses

## Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `class-validator`
> - [class-validator GitHub](https://github.com/typestack/class-validator)
