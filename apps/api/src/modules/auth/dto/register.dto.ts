import {
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
  IsDateString,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '홍길동' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '1995-03-15' })
  @IsDateString()
  birthDate: string;

  @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender: string;

  @ApiProperty({ example: '11', description: '시도 코드' })
  @IsString()
  sidoCode: string;

  @ApiProperty({ example: '11010', description: '시군구 코드' })
  @IsString()
  sigunguCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dongName?: string;

  @ApiProperty({ enum: ['SINGLE', 'COUPLE', 'FAMILY', 'SINGLE_PARENT'] })
  @IsEnum(['SINGLE', 'COUPLE', 'FAMILY', 'SINGLE_PARENT'])
  householdType: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsNumber()
  @Min(1)
  householdCount: number;

  @ApiProperty({ enum: ['EMPLOYEE', 'FREELANCER', 'SELF_EMPLOYED', 'UNEMPLOYED', 'STUDENT'] })
  @IsEnum(['EMPLOYEE', 'FREELANCER', 'SELF_EMPLOYED', 'UNEMPLOYED', 'STUDENT'])
  occupationType: string;

  @ApiProperty({ example: 80, description: '중위소득 % (40|50|60|70|80|100|120|150|200)' })
  @IsNumber()
  incomeBracket: number;

  @ApiPropertyOptional({ example: 30000000 })
  @IsOptional()
  @IsNumber()
  annualIncome?: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  isHomeowner: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDisabled?: boolean;

  @ApiPropertyOptional({ minimum: 1, maximum: 6 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  disabilityGrade?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isVeteran?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isSingleParent?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasChildren?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  childrenCount?: number;
}
