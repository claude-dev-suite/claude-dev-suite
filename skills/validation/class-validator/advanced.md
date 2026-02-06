# Class-validator Advanced Patterns

## Custom Validators

### Synchronous Validator

```typescript
import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

// Custom constraint
@ValidatorConstraint({ async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  validate(password: string, args: ValidationArguments) {
    const hasUppercase = /[A-Z]/.test(password);
    const hasLowercase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*]/.test(password);
    const minLength = password.length >= 8;

    return hasUppercase && hasLowercase && hasNumber && hasSpecial && minLength;
  }

  defaultMessage(args: ValidationArguments) {
    return 'Password must contain uppercase, lowercase, number, and special character';
  }
}

// Decorator factory
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

### Async Validator (Database Check)

```typescript
@ValidatorConstraint({ async: true })
export class IsEmailUniqueConstraint implements ValidatorConstraintInterface {
  constructor(private userService: UserService) {}

  async validate(email: string) {
    const user = await this.userService.findByEmail(email);
    return !user;
  }

  defaultMessage() {
    return 'Email already exists';
  }
}
```

---

## Cross-field Validation

### Conditional Validation

```typescript
import { ValidateIf } from 'class-validator';

class PaymentDto {
  @IsIn(['credit_card', 'bank_transfer', 'paypal'])
  method: string;

  @ValidateIf((o) => o.method === 'credit_card')
  @IsCreditCard()
  cardNumber?: string;

  @ValidateIf((o) => o.method === 'bank_transfer')
  @IsString()
  @IsNotEmpty()
  iban?: string;

  @ValidateIf((o) => o.method === 'paypal')
  @IsEmail()
  paypalEmail?: string;
}
```

### Password Confirmation

```typescript
import { IsString, MinLength, Validate } from 'class-validator';

@ValidatorConstraint({ name: 'MatchPasswords', async: false })
export class MatchPasswordsConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments) {
    const object = args.object as any;
    return object.password === confirmPassword;
  }

  defaultMessage() {
    return 'Passwords do not match';
  }
}

class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @Validate(MatchPasswordsConstraint)
  confirmPassword: string;
}
```

---

## Validation Groups

```typescript
class CreateUserDto {
  @IsNotEmpty({ groups: ['create'] })
  @IsOptional({ groups: ['update'] })
  @IsString()
  name: string;

  @IsEmail({}, { groups: ['create', 'update'] })
  email: string;

  @IsString({ groups: ['create'] })
  @MinLength(8, { groups: ['create'] })
  password: string;
}

// Validate with specific group
const errors = await validate(user, { groups: ['update'] });

// NestJS with groups
@UsePipes(new ValidationPipe({ groups: ['create'] }))
@Post()
create(@Body() dto: CreateUserDto) {}
```

---

## Error Formatting

```typescript
import { validate, ValidationError } from 'class-validator';

interface FormattedError {
  field: string;
  constraints: string[];
}

function formatErrors(errors: ValidationError[]): FormattedError[] {
  return errors.flatMap((error) => {
    if (error.constraints) {
      return [{
        field: error.property,
        constraints: Object.values(error.constraints),
      }];
    }
    // Handle nested validation errors
    if (error.children?.length) {
      return formatErrors(error.children).map((child) => ({
        ...child,
        field: `${error.property}.${child.field}`,
      }));
    }
    return [];
  });
}
```

---

## Class-transformer Integration

```typescript
import { Transform, Expose, Exclude, Type } from 'class-transformer';

class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @Exclude()
  password: string;

  @Expose()
  @Type(() => Date)
  @Transform(({ value }) => value.toISOString())
  createdAt: Date;
}

// Transform plain object to class instance
const userDto = plainToInstance(UserResponseDto, user, {
  excludeExtraneousValues: true,
});

// Transform class to plain object (for response)
const plainUser = instanceToPlain(userDto);
```

---

## NestJS Partial DTOs

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

---

## Nested Object Validation

```typescript
import {
  IsObject,
  IsNotEmptyObject,
  ValidateNested,
} from 'class-validator';
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

---

## Array Validation

```typescript
import {
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  ArrayNotEmpty,
  ValidateNested,
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
  @ArrayUnique()
  @IsInt({ each: true })
  uniqueNumbers: number[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemDto)
  items: ItemDto[];
}
```

---

## Comparison: class-validator vs Zod

| Feature | class-validator | Zod |
|---------|-----------------|-----|
| Style | Decorators | Functional |
| Framework | NestJS standard | Framework agnostic |
| Transform | class-transformer | Built-in |
| Bundle size | Larger | Smaller |
| Type inference | Manual | Automatic |
